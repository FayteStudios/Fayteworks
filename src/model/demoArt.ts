const svg = (w: number, h: number, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`;
const f1 = (n: number) => n.toFixed(1);

export function steamingCupFrames(count = 8): string[] {
  return Array.from({ length: count }, (_, i) => {
    const wisps = [110, 150, 190]
      .map((x, k) => {
        const phase = 2 * Math.PI * (i / count + k / 3);
        const s = 16 * Math.cos(phase);
        const o = 0.28 + 0.18 * Math.sin(phase);
        return `<path d="M${x} 128 C${f1(x - s)} 108 ${f1(x + s)} 88 ${x} 68 C${f1(x - s)} 48 ${f1(x + s)} 30 ${x} 12" fill="none" stroke="#2b1d14" stroke-width="7" stroke-linecap="round" opacity="${o.toFixed(2)}"/>`;
      })
      .join("");
    return svg(
      300,
      300,
      `<ellipse cx="150" cy="268" rx="118" ry="16" fill="#2b1d14" opacity="0.1"/>` +
        `<ellipse cx="150" cy="252" rx="104" ry="18" fill="#e9dccb"/>` +
        `<path d="M222 164 q46 0 46 30 q0 30 -46 30" fill="none" stroke="#b5552b" stroke-width="13" stroke-linecap="round"/>` +
        `<path d="M78 148 H222 V196 Q222 250 150 250 Q78 250 78 196 Z" fill="#b5552b"/>` +
        `<path d="M92 170 Q96 228 138 240" fill="none" stroke="#fffaf3" stroke-width="6" stroke-linecap="round" opacity="0.35"/>` +
        `<ellipse cx="150" cy="148" rx="72" ry="13" fill="#5a2e1a"/>` +
        wisps
    );
  });
}

export const LEAF_BADGE = svg(
  120,
  120,
  `<circle cx="60" cy="60" r="56" fill="#b5552b"/><path d="M38 80 C38 46 62 32 88 32 C88 62 72 82 42 82 Z" fill="#fffaf3"/><path d="M42 80 L74 48" stroke="#b5552b" stroke-width="4" stroke-linecap="round"/>`
);

export const BREAD_BADGE = svg(
  120,
  120,
  `<circle cx="60" cy="60" r="56" fill="#b5552b"/><path d="M24 72 C24 44 96 44 96 72 C96 84 24 84 24 72 Z" fill="#fffaf3"/><path d="M44 56 L52 66 M60 52 L66 64 M76 56 L80 66" stroke="#b5552b" stroke-width="4" stroke-linecap="round"/>`
);

export const BEAN_BADGE = svg(
  120,
  120,
  `<circle cx="60" cy="60" r="56" fill="#b5552b"/><ellipse cx="60" cy="60" rx="22" ry="32" transform="rotate(30 60 60)" fill="#fffaf3"/><path d="M50 36 C66 52 54 70 70 86" fill="none" stroke="#b5552b" stroke-width="5" stroke-linecap="round"/>`
);

export function barberPoleFrames(count = 8): string[] {
  const period = 80;
  return Array.from({ length: count }, (_, i) => {
    const offset = (i / count) * period;
    const stripes: string[] = [];
    for (let k = -2; k < 8; k++) {
      const y = 40 + k * 40 - offset;
      stripes.push(`<path d="M30 ${f1(y + 30)} L90 ${f1(y)} L90 ${f1(y + 18)} L30 ${f1(y + 48)} Z" fill="${k % 2 === 0 ? "#c8322b" : "#2c5aa0"}"/>`);
    }
    return svg(
      120,
      420,
      `<defs><clipPath id="tube"><rect x="30" y="50" width="60" height="320" rx="30"/></clipPath></defs>` +
        `<rect x="30" y="50" width="60" height="320" rx="30" fill="#f3efe6"/>` +
        `<g clip-path="url(#tube)">${stripes.join("")}</g>` +
        `<rect x="30" y="50" width="60" height="320" rx="30" fill="none" stroke="#111111" stroke-opacity="0.25" stroke-width="3"/>` +
        `<rect x="40" y="58" width="8" height="300" rx="4" fill="#ffffff" opacity="0.35"/>` +
        `<rect x="22" y="20" width="76" height="36" rx="12" fill="#e8b04b"/><circle cx="60" cy="16" r="14" fill="#e8b04b"/>` +
        `<rect x="22" y="364" width="76" height="36" rx="12" fill="#e8b04b"/>`
    );
  });
}

