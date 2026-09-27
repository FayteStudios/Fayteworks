const NETLIFY_API = "https://api.netlify.com/api/v1";
const GITHUB_API = "https://api.github.com";

async function expectOk(response, what) {
  if (response.ok) return response;
  let detail = "";
  try {
    const body = await response.json();
    detail = body.message || body.error || JSON.stringify(body);
  } catch {
    detail = response.statusText;
  }
  const hint = response.status === 401 || response.status === 403 ? " Check that the access token is correct and has the right permissions." : "";
  throw new Error(`${what} failed (${response.status}): ${detail}.${hint}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function deployNetlify({ token, zip, siteId, siteName, onProgress = () => {} }) {
  const auth = { Authorization: `Bearer ${token}` };
  let site = null;
  if (!siteId) {
    onProgress("Creating the Netlify site…");
    const response = await fetch(`${NETLIFY_API}/sites`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify(siteName ? { name: siteName } : {})
    });
    site = await (await expectOk(response, "Creating the Netlify site")).json();
    siteId = site.id;
  }
  onProgress("Uploading…");
  const upload = await fetch(`${NETLIFY_API}/sites/${siteId}/deploys`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/zip" },
    body: zip
  });
  let deploy = await (await expectOk(upload, "Uploading to Netlify")).json();
  for (let i = 0; i < 60 && !["ready", "error"].includes(deploy.state); i++) {
    await sleep(1000);
    deploy = await (await expectOk(await fetch(`${NETLIFY_API}/deploys/${deploy.id}`, { headers: auth }), "Checking the deploy")).json();
  }
  if (deploy.state === "error") throw new Error(`Netlify couldn't publish the site: ${deploy.error_message ?? "unknown error"}.`);
  return {
    siteId,
    url: deploy.ssl_url || deploy.url || site?.ssl_url || site?.url || "",
    adminUrl: deploy.admin_url || site?.admin_url || "",
    state: deploy.state
  };
}

export async function deployGithub({ token, repo: repoName, files }) {
  const gh = async (route, init = {}, what = route) =>
    expectOk(
      await fetch(`${GITHUB_API}${route}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(init.body ? { "Content-Type": "application/json" } : {})
        }
      }),
      what
    );

  const user = await (await gh("/user", {}, "Signing in to GitHub")).json();
  const owner = user.login;
  let repo;
  const existing = await fetch(`${GITHUB_API}/repos/${owner}/${repoName}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }
  });
  if (existing.status === 404) {
    repo = await (
      await gh("/user/repos", { method: "POST", body: JSON.stringify({ name: repoName, auto_init: true, description: "Website" }) }, "Creating the repository")
    ).json();
  } else {
    repo = await (await expectOk(existing, "Finding the repository")).json();
  }
  const branch = repo.default_branch || "main";
  const head = await (await gh(`/repos/${owner}/${repoName}/git/ref/heads/${branch}`, {}, "Reading the repository")).json();

  const all = [...files, { path: ".nojekyll", data: new Uint8Array() }];
  const tree = [];
  for (let i = 0; i < all.length; i += 4) {
    const batch = await Promise.all(
      all.slice(i, i + 4).map(async (file) => {
        const blob = await (
          await gh(
            `/repos/${owner}/${repoName}/git/blobs`,
            { method: "POST", body: JSON.stringify({ content: Buffer.from(file.data).toString("base64"), encoding: "base64" }) },
            `Uploading ${file.path}`
          )
        ).json();
        return { path: file.path, mode: "100644", type: "blob", sha: blob.sha };
      })
    );
    tree.push(...batch);
  }
  const newTree = await (await gh(`/repos/${owner}/${repoName}/git/trees`, { method: "POST", body: JSON.stringify({ tree }) }, "Building the commit")).json();
  const commit = await (
    await gh(
      `/repos/${owner}/${repoName}/git/commits`,
      { method: "POST", body: JSON.stringify({ message: "Publish website", tree: newTree.sha, parents: [head.object.sha] }) },
      "Committing"
    )
  ).json();
  await gh(`/repos/${owner}/${repoName}/git/refs/heads/${branch}`, { method: "PATCH", body: JSON.stringify({ sha: commit.sha, force: true }) }, "Updating the branch");

  let pages = await fetch(`${GITHUB_API}/repos/${owner}/${repoName}/pages`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }
  });
  if (pages.status === 404) {
    pages = await gh(
      `/repos/${owner}/${repoName}/pages`,
      { method: "POST", body: JSON.stringify({ source: { branch, path: "/" } }) },
      "Turning on GitHub Pages"
    );
  }
  const info = pages.ok ? await pages.json() : {};
  const url = info.html_url || (repoName.toLowerCase() === `${owner.toLowerCase()}.github.io` ? `https://${repoName}/` : `https://${owner}.github.io/${repoName}/`);
  return { url, repo: `${owner}/${repoName}`, commit: commit.sha };
}

