# ski

A ski and snowboard game for the Meta Quest 3 browser (WebXR), with a chase and a mission. It also runs in a desktop browser.
It is a static site: no build step, no server code. The setup is the same as `cessna`.

## Files

| File | Function |
|---|---|
| `index.html` | Page, VR button, eight script tags |
| `three.min.js` | three.js r187, as a classic script (global `THREE`) |
| `world.js` | Mountain, sections, jumps, crevasses, trees, houses, bases, sky |
| `ski.js` | Physics of the skis and the snowboard. No drawing. |
| `chase.js` | Enemies, grenades, targets, the rules of the chase and the mission, effects |
| `guns.js` | Pistol, machine gun, sniper rifle with scope, your grenades |
| `copilot.js` | Copilot mode: pairing (QR code or typed code), state, options, files. Includes PeerJS 1.5.5 and qrcode-generator 2.0.4 (MIT). |
| `photo.js` | 360 photos: capture, storage on the device, gallery, viewer on the page and in VR, ZIP |
| `main.js` | Setup, input, equipment, hub, sound, copilot state and view, frame loop |
| `.nojekyll` | Tells GitHub Pages to publish the files as they are |

## Deploy

GitHub Pages (classic): Settings > Pages > Deploy from a branch > `master`, folder `/ (root)`.

Cloudflare Pages: connect the repo, no build command, output directory `/`.

WebXR needs HTTPS. The two hosts supply it.

## 360 photos

A 360 photo (photosphere) shows the full world around you: 360 degrees across, and from straight up to straight down.
The photo is taken from the position of your eyes. The hub is not in the photo. Your skis, hands and weapon are.

| | Quest | Mac |
|---|---|---|
| Take a photo | Push a thumbstick down (click it), or TAKE PHOTO 360 on the options board | `P`, or TAKE PHOTO 360 |
| Look at the photos | VIEW PHOTOS on the options board: the photo is around you. Stick left, right: the next photo. Trigger, A or X: close. | PHOTOS 360 (top left), then click a photo. Drag to look around, wheel to zoom, arrow keys for the next photo. |
| Save as a file | On the page (out of VR): PHOTOS 360, then SAVE, SAVE NEW (ZIP) or SAVE ALL (ZIP). The files go to the Downloads folder of the Quest (Files app). | The same buttons. The files go to the Downloads folder of the Mac. |

- **Format:** JPEG, 4096 x 2048 (option "Photo 360 size": 8192 x 4096). Each photo is approximately 0.5 to 3 MB.
- **360 tag:** each JPEG has the Google panorama tag (GPano XMP). Google Photos, Facebook and other 360 viewers show it as a 360 photo. The center of the photo is the direction that you looked in.
- **Storage:** the photos stay in the browser storage of the device (IndexedDB) until you delete them. A reload does not remove them. If you clear the site data of the browser, they are gone: save them as files.
- **Copilot:** each photo also goes to the connected copilot device (the Mac), with the same quality. The hub of the Quest shows THE COPILOT HAS THE PHOTO when it arrived. On the Mac you can set "save each new photo from the pilot as a file" in the gallery. The Mac can also take a photo on the Quest: TAKE PHOTO 360 in the copilot panel, or `P`.
- **Time:** a photo stops the game for a short time (approximately 0.2 to 0.5 s on a Quest, more for 8192 x 4096).

## Copilot

A second device (for example your MacBook) sees the game of the Quest and changes the options. It gets the 360 photos.

1. On the Mac, open the game and push **BE COPILOT** (panel at the top right). The Mac shows a QR code.
2. On the Quest, scan the QR code (Quick Settings > Camera, or the Camera app). The game opens and connects to the Mac.
3. The Quest keeps the code of the Mac. After a reload, or from a bookmark, it connects again by itself. FORGET THE COPILOT DEVICE (in the panel on the Quest page) stops this.

Or type the code of the Quest on the Mac and push JOIN. The code of the Quest is on the last line of the options board, and in the panel on the page.

On the Mac:

| | |
|---|---|
| View of the pilot / outside view | `C` |
| Option lines | click, or keys `1` to `9` |
| Take a photo on the Quest | `P` |
| Make the panel small | `H` |
| Stop | STOP COPILOT |

The Mac shows the skier, the view of the Quest, the hub, the options board, the enemies, the targets of the bases and the explosions. It does not show bullets and grenades.

