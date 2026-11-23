// Generator for Quorum "Thinking" mode placeholder card art.
// Placeholder Thinking-mode card art (until the commissioned artwork): writes seven SVGs to
// public/thinking/. Shared frame + one symbol per card. Run: node scripts/thinking-cards.mjs
import { writeFileSync, mkdirSync } from "node:fs";

const OUT = new URL("../public/thinking", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const K = {
  ground: "#1f1d3d",
  deep: "#13122a",
  felt: "#2b2858",
  mari: "#e0a43a",
  bright: "#f2c46b",
  peri: "#8b90e6",
  bone: "#eceaf4",
  coral: "#c4524a",
};
// Stroke weights shared by every card.
const SW = { frame: 2.5, frameThin: 1, sym: 3, symMid: 2, fine: 1.25 };

const W = 356, H = 516, CX = 178, CY = 228; // symbol centre
const HALO = 96;
const SC = 1.1; // symbol + halo scale about the centre
const HR = HALO * SC; // rendered halo radius
const WIN = "M36,398V186A142,142 0 0 1 320,186V398Z";

const f = (n) => (Math.round(n * 10) / 10).toString();

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// four-point sparkle
function star4(cx, cy, r, ri = r * 0.3) {
  const d = ri / Math.SQRT2;
  return `M${f(cx)},${f(cy - r)}L${f(cx + d)},${f(cy - d)}L${f(cx + r)},${f(cy)}L${f(cx + d)},${f(cy + d)}L${f(cx)},${f(cy + r)}L${f(cx - d)},${f(cy + d)}L${f(cx - r)},${f(cy)}L${f(cx - d)},${f(cy - d)}Z`;
}
function starN(cx, cy, n, ro, ri, rot = -90) {
  let d = "";
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? ri : ro;
    const a = ((rot + (i * 180) / n) * Math.PI) / 180;
    d += `${i ? "L" : "M"}${f(cx + r * Math.cos(a))},${f(cy + r * Math.sin(a))}`;
  }
  return d + "Z";
}
const pol = (cx, cy, r, deg) => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};
const inWindow = (x, y, m = 8) =>
  y > 186 ? x > 36 + m && x < 320 - m && y < 398 - m : Math.hypot(x - 178, y - 186) < 142 - m;

