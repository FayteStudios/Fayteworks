import { net } from "electron";

const SHOPIFY_VERSION = "2024-10";

function shopifyBase(domain) {
  const host = String(domain || "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(host)) throw new Error("Use your store's myshopify.com address (e.g. my-store.myshopify.com).");
  return `https://${host}/admin/api/${SHOPIFY_VERSION}`;
}

async function call(url, options = {}) {
  let response;
  try {
    response = await net.fetch(url, options);
  } catch (error) {
    throw new Error(`Couldn't reach ${new URL(url).host}: ${error.message}`);
  }
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const message = body?.errors ? JSON.stringify(body.errors) : body?.message || `${response.status} ${response.statusText}`;
    if (response.status === 401 || response.status === 403) throw new Error(`Not allowed (${message}). Check the token and its permissions.`);
    throw new Error(message);
  }
  return body;
}

export function createPlatforms({ getToken }) {
  const netlify = async (path, options = {}) => {
    const token = await getToken("netlify");
    if (!token) throw new Error("Connect Netlify first (Export & publish).");
    const base = "https://api.netlify.com/api/v1";
    return call(`${base}${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  };
  const shopify = async (domain, path, options = {}) => {
    const token = await getToken("shopify");
    if (!token) throw new Error("Add your Shopify Admin API token first.");
    return call(`${shopifyBase(domain)}${path}`, { ...options, headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json", ...(options.headers || {}) } });
  };
  const wordpress = async (site, user, path, options = {}) => {
    const password = await getToken("wordpress");
    if (!password) throw new Error("Add a WordPress Application Password first.");
    const base = String(site || "").trim().replace(/\/+$/, "");
    if (!/^https?:\/\//.test(base)) throw new Error("Use your site's full address, e.g. https://example.com.");
    const auth = Buffer.from(`${user}:${password.replace(/\s+/g, "")}`).toString("base64");
    return call(`${base}/wp-json/wp/v2${path}`, { ...options, headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json", ...(options.headers || {}) } });
  };

  return {
    async shopifyThemes(domain) {
      const { themes } = await shopify(domain, "/themes.json");
      return themes.map((t) => ({ id: t.id, name: t.name, role: t.role }));
    },
    async shopifySections(domain, themeId) {
      const { assets } = await shopify(domain, `/themes/${Number(themeId)}/assets.json`);
      return assets.filter((a) => /^sections\/.+\.liquid$/.test(a.key)).map((a) => a.key);
    },
    async shopifyGet(domain, themeId, key) {
      if (!/^sections\/[\w.-]+\.liquid$/.test(key)) throw new Error("Only theme sections can be read.");
      const { asset } = await shopify(domain, `/themes/${Number(themeId)}/assets.json?asset[key]=${encodeURIComponent(key)}`);
      return asset.value;
    },
    async shopifyPut(domain, themeId, key, value) {
      if (!/^sections\/[\w.-]+\.liquid$/.test(key)) throw new Error("Only theme sections can be written.");
      await shopify(domain, `/themes/${Number(themeId)}/assets.json`, { method: "PUT", body: JSON.stringify({ asset: { key, value } }) });
      return key;
    },
    async wordpressPages(site, user) {
      const pages = await wordpress(site, user, "/pages?per_page=100&status=publish,draft,private&_fields=id,title,link,status");
      return pages.map((p) => ({ id: p.id, title: p.title?.rendered || `Page ${p.id}`, link: p.link, status: p.status }));
    },
    async netlifySubmissions(siteId) {
      if (!/^[\w-]{6,64}$/.test(String(siteId))) throw new Error("Publish to Netlify first; the inbox reads that site's forms.");
      const [forms, submissions] = await Promise.all([netlify(`/sites/${siteId}/forms`), netlify(`/sites/${siteId}/submissions?per_page=100`)]);
      const formNames = new Map((forms || []).map((f) => [f.id, f.name]));
      return (submissions || []).map((s) => ({
        id: String(s.id),
        form: s.form_name || formNames.get(s.form_id) || "",
        created: s.created_at,
        data: Object.fromEntries(Object.entries(s.data || {}).filter(([k]) => !["ip", "user_agent", "referrer", "form-name", "bot-field"].includes(k)).map(([k, v]) => [k, String(v ?? "")]))
      }));
    },
    async netlifyDeleteSubmission(id) {
      if (!/^[\w-]{6,64}$/.test(String(id))) throw new Error("Invalid message.");
      await netlify(`/submissions/${id}`, { method: "DELETE" });
      return true;
    },
    async stats(provider, siteId, days) {
      const n = [7, 30, 365].includes(Number(days)) ? Number(days) : 30;
      if (provider === "plausible") {
        const key = await getToken("plausible");
        if (!key) throw new Error("Add your Plausible API key first.");
        if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(String(siteId))) throw new Error("Set your Plausible site (your domain) in File → Services.");
        const base = "https://plausible.io";
        const range = n === 365 ? "12mo" : `${n}d`;
        const q = (body) => call(`${base}/api/v2/query`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ site_id: siteId, date_range: range, ...body }) });
        const [totals, series, pages, sources] = await Promise.all([
          q({ metrics: ["visitors", "pageviews", "bounce_rate", "visit_duration"] }),
          q({ metrics: ["visitors"], dimensions: [n === 365 ? "time:month" : "time:day"] }),
          q({ metrics: ["visitors"], dimensions: ["event:page"], order_by: [["visitors", "desc"]], pagination: { limit: 10 } }),
          q({ metrics: ["visitors"], dimensions: ["visit:source"], order_by: [["visitors", "desc"]], pagination: { limit: 8 } })
        ]);
        const t = totals.results?.[0]?.metrics ?? [0, 0, 0, 0];
        return {
          visitors: t[0],
          pageviews: t[1],
          bounceRate: t[2],
          avgDuration: t[3],
          series: (series.results ?? []).map((r) => ({ date: r.dimensions[0], value: r.metrics[0] })),
          pages: (pages.results ?? []).map((r) => ({ name: r.dimensions[0], value: r.metrics[0] })),
          sources: (sources.results ?? []).map((r) => ({ name: r.dimensions[0] || "Direct", value: r.metrics[0] }))
        };
      }
      if (provider === "umami") {
        const key = await getToken("umami");
        if (!key) throw new Error("Add your Umami API key first.");
        if (!/^[0-9a-f-]{36}$/i.test(String(siteId))) throw new Error("Set your Umami website id in File → Services.");
        const base = "https://api.umami.is";
        const endAt = Date.now();
        const startAt = endAt - n * 864e5;
        const get = (path, extra = "") => call(`${base}/v1/websites/${siteId}/${path}?startAt=${startAt}&endAt=${endAt}${extra}`, { headers: { "x-umami-api-key": key, Accept: "application/json" } });
        const [stats, views, pages, refs] = await Promise.all([get("stats"), get("pageviews", `&unit=${n === 365 ? "month" : "day"}&timezone=UTC`), get("metrics", "&type=url&limit=10"), get("metrics", "&type=referrer&limit=8")]);
        const val = (x) => (typeof x === "object" && x ? Number(x.value ?? 0) : Number(x ?? 0));
        const visits = val(stats.visits) || 1;
        return {
          visitors: val(stats.visitors),
          pageviews: val(stats.pageviews),
          bounceRate: Math.round((val(stats.bounces) / visits) * 100),
          avgDuration: Math.round(val(stats.totaltime) / visits),
          series: (views.sessions ?? views.pageviews ?? []).map((p) => ({ date: String(p.x).slice(0, 10), value: Number(p.y) })),
          pages: (pages ?? []).map((p) => ({ name: p.x, value: Number(p.y) })),
          sources: (refs ?? []).map((p) => ({ name: p.x || "Direct", value: Number(p.y) }))
        };
      }
      throw new Error("Stats in the app work with Plausible and Umami.");
    },
    async announce(channel, text, link) {
      const message = String(text || "").trim();
      if (!message) throw new Error("Write something to post first.");
      const url = /^https:\/\/\S+$/.test(String(link || "")) ? String(link) : "";
      const account = async (name, label) => {
        const raw = await getToken(name);
        if (!raw) throw new Error(`Connect ${label} first.`);
        try {
          return JSON.parse(raw);
        } catch {
          throw new Error(`Reconnect ${label}: its saved details can't be read.`);
        }
      };
      if (channel === "discord") {
        const { webhook } = await account("discord", "Discord");
        const m = String(webhook).match(/^https:\/\/(?:ptb\.|canary\.)?(?:discord|discordapp)\.com(\/api\/webhooks\/\d{5,25}\/[\w-]{20,120})$/);
        if (!m) throw new Error("That isn't a Discord webhook address.");
        await call(`https://discord.com${m[1]}?wait=true`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: [message, url].filter(Boolean).join("\n\n").slice(0, 2000), allowed_mentions: { parse: [] } }) });
        return { url: "" };
      }
      if (channel === "bluesky") {
        const { handle, password } = await account("bluesky", "Bluesky");
        const base = "https://bsky.social";
        const session = await call(`${base}/xrpc/com.atproto.server.createSession`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: String(handle).replace(/^@/, ""), password }) });
        const full = [message, url].filter(Boolean).join("\n\n");
        const record = { $type: "app.bsky.feed.post", text: full, createdAt: new Date().toISOString() };
        if (url) {
          const start = Buffer.byteLength(full.slice(0, full.lastIndexOf(url)), "utf8");
          record.facets = [{ index: { byteStart: start, byteEnd: start + Buffer.byteLength(url, "utf8") }, features: [{ $type: "app.bsky.richtext.facet#link", uri: url }] }];
          record.embed = { $type: "app.bsky.embed.external", external: { uri: url, title: message.split("\n")[0].slice(0, 300), description: "" } };
        }
        const created = await call(`${base}/xrpc/com.atproto.repo.createRecord`, { method: "POST", headers: { Authorization: `Bearer ${session.accessJwt}`, "Content-Type": "application/json" }, body: JSON.stringify({ repo: session.did, collection: "app.bsky.feed.post", record }) });
        const rkey = String(created?.uri ?? "").split("/").pop();
        return { url: rkey ? `https://bsky.app/profile/${session.handle || handle}/post/${rkey}` : "" };
      }
      if (channel === "mastodon") {
        const { server, token } = await account("mastodon", "Mastodon");
        const host = String(server).trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
        if (!/^[\w.-]+\.[a-z]{2,}$/i.test(host)) throw new Error("Your Mastodon server's address looks wrong (e.g. mastodon.social).");
        const base = `https://${host}`;
        const status = await call(`${base}/api/v1/statuses`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Idempotency-Key": `fw-${Date.now()}` }, body: JSON.stringify({ status: [message, url].filter(Boolean).join("\n\n"), visibility: "public" }) });
        return { url: String(status?.url ?? "") };
      }
      if (channel === "telegram") {
        const { token, chat } = await account("telegram", "Telegram");
        if (!/^\d{5,15}:[\w-]{20,60}$/.test(String(token))) throw new Error("That doesn't look like a Telegram bot token.");
        if (!/^(@[\w]{4,40}|-?\d{4,20})$/.test(String(chat))) throw new Error("Use your channel's @name (or its numeric id).");
        const base = "https://api.telegram.org";
        const sent = await call(`${base}/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chat, text: [message, url].filter(Boolean).join("\n\n").slice(0, 4096) }) });
        const username = sent?.result?.chat?.username;
        return { url: username && sent?.result?.message_id ? `https://t.me/${username}/${sent.result.message_id}` : "" };
      }
      throw new Error("FayteWorks can't post there directly yet.");
    },
    async buttondownDraft(subject, body) {
      const key = await getToken("buttondown");
      if (!key) throw new Error("Add your Buttondown API key first.");
      if (!String(subject).trim()) throw new Error("The email needs a subject.");
      const base = "https://api.buttondown.com";
      const created = await call(`${base}/v1/emails`, {
        method: "POST",
        headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ subject: String(subject).slice(0, 300), body: String(body), status: "draft" })
      });
      return { id: String(created?.id ?? "") };
    },
    async wordpressPattern(site, user, title, content) {
      const created = await wordpress(site, user, "/blocks", { method: "POST", body: JSON.stringify({ title, content, status: "publish" }) });
      return { id: created.id, link: `${String(site).replace(/\/+$/, "")}/wp-admin/post.php?post=${created.id}&action=edit` };
    }
  };
}
