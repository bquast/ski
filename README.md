# ski

A ski and snowboard game for the Meta Quest 3 browser (WebXR). It also runs in a desktop browser.
It is a static site: no build step, no server code. The setup is the same as `cessna`.

## Files

| File | Function |
|---|---|
| `index.html` | Page, VR button, five script tags |
| `three.min.js` | three.js r187, as a classic script (global `THREE`) |
| `world.js` | Mountain, piste, trees, lift, village, sky |
| `ski.js` | Physics of the skis and the snowboard. No drawing. |
| `chase.js` | Spy chase: gun, enemies, waves, effects |
| `main.js` | Setup, input, equipment, hub, sound, frame loop |
| `.nojekyll` | Tells GitHub Pages to publish the files as they are |

## Deploy

GitHub Pages (classic): Settings > Pages > Deploy from a branch > `master`, folder `/ (root)`.

Cloudflare Pages: connect the repo, no build command, output directory `/`.

WebXR needs HTTPS. The two hosts supply it.

## The mountain

One run of 7.9 km from 2950 m down to 1000 m. The piste is the bottom of a wide valley, so the terrain brings you back to it.

- Slope: 5 to 21 degrees. The steep part ("the wall") is at 3.0 km. The flat part is at 5.2 km.
- Above 2150 m there are rocks. Below 2150 m there is forest on the two sides of the piste.
- Orange poles are the left edge of the piste. Blue poles are the right edge.
- Blue ramps are jumps. There is one each 560 m, left and right in turn. You can go around them.
- Start positions: TOP (0 km), MIDDLE (2.6 km), LOW (5.0 km).

## Controls on the Quest

Stand up. Look down the piste. Push B or Y to set your center.

| | Skis | Snowboard |
|---|---|---|
| Turn | Lean your body to the side | Stand with one side to the front. Lean to your toes or your heels. |
| Turn (hands) | Your hands are a bar: left hand down = left turn | Your front hand points where you want to go |
| Go | Put the pole tips in the snow and push to the rear | Pull a trigger |
| Brake | Squeeze a grip | Squeeze a grip |
| Speed | Bend your knees | Bend your knees |
| Jump | Bend your knees, then stand up fast | Same |

| Button | Function |
|---|---|
| A or X | Open and close the options board |
| B or Y | Set your center and your forward direction |
| Stick left, right | Turn (added to the lean) |
| Stick forward, rear | Push (below 14 km/h), brake |
| Trigger | Push (below 14 km/h). In the spy chase: the gun hand fires, the other hand pushes. |
| Options board | Stick: select and change. Trigger: OK. |

A hard turn makes you skid and slows you. A soft turn keeps your speed.
If you hit a tree, or land too hard, you fall. After 2 seconds you can go again.

## Controls on the Mac

| | |
|---|---|
| Turn | pointer (no press), or `A` `D` |
| Push | `W` |
| Brake | `S` |
| Speed | `SHIFT` |
| Jump | `SPACE` or `J` |
| Options board | `M`. Arrow keys: select and change. `ENTER`: OK. |
| New run | `N` |
| Spy chase | pointer: look and aim. `A` `D`: turn. Click or `SPACE`: fire. |

## Options

| Option | Values |
|---|---|
| Equipment | SKIS, SNOWBOARD |
| Game | FREE RUN, SPY CHASE |
| Start | TOP, MIDDLE, LOW |
| Easy skiing | OFF, ON. ON: the skis follow the piste if you do not steer, top speed is approximately 60 km/h, and you do not fall. |
| Steer with | LEAN + HANDS, LEAN, STICK |
| View turns | WITH THE PISTE (very slow, approximately 2 degrees each second), NEVER (you turn your body), WITH YOU |
| Comfort ring | LIGHT, OFF, STRONG. A dark frame around your view that closes at speed. |
| Gun hand | RIGHT, LEFT |

The options and the best results stay in the browser (`localStorage`).

## Comfort

- The horizon always stays level. The view does not roll and does not pitch.
- The view does not turn when the skis turn. The skis turn below you, and you move to the side.
- The default "View turns" value follows the piste, not the skis. It is slow.
- The hub is fixed in the play space, not on your head.
- If the speed is too much: set "Easy skiing" to ON and "Comfort ring" to STRONG.

## Spy chase

Skiing is easy (see "Easy skiing"). One hand has a pistol with a red laser dot. The other hand keeps its pole.
Enemies come in 12 waves. Each wave is also the position where you start again if you are down.

| Enemy | Hits | Points | Attack |
|---|---|---|---|
| Skier | 1 | 100 | Single shots |
| Parachute skier | 1 | 150 | Single shots from the air, then it is a skier. A hit on the parachute is sufficient. |
| Snowmobile | 2 | 250 | Single shots |
| Tracked truck | 9 | 500 | Fast shots from the roof. Do not touch the truck. |
| Airplane | 5 | 800 | Flies up the piste to you and fires a line down the piste. Move to the side. Three passes. |
| Helicopter | 10 | 1000 | Fires a line in the snow that comes to you. Turn away from it. |

Your health comes back after 4 seconds without a hit. At the finish line you get 10 points for each health point.

## Numbers that you can change

- `main.js`, top: `POLE_TILT`, `POLE_GAIN`, `LEAN_FULL`, `HAND_TILT_FULL`, `HAND_YAW_FULL`, `FIRE_TIME`, `RING_ANGLE`.
  If the poles point in an incorrect direction in the headset, change `POLE_TILT`.
- `ski.js`, object `GEAR`: friction, air drag, turn rate, edge grip, brake. `ASSIST_VMAX`, `ASSIST_VMIN`: easy mode speeds.
- `chase.js`, objects `FOE` and `WAVES`: enemy strength, points, and the contents of each wave.
- `world.js`, top: sizes, `TREELINE`, `START_T`, sun, fog. `slopeAt()` is the steepness of the run. `pisteX()` is its shape.

## Test results

Physics, in Node (120 steps each second):

| Test | Result |
|---|---|
| Skis, along the piste, you stand | 91 km/h maximum, 62 km/h average, 7 min 36 s |
| Skis, no steer input, knees bent | 142 km/h maximum |
| Skis, easy mode, no input | Stays on the piste to the finish, 64 km/h maximum, no falls |
| Brake from 72 km/h | Stop after 62 m |
| Full turn for 4 seconds from 77 km/h | 27 km/h |
| Jump ramps at 60 to 90 km/h | 0.5 to 1.0 s in the air |

Spy chase, in headless Chrome, automatic player: a shot each 0.35 s gives no damage; a shot each 1.2 s gives a minimum health of 21; no shots gives 12 restarts.

Drawing: approximately 210 000 triangles and 25 draw calls at the maximum.

## three.js

`three.min.js` is the official r187 module build, changed to one classic script with esbuild.
To make it again, or to make it from a newer release:

```
npm pack three
tar xzf three-*.tgz
npx esbuild package/build/three.module.js --bundle --format=iife --global-name=THREE --minify --outfile=three.min.js
```
