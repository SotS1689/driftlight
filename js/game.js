// The living world: sailing, puzzles, discovery, and the painting of each frame.

import { TAU, clamp, lerp, dist, angleDiff, approach, hash2, hex, mix, rgb, rng, store, track } from "./util.js";
import * as W from "./world.js";
import * as A from "./art.js";
import * as S from "./audio.js";

const MAX_SPEED = 135;
const TURN_RATE = 1.7;
const DAY_LENGTH = 720; // seconds for a full day and night
const FOG_CELL = 100;
const FOG_N = W.WORLD.w / FOG_CELL;
// ?sandbox plays without reading or writing the saved voyage (for testing)
const SAVE_KEY = new URLSearchParams(location.search).has("sandbox") ? "sandbox" : "save";

// Colour of the light over the reach through the day: [phase, top tint, bottom tint, lamp glow]
const SKY = [
    [0.0, "#ffd9c7", "#f3c2cf", 0.45],
    [0.12, "#fff4e4", "#ffe9d6", 0.15],
    [0.3, "#fffaf2", "#f4f1ff", 0.05],
    [0.48, "#ffe4bb", "#ffcfae", 0.3],
    [0.6, "#f6bcc2", "#c7a3d4", 0.6],
    [0.7, "#a2a9dd", "#7f82c6", 0.9],
    [0.86, "#959cd5", "#7c7ec2", 0.95],
    [0.95, "#e6bfd0", "#c9a9d6", 0.7],
    [1.0, "#ffd9c7", "#f3c2cf", 0.45],
];

function skyAt(p) {
    for (let i = 0; i < SKY.length - 1; i++) {
        const a = SKY[i], b = SKY[i + 1];
        if (p >= a[0] && p <= b[0]) {
            const t = (p - a[0]) / (b[0] - a[0]);
            return { top: mix(hex(a[1]), hex(b[1]), t), bot: mix(hex(a[2]), hex(b[2]), t), glow: lerp(a[3], b[3], t) };
        }
    }
    return { top: hex(SKY[0][1]), bot: hex(SKY[0][2]), glow: SKY[0][3] };
}

function defaults() {
    return {
        x: W.START.x, y: W.START.y, h: W.START.heading,
        lit: { morrow: false, hollow: false, gale: false },
        heart: false, seeds: [], disc: [], notes: [], fog: "",
        time: 0.06, mirrors: W.MIRRORS.map((m) => m.state),
        songKnown: false, sail: "plain", rewards: [], playSeconds: 0,
    };
}

export function hasSave() {
    return !!store.get(SAVE_KEY, null);
}

