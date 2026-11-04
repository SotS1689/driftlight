// The Amberreach: every island, puzzle piece, note and wonder in the first region.
// Coordinates are world pixels. Add a new reach by adding another block like this.

import { rng, dist } from "./util.js";

export const WORLD = { w: 6000, h: 6000 };
// Island tops are drawn as ellipses (a gentle 3/4 view); collision uses the same squash
export const SQUASH = 0.8;

export const REGIONS = {
    start: { name: "Keeper's Rest" },
    morrow: { name: "Morrow Light" },
    hollow: { name: "Hollowsong Light" },
    gale: { name: "Galewatch Light" },
    heart: { name: "The Heartbeacon" },
};

// falls: positions of waterfalls along the south rim, 0 = east edge, 1 = west edge
export const ISLANDS = [
    { id: "keepers", x: 3000, y: 4300, r: 170, region: "start", trees: 4, house: true, falls: [0.72] },
    { id: "heart", x: 3000, y: 3000, r: 360, region: "heart", trees: 7, ruins: true, falls: [0.28, 0.64] },
    { id: "morrow", x: 1100, y: 2400, r: 210, region: "morrow", trees: 3, lighthouse: true, falls: [0.56] },
    { id: "thistle", x: 1300, y: 2900, r: 110, region: "morrow", trees: 3 },
    { id: "hollow", x: 4800, y: 2300, r: 230, region: "hollow", trees: 4, lighthouse: true, falls: [0.4] },
    { id: "gale", x: 3000, y: 800, r: 220, region: "gale", trees: 2, lighthouse: true, falls: [0.5] },
    { id: "weeping", x: 2000, y: 4900, r: 200, region: "heart", trees: 3, falls: [0.12, 0.25, 0.38, 0.5, 0.62, 0.75, 0.88] },
    { id: "heron1", x: 4150, y: 4150, r: 55, region: "hollow", trees: 0, pillar: 3.6 },
    { id: "heron2", x: 4290, y: 4230, r: 45, region: "hollow", trees: 0, pillar: 4.2 },
    { id: "heron3", x: 4200, y: 4340, r: 60, region: "hollow", trees: 1, pillar: 3 },
    { id: "heron4", x: 4050, y: 4290, r: 40, region: "hollow", trees: 0, pillar: 4.6 },
    { id: "wreck", x: 1700, y: 1500, r: 120, region: "morrow", trees: 1, wreck: true },
    { id: "glass", x: 4300, y: 1100, r: 190, region: "gale", trees: 3, lake: true, falls: [0.5] },
    { id: "lantern", x: 5200, y: 4700, r: 150, region: "hollow", trees: 0, bigTree: true },
    { id: "galerock", x: 3250, y: 1830, r: 55, region: "gale", trees: 0 },
    { id: "i1", x: 800, y: 3600, r: 160, region: "morrow", trees: 4, falls: [0.45] },
    { id: "i2", x: 2200, y: 2000, r: 140, region: "heart", trees: 3 },
    { id: "i3", x: 3900, y: 3700, r: 130, region: "heart", trees: 2 },
    { id: "i4", x: 5400, y: 3500, r: 170, region: "hollow", trees: 4, falls: [0.6] },
    { id: "i5", x: 900, y: 1200, r: 150, region: "morrow", trees: 3 },
    { id: "i6", x: 1900, y: 600, r: 130, region: "gale", trees: 2 },
    { id: "i7", x: 4600, y: 600, r: 150, region: "gale", trees: 3, falls: [0.5] },
    { id: "i8", x: 3600, y: 5300, r: 160, region: "start", trees: 4 },
    { id: "i9", x: 1000, y: 5000, r: 170, region: "heart", trees: 4, falls: [0.35] },
    { id: "i10", x: 5500, y: 1200, r: 120, region: "gale", trees: 2 },
    { id: "i11", x: 2400, y: 3700, r: 100, region: "heart", trees: 2 },
];

// ---- Morrow: lead the Sunstone's beam with three old mirrors -------------------
export const SUNSTONE = { x: 2000, y: 3400, dir: [-1, 0] };
// state * 45deg is the mirror's angle; solution is [1, 2, 1]
export const MIRRORS = [
    { id: "m1", x: 1500, y: 3400, state: 3 },
    { id: "m2", x: 1500, y: 2900, state: 1 },
    { id: "m3", x: 1500, y: 2400, state: 0 },
];
export const MIRROR_LEN = 84;

// ---- Hollowsong: ring the five chime stones in the order of her song -----------
export const CHIMES = [
    { x: 4300, y: 1900, note: 523.25, color: "#f2a6b3", name: "rose" },
    { x: 5300, y: 1800, note: 587.33, color: "#f4c56a", name: "amber" },
    { x: 5400, y: 2700, note: 659.25, color: "#9fd08a", name: "leaf" },
    { x: 4800, y: 2950, note: 783.99, color: "#8cc6ee", name: "sky" },
    { x: 4250, y: 2650, note: 880.0, color: "#b9a2e8", name: "violet" },
];
export const SONG = [2, 3, 4, 1, 0];

// ---- Galewatch: ride the breathing currents through the storm ------------------
export const GALE = { x: 3000, y: 800, inner: 480, outer: 820 };
export const CURRENT_PERIOD = 15;
export const CURRENT_ON = 7;
export const CURRENTS = [
    { a: [3300, 1700], b: [3600, 1200], start: 0 },
    { a: [3600, 1200], b: [3650, 650], start: 5 },
    { a: [3650, 650], b: [3350, 520], start: 10 },
];
export const EDDIES = [
    { x: 3600, y: 1200, r: 105 },
    { x: 3650, y: 650, r: 105 },
];