How it connects: the free PeerJS cloud server helps the two devices to find each other (a third-party service). After that the data goes directly between the devices with WebRTC. On the same WiFi it stays in your network. `?peer=host:port` in the address uses your own PeerServer.

## The mountain

One run of 7.9 km, from 3550 m down to 925 m. The mountain is open: you can ski on the full width of the face, 200 to 360 m to each side of the center line, and farther into the side slopes.
The center line is a groomed piste of 36 m. It is the easy way down, and it is only a small part of the mountain.

| Start (km) | Section | Slope | What is there |
|---|---|---|---|
| 0.0 | HEADWALL | 30°, to 60° in places | Wide and steep, with bowls and spurs. Ramps and ledges. |
| 0.7 | GLACIER | 14° | Blue ice (little grip), ice blocks, 11 rows of crevasses, rollers |
| 1.9 | ICEFALL | 25° | Ledges with drops of 2.5 to 7 m, rocks |
| 2.5 | OVERLOOK | 2° | A flat edge above the upper base |
| 2.6 | UPPER BASE | 30°, then flat | Buildings, watchtowers, fuel tanks, radar |
| 3.1 | THE GULLY | 27° | In the middle: a gully 26 m wide and 54 m deep, cut into the face, with fast bends. Left and right of it: open shoulders with ledges. |
| 3.9 | MOGULS | 19° | Bumps, ramps, a group of houses at the bottom |
| 4.4 | THE TREES | 16° | Forest on the full face, with dense groups and open glades |
| 5.5 | OVERLOOK, LOWER BASE | 2°, 30°, flat | The second base: a helicopter on a pad and a large headquarters building |
| 6.1 | THE CLIFFS | 20° | Ledges, rollers, some trees |
| 7.2 | VILLAGE | 9° | 84 houses. You ski through the streets. |

- Jumps: 217 ramps (blue) and 132 ledges on the full width of the face, and rollers. A test run on the open face had 99 jumps and 77 seconds in the air.
- Hills, bowls and spurs change the slope from place to place. Find your own line.
- Crevasses: each row has pieces of 160 m with gaps of 100 m. A row of thick red poles shows each piece. Above 40 km/h you fly across from the ramp at its top edge. Slower: jump, or go through a gap.
- Orange and blue poles are the edges of the groomed piste.
- If you are almost stopped and do not push, you stay where you are, also on a steep slope.

## Looks

The option "Look" changes the style. The mountain and the rules are the same.

| Look | Style |
|---|---|
| ALPINE | Blue sky, sun, view to the far mountains, wood chalets, green trees, enemies in black and red |
| SNOW FORTRESS | Cloud, snowfall, a view of 1.5 km, gray trees, concrete buildings, enemies and vehicles in white |

In the SNOW FORTRESS look the enemies are hard to see. The chase is more difficult.

## Controls on the Quest: skiing

Stand up. Look down the mountain. Push B or Y to set your center.

| | Skis | Snowboard |
|---|---|---|
| Position | Look forward | Stand with your side to the front (the option "Board stance" sets which foot is in front). Turn your head to look down the mountain. |
| Turn | Lean your body to the side. Or: your hands are a bar, left hand down = left turn. | Your front arm is the steering. Hold it out in line with the board. Turn your shoulders: the arm turns, and the board follows. Lean to your toes or heels helps. |
| Go | Put the pole tips in the snow and push to the rear | Pull a trigger (free run) |
| Brake | Squeeze a grip, or stick to the rear | Same |
| Speed | Bend your knees | Same |
| Jump | Bend your knees, then stand up fast. A faster move gives a higher jump. | Same |

Snowboard notes:

- The steering uses the direction from your head to your front hand. It does not use the rear hand, because the headset cannot always see a hand behind your body.
- The bottom line of the hub shows `STEER: FRONT ARM` or `STEER: LEAN`. LEAN means: the front hand is not seen, is at your body, or holds a weapon. Then only the lean to your toes or heels steers.
- In a chase, hold the weapon in your rear hand. Then your front arm still steers.
- If you look forward as on a monoski, your front arm points to the side and the board makes a full turn. This is intended.
- "Easy skiing" turns the board to the groomed piste when you do not steer. In v2 it also worked against a small steer input; this is corrected.

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
They come from behind, from the sides in front of you, and some wait in your way. They follow you on the full width of the mountain.

