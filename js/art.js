// Everything is painted procedurally. Static things (islands, clouds) are painted once
// into offscreen canvases; living things (skiff, lights, whales) are drawn every frame.

import { TAU, rng, hex, mix, rgb } from "./util.js";
import { SQUASH } from "./world.js";

const RES = 0.75; // offscreen resolution for island paintings (memory vs. sharpness)
export const BEAM_H = 22; // height above the cloud sea at which light beams travel
export const TOWER_H = 130;

export function hashId(s) {
    let h = 2166136261;
    for (const ch of s) {
        h ^= ch.charCodeAt(0);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

export function islandShape(is) {
    const r = rng(hashId(is.id));
    const a = r() * TAU, b = r() * TAU, c = r() * TAU;
    return (th) => is.r * (1 + 0.07 * Math.sin(3 * th + a) + 0.05 * Math.sin(5 * th + b) + 0.025 * Math.sin(9 * th + c));
}

function shapePath(g, R, scale = 1, dy = 0, steps = 72) {
    g.beginPath();
    for (let i = 0; i <= steps; i++) {
        const th = (i / steps) * TAU;
        const rr = R(th) * scale;
        const x = Math.cos(th) * rr;
        const y = Math.sin(th) * rr * SQUASH + dy;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
}

function randInside(rand, R, k = 0.8) {
    const th = rand() * TAU;
    const rr = Math.sqrt(rand()) * k * R(th);
    return [Math.cos(th) * rr, Math.sin(th) * rr * SQUASH];
}

const TREE_GREEN = [
    ["#a9d184", "#679a52", "#3f6b3c"],
    ["#f8d2de", "#e597b2", "#a85f80"],
    ["#c1df90", "#7eae5c", "#4d7a42"],
    ["#9fcf9a", "#5c9468", "#36604a"],
];
const TREE_AUTUMN = [
    ["#e3bd75", "#b78642", "#7a5530"],
    ["#d3b085", "#a07b52", "#6a5038"],
    ["#c6b48c", "#938466", "#605540"],
];

export function drawTree(g, x, y, size, pal, rand) {
    g.fillStyle = "rgba(40,50,40,0.22)";
    g.beginPath();
    g.ellipse(x + size * 0.55, y + 2, size * 0.95, size * 0.32, 0, 0, TAU);
    g.fill();
    g.fillStyle = "#6b4a3a";
    g.fillRect(x - 2.2, y - size * 0.95, 4.4, size * 0.95);
    const n = 4 + Math.floor(rand() * 2);
    for (let k = 0; k < n; k++) {
        const cx = x + (rand() - 0.5) * size * 0.95;
        const cy = y - size * 1.15 - rand() * size * 0.55;
        const rr = size * (0.42 + rand() * 0.28);
        const gr = g.createRadialGradient(cx - rr * 0.4, cy - rr * 0.45, rr * 0.1, cx, cy, rr);
        gr.addColorStop(0, pal[0]);
        gr.addColorStop(0.6, pal[1]);
        gr.addColorStop(1, pal[2]);
        g.fillStyle = gr;
        g.beginPath();
        g.arc(cx, cy, rr, 0, TAU);
        g.fill();
    }
}

function drawHouse(g, x, y) {
    g.fillStyle = "rgba(40,50,40,0.25)";
    g.beginPath();
    g.ellipse(x + 24, y + 4, 44, 10, 0, 0, TAU);
    g.fill();
    g.fillStyle = "#efe2c8";
    g.fillRect(x - 26, y - 26, 52, 28);
    g.fillStyle = "#d4c3a4";
    g.fillRect(x + 12, y - 26, 14, 28);
    g.fillStyle = "#7a5a3a";
    g.fillRect(x - 6, y - 14, 10, 16);
    g.fillStyle = "#ffd98a";
    g.fillRect(x - 20, y - 18, 8, 7);
    g.fillRect(x + 14, y - 18, 7, 7);
    g.fillStyle = "#8a6a5a";
    g.fillRect(x + 12, y - 50, 7, 16);
    g.fillStyle = "#b5684f";
    g.beginPath();
    g.moveTo(x - 33, y - 24);
    g.lineTo(x - 4, y - 46);
    g.lineTo(x + 33, y - 24);
    g.closePath();
    g.fill();
    g.fillStyle = "#93503d";
    g.beginPath();
    g.moveTo(x - 4, y - 46);
    g.lineTo(x + 33, y - 24);
    g.lineTo(x + 10, y - 24);
    g.closePath();
    g.fill();
}

function drawWreck(g, x, y) {
    g.save();
    g.translate(x, y);
    g.rotate(0.45);
    g.fillStyle = "rgba(40,50,40,0.25)";
    g.beginPath();
    g.ellipse(8, 8, 46, 14, 0, 0, TAU);
    g.fill();
    g.fillStyle = "#7d5840";
    g.beginPath();
    g.moveTo(42, 0);
    g.quadraticCurveTo(20, -18, -26, -14);
    g.lineTo(-18, 0);
    g.lineTo(-30, 12);
    g.quadraticCurveTo(20, 18, 42, 0);
    g.fill();
    g.strokeStyle = "#4a3020";
    g.lineWidth = 2;
    g.stroke();
    g.strokeStyle = "#5a4030";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(6, 0);
    g.lineTo(-4, -40);
    g.stroke();
    g.fillStyle = "rgba(240,228,205,0.85)";
    g.beginPath();
    g.moveTo(-4, -40);
    g.quadraticCurveTo(14, -30, 8, -18);
    g.lineTo(-2, -24);
    g.closePath();
    g.fill();
    g.restore();
}

export function renderIsland(is, bloomed) {
    const R = islandShape(is);
    const rx = is.r * 1.12 + 10;
    const ry = rx * SQUASH;
    const depth = is.r * (is.pillar || 1.05) + 24;
    const W = rx * 2 + 40;
    const H = ry * 2 + depth + 70;
    const c = document.createElement("canvas");
    c.width = Math.ceil(W * RES);
    c.height = Math.ceil(H * RES);
    const g = c.getContext("2d");
    g.scale(RES, RES);
    const cx = W / 2, cy = ry + 40;
    g.translate(cx, cy);
    const rand = rng(hashId(is.id) + 7);

    // Cliffs: stacked, shrinking layers from the bottom tip up to the rim
    const N = is.pillar ? 30 : 24;
    const rockTop = hex("#b48a68"), rockBot = hex("#4b3d5c");
    for (let i = N; i >= 0; i--) {
        const t = i / N;
        const sc = is.pillar ? 1 - 0.38 * Math.pow(t, 1.6) : 1 - 0.66 * Math.pow(t, 1.2);
        const j = (rand() - 0.5) * 0.08;
        const col = mix(rockTop, rockBot, Math.min(1, Math.pow(t, 0.85) + j));
        g.fillStyle = rgb(col);
        shapePath(g, R, sc, depth * t);
        g.fill();
        if (i % 5 === 2) {
            g.strokeStyle = "rgba(50,35,60,0.18)";
            g.lineWidth = 2;
            g.stroke();
        }
    }
    // Roots and vines hanging over the south face
    for (let k = 0; k < is.r * 0.12; k++) {
        const th = 0.2 + rand() * (Math.PI - 0.4);
        const rr = R(th);
        const x = Math.cos(th) * rr, y = Math.sin(th) * rr * SQUASH;
        const len = 12 + rand() * 40;
        g.strokeStyle = bloomed ? "rgba(84,120,70,0.65)" : "rgba(110,96,70,0.6)";
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + (rand() - 0.5) * 10, y + len * 0.5, x + (rand() - 0.5) * 6, y + len);
        g.stroke();
    }

    // Soil lip, then the grassy top
    g.fillStyle = "#7d5d48";
    shapePath(g, R, 1, 7);
    g.fill();
    const gA = bloomed ? "#c3dc8f" : "#d3c796";
    const gB = bloomed ? "#86b063" : "#a99d74";
    const gC = bloomed ? "#5f8d4c" : "#857a5c";
    const gr = g.createRadialGradient(-rx * 0.3, -ry * 0.45, is.r * 0.1, 0, 0, is.r * 1.1);
    gr.addColorStop(0, gA);
    gr.addColorStop(0.65, gB);
    gr.addColorStop(1, gC);
    g.fillStyle = gr;
    shapePath(g, R, 1, 0);
    g.fill();

    g.save();
    shapePath(g, R, 1, 0);
    g.clip();
    for (let k = 0; k < is.r * 1.4; k++) {
        const [x, y] = randInside(rand, R, 1);
        g.fillStyle = rand() < 0.5 ? "rgba(255,255,220,0.16)" : "rgba(40,70,30,0.14)";
        g.beginPath();
        g.ellipse(x, y, 3 + rand() * 7, 1.5 + rand() * 2.5, rand(), 0, TAU);
        g.fill();
    }
    g.strokeStyle = "rgba(50,70,40,0.2)";
    g.lineWidth = 14;
    shapePath(g, R, 1, 0);
    g.stroke();
    g.restore();
    g.strokeStyle = "rgba(255,255,225,0.45)";
    g.lineWidth = 2.5;
    shapePath(g, R, 1, 0);
    g.stroke();

    const keepOut = [];
    if (is.lake) {
        const lx = is.r * 0.5, ly = lx * SQUASH;
        g.fillStyle = "#e9dcb0";
        g.beginPath();
        g.ellipse(0, 0, lx + 6, ly + 5, 0, 0, TAU);
        g.fill();
        const lg = g.createLinearGradient(0, -ly, 0, ly);
        lg.addColorStop(0, "#d8eef6");
        lg.addColorStop(0.5, "#a9d3ea");
        lg.addColorStop(1, "#7fb2d6");
        g.fillStyle = lg;
        g.beginPath();
        g.ellipse(0, 0, lx, ly, 0, 0, TAU);
        g.fill();
        g.strokeStyle = "rgba(255,255,255,0.7)";
        g.lineWidth = 2;
        for (let k = 0; k < 3; k++) {
            g.beginPath();
            g.ellipse(-lx * 0.2, -ly * 0.3 + k * 9, lx * 0.4 - k * 10, 3, 0, Math.PI * 1.1, Math.PI * 1.9);
            g.stroke();
        }
        keepOut.push([0, 0, lx + 14]);
    }
    if (is.ruins) {
        for (let k = 0; k < 10; k++) {
            const th = (k / 10) * TAU;
            const x = Math.cos(th) * is.r * 0.62, y = Math.sin(th) * is.r * 0.62 * SQUASH;
            g.fillStyle = "rgba(40,50,40,0.22)";
            g.fillRect(x + 2, y - 2, 18, 5);
            g.fillStyle = "#c9c3b4";
            g.fillRect(x - 5, y - 22, 10, 22);
            g.fillStyle = "#e6e0d0";
            g.fillRect(x - 5, y - 22, 4, 22);
        }
        keepOut.push([0, 0, is.r * 0.45]);
    }
    if (is.house) keepOut.push([-is.r * 0.1, -is.r * 0.15, 60]);
    if (is.wreck) keepOut.push([0, 0, 60]);
    if (is.lighthouse) keepOut.push([0, 0, 50]);
    if (is.bigTree) keepOut.push([0, 0, is.r * 0.6]);

    // Flowers
    const flowerCols = bloomed ? ["#ffffff", "#f7c3d3", "#ffe28a", "#cdb8f2", "#f59f8b"] : ["#e8dcc0", "#cbb68e"];
    const flowers = bloomed ? is.r * 0.7 : is.r * 0.12;
    for (let k = 0; k < flowers; k++) {
        const [x, y] = randInside(rand, R, 0.9);
        g.fillStyle = flowerCols[Math.floor(rand() * flowerCols.length)];
        g.beginPath();
        g.arc(x, y, 1.6 + rand() * 1.6, 0, TAU);
        g.fill();
    }

    // Trees, sorted so nearer (lower) ones overlap farther ones
    // Own random stream so both bloom states place trees identically
    const trand = rng(hashId(is.id) + 21);
    const trees = [];
    let guard = 0;
    while (trees.length < is.trees && guard++ < 200) {
        const [x, y] = randInside(trand, R, 0.72);
        if (keepOut.some(([kx, ky, kr]) => Math.hypot(x - kx, (y - ky) / SQUASH) < kr)) continue;
        if (trees.some((t) => Math.hypot(t[0] - x, t[1] - y) < 30)) continue;
        trees.push([x, y, 16 + trand() * 12, trand(), trand()]);
    }
    trees.sort((a, b) => a[1] - b[1]);
    for (const [x, y, s, p1] of trees) {
        const pals = bloomed ? TREE_GREEN : TREE_AUTUMN;
        drawTree(g, x, y, s, pals[Math.floor(p1 * pals.length)], trand);
    }
    if (is.house) drawHouse(g, -is.r * 0.1, -is.r * 0.12);
    if (is.wreck) drawWreck(g, 0, 0);
    if (is.bigTree) {
        const pal = bloomed ? ["#b7dc95", "#5f9a5a", "#335f42"] : ["#cdb98a", "#93805d", "#5e5340"];
        drawTree(g, 0, is.r * 0.15, 52, pal, rng(hashId(is.id) + 3));
    }

    return { canvas: c, cx, cy, W, H };
}

// Waterfall start points on the south rim, in world coordinates
export function fallPoints(is) {
    const R = islandShape(is);
    const depth = is.r * (is.pillar || 1.05) + 24;
    const r = rng(hashId(is.id) + 99);
    return (is.falls || []).map((f) => {
        const th = f * Math.PI;
        const rr = R(th) * 0.97;
        return {
            x: is.x + Math.cos(th) * rr,
            y: is.y + Math.sin(th) * rr * SQUASH,
            len: depth * (0.55 + Math.sin(th) * 0.5) + 160 + r() * 80,
            w: 12 + r() * 9,
            phase: r() * 10,
        };
    });
}

export function makeCloud(seed, storm = false) {
    const r = rng(seed);
    const W = 360, H = 220;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d");
    const n = 11 + Math.floor(r() * 6);
    const base = storm ? [150, 146, 178] : [255, 255, 255];
    for (let i = 0; i < n; i++) {
        const u = r();
        const bump = Math.sin(u * Math.PI);
        const x = W / 2 + (u - 0.5) * W * 0.6;
        const rr = 26 + bump * 50 * (0.6 + 0.4 * r());
        const y = H * 0.6 - bump * 30 * r();
        const gr = g.createRadialGradient(x, y, 0, x, y, rr);
        gr.addColorStop(0, rgb(base, 1));
        gr.addColorStop(0.6, rgb(base, 0.92));
        gr.addColorStop(1, rgb(base, 0));
        g.fillStyle = gr;
        g.beginPath();
        g.arc(x, y, rr, 0, TAU);
        g.fill();
    }
    g.globalCompositeOperation = "source-atop";
    const sh = g.createLinearGradient(0, H * 0.25, 0, H * 0.85);
    sh.addColorStop(0, "rgba(255,250,240,0.35)");
    sh.addColorStop(0.45, "rgba(255,255,255,0)");
    sh.addColorStop(1, storm ? "rgba(48,40,80,0.6)" : "rgba(130,140,185,0.42)");
    g.fillStyle = sh;
    g.fillRect(0, 0, W, H);
    return c;
}

export function drawSkiff(g, s, t, sailStyle, speedK) {
    const bob = Math.sin(t * 1.4) * 3;
    g.save();
    g.translate(s.x + 46, s.y + 66);
    g.rotate(s.h);
    g.fillStyle = "rgba(40,40,80,0.15)";
    g.beginPath();
    g.ellipse(0, 0, 36, 15, 0, 0, TAU);
    g.fill();
    g.restore();

    g.save();
    g.translate(s.x, s.y - 4 + bob);
    g.rotate(s.h);
    const flap = Math.sin(t * 1.2) * 0.22;
    for (const side of [-1, 1]) {
        g.save();
        g.translate(-8, side * 11);
        g.rotate(side * (0.55 + flap));
        g.fillStyle = "rgba(205,230,240,0.75)";
        g.strokeStyle = "rgba(120,150,170,0.6)";
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(0, 0);
        g.quadraticCurveTo(-10, side * 14, -22, side * 20);
        g.quadraticCurveTo(-8, side * 6, 0, 0);
        g.fill();
        g.stroke();
        g.restore();
    }
    const hull = g.createLinearGradient(0, -14, 0, 14);
    hull.addColorStop(0, "#6e452f");
    hull.addColorStop(0.5, "#b77d52");
    hull.addColorStop(1, "#5e3a28");
    g.fillStyle = hull;
    g.beginPath();
    g.moveTo(38, 0);
    g.quadraticCurveTo(18, -16, -20, -13);
    g.quadraticCurveTo(-31, -12, -31, 0);
    g.quadraticCurveTo(-31, 12, -20, 13);
    g.quadraticCurveTo(18, 16, 38, 0);
    g.fill();
    g.strokeStyle = "#4a2e20";
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = "#d9ab78";
    g.beginPath();
    g.moveTo(31, 0);
    g.quadraticCurveTo(15, -11, -18, -9);
    g.quadraticCurveTo(-25, -8, -25, 0);
    g.quadraticCurveTo(-25, 8, -18, 9);
    g.quadraticCurveTo(15, 11, 31, 0);
    g.fill();
    g.strokeStyle = "rgba(120,80,50,0.35)";
    g.lineWidth = 1;
    for (const y of [-5, 0, 5]) {
        g.beginPath();
        g.moveTo(-22, y);
        g.lineTo(26, y * 0.5);
        g.stroke();
    }
    g.fillStyle = "#8a5a3c";
    g.fillRect(-24, -6, 8, 12);
    g.fillStyle = "#ffe3a0";
    g.beginPath();
    g.arc(-28, 0, 3.2, 0, TAU);
    g.fill();
    g.fillStyle = "#5a3a28";
    g.beginPath();
    g.arc(4, 0, 3, 0, TAU);
    g.fill();

    const b = 7 + speedK * 11 + Math.sin(t * 2) * 1.4;
    const sail = sailStyle === "rose" || sailStyle === "star" || sailStyle === "gold" ? ["#fbe1e6", "#e9a9b9"] : ["#fbf3e3", "#dcc9a8"];
    if (sailStyle === "star" || sailStyle === "gold") { sail[0] = "#eef0ff"; sail[1] = "#9aa4d8"; }
    const sg = g.createLinearGradient(4, 0, 4 + b * 1.6, 0);
    sg.addColorStop(0, sail[1]);
    sg.addColorStop(1, sail[0]);
    g.fillStyle = sg;
    g.beginPath();
    g.moveTo(4, -28);
    g.quadraticCurveTo(4 + b * 1.7, 0, 4, 28);
    g.quadraticCurveTo(1 + b * 0.5, 0, 4, -28);
    g.fill();
    g.strokeStyle = "rgba(90,70,50,0.55)";
    g.lineWidth = 1.2;
    g.stroke();
    if (sailStyle === "star" || sailStyle === "gold") {
        g.fillStyle = "#fff6c4";
        for (let k = -2; k <= 2; k++) {
            g.beginPath();
            g.arc(4 + b * 0.75 * (1 - (k * k) / 9), k * 9, 1.4, 0, TAU);
            g.fill();
        }
    }
    g.strokeStyle = "#5a3a28";
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(4, -29);
    g.lineTo(4, 29);
    g.stroke();
    // pennant streams away from the skiff's motion
    g.strokeStyle = "#c7664f";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-31, 0);
    g.quadraticCurveTo(-38, Math.sin(t * 3) * 3, -46, Math.sin(t * 3 + 1) * 4);
    g.stroke();
    g.restore();
}

export function drawLighthouse(g, x, y, lit) {
    const H = TOWER_H;
    g.fillStyle = "rgba(30,40,30,0.22)";
    g.beginPath();
    g.ellipse(x + 52, y + 4, 62, 10, 0, 0, TAU);
    g.fill();
    g.save();
    g.beginPath();
    g.moveTo(x - 17, y);
    g.lineTo(x - 11, y - H);
    g.lineTo(x + 11, y - H);
    g.lineTo(x + 17, y);
    g.closePath();
    const bg = g.createLinearGradient(x - 17, 0, x + 17, 0);
    bg.addColorStop(0, "#fffaf0");
    bg.addColorStop(0.55, "#e9ddc9");
    bg.addColorStop(1, "#b3a493");
    g.fillStyle = bg;
    g.fill();
    g.clip();
    g.fillStyle = "#c7664f";
    g.fillRect(x - 20, y - H * 0.34, 40, 13);
    g.fillRect(x - 20, y - H * 0.66, 40, 13);
    g.fillStyle = "rgba(0,0,0,0.12)";
    g.fillRect(x + 6, y - H, 12, H);
    g.restore();
    g.fillStyle = "#6b4a3a";
    g.fillRect(x - 5, y - 18, 10, 18);
    g.fillStyle = "#555b6b";
    g.fillRect(x - 17, y - H - 4, 34, 6);
    const glass = mix(hex("#3c4458"), hex("#fff2c0"), lit);
    g.fillStyle = rgb(glass);
    g.fillRect(x - 11, y - H - 26, 22, 22);
    g.strokeStyle = "#2f3442";
    g.lineWidth = 1.5;
    g.strokeRect(x - 11, y - H - 26, 22, 22);
    g.beginPath();
    g.moveTo(x, y - H - 26);
    g.lineTo(x, y - H - 4);
    g.stroke();
    g.fillStyle = "#3f6a70";
    g.beginPath();
    g.moveTo(x - 15, y - H - 26);
    g.lineTo(x, y - H - 45);
    g.lineTo(x + 15, y - H - 26);
    g.closePath();
    g.fill();
    g.fillStyle = "#d9b45a";
    g.beginPath();
    g.arc(x, y - H - 47, 3, 0, TAU);
    g.fill();
}

// Additive glow and sweeping beams for a lit lighthouse
export function drawLighthouseLight(g, x, y, lit, t, glow) {
    if (lit <= 0.01) return;
    const lx = x, ly = y - TOWER_H - 15;
    const rr = 70 + glow * 60;
    const gr = g.createRadialGradient(lx, ly, 0, lx, ly, rr);
    gr.addColorStop(0, `rgba(255,236,170,${0.9 * lit})`);
    gr.addColorStop(1, "rgba(255,200,120,0)");
    g.fillStyle = gr;
    g.beginPath();
    g.arc(lx, ly, rr, 0, TAU);
    g.fill();
    const alpha = lit * (0.12 + 0.3 * glow);
    for (const k of [0, Math.PI]) {
        const a = t * 0.4 + k;
        const L = 900;
        const bg = g.createRadialGradient(lx, ly, 0, lx, ly, L);
        bg.addColorStop(0, `rgba(255,240,190,${alpha})`);
        bg.addColorStop(1, "rgba(255,240,190,0)");
        g.fillStyle = bg;
        g.beginPath();
        g.moveTo(lx, ly);
        g.lineTo(lx + Math.cos(a - 0.11) * L, ly + Math.sin(a - 0.11) * L * SQUASH);
        g.lineTo(lx + Math.cos(a + 0.11) * L, ly + Math.sin(a + 0.11) * L * SQUASH);
        g.closePath();
        g.fill();
    }
}

export function makeHeartCanopy(awake) {
    const W = 560, H = 420;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d");
    const r = rng(77);
    const pals = awake
        ? [["#fff1da", "#f7c4cf", "#c98aa6"], ["#ffe7c2", "#f3b9a6", "#c4867f"], ["#fdf3f6", "#efc2dc", "#b986b3"]]
        : [["#c9c4d2", "#9c95ad", "#6b6480"], ["#c3bcae", "#968e80", "#6a6358"], ["#bdbfcc", "#8f92a6", "#5e6075"]];
    // soft shadow beneath the crown
    const sg = g.createRadialGradient(W / 2, H * 0.62, 10, W / 2, H * 0.62, 230);
    sg.addColorStop(0, "rgba(60,40,70,0.35)");
    sg.addColorStop(1, "rgba(60,40,70,0)");
    g.fillStyle = sg;
    g.fillRect(0, 0, W, H);
    const blobs = [];
    for (let k = 0; k < 70; k++) {
        const a = r() * TAU;
        const d = Math.sqrt(r());
        blobs.push([W / 2 + Math.cos(a) * d * 190, H / 2 + Math.sin(a) * d * 115 - (1 - d) * 30, 26 + r() * 30 * (1.2 - d * 0.5), pals[Math.floor(r() * pals.length)]]);
    }
    blobs.sort((p, q) => p[1] - q[1]);
    for (const [x, y, rr, pal] of blobs) {
        // soft-edged puffs of blossom rather than hard balls
        const gr = g.createRadialGradient(x - rr * 0.3, y - rr * 0.4, rr * 0.1, x, y, rr);
        const edge = hex(pal[2]);
        gr.addColorStop(0, pal[0]);
        gr.addColorStop(0.55, pal[1]);
        gr.addColorStop(0.85, rgb(edge, 0.9));
        gr.addColorStop(1, rgb(edge, 0));
        g.fillStyle = gr;
        g.beginPath();
        g.arc(x, y, rr, 0, TAU);
        g.fill();
    }
    if (awake) {
        for (let k = 0; k < 120; k++) {
            const a = r() * TAU, d = Math.sqrt(r());
            g.fillStyle = r() < 0.5 ? "rgba(255,250,230,0.9)" : "rgba(255,214,130,0.9)";
            g.beginPath();
            g.arc(W / 2 + Math.cos(a) * d * 220, H / 2 + Math.sin(a) * d * 140, 1.2 + r() * 2, 0, TAU);
            g.fill();
        }
    }
    return c;
}

export function drawHeartTree(g, x, y, canopies, awake, t) {
    g.save();
    g.translate(x + 90, y + 10);
    g.scale(1, 0.2);
    const shg = g.createRadialGradient(0, 0, 0, 0, 0, 240);
    shg.addColorStop(0, "rgba(30,40,30,0.3)");
    shg.addColorStop(1, "rgba(30,40,30,0)");
    g.fillStyle = shg;
    g.beginPath();
    g.arc(0, 0, 240, 0, TAU);
    g.fill();
    g.restore();
    const tg = g.createLinearGradient(x - 30, 0, x + 30, 0);
    tg.addColorStop(0, "#8a6a5a");
    tg.addColorStop(1, "#4e3a40");
    g.fillStyle = tg;
    g.beginPath();
    g.moveTo(x - 46, y);
    g.quadraticCurveTo(x - 20, y - 90, x - 26, y - 200);
    g.lineTo(x + 22, y - 200);
    g.quadraticCurveTo(x + 18, y - 90, x + 50, y);
    g.closePath();
    g.fill();
    const sway = Math.sin(t * 0.5) * 3;
    const [dormant, bright] = canopies;
    const cw = dormant.width, ch = dormant.height;
    const ox = x - cw / 2 + sway, oy = y - 230 - ch / 2;
    g.drawImage(dormant, ox, oy);
    if (awake > 0) {
        g.globalAlpha = awake;
        g.drawImage(bright, ox, oy);
        g.globalAlpha = 1;
    }
}

export function drawMirror(g, x, y, ang, near, t) {
    g.fillStyle = "rgba(30,40,30,0.25)";
    g.beginPath();
    g.ellipse(x + 10, y + 2, 34, 7, 0, 0, TAU);
    g.fill();
    g.strokeStyle = "#a07c45";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x, y - BEAM_H);
    g.stroke();
    const dx = (Math.cos(ang) * 84) / 2, dy = (Math.sin(ang) * 84) / 2;
    g.lineCap = "round";
    g.strokeStyle = "#6f6a7a";
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(x - dx, y - BEAM_H - dy);
    g.lineTo(x + dx, y - BEAM_H + dy);
    g.stroke();
    g.strokeStyle = near ? "#ffffff" : "#dfe6ef";
    g.lineWidth = 4;
    g.stroke();
    g.lineCap = "butt";
}

