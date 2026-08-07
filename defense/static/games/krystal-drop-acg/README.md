# Krystal Drop — reproduction from `CHECKLIST.md`

A from-scratch HTML5/Canvas reimplementation of Krystal Drop v0.7, written **only**
against `CHECKLIST.md`. No original source file was read for logic: physics,
state machines, burst detection, scoring, AI/voice selection and the difficulty
curve are all re-derived from the checklist text.

Assets are the originals, as the checklist explicitly permits (`art/**` PNG / WAV /
OGG / TTF, `.spr` animation descriptions, `Slapstick.txt` glyph table,
`table.txt` / `tableDuel.txt` patterns, `survival.sco`, `kdrop.xml`). They were
unpacked out of the `.acc` archives into `assets/` byte-for-byte — nothing was
redrawn, recoloured or rescaled (1.8.1).

## Run

```sh
./serve.sh            # http://127.0.0.1:8877/
node test/logic.test.mjs   # 68 assertions over the DOM-free rules engine
```

## Controls (defaults from `kdrop.xml`, checklist 4.1.1)

| | up (drop) | down (take) | left | right | extra line |
|---|---|---|---|---|---|
| p1 | RShift | RCtrl | ← | → | Enter |
| p2 | q | a | x | c | LCtrl |

Survival uses the p1 set; **Duel deliberately swaps them** — p2 keys drive the
left field, p1 keys the right one (4.1.3). ESC quits at any time (7.1.4).

## Source map

| file | checklist sections |
|---|---|
| `src/time.js` | 2.1.1, 5.1.1 — global-grid `GetTimeSlice` |
| `src/display.js` | 1.1.1, 1.1.4, 1.3.1, 2.5.4 — canvas, clear colour, flash, clipping |
| `src/font.js` | 1.7 — `Slapstick.txt` glyphs, 1.0/0.8/0.7/0.5 derived sizes, bottom-baseline drawing |
| `src/sprite.js` | 2.1 — `.spr` parsing, `goto` / `onlyonce`, frame quantum |
| `src/kernel.js` | 1.1.3, 4.2.2, 4.2.3, 7.1.1, 7.1.2 — controller stack, reverse draw, deferred enable/disable |
| `src/events.js` | 2.3, 2.4, 2.5.1 — quadratic curves, bouncing/message text, particles |
| `src/sound.js` | 3.1, 3.3 — sound bank, multi-channel SFX, single music track |
| `src/input.js`, `src/actions.js` | 4.1, 4.2.4 — SDL key codes, action table |
| `src/config.js` | 7.3.4 — `kdrop.xml` |
| `src/highscore.js` | 7.3.1–7.3.3 — `.sco` format + checksum |
| `src/game/consts.js` | 2.2.2, 2.6.3, 5.2, 6.3.1, 6.3.2 — constants and animation tables |
| `src/game/row.js` | 5.3, 5.4 — block list, integration, collisions, take/drop/insert |
| `src/game/set.js` | 6.1, 6.2, 6.4 — burst detection, flood fill, combo, scoring |
| `src/game/table.js` | 1.3, 1.4, 4.4, 5.5 — a player's field, HUD-less rendering, settle animations |
| `src/game/clown.js` | 4.3 — movement, snapping, door wrap |
| `src/game/gemgen.js` | 6.3.5 — per-column table pointers, then weighted random |
| `src/game/character.js` | 3.1.5, 3.2.5, 3.2.6 — voices, `actions.xml` weighted pick |
| `src/ctrl/*.js` | 1.2, 1.5, 1.6, 2.6, 6.5, 7.2 — the individual scenes |

Section 9 ("dead code") is not implemented, as instructed: no P2P module, only
the 4 enabled gem kinds, no `puzzle3.ogg`, no `choc.wav`, no mouse path, no low
score table.

## Anti-cheat checks (section 8)

`test/logic.test.mjs` covers C2 (horizontal 3 does **not** burst), C3/C12 (take
lock and hand capacity), C5 (2^clash scoring: 3 gems → +6, then 4 gems → +16),
C6 (no line while `clash_count != 0`), C15 (per-column generator pointers), plus
the clown snapping (C1) and door offsets (C9). C7/C8 are visible in the key
tables above; C17 is enforced by ignoring `KeyboardEvent.repeat`.

## Judgement calls where the checklist is silent or self-contradictory

1. **Combo end (6.2.2).** Taken literally — "memo empty **and** `IsUpFinished()`"
   — `clash_count` resets during the ~0.5 s burst animation, because nothing is
   in UP/DROP state then. Every chain would score ×2 and C5/C6/C14 could never
   pass. The condition therefore also requires that no gem is mid-removal.
   See the comment in `src/game/set.js`.
2. **Sprite updates vs. the 20 ms early return (5.1.1).** The physics `Update`
   returns immediately when `multiplier == 0`, exactly as specified. Sprite
   frame advance is done *before* that check, otherwise the frames crossed
   during a skipped frame would be lost from the global grid and burst
   animations would run slow.
3. **High score entry font (1.6.4).** Unspecified. The 16 px score column pitch
   equals a digit glyph at exactly 0.5×, so the *main* font is used.
4. **Take while a line is falling.** 4.4.2 lists four conditions, none about the
   block's state. Taking is allowed from a block at rest or falling (`DOWN`),
   refused for `UP`/`DROP`/`TAKE`.
5. **Particle spread (2.5.1).** `angle` and `powerVar` are named but never given
   values; 0.4 / 0.4 are used for every emitter.
6. **Ellipse mapping (1.6.1).** Read as `y = cy − R·sin(a)/e` — screen Y grows
   downwards. The sign is forced by the `−0.35` offset: with it, the character
   the arrow points at on the inner ring has its big portrait at `(−0.4, 41.4)`,
   flush with the left edge, and both neighbours are entirely off screen. With
   `+sin` the two rings are one step out of phase and the big picture shows the
   wrong character.
7. **Menu / Options layout** beyond the coordinates in 1.2.4 is unspecified;
   the selected entry is drawn at full alpha, the others at ~110/255.
8. Fullscreen, OpenGL and the `$HOME/kdrop.xml` write-back have browser
   equivalents: CSS scaling, canvas 2D, and `localStorage`.
