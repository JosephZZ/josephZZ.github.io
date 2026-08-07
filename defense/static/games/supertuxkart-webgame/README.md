# SuperTuxKart — browser build (Northern Resort)

The whole game runs **in your browser**: fixed 120 Hz physics, the AI, the race
rules and a WebGL2 renderer using the original SuperTuxKart meshes, textures,
sounds and fonts. Nothing is streamed — there is no server-side rendering and
therefore no input lag.

## Run

```bash
python3 serve.py          # then open http://localhost:8000/
```

A local server is needed because browsers block `fetch()` of local files over
`file://`. Any static server works (`npx serve`, `python3 -m http.server`, …).

Options via the URL: `?karts=6&laps=3&difficulty=hard&kart=tux&seed=1234`
(difficulty: easy / medium / hard / best; kart: tux, gnu, sara_the_racer,
beastie, kiki, wilber).

## Controls (checklist D1.1)

`↑` accelerate · `↓` brake/reverse · `←` `→` steer · `N` nitro · `V` drift ·
`Space` fire · `B` look back · `Backspace` rescue · `Esc` pause · `R` restart ·
`M` cycle minimap position

## What is in here

| path | contents |
|---|---|
| `js/core.js` | vector/quaternion maths, track (quads + driveline), MaxSpeed system, drift state machine |
| `js/kart.js` | rigid body, suspension, engine/gears/air friction, steering, nitro, attachments |
| `js/world.js` | race phases, laps, ranks, collisions, items, powerup weights, projectiles, AI |
| `js/render.js` | WebGL2 renderer (textures, depth buffer, sky box, sun, fog) |
| `js/view.js` | camera formulas, HUD, WebAudio |
| `js/main.js` | loop and input |
| `assets/` | exported meshes (`meshes.bin`), textures, sounds, fonts, icons and all game constants |

The simulation is a straight port of the Python build in `../reproduce`, which
in turn is written from `CHECKLIST.md`. `tests/compare.mjs` drives both with the
same scripted input: they agree to 0.000 m over 10 s.

## Verify

```bash
node tests/validate.mjs        # assets, mesh buffers, checklist values, a full 3-lap race
node tests/browser_stub.mjs    # renderer / HUD / camera against fake WebGL + canvas
node tests/compare.mjs         # telemetry to compare against the Python build
```

## Notes

* Only the *Northern Resort* (snowmountain) track is included, with 6 karts.
* Physics runs at a fixed 120 Hz regardless of frame rate (checklist E1.1), so
  the handling is identical on any machine.
* The renderer has no shadow maps or particle systems yet; karts, wheels,
  items, sky, sun and fog are the real assets.