// ---------- shared frame ----------
function face(id, { seed, symbol, emblem, defs = "", haloFill, haloRing }) {
  const r = rng(seed);
  // rays
  let rays = "";
  for (let i = 0; i < 64; i++) {
    const deg = i * (360 / 64);
    const [x1, y1] = pol(CX, CY, HR + 16, deg);
    const [x2, y2] = pol(CX, CY, 300, deg);
    rays += `M${f(x1)},${f(y1)}L${f(x2)},${f(y2)}`;
  }
  // star field
  let dots = "";
  let n = 0, guard = 0;
  while (n < 34 && guard++ < 2000) {
    const x = 40 + r() * 276, y = 48 + r() * 346;
    if (!inWindow(x, y) || Math.hypot(x - CX, y - CY) < HR + 18) continue;
    const rr = 0.6 + r() * 1.1;
    const op = 0.35 + r() * 0.5;
    dots += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(rr)}" opacity="${f(op * 100) / 100}"/>`;
    n++;
  }
  // a few sparkles
  let sparks = "";
  n = 0; guard = 0;
  while (n < 4 && guard++ < 2000) {
    const x = 48 + r() * 260, y = 56 + r() * 330;
    if (!inWindow(x, y, 16) || Math.hypot(x - CX, y - CY) < HR + 26) continue;
    sparks += `<path d="${star4(x, y, 4 + r() * 3.5)}"/>`;
    n++;
  }
  // halo ticks
  let ticks = "", majors = "";
  for (let i = 0; i < 72; i++) {
    const deg = i * 5;
    if (i % 6 === 0) {
      const [a, b] = pol(CX, CY, HALO + 1, deg), [c, d] = pol(CX, CY, HALO + 9, deg);
      majors += `M${f(a)},${f(b)}L${f(c)},${f(d)}`;
    } else {
      const [a, b] = pol(CX, CY, HALO + 2, deg), [c, d] = pol(CX, CY, HALO + 6, deg);
      ticks += `M${f(a)},${f(b)}L${f(c)},${f(d)}`;
    }
  }
  // side rails: small dots
  let rail = "";
  for (let y = 70; y <= 380; y += 22) {
    rail += `<circle cx="25.5" cy="${y}" r="1.3"/><circle cx="330.5" cy="${y}" r="1.3"/>`;
  }
  const railDiamonds = [126, 226, 326]
    .map((y) => `<path d="M25.5,${y - 5}L28.5,${y}L25.5,${y + 5}L22.5,${y}Z"/><path d="M330.5,${y - 5}L333.5,${y}L330.5,${y + 5}L327.5,${y}Z"/>`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 356 516" width="356" height="516">
<defs>
<radialGradient id="${id}-bg" cx="50%" cy="44%" r="72%"><stop offset="0" stop-color="${K.ground}"/><stop offset="1" stop-color="${K.deep}"/></radialGradient>
<radialGradient id="${id}-win" cx="${CX}" cy="${CY}" r="210" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${K.felt}"/><stop offset=".62" stop-color="${K.ground}"/><stop offset="1" stop-color="${K.deep}"/></radialGradient>
<radialGradient id="${id}-halo" cx="${CX}" cy="${CY - 10}" r="${HALO + 10}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${K.peri}" stop-opacity=".30"/><stop offset=".75" stop-color="${K.peri}" stop-opacity=".12"/><stop offset="1" stop-color="${K.peri}" stop-opacity=".05"/></radialGradient>
<clipPath id="${id}-wc"><path d="${WIN}"/></clipPath>
<clipPath id="${id}-hc"><circle cx="${CX}" cy="${CY}" r="${HALO}"/></clipPath>
${defs}
</defs>
<rect width="356" height="516" fill="url(#${id}-bg)"/>
<path d="${WIN}" fill="url(#${id}-win)"/>
<g clip-path="url(#${id}-wc)">
<path d="${rays}" stroke="${K.mari}" stroke-width="1" opacity=".13"/>
<g fill="${K.bone}">${dots}</g>
<g fill="${K.bright}" opacity=".85">${sparks}</g>
</g>
<g transform="translate(${CX},${CY}) scale(${SC}) translate(${-CX},${-CY})">
<circle cx="${CX}" cy="${CY}" r="${HALO}" fill="${haloFill || `url(#${id}-halo)`}"/>
${haloRing || `<circle cx="${CX}" cy="${CY}" r="${HALO}" fill="none" stroke="${K.mari}" stroke-width="1.5"/>`}
<circle cx="${CX}" cy="${CY}" r="${HALO + 11}" fill="none" stroke="${K.mari}" stroke-width=".75" opacity=".55"/>
<path d="${ticks}" stroke="${K.mari}" stroke-width="1" opacity=".5"/>
<path d="${majors}" stroke="${K.bright}" stroke-width="1.5" stroke-linecap="round"/>
<g stroke-linecap="round" stroke-linejoin="round">
${symbol}
</g>
</g>
<path d="${WIN}" fill="none" stroke="${K.mari}" stroke-width="1.75"/>
<path d="M42,392V186A136,136 0 0 1 314,186V392Z" fill="none" stroke="${K.mari}" stroke-width=".75" opacity=".5"/>
<g fill="${K.mari}" opacity=".7">${rail}</g>
<g fill="${K.mari}">${railDiamonds}</g>
<g fill="${K.bright}">
<path d="${star4(50, 50, 10, 3)}"/><path d="${star4(306, 50, 10, 3)}"/>
</g>
<g fill="${K.mari}" opacity=".7"><circle cx="72" cy="36" r="1.3"/><circle cx="36" cy="74" r="1.3"/><circle cx="284" cy="36" r="1.3"/><circle cx="320" cy="74" r="1.3"/><circle cx="90" cy="28" r="1"/><circle cx="266" cy="28" r="1"/></g>
${bottomBand(emblem)}
<rect x="7" y="7" width="342" height="502" rx="12" fill="none" stroke="${K.mari}" stroke-width="${SW.frame}"/>
<rect x="15" y="15" width="326" height="486" rx="6" fill="none" stroke="${K.mari}" stroke-width="${SW.frameThin}"/>
${corners()}
</svg>
`;
}

function corners() {
  const one = (x, y, sx, sy) =>
    `<path d="M${x},${y + sy * 16}A16,16 0 0 0 ${x + sx * 16},${y}" transform="" fill="none"/><circle cx="${x + sx * 6}" cy="${y + sy * 6}" r="1.8" stroke="none" fill="${K.bright}"/>`;
  // arcs need sweep matching orientation; draw with explicit paths
  return `<g stroke="${K.mari}" stroke-width="1" fill="none">
<path d="M15,31A16,16 0 0 0 31,15"/><path d="M325,15A16,16 0 0 0 341,31"/><path d="M341,485A16,16 0 0 0 325,501"/><path d="M31,501A16,16 0 0 0 15,485"/>
</g>
<g fill="${K.bright}"><circle cx="21" cy="21" r="1.8"/><circle cx="335" cy="21" r="1.8"/><circle cx="335" cy="495" r="1.8"/><circle cx="21" cy="495" r="1.8"/></g>`;
}

function bottomBand(emblem) {
  const y = 452;
  const side = (s) => {
    // s = -1 left, 1 right ; build from medallion outward
    const x0 = CX + s * 36;
    const p = (x) => f(x);
    return `<path d="M${p(x0)},${y}H${p(CX + s * 128)}M${p(x0 + s * 4)},${y - 8}H${p(CX + s * 96)}M${p(x0 + s * 4)},${y + 8}H${p(CX + s * 96)}"/>
<path d="M${p(CX + s * 128)},${y - 5}L${p(CX + s * 134)},${y}L${p(CX + s * 128)},${y + 5}L${p(CX + s * 122)},${y}Z" fill="${K.mari}"/>`;
  };
  return `<rect x="36" y="410" width="284" height="84" rx="3" fill="${K.deep}" fill-opacity=".45" stroke="${K.mari}" stroke-width="1.25"/>
<rect x="41" y="415" width="274" height="74" rx="2" fill="none" stroke="${K.mari}" stroke-width=".6" opacity=".5"/>
<g stroke="${K.mari}" stroke-width="1.25" fill="none" stroke-linecap="round">${side(-1)}${side(1)}</g>
<g fill="${K.bone}" opacity=".6"><circle cx="${CX - 112}" cy="${y - 8}" r="1.2"/><circle cx="${CX - 112}" cy="${y + 8}" r="1.2"/><circle cx="${CX + 112}" cy="${y - 8}" r="1.2"/><circle cx="${CX + 112}" cy="${y + 8}" r="1.2"/></g>
<circle cx="${CX}" cy="${y}" r="30" fill="${K.deep}" stroke="${K.mari}" stroke-width="2"/>
<circle cx="${CX}" cy="${y}" r="25" fill="none" stroke="${K.mari}" stroke-width=".75" opacity=".7"/>
<g transform="translate(${CX},${y})" stroke-linecap="round" stroke-linejoin="round">${emblem}</g>`;
}

// ---------- symbols ----------

function beginner() {
  const id = "tb";
  const ground = "M70,272Q178,236 286,272";
  const symbol = `
<g clip-path="url(#${id}-hc)">
<path d="${ground}V340H70Z" fill="${K.deep}" opacity=".85"/>
<g fill="${K.peri}" opacity=".55"><circle cx="128" cy="290" r="1.4"/><circle cx="144" cy="310" r="1.1"/><circle cx="214" cy="296" r="1.4"/><circle cx="226" cy="314" r="1.1"/><circle cx="200" cy="304" r="1"/><circle cx="152" cy="282" r="1"/><circle cx="114" cy="306" r="1"/><circle cx="240" cy="290" r="1"/></g>
<g stroke="${K.peri}" stroke-width="${SW.symMid}" fill="none">
<path d="M178,298C177,309 172,317 163,324"/>
<path d="M178,298C180,311 188,317 198,321"/>
<path d="M173,312C167,315 160,314 153,309"/>
<path d="M185,313C191,318 194,325 193,333"/>
<path d="M165,322C162,328 162,333 164,338"/>
</g>
<path d="${ground}" fill="none" stroke="${K.mari}" stroke-width="${SW.sym}"/>
</g>
<ellipse cx="178" cy="290" rx="13" ry="9" fill="${K.mari}" stroke="${K.bright}" stroke-width="1.5"/>
<path d="M167,287Q178,293 189,287" fill="none" stroke="${K.deep}" stroke-width="1.5"/>
<path d="M178,282C175,262 182,236 178,206" fill="none" stroke="${K.mari}" stroke-width="3.5"/>
<path d="M178,212C160,180 134,172 112,180C124,204 154,218 178,212Z" fill="${K.mari}" stroke="${K.bright}" stroke-width="${SW.symMid}"/>
<path d="M178,204C188,168 220,150 250,154C244,186 210,210 178,204Z" fill="${K.bright}" stroke="${K.bright}" stroke-width="${SW.symMid}"/>
<path d="M176,210Q148,194 118,181" fill="none" stroke="${K.deep}" stroke-width="1.5"/>
<path d="M180,202Q214,180 245,157" fill="none" stroke="${K.deep}" stroke-width="1.5"/>
<path d="M178,206C171,194 172,180 179,168C187,180 187,194 178,206Z" fill="${K.bone}" stroke="${K.bright}" stroke-width="1.5"/>
<g fill="${K.peri}"><path d="${star4(234, 138, 7, 2)}"/><path d="${star4(122, 154, 5, 1.6)}"/></g>
<g fill="${K.bone}"><circle cx="252" cy="174" r="1.6"/><circle cx="206" cy="146" r="1.3"/></g>`;
  // emblem: dawn — half sun on a line
  const emblem = `<path d="M-12,5H12" stroke="${K.mari}" stroke-width="1.5"/>
<path d="M-8,4A8,8 0 0 1 8,4Z" fill="${K.bright}"/>
<path d="M0,-6V-11M-7,-3.5L-10.5,-7M7,-3.5L10.5,-7" stroke="${K.bright}" stroke-width="1.5"/>`;
  return face(id, { seed: 11, symbol, emblem });
}

function maker() {
  const id = "tm";
  const anvil =
    "M94,244C116,238 128,236 140,236H250V256H224C210,258 204,266 204,276V280C204,290 214,296 230,300V312H126V300C142,296 152,290 152,280V276C152,266 146,258 132,256C118,254 106,251 94,244Z";
  // sparks radiate from the strike point
  const sx = 162, sy = 234;
  let sparkLines = "";
  [-168, -146, -126, -104, -80, -58, -36, -14].forEach((a, i) => {
    const r0 = 10 + (i % 2) * 3, r1 = 24 + (i % 3) * 7;
    const [x1, y1] = pol(sx, sy, r0, a), [x2, y2] = pol(sx, sy, r1, a);
    sparkLines += `M${f(x1)},${f(y1)}L${f(x2)},${f(y2)}`;
  });
  const symbol = `
<path d="M104,312H252" stroke="${K.mari}" stroke-width="${SW.symMid}"/>
<path d="M114,318H242" stroke="${K.mari}" stroke-width="1" opacity=".6"/>
<path d="${anvil}" fill="${K.deep}" stroke="${K.mari}" stroke-width="${SW.sym}"/>
<path d="M142,241H245" stroke="${K.bone}" stroke-width="2" opacity=".85"/>
<path d="M104,244C118,241 128,240 138,240" stroke="${K.bone}" stroke-width="1.5" opacity=".6" fill="none"/>
<path d="M160,282H196" stroke="${K.peri}" stroke-width="1.5" opacity=".8"/>
<path d="${sparkLines}" stroke="${K.bright}" stroke-width="2" fill="none"/>
<g fill="${K.bright}"><path d="${star4(130, 204, 7, 2)}"/><path d="${star4(198, 212, 5, 1.6)}"/></g>
<g fill="${K.bone}"><circle cx="142" cy="196" r="1.8"/><circle cx="118" cy="222" r="1.5"/><circle cx="208" cy="226" r="1.4"/><circle cx="150" cy="214" r="1.2"/></g>
<g fill="${K.peri}"><circle cx="124" cy="190" r="1.4"/><circle cx="188" cy="198" r="1.3"/></g>
<g transform="translate(188,164) rotate(-45)">
<path d="M-4.5,10L-5.5,86Q0,93 5.5,86L4.5,10Z" fill="${K.mari}" stroke="${K.bright}" stroke-width="1.5"/>
<path d="M-5,66H5M-5.3,72H5.3M-5.4,78H5.4" stroke="${K.deep}" stroke-width="1.5"/>
<path d="M-32,-12H12L30,-5V5L12,12H-32Z" fill="${K.bone}" stroke="${K.mari}" stroke-width="${SW.sym}"/>
<path d="M-32,-12V12" stroke="${K.mari}" stroke-width="${SW.sym}"/>
<rect x="-7" y="-14" width="14" height="28" rx="2" fill="${K.mari}" stroke="${K.bright}" stroke-width="1.5"/>
<path d="M-24,-6H-12M-24,0H-12M-24,6H-12" stroke="${K.peri}" stroke-width="1.25" opacity=".9"/>
</g>`;
  // emblem: cog
  let cog = "";
  for (let i = 0; i < 8; i++) {
    const a = i * 45;
    const [x1, y1] = pol(0, 0, 8, a), [x2, y2] = pol(0, 0, 12, a);
    cog += `M${f(x1)},${f(y1)}L${f(x2)},${f(y2)}`;
  }
  const emblem = `<path d="${cog}" stroke="${K.bright}" stroke-width="3.2" stroke-linecap="butt"/>
<circle r="8.5" fill="${K.bright}"/><circle r="3.5" fill="${K.deep}"/>`;
  return face(id, { seed: 23, symbol, emblem });
}

function collector() {
  const id = "tc";
  const card = (cx, cy, rot, fill, stroke, lines) => {
    let l = "";
    if (lines) {
      l += `<path d="M-40,-18H40" stroke="${K.mari}" stroke-width="2"/>`;
      for (let y = -8; y <= 22; y += 9) l += `<path d="M-40,${y}H${y === 22 ? 6 : 40}" stroke="${K.peri}" stroke-width="1.5"/>`;
    }
    return `<g transform="translate(${cx},${cy}) rotate(${rot})"><rect x="-48" y="-32" width="96" height="64" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="${SW.symMid}"/>${l}</g>`;
  };
  const lx = 206, ly = 204, lr = 42;
  const pts = [
    [lx - 26, ly + 16],
    [lx - 12, ly - 2],
    [lx + 2, ly + 8],
    [lx + 14, ly - 16],
    [lx + 26, ly - 8],
  ];
  const chart = pts.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join("");
  const symbol = `
<defs><clipPath id="${id}-lens"><circle cx="${lx}" cy="${ly}" r="${lr}"/></clipPath></defs>
${card(150, 276, -12, K.felt, K.bone, false)}
${card(160, 262, 6, K.felt, K.bone, false)}
${card(154, 248, -4, K.bone, K.mari, true)}
<g transform="translate(${lx},${ly}) rotate(45)">
<rect x="${lr + 2}" y="-6" width="16" height="12" rx="2" fill="${K.mari}" stroke="${K.bright}" stroke-width="1.5"/>
<path d="M${lr + 18},-8.5H${lr + 62}Q${lr + 68},-8.5 ${lr + 68},-2.5V2.5Q${lr + 68},8.5 ${lr + 62},8.5H${lr + 18}Z" fill="${K.mari}" stroke="${K.bright}" stroke-width="1.5"/>
<path d="M${lr + 30},-8V8M${lr + 36},-8V8" stroke="${K.deep}" stroke-width="1.5"/>
</g>
<circle cx="${lx}" cy="${ly}" r="${lr}" fill="${K.deep}" opacity=".7"/>
<g clip-path="url(#${id}-lens)">
<circle cx="${lx}" cy="${ly}" r="${lr}" fill="${K.peri}" opacity=".18"/>
<path d="M${lx - 42},${ly + 22}H${lx + 42}M${lx - 42},${ly}H${lx + 42}M${lx - 42},${ly - 22}H${lx + 42}" stroke="${K.peri}" stroke-width=".75" opacity=".45"/>
<path d="M${lx - 22},${ly - 42}V${ly + 42}M${lx},${ly - 42}V${ly + 42}M${lx + 22},${ly - 42}V${ly + 42}" stroke="${K.peri}" stroke-width=".75" opacity=".45"/>
<path d="${chart}" fill="none" stroke="${K.peri}" stroke-width="${SW.symMid}"/>
${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i === 3 ? 4.5 : 3.2}" fill="${i === 3 ? K.bright : K.bone}"/>`).join("")}
<path d="M${lx - 30},${ly - 10}A32,32 0 0 1 ${lx - 6},${ly - 31}" fill="none" stroke="${K.bone}" stroke-width="2.5" opacity=".75"/>
</g>
<circle cx="${lx}" cy="${ly}" r="${lr}" fill="none" stroke="${K.mari}" stroke-width="6"/>
<circle cx="${lx}" cy="${ly}" r="${lr + 3}" fill="none" stroke="${K.bright}" stroke-width="1.25"/>
<circle cx="${lx}" cy="${ly}" r="${lr - 3.5}" fill="none" stroke="${K.bright}" stroke-width="1"/>
<g fill="${K.bone}"><circle cx="128" cy="176" r="2.2"/><circle cx="112" cy="200" r="1.6"/><circle cx="142" cy="156" r="1.4"/></g>
<g fill="${K.peri}"><circle cx="146" cy="186" r="2"/><circle cx="118" cy="226" r="1.4"/><path d="${star4(150, 150, 6, 1.8)}"/></g>`;
  // emblem: 3x3 grid of dots, centre one bright
  let g = "";
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++)
      g += `<circle cx="${i * 7}" cy="${j * 7}" r="${i === 0 && j === 0 ? 3 : 2.2}" fill="${i === 0 && j === 0 ? K.bright : K.mari}"/>`;
  return face(id, { seed: 37, symbol, emblem: g });
}

function contrarian() {
  const id = "tx";
  const arrow = (y, dir, color, light) => {
    // dir = -1 head on left, +1 head on right
    const head = CX + dir * 84, tail = CX - dir * 84;
    const hb = head - dir * 26; // head base
    const h = `M${head},${y}L${hb - dir * 2},${y - 13}L${hb + dir * 4},${y}L${hb - dir * 2},${y + 13}Z`;
    const t = tail;
    const vanes = [0, 12]
      .map((o) => {
        const a = t + dir * o;
        return `M${a + dir * 26},${y}L${a + dir * 14},${y - 11}H${a}L${a + dir * 10},${y}L${a},${y + 11}H${a + dir * 14}Z`;
      })
      .join("");
    return `<path d="M${hb},${y}H${t + dir * 6}" stroke="${color}" stroke-width="3.5"/>
<path d="${vanes}" fill="${color}" stroke="${light}" stroke-width="1.25"/>
<path d="${h}" fill="${color}" stroke="${light}" stroke-width="1.5"/>`;
  };
  const haloFill = `url(#${id}-split)`;
  const defs = `<linearGradient id="${id}-split" x1="82" y1="0" x2="274" y2="0" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${K.coral}" stop-opacity=".24"/><stop offset=".5" stop-color="${K.coral}" stop-opacity=".07"/><stop offset=".5" stop-color="${K.peri}" stop-opacity=".09"/><stop offset="1" stop-color="${K.peri}" stop-opacity=".26"/></linearGradient>`;
  const haloRing = `<path d="M${CX},${CY - HALO}A${HALO},${HALO} 0 0 0 ${CX},${CY + HALO}" fill="none" stroke="${K.coral}" stroke-width="1.75"/>
<path d="M${CX},${CY - HALO}A${HALO},${HALO} 0 0 1 ${CX},${CY + HALO}" fill="none" stroke="${K.mari}" stroke-width="1.75"/>`;
  const symbol = `
<path d="M${CX},${CY - HALO - 4}V${CY + HALO + 4}" stroke="${K.bone}" stroke-width="1.25" stroke-dasharray="2 5" opacity=".7"/>
${arrow(CY - 26, -1, K.coral, K.bone)}
${arrow(CY + 26, 1, K.mari, K.bright)}
<path d="M${CX},${CY - 11}L${CX + 9},${CY}L${CX},${CY + 11}L${CX - 9},${CY}Z" fill="${K.deep}" stroke="${K.bone}" stroke-width="1.75"/>
<circle cx="${CX}" cy="${CY}" r="2.6" fill="${K.bone}"/>
<path d="M${CX},${CY - HALO - 22}l7,10h-14z" fill="${K.coral}" stroke="${K.bone}" stroke-width="1"/>
<path d="M${CX},${CY + HALO + 22}l7,-10h-14z" fill="${K.mari}" stroke="${K.bright}" stroke-width="1"/>
<g fill="${K.bone}" opacity=".8"><circle cx="126" cy="164" r="1.6"/><circle cx="230" cy="292" r="1.6"/></g>
<g fill="${K.peri}"><path d="${star4(236, 168, 6, 1.8)}"/></g>
<g fill="${K.coral}"><path d="${star4(120, 288, 6, 1.8)}"/></g>`;
  const emblem = `<path d="M-2,-9L-13,0L-2,9Z" fill="${K.coral}"/><path d="M2,-9L13,0L2,9Z" fill="${K.bright}"/>`;
  return face(id, { seed: 53, symbol, emblem, defs, haloFill, haloRing });
}

function heart() {
  const id = "th";
  const heartPath =
    "M178,298C158,282 126,258 126,226C126,204 141,190 157,190C167,190 174,196 178,205C182,196 189,190 199,190C215,190 230,204 230,226C230,258 198,282 178,298Z";
  // One hand, local coords: wrist bottom centre at 0,0, fingers up, thumb on the outer (left) side.
  // Drawn as a union of simple parts: a stroked under-layer then an unstroked fill gives one clean outline.
  const parts = [
    `<path d="M-13,0V-14C-16,-22 -19,-30 -19,-40V-50H19V-36C19,-26 16,-18 13,-12V0Z"/>`, // palm + wrist
    `<rect x="-19.5" y="-80" width="9.5" height="40" rx="4.75"/>`, // index
    `<rect x="-9.5" y="-86" width="9.5" height="46" rx="4.75"/>`, // middle
    `<rect x="0.5" y="-82" width="9.5" height="42" rx="4.75"/>`, // ring
    `<rect x="10.5" y="-72" width="9" height="32" rx="4.5"/>`, // little
    `<rect x="-5" y="-38" width="10" height="34" rx="5" transform="translate(-17,-20) rotate(-38)"/>`, // thumb
  ].join("");
  const handGeo = (fill, stroke, sw) =>
    `<g fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round">${parts}</g>`;
  const oneHand = `${handGeo(K.bone, K.bone, 4.5)}${handGeo(K.felt, "none", 0)}
<path d="M-10,-50V-66M0,-50V-70M10.25,-50V-64" stroke="${K.bone}" stroke-width="1.25" opacity=".8"/>
<path d="M-12,-36C-6,-31 6,-31 12,-36" stroke="${K.bone}" stroke-width="1.25" fill="none" opacity=".55"/>
<path d="M-15,-4H15L21,16H-21Z" fill="${K.deep}" stroke="${K.peri}" stroke-width="1.5"/><path d="M-15,-4H15" stroke="${K.mari}" stroke-width="2"/>`;
  const leftT = "translate(124,350) rotate(30)";
  let rays = "";
  for (let i = 0; i < 18; i++) {
    const a = -90 + (i - 8.5) * 11;
    const [x1, y1] = pol(178, 240, 76, a), [x2, y2] = pol(178, 240, i % 2 ? 90 : 100, a);
    rays += `M${f(x1)},${f(y1)}L${f(x2)},${f(y2)}`;
  }
  const symbol = `
<defs>
<radialGradient id="${id}-hg" cx="160" cy="214" r="96" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${K.bright}"/><stop offset="1" stop-color="${K.mari}"/></radialGradient>
<radialGradient id="${id}-glow" cx="178" cy="236" r="70" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${K.bright}" stop-opacity=".35"/><stop offset="1" stop-color="${K.bright}" stop-opacity="0"/></radialGradient>
</defs>
<circle cx="178" cy="236" r="70" fill="url(#${id}-glow)"/>
<path d="${rays}" stroke="${K.bright}" stroke-width="1.5" opacity=".7"/>
<path d="${heartPath}" fill="url(#${id}-hg)" stroke="${K.bright}" stroke-width="${SW.sym}"/>
<path d="M140,226C139,212 147,202 158,201" fill="none" stroke="${K.bone}" stroke-width="3" opacity=".85"/>
<circle cx="146" cy="240" r="2" fill="${K.bone}" opacity=".85"/>
<g transform="${leftT}">${oneHand}</g>
<g transform="translate(356,0) scale(-1,1)"><g transform="${leftT}">${oneHand}</g></g>
<g fill="${K.peri}"><path d="${star4(112, 172, 6, 1.8)}"/><path d="${star4(246, 186, 5, 1.6)}"/></g>
<g fill="${K.bone}"><circle cx="232" cy="158" r="1.6"/><circle cx="122" cy="206" r="1.3"/></g>`;
  const emblem = `<path d="M0,9C-6,5 -11,1 -11,-4C-11,-8 -8,-10 -5.5,-10C-3,-10 -1,-8 0,-6C1,-8 3,-10 5.5,-10C8,-10 11,-8 11,-4C11,1 6,5 0,9Z" fill="${K.bright}"/>`;
  return face(id, { seed: 71, symbol, emblem });
}

function elder() {
  const id = "te";
  const glass = "M146,158C146,198 170,214 174,230C170,246 146,262 146,302H210C210,262 186,246 182,230C186,214 210,198 210,158Z";
  const symbol = `
<defs><clipPath id="${id}-glass"><path d="${glass}"/></clipPath></defs>
<path d="${glass}" fill="${K.peri}" fill-opacity=".16"/>
<g clip-path="url(#${id}-glass)">
<path d="M150,198Q178,208 206,198L210,158V230H146Z" fill="none"/>
<path d="M163,208Q178,214 193,208L182,230H174Z" fill="${K.mari}"/>
<path d="M140,302V286C156,282 168,270 178,262C188,270 200,282 216,286V302Z" fill="${K.mari}"/>
<path d="M140,302V292C156,289 168,280 178,274C188,280 200,289 216,292" fill="none" stroke="${K.bright}" stroke-width="1" opacity=".7"/>
<path d="M156,172C156,188 164,198 170,206" fill="none" stroke="${K.bone}" stroke-width="2" opacity=".55"/>
</g>
<path d="M178,230V266" stroke="${K.bright}" stroke-width="1.5" stroke-dasharray="3 3"/>
<path d="${glass}" fill="none" stroke="${K.bone}" stroke-width="${SW.symMid + 0.5}"/>
<g stroke="${K.mari}" stroke-width="${SW.sym}">
<path d="M134,154V306M222,154V306"/>
</g>
<g fill="${K.mari}" stroke="${K.bright}" stroke-width="1.25">
<ellipse cx="134" cy="230" rx="5" ry="9"/><ellipse cx="222" cy="230" rx="5" ry="9"/>
<ellipse cx="134" cy="192" rx="3.5" ry="5"/><ellipse cx="222" cy="192" rx="3.5" ry="5"/>
<ellipse cx="134" cy="268" rx="3.5" ry="5"/><ellipse cx="222" cy="268" rx="3.5" ry="5"/>
<rect x="120" y="140" width="116" height="13" rx="3"/>
<rect x="128" y="133" width="100" height="7" rx="2"/>
<rect x="120" y="307" width="116" height="13" rx="3"/>
<rect x="128" y="320" width="100" height="7" rx="2"/>
<circle cx="178" cy="126" r="5"/>
<circle cx="178" cy="334" r="5"/>
</g>
<path d="M126,146.5H230M126,313.5H230" stroke="${K.deep}" stroke-width="1.25" opacity=".7"/>
<g fill="${K.bone}"><path d="M246,150A16,16 0 1 1 236,178A13,13 0 1 0 246,150Z" opacity=".9"/></g>
<g fill="${K.peri}"><path d="${star4(108, 174, 6, 1.8)}"/><path d="${star4(252, 288, 5, 1.6)}"/></g>
<g fill="${K.bone}"><circle cx="112" cy="270" r="1.5"/><circle cx="104" cy="214" r="1.2"/></g>`;
  const emblem = `<path d="M5,-11A11,11 0 1 0 5,11A14,14 0 0 1 5,-11Z" fill="${K.bright}"/>`;
  return face(id, { seed: 89, symbol, emblem });
}

// ---------- back ----------
function back() {
  const id = "tk";
  const cx = 178, cy = 258;
  const r = rng(7);
  // symmetric star field (generate quarter, mirror both axes)
  let dots = "";
  let n = 0, guard = 0;
  while (n < 14 && guard++ < 3000) {
    const x = 42 + r() * 132, y = 42 + r() * 212;
    if (Math.hypot(x - cx, y - cy) < 130) continue;
    if (Math.abs(x - cx) < 26 && y < 140) continue;
    const rr = f(0.7 + r() * 1), op = f(0.35 + r() * 0.45);
    for (const [px, py] of [[x, y], [2 * cx - x, y], [x, 2 * cy - y], [2 * cx - x, 2 * cy - y]])
      dots += `<circle cx="${f(px)}" cy="${f(py)}" r="${rr}" opacity="${op}"/>`;
    n++;
  }
  // rosette: 12 circles on ring
  let ros = "";
  for (let i = 0; i < 12; i++) {
    const [x, y] = pol(cx, cy, 54, i * 30);
    ros += `<circle cx="${f(x)}" cy="${f(y)}" r="54"/>`;
  }
  // ticks
  let ticks = "", maj = "";
  for (let i = 0; i < 96; i++) {
    const a = i * 3.75;
    if (i % 8 === 0) {
      const [x1, y1] = pol(cx, cy, 110, a), [x2, y2] = pol(cx, cy, 122, a);
      maj += `M${f(x1)},${f(y1)}L${f(x2)},${f(y2)}`;
    } else {
      const [x1, y1] = pol(cx, cy, 113, a), [x2, y2] = pol(cx, cy, 119, a);
      ticks += `M${f(x1)},${f(y1)}L${f(x2)},${f(y2)}`;
    }
  }
  // compass rose
  const kite = (a, len, w) => {
    const [tx, ty] = pol(cx, cy, len, a);
    const [lx, ly] = pol(cx, cy, w, a - 45);
    const [rx, ry] = pol(cx, cy, w, a + 45);
    return {
      a: `M${cx},${cy}L${f(lx)},${f(ly)}L${f(tx)},${f(ty)}Z`,
      b: `M${cx},${cy}L${f(rx)},${f(ry)}L${f(tx)},${f(ty)}Z`,
    };
  };
  let roseLight = "", roseDark = "", minorLight = "", minorDark = "";
  for (let i = 0; i < 8; i++) {
    const a = i * 45 - 90;
    const k = kite(a, i % 2 ? 66 : 100, i % 2 ? 13 : 16);
    roseLight += k.a;
    roseDark += k.b;
  }
  for (let i = 0; i < 8; i++) {
    const a = i * 45 - 90 + 22.5;
    const k = kite(a, 46, 8);
    minorLight += k.a;
    minorDark += k.b;
  }
  // border band beads
  let beads = "";
  for (let x = 46; x <= 310; x += 12) beads += `<circle cx="${x}" cy="20.5" r="1.1"/><circle cx="${x}" cy="495.5" r="1.1"/>`;
  for (let y = 46; y <= 470; y += 12) beads += `<circle cx="20.5" cy="${y}" r="1.1"/><circle cx="335.5" cy="${y}" r="1.1"/>`;
  const medal = (y, flip) => `
<circle cx="${cx}" cy="${y}" r="20" fill="${K.deep}" stroke="${K.mari}" stroke-width="1.75"/>
<circle cx="${cx}" cy="${y}" r="15.5" fill="none" stroke="${K.mari}" stroke-width=".75" opacity=".7"/>
<path d="${starN(cx, y, 8, 12, 4.5, -90)}" fill="${K.bright}"/>
<circle cx="${cx}" cy="${y}" r="2.2" fill="${K.deep}"/>`;
  const arcs = (y, s) =>
    `<path d="M${cx - 64},${y + s * 26}Q${cx},${y - s * 18} ${cx + 64},${y + s * 26}" fill="none" stroke="${K.mari}" stroke-width="1.1" opacity=".75"/>
<path d="M${cx - 92},${y + s * 40}Q${cx},${y - s * 14} ${cx + 92},${y + s * 40}" fill="none" stroke="${K.peri}" stroke-width="1" opacity=".55"/>`;
  const fan = (x, y, sx, sy) => {
    let p = "";
    for (let i = 0; i <= 6; i++) {
      const a = (i * 90) / 6;
      const dx = Math.cos((a * Math.PI) / 180) * sx, dy = Math.sin((a * Math.PI) / 180) * sy;
      p += `M${f(x + dx * 8)},${f(y + dy * 8)}L${f(x + dx * 26)},${f(y + dy * 26)}`;
    }
    return `<path d="${p}" stroke="${K.mari}" stroke-width="1" opacity=".7"/><path d="M${x + sx * 30},${y}A30,30 0 0 ${sx * sy > 0 ? 1 : 0} ${x},${y + sy * 30}" fill="none" stroke="${K.mari}" stroke-width="1.25"/><circle cx="${x + sx * 4}" cy="${y + sy * 4}" r="2.4" fill="${K.bright}"/>`;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 356 516" width="356" height="516">
<defs>
<radialGradient id="${id}-bg" cx="50%" cy="50%" r="70%"><stop offset="0" stop-color="${K.felt}"/><stop offset=".6" stop-color="${K.ground}"/><stop offset="1" stop-color="${K.deep}"/></radialGradient>
<radialGradient id="${id}-core" cx="${cx}" cy="${cy}" r="122" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${K.peri}" stop-opacity=".22"/><stop offset="1" stop-color="${K.peri}" stop-opacity=".04"/></radialGradient>
<clipPath id="${id}-cc"><circle cx="${cx}" cy="${cy}" r="108"/></clipPath>
</defs>
<rect width="356" height="516" fill="url(#${id}-bg)"/>
<g fill="${K.mari}" opacity=".8">${beads}</g>
<rect x="34" y="34" width="288" height="448" rx="4" fill="none" stroke="${K.mari}" stroke-width="1.5"/>
<rect x="40" y="40" width="276" height="436" rx="3" fill="none" stroke="${K.mari}" stroke-width=".6" opacity=".5"/>
${fan(40, 40, 1, 1)}${fan(316, 40, -1, 1)}${fan(40, 476, 1, -1)}${fan(316, 476, -1, -1)}
<g fill="${K.bone}">${dots}</g>
<g fill="${K.bright}" opacity=".85"><path d="${star4(76, 150, 6, 1.8)}"/><path d="${star4(280, 150, 6, 1.8)}"/><path d="${star4(76, 366, 6, 1.8)}"/><path d="${star4(280, 366, 6, 1.8)}"/></g>
${arcs(104, 1)}${arcs(412, -1)}
<path d="M${cx},62V${cy - 126}M${cx},${cy + 126}V454" stroke="${K.mari}" stroke-width="1.1"/>
<g fill="${K.mari}"><path d="M${cx},${cy - 136}l4,6l-4,6l-4,-6z"/><path d="M${cx},${cy + 136}l4,-6l-4,-6l-4,6z"/></g>
${medal(78)}${medal(438)}
<circle cx="${cx}" cy="${cy}" r="122" fill="url(#${id}-core)" stroke="${K.mari}" stroke-width="1.5"/>
<circle cx="${cx}" cy="${cy}" r="108" fill="none" stroke="${K.mari}" stroke-width="1"/>
<path d="${ticks}" stroke="${K.mari}" stroke-width="1" opacity=".55"/>
<path d="${maj}" stroke="${K.bright}" stroke-width="1.75" stroke-linecap="round"/>
<g clip-path="url(#${id}-cc)" fill="none" stroke="${K.mari}" stroke-width=".9" opacity=".45">${ros}</g>
<circle cx="${cx}" cy="${cy}" r="76" fill="none" stroke="${K.peri}" stroke-width="1" opacity=".7"/>
<circle cx="${cx}" cy="${cy}" r="70" fill="none" stroke="${K.peri}" stroke-width=".6" opacity=".5"/>
<g stroke-linejoin="round">
<path d="${minorLight}" fill="${K.peri}" stroke="${K.peri}" stroke-width=".75"/>
<path d="${minorDark}" fill="${K.deep}" stroke="${K.peri}" stroke-width=".75"/>
<path d="${roseLight}" fill="${K.mari}" stroke="${K.bright}" stroke-width="1"/>
<path d="${roseDark}" fill="${K.deep}" stroke="${K.mari}" stroke-width="1"/>
</g>
<circle cx="${cx}" cy="${cy}" r="11" fill="${K.deep}" stroke="${K.bright}" stroke-width="1.75"/>
<circle cx="${cx}" cy="${cy}" r="4" fill="${K.bright}"/>
<rect x="7" y="7" width="342" height="502" rx="12" fill="none" stroke="${K.mari}" stroke-width="${SW.frame}"/>
<rect x="15" y="15" width="326" height="486" rx="6" fill="none" stroke="${K.mari}" stroke-width="${SW.frameThin}"/>
<rect x="26" y="26" width="304" height="464" rx="4" fill="none" stroke="${K.mari}" stroke-width="${SW.frameThin}"/>
${corners()}
</svg>
`;
}

const cards = { beginner, maker, collector, contrarian, heart, elder, back };
for (const [name, fn] of Object.entries(cards)) {
  const svg = fn().replace(/\n\s*\n/g, "\n");
  writeFileSync(`${OUT}/${name}.svg`, svg);
  console.log(name, svg.length, "bytes");
}