export const SCISSORS = svg(
  220,
  220,
  `<path d="M104 110 L196 34 L204 46 Z" fill="#f3efe6"/><path d="M104 110 L196 186 L204 174 Z" fill="#f3efe6"/>` +
    `<line x1="104" y1="110" x2="70" y2="86" stroke="#e8b04b" stroke-width="10" stroke-linecap="round"/>` +
    `<line x1="104" y1="110" x2="70" y2="134" stroke="#e8b04b" stroke-width="10" stroke-linecap="round"/>` +
    `<circle cx="50" cy="74" r="24" fill="none" stroke="#e8b04b" stroke-width="10"/><circle cx="50" cy="146" r="24" fill="none" stroke="#e8b04b" stroke-width="10"/>` +
    `<circle cx="104" cy="110" r="7" fill="#111111" stroke="#e8b04b" stroke-width="3"/>`
);

export function portrait(initials: string, skin: string, hair: string): string {
  return svg(
    200,
    200,
    `<circle cx="100" cy="100" r="96" fill="#1c1c1c" stroke="#e8b04b" stroke-width="4"/>` +
      `<path d="M40 176 C48 138 152 138 160 176 Q100 204 40 176 Z" fill="#e8b04b"/>` +
      `<circle cx="100" cy="92" r="36" fill="${skin}"/>` +
      `<path d="M64 88 C64 50 136 50 136 88 C128 70 72 70 64 88 Z" fill="${hair}"/>` +
      `<title>${initials}</title>`
  );
}

export function equalizerFrames(count = 8): string[] {
  const bars = 14;
  return Array.from({ length: count }, (_, i) => {
    const rects = Array.from({ length: bars }, (_, b) => {
      const h = 18 + Math.abs(Math.sin((b * 1.7 + i * 0.9) * 0.9) * Math.cos(b * 0.45 - i * 0.6)) * 124;
      const x = 12 + b * 27;
      return `<rect x="${x}" y="${f1(150 - h)}" width="18" height="${f1(h)}" rx="9" fill="${b % 3 === 1 ? "#7b5cff" : "#ff4fa3"}"/>`;
    }).join("");
    return svg(400, 160, rects);
  });
}

export const VINYL = svg(
  300,
  300,
  `<circle cx="150" cy="150" r="146" fill="#08070f"/>` +
    [128, 116, 104, 92, 80].map((r) => `<circle cx="150" cy="150" r="${r}" fill="none" stroke="#2a2548" stroke-width="2"/>`).join("") +
    `<path d="M60 90 A110 110 0 0 1 150 40" fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="8" stroke-linecap="round"/>` +
    `<circle cx="150" cy="150" r="52" fill="#ff4fa3"/><circle cx="150" cy="150" r="52" fill="none" stroke="#7b5cff" stroke-width="6"/>` +
    `<text x="150" y="137" text-anchor="middle" font-family="Unbounded, sans-serif" font-size="14" font-weight="700" fill="#0d0b1a">NIGHT</text>` +
    `<text x="150" y="176" text-anchor="middle" font-family="Unbounded, sans-serif" font-size="14" font-weight="700" fill="#0d0b1a">TIDES</text>` +
    `<circle cx="150" cy="150" r="6" fill="#0d0b1a"/>`
);

