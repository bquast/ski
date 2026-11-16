# ski

A ski and snowboard game for the Meta Quest 3 browser (WebXR), with a chase and a mission. It also runs in a desktop browser.
It is a static site: no build step, no server code. The setup is the same as `cessna`.

## Files

| File | Function |
|---|---|
| `index.html` | Page, VR button, six script tags |
| `three.min.js` | three.js r187, as a classic script (global `THREE`) |
| `world.js` | Mountain, sections, jumps, crevasses, trees, houses, bases, sky |
| `ski.js` | Physics of the skis and the snowboard. No drawing. |
| `chase.js` | Enemies, grenades, targets, the rules of the chase and the mission, effects |
| `guns.js` | Pistol, machine gun, sniper rifle with scope, your grenades |
| `main.js` | Setup, input, equipment, hub, sound, frame loop |
| `.nojekyll` | Tells GitHub Pages to publish the files as they are |

## Deploy

GitHub Pages (classic): Settings > Pages > Deploy from a branch > `master`, folder `/ (root)`.

Cloudflare Pages: connect the repo, no build command, output directory `/`.

WebXR needs HTTPS. The two hosts supply it.

## The mountain

One run of 7.9 km, from 3550 m down to 925 m. Each section is different.

| Start (km) | Section | Slope | What is there |
|---|---|---|---|
| 0.0 | HEADWALL | 31° | Wide and steep. Ramps and ledges. |
| 0.7 | GLACIER | 12° | Blue ice (little grip), ice blocks, 11 crevasses, rollers |
| 1.9 | ICEFALL | 27° | Ledges with drops of 2.5 to 6.5 m, rocks |
| 2.5 | OVERLOOK | 2° | A flat edge above the upper base |
| 2.6 | UPPER BASE | 30°, then flat | Buildings, watchtowers, fuel tanks, radar |
| 3.1 | THE GULLY | 27° | 26 m wide, rock walls, fast bends, small ramps |
| 3.9 | MOGULS | 20° | Bumps, ramps, a group of houses at the bottom |
| 4.4 | THE TREES | 16° | Trees on the piste. One clear line bends left and right. |
| 5.5 | OVERLOOK, LOWER BASE | 2°, 30°, flat | The second base, with a helicopter on a pad |
| 6.1 | THE CLIFFS | 21° | Ledges, rollers, some trees |
| 7.2 | VILLAGE | 9° | 84 houses. You ski through the streets. |

- Jumps: 73 ramps (blue) and 27 ledges, and rollers each 40 m in many sections. A test run had 83 jumps and 57 seconds in the air.
- Crevasses: a row of thick red poles shows each one. Above 40 km/h you fly across from the ramp at its top edge. Slower: jump, or go around the open end (where the poles stop).
- Orange poles are the left edge of the piste. Blue poles are the right edge. Deep snow off the piste slows you.
- If you are almost stopped and do not push, you stay where you are, also on a steep slope.

## Controls on the Quest: skiing

Stand up. Look down the piste. Push B or Y to set your center.

| | Skis | Snowboard |
|---|---|---|
| Position | Look forward | Stand with your side to the front (the option "Board stance" sets which foot is in front). Turn your head to look down the piste. |
| Turn | Lean your body to the side. Or: your hands are a bar, left hand down = left turn. | Turn your shoulders. The line from your rear hand to your front hand is the steering. Lean to your toes or heels helps. |
| Go | Put the pole tips in the snow and push to the rear | Pull a trigger (free run) |
| Brake | Squeeze a grip, or stick to the rear | Same |
| Speed | Bend your knees | Same |
| Jump | Bend your knees, then stand up fast. A faster move gives a higher jump. | Same |

If you look forward on the snowboard, your shoulders are across the board and the board makes a full turn. This is intended: it makes you stand to the side.
With a weapon in your hands, the snowboard uses only the lean to your toes or heels.

## Controls on the Quest: chase and mission

| Hand | Button | Function |
|---|---|---|
| Gun hand | Trigger | Fire |
| Gun hand | A (or X) | Next weapon |
| Gun hand | Grip | Brake |
| Other hand | Grip, near the weapon | Hold the weapon with two hands |
| Other hand | Grip, away from the weapon | Brake |
| Other hand | Trigger | Hold a grenade. Move your arm and release to throw. |
| Other hand | X (or A) | Options board |
| Both | B or Y | Set your center |
| Both | Stick | Left, right: turn. Forward: push. Rear: brake. |

The other hand keeps its ski pole when it does not hold the weapon or a grenade.

## Weapons

| Weapon | Use |
|---|---|
| PISTOL | One hand. Red dot. No reload. |
| MACHINE GUN | 14 shots each second, 40 shots, then 1.5 s reload. With one hand it is not accurate. With two hands it points from your gun hand to your other hand and is accurate. |
| SNIPER RIFLE | 12 times the damage, 5 shots, range 1500 m. Hold it with two hands and put the scope near your eye: the scope shows a zoom picture. |
| Grenades | 6. One new grenade each 12 seconds. They explode after 1.8 s, or when they touch an enemy. Radius 10 m. |

## Enemies

