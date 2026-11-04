// Page wiring: title screen, HUD, cards, map, theme, sound, install, support.

import { createGame, hasSave } from "./game.js";
import * as W from "./world.js";
import * as S from "./audio.js";
import { store, track, TAU } from "./util.js";

const $ = (id) => document.getElementById(id);

// ---- Theme (panels follow the system unless the player picks) ------------------------
const root = document.documentElement;
const savedTheme = store.get("theme", null);
if (savedTheme) root.dataset.theme = savedTheme;
$("btn-theme").addEventListener("click", () => {
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    store.set("theme", root.dataset.theme);
});

// ---- Toasts, one at a time -----------------------------------------------------------
const toastQ = [];
let toastBusy = false;
function toast(title, line) {
    toastQ.push([title, line]);
    if (!toastBusy) nextToast();
}
function nextToast() {
    const item = toastQ.shift();
    if (!item) {
        toastBusy = false;
        return;
    }
    toastBusy = true;
    $("toast-title").textContent = item[0];
    $("toast-line").textContent = item[1] || "";
    $("toast").classList.add("show");
    setTimeout(() => {
        $("toast").classList.remove("show");
        setTimeout(nextToast, 1300);
    }, 5200);
}

// ---- Game -------------------------------------------------------------------------------
const game = createGame($("game"), {
    onToast: toast,
    onNote: (n) => {
        $("note-title").textContent = n.title;
        $("note-text").textContent = n.text;
        openCard("note-card");
    },
    onPrompt: (label) => {
        $("prompt").hidden = !label;
        if (label) $("prompt-text").textContent = label;
    },
    onProgress: updateHud,
    onSong: songHud,
    onFinale: () => {
        const st = game.state();
        $("ending-text").textContent = W.FINAL_NOTE;
        const mins = Math.max(1, Math.round(st.save.playSeconds / 60));
        $("ending-stats").innerHTML = `
            <li><b>${mins}</b> minutes adrift</li>
            <li><b>${Math.round(st.charted * 100)}%</b> of the reach charted</li>
            <li><b>${st.save.disc.length}</b>/8 wonders found</li>
            <li><b>${st.save.seeds.length}</b>/24 drift-seeds</li>`;
        openCard("ending-modal");
    },
});
window.__driftlight = game;

$("prompt").addEventListener("click", () => game.interact());

function objective(st) {
    const s = st.save;
    if (!s.notes.includes("n1") && st.lit === 0) return "Sail close to the standing stone on Keeper's Rest.";
    if (st.lit < 3) return `Wake the three dark lighthouses (${st.lit} of 3 lit).`;
    if (!s.heart) return "Return to the Heartbeacon at the centre of the reach.";
    return "The reach is awake. Wander, and find what's left to find.";
}
function updateHud() {
    const st = game.state();
    $("objective").textContent = objective(st);
    $("c-lit").textContent = st.lit;
    $("c-disc").textContent = st.save.disc.length;
    $("c-seed").textContent = st.save.seeds.length;
    if (st.save.lit.hollow) $("song").hidden = true;
}

// ---- The Hollowsong panel ------------------------------------------------------------
const dots = W.SONG.map((ci) => {
    const d = document.createElement("span");
    d.className = "song-dot";
    d.style.setProperty("--dot", W.CHIMES[ci].color);
    d.title = W.CHIMES[ci].name;
    $("song-dots").append(d);
    return d;
});
function songHud(idx, mode, k) {
    const st = game.state();
    if (st.save.lit.hollow) {
        $("song").hidden = true;
        return;
    }
    $("song").hidden = false;
    $("song").classList.remove("wrong");
    dots.forEach((d, i) => {
        d.classList.toggle("on", mode !== "listen" && i < idx);
        d.classList.remove("ping");
    });
    if (mode === "listen") {
        if (k !== undefined) dots[k].classList.add("ping");
        $("song-text").textContent = "Listen to Hollowsong's song…";
    } else if (mode === "ready") {
        $("song-text").textContent = "Now sing it back: sail through the chime stones in this order.";
    } else if (mode === "right") {
        $("song-text").textContent = idx >= dots.length ? "She remembers…" : `${idx} of ${dots.length} notes sung.`;
    } else if (mode === "wrong") {
        void $("song").offsetWidth;
        $("song").classList.add("wrong");
        $("song-text").textContent = "The song slips away. Begin again from the first note.";
    }
}
$("song-replay").addEventListener("click", () => game.replaySong());