export const TEE = svg(
  240,
  240,
  `<path d="M70 40 L100 28 Q120 44 140 28 L170 40 L210 76 L184 104 L168 92 L168 214 L72 214 L72 92 L56 104 L30 76 Z" fill="#17142b" stroke="#ff4fa3" stroke-width="4" stroke-linejoin="round"/>` +
    `<circle cx="120" cy="116" r="30" fill="#ff4fa3"/><circle cx="120" cy="116" r="8" fill="#17142b"/>` +
    `<text x="120" y="176" text-anchor="middle" font-family="Unbounded, sans-serif" font-size="13" font-weight="700" fill="#f1ecff">NIGHT TIDES</text>`
);

export const TOTE = svg(
  240,
  240,
  `<path d="M86 70 C86 30 154 30 154 70" fill="none" stroke="#f1ecff" stroke-width="8"/>` +
    `<path d="M50 70 H190 L178 214 H62 Z" fill="#ff4fa3"/>` +
    `<path d="M80 150 Q120 110 160 150" fill="none" stroke="#0d0b1a" stroke-width="8" stroke-linecap="round"/><path d="M80 172 Q120 132 160 172" fill="none" stroke="#7b5cff" stroke-width="8" stroke-linecap="round"/>`
);

export const POSTER = svg(
  240,
  240,
  `<rect x="54" y="20" width="132" height="200" rx="6" fill="#7b5cff"/>` +
    `<circle cx="120" cy="96" r="44" fill="#ff4fa3"/><rect x="54" y="120" width="132" height="100" fill="#17142b"/>` +
    `<path d="M54 150 Q87 130 120 150 T186 150" fill="none" stroke="#ff4fa3" stroke-width="5"/>` +
    `<text x="120" y="196" text-anchor="middle" font-family="Unbounded, sans-serif" font-size="14" font-weight="700" fill="#f1ecff">LOW LIGHT</text>`
);

export const BROWSER = svg(
  480,
  340,
  `<rect x="6" y="10" width="468" height="324" rx="18" fill="#15171a" opacity="0.08"/>` +
    `<rect x="0" y="0" width="468" height="324" rx="18" fill="#ffffff" stroke="#15171a" stroke-opacity="0.12" stroke-width="2"/>` +
    `<path d="M0 18 A18 18 0 0 1 18 0 H450 A18 18 0 0 1 468 18 V40 H0 Z" fill="#eef1f6"/>` +
    `<circle cx="22" cy="20" r="6" fill="#ff5f57"/><circle cx="42" cy="20" r="6" fill="#febc2e"/><circle cx="62" cy="20" r="6" fill="#28c840"/>` +
    `<rect x="120" y="11" width="228" height="18" rx="9" fill="#ffffff"/>` +
    `<rect x="28" y="66" width="190" height="22" rx="6" fill="#15171a"/><rect x="28" y="96" width="150" height="22" rx="6" fill="#15171a"/>` +
    `<rect x="28" y="132" width="170" height="9" rx="4" fill="#15171a" opacity="0.3"/><rect x="28" y="148" width="140" height="9" rx="4" fill="#15171a" opacity="0.3"/>` +
    `<rect x="28" y="172" width="86" height="28" rx="14" fill="#2f6bff"/>` +
    `<rect x="250" y="62" width="190" height="140" rx="14" fill="#2f6bff"/><circle cx="345" cy="132" r="38" fill="#ffffff" opacity="0.35"/>` +
    [28, 172, 316].map((x) => `<rect x="${x}" y="226" width="124" height="74" rx="10" fill="#eef1f6"/><rect x="${x + 12}" y="240" width="60" height="8" rx="4" fill="#15171a" opacity="0.5"/><rect x="${x + 12}" y="256" width="96" height="6" rx="3" fill="#15171a" opacity="0.2"/>`).join("")
);

