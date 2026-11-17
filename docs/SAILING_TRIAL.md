# Jack's sailing trial

This increment adds an optional sailing practice to Crest Run. Open the game with
`?sailing=1`, or choose **Sailing trial** from the menu. The trial starts after the
normal steering and sound setup.

## What the player can try

The apparent-wind instrument shows the breeze felt aboard. Trim assist starts on;
moving the sheet slider switches to manual trim. The sail opens and fills, the
quarter rudder turns, and each float makes a wake according to its own load.
The balance panel adjusts the sail's centre of effort and crew weight. Jack shifts
slightly across the seat with the crew setting.

| Input | Action |
| --- | --- |
| A / D, or left / right arrows | Steer |
| Q / E | Ease / sheet in |
| T | Toggle trim assist |
| C | Change between chase and high view |
| Escape / P | Pause or resume |
| Touch | Steer with the left thumb; use the sheet and balance sliders |
| Tilt, when available | Tilt to steer; use the same sliders |

A focused slider keeps its normal arrow, Home, End, PageUp and PageDown keys.
The letter shortcuts and pause still work while a slider is focused. Practice
does not create race records, ghosts, medals or a time limit, and has no engine
or boost. Leaving practice restores the ordinary controls.

## Two craft with different jobs

The existing tour jukung remains the craft for Glass Morning, Before the Wind
and Under Agung. Its geometry, voyage layout and limit of **six guests** are
unchanged. Crew members are separate from that guest count. MonkeyKing remains
at the helm; Jack remains the lookout, the skipper of the other boat, or the
helper on the beach as each voyage requires.

The new `jukung-racer` is a separate practice craft with Jack as its sole skipper.
It is excluded from the normal fleet picker and rival selection. Both craft use
the existing sail artwork and the same cream, teal, red and gold art direction.

| Racing baseline | Value |
| --- | ---: |
| Central hull length | 6.50 m |
| Central hull beam | 0.55 m |
| Hull depth | 0.65 m |
| Nominal draft | 0.22 m |
| Float length, including tips | 6.80 m |
| Float centre offset, each side | 1.65 m |
| Nominal outside float span | 3.48 m |
| Fixed masthead above waterline | 1.75 m |
| Upper yard peak above waterline | 5.50 m |
| Boat geometry | 8,200 triangles |

These are **designer baseline values, not measurements of Jack's boat**. The
short fixed mast and the much longer yard are different parts. Hull beam is also
different from the distance across the outriggers. The geometry and simulation
share one specification so those distinctions survive rendering and contact.

## Construction details and sources

The racing craft has an open slender hull, low painted bow eyes, a higher stern
finial, long bamboo floats, separate curved upper arms and lower connectors,
visible lashings, a mast partner with an opening around the pole, a two-spar
triangular sail, and a port-quarter pancer with a forward-reaching tiller.
The sheet and upper control line remain attached while the sail changes angle.

The design combines these references; regional examples are not treated as a
survey of one boat:

- [Bali Santai: the story of a jukung](https://www.southernwoodenboatsailing.com/news/bali-santai-the-story-of-a-jukung): first-hand Padangbai construction account and photographs.
- [Pacific canoes — Horridge, Fig. 14](https://www.pastmasters.org.au/uploads/2/6/7/5/26751978/pacific_canoes_-_horridge.pdf): short mast and long spars, plus rig balance and handling context.
- [MAGNT Boat Collection, SEA 1297](https://www.woodenboatguildtas.org.au/wp/wp-content/uploads/2018/11/MAGNT-Boat-Collection-reduced-sz.pdf): one catalogued slender Padangbai craft; its depth is not its draft.
- [Ward's archaeological study](https://doi.org/10.1080/10572414.2025.2580936): construction, floats and regional variation.

## What the simulation establishes

The fixed-step numeric model includes apparent wind, a no-go region, a simple
trim-dependent polar, leeway, a flow-dependent rudder, rudder drag, independent
float immersion, restoring roll, crew balance and rig balance. Contacts use
separate capsules for the narrow central hull and each float, keeping the gaps
between them open.

Mass, sail area, polar, drag and restoring coefficients are provisional gameplay
settings. This is not a calibrated prediction of racing speed. It does not yet
model lashing flexibility, a complete tack or gybe manoeuvre, capsize, full
submerged volumes, current routing, or a moving physical centre of effort.
Jack's feedback can guide those next decisions without changing the tour boat.

## Existing character assets

The existing King and Jack models and embedded textures are reused. Their
character-specific seat, watch and point poses are corrected for their actual
joint axes; the older crew's pose rules remain separate. Geometry and pose QA
uses Blender and the actual glTF/Three.js hierarchy. Only triangle references
to a disconnected duplicate tail fragment were removed from each model (124
King faces and 238 Jack faces). The complete tails, all vertex attributes,
textures, 78-joint rigs and idle clips are retained. Any rendered QA views are asset inspections, not screenshots of
a successful browser playtest.

## Verification and limits

The numeric suite is run with:

```sh
node --test tests/*.test.mjs
```

The sailing suite has 12 checks including calm-air energy loss, headwind versus reaching, sheet
depowering, mirror symmetry, float loading, rudder flow and drag, balance,
determinism, practice isolation and thin contact gaps. It also compares an
ordinary four-boat yacht race for 1,800 steps and a normal tour-jukung voyage for
3,600 steps against commit `e29e97012f19096e70c135e3ff994daf2762d5a8`.
That regression test needs Git history containing the baseline commit.

The cast-lifecycle and keyboard-focus regressions are included in the same
command. Additional bounded checks cover native mesh dimensions, sail/rudder signs,
moving line endpoints, emblem containment, focused-slider shortcuts and
repeated real-model transitions between voyage, racer, tow and night roles.
They verify that only one Jack is attached at a time and that old rigs are
released when the cast changes.

The available browser reported that WebGL 2 was unavailable. CPU geometry,
animation and lifecycle checks therefore do **not** establish mobile frame rate,
touch ergonomics or final WebGL appearance. Those remain on-device checks.
The existing ranked simulation identifier stays `crest-1` because its tested
behavior is unchanged and the new practice is not recorded.