const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";

const CONTENT_TYPES = {
  html: "text/html",
  css: "text/css",
  js: "text/javascript",
  json: "application/json",
  txt: "text/plain",
  xml: "application/xml",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  mp4: "video/mp4",
  webm: "video/webm"
};

async function cloudflare(path, { token, method = "GET", body, headers = {} }, what) {
  const response = await fetch(`${CLOUDFLARE_API}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...headers }, body });
  let json = null;
  try {
    json = await response.json();
  } catch {
  }
  if (!response.ok || json?.success === false) {
    const detail = json?.errors?.map((e) => e.message).join("; ") || response.statusText;
    const hint = response.status === 401 || response.status === 403 ? " Check the API token (it needs the “Cloudflare Pages: Edit” permission) and the account ID." : "";
    const error = new Error(`${what} failed (${response.status}): ${detail}.${hint}`);
    error.status = response.status;
    throw error;
  }
  return json?.result;
}

export async function deployCloudflare({ token, accountId, project, files, onProgress = () => {} }) {
  const { createHash } = await import("node:crypto");
  const base = `/accounts/${encodeURIComponent(accountId)}/pages/projects`;
  const name = String(project).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 58) || "site";

  try {
    await cloudflare(`${base}/${name}`, { token }, "Looking up the Cloudflare Pages project");
  } catch (error) {
    if (error.status !== 404) throw error;
    onProgress("Creating the Cloudflare Pages project…");
    await cloudflare(
      base,
      { token, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, production_branch: "main" }) },
      "Creating the Cloudflare Pages project"
    );
  }

  const { jwt } = await cloudflare(`${base}/${name}/upload-token`, { token }, "Starting the upload");
  const assets = { token: jwt };

  const entries = files.map((file) => {
    const data = Buffer.from(file.data);
    const ext = file.path.includes(".") ? file.path.split(".").pop().toLowerCase() : "";
    const base64 = data.toString("base64");
    return {
      path: `/${file.path}`,
      base64,
      hash: createHash("sha256").update(base64 + ext).digest("hex").slice(0, 32),
      contentType: CONTENT_TYPES[ext] ?? "application/octet-stream"
    };
  });
  const hashes = [...new Set(entries.map((e) => e.hash))];
  const missing = new Set(
    await cloudflare("/pages/assets/check-missing", { ...assets, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hashes }) }, "Checking files")
  );

  const toUpload = entries.filter((e, i) => missing.has(e.hash) && entries.findIndex((x) => x.hash === e.hash) === i);
  let batch = [];
  let batchSize = 0;
  let sent = 0;
  const flush = async () => {
    if (!batch.length) return;
    onProgress(`Uploading files (${sent + batch.length} of ${toUpload.length})…`);
    await cloudflare(
      "/pages/assets/upload",
      {
        ...assets,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch.map((e) => ({ key: e.hash, value: e.base64, metadata: { contentType: e.contentType }, base64: true })))
      },
      "Uploading files"
    );
    sent += batch.length;
    batch = [];
    batchSize = 0;
  };
  for (const entry of toUpload) {
    if (batchSize + entry.base64.length > 40_000_000 || batch.length >= 1000) await flush();
    batch.push(entry);
    batchSize += entry.base64.length;
  }
  await flush();
  await cloudflare("/pages/assets/upsert-hashes", { ...assets, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hashes }) }, "Finishing the upload");

  onProgress("Publishing…");
  const form = new FormData();
  form.append("manifest", JSON.stringify(Object.fromEntries(entries.map((e) => [e.path, e.hash]))));
  form.append("branch", "main");
  const deployment = await cloudflare(`${base}/${name}/deployments`, { token, method: "POST", body: form }, "Creating the deployment");
  return { project: name, url: `https://${name}.pages.dev`, deploymentUrl: deployment?.url ?? "" };
}