export const EDITOR = svg(
  560,
  380,
  `<rect x="0" y="0" width="560" height="380" rx="18" fill="#171a23" stroke="#ffffff" stroke-opacity="0.1" stroke-width="2"/>` +
    `<rect x="0" y="0" width="560" height="32" rx="18" fill="#1f2330"/><rect x="0" y="16" width="560" height="16" fill="#1f2330"/>` +
    `<circle cx="20" cy="16" r="6" fill="#7c5cff"/><rect x="36" y="11" width="80" height="10" rx="5" fill="#ffffff" opacity="0.25"/><rect x="480" y="9" width="66" height="14" rx="7" fill="#7c5cff"/>` +
    `<rect x="12" y="44" width="92" height="232" rx="10" fill="#1f2330"/>` +
    [0, 1, 2, 3, 4, 5].map((i) => `<rect x="22" y="${58 + i * 34}" width="72" height="24" rx="6" fill="#ffffff" opacity="${i === 1 ? 0.22 : 0.08}"/>`).join("") +
    `<rect x="116" y="44" width="318" height="232" rx="10" fill="#f6f3ee"/>` +
    `<rect x="136" y="64" width="150" height="16" rx="5" fill="#1d1b18"/><rect x="136" y="88" width="120" height="16" rx="5" fill="#1d1b18"/>` +
    `<rect x="136" y="116" width="130" height="7" rx="3" fill="#1d1b18" opacity="0.3"/><rect x="136" y="130" width="110" height="7" rx="3" fill="#1d1b18" opacity="0.3"/>` +
    `<rect x="136" y="150" width="64" height="22" rx="11" fill="#7c5cff"/>` +
    `<rect x="300" y="60" width="118" height="118" rx="14" fill="#7c5cff"/><circle cx="359" cy="119" r="34" fill="#ffffff" opacity="0.35"/>` +
    `<rect x="296" y="56" width="126" height="126" rx="16" fill="none" stroke="#2f9bff" stroke-width="3" stroke-dasharray="6 5"/>` +
    [136, 238, 340].map((x) => `<rect x="${x}" y="196" width="86" height="62" rx="8" fill="#ffffff"/>`).join("") +
    `<rect x="446" y="44" width="102" height="232" rx="10" fill="#1f2330"/>` +
    [0, 1, 2, 3, 4].map((i) => `<rect x="456" y="${60 + i * 40}" width="40" height="7" rx="3" fill="#ffffff" opacity="0.3"/><rect x="456" y="${72 + i * 40}" width="82" height="16" rx="5" fill="#ffffff" opacity="0.1"/>`).join("") +
    `<rect x="12" y="288" width="536" height="80" rx="10" fill="#1f2330"/>` +
    [0, 1, 2].map((i) => `<rect x="22" y="${300 + i * 22}" width="60" height="8" rx="4" fill="#ffffff" opacity="0.3"/><line x1="100" y1="${304 + i * 22}" x2="536" y2="${304 + i * 22}" stroke="#ffffff" stroke-opacity="0.08" stroke-width="2"/>`).join("") +
    [[140, 0], [300, 0], [220, 1], [420, 1], [160, 2], [360, 2], [500, 2]].map(([x, r]) => `<rect x="${x - 6}" y="${298 + r * 22}" width="12" height="12" rx="2" transform="rotate(45 ${x} ${304 + r * 22})" fill="#7c5cff"/>`).join("") +
    `<line x1="260" y1="292" x2="260" y2="364" stroke="#ff5d5d" stroke-width="2"/>`
);

export function bounceFrames(color = "#7c5cff"): string[] {
  const ys = [30, 58, 96, 140, 140, 96, 58];
  const squash = [1, 1, 1.04, 1.28, 1.28, 1.04, 1];
  return ys.map((y, i) => {
    const rx = 26 * squash[i];
    const ry = 26 / squash[i];
    return svg(200, 200, `<ellipse cx="100" cy="190" rx="${f1(18 + (y - 30) / 5)}" ry="5" fill="#000000" opacity="0.25"/><ellipse cx="100" cy="${f1(y + 26 - ry + 18)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="${color}"/>`);
  });
}

export const SPARKLE = svg(200, 200, `<path d="M100 8 C108 72 128 92 192 100 C128 108 108 128 100 192 C92 128 72 108 8 100 C72 92 92 72 100 8 Z" fill="#7c5cff"/><circle cx="100" cy="100" r="10" fill="#ffffff" opacity="0.7"/>`);