export function drawChime(g, x, y, color, swing, near) {
    g.strokeStyle = "#7a5a40";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x - 15, y);
    g.lineTo(x - 15, y - 44);
    g.lineTo(x + 15, y - 44);
    g.lineTo(x + 15, y);
    g.stroke();
    const bx = x + Math.sin(swing) * 6;
    g.strokeStyle = "#5a4636";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y - 44);
    g.lineTo(bx, y - 34);
    g.stroke();
    const c = hex(color);
    const bg = g.createLinearGradient(bx - 9, 0, bx + 9, 0);
    bg.addColorStop(0, rgb(mix(c, [255, 255, 255], 0.5)));
    bg.addColorStop(1, rgb(mix(c, [60, 50, 70], 0.3)));
    g.fillStyle = bg;
    g.beginPath();
    g.moveTo(bx - 4, y - 34);
    g.quadraticCurveTo(bx - 10, y - 26, bx - 11, y - 16);
    g.lineTo(bx + 11, y - 16);
    g.quadraticCurveTo(bx + 10, y - 26, bx + 4, y - 34);
    g.closePath();
    g.fill();
    if (near) {
        g.strokeStyle = "rgba(255,255,255,0.8)";
        g.lineWidth = 1.5;
        g.stroke();
    }
}

export function drawSunstone(g, x, y) {
    const cg = g.createLinearGradient(x - 10, y - 44, x + 10, y);
    cg.addColorStop(0, "#fffbe2");
    cg.addColorStop(1, "#f0b04a");
    g.fillStyle = cg;
    g.beginPath();
    g.moveTo(x - 9, y - 4);
    g.lineTo(x - 12, y - 26);
    g.lineTo(x, y - 46);
    g.lineTo(x + 12, y - 26);
    g.lineTo(x + 9, y - 4);
    g.closePath();
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.6)";
    g.beginPath();
    g.moveTo(x - 6, y - 8);
    g.lineTo(x - 8, y - 26);
    g.lineTo(x, y - 40);
    g.closePath();
    g.fill();
}