// ---- Cards -------------------------------------------------------------------------------
function openCard(id) {
    const d = $(id);
    if (d.open) return;
    game.setPaused(true);
    d.showModal();
}
document.querySelectorAll("dialog").forEach((d) =>
    d.addEventListener("close", () => {
        if (!document.querySelector("dialog[open]")) game.setPaused(false);
    })
);
// Clicking the dim backdrop closes a card
document.querySelectorAll("dialog").forEach((d) =>
    d.addEventListener("click", (e) => {
        if (e.target === d) d.close();
    })
);

$("btn-map").addEventListener("click", openMap);
$("btn-journal").addEventListener("click", openJournal);
$("btn-about").addEventListener("click", () => openCard("about-modal"));
window.addEventListener("keydown", (e) => {
    if (!started || document.querySelector("dialog[open]")) return;
    const k = e.key.toLowerCase();
    if (k === "m") openMap();
    if (k === "j") openJournal();
});

// ---- Map ---------------------------------------------------------------------------------
const PLACE_NAMES = { morrow: "Morrow Light", hollow: "Hollowsong Light", gale: "Galewatch Light", heart: "The Heartbeacon" };
function openMap() {
    track("map_open");
    const st = game.state();
    const c = $("map-canvas");
    const g = c.getContext("2d");
    const N = c.width;
    const k = N / W.WORLD.w;
    const seen = (x, y) => st.fog[Math.floor(y / st.fogCell) * st.fogN + Math.floor(x / st.fogCell)] === 1;

    const pg = g.createRadialGradient(N / 2, N / 2, N * 0.2, N / 2, N / 2, N * 0.75);
    pg.addColorStop(0, "#f4e9cf");
    pg.addColorStop(1, "#ddc8a0");
    g.fillStyle = pg;
    g.fillRect(0, 0, N, N);
    // charted sky
    const cs = st.fogCell * k;
    for (let y = 0; y < st.fogN; y++)
        for (let x = 0; x < st.fogN; x++) {
            if (!st.fog[y * st.fogN + x]) continue;
            const px = (x + 0.5) * cs, py = (y + 0.5) * cs;
            const gr = g.createRadialGradient(px, py, 0, px, py, cs * 1.3);
            gr.addColorStop(0, "rgba(206,222,236,0.55)");
            gr.addColorStop(1, "rgba(206,222,236,0)");
            g.fillStyle = gr;
            g.fillRect(px - cs * 1.3, py - cs * 1.3, cs * 2.6, cs * 2.6);
        }
    if (!st.save.lit.gale && seen(W.GALE.x, W.GALE.y + W.GALE.inner)) {
        g.setLineDash([6, 6]);
        g.strokeStyle = "rgba(90,80,120,0.6)";
        g.lineWidth = 2;
        for (const r of [W.GALE.inner, W.GALE.outer]) {
            g.beginPath();
            g.arc(W.GALE.x * k, W.GALE.y * k, r * k, 0, TAU);
            g.stroke();
        }
        g.setLineDash([]);
    }
    g.font = "italic 600 32px 'Cormorant Garamond', Georgia, serif";
    g.textAlign = "center";
    for (const is of st.islands) {
        if (!seen(is.x, is.y)) continue;
        g.fillStyle = is.region === "start" || (is.region === "heart" ? st.save.heart : st.save.lit[is.region]) ? "#a9c486" : "#c9bb8c";
        g.strokeStyle = "#6a5440";
        g.lineWidth = 1.5;
        g.beginPath();
        g.ellipse(is.x * k, is.y * k, Math.max(3, is.r * k), Math.max(2.4, is.r * k * W.SQUASH), 0, 0, TAU);
        g.fill();
        g.stroke();
        if (is.lighthouse || is.id === "heart") {
            const lit = is.id === "heart" ? st.save.heart : st.save.lit[is.id];
            star(g, is.x * k, is.y * k, 9, lit ? "#e6a43a" : "#7a7080");
            g.fillStyle = "#4a3a30";
            g.fillText(PLACE_NAMES[is.id], is.x * k, is.y * k - is.r * k - 10);
        }
    }
    g.font = "italic 500 28px 'Cormorant Garamond', Georgia, serif";
    for (const d of W.DISCOVERIES) {
        if (!st.save.disc.includes(d.id) || d.whale || d.rim || d.id === "keepers") continue;
        g.fillStyle = "#5a4a3c";
        g.fillText(d.name, d.x * k, d.y * k + 42);
    }
    if (st.save.disc.includes("keepers")) {
        g.fillStyle = "#5a4a3c";
        g.fillText("Keeper's Rest", 3000 * k, 4300 * k + 32);
    }
    // the skiff
    const { x, y, h } = st.skiff;
    g.save();
    g.translate(x * k, y * k);
    g.rotate(h);
    g.fillStyle = "#c7664f";
    g.strokeStyle = "#fff8ea";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(14, 0);
    g.lineTo(-9, -8);
    g.lineTo(-5, 0);
    g.lineTo(-9, 8);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    // compass
    g.save();
    g.translate(N - 70, N - 74);
    g.strokeStyle = "#6a5440";
    g.fillStyle = "#6a5440";
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(0, 0, 34, 0, TAU);
    g.stroke();
    star(g, 0, 0, 26, "#8a6a50", 4);
    g.font = "600 18px 'Cormorant Garamond', Georgia, serif";
    g.fillText("N", 0, -42);
    g.restore();
    g.strokeStyle = "rgba(106,84,64,0.6)";
    g.lineWidth = 6;
    g.strokeRect(3, 3, N - 6, N - 6);
    $("map-charted").textContent = `${Math.round(st.charted * 100)}% charted`;
    openCard("map-modal");
}
function star(g, x, y, r, color, points = 5) {
    g.fillStyle = color;
    g.beginPath();
    for (let i = 0; i < points * 2; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / points;
        const rr = i % 2 ? r * 0.42 : r;
        g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
}

// ---- Journal ---------------------------------------------------------------------------
function esc(s) {
    return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}
function openJournal() {
    track("journal_open");
    const st = game.state();
    const s = st.save;
    const lightRows = [
        ["morrow", "Morrow Light", "In the west. Lead the Sunstone's beam with the old mirrors."],
        ["hollow", "Hollowsong Light", "In the east. Sing her song back with the chime stones."],
        ["gale", "Galewatch Light", "In the north, inside a storm. Ride the currents when they breathe."],
    ];
    const notes = W.NOTES.filter((n) => s.notes.includes(n.id));
    const rewards = W.SEED_REWARDS.map((r) => `<li><span class="name ${s.rewards.includes(r.id) ? "" : "unknown"}">${r.name}</span><span class="line">${s.rewards.includes(r.id) ? esc(r.text) : `Gather ${r.count} drift-seeds.`}</span></li>`).join("");
    $("journal-body").innerHTML = `
        <h3>The lights</h3>
        <ul class="j-list">${lightRows
            .map(([id, name, hint]) => `<li><span class="name ${s.lit[id] ? "lit" : ""}">${s.lit[id] ? "✦ " : ""}${name}</span><span class="line">${s.lit[id] ? "Burning again." : hint}</span></li>`)
            .join("")}
            <li><span class="name ${s.heart ? "lit" : ""}">${s.heart ? "✦ " : ""}The Heartbeacon</span><span class="line">${s.heart ? "Awake." : st.allLit ? "Return to the centre of the reach." : "Sleeping, at the centre of the reach."}</span></li>
        </ul>
        <h3>Keeper's stones (${notes.length}/${W.NOTES.length})</h3>
        <ul class="j-list">${notes.length ? notes.map((n) => `<li><span class="name">${esc(n.title)}</span><button class="j-note" data-note="${n.id}">Read again</button></li>`).join("") : `<li class="unknown">None read yet.</li>`}</ul>
        <h3>Wonders (${s.disc.length}/${W.DISCOVERIES.length})</h3>
        <ul class="j-list">${W.DISCOVERIES.map((d) =>
            s.disc.includes(d.id) ? `<li><span class="name">${esc(d.name)}</span><span class="line">${esc(d.line)}</span></li>` : `<li><span class="name unknown">Undiscovered</span></li>`
        ).join("")}</ul>
        <h3>Drift-seeds (${s.seeds.length}/24)</h3>
        <ul class="j-list">${rewards}</ul>`;
    $("journal-body").querySelectorAll("[data-note]").forEach((b) =>
        b.addEventListener("click", () => {
            const n = W.NOTES.find((x) => x.id === b.dataset.note);
            $("journal-modal").close();
            $("note-title").textContent = n.title;
            $("note-text").textContent = n.text;
            openCard("note-card");
        })
    );
    openCard("journal-modal");
}

// ---- Sound -------------------------------------------------------------------------------
const soundBtn = $("btn-sound");
function applyMute(m) {
    S.setMuted(m);
    soundBtn.classList.toggle("muted", m);
    soundBtn.setAttribute("aria-label", m ? "Sound off" : "Sound on");
}
applyMute(store.get("muted", false));
soundBtn.addEventListener("click", () => {
    const m = !S.isMuted();
    applyMute(m);
    store.set("muted", m);
    S.initAudio();
});

// ---- Title -------------------------------------------------------------------------------
let started = false;
const returning = hasSave();
if (returning) {
    $("btn-begin").textContent = "Continue";
    $("btn-restart").hidden = false;
}
$("btn-begin").addEventListener("click", () => {
    started = true;
    $("title-screen").classList.add("gone");
    $("hud").hidden = false;
    track(returning ? "game_continue" : "game_start");
    game.start();
    if (game.state().save.songKnown && !game.state().save.lit.hollow) songHud(0, "ready");
    setTimeout(() => ($("title-screen").hidden = true), 1500);
});
$("btn-restart").addEventListener("click", () => {
    if (confirm("Start a new voyage? Your current progress will be erased.")) game.reset();
});

// ---- Install (PWA) -------------------------------------------------------------------------
let installEvt = null;
window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installEvt = e;
    $("install").hidden = false;
});
$("install").addEventListener("click", async () => {
    if (!installEvt) return;
    installEvt.prompt();
    await installEvt.userChoice;
    installEvt = null;
    $("install").hidden = true;
});
window.addEventListener("appinstalled", () => {
    $("install").hidden = true;
    track("app_installed");
});
const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
if ("serviceWorker" in navigator && (!local || location.search.includes("sw=1"))) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
}

