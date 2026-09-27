const ITERATIONS = 400_000;

export const PASSWORD_RULES = [
  { label: "At least 10 characters", ok: (pw: string) => pw.length >= 10 },
  { label: "A number", ok: (pw: string) => /\d/.test(pw) },
  { label: "A symbol (! ? # - …)", ok: (pw: string) => /[^A-Za-z0-9\s]/.test(pw) }
];

export const strongPassword = (pw: string) => pw.trim().length >= 16 || PASSWORD_RULES.every((r) => r.ok(pw));

const WORDS = ["maple", "harbor", "lantern", "river", "copper", "meadow", "falcon", "velvet", "canyon", "ember", "willow", "comet", "garnet", "harvest", "island", "juniper", "kettle", "lagoon", "marble", "nectar", "orchard", "pepper", "quartz", "saffron", "thistle", "violet", "walnut", "zephyr", "anchor", "breeze", "cedar", "dune"];
const SYMBOLS = "!?#*+";

export function suggestPassword(): string {
  const pick = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
  const word = () => {
    const w = WORDS[pick(WORDS.length)];
    return w[0].toUpperCase() + w.slice(1);
  };
  return `${word()}-${word()}-${10 + pick(90)}-${word()}${SYMBOLS[pick(SYMBOLS.length)]}`;
}

const b64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

export async function encryptPage(html: string, password: string): Promise<{ s: string; i: string; c: string; n: number }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(html)));
  return { s: b64(salt), i: b64(iv), c: b64(cipher), n: ITERATIONS };
}

function unlock() {
  const data = JSON.parse(document.getElementById("fw-locked-data")!.textContent!) as { s: string; i: string; c: string; n: number };
  const bytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const form = document.querySelector<HTMLFormElement>(".fw-lock")!;
  const error = document.querySelector<HTMLElement>(".fw-lock-error")!;
  const decrypt = async (password: string) => {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: bytes(data.s), iterations: data.n, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(data.i) }, key, bytes(data.c)));
  };
  const open = (html: string, password: string) => {
    try {
      const saved: string[] = JSON.parse(sessionStorage.getItem("fw-pw") ?? "[]");
      if (!saved.includes(password)) sessionStorage.setItem("fw-pw", JSON.stringify([...saved, password].slice(-5)));
    } catch {
    }
    document.body.innerHTML = html;
    document.body.querySelectorAll("script").forEach((old) => {
      const s = document.createElement("script");
      for (const a of Array.from(old.attributes)) s.setAttribute(a.name, a.value);
      s.textContent = old.textContent;
      old.replaceWith(s);
    });
    document.documentElement.removeAttribute("data-fw-locked");
    document.dispatchEvent(new Event("fw:unlocked"));
  };
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const password = form.querySelector("input")!.value;
    const button = form.querySelector("button")!;
    button.disabled = true;
    error.hidden = true;
    decrypt(password)
      .then((html) => open(html, password))
      .catch(() => {
        error.hidden = false;
        button.disabled = false;
      });
  });
  let saved: string[] = [];
  try {
    saved = JSON.parse(sessionStorage.getItem("fw-pw") ?? "[]");
  } catch {
    saved = [];
  }
  saved.reduce<Promise<void>>((p, pw) => p.catch(() => decrypt(pw).then((html) => open(html, pw))), Promise.reject()).catch(() => undefined);
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot", "'": "#39" }[c]};`);

export async function lockedBody(html: string, password: string, siteName: string, hint: string): Promise<string> {
  const data = await encryptPage(html, password);
  return `<main class="fw-locked">
  <form class="fw-lock">
    <p class="fw-lock-site">${escape(siteName)}</p>
    <h1 class="fw-lock-title">This page is private</h1>
    <p class="fw-lock-hint">${escape(hint || "Enter the password to see it.")}</p>
    <input type="password" name="password" autocomplete="current-password" aria-label="Password" required autofocus>
    <button type="submit" class="b-button b-button--solid b-button--m">Open</button>
    <p class="fw-lock-error" role="alert" hidden>That password didn't work.</p>
  </form>
</main>
<script type="application/json" id="fw-locked-data">${JSON.stringify(data)}</script>
<script>(${unlock.toString()})();</script>`;
}
