# Driftlight

A slow, beautiful exploration game for the web. You pilot a little sail-skiff over a sea of clouds, explore the floating islands of the Amberreach, and wake three dark lighthouses:

- **Morrow Light** (west): turn old mirrors in the sky to lead the Sunstone's beam home.
- **Hollowsong Light** (east): hear her song, then sail through five chime stones in the same order.
- **Galewatch Light** (north): ride breathing wind currents through a storm, resting in the still places.

When all three burn, return to the Heartbeacon at the centre for the ending. Along the way there are 8 wonders to discover, 24 drift-seeds (which unlock sail styles), keeper's notes to read, a map that fills in as you explore, and a slow day-and-night cycle. There is no timer and nothing can hurt you.

## Controls

- Arrow keys or WASD to sail, or tap/click where you want to go (hold to steer).
- **E**, Space, or the glowing prompt to interact. **M** map, **J** journal.

## Run locally

It's plain HTML, CSS and JavaScript modules with no build step. Serve the folder with any static server, for example:

```
python -m http.server 8000
```

then open http://localhost:8000. Add `?sandbox` to the URL to play without touching your saved voyage. The service worker (offline play) only registers on a real host, or on localhost with `?sw=1`.

## Deploy

Push the folder to a GitHub repo under SotS1689 and turn on GitHub Pages. The link-preview tags in `index.html` assume `https://sots1689.github.io/driftlight/`; update `og:url` and `og:image` if it lives elsewhere. Bump `CACHE` in `sw.js` whenever files change so installed copies update.

## Code map

- `js/world.js`: every island, puzzle piece, note and wonder. A new region ("reach") is mostly new data here.
- `js/game.js`: sailing, puzzles, discovery, saving, and drawing each frame.
- `js/art.js`: procedural painting of islands, clouds, the skiff, lighthouses, whales.
- `js/audio.js`: synthesized wind, music pad, bells and whale song (no audio files).
- `js/main.js`: title screen, HUD, map, journal, theme, sound, install, and the support callout.

Includes Google Analytics (G-YW31K785WW), a privacy note under the ⓘ button, and the Reformed Retrieval support heart.