// ---- Support callout (occasional, dismissible ask for financial support) ----------------
// Never on first visit; first appears once the app has actually been used
// (10 visits OR 3 distinct days), then resurfaces roughly every 24 days after
// "Maybe later". Stops popping up (the heart itself always stays) after 5
// "Maybe later"s, or for good after "Don't ask again" or clicking through.

const SUPPORT_DAY_MS = 20 * 60 * 60 * 1000;
const SUPPORT_FIRST_VISITS_THRESHOLD = 10;
const SUPPORT_FIRST_DAYS_THRESHOLD = 3;
const SUPPORT_RESHOW_INTERVAL_DAYS = 24;
const SUPPORT_MAX_MAYBE_LATER = 5;
const supportCallout = $("support-callout");
const supportLink = $("support");

function trackSupportUsage() {
    if (store.get("supportDismissedForever", false) || store.get("supportActed", false)) return;

    const visits = store.get("supportVisits", 0) + 1;
    store.set("supportVisits", visits);

    let days = store.get("supportDaysUsed", 0);
    const today = new Date().toISOString().slice(0, 10);
    if (store.get("supportLastDayUsed", "") !== today) {
        days += 1;
        store.set("supportDaysUsed", days);
        store.set("supportLastDayUsed", today);
    }

    if (store.get("supportMaybeLaterCount", 0) >= SUPPORT_MAX_MAYBE_LATER) return;
    const lastShown = store.get("supportLastShown", 0);
    const due = lastShown === 0
        ? visits >= SUPPORT_FIRST_VISITS_THRESHOLD || days >= SUPPORT_FIRST_DAYS_THRESHOLD
        : Date.now() - lastShown >= SUPPORT_RESHOW_INTERVAL_DAYS * SUPPORT_DAY_MS;
    // A moment after opening, so it doesn't land on top of the app loading
    if (due) setTimeout(showSupportCallout, 1500);
}