The game keeps a number of enemies around you at all times ("Enemies": FEW 6, MANY 10, VERY MANY 15, and more near the end).
They come from behind, from the sides in front of you, and some wait on the piste.

| Enemy | Hits | Points | Notes |
|---|---|---|---|
| Skier | 1 | 100 | Some throw grenades |
| Parachute skier | 1 | 150 | A hit on the parachute is sufficient |
| Snowmobile | 2 | 250 | Some throw grenades |
| Tracked truck | 14 | 500 | Do not touch it. It cannot go into the gully, the trees or the glacier. |
| Airplane | 7 | 800 | Fires a line down the piste. Move to the side. |
| Helicopter | 14 | 1000 | Fires a line in the snow that comes to you. Turn away. |
| Guard (bases) | 1 | 200 | Stands on the snow or on a watchtower |

How to ski smart:

- Enemies aim at the position where you will be. If you turn, they miss. If you go straight, they hit.
- Bend your knees: you are a smaller target.
- Enemies fire more when there are more of them. Each enemy that you shoot gives you some health.
- Lead them through the trees, the village and the crevasses: snowmobiles crash often, skiers sometimes. Trucks stop.
- An enemy grenade shows a red ring on the snow. Go away from the ring.
- Health comes back after 5 seconds without a hit. Each new section is a checkpoint.

## Mission

1. Go down to the upper base (chase).
2. Stop in the green light at the overlook.
3. Use the sniper rifle: shoot the 8 guards. The alarm starts 3 seconds after the first hit; then they fire at you.
4. Destroy the 3 fuel tanks and the radar. You can do this from the overlook (one sniper shot explodes a tank), or ski through the base with the machine gun and grenades. One explosion can destroy the tanks near it.
5. Alarm: go to the lower base (chase, through the gully, the moguls and the trees).
6. Stop at the second overlook. Shoot the 10 guards.
7. Destroy the helicopter on its pad, 4 tanks and the radar.
8. Escape through the cliffs and the village to the finish line.

If you go past a base and targets remain, you start again at the overlook. In the CHASE game the two bases are also there, for points.

## Controls on the Mac

| | |
|---|---|
| Turn | pointer (no press) in a free run, or `A` `D` |
| Push, brake | `W`, `S` |
| Speed | `SHIFT` |
| Jump | `J` (and `SPACE` in a free run) |
| Fire | click or `SPACE` |
| Weapon | `1` `2` `3` |
| Scope | `Q` or the right button |
| Grenade | `G` |
| Options board | `M`. Arrow keys: select and change. `ENTER`: OK. |
| New run | `N` |

## Options

Equipment, Game (FREE RUN, CHASE, MISSION), Enemies, Start (TOP, UPPER BASE, LOWER BASE), Easy skiing, Board stance, Steer with, View turns, Comfort ring (default OFF), Gun hand.

The options and the best results stay in the browser (`localStorage`).

## Numbers that you can change

- `main.js`, top: `POLE_TILT`, `POLE_GAIN`, `LEAN_FULL`, `HAND_TILT_FULL`, `SHOULDER_FULL`, `TUCK_START`, `JUMP_RISE`, `JUMP_MIN`, `JUMP_MAX`.
  If the poles point in an incorrect direction in the headset, change `POLE_TILT`.
- `ski.js`, object `GEAR`: friction, air drag, turn rate, edge grip, brake, landing speed that makes you fall.
- `world.js`, list `SEC`: one line for each section (steepness, width, walls, moguls, trees, ice, rollers). `makeFeatures()` sets the number of jumps. `COMP` is the contents of the two bases.
- `chase.js`: `FOE` (enemy strength and points), `DIFF` (number of enemies, shots each second, damage), `STAGES` (the mission).
- `guns.js`: `WPN` (rate, damage, accuracy, magazine), `GREN_MAX`, `GREN_TIME`, `SCOPE_FOV`.

## Test results

Not tested in a headset. Tested in Node (physics) and in headless desktop Chrome (full game, and the VR input code with a simulated head and controllers).

| Test | Result |
|---|---|
| Skis, automatic pilot, no brake | 122 km/h maximum (headwall), 9 to 10 minutes with falls |
| Skis, automatic pilot, brake above 70 km/h | 9 min 50 s, 83 jumps, 57 s in the air |
| Crevasse at 22 and 36 km/h, no jump | Falls in |
| Crevasse at 50 km/h, or with a jump at all speeds | Goes across |
| Stop on the 30° slope at the overlook | Stays stopped. One push: 50 km/h after 3 s. |
| Sight lines from the two overlooks | All guards and targets are visible, at 200 to 400 m |
| Mission, automatic player, one kill each 0.8 s | Complete in 12 minutes, minimum health approximately 25, no restart |
| Chase, MANY, one kill each 0.8 s | 1 restart. Without shots: the player does not get past the glacier. |

Drawing: approximately 130 000 to 220 000 triangles.

## three.js

`three.min.js` is the official r187 module build, changed to one classic script with esbuild.
To make it again, or to make it from a newer release:

```
npm pack three
tar xzf three-*.tgz
npx esbuild package/build/three.module.js --bundle --format=iife --global-name=THREE --minify --outfile=three.min.js
```
