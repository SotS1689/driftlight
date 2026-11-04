// Small shared helpers: math, seeded randomness, colors, safe storage.

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

export function angleDiff(a, b) {
    let d = (b - a) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
}

// Approach `target` exponentially, frame-rate independent
export const approach = (v, target, rate, dt) => v + (target - v) * (1 - Math.exp(-rate * dt));

export function rng(seed) {
    let s = seed | 0;
    return function () {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function hash2(x, y, s = 0) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

export function hex(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(a, b, t) {
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

export const rgb = (c, a = 1) =>
    `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

// localStorage wrapper that survives private mode / blocked storage.
// Keys are prefixed so apps sharing one origin don't collide.
const PREFIX = "driftlight.";
export const store = {
    get(key, fallback) {
        try {
            const v = JSON.parse(localStorage.getItem(PREFIX + key));
            return v ?? fallback;
        } catch {
            return fallback;
        }
    },
    set(key, value) {
        try {
            localStorage.setItem(PREFIX + key, JSON.stringify(value));
        } catch {
            /* private mode */
        }
    },
    remove(key) {
        try {
            localStorage.removeItem(PREFIX + key);
        } catch {
            /* private mode */
        }
    },
};

// Google Analytics event, if the GA script loaded (blockers, offline)
export function track(name, params = {}) {
    if (typeof gtag === "function") gtag("event", name, params);
}