export function drawTablet(g, x, y, unread, t) {
    g.fillStyle = "rgba(30,40,30,0.25)";
    g.beginPath();
    g.ellipse(x + 12, y + 2, 20, 5, 0, 0, TAU);
    g.fill();
    const sg = g.createLinearGradient(x - 12, 0, x + 12, 0);
    sg.addColorStop(0, "#c9c5ba");
    sg.addColorStop(1, "#8f8a80");
    g.fillStyle = sg;
    g.beginPath();
    g.moveTo(x - 12, y);
    g.lineTo(x - 12, y - 26);
    g.quadraticCurveTo(x, y - 40, x + 12, y - 26);
    g.lineTo(x + 12, y);
    g.closePath();
    g.fill();
    g.fillStyle = "#86a868";
    g.beginPath();
    g.ellipse(x - 4, y - 30, 7, 3, -0.3, 0, TAU);
    g.fill();
    const a = unread ? 0.55 + Math.sin(t * 2.5) * 0.35 : 0.35;
    g.strokeStyle = `rgba(150,220,255,${a})`;
    g.lineWidth = 1.6;
    for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.moveTo(x - 6, y - 22 + k * 6);
        g.lineTo(x + 6, y - 22 + k * 6);
        g.stroke();
    }
}

export function drawWhale(g, x, y, ang, size, t, alpha) {
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    g.globalAlpha = alpha;
    const L = size;
    const fin = Math.sin(t * 0.9) * 0.3;
    for (const side of [-1, 1]) {
        g.save();
        g.translate(L * 0.12, side * L * 0.11);
        g.rotate(side * (0.9 + fin));
        g.fillStyle = "#c3cfe6";
        g.beginPath();
        g.ellipse(-L * 0.1, 0, L * 0.14, L * 0.035, 0, 0, TAU);
        g.fill();
        g.restore();
    }
    const tail = Math.sin(t * 0.7) * 0.25;
    g.save();
    g.translate(-L * 0.46, 0);
    g.rotate(tail);
    g.fillStyle = "#c9d4ea";
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(-L * 0.08, -L * 0.04, -L * 0.14, -L * 0.13);
    g.quadraticCurveTo(-L * 0.06, -L * 0.02, -L * 0.1, 0);
    g.quadraticCurveTo(-L * 0.06, L * 0.02, -L * 0.14, L * 0.13);
    g.quadraticCurveTo(-L * 0.08, L * 0.04, 0, 0);
    g.fill();
    g.restore();
    const bg = g.createLinearGradient(0, -L * 0.13, 0, L * 0.13);
    bg.addColorStop(0, "#f4f7fd");
    bg.addColorStop(0.6, "#d3ddf0");
    bg.addColorStop(1, "#a9b8d8");
    g.fillStyle = bg;
    g.beginPath();
    g.moveTo(L * 0.5, 0);
    g.bezierCurveTo(L * 0.48, -L * 0.15, L * 0.1, -L * 0.15, -L * 0.2, -L * 0.07);
    g.quadraticCurveTo(-L * 0.4, -L * 0.03, -L * 0.48, 0);
    g.quadraticCurveTo(-L * 0.4, L * 0.03, -L * 0.2, L * 0.07);
    g.bezierCurveTo(L * 0.1, L * 0.15, L * 0.48, L * 0.15, L * 0.5, 0);
    g.fill();
    g.strokeStyle = "rgba(140,155,195,0.5)";
    g.lineWidth = 1.5;
    for (let k = 1; k <= 3; k++) {
        g.beginPath();
        g.moveTo(L * 0.36, k * 4 - 6);
        g.quadraticCurveTo(L * 0.1, k * 5 - 8, -L * 0.15, k * 3 - 5);
        g.stroke();
    }
    g.fillStyle = "#4d5a7a";
    g.beginPath();
    g.arc(L * 0.33, -L * 0.07, 2.5, 0, TAU);
    g.arc(L * 0.33, L * 0.07, 2.5, 0, TAU);
    g.fill();
    g.restore();
}

