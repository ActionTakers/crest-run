# MonkeyKing & Jack — Lipah Bay

The dedicated game entrance is [`../bay/`](../bay/). It opens with the tour
jukung, MonkeyKing at the helm and Jack on the bow, followed by the bay's own
journey hub. The original Crest Run entrance remains at the repository root.

## Playing

Choose **Enter the bay** to set up steering and sound. The first recommendation
is **Learn to sail with Jack**, but all three voyages are available immediately:

| Voyage | What the player does |
| --- | --- |
| Glass Morning | Find the drifting guests and free a turtle from a lost net. |
| Before the Wind | Tow Jack and lead the other boats home as a squall arrives. |
| Under Agung | Find an overdue boat with nine people; carry no more than six guests at once. |

Each voyage keeps its existing three departure choices, actions on the water,
result and reflection on the beach. The hub shows collected lesson leaves and
harmonies, and suggests the first voyage whose attempt and reflection are not
both complete. These suggestions never lock another voyage. A completed attempt
does not imply that everyone came home.

After a voyage, **On the beach** opens its reflection. Returning from reflection
opens the bay hub. Opening the leaf book from the departure screen still returns
to that departure screen. Pausing and quitting either practice or a voyage also
returns to the bay.

## Jack's optional lesson

The lesson uses the separate racing jukung and the existing wind-powered
sailing simulation. It teaches three actions:

1. **Find the wind:** steer onto a useful reach with trim assist available.
2. **Feel the sail:** adjust the sheet manually and keep the sail drawing.
3. **Balance the boat:** shift crew weight toward the windward side and keep the
   boat moving with controlled heel and float loading.

Each exercise asks for four seconds of useful sailing after the player's own
action. Brief corrections are forgiven. A longer loss of useful conditions
reduces progress only within the current exercise; previous exercises stay
earned for that lesson. The balance controls open when the third exercise begins.

**Sail freely** dismisses coaching without marking the lesson complete. After
completion, the hub offers free sailing and a separate **Repeat sailing lesson**
button. Quitting or restarting an unfinished lesson begins it again; only its
completed status is saved. There is no practice timer, race result or ghost.

Keyboard: **A/D** steer, **Q/E** ease/sheet in, **T** toggles trim assist,
**Escape/P** pauses. Arrow keys steer when a slider is not focused; a focused
slider retains its native arrow-key navigation. Touch and tilt steering use the
same sheet and balance sliders. Pause provides the way back to the bay while
sailing freely.

The three story voyages still use their established tour-boat handling. This
release introduces the guided sailing lesson; it does not replace or rebalance
the existing missions with the experimental sail model. See
[SAILING_TRIAL.md](SAILING_TRIAL.md) for the two boats, construction references
and the limits of the prototype physics.

## Progress and implementation

- The bay has its own `monkeyking-jack-bay-save` browser-storage key.
- When no compatible bay journal exists, existing voyage records, voyage medals,
  collected leaves and preferences are copied from `crest-run-save`. Arcade
  records, ghosts and unlocks are not imported. The original save is not edited.
- Once a bay journal exists, it takes precedence over the original save.
- A stationary, buoyant voyage snapshot supplies the hub scenery and cast. Its
  mission, propulsion and input recording do not run.
- The bay boot path starts with a native jukung and avoids preloading the yacht,
  llama and emperor models. The rendering engine and shared modules remain the
  existing Three.js code; this change adds no service or dependency.
- `bay/index.html` supplies the `data-game="bay"` route and resolves shared
  assets through `<base href="../">`. It has its own manifest, scope and title.
- `?sailing=1` enters sailing after steering setup; `?voyage=mk1`, `mk2` or `mk3`
  opens that voyage's departure choices. The bay never selects an arcade course
  or boss from film-query overrides.

## Verification

Run `node --test tests/*.test.mjs` from the repository root. The added tests
cover save migration, journal recommendations, a stationary hub, actual-physics
lesson completion and the main screen-routing lifecycle. Existing tests cover
the sailing model, focused controls, cast lifecycle and unchanged arcade/tour
simulation behavior.

CPU and structural tests do not establish rendering performance or phone
usability. The development browser could not provide WebGL 2, so a visual
playthrough on a physical phone remains to be done.
