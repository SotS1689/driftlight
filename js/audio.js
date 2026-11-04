// All sound is synthesized: soft wind, a slow drifting pad, bells, whale song.

let ctx = null;
let master, reverb, dry, padBus, windGain, windFilter;
let muted = false;
let padTimer = null;

const CHORDS = [
    [261.63, 329.63, 392.0, 493.88], // Cmaj7
    [220.0, 261.63, 329.63, 392.0], // Am7
    [174.61, 220.0, 261.63, 329.63], // Fmaj7
    [196.0, 246.94, 293.66, 392.0], // G
    [220.0, 293.66, 349.23, 440.0], // Dm/A
    [174.61, 261.63, 329.63, 392.0], // Fadd9-ish
];

function impulse(seconds, decay) {
    const rate = ctx.sampleRate;
    const len = rate * seconds;
    const buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
}

export function initAudio() {
    if (ctx) {
        if (ctx.state === "suspended") ctx.resume();
        return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(ctx.destination);

    reverb = ctx.createConvolver();
    reverb.buffer = impulse(4.5, 2.6);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    reverb.connect(wet).connect(master);
    dry = ctx.createGain();
    dry.gain.value = 0.6;
    dry.connect(master);

    // Wind: filtered noise that swells and fades
    const noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = "bandpass";
    windFilter.frequency.value = 420;
    windFilter.Q.value = 0.6;
    windGain = ctx.createGain();
    windGain.gain.value = 0.035;
    src.connect(windFilter).connect(windGain).connect(master);
    src.start();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 160;
    lfo.connect(lfoAmt).connect(windFilter.frequency);
    lfo.start();

    padBus = ctx.createBiquadFilter();
    padBus.type = "lowpass";
    padBus.frequency.value = 1100;
    const padGain = ctx.createGain();
    padGain.gain.value = 0.5;
    padBus.connect(padGain);
    padGain.connect(reverb);
    padGain.connect(dry);

    let i = 0;
    const next = () => {
        playChord(CHORDS[i % CHORDS.length], 14);
        i++;
    };
    next();
    padTimer = setInterval(next, 11000);
}

function playChord(freqs, len) {
    const t = ctx.currentTime;
    freqs.forEach((f, k) => {
        for (const detune of [-4, 5]) {
            const o = ctx.createOscillator();
            o.type = k === 0 ? "sine" : "triangle";
            o.frequency.value = k === 0 ? f / 2 : f;
            o.detune.value = detune;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(0.022, t + 4);
            g.gain.setValueAtTime(0.022, t + len - 5);
            g.gain.linearRampToValueAtTime(0, t + len);
            o.connect(g).connect(padBus);
            o.start(t);
            o.stop(t + len + 0.1);
        }
    });
}

export function bell(freq, vol = 0.18, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const partials = [
        [1, 1, 3.2],
        [2.76, 0.35, 1.6],
        [5.4, 0.15, 0.8],
        [0.5, 0.25, 4],
    ];
    for (const [m, a, d] of partials) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = freq * m;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(vol * a, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g);
        g.connect(reverb);
        g.connect(dry);
        o.start(t);
        o.stop(t + d + 0.1);
    }
}

export function pluck(freq = 1046.5, vol = 0.08) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g);
    g.connect(reverb);
    g.connect(dry);
    o.start(t);
    o.stop(t + 1);
}

// Soft, falling "not quite" sound for a wrong chime
export function sigh() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(440, t);
    o.frequency.exponentialRampToValueAtTime(300, t + 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    o.connect(g).connect(reverb);
    o.start(t);
    o.stop(t + 1.3);
}

export function arpeggio(freqs, gap = 0.18, vol = 0.14) {
    freqs.forEach((f, i) => bell(f, vol, i * gap));
}

export function whoosh() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource();
    s.buffer = b;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(300, t);
    f.frequency.linearRampToValueAtTime(900, t + 0.9);
    f.frequency.linearRampToValueAtTime(400, t + 1.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.6);
    g.gain.linearRampToValueAtTime(0, t + 1.9);
    s.connect(f).connect(g).connect(master);
    s.start(t);
}

export function whaleSong(vol = 0.08) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sine";
    const base = 140 + Math.random() * 60;
    o.frequency.setValueAtTime(base, t);
    o.frequency.exponentialRampToValueAtTime(base * 1.9, t + 1.8);
    o.frequency.exponentialRampToValueAtTime(base * 1.3, t + 3.6);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5;
    const vg = ctx.createGain();
    vg.gain.value = 6;
    vib.connect(vg).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.8);
    g.gain.linearRampToValueAtTime(vol * 0.7, t + 2.8);
    g.gain.linearRampToValueAtTime(0, t + 3.8);
    o.connect(g).connect(reverb);
    o.start(t);
    vib.start(t);
    o.stop(t + 4);
    vib.stop(t + 4);
}

// Louder, brighter wind when the skiff is inside the storm
export function setWindStrength(s) {
    if (!ctx) return;
    windGain.gain.setTargetAtTime(0.035 + s * 0.09, ctx.currentTime, 0.5);
}

export function setMuted(m) {
    muted = m;
    if (ctx) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.2);
}

export const isMuted = () => muted;