export function drawBird(g, x, y, ang, flap, size) {
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    g.strokeStyle = "#4f4a58";
    g.lineWidth = 2;
    g.lineCap = "round";
    const w = size * (0.6 + 0.4 * Math.abs(flap));
    g.beginPath();
    g.moveTo(-size * 0.35, -w);
    g.quadraticCurveTo(-size * 0.05, -w * 0.4, size * 0.15, 0);
    g.quadraticCurveTo(-size * 0.05, w * 0.4, -size * 0.35, w);
    g.stroke();
    g.restore();
}

export function drawSeed(g, x, y, t, k) {
    const bob = Math.sin(t * 1.6 + k) * 5;
    const yy = y - 26 + bob;
    const gr = g.createRadialGradient(x, yy, 0, x, yy, 30);
    gr.addColorStop(0, "rgba(255,240,180,0.9)");
    gr.addColorStop(1, "rgba(255,220,140,0)");
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, yy, 30, 0, TAU);
    g.fill();
    g.strokeStyle = "rgba(255,255,250,0.9)";
    g.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU + t * 0.3;
        g.beginPath();
        g.moveTo(x, yy);
        g.lineTo(x + Math.cos(a) * 10, yy + Math.sin(a) * 10);
        g.stroke();
    }
    g.fillStyle = "#fffdf2";
    g.beginPath();
    g.arc(x, yy, 3.5, 0, TAU);
    g.fill();
}
