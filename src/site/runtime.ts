export function initSite(root: Document | HTMLElement): () => void {
  const cleanups: Array<() => void> = [];
  const doc = root instanceof Document ? root : root.ownerDocument;
  const host = root instanceof Document ? root.documentElement : root;
  const all = <T extends Element = HTMLElement>(sel: string, within: ParentNode = root) => Array.from(within.querySelectorAll<T>(sel));
  const listen = (el: EventTarget, type: string, fn: EventListener, opts?: AddEventListenerOptions) => {
    el.addEventListener(type, fn, opts);
    cleanups.push(() => el.removeEventListener(type, fn, opts));
  };
  const reducedMotion = doc.defaultView?.matchMedia("(prefers-reduced-motion: reduce)").matches ?? false;
  const flag = host.matches(".site-root") ? host : host.querySelector<HTMLElement>(".site-root") ?? host;

  const reveals = all("[data-reveal]");
  if (reveals.length && "IntersectionObserver" in (doc.defaultView ?? {}) && !reducedMotion) {
    flag.classList.add("reveal-ready");
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-revealed");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12 }
    );
    reveals.forEach((el) => io.observe(el));
    cleanups.push(() => {
      io.disconnect();
      flag.classList.remove("reveal-ready");
      reveals.forEach((el) => el.classList.remove("is-revealed"));
    });
  }

  const drawings = all("[data-draw-anim]");
  if (drawings.length && "IntersectionObserver" in (doc.defaultView ?? {}) && !reducedMotion) {
    flag.classList.add("anim-ready");
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-playing");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.25 }
    );
    drawings.forEach((el) => io.observe(el));
    cleanups.push(() => {
      io.disconnect();
      flag.classList.remove("anim-ready");
      drawings.forEach((el) => el.classList.remove("is-playing"));
    });
  }

  for (const carousel of all('[data-js="carousel"]')) {
    const track = carousel.querySelector<HTMLElement>(".b-carousel-track");
    if (!track) continue;
    const slides = all(".b-carousel-slide", track);
    const prev = carousel.querySelector<HTMLButtonElement>("[data-carousel-prev]");
    const next = carousel.querySelector<HTMLButtonElement>("[data-carousel-next]");
    const dotsBox = carousel.querySelector<HTMLElement>(".b-carousel-dots");
    const loop = carousel.dataset.loop === "true";
    const index = () => Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    const go = (i: number) => {
      const count = slides.length;
      const target = loop ? (i + count) % count : Math.max(0, Math.min(count - 1, i));
      track.scrollTo({ left: target * track.clientWidth, behavior: reducedMotion ? "auto" : "smooth" });
    };
    const dots = slides.map((_, i) => {
      const dot = doc.createElement("button");
      dot.type = "button";
      dot.className = "b-carousel-dot";
      dot.setAttribute("aria-label", `Slide ${i + 1}`);
      listen(dot, "click", () => go(i));
      dotsBox?.appendChild(dot);
      return dot;
    });
    const sync = () => {
      const i = index();
      dots.forEach((d, j) => d.setAttribute("aria-current", String(i === j)));
      if (prev) prev.disabled = !loop && i === 0;
      if (next) next.disabled = !loop && i === slides.length - 1;
    };
    if (prev) {
      prev.hidden = false;
      listen(prev, "click", () => go(index() - 1));
    }
    if (next) {
      next.hidden = false;
      listen(next, "click", () => go(index() + 1));
    }
    listen(track, "scroll", sync, { passive: true });
    sync();
    const delay = Number(carousel.dataset.autoplay) || 0;
    if (delay > 0 && !reducedMotion && slides.length > 1) {
      let paused = false;
      listen(carousel, "pointerenter", () => (paused = true));
      listen(carousel, "pointerleave", () => (paused = false));
      listen(carousel, "focusin", () => (paused = true));
      listen(carousel, "focusout", () => (paused = false));
      const timer = setInterval(() => !paused && go(index() + 1), delay);
      cleanups.push(() => clearInterval(timer));
    }
    cleanups.push(() => dots.forEach((d) => d.remove()));
  }

  const galleries = all('[data-js="lightbox"]');
  if (galleries.length) {
    const dialog = doc.createElement("dialog");
    dialog.className = "b-lightbox";
    dialog.innerHTML =
      '<figure><img alt=""><figcaption></figcaption></figure>' +
      '<button type="button" class="b-lightbox-close" aria-label="Close">×</button>' +
      '<button type="button" class="b-lightbox-prev" aria-label="Previous">‹</button>' +
      '<button type="button" class="b-lightbox-next" aria-label="Next">›</button>';
    host === doc.documentElement ? doc.body.appendChild(dialog) : host.appendChild(dialog);
    const img = dialog.querySelector("img")!;
    const caption = dialog.querySelector("figcaption")!;
    let items: HTMLAnchorElement[] = [];
    let current = 0;
    const show = (i: number) => {
      current = (i + items.length) % items.length;
      const item = items[current];
      img.src = item.href;
      img.alt = item.querySelector("img")?.alt ?? "";
      caption.textContent = item.dataset.caption ?? "";
    };
    for (const gallery of galleries) {
      const links = all<HTMLAnchorElement>("a.b-gallery-item", gallery);
      links.forEach((link, i) =>
        listen(link, "click", (e) => {
          e.preventDefault();
          items = links;
          show(i);
          dialog.showModal();
        })
      );
    }
    listen(dialog.querySelector(".b-lightbox-close")!, "click", () => dialog.close());
    listen(dialog.querySelector(".b-lightbox-prev")!, "click", () => show(current - 1));
    listen(dialog.querySelector(".b-lightbox-next")!, "click", () => show(current + 1));
    listen(dialog, "click", (e) => e.target === dialog && dialog.close());
    listen(dialog, "keydown", (e) => {
      const key = (e as KeyboardEvent).key;
      if (key === "ArrowLeft") show(current - 1);
      if (key === "ArrowRight") show(current + 1);
    });
    cleanups.push(() => dialog.remove());
  }

  all('[data-js="tabs"]').forEach((tabs, n) => {
    const list = tabs.querySelector<HTMLElement>(".b-tabs-list");
    const buttons = list ? all<HTMLButtonElement>("button", list) : [];
    const panels = all(".b-tabs-panel", tabs);
    if (!list || buttons.length !== panels.length) return;
    list.hidden = false;
    list.setAttribute("role", "tablist");
    tabs.classList.add("is-enhanced");
    const select = (i: number, focus = false) => {
      buttons.forEach((b, j) => {
        b.setAttribute("aria-selected", String(i === j));
        b.tabIndex = i === j ? 0 : -1;
        panels[j].hidden = i !== j;
      });
      if (focus) buttons[i].focus();
    };
    buttons.forEach((b, i) => {
      b.setAttribute("role", "tab");
      b.id = `tab-${n}-${i}`;
      panels[i].setAttribute("role", "tabpanel");
      panels[i].setAttribute("aria-labelledby", b.id);
      listen(b, "click", () => select(i));
      listen(b, "keydown", (e) => {
        const key = (e as KeyboardEvent).key;
        if (key === "ArrowRight") select((i + 1) % buttons.length, true);
        if (key === "ArrowLeft") select((i - 1 + buttons.length) % buttons.length, true);
      });
    });
    select(0);
    cleanups.push(() => {
      tabs.classList.remove("is-enhanced");
      list.hidden = true;
      panels.forEach((p) => (p.hidden = false));
    });
  });

  for (const video of all('[data-js="video"]')) {
    const poster = video.querySelector<HTMLAnchorElement>(".b-video-poster");
    const embed = video.dataset.embed;
    if (!poster || !embed) continue;
    listen(poster, "click", (e) => {
      e.preventDefault();
      const frame = doc.createElement("iframe");
      frame.src = embed;
      frame.title = poster.getAttribute("aria-label") ?? "Video";
      frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
      frame.allowFullscreen = true;
      frame.className = "b-video-frame";
      poster.replaceWith(frame);
    });
  }

  for (const embed of all('[data-js="embed"]')) {
    const poster = embed.querySelector<HTMLAnchorElement>(".embed-poster");
    const src = embed.dataset.embed;
    if (!poster || !src) continue;
    listen(poster, "click", (e) => {
      e.preventDefault();
      const frame = doc.createElement("iframe");
      frame.src = src;
      frame.title = embed.dataset.title ?? "Map";
      frame.className = "embed-frame";
      frame.referrerPolicy = "no-referrer-when-downgrade";
      frame.allowFullscreen = true;
      poster.replaceWith(frame);
    });
  }

  const socialEmbeds = all('[data-js="social-embed"]');
  if (socialEmbeds.length) {
    const view = doc.defaultView as (Window & { twttr?: { widgets?: { load: (el?: Element) => void } } }) | null;
    const loadEmbed = (box: HTMLElement) => {
      if (box.dataset.loaded) return;
      let src = box.dataset.src ?? "";
      if (box.dataset.twitch) {
        const host = doc.defaultView?.location.hostname;
        if (!host) return;
        src += `${src.includes("?") ? "&" : "?"}parent=${encodeURIComponent(host)}`;
      }
      box.dataset.loaded = "1";
      const poster = box.querySelector(".embed-poster");
      if (box.dataset.kind === "x") {
        const quote = doc.createElement("blockquote");
        quote.className = "twitter-tweet";
        quote.dataset.dnt = "true";
        const a = doc.createElement("a");
        a.href = `https://twitter.com/i/status/${src}`;
        a.textContent = "View this post on X";
        quote.appendChild(a);
        if (poster) poster.replaceWith(quote);
        else box.appendChild(quote);
        if (view?.twttr?.widgets) view.twttr.widgets.load(box);
        else if (!doc.getElementById("fw-x-widgets")) {
          const script = doc.createElement("script");
          script.id = "fw-x-widgets";
          script.async = true;
          script.src = "https://platform.twitter.com/widgets.js";
          doc.head.appendChild(script);
        }
        return;
      }
      const frame = doc.createElement("iframe");
      frame.src = src;
      frame.title = box.dataset.title ?? "Embedded post";
      frame.className = "embed-frame";
      frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write";
      frame.allowFullscreen = true;
      if (poster) poster.replaceWith(frame);
      else box.appendChild(frame);
    };
    const onView = socialEmbeds.filter((box) => box.dataset.load !== "click");
    for (const box of socialEmbeds.filter((b) => b.dataset.load === "click")) {
      const poster = box.querySelector(".embed-poster");
      if (poster)
        listen(poster, "click", (e) => {
          e.preventDefault();
          loadEmbed(box);
        });
    }
    if (onView.length) {
      if ("IntersectionObserver" in (doc.defaultView ?? {})) {
        const io = new IntersectionObserver(
          (entries) =>
            entries.forEach((entry) => {
              if (!entry.isIntersecting) return;
              loadEmbed(entry.target as HTMLElement);
              io.unobserve(entry.target);
            }),
          { rootMargin: "200px" }
        );
        onView.forEach((box) => io.observe(box));
        cleanups.push(() => io.disconnect());
      } else onView.forEach(loadEmbed);
    }
  }

  const zoneOffset = (tz: string, at: number) => {
    const parts: Record<string, string> = {};
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(at))
      .forEach((p) => (parts[p.type] = p.value));
    return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second) - at;
  };
  const zonedTime = (y: number, mo: number, d: number, h: number, mi: number, tz: string) => {
    const guess = Date.UTC(y, mo - 1, d, h, mi);
    let t = guess - zoneOffset(tz, guess);
    t = guess - zoneOffset(tz, t);
    return t;
  };
  let visitorZone = "";
  try {
    visitorZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
  }
  for (const el of all('[data-js="localtime"]')) {
    const tz = el.dataset.tz ?? "UTC";
    const [h, mi] = (el.dataset.time ?? "").split(":").map(Number);
    const day = Number(el.dataset.day);
    if (!visitorZone || visitorZone === tz || !Number.isFinite(h) || !Number.isFinite(day)) continue;
    try {
      const now = Date.now();
      const local = new Date(now + zoneOffset(tz, now));
      const date = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + ((day - local.getUTCDay() + 7) % 7)));
      const at = new Date(zonedTime(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), h, mi, tz));
      el.textContent = `${at.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit", hour12: el.dataset.clock !== "24" })} your time`;
    } catch {
    }
  }
  for (const box of all('[data-js="countdown"]')) {
    const m = (box.dataset.at ?? "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if (!m) continue;
    let target: number;
    try {
      target = zonedTime(+m[1], +m[2], +m[3], +m[4], +m[5], box.dataset.tz || "UTC");
    } catch {
      continue;
    }
    const units = Object.fromEntries(all("[data-unit]", box).map((el) => [el.dataset.unit!, el]));
    const tick = () => {
      const left = Math.max(0, target - Date.now());
      const s = Math.floor(left / 1000);
      const values: Record<string, number> = { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
      if (!units.s) values.m = Math.ceil((s % 3600) / 60) % 60;
      for (const [k, el] of Object.entries(units)) el.textContent = k === "d" ? String(values[k]) : String(values[k]).padStart(2, "0");
      if (left === 0) {
        box.classList.add("is-done");
        const done = box.dataset.done;
        const when = box.querySelector(".b-countdown-when");
        if (done && when) when.textContent = done;
        return false;
      }
      return true;
    };
    if (tick()) {
      const timer = setInterval(() => !tick() && clearInterval(timer), 1000);
      cleanups.push(() => clearInterval(timer));
    }
  }

  const layers = all("[data-parallax]");
  if (layers.length && !reducedMotion) {
    let scroller: HTMLElement | null = null;
    if (!(root instanceof Document)) {
      for (let el = host.parentElement; el; el = el.parentElement) {
        const overflow = getComputedStyle(el).overflowY;
        if (overflow === "auto" || overflow === "scroll") {
          scroller = el;
          break;
        }
      }
    }
    const view = doc.defaultView!;
    let frame = 0;
    const update = () => {
      frame = 0;
      const box = scroller ? scroller.getBoundingClientRect() : { top: 0, height: view.innerHeight };
      const centre = box.top + box.height / 2;
      for (const el of layers) {
        const speed = Number(el.dataset.parallax) || 0;
        const isBg = el.classList.contains("site-section-bg");
        const target = isBg ? el.closest<HTMLElement>(".site-section") ?? el.parentElement! : el;
        const r = target.getBoundingClientRect();
        const distance = r.top + r.height / 2 - centre;
        if (isBg) {
          const reach = Math.ceil(Math.abs(speed) * (box.height + r.height) / 2);
          el.style.top = el.style.bottom = `${-reach}px`;
        }
        el.style.translate = `0 ${(distance * speed).toFixed(1)}px`;
      }
    };
    const request = () => {
      if (!frame) frame = view.requestAnimationFrame(update);
    };
    const target: EventTarget = scroller ?? view;
    listen(target, "scroll", request, { passive: true });
    listen(view, "resize", request);
    update();
    cleanups.push(() => {
      if (frame) view.cancelAnimationFrame(frame);
      for (const el of layers) {
        el.style.translate = "";
        el.style.top = el.style.bottom = "";
      }
    });
  }

  for (const shell of all('[data-js="shell-scroll"]')) {
    const horizontal = shell.dataset.direction === "x";
    const slides = all(".shell-slide", shell);
    const dots = all<HTMLAnchorElement>(".shell-dots a", shell);
    const current = () => {
      let best = 0;
      let bestDistance = Infinity;
      slides.forEach((s, i) => {
        const r = s.getBoundingClientRect();
        const d = horizontal ? Math.abs(r.left + r.width / 2 - (doc.defaultView?.innerWidth ?? 0) / 2) : Math.abs(r.top);
        if (d < bestDistance) {
          bestDistance = d;
          best = i;
        }
      });
      return best;
    };
    const sync = () => {
      const i = current();
      dots.forEach((d, j) => d.setAttribute("aria-current", String(i === j)));
    };
    const go = (i: number) => {
      const index = Math.max(0, Math.min(slides.length - 1, i));
      const behavior = reducedMotion ? "auto" : "smooth";
      if (horizontal) shell.scrollTo({ left: index * shell.clientWidth, behavior });
      else slides[index]?.scrollIntoView({ behavior, block: "start" });
    };
    dots.forEach((dot, i) =>
      listen(dot, "click", (e) => {
        e.preventDefault();
        go(i);
      })
    );
    listen(horizontal ? shell : (doc.defaultView as Window), "scroll", sync, { passive: true, capture: true });
    if (horizontal) {
      let lastTurn = 0;
      listen(
        shell,
        "wheel",
        (e) => {
          const w = e as WheelEvent;
          if (Math.abs(w.deltaY) <= Math.abs(w.deltaX) || Math.abs(w.deltaY) < 20) return;
          e.preventDefault();
          const now = Date.now();
          if (now - lastTurn < 550) return;
          lastTurn = now;
          go(current() + (w.deltaY > 0 ? 1 : -1));
        },
        { passive: false }
      );
      listen(doc, "keydown", (e) => {
        const key = (e as KeyboardEvent).key;
        if (key === "ArrowRight") go(current() + 1);
        if (key === "ArrowLeft") go(current() - 1);
      });
    }
    sync();
  }

  const flipbooks = all('[data-js="flipbook"]');
  if (flipbooks.length && !reducedMotion) {
    const view = doc.defaultView!;
    let scroller: HTMLElement | null = null;
    if (!(root instanceof Document)) {
      for (let el = host.parentElement; el; el = el.parentElement) {
        const overflow = getComputedStyle(el).overflowY;
        if (overflow === "auto" || overflow === "scroll") {
          scroller = el;
          break;
        }
      }
    }
    const scrubbers: Array<() => void> = [];
    for (const fb of flipbooks) {
      const frames = all(".fb-frame", fb);
      if (frames.length < 2) continue;
      const count = frames.length;
      const fps = Math.min(60, Math.max(1, Number(fb.dataset.fps) || 12));
      const mode = fb.dataset.play ?? "loop";
      const pingpong = fb.dataset.pingpong !== undefined;
      let current = frames.findIndex((f) => f.classList.contains("is-current"));
      const show = (n: number) => {
        if (n === current) return;
        frames[current]?.classList.remove("is-current");
        current = n;
        frames[current].classList.add("is-current");
      };
      show(0);
      let timer = 0;
      let step = 0;
      const stop = () => {
        if (timer) view.clearInterval(timer);
        timer = 0;
      };
      const run = (once: boolean) => {
        stop();
        step = 0;
        show(0);
        timer = view.setInterval(() => {
          step++;
          if (once && step >= count - 1) {
            show(count - 1);
            stop();
            return;
          }
          const period = 2 * count - 2;
          const k = pingpong ? step % period : step % count;
          show(pingpong && k >= count ? period - k : k);
        }, 1000 / fps);
      };
      cleanups.push(stop);
      if (mode === "loop" || mode === "view") {
        let seen = false;
        const io = new IntersectionObserver((entries) => {
          const inView = entries.some((e) => e.isIntersecting);
          if (mode === "loop") inView ? !timer && run(false) : stop();
          else if (inView && !seen) {
            seen = true;
            run(true);
          }
        });
        io.observe(fb);
        cleanups.push(() => io.disconnect());
      } else if (mode === "hover") {
        const target = fb.closest<HTMLElement>(".site-block, .cmp-block") ?? fb;
        listen(target, "pointerenter", () => run(false));
        listen(target, "pointerleave", () => (stop(), show(0)));
      } else if (mode === "click") {
        listen(fb.closest<HTMLElement>(".site-block, .cmp-block") ?? fb, "click", () => run(true));
      } else if (mode === "scroll") {
        scrubbers.push(() => {
          const box = scroller ? scroller.getBoundingClientRect() : { top: 0, height: view.innerHeight };
          const r = fb.getBoundingClientRect();
          const p = Math.min(1, Math.max(0, (box.top + box.height - r.top) / (box.height + r.height)));
          show(Math.min(count - 1, Math.floor(p * count)));
        });
      }
    }
    if (scrubbers.length) {
      let frame = 0;
      const update = () => {
        frame = 0;
        scrubbers.forEach((fn) => fn());
      };
      const request = () => {
        if (!frame) frame = view.requestAnimationFrame(update);
      };
      listen(scroller ?? view, "scroll", request, { passive: true });
      update();
      cleanups.push(() => frame && view.cancelAnimationFrame(frame));
    }
  }

  for (const box of all('[data-js="search"]')) {
    const input = box.querySelector<HTMLInputElement>(".b-search-input");
    const list = box.querySelector<HTMLOListElement>(".b-search-results");
    const form = box.querySelector("form");
    if (!input || !list || !form) continue;
    type Entry = { l?: string; u: string; t: string; d: string; h: string; x: string };
    let index: Entry[] | null = null;
    let loading: Promise<Entry[]> | null = null;
    const load = () =>
      (loading ??= fetch(box.dataset.index ?? "search-index.json")
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => [])
        .then((data: Entry[]) => (index = Array.isArray(data) ? data : [])));
    const max = Number(box.dataset.max) || 8;
    const words = (q: string) => q.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1 || /\d/.test(w));
    const highlighted = (text: string, terms: string[]) => {
      const frag = doc.createDocumentFragment();
      const lower = text.toLowerCase();
      let at = 0;
      while (at < text.length) {
        let next = -1;
        let len = 0;
        for (const t of terms) {
          const i = lower.indexOf(t, at);
          if (i >= 0 && (next < 0 || i < next)) [next, len] = [i, t.length];
        }
        if (next < 0) break;
        frag.append(text.slice(at, next));
        const mark = doc.createElement("mark");
        mark.textContent = text.slice(next, next + len);
        frag.append(mark);
        at = next + len;
      }
      frag.append(text.slice(at));
      return frag;
    };
    const run = () => {
      const terms = words(input.value);
      if (!terms.length || !index) {
        list.hidden = true;
        list.replaceChildren();
        return;
      }
      const pageLang = doc.documentElement.lang;
      const results = index
        .filter((e) => !e.l || e.l === pageLang)
        .map((e) => {
          const title = e.t.toLowerCase();
          const heads = e.h.toLowerCase();
          const body = `${e.d} ${e.x}`.toLowerCase();
          let score = 0;
          for (const t of terms) {
            const inTitle = title.includes(t);
            const inHeads = heads.includes(t);
            const count = body.split(t).length - 1;
            if (!inTitle && !inHeads && !count) return null;
            score += (inTitle ? 10 : 0) + (inHeads ? 4 : 0) + Math.min(count, 5);
          }
          return { e, score };
        })
        .filter((r): r is { e: Entry; score: number } => Boolean(r))
        .sort((a, b) => b.score - a.score)
        .slice(0, max);
      list.replaceChildren(
        ...results.map(({ e }) => {
          const li = doc.createElement("li");
          const a = doc.createElement("a");
          a.href = (box.dataset.root ?? "") + e.u;
          const strong = doc.createElement("strong");
          strong.append(highlighted(e.t, terms));
          const source = e.d || e.x;
          const hit = source.toLowerCase().indexOf(terms[0]);
          const start = Math.max(0, hit - 60);
          const snippet = doc.createElement("span");
          snippet.append(highlighted((start > 0 ? "…" : "") + source.slice(start, start + 170) + (source.length > start + 170 ? "…" : ""), terms));
          a.append(strong, snippet);
          li.append(a);
          return li;
        })
      );
      if (!results.length) {
        const li = doc.createElement("li");
        li.className = "b-search-none";
        li.textContent = `Nothing found for “${input.value.trim()}”.`;
        list.append(li);
      }
      list.hidden = false;
    };
    let timer = 0;
    listen(input, "focus", () => void load());
    listen(input, "input", () => {
      doc.defaultView!.clearTimeout(timer);
      timer = doc.defaultView!.setTimeout(() => void load().then(run), 120);
    });
    listen(form, "submit", (e) => {
      const first = list.querySelector<HTMLAnchorElement>("a");
      if (index && index.length) {
        e.preventDefault();
        if (first) doc.defaultView!.location.href = first.href;
      }
    });
    listen(doc, "click", (e) => {
      if (!box.contains(e.target as Node)) list.hidden = true;
    });
    listen(input, "keydown", (e) => {
      if ((e as KeyboardEvent).key === "Escape") list.hidden = true;
    });
  }

  for (const wrap of all('[data-js="tag-filter"]')) {
    const buttons = all<HTMLButtonElement>(".b-tag", wrap);
    const items = all(".b-collection-item", wrap);
    buttons.forEach((button) =>
      listen(button, "click", () => {
        const tag = button.dataset.tag ?? "";
        buttons.forEach((b) => {
          const on = b === button;
          b.classList.toggle("is-active", on);
          b.setAttribute("aria-pressed", String(on));
        });
        items.forEach((item) => (item.hidden = Boolean(tag) && !(item.dataset.tags ?? "").split("|").includes(tag)));
      })
    );
    cleanups.push(() => items.forEach((item) => (item.hidden = false)));
  }

  for (const box of all('[data-js="social-comments"]')) {
    const list = box.querySelector<HTMLOListElement>(".b-social-comments-list");
    const post = box.dataset.post ?? "";
    if (!list) continue;
    let cancelled = false;
    cleanups.push(() => {
      cancelled = true;
      list.replaceChildren();
    });
    type Reply = { name: string; handle: string; avatar: string; text: string; when: string; link: string; depth: number };
    const show = (replies: Reply[]) => {
      if (cancelled) return;
      list.replaceChildren(
        ...replies.slice(0, 100).map((r) => {
          const li = doc.createElement("li");
          li.className = "b-reply";
          li.style.setProperty("--depth", String(Math.min(r.depth, 3)));
          const avatar = doc.createElement("span");
          avatar.className = "b-reply-avatar";
          avatar.textContent = (r.name || r.handle).trim().charAt(0).toUpperCase();
          if (/^https:\/\//.test(r.avatar)) {
            const img = doc.createElement("img");
            img.src = r.avatar;
            img.alt = "";
            img.loading = "lazy";
            img.onerror = () => img.remove();
            avatar.append(img);
          }
          li.append(avatar);
          const body = doc.createElement("div");
          const who = doc.createElement("a");
          who.className = "b-reply-who";
          who.href = /^https:\/\//.test(r.link) ? r.link : "#";
          who.target = "_blank";
          who.rel = "noopener noreferrer";
          who.textContent = r.name || r.handle;
          const meta = doc.createElement("span");
          meta.className = "b-reply-meta";
          meta.textContent = ` @${r.handle} · ${new Date(r.when).toLocaleDateString()}`;
          const text = doc.createElement("p");
          text.textContent = r.text;
          body.append(who, meta, text);
          li.append(body);
          return li;
        })
      );
      if (!replies.length) {
        const li = doc.createElement("li");
        li.className = "b-reply-empty";
        li.textContent = "No replies yet. Be the first!";
        list.append(li);
      }
    };
    const fetchJson = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
    if (box.dataset.provider === "bluesky") {
      const m = /^https:\/\/bsky\.app\/profile\/([\w.:-]+)\/post\/(\w+)$/.exec(post);
      if (!m) continue;
      const api = "https://public.api.bsky.app/xrpc";
      (m[1].startsWith("did:") ? Promise.resolve({ did: m[1] }) : fetchJson(`${api}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(m[1])}`))
        .then((r: { did: string }) => fetchJson(`${api}/app.bsky.feed.getPostThread?depth=4&uri=${encodeURIComponent(`at://${r.did}/app.bsky.feed.post/${m[2]}`)}`))
        .then((data: { thread?: { replies?: unknown[] } }) => {
          type Node = { post?: { uri: string; author: { handle: string; displayName?: string; avatar?: string }; record: { text?: string; createdAt: string } }; replies?: Node[] };
          const out: Reply[] = [];
          const walk = (nodes: Node[] | undefined, depth: number) =>
            (nodes ?? []).forEach((n) => {
              if (!n.post) return;
              const rkey = n.post.uri.split("/").pop();
              out.push({ name: n.post.author.displayName ?? "", handle: n.post.author.handle, avatar: n.post.author.avatar ?? "", text: n.post.record.text ?? "", when: n.post.record.createdAt, link: `https://bsky.app/profile/${n.post.author.handle}/post/${rkey}`, depth });
              walk(n.replies, depth + 1);
            });
          walk(data.thread?.replies as Node[], 0);
          show(out);
        })
        .catch(() => undefined);
    } else if (box.dataset.provider === "mastodon") {
      const m = /^https:\/\/([\w.-]+)\/@[\w.@-]+\/(\d+)$/.exec(post);
      if (!m) continue;
      fetchJson(`https://${m[1]}/api/v1/statuses/${m[2]}/context`)
        .then((data: { descendants?: Array<{ id: string; in_reply_to_id: string; url: string; content: string; created_at: string; account: { display_name: string; acct: string; avatar: string } }> }) => {
          const depthOf = new Map<string, number>([[m[2], -1]]);
          const toText = (html: string) => new DOMParser().parseFromString(html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n"), "text/html").body.textContent?.trim() ?? "";
          show(
            (data.descendants ?? []).map((s) => {
              const depth = (depthOf.get(s.in_reply_to_id) ?? -1) + 1;
              depthOf.set(s.id, depth);
              return { name: s.account.display_name, handle: s.account.acct, avatar: s.account.avatar, text: toText(s.content), when: s.created_at, link: s.url, depth };
            })
          );
        })
        .catch(() => undefined);
    }
  }

  const animated = all("[data-anim]");
  if (animated.length && !reducedMotion && typeof host.animate === "function") {
    const view = doc.defaultView!;
    const linearOk = view.CSS?.supports?.("animation-timing-function", "linear(0, 1)") ?? false;
    flag.classList.add("fw-js");
    cleanups.push(() => flag.classList.remove("fw-js"));
    let scroller: HTMLElement | null = null;
    if (!(root instanceof Document)) {
      for (let el = host.parentElement; el; el = el.parentElement) {
        const overflow = getComputedStyle(el).overflowY;
        if (overflow === "auto" || overflow === "scroll") {
          scroller = el;
          break;
        }
      }
    }
    type Compiled = { t: string; s?: string; r?: 1; sc?: "page"; d: number; dl?: number; alt?: 1; k: Array<Array<Record<string, string | number>>> };
    const scrubs: Array<() => void> = [];
    const viewers = new Map<Element, Array<(inView: boolean) => void>>();
    for (const el of animated) {
      let list: Compiled[];
      try {
        list = JSON.parse(el.dataset.anim ?? "[]");
      } catch {
        continue;
      }
      for (const a of list) {
        const anims = a.k.map((frames) =>
          el.animate(
            frames.map((f) => (linearOk || !/^linear\(/.test(String(f.easing)) ? f : { ...f, easing: "ease-out" })),
            {
              duration: a.d,
              delay: a.t === "scroll" ? 0 : a.dl ?? 0,
              fill: "both",
              iterations: a.t === "loop" ? Infinity : 1,
              direction: a.alt ? "alternate" : "normal"
            }
          )
        );
        cleanups.push(() => anims.forEach((x) => x.cancel()));
        const end = (x: Animation) => Number(x.effect?.getComputedTiming().endTime ?? 0);
        const at = (x: Animation) => Number(x.currentTime ?? 0);
        const reset = () => anims.forEach((x) => (x.pause(), (x.currentTime = 0)));
        const forward = () => anims.forEach((x) => at(x) < end(x) && ((x.playbackRate = 1), x.play()));
        const backward = () => anims.forEach((x) => at(x) > 0 && ((x.playbackRate = -1), x.play()));
        const scope = el.closest(".cmp-grid") ?? root;
        const source = a.s && /^[\w-]+$/.test(a.s) ? scope.querySelector<HTMLElement>(`[data-b="${a.s}"]`) ?? el : el;
        if (a.t === "view") {
          reset();
          const list2 = viewers.get(el) ?? [];
          list2.push((inView) => (inView ? forward() : a.r && reset()));
          viewers.set(el, list2);
        } else if (a.t === "scroll") {
          anims.forEach((x) => x.pause());
          scrubs.push(() => {
            let p: number;
            if (a.sc === "page") {
              const s = scroller ?? doc.scrollingElement ?? doc.documentElement;
              const range = s.scrollHeight - s.clientHeight;
              p = range > 0 ? s.scrollTop / range : 0;
            } else {
              const box = scroller ? scroller.getBoundingClientRect() : { top: 0, height: view.innerHeight };
              const r = el.getBoundingClientRect();
              p = (box.top + box.height - r.top) / (box.height + r.height);
            }
            const clamped = Math.min(1, Math.max(0, p));
            anims.forEach((x) => (x.currentTime = clamped * a.d));
          });
        } else if (a.t === "hover") {
          reset();
          listen(source, "pointerenter", forward);
          listen(source, "pointerleave", backward);
          listen(source, "focusin", forward);
          listen(source, "focusout", backward);
        } else if (a.t === "click") {
          reset();
          let on = false;
          listen(source, "click", () => ((on = !on) ? forward() : backward()));
        }
      }
    }
    if (viewers.size && "IntersectionObserver" in view) {
      const io = new IntersectionObserver(
        (entries) => entries.forEach((e) => viewers.get(e.target)?.forEach((fn) => fn(e.isIntersecting))),
        { threshold: 0.15 }
      );
      viewers.forEach((_, el) => io.observe(el));
      cleanups.push(() => io.disconnect());
    } else viewers.forEach((fns) => fns.forEach((fn) => fn(true)));
    if (scrubs.length) {
      let frame = 0;
      const update = () => {
        frame = 0;
        scrubs.forEach((fn) => fn());
      };
      const request = () => {
        if (!frame) frame = view.requestAnimationFrame(update);
      };
      listen(scroller ?? view, "scroll", request, { passive: true });
      listen(view, "resize", request);
      update();
      cleanups.push(() => frame && view.cancelAnimationFrame(frame));
    }
  }

  const soundy = all("[data-sound]");
  const soundToggles = all('[data-js="sound-toggle"]');
  if (soundy.length || soundToggles.length) {
    const view = doc.defaultView!;
    const KEY = "fw-sound";
    let muted = false;
    try {
      muted = view.localStorage.getItem(KEY) === "off";
    } catch {
    }
    const showState = () =>
      soundToggles.forEach((t) => {
        t.setAttribute("aria-pressed", String(!muted));
        t.classList.toggle("is-muted", muted);
      });
    showState();
    soundToggles.forEach((t) =>
      listen(t, "click", (e) => {
        e.preventDefault();
        muted = !muted;
        try {
          view.localStorage.setItem(KEY, muted ? "off" : "on");
        } catch {
        }
        showState();
      })
    );
    type Sound = { on: string; src: string; v: number };
    const cache = new Map<string, HTMLAudioElement>();
    const load = (src: string) => {
      let audio = cache.get(src);
      if (!audio) {
        audio = new Audio(src);
        audio.preload = "auto";
        cache.set(src, audio);
      }
      return audio;
    };
    let active = Boolean((view.navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive);
    const all2: Sound[] = [];
    const activate = () => {
      if (active) return;
      active = true;
      all2.forEach((s) => load(s.src));
    };
    listen(doc, "pointerdown", activate, { capture: true });
    listen(doc, "keydown", activate, { capture: true });
    const play = (s: Sound) => {
      if (muted || !active) return;
      const audio = load(s.src).cloneNode() as HTMLAudioElement;
      audio.volume = Math.min(1, Math.max(0, s.v));
      void audio.play().catch(() => undefined);
    };
    const onView = new Map<Element, Sound[]>();
    for (const el of soundy) {
      let list: Sound[];
      try {
        list = JSON.parse(el.dataset.sound ?? "[]");
      } catch {
        continue;
      }
      for (const s of list) {
        all2.push(s);
        if (s.on === "click") listen(el, "click", () => play(s));
        else if (s.on === "hover") listen(el, "pointerenter", () => play(s));
        else if (s.on === "view") onView.set(el, [...(onView.get(el) ?? []), s]);
      }
    }
    if (active) all2.forEach((s) => load(s.src));
    if (onView.size && "IntersectionObserver" in view) {
      const io = new IntersectionObserver(
        (entries) =>
          entries.forEach((e) => {
            if (!e.isIntersecting) return;
            onView.get(e.target)?.forEach(play);
            io.unobserve(e.target);
          }),
        { threshold: 0.3 }
      );
      onView.forEach((_, el) => io.observe(el));
      cleanups.push(() => io.disconnect());
    }
    cleanups.push(() => cache.clear());
  }

  return () => cleanups.splice(0).forEach((fn) => fn());
}