| Enemy | Hits | Points | Notes |
|---|---|---|---|
| Skier | 1 | 100 | Some throw grenades |
| Parachute skier | 1 | 150 | A hit on the parachute is sufficient |
| Snowmobile | 2 | 250 | Some throw grenades |
| Tracked truck | 14 | 500 | Do not touch it. It cannot go into the gully section, the trees or the glacier. |
| Airplane | 7 | 800 | Fires a line down the mountain. Move to the side. |
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
2. Stop in the green light at the overlook (on the center line, 30 m to each side).
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
| 360 photo | `P` |

## Options

Equipment, Game (FREE RUN, CHASE, MISSION), Enemies, Start (TOP, UPPER BASE, LOWER BASE), Easy skiing, Board stance, Steer with, View turns, Comfort ring (default OFF), Gun hand, Look (ALPINE, SNOW FORTRESS), Photo 360 size.

The options board also has TAKE PHOTO 360 and VIEW PHOTOS.

The options and the best results stay in the browser (`localStorage`).

## Numbers that you can change

- `main.js`, top: `POLE_TILT`, `POLE_GAIN`, `LEAN_FULL`, `HAND_TILT_FULL`, `SHOULDER_FULL` (front arm angle for a full turn), `TUCK_START`, `JUMP_RISE`, `JUMP_MIN`, `JUMP_MAX`.
  If the poles point in an incorrect direction in the headset, change `POLE_TILT`.
- `ski.js`, object `GEAR`: friction, air drag, turn rate, edge grip, brake, landing speed that makes you fall.
- `world.js`, list `SEC`: one line for each section (steepness, open width, gully, moguls, trees, ice, rollers, relief). `groundAt()` has the sizes of the hills. `makeFeatures()` sets the number of jumps. `COMP` is the contents of the two bases. `LOOKS` has the colors, fog and light of each look.
- `chase.js`: `FOE` (enemy strength and points), `DIFF` (number of enemies, shots each second, damage), `STAGES` (the mission), `PAL` (enemy colors of each look).
- `guns.js`: `WPN` (rate, damage, accuracy, magazine), `GREN_MAX`, `GREN_TIME`, `SCOPE_FOV`.
- `photo.js`, top: `PHOTO_W` (photo sizes), `PHOTO_Q` (JPEG quality).

## Test results

Tested in Node (physics) and in headless desktop Chrome (full game, and the VR input code with a simulated head and controllers). The open mountain, the new snowboard steering and the second look are not tested in a headset.

| Test | Result |
|---|---|
| Skis, groomed line, automatic pilot, brake above 70 km/h | 8 min 53 s, 39 jumps |
| Skis, open face 180 m left of the line, no brake | 8 min 13 s, 117 km/h maximum, 99 jumps, 77 s in the air |
| Snowboard, open face 170 m right of the line, brake above 70 km/h | 11 min 24 s, 73 jumps |
| Crevasse above 50 km/h, or with a jump at all speeds | Goes across |
| Sight lines from the two overlooks, at the center and 30 m to each side | All guards and targets are visible |
| Front arm 17° to one side | Steer 0.38 of full, with or without the rear controller |
| Mission, automatic player on the groomed line, one kill each 0.8 s | Complete in 10 minutes, no restart |
| Chase, automatic player 160 m off the line, one kill each 0.8 s | Complete, 2 restarts |

Drawing: approximately 130 000 to 150 000 triangles.

360 photos and copilot (v4), in headless Chrome with a local PeerServer. Not tested on a Quest, and not with the public PeerJS server.

| Test | Result |
|---|---|
| Colored boxes in front, right, behind, left and above | Each one at the correct place in the photo, in the page viewer and in the VR viewer |
| JPEG | 4096 x 2048, GPano tag present, opens in other programs |
| Storage | The photo is there after a reload |
| SAVE and SAVE ALL (ZIP) | Correct file names, the ZIP passes a test |
| QR pairing, Quest reload, STOP and BE COPILOT again, FORGET, typed code, bad code | All correct |
| State | Same skier position and the same 19 enemies on the Mac |
| Option from the Mac | The Quest changes the look, the Mac follows |
| Photo from the Mac (`P`) | The Quest takes it, the Mac gets the same number of bytes, the Quest shows THE COPILOT HAS THE PHOTO |
| Speed, no 3D load | Pairing 1.5 s, a 3 MB file in 2.3 s |

## three.js

`three.min.js` is the official r187 module build, changed to one classic script with esbuild.
To make it again, or to make it from a newer release:

```
npm pack three
tar xzf three-*.tgz
npx esbuild package/build/three.module.js --bundle --format=iife --global-name=THREE --minify --outfile=three.min.js
```