function showSupportCallout() {
    supportCallout.classList.add("open");
    store.set("supportLastShown", Date.now());
    track("support_callout_shown");
    // Dismiss on outside click (doesn't count as "Maybe later" -- just closes it)
    setTimeout(() => document.addEventListener("click", supportOutsideClick), 0);
}

function supportOutsideClick(e) {
    if (supportCallout.contains(e.target) || supportLink.contains(e.target)) return;
    supportCallout.classList.remove("open");
    document.removeEventListener("click", supportOutsideClick);
}

function supportDismiss(mode) {
    supportCallout.classList.remove("open");
    document.removeEventListener("click", supportOutsideClick);
    if (mode === "forever") store.set("supportDismissedForever", true);
    else if (mode === "later") store.set("supportMaybeLaterCount", store.get("supportMaybeLaterCount", 0) + 1);
    else if (mode === "acted") store.set("supportActed", true);
    if (mode === "forever" || mode === "later") track("support_callout_dismiss", { choice: mode });
}

supportLink.addEventListener("click", () => {
    track("support_click", { source: "heart" });
    supportDismiss("acted");
});
supportCallout.querySelector('[data-support="acted"]').addEventListener("click", () =>
    track("support_click", { source: "callout" })
);
supportCallout.querySelectorAll("[data-support]").forEach((el) =>
    el.addEventListener("click", () => supportDismiss(el.dataset.support))
);
trackSupportUsage();