// Small floating rocks that carry puzzle pieces (drawn like tiny islands)
export const ROCKS = [
    { id: "sunrock", x: SUNSTONE.x, y: SUNSTONE.y, r: 50, region: "morrow" },
    ...MIRRORS.map((m) => ({ id: "rock-" + m.id, x: m.x, y: m.y, r: 42, region: "morrow" })),
    ...CHIMES.map((c, i) => ({ id: "rock-c" + i, x: c.x, y: c.y, r: 40, region: "hollow" })),
    ...EDDIES.map((e, i) => ({ id: "rock-e" + i, x: e.x, y: e.y, r: 30, region: "gale" })),
];

// ---- Keeper's notes, left on standing stones ------------------------------------
export const NOTES = [
    {
        id: "n1",
        island: "keepers",
        title: "To whoever finds my skiff",
        text:
            "The Amberreach has gone quiet. Three lights went dark: Morrow in the west, Hollowsong in the east, " +
            "Galewatch in the north. Wake them, and the Heartbeacon at the centre may wake too.\n\n" +
            "Go slowly. The sky is not going anywhere.\n\n— Ione, last keeper",
    },
    {
        id: "n2",
        island: "morrow",
        title: "Morrow Light",
        text:
            "Morrow drinks her light from the Sunstone, east of here. My old mirrors still stand out in the sky. " +
            "Sail close and turn them, and lead the morning home.\n\n" +
            "(A mirror turned edge-on lets the light slip past.)",
    },
    {
        id: "n3",
        island: "hollow",
        title: "Hollowsong Light",
        text:
            "Hollowsong was lit by music. Five chime stones ring around her. " +
            "Listen to her song, then sail through the stones and sing it back to her, in order.",
        song: true,
    },
    {
        id: "n4",
        island: "galerock",
        title: "Galewatch Light",
        text:
            "Galewatch keeps herself inside a storm. No sail can beat it, but the wind breathes. " +
            "Ride the bright currents when they flow, and rest in the still places when they sleep.",
    },
];

export const FINAL_NOTE =
    "You did it slowly, and you did it well. The Heartbeacon remembers the reach now, " +
    "and the reach remembers itself.\n\nThere are other reaches past the Rim, still dark, still waiting. " +
    "But there is no hurry. Sit a while. Watch the whales come home.\n\n— Ione";

// ---- Wonders to discover ----------------------------------------------------------
export const DISCOVERIES = [
    { id: "keepers", name: "Keeper's Rest", x: 3000, y: 4300, r: 420, line: "A cottage, a dock, and a kettle long gone cold." },
    { id: "weeping", name: "The Weeping Isle", x: 2000, y: 4900, r: 480, line: "Seven falls pour from her edges and never reach the bottom." },
    { id: "herons", name: "Heron Stacks", x: 4180, y: 4250, r: 420, line: "Grey herons keep their own counsel on the high stones." },
    { id: "wreck", name: "Wreck of the Patience", x: 1700, y: 1500, r: 380, line: "Someone sailed her here, and never sailed her home." },
    { id: "glass", name: "The Glass Pool", x: 4300, y: 1100, r: 420, line: "A lake so still it holds a second sky." },
    { id: "lantern", name: "The Lantern Tree", x: 5200, y: 4700, r: 420, line: "Every lantern on it was hung by a different hand." },
    { id: "whale", name: "A Sleeping Whale", whale: true, r: 520, line: "It breathes once every hundred heartbeats, and dreams in blue." },
    { id: "rim", name: "The Rim of the Reach", rim: true, line: "Beyond here the clouds go on forever. Another reach, another day." },
];

// The whale drifts along a slow ellipse in the south-east
export const WHALE_PATH = { x: 4300, y: 5150, rx: 820, ry: 430, speed: 0.012 };

// ---- Drift-seeds: 24 glowing seeds scattered through the reach -------------------
export const SEED_REWARDS = [
    { count: 8, id: "rose", name: "Rosewing sail", text: "Your sail blushes the colour of morning." },
    { count: 16, id: "star", name: "Starlit sail", text: "Tiny stars are stitched across your sail." },
    { count: 24, id: "gold", name: "Golden wake", text: "Your skiff now leaves a trail of light." },
];

function blocked(x, y, pad) {
    for (const is of ISLANDS) {
        const dx = x - is.x;
        const dy = (y - is.y) / SQUASH;
        if (Math.hypot(dx, dy) < is.r + pad) return true;
    }
    for (const r of ROCKS) if (dist(x, y, r.x, r.y) < r.r + pad) return true;
    const g = dist(x, y, GALE.x, GALE.y);
    if (g > GALE.inner - 40 && g < GALE.outer + 40) return true;
    return false;
}

export const SEEDS = (() => {
    const hand = [
        [1860, 1640], [3150, 560], [4470, 4460], [5450, 4880], [2120, 5260], [3460, 1450],
    ];
    const out = hand.map(([x, y], i) => ({ id: "s" + i, x, y }));
    const r = rng(1689);
    let guard = 0;
    while (out.length < 24 && guard++ < 5000) {
        const x = 400 + r() * 5200;
        const y = 400 + r() * 5200;
        if (blocked(x, y, 70)) continue;
        if (out.some((s) => dist(s.x, s.y, x, y) < 650)) continue;
        out.push({ id: "s" + out.length, x, y });
    }
    return out;
})();

export const START = { x: 3230, y: 4660, heading: -Math.PI * 0.75 };