export function createGame(canvas, hooks) {
    const ctx = canvas.getContext("2d");
    if (SAVE_KEY === "sandbox") store.remove(SAVE_KEY);
    let save = Object.assign(defaults(), store.get(SAVE_KEY, {}));
    let vw = 1, vh = 1, dpr = 1;
    let t = 0;
    let started = false;
    let paused = false;

    const skiff = { x: save.x, y: save.y, h: save.h, ovx: 0, ovy: 0, evx: 0, evy: 0, speed: 0 };
    const cam = { x: skiff.x, y: skiff.y - 60, z: 1 };

    // ---- Build the reach ---------------------------------------------------------
    const regionLit = (r) => r === "start" || (r === "heart" ? save.heart : !!save.lit[r]);
    const islands = W.ISLANDS.map((is) => ({ ...is, kind: "island", art: [A.renderIsland(is, false), null], bloom: regionLit(is.region) ? 1 : 0, fallPts: A.fallPoints(is) }));
    const rocks = W.ROCKS.map((r) => {
        const is = { ...r, trees: 0 };
        return { ...is, kind: "rock", art: [A.renderIsland(is, false), null], bloom: regionLit(r.region) ? 1 : 0, fallPts: [] };
    });
    const byId = Object.fromEntries([...islands, ...rocks].map((i) => [i.id, i]));
    const drawables = [...islands, ...rocks].sort((a, b) => a.y - b.y);
    const solids = [...islands, ...rocks];

    const tablets = W.NOTES.map((n) => {
        const is = byId[n.island];
        return { ...n, x: is.x - (is.lighthouse ? is.r * 0.32 : 0), y: is.y + is.r * W.SQUASH * 0.62, islandR: is.r };
    });
    const tabletsByIsland = {};
    for (const tb of tablets) (tabletsByIsland[tb.island] ||= []).push(tb);

    const clouds = [0, 1, 2, 3].map((k) => A.makeCloud(100 + k));
    const storms = [0, 1].map((k) => A.makeCloud(200 + k, true));
    const heartCanopy = [A.makeHeartCanopy(false), A.makeHeartCanopy(true)];
    const stormPuffs = (() => {
        const r = rng(5);
        return Array.from({ length: 70 }, () => ({
            a: r() * TAU, d: lerp(W.GALE.inner + 30, W.GALE.outer - 20, r()), s: 0.9 + r() * 0.9, k: r() < 0.5 ? 0 : 1, w: 0.03 + r() * 0.03,
        }));
    })();

    const mirrors = W.MIRRORS.map((m, i) => ({ ...m, state: save.mirrors[i], ang: (save.mirrors[i] * Math.PI) / 4 }));
    const chimes = W.CHIMES.map((c) => ({ ...c, glow: 0, swing: 0, swingV: 0, inside: false }));
    const lights = {
        morrow: { x: byId.morrow.x, y: byId.morrow.y, v: save.lit.morrow ? 1 : 0 },
        hollow: { x: byId.hollow.x, y: byId.hollow.y, v: save.lit.hollow ? 1 : 0 },
        gale: { x: byId.gale.x, y: byId.gale.y, v: save.lit.gale ? 1 : 0 },
    };
    let heartAwake = save.heart ? 1 : 0;
    let stormCalm = save.lit.gale ? 1 : 0;
    let morrowHold = 0;
    let songIdx = 0;
    let songPlaying = null;
    const currentAct = W.CURRENTS.map(() => 0);
    let carried = false;
    let inStorm = 0;

    const whales = [{ s: 0.3, size: 380, off: 0, alpha: 0.85 }];
    if (save.heart) addWhales();
    function addWhales() {
        if (whales.length > 1) return;
        whales.push({ s: 0.3, size: 300, off: -0.09, alpha: 0.8 }, { s: 0.3, size: 170, off: -0.05, alpha: 0.8, calf: true });
    }
    let whaleSongAt = 8;

    const flocks = (() => {
        const r = rng(9);
        return Array.from({ length: 4 }, () => ({
            x: r() * W.WORLD.w, y: r() * W.WORLD.h, a: r() * TAU, turn: 0,
            birds: Array.from({ length: 4 + Math.floor(r() * 3) }, (_, i) => ({ dx: -i * 26 + r() * 10, dy: (i % 2 ? 1 : -1) * i * 18, ph: r() * TAU })),
        }));
    })();

    const fog = new Uint8Array(FOG_N * FOG_N);
    if (save.fog) for (let i = 0; i < save.fog.length && i < fog.length; i++) fog[i] = save.fog.charCodeAt(i) === 49 ? 1 : 0;
    let fogCount = fog.reduce((a, b) => a + b, 0);
    let lastFog = { x: -1e9, y: -1e9 };

    const particles = [];
    const ripples = [];
    let wakeTimer = 0;

    // ---- Input ------------------------------------------------------------------
    const keys = new Set();
    let pointer = null; // {sx, sy, down, held, moved, startT}
    let dest = null;
    window.addEventListener("keydown", (e) => {
        if (e.target instanceof HTMLInputElement) return;
        const k = e.key.toLowerCase();
        if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
        keys.add(k);
        if ((k === "e" || k === " " || k === "enter") && started && !paused && !e.repeat) interact();
    });
    window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => keys.clear());

    const toWorld = (sx, sy) => [(sx - vw / 2) / cam.z + cam.x, (sy - vh / 2) / cam.z + cam.y];
    canvas.addEventListener("pointerdown", (e) => {
        if (!started || paused) return;
        canvas.setPointerCapture(e.pointerId);
        pointer = { sx: e.offsetX, sy: e.offsetY, ox: e.offsetX, oy: e.offsetY, held: false, startT: performance.now(), id: e.pointerId };
    });
    canvas.addEventListener("pointermove", (e) => {
        if (!pointer || pointer.id !== e.pointerId) return;
        pointer.sx = e.offsetX;
        pointer.sy = e.offsetY;
        if (Math.hypot(pointer.sx - pointer.ox, pointer.sy - pointer.oy) > 12) pointer.held = true;
    });
    const endPointer = (e) => {
        if (!pointer || pointer.id !== e.pointerId) return;
        const quick = performance.now() - pointer.startT < 300 && !pointer.held;
        if (quick) {
            const [wx, wy] = toWorld(pointer.sx, pointer.sy);
            if (!interactAt(wx, wy)) dest = { x: wx, y: wy, t: 0 };
        } else dest = null;
        pointer = null;
    };
    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", endPointer);

    // ---- Interactions ---------------------------------------------------------------
    function candidates() {
        const out = [];
        const d = (x, y) => dist(skiff.x, skiff.y, x, y);
        for (const tb of tablets) if (d(tb.x, tb.y) < 175) out.push({ x: tb.x, y: tb.y - 20, label: "Read the stone", act: () => readNote(tb) });
        if (!save.lit.morrow)
            mirrors.forEach((m, i) => {
                if (d(m.x, m.y) < 165) out.push({ x: m.x, y: m.y - A.BEAM_H, label: "Turn the mirror", act: () => turnMirror(i) });
            });
        chimes.forEach((c, i) => {
            // chimes mostly ring by sailing through, so a tap must land right on the stone
            if (d(c.x, c.y) < 120) out.push({ x: c.x, y: c.y - 30, tapR: 40, label: "Ring the chime", act: () => ringChime(i) });
        });
        const gale = byId.gale;
        if (!save.lit.gale && d(gale.x, gale.y) < gale.r + 150) out.push({ x: gale.x, y: gale.y - A.TOWER_H, label: "Light the lamp", act: () => lightUp("gale") });
        const heart = byId.heart;
        if (allLit() && !save.heart && d(heart.x, heart.y) < heart.r + 170) out.push({ x: heart.x, y: heart.y - 200, label: "Wake the Heartbeacon", act: wakeHeart });
        out.forEach((c) => (c.d = d(c.x, c.y)));
        out.sort((a, b) => a.d - b.d);
        return out;
    }
    let near = [];
    let promptLabel = null;

    function interact() {
        if (cinematic) return;
        if (near[0]) near[0].act();
    }
    function interactAt(wx, wy) {
        if (cinematic) return true;
        const hit = near.find((c) => dist(c.x, c.y, wx, wy) < (c.tapR || 90));
        if (hit) {
            hit.act();
            return true;
        }
        return false;
    }

    function readNote(tb) {
        if (!save.notes.includes(tb.id)) {
            save.notes.push(tb.id);
            track("note_read", { note: tb.id });
        }
        if (tb.song) {
            save.songKnown = true;
            playSong();
        }
        hooks.onNote(tb);
        persist();
    }

    function turnMirror(i) {
        const m = mirrors[i];
        m.state = (m.state + 1) % 4;
        save.mirrors[i] = m.state;
        S.pluck(392 + i * 98, 0.06);
        persist();
    }

    function ringChime(i) {
        const c = chimes[i];
        S.bell(c.note, 0.16);
        c.glow = 1;
        c.swingV = 3;
        ripples.push({ x: c.x, y: c.y, t: 0, color: c.color });
        if (save.lit.hollow || !save.songKnown || songPlaying) return;
        if (W.SONG[songIdx] === i) {
            songIdx++;
            hooks.onSong(songIdx, "right");
            if (songIdx === W.SONG.length) {
                setTimeout(() => lightUp("hollow"), 900);
            }
        } else if (songIdx > 0) {
            songIdx = W.SONG[0] === i ? 1 : 0;
            setTimeout(S.sigh, 300);
            hooks.onSong(songIdx, "wrong");
        }
    }

    function playSong() {
        songIdx = 0;
        songPlaying = { k: 0, at: t + 0.8 };
        hooks.onSong(0, "listen");
    }

    const allLit = () => save.lit.morrow && save.lit.hollow && save.lit.gale;

    const LIGHT_TEXT = {
        morrow: ["Morrow Light burns again", "The morning has found its way home."],
        hollow: ["Hollowsong Light burns again", "She remembers her own song."],
        gale: ["Galewatch Light burns again", "The storm lies down like a tired dog."],
    };
    function lightUp(id) {
        if (save.lit[id]) return;
        save.lit[id] = true;
        S.arpeggio([523.25, 659.25, 783.99, 1046.5, 1318.5], 0.2, 0.12);
        const L = lights[id];
        burst(L.x, L.y - A.TOWER_H, 40, "#ffe9a8");
        hooks.onToast(LIGHT_TEXT[id][0], LIGHT_TEXT[id][1]);
        track("lighthouse_lit", { lighthouse: id });
        if (allLit()) setTimeout(() => hooks.onToast("All three lights burn", "Far off, the Heartbeacon stirs. Return to the centre of the reach."), 5200);
        hooks.onProgress();
        persist();
    }

    let cinematic = null;
    function wakeHeart() {
        save.heart = true;
        cinematic = { t: 0 };
        dest = null;
        addWhales();
        S.arpeggio([261.63, 392.0, 523.25, 659.25, 783.99, 1046.5, 1568], 0.32, 0.13);
        track("heart_awakened", { minutes: Math.round(save.playSeconds / 60) });
        hooks.onProgress();
        persist();
    }

    // ---- Persistence ------------------------------------------------------------------
    function persist() {
        save.x = skiff.x;
        save.y = skiff.y;
        save.h = skiff.h;
        let s = "";
        for (let i = 0; i < fog.length; i++) s += fog[i] ? "1" : "0";
        save.fog = s;
        store.set(SAVE_KEY, save);
    }
    let saveTimer = 0;

    // ---- Simulation ---------------------------------------------------------------------
    function revealFog() {
        if (dist(skiff.x, skiff.y, lastFog.x, lastFog.y) < 60) return;
        lastFog = { x: skiff.x, y: skiff.y };
        const R = 650;
        const x0 = Math.max(0, Math.floor((skiff.x - R) / FOG_CELL)), x1 = Math.min(FOG_N - 1, Math.floor((skiff.x + R) / FOG_CELL));
        const y0 = Math.max(0, Math.floor((skiff.y - R) / FOG_CELL)), y1 = Math.min(FOG_N - 1, Math.floor((skiff.y + R) / FOG_CELL));
        for (let y = y0; y <= y1; y++)
            for (let x = x0; x <= x1; x++) {
                const i = y * FOG_N + x;
                if (!fog[i] && dist((x + 0.5) * FOG_CELL, (y + 0.5) * FOG_CELL, skiff.x, skiff.y) < R) {
                    fog[i] = 1;
                    fogCount++;
                }
            }
    }

    function whalePos(w) {
        const P = W.WHALE_PATH;
        const s = w.s + w.off;
        const x = P.x + Math.cos(s * TAU) * P.rx + (w.calf ? Math.sin(t * 0.3) * 40 : 0);
        const y = P.y + Math.sin(s * TAU) * P.ry + (w.calf ? 60 : 0) + (w.off ? 90 : 0);
        const ang = Math.atan2(Math.cos(s * TAU) * P.ry, -Math.sin(s * TAU) * P.rx);
        return [x, y, ang];
    }

    let discTimer = 0;
    function checkDiscoveries() {
        for (const d of W.DISCOVERIES) {
            if (save.disc.includes(d.id)) continue;
            let found = false;
            if (d.rim) found = skiff.x < 380 || skiff.y < 380 || skiff.x > W.WORLD.w - 380 || skiff.y > W.WORLD.h - 380;
            else if (d.whale) {
                const [x, y] = whalePos(whales[0]);
                found = dist(x, y, skiff.x, skiff.y) < d.r;
            } else found = dist(d.x, d.y, skiff.x, skiff.y) < d.r;
            if (found) {
                save.disc.push(d.id);
                hooks.onToast(d.name, d.line);
                S.arpeggio([659.25, 783.99, 987.77], 0.16, 0.07);
                track("discovery", { place: d.id });
                hooks.onProgress();
                persist();
            }
        }
    }

    function collectSeeds() {
        for (const sd of W.SEEDS) {
            if (save.seeds.includes(sd.id)) continue;
            if (dist(sd.x, sd.y - 26, skiff.x, skiff.y) < 64) {
                save.seeds.push(sd.id);
                S.pluck(880 + save.seeds.length * 18, 0.07);
                burst(sd.x, sd.y - 26, 14, "#fff2c4");
                const rw = W.SEED_REWARDS.find((r) => r.count === save.seeds.length);
                if (rw) {
                    save.rewards.push(rw.id);
                    save.sail = rw.id;
                    setTimeout(() => hooks.onToast(rw.name, rw.text), 600);
                    track("seed_reward", { reward: rw.id });
                }
                hooks.onProgress();
                persist();
            }
        }
    }

    function burst(x, y, n, color) {
        for (let i = 0; i < n; i++) {
            const a = Math.random() * TAU, sp = 20 + Math.random() * 60;
            particles.push({ type: "spark", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20, life: 0, max: 1.2 + Math.random() * 1.2, size: 2 + Math.random() * 3, color });
        }
    }

    function traceBeam() {
        let x = W.SUNSTONE.x, y = W.SUNSTONE.y, dx = W.SUNSTONE.dir[0], dy = W.SUNSTONE.dir[1];
        const pts = [[x, y]];
        let hit = false, last = -1;
        const tower = lights.morrow;
        for (let bounce = 0; bounce < 8; bounce++) {
            let best = 4200, kind = null, mi = -1;
            mirrors.forEach((m, i) => {
                if (i === last) return;
                const ex = (Math.cos(m.ang) * W.MIRROR_LEN) / 2, ey = (Math.sin(m.ang) * W.MIRROR_LEN) / 2;
                const px = m.x - ex - x, py = m.y - ey - y, sx = 2 * ex, sy = 2 * ey;
                const den = dx * sy - dy * sx;
                if (Math.abs(den) < 1e-6) return;
                const tt = (px * sy - py * sx) / den;
                const u = (px * dy - py * dx) / den;
                if (tt > 1 && u >= 0 && u <= 1 && tt < best) {
                    best = tt;
                    kind = "mirror";
                    mi = i;
                }
            });
            // tower: ray vs circle
            {
                const ox = x - tower.x, oy = y - tower.y;
                const b = ox * dx + oy * dy, c = ox * ox + oy * oy - 36 * 36;
                const disc = b * b - c;
                if (disc > 0) {
                    const tt = -b - Math.sqrt(disc);
                    if (tt > 1 && tt < best) {
                        best = tt;
                        kind = "tower";
                    }
                }
            }
            for (const is of islands) {
                if (is.id === "morrow") continue;
                const ox = x - is.x, oy = (y - is.y) / W.SQUASH, ddy = dy / W.SQUASH;
                const a = dx * dx + ddy * ddy, b = ox * dx + oy * ddy, c = ox * ox + oy * oy - (is.r * 0.95) ** 2;
                const disc = b * b - a * c;
                if (disc > 0) {
                    const tt = (-b - Math.sqrt(disc)) / a;
                    if (tt > 1 && tt < best) {
                        best = tt;
                        kind = "block";
                    }
                }
            }
            x += dx * best;
            y += dy * best;
            pts.push([x, y]);
            if (kind === "mirror") {
                const m = mirrors[mi];
                const ux = Math.cos(m.ang), uy = Math.sin(m.ang);
                const dot = dx * ux + dy * uy;
                dx = 2 * dot * ux - dx;
                dy = 2 * dot * uy - dy;
                last = mi;
                m.lit = 1;
            } else {
                hit = kind === "tower";
                break;
            }
        }
        return { pts, hit };
    }
    let beam = { pts: [], hit: false };

    function steer(dt) {
        let ix = 0, iy = 0;
        if (keys.has("arrowleft") || keys.has("a")) ix -= 1;
        if (keys.has("arrowright") || keys.has("d")) ix += 1;
        if (keys.has("arrowup") || keys.has("w")) iy -= 1;
        if (keys.has("arrowdown") || keys.has("s")) iy += 1;
        let arrive = 1;
        if (ix || iy) dest = null;
        else if (pointer && pointer.held) {
            const [wx, wy] = toWorld(pointer.sx, pointer.sy);
            ix = wx - skiff.x;
            iy = wy - skiff.y;
            if (Math.hypot(ix, iy) < 30) ix = iy = 0;
        } else if (dest) {
            ix = dest.x - skiff.x;
            iy = dest.y - skiff.y;
            const d = Math.hypot(ix, iy);
            arrive = clamp(d / 160, 0.2, 1);
            if (d < 35) {
                dest = null;
                ix = iy = 0;
            }
        }
        let len = Math.hypot(ix, iy);
        if (len > 0) {
            ix /= len;
            iy /= len;
            // gently slide around islands that lie ahead
            for (const is of solids) {
                const dx = skiff.x - is.x, dy = (skiff.y - is.y) / W.SQUASH;
                const d = Math.hypot(dx, dy);
                const clear = d - is.r - 24;
                if (clear > 150 || d < 1) continue;
                const nx = dx / d, ny = dy / d;
                const toward = -(ix * nx + iy * ny);
                if (toward <= 0) continue;
                const k = (1 - Math.max(0, clear) / 150) * toward;
                let tx = -ny, ty = nx;
                if (tx * ix + ty * iy < 0) { tx = -tx; ty = -ty; }
                ix += tx * k * 1.3 + nx * k * 0.4;
                iy += ty * k * 1.3 + ny * k * 0.4;
            }
            len = Math.hypot(ix, iy) || 1;
            ix /= len;
            iy /= len;
            const target = Math.atan2(iy, ix);
            const diff = angleDiff(skiff.h, target);
            skiff.h += clamp(diff, -TURN_RATE * dt, TURN_RATE * dt);
            const align = clamp(Math.cos(diff), 0.2, 1);
            const sp = MAX_SPEED * align * arrive;
            skiff.ovx = approach(skiff.ovx, Math.cos(skiff.h) * sp, 0.9, dt);
            skiff.ovy = approach(skiff.ovy, Math.sin(skiff.h) * sp, 0.9, dt);
        } else {
            skiff.ovx = approach(skiff.ovx, 0, 0.6, dt);
            skiff.ovy = approach(skiff.ovy, 0, 0.6, dt);
        }
    }

    function forces(dt) {
        let tx = 0, ty = 0;
        carried = false;
        // breathing currents
        W.CURRENTS.forEach((c, i) => {
            const on = (((t - c.start) % W.CURRENT_PERIOD) + W.CURRENT_PERIOD) % W.CURRENT_PERIOD < W.CURRENT_ON;
            const was = currentAct[i] > 0.5;
            currentAct[i] = approach(currentAct[i], on ? 1 : 0, 3, dt);
            if (on && !was && dist(skiff.x, skiff.y, c.a[0], c.a[1]) < 900 && !save.lit.gale) S.whoosh();
            if (!on) return;
            const ax = c.b[0] - c.a[0], ay = c.b[1] - c.a[1];
            const L = Math.hypot(ax, ay);
            const ux = ax / L, uy = ay / L;
            const px = skiff.x - c.a[0], py = skiff.y - c.a[1];
            const along = px * ux + py * uy;
            const perp = -px * uy + py * ux;
            if (along > -120 && along < L - 20 && Math.abs(perp) < 90) {
                carried = true;
                tx += ux * 250 + uy * perp * 1.6;
                ty += uy * 250 - ux * perp * 1.6;
            }
        });
        // the storm wall
        const gd = dist(skiff.x, skiff.y, W.GALE.x, W.GALE.y);
        const inWall = gd > W.GALE.inner && gd < W.GALE.outer;
        let inEddy = false;
        for (const e of W.EDDIES) {
            const d = dist(skiff.x, skiff.y, e.x, e.y);
            if (d < e.r) {
                inEddy = true;
                if (!carried) {
                    tx += (e.x - skiff.x) * 0.5;
                    ty += (e.y - skiff.y) * 0.5;
                }
            }
        }
        const storm = (1 - stormCalm) * (inWall ? 1 : 0);
        inStorm = approach(inStorm, storm && !inEddy ? 1 : 0, 2, dt);
        if (storm && !inEddy && !carried) {
            const k = 200 * storm;
            tx += ((skiff.x - W.GALE.x) / gd) * k;
            ty += ((skiff.y - W.GALE.y) / gd) * k;
        }
        // the soft edge of the world
        const m = 260;
        if (skiff.x < m) tx += (m - skiff.x) * 0.9;
        if (skiff.y < m) ty += (m - skiff.y) * 0.9;
        if (skiff.x > W.WORLD.w - m) tx -= (skiff.x - W.WORLD.w + m) * 0.9;
        if (skiff.y > W.WORLD.h - m) ty -= (skiff.y - W.WORLD.h + m) * 0.9;
        skiff.evx = approach(skiff.evx, tx, carried ? 2.5 : 1.4, dt);
        skiff.evy = approach(skiff.evy, ty, carried ? 2.5 : 1.4, dt);
    }

    function collide() {
        for (const is of solids) {
            const dx = skiff.x - is.x, dy = (skiff.y - is.y) / W.SQUASH;
            const d = Math.hypot(dx, dy);
            const min = is.r * 0.96 + 20;
            if (d < min && d > 0.01) {
                const nx = dx / d, ny = dy / d;
                skiff.x = is.x + nx * min;
                skiff.y = is.y + ny * min * W.SQUASH;
                const vn = skiff.ovx * nx + skiff.ovy * ny;
                if (vn < 0) {
                    skiff.ovx -= vn * nx;
                    skiff.ovy -= vn * ny;
                }
                const en = skiff.evx * nx + skiff.evy * ny;
                if (en < 0) {
                    skiff.evx -= en * nx;
                    skiff.evy -= en * ny;
                }
            }
        }
    }

    function update(dt) {
        t += dt;
        save.time = (save.time + dt / DAY_LENGTH) % 1;
        if (started) save.playSeconds += dt;

        if (started && !cinematic && !paused) steer(dt);
        else {
            skiff.ovx = approach(skiff.ovx, 0, 0.8, dt);
            skiff.ovy = approach(skiff.ovy, 0, 0.8, dt);
        }
        forces(dt);
        const windA = 0.5 + Math.sin(t * 0.013) * 0.9;
        const vx = skiff.ovx + skiff.evx + Math.cos(windA) * 5;
        const vy = skiff.ovy + skiff.evy + Math.sin(windA) * 5;
        skiff.x += vx * dt;
        skiff.y += vy * dt;
        collide();
        skiff.speed = Math.hypot(vx, vy);
        if (carried || skiff.speed > 25) {
            // face where the wind carries us when riding a current
            if (carried) skiff.h += clamp(angleDiff(skiff.h, Math.atan2(vy, vx)), -2 * dt, 2 * dt);
        }
        S.setWindStrength(inStorm + (carried ? 0.5 : 0));

        // wake
        wakeTimer -= dt;
        if (skiff.speed > 20 && wakeTimer <= 0) {
            wakeTimer = 0.07;
            const bx = skiff.x - Math.cos(skiff.h) * 30, by = skiff.y - Math.sin(skiff.h) * 30;
            particles.push({ type: save.sail === "gold" ? "goldwake" : "wake", x: bx + (Math.random() - 0.5) * 8, y: by + (Math.random() - 0.5) * 8, vx: 0, vy: 0, life: 0, max: 2.6, size: 5 + Math.random() * 4 });
        }

        // camera
        let target = { x: skiff.x + vx * 0.7, y: skiff.y + vy * 0.7 - 40, z: baseZoom() };
        if (!started) {
            target = { x: W.START.x + Math.cos(t * 0.05) * 260, y: W.START.y - 320 + Math.sin(t * 0.05) * 160, z: baseZoom() * 0.9 };
        }
        if (cinematic) {
            cinematic.t += dt;
            const h = byId.heart;
            target = { x: h.x, y: h.y - 120, z: baseZoom() * 0.72 };
            heartAwake = clamp(cinematic.t / 6, 0, 1);
            if (cinematic.t > 2 && cinematic.t < 7 && Math.random() < 0.6) burst(h.x + (Math.random() - 0.5) * 400, h.y - 230 + (Math.random() - 0.5) * 200, 1, "#ffd6e2");
            if (cinematic.t > 9) {
                cinematic = null;
                hooks.onFinale();
            }
        }
        cam.x = approach(cam.x, target.x, cinematic ? 0.8 : 1.6, dt);
        cam.y = approach(cam.y, target.y, cinematic ? 0.8 : 1.6, dt);
        cam.z = approach(cam.z, target.z, 1, dt);

        // regions bloom when their light is lit
        for (const is of drawables) {
            const goal = regionLit(is.region) ? 1 : 0;
            if (goal && !is.art[1]) is.art[1] = A.renderIsland(is.kind === "rock" ? { ...is, trees: 0 } : is, true);
            is.bloom = approach(is.bloom, goal, 0.6, dt);
        }
        for (const id in lights) lights[id].v = approach(lights[id].v, save.lit[id] ? 1 : 0, 1.2, dt);
        stormCalm = approach(stormCalm, save.lit.gale ? 1 : 0, 0.35, dt);
        if (save.heart && !cinematic) heartAwake = approach(heartAwake, 1, 1, dt);

        // Morrow beam
        for (const m of mirrors) {
            const goal = (m.state * Math.PI) / 4;
            // rotate forward only, so the mirror visibly turns rather than snapping back
            let d = goal - m.ang;
            while (d < -0.001) d += Math.PI;
            m.ang += Math.min(d, 2.2 * dt);
            if (Math.abs(goal - (m.ang % Math.PI)) < 0.002) m.ang = goal;
            m.lit = 0;
        }
        beam = traceBeam();
        if (beam.hit && !save.lit.morrow) {
            morrowHold += dt;
            if (morrowHold > 1.4) lightUp("morrow");
        } else morrowHold = 0;

        // Hollowsong
        chimes.forEach((c, i) => {
            c.glow = Math.max(0, c.glow - dt * 0.7);
            c.swingV -= c.swing * 6 * dt;
            c.swingV *= 1 - 0.9 * dt;
            c.swing += c.swingV * dt;
            // ring on passing close; the skiff must sail well clear before it can ring again
            const cd = dist(skiff.x, skiff.y, c.x, c.y);
            if (cd < 90 && !c.inside && started) {
                ringChime(i);
                c.inside = true;
            } else if (cd > 170) c.inside = false;
        });
        if (songPlaying && t >= songPlaying.at) {
            const i = W.SONG[songPlaying.k];
            const c = chimes[i];
            S.bell(c.note, 0.14);
            c.glow = 1;
            c.swingV = 2;
            ripples.push({ x: c.x, y: c.y, t: 0, color: c.color });
            hooks.onSong(0, "listen", songPlaying.k);
            songPlaying.k++;
            songPlaying.at = t + 0.95;
            if (songPlaying.k >= W.SONG.length) {
                songPlaying = null;
                setTimeout(() => hooks.onSong(0, "ready"), 900);
            }
        }
        for (let i = ripples.length - 1; i >= 0; i--) {
            ripples[i].t += dt;
            if (ripples[i].t > 2.4) ripples.splice(i, 1);
        }

        // whales and birds
        for (const w of whales) w.s = (w.s + W.WHALE_PATH.speed * dt) % 1;
        whaleSongAt -= dt;
        if (whaleSongAt <= 0) {
            const [x, y] = whalePos(whales[0]);
            const d = dist(x, y, skiff.x, skiff.y);
            if (d < 1100 && started) S.whaleSong(0.09 * (1 - d / 1100) + 0.02);
            whaleSongAt = 14 + Math.random() * 12;
        }
        for (const f of flocks) {
            f.turn = approach(f.turn, Math.sin(t * 0.05 + f.x * 0.001) * 0.15, 0.5, dt);
            f.a += f.turn * dt;
            f.x = (f.x + Math.cos(f.a) * 38 * dt + W.WORLD.w) % W.WORLD.w;
            f.y = (f.y + Math.sin(f.a) * 38 * dt + W.WORLD.h) % W.WORLD.h;
        }

        // particles
        const sky = skyAt(save.time);
        if (sky.glow > 0.55 && Math.random() < dt * 6) {
            particles.push({ type: "firefly", x: cam.x + (Math.random() - 0.5) * vw / cam.z, y: cam.y + (Math.random() - 0.5) * vh / cam.z, vx: (Math.random() - 0.5) * 10, vy: -4 - Math.random() * 6, life: 0, max: 5 + Math.random() * 4, size: 2 + Math.random() * 2 });
        }
        const bloomedNear = drawables.some((is) => is.bloom > 0.5 && is.kind === "island" && dist(is.x, is.y, cam.x, cam.y) < 900 && is.region !== "start");
        if (bloomedNear && Math.random() < dt * 3) {
            particles.push({ type: "petal", x: cam.x + (Math.random() - 0.5) * vw / cam.z, y: cam.y - vh / cam.z / 2 + Math.random() * 100, vx: 15 + Math.random() * 15, vy: 12 + Math.random() * 10, life: 0, max: 9, size: 3, spin: Math.random() * TAU });
        }
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.life += dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            if (p.type === "spark") p.vy += 14 * dt;
            if (p.type === "petal") p.spin += dt * 2;
            if (p.life > p.max) particles.splice(i, 1);
        }
        if (particles.length > 450) particles.splice(0, particles.length - 450);

        if (started) {
            revealFog();
            collectSeeds();
            discTimer -= dt;
            if (discTimer <= 0) {
                discTimer = 0.5;
                checkDiscoveries();
            }
            near = cinematic ? [] : candidates();
            const label = near[0] ? near[0].label : null;
            if (label !== promptLabel) {
                promptLabel = label;
                hooks.onPrompt(label);
            }
            saveTimer -= dt;
            if (saveTimer <= 0) {
                saveTimer = 4;
                persist();
            }
        }
    }

    function baseZoom() {
        return clamp(Math.min(vw, vh * 1.2) / 1050, 0.5, 1);
    }

    // ---- Rendering -------------------------------------------------------------------------
    function setLayer(g, p, z, d, cx, cy) {
        g.setTransform(d * z, 0, 0, d * z, d * (vw / 2 - cx * p * z), d * (vh / 2 - cy * p * z));
    }

    function cloudLayer(g, p, cell, seed, smin, smax, alpha, drift, cx, cy, z) {
        const ox = t * drift, oy = t * drift * 0.35;
        const hw = vw / 2 / z + 400, hh = vh / 2 / z + 300;
        const x0 = Math.floor((cx * p - hw - ox) / cell), x1 = Math.floor((cx * p + hw - ox) / cell);
        const y0 = Math.floor((cy * p - hh - oy) / cell), y1 = Math.floor((cy * p + hh - oy) / cell);
        g.globalAlpha = alpha;
        for (let gy = y0; gy <= y1; gy++)
            for (let gx = x0; gx <= x1; gx++) {
                const h = hash2(gx, gy, seed);
                if (h < 0.18) continue;
                const px = gx * cell + hash2(gx, gy, seed + 1) * cell + ox;
                const py = gy * cell + hash2(gx, gy, seed + 2) * cell + oy;
                const sc = smin + hash2(gx, gy, seed + 3) * (smax - smin);
                const spr = clouds[Math.floor(h * 4) % 4];
                g.drawImage(spr, px - 180 * sc, py - 110 * sc, 360 * sc, 220 * sc);
            }
        g.globalAlpha = 1;
    }

    function inView(x, y, rx, ry, cx, cy, z) {
        return Math.abs(x - cx) < vw / 2 / z + rx && Math.abs(y - cy) < vh / 2 / z + ry;
    }

    function drawFall(g, f) {
        // three loose strands that sway a little, brightest near the rim
        for (let k = 0; k < 3; k++) {
            const off = (k - 1) * f.w * 0.3;
            const sway = Math.sin(t * 0.8 + f.phase + k) * 3;
            const w = f.w * (k === 1 ? 0.55 : 0.35);
            const gr = g.createLinearGradient(0, f.y, 0, f.y + f.len);
            gr.addColorStop(0, "rgba(240,250,255,0.85)");
            gr.addColorStop(0.5, "rgba(225,240,255,0.42)");
            gr.addColorStop(1, "rgba(225,240,255,0)");
            g.fillStyle = gr;
            g.beginPath();
            g.moveTo(f.x + off - w / 2, f.y);
            g.lineTo(f.x + off + w / 2, f.y);
            g.quadraticCurveTo(f.x + off + w * 0.7 + sway, f.y + f.len * 0.5, f.x + off * 1.6 + w * 1.2 + sway, f.y + f.len);
            g.lineTo(f.x + off * 1.6 - w * 1.2 + sway, f.y + f.len);
            g.quadraticCurveTo(f.x + off - w * 0.7 + sway, f.y + f.len * 0.5, f.x + off - w / 2, f.y);
            g.fill();
        }
        g.strokeStyle = "rgba(255,255,255,0.5)";
        g.lineWidth = 1.2;
        for (let k = 0; k < 5; k++) {
            const yy = (t * 70 + k * (f.len / 5) + f.phase * 40) % (f.len * 0.75);
            const xx = f.x + (k - 2) * f.w * 0.18;
            g.globalAlpha = 1 - yy / (f.len * 0.75);
            g.beginPath();
            g.moveTo(xx, f.y + yy);
            g.lineTo(xx, f.y + yy + 16);
            g.stroke();
        }
        g.globalAlpha = 1;
        if (Math.random() < 0.25) {
            particles.push({ type: "mist", x: f.x + (Math.random() - 0.5) * f.w * 2, y: f.y + f.len * (0.7 + Math.random() * 0.25), vx: (Math.random() - 0.5) * 8, vy: 4, life: 0, max: 3, size: 10 + Math.random() * 12 });
        }
    }

    function drawDrawable(g, is, sky) {
        const a = is.art[0];
        g.drawImage(a.canvas, is.x - a.cx, is.y - a.cy, a.W, a.H);
        if (is.art[1] && is.bloom > 0.01) {
            const b = is.art[1];
            g.globalAlpha = is.bloom;
            g.drawImage(b.canvas, is.x - b.cx, is.y - b.cy, b.W, b.H);
            g.globalAlpha = 1;
        }
        for (const f of is.fallPts) drawFall(g, f);
        if (is.lighthouse) A.drawLighthouse(g, is.x, is.y, lights[is.id].v);
        if (is.id === "heart") A.drawHeartTree(g, is.x, is.y - 10, heartCanopy, heartAwake, t);
        const tbs = tabletsByIsland[is.id];
        if (tbs) for (const tb of tbs) A.drawTablet(g, tb.x, tb.y, !save.notes.includes(tb.id), t);
        if (is.id === "sunrock") A.drawSunstone(g, is.x, is.y);
        if (is.id.startsWith("rock-m")) {
            const m = mirrors[+is.id.slice(6) - 1];
            A.drawMirror(g, m.x, m.y, m.ang, near.some((c) => c.label === "Turn the mirror" && c.x === m.x && c.y === m.y - A.BEAM_H), t);
        }
        if (is.id.startsWith("rock-c")) {
            const i = +is.id.slice(6);
            const c = chimes[i];
            A.drawChime(g, c.x, c.y, c.color, c.swing, dist(skiff.x, skiff.y, c.x, c.y) < 120);
        }
    }

    function render(g, opt = {}) {
        const z = opt.z ?? cam.z, cx = opt.x ?? cam.x, cy = opt.y ?? cam.y, d = opt.dpr ?? dpr;
        const sky = skyAt(opt.time ?? save.time);
        g.setTransform(d, 0, 0, d, 0, 0);
        const base = g.createLinearGradient(0, 0, 0, vh);
        base.addColorStop(0, "#e9edf6");
        base.addColorStop(1, "#dbe0ee");
        g.fillStyle = base;
        g.fillRect(0, 0, vw, vh);

        // deep clouds, washed back by haze
        setLayer(g, 0.55, z, d, cx, cy);
        cloudLayer(g, 0.55, 430, 11, 1.4, 2.4, 0.9, 6, cx, cy, z);
        g.setTransform(d, 0, 0, d, 0, 0);
        g.fillStyle = "rgba(214,220,238,0.42)";
        g.fillRect(0, 0, vw, vh);
        setLayer(g, 0.8, z, d, cx, cy);
        cloudLayer(g, 0.8, 330, 23, 0.9, 1.7, 0.95, 9, cx, cy, z);

        setLayer(g, 1, z, d, cx, cy);
        // island shadows on the cloud sea
        for (const is of drawables) {
            if (!inView(is.x, is.y, is.r * 2.5, is.r * 3, cx, cy, z)) continue;
            const sx = is.x + is.r * 0.45 + 40, sy = is.y + is.r * (is.pillar ? 2 : 1.1) + 60;
            const sg = g.createRadialGradient(sx, sy, 0, sx, sy, is.r * 1.25);
            sg.addColorStop(0, "rgba(70,70,120,0.2)");
            sg.addColorStop(1, "rgba(70,70,120,0)");
            g.fillStyle = sg;
            g.beginPath();
            g.ellipse(sx, sy, is.r * 1.25, is.r * 0.8, 0, 0, TAU);
            g.fill();
        }
        // whales swim in the cloud sea beneath the islands
        for (const w of whales) {
            const [x, y, ang] = whalePos(w);
            if (!inView(x, y, 400, 400, cx, cy, z)) continue;
            A.drawWhale(g, x, y, ang, w.size, t + w.off * 50, w.alpha);
        }
        // mist from falls
        for (const p of particles) {
            if (p.type !== "mist") continue;
            const k = p.life / p.max;
            g.fillStyle = `rgba(255,255,255,${0.35 * (1 - k)})`;
            g.beginPath();
            g.arc(p.x, p.y, p.size * (1 + k * 1.5), 0, TAU);
            g.fill();
        }

        for (const is of drawables) {
            const a = is.art[0];
            if (!inView(is.x, is.y + a.H * 0.25, a.W, a.H + 300, cx, cy, z)) continue;
            drawDrawable(g, is, sky);
        }

        // ripples from chimes
        for (const r of ripples) {
            const k = r.t / 2.4;
            g.strokeStyle = rgb(hex(r.color), 0.7 * (1 - k));
            g.lineWidth = 2.5;
            g.beginPath();
            g.ellipse(r.x, r.y, 20 + k * 160, (20 + k * 160) * W.SQUASH, 0, 0, TAU);
            g.stroke();
        }

        // the storm around Galewatch
        if (stormCalm < 0.99) {
            g.globalAlpha = 0.85 * (1 - stormCalm);
            for (const p of stormPuffs) {
                const a = p.a + t * p.w;
                const x = W.GALE.x + Math.cos(a) * p.d, y = W.GALE.y + Math.sin(a) * p.d * 0.9;
                if (!inView(x, y, 400, 300, cx, cy, z)) continue;
                const spr = storms[p.k];
                g.drawImage(spr, x - 180 * p.s, y - 110 * p.s, 360 * p.s, 220 * p.s);
            }
            g.globalAlpha = 1;
        }
        // currents and still places
        if (stormCalm < 0.99) {
            const fade = 1 - stormCalm;
            g.lineCap = "round";
            W.CURRENTS.forEach((c, i) => {
                const act = currentAct[i];
                g.strokeStyle = `rgba(235,245,255,${(0.03 + act * 0.1) * fade})`;
                g.lineWidth = 60;
                g.beginPath();
                g.moveTo(c.a[0], c.a[1]);
                g.lineTo(c.b[0], c.b[1]);
                g.stroke();
                g.lineWidth = 26;
                g.beginPath();
                g.moveTo(c.a[0], c.a[1]);
                g.lineTo(c.b[0], c.b[1]);
                g.stroke();
                // streaks of wind, offset to either side of the centre line
                const L = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]);
                const nx = -(c.b[1] - c.a[1]) / L, ny = (c.b[0] - c.a[0]) / L;
                g.lineWidth = 2 + act * 1.5;
                g.strokeStyle = `rgba(255,255,255,${(0.18 + act * 0.6) * fade})`;
                for (const [off, dash, sp] of [[-14, [18, 46], 1], [0, [30, 34], 1.25], [14, [12, 52], 0.85]]) {
                    g.setLineDash(dash);
                    g.lineDashOffset = -t * (30 + act * 230) * sp;
                    g.beginPath();
                    g.moveTo(c.a[0] + nx * off, c.a[1] + ny * off);
                    g.lineTo(c.b[0] + nx * off, c.b[1] + ny * off);
                    g.stroke();
                }
                g.setLineDash([]);
            });
            for (const e of W.EDDIES) {
                g.setLineDash([10, 16]);
                g.lineDashOffset = t * 8;
                g.strokeStyle = `rgba(255,255,255,${0.45 * fade})`;
                g.lineWidth = 2;
                g.beginPath();
                g.ellipse(e.x, e.y, e.r, e.r * 0.85, 0, 0, TAU);
                g.stroke();
                g.setLineDash([]);
            }
            g.lineCap = "butt";
        }

        // Morrow's beam (core)
        if (beam.pts.length > 1) {
            g.strokeStyle = "rgba(255,248,215,0.95)";
            g.lineWidth = 2.5;
            g.beginPath();
            beam.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y - A.BEAM_H) : g.moveTo(x, y - A.BEAM_H - 18)));
            g.stroke();
        }

        // seeds
        save.seeds.length < W.SEEDS.length &&
            W.SEEDS.forEach((sd, k) => {
                if (save.seeds.includes(sd.id) || !inView(sd.x, sd.y, 60, 60, cx, cy, z)) return;
                A.drawSeed(g, sd.x, sd.y, t, k);
            });

        // wake, then skiff
        for (const p of particles) {
            if (p.type !== "wake" && p.type !== "goldwake") continue;
            const k = p.life / p.max;
            g.fillStyle = p.type === "goldwake" ? `rgba(255,230,160,${0.45 * (1 - k)})` : `rgba(255,255,255,${0.5 * (1 - k)})`;
            g.beginPath();
            g.arc(p.x, p.y, p.size * (1 + k * 2), 0, TAU);
            g.fill();
        }
        if (dest && started) {
            dest.t += 0.016;
            g.strokeStyle = `rgba(255,255,255,${0.5 + Math.sin(t * 3) * 0.2})`;
            g.lineWidth = 2;
            g.beginPath();
            g.ellipse(dest.x, dest.y, 18, 18 * W.SQUASH, 0, 0, TAU);
            g.stroke();
        }
        A.drawSkiff(g, skiff, t, save.sail, clamp(skiff.speed / MAX_SPEED, 0, 1.5));
        if (near[0] && !cinematic) {
            const c = near[0];
            g.strokeStyle = `rgba(255,255,255,${0.55 + Math.sin(t * 4) * 0.25})`;
            g.lineWidth = 2;
            g.beginPath();
            g.ellipse(c.x, c.y + 14, 34, 34 * W.SQUASH, 0, 0, TAU);
            g.stroke();
        }
        // petals
        for (const p of particles) {
            if (p.type !== "petal") continue;
            const k = p.life / p.max;
            g.fillStyle = `rgba(250,190,210,${0.9 * Math.min(1, (1 - k) * 3)})`;
            g.beginPath();
            g.ellipse(p.x, p.y, p.size, p.size * 0.5 * Math.abs(Math.sin(p.spin)) + 0.6, p.spin, 0, TAU);
            g.fill();
        }
        // birds fly highest
        for (const f of flocks) {
            for (const b of f.birds) {
                const ca = Math.cos(f.a), sa = Math.sin(f.a);
                const x = f.x + b.dx * ca - b.dy * sa, y = f.y + b.dx * sa + b.dy * ca;
                if (!inView(x, y, 100, 100, cx, cy, z)) continue;
                const flap = Math.sin(t * 5 + b.ph);
                g.globalAlpha = 0.15;
                A.drawBird(g, x + 80, y + 110, f.a, flap, 9);
                g.globalAlpha = 1;
                A.drawBird(g, x, y, f.a, flap, 9);
            }
        }

        // high wisps
        setLayer(g, 1.25, z, d, cx, cy);
        cloudLayer(g, 1.25, 900, 37, 1.2, 2.2, 0.28, 14, cx, cy, z);

        // colour of the hour
        g.setTransform(d, 0, 0, d, 0, 0);
        g.globalCompositeOperation = "multiply";
        const tint = g.createLinearGradient(0, 0, 0, vh);
        tint.addColorStop(0, rgb(sky.top));
        tint.addColorStop(1, rgb(sky.bot));
        g.fillStyle = tint;
        g.fillRect(0, 0, vw, vh);

        // lights, added on top so they glow at dusk and night
        g.globalCompositeOperation = "lighter";
        setLayer(g, 1, z, d, cx, cy);
        const glow = sky.glow;
        for (const id in lights) {
            const L = lights[id];
            if (inView(L.x, L.y, 1000, 1000, cx, cy, z)) A.drawLighthouseLight(g, L.x, L.y, L.v, t + L.x * 0.001, glow);
        }
        if (beam.pts.length > 1) {
            g.lineCap = "round";
            for (const [w, a] of [[16, 0.18], [6, 0.35]]) {
                g.strokeStyle = `rgba(255,220,150,${a})`;
                g.lineWidth = w;
                g.beginPath();
                beam.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y - A.BEAM_H) : g.moveTo(x, y - A.BEAM_H - 18)));
                g.stroke();
            }
            g.lineCap = "butt";
            const [sx, sy] = beam.pts[0];
            glowAt(g, sx, sy - 30, 70, [255, 220, 140], 0.6);
            const [ex, ey] = beam.pts[beam.pts.length - 1];
            if (beam.hit) glowAt(g, ex, ey - A.BEAM_H, 60, [255, 230, 160], 0.7);
        }
        chimes.forEach((c) => {
            if (c.glow > 0.02) glowAt(g, c.x, c.y - 26, 90, hex(c.color), c.glow * 0.8);
            else if (save.songKnown && !save.lit.hollow) glowAt(g, c.x, c.y - 26, 40, hex(c.color), 0.15 + glow * 0.2);
        });
        if (heartAwake > 0) {
            const h = byId.heart;
            glowAt(g, h.x, h.y - 240, 320, [255, 200, 210], heartAwake * (0.16 + glow * 0.26));
            // a soft column of light rising from the crown
            g.save();
            g.translate(h.x, h.y - 260);
            g.scale(1, 9);
            const pg = g.createRadialGradient(0, 0, 0, 0, 0, 120);
            pg.addColorStop(0, `rgba(255,232,205,${0.32 * heartAwake})`);
            pg.addColorStop(0.5, `rgba(255,225,200,${0.12 * heartAwake})`);
            pg.addColorStop(1, "rgba(255,225,200,0)");
            g.fillStyle = pg;
            g.beginPath();
            g.arc(0, 0, 120, Math.PI, TAU);
            g.fill();
            g.restore();
        }
        // the lights call toward the heart
        if (!save.heart) {
            for (const id in lights) {
                const L = lights[id];
                if (L.v < 0.05) continue;
                const h = byId.heart;
                const n = 14;
                for (let k = 0; k < n; k++) {
                    const u = ((k / n + t * 0.02) % 1);
                    const x = lerp(L.x, h.x, u), y = lerp(L.y - A.TOWER_H, h.y - 200, u) - Math.sin(u * Math.PI) * 120;
                    if (!inView(x, y, 30, 30, cx, cy, z)) continue;
                    glowAt(g, x, y, 14, [255, 230, 170], 0.5 * L.v * Math.sin(u * Math.PI));
                }
            }
        }
        const lt = byId.lantern;
        if (inView(lt.x, lt.y, 400, 400, cx, cy, z)) {
            const r = rng(31);
            for (let k = 0; k < 16; k++) {
                const a = r() * TAU, dd = Math.sqrt(r()) * 70;
                const x = lt.x + Math.cos(a) * dd, y = lt.y + lt.r * 0.15 - 78 + Math.sin(a) * dd * 0.55;
                glowAt(g, x, y, 12 + glow * 10, [255, 210, 130], 0.45 + glow * 0.45 + Math.sin(t * 2 + k) * 0.08);
            }
        }
        const kp = byId.keepers;
        if (glow > 0.3 && inView(kp.x, kp.y, 300, 300, cx, cy, z)) glowAt(g, kp.x - kp.r * 0.1 - 16, kp.y - kp.r * 0.12 - 14, 30, [255, 210, 130], glow * 0.6);
        // skiff lantern
        {
            const bx = skiff.x - Math.cos(skiff.h) * 28, by = skiff.y - Math.sin(skiff.h) * 28 - 4 + Math.sin(t * 1.4) * 3;
            glowAt(g, bx, by, 30 + glow * 50, [255, 214, 140], 0.15 + glow * 0.55);
        }
        save.seeds.length < W.SEEDS.length &&
            W.SEEDS.forEach((sd, k) => {
                if (save.seeds.includes(sd.id) || !inView(sd.x, sd.y, 60, 60, cx, cy, z)) return;
                glowAt(g, sd.x, sd.y - 26 + Math.sin(t * 1.6 + k) * 5, 26 + glow * 30, [255, 236, 170], 0.25 + glow * 0.45);
            });
        for (const p of particles) {
            if (p.type === "spark") {
                const k = p.life / p.max;
                glowAt(g, p.x, p.y, p.size * 3, hex(p.color), 1 - k);
            } else if (p.type === "firefly") {
                const k = p.life / p.max;
                const a = Math.sin(k * Math.PI) * (0.5 + 0.5 * Math.sin(p.life * 4));
                glowAt(g, p.x + Math.sin(p.life * 1.3) * 10, p.y, 8, [220, 255, 170], a * glow);
            }
        }
        g.globalCompositeOperation = "source-over";

        // vignette
        g.setTransform(d, 0, 0, d, 0, 0);
        const vg = g.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.35, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
        vg.addColorStop(0, "rgba(40,30,70,0)");
        vg.addColorStop(1, "rgba(40,30,70,0.32)");
        g.fillStyle = vg;
        g.fillRect(0, 0, vw, vh);
    }

    function glowAt(g, x, y, r, c, a) {
        if (a <= 0.01) return;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, rgb(c, Math.min(1, a)));
        gr.addColorStop(1, rgb(c, 0));
        g.fillStyle = gr;
        g.beginPath();
        g.arc(x, y, r, 0, TAU);
        g.fill();
    }

    // ---- Loop ---------------------------------------------------------------------------
    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        vw = canvas.clientWidth;
        vh = canvas.clientHeight;
        canvas.width = Math.round(vw * dpr);
        canvas.height = Math.round(vh * dpr);
    }
    window.addEventListener("resize", resize);
    resize();
    cam.z = baseZoom();

    let last = performance.now();
    function frame(now) {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (!paused || !started) update(dt);
        render(ctx);
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    document.addEventListener("visibilitychange", () => {
        if (document.hidden && started) persist();
    });

    return {
        start() {
            started = true;
            S.initAudio();
            hooks.onProgress();
            if (!save.notes.includes("n1")) setTimeout(() => hooks.onToast("The Amberreach", "Sail close to the standing stone on Keeper's Rest."), 1200);
        },
        reset() {
            store.remove(SAVE_KEY);
            location.reload();
        },
        setPaused(p) {
            paused = p;
            if (p) {
                keys.clear();
                pointer = null;
            }
        },
        interact,
        replaySong: playSong,
        state() {
            return {
                save,
                lit: Object.values(save.lit).filter(Boolean).length,
                charted: fogCount / fog.length,
                fog, fogN: FOG_N, fogCell: FOG_CELL,
                skiff: { x: skiff.x, y: skiff.y, h: skiff.h },
                islands: islands.map(({ id, x, y, r, region, lighthouse }) => ({ id, x, y, r, region, lighthouse })),
                allLit: allLit(),
            };
        },
        // Render a still frame into a new canvas (used for icons and link previews)
        capture(w, h, opt) {
            const c = document.createElement("canvas");
            c.width = w;
            c.height = h;
            const [ow, oh] = [vw, vh];
            vw = w;
            vh = h;
            render(c.getContext("2d"), { dpr: 1, ...opt });
            vw = ow;
            vh = oh;
            return c;
        },
        debug: { skiff, save, lights, mirrors, chimes, lightUp, wakeHeart, beam: () => beam, cam, step: (n) => { for (let i = 0; i < n; i++) update(1 / 60); } },
    };
}
