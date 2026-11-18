// main.js - setup, input, your equipment, the hub, sound, the copilot, the frame loop.
// Classic script. It uses THREE, world.js, ski.js, chase.js, guns.js, copilot.js and photo.js.
//
// Order of this file:
//   numbers that you can change, state, options, setup, input, view, equipment,
//   hub, sound, game flow, copilot, frame loop.

// ---------- numbers that you can change ----------

var POLE_TILT = 0.35;       // the pole points down from the controller, and this much to the rear (radians)
var POLE_GAIN = 1.6;        // speed that you get for each meter of pole push (m/s)
var LEAN_FULL = 0.17;       // body lean to the side for a full turn (m)
var LEAN_DEAD = 0.015;      // lean below this value does nothing (m)
var HAND_TILT_FULL = 0.45;  // skis: one hand higher than the other, as a ratio of the hand distance, for a full turn
var SHOULDER_FULL = 0.6;    // snowboard: angle between your front arm and the board for a full turn (radians)
var TUCK_START = 0.92;      // your knees are bent when your head is below this part of your height
var JUMP_RISE = 0.7;        // jump: your head must go up faster than this (m/s)
var JUMP_MIN = 2.8;         // jump: speed up from the snow (m/s), minimum and maximum
var JUMP_MAX = 5.5;
var RING_ANGLE = [0, 40, 30];   // comfort ring: open angle at speed, for OFF, LIGHT, STRONG (degrees)

// ---------- state ----------

var renderer, scene, camera, rig;
var vr = false, lastT = 0, acc = 0;
var game = {
	state: 'menu',           // 'menu', 'run', 'done'
	paused: false, spy: false,
	time: 0, runTime: 0, vmax: 0, doneTime: 0, air: 0, jumps: 0,
	msg: '', msgUntil: 0, result: '',
	nFall: 0, nLand: 0, nHit: 0, nCrev: 0, respawns: 0, white: 0, sec: -1,
	lastJump: 0, lastTuck: -9, steerSrc: ''
};
var head = { x: 0, y: 1.7, z: 0, yaw: 0, vy: 0 };
var cal = { cx: 0, cz: 0, h: 1.7, fwd: 0, pole: 1.15, wait: 0 };   // your standing position, set by B or Y
var viewDir = 0, rigYaw = 0, rigY = 0, hubYaw = 0, hubMove = false;
var hands = { left: makeHand(), right: makeHand() };
var keys = {}, mouse = { x: 0, y: 0, down: false, right: false };
var menu = { sel: 0, held: false };
var best = { time: {}, score: {} };

function makeHand() {
	return {
		obj: null, src: null, has: false, kit: null, glove: null, pole: null, gripMesh: null,
		px: 0, py: 0, pz: 0, seen: false, planted: false,
		trig: 0, grip: 0, sx: 0, sy: 0, bA: false, bB: false, bS: false,
		pT: false, pA: false, pB: false, pS: false, pX: 0
	};
}

// ---------- options ----------

var OPTS = [
	{ key: 'gear', label: 'Equipment', vals: ['SKIS', 'SNOWBOARD'] },
	{ key: 'game', label: 'Game', vals: ['FREE RUN', 'CHASE', 'MISSION'] },
	{ key: 'diff', label: 'Enemies', vals: ['FEW', 'MANY', 'VERY MANY'] },
	{ key: 'start', label: 'Start', vals: ['TOP', 'UPPER BASE', 'LOWER BASE'] },
	{ key: 'assist', label: 'Easy skiing', vals: ['OFF', 'ON'] },
	{ key: 'stance', label: 'Board stance', vals: ['LEFT FOOT FRONT', 'RIGHT FOOT FRONT'] },
	{ key: 'steer', label: 'Steer with', vals: ['BODY + HANDS', 'BODY', 'STICK'] },
	{ key: 'turn', label: 'View turns', vals: ['WITH THE PISTE', 'NEVER', 'WITH YOU'] },
	{ key: 'ring', label: 'Comfort ring', vals: ['OFF', 'LIGHT', 'STRONG'] },
	{ key: 'gun', label: 'Gun hand', vals: ['RIGHT', 'LEFT'] },
	{ key: 'look', label: 'Look', vals: ['ALPINE', 'SNOW FORTRESS'] },
	{ key: 'photo', label: 'Photo 360 size', vals: ['4096 x 2048', '8192 x 4096'] }
];
var opt = { gear: 0, game: 0, diff: 1, start: 0, assist: 0, stance: 0, steer: 0, turn: 0, ring: 0, gun: 0, look: 0, photo: 0 };

function loadOptions() {
	var o, b, i;
	try {
		o = JSON.parse(localStorage.getItem('ski-opt2') || '{}');
		for (i = 0; i < OPTS.length; i++) if (o[OPTS[i].key] >= 0 && o[OPTS[i].key] < OPTS[i].vals.length) opt[OPTS[i].key] = o[OPTS[i].key];
		b = JSON.parse(localStorage.getItem('ski-best2') || '{}');
		if (b.time) best.time = b.time;
		if (b.score) best.score = b.score;
	} catch (e) {}
}

function saveOptions() {
	try { localStorage.setItem('ski-opt2', JSON.stringify(opt)); localStorage.setItem('ski-best2', JSON.stringify(best)); } catch (e) {}
}

// ---------- setup ----------

function init() {
	var i, c, btn = document.getElementById('vr');
	renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.xr.enabled = true;
	renderer.xr.setReferenceSpaceType('local-floor');
	document.body.appendChild(renderer.domElement);

	scene = new THREE.Scene();
	camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.06, 30000);
	camera.rotation.order = 'YXZ';
	rig = new THREE.Group();
	rig.add(camera);
	scene.add(rig);

	makeWorld(scene);
	makeChase(scene);
	makeGear();
	makeGuns();
	makeHub();
	loadOptions();
	applyLook();
	photoInit();

	for (i = 0; i < 2; i++) {
		c = renderer.xr.getController(i);
		c.addEventListener('connected', function (e) {
			var h = hands[e.data.handedness];
			if (!h) return;
			h.obj = this; h.src = e.data; h.seen = false;
			this.add(h.kit);
		});
		c.addEventListener('disconnected', function () {
			var h = hands.left.obj == this ? hands.left : hands.right.obj == this ? hands.right : null;
			if (!h) return;
			this.remove(h.kit); h.obj = null; h.src = null;
		});
		rig.add(c);
	}

	renderer.xr.addEventListener('sessionstart', function () { cal.wait = 0.6; });
	renderer.xr.addEventListener('sessionend', function () {
		vr = false; calibrate(); btn.textContent = 'ENTER VR';
		photoVRClose();
		if (photo.unsaved) toast(photo.unsaved + ' new 360 photos on this device. PHOTOS 360 (top left): save them as files.');
	});
	if (navigator.xr && navigator.xr.isSessionSupported) {
		navigator.xr.isSessionSupported('immersive-vr').then(function (ok) {
			if (ok) btn.style.display = 'block';
		}).catch(function () {});
	}
	btn.addEventListener('click', function () {
		initAudio();
		if (renderer.xr.isPresenting) { renderer.xr.getSession().end(); return; }
		navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] }).then(function (s) {
			renderer.xr.setSession(s);
			btn.textContent = 'EXIT VR';
		}).catch(function (e) { btn.textContent = 'VR DID NOT START'; });
	});

	window.addEventListener('resize', function () {
		camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
		renderer.setSize(window.innerWidth, window.innerHeight);
	});
	window.addEventListener('keydown', onKey);
	window.addEventListener('keyup', function (e) { keys[e.code] = false; });
	window.addEventListener('mousemove', function (e) { mouse.x = e.clientX / window.innerWidth * 2 - 1; mouse.y = e.clientY / window.innerHeight * 2 - 1; });
	window.addEventListener('mousedown', function (e) {
		initAudio();
		if (e.target !== renderer.domElement) return;       // a click on the panel or the gallery is not a shot
		if (e.button == 2) mouse.right = true; else mouse.down = true;
	});
	window.addEventListener('mouseup', function (e) { if (e.button == 2) mouse.right = false; else mouse.down = false; });
	window.addEventListener('contextmenu', function (e) { e.preventDefault(); });

	toStart();
	copilotStart();
	renderer.setAnimationLoop(frame);
}

// applyLook sets the look of the world and of the enemies.
function applyLook() {
	setTheme(opt.look);
	setChaseTheme(opt.look);
}

// ---------- input ----------

function dead(v, d) { return Math.abs(v) < d ? 0 : v - (v > 0 ? d : -d); }

function buzz(h, strength, ms) {
	var gp = h.src && h.src.gamepad;
	try {
		if (gp && gp.hapticActuators && gp.hapticActuators[0]) gp.hapticActuators[0].pulse(strength, ms);
		else if (gp && gp.vibrationActuator) gp.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength });
	} catch (e) {}
}

// calibrate: your position at this moment is the center. Your look direction is "down the piste".
function calibrate() {
	if (vr) { cal.cx = head.x; cal.cz = head.z; cal.h = clamp(head.y, 1.0, 2.1); cal.fwd = head.yaw; }
	else { cal.cx = 0; cal.cz = 0; cal.h = 1.7; cal.fwd = 0; }
	cal.pole = clamp(cal.h * 0.68, 0.85, 1.3);
	hubYaw = cal.fwd;
	hands.left.pole.scale.y = hands.right.pole.scale.y = cal.pole;
}

function readHead(dt, xrFrame) {
	var pose = vr && xrFrame ? xrFrame.getViewerPose(renderer.xr.getReferenceSpace()) : null, p, q, y;
	if (pose) {
		p = pose.transform.position; q = pose.transform.orientation; y = head.y;
		head.x = p.x; head.y = p.y; head.z = p.z;
		head.yaw = Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y));
		head.vy += ((head.y - y) / dt - head.vy) * 0.35;
		if (cal.wait > 0) { cal.wait -= dt; if (cal.wait <= 0) { calibrate(); viewDir = sk.hdg; } }
	} else if (!vr) {
		head.x = 0; head.z = 0; head.yaw = 0; head.vy = 0;
		head.y = 1.7 - 0.45 * ctl.tuck;
	}
}

// readHands reads the two controllers: buttons, sticks, pole pushes. It returns the pole push (m/s).
function readHands(dt) {
	var names = ['left', 'right'], i, h, gp, o, push = 0, a = sk.hdg - rigYaw, fx = -Math.sin(a), fz = -Math.cos(a), rx = Math.cos(a), rz = -Math.sin(a);
	var gunHand = opt.gun ? 'left' : 'right', tip = readHands.tip, back, gy, was;
	for (i = 0; i < 2; i++) {
		h = hands[names[i]];
		h.pT = h.trig > 0.5; h.pA = h.bA; h.pB = h.bB; h.pS = h.bS; h.pX = h.sx;
		h.has = !!(vr && h.obj && h.obj.visible && h.src);
		gp = h.has ? h.src.gamepad : null;
		if (gp) {
			h.trig = gp.buttons[0] ? gp.buttons[0].value : 0;
			h.grip = gp.buttons[1] ? gp.buttons[1].value : 0;
			h.bA = !!(gp.buttons[4] && gp.buttons[4].pressed);
			h.bB = !!(gp.buttons[5] && gp.buttons[5].pressed);
			h.bS = !!(gp.buttons[3] && gp.buttons[3].pressed);      // thumbstick pushed down
			h.sx = dead(gp.axes[2] || 0, 0.15); h.sy = dead(gp.axes[3] || 0, 0.15);
		} else { h.trig = h.grip = h.sx = h.sy = 0; h.bA = h.bB = h.bS = false; }
		if (!h.has) { h.seen = false; h.planted = false; continue; }

		// pole: the tip is in the snow if it is below the surface. A hand that moves to the rear then pushes you forward.
		o = h.obj;
		h.hasPole = opt.gear == 0 && !(game.spy && (names[i] == gunHand || gun.two || gun.hold));
		was = h.planted; h.planted = false;
		if (h.hasPole && h.seen && sk.ground && game.state == 'run') {
			tip.set(0, -Math.cos(POLE_TILT) * cal.pole, Math.sin(POLE_TILT) * cal.pole).applyQuaternion(o.quaternion).add(o.position);
			gy = sk.y - rigY + sk.rise * ((tip.x - cal.cx) * fx + (tip.z - cal.cz) * fz) + sk.tilt * ((tip.x - cal.cx) * rx + (tip.z - cal.cz) * rz);
			if (tip.y < gy + 0.02) {
				h.planted = true;
				back = -((o.position.x - h.px) * fx + (o.position.z - h.pz) * fz);
				if (back > 0 && back < 0.3) push += POLE_GAIN * back / (1 + sk.speed / 9);
				if (!was) { buzz(h, 0.5, 25); sndClick(); }
			}
		}
		h.px = o.position.x; h.py = o.position.y; h.pz = o.position.z; h.seen = true;
	}
	return push;
}
readHands.tip = new THREE.Vector3();

// readSteer gives the steer input from your body: -1 = left, +1 = right.
function readSteer() {
	var a = sk.hdg - rigYaw, fx = -Math.sin(a), fz = -Math.cos(a), rx = Math.cos(a), rz = -Math.sin(a);
	var L = hands.left, R = hands.right, F, raw = 0, lean = 0, dx, dz, sep, both = opt.steer == 0 && !game.spy && L.has && R.has;
	if (opt.steer != 2) lean = dead((head.x - cal.cx) * rx + (head.z - cal.cz) * rz, LEAN_DEAD) / LEAN_FULL;
	if (opt.gear == 0) {
		raw = lean;
		if (both) {
			// skis: your hands are a bar. Left hand down = left turn.
			dx = R.px - L.px; dz = R.pz - L.pz; sep = dx * rx + dz * rz;
			if (sep > 0.2) raw -= dead((R.py - L.py) / sep, 0.07) / HAND_TILT_FULL;
		}
	} else {
		// snowboard: you stand with one side to the front. Your front arm is the steering:
		// the direction from your head to your front hand, compared with the board. Arm in line with the board = straight.
		// Turn your shoulders and the arm turns. The rear hand is not used (the headset cannot always see it).
		// The lean to your toes or heels helps. If the front hand has a weapon, or is not seen, only the lean steers.
		F = opt.stance ? R : L;
		raw = lean; game.steerSrc = 'LEAN';
		if (opt.steer == 0 && F.has && !(game.spy && (F == hands[opt.gun ? 'left' : 'right'] || gun.two || gun.hold))) {
			dx = F.px - head.x; dz = F.pz - head.z;
			if (dx * dx + dz * dz > 0.04) { raw = dead(Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz), 0.07) / SHOULDER_FULL + lean * 0.5; game.steerSrc = 'FRONT ARM'; }
		}
	}
	return raw;
}

function onKey(e) {
	initAudio();
	if (Copilot.role === 'copilot') {
		// copilot: C = the view, P = a photo. Keys 1 to 9 (copilot.js) select the option lines.
		if (e.code == 'KeyC') { cop.view = 1 - cop.view; toast(cop.view ? 'Outside view' : 'View of the pilot'); }
		else if (e.code == 'KeyP') Copilot.select(ROW_PHOTO);
		return;
	}
	keys[e.code] = true;
	if (e.code == 'KeyP') { photoTake(0); return; }
	if (e.code == 'KeyM' || e.code == 'Escape') menuButton();
	else if (e.code == 'KeyN') startRun();
	else if (game.state == 'menu') {
		if (e.code == 'ArrowUp' || e.code == 'KeyW') menuMove(-1);
		else if (e.code == 'ArrowDown' || e.code == 'KeyS') menuMove(1);
		else if (e.code == 'ArrowLeft' || e.code == 'KeyA') menuChange(-1);
		else if (e.code == 'ArrowRight' || e.code == 'KeyD' || e.code == 'Enter' || e.code == 'Space') menuChange(1);
	} else if (game.state == 'done' && (e.code == 'Enter' || e.code == 'Space')) menuButton();
	else if (e.code == 'KeyJ' || (e.code == 'Space' && !game.spy)) ctl.jump = sk.ground ? 4 : 0;
	else if (game.spy && e.code == 'Digit1') setWeapon(0);
	else if (game.spy && e.code == 'Digit2') setWeapon(1);
	else if (game.spy && e.code == 'Digit3') setWeapon(2);
	if (e.code == 'Space' || e.code.indexOf('Arrow') == 0) e.preventDefault();
}

// readInput fills ctl from the controllers, your body, the keys and the pointer.
function readInput(dt) {
	var L = hands.left, R = hands.right, push = readHands(dt), k = 1 - Math.exp(-dt * 10);
	var G = opt.gun ? L : R, O = opt.gun ? R : L, steer = 0, brake = 0, tuck = 0, sy, m, spyRun = game.spy && game.state == 'run';

	// the photo viewer in VR: stick left, right = the next photo. Trigger, A or X = close.
	if (photo.vrOn) {
		if ((L.sx > 0.5 && L.pX <= 0.5) || (R.sx > 0.5 && R.pX <= 0.5)) photoVRStep(1);
		if ((L.sx < -0.5 && L.pX >= -0.5) || (R.sx < -0.5 && R.pX >= -0.5)) photoVRStep(-1);
		if ((L.trig > 0.5 && !L.pT) || (R.trig > 0.5 && !R.pT) || (L.bA && !L.pA) || (R.bA && !R.pA)) photoVRClose();
		ctl.push = 0; ctl.jump = 0;
		return;
	}

	// buttons that work in all states. In a chase, the low button of the gun hand selects the next weapon.
	if ((L.bB && !L.pB) || (R.bB && !R.pB)) { calibrate(); say('CENTER SET', 1.5); }
	if ((L.bS && !L.pS) || (R.bS && !R.pS)) photoTake(0);        // push a thumbstick down: 360 photo
	if (spyRun) {
		if (G.bA && !G.pA) setWeapon((gun.w + 1) % 3);
		if (O.bA && !O.pA) menuButton();
	} else if ((L.bA && !L.pA) || (R.bA && !R.pA)) menuButton();

	if (game.state == 'menu') {
		sy = Math.abs(L.sy) > Math.abs(R.sy) ? L.sy : R.sy; m = Math.abs(L.sx) > Math.abs(R.sx) ? L.sx : R.sx;
		if (Math.abs(sy) < 0.3 && Math.abs(m) < 0.3) menu.held = false;
		else if (!menu.held) {
			menu.held = true;
			if (Math.abs(sy) > Math.abs(m)) menuMove(sy > 0 ? 1 : -1); else menuChange(m > 0 ? 1 : -1);
		}
		if ((L.trig > 0.5 && !L.pT) || (R.trig > 0.5 && !R.pT)) menuChange(1);
		ctl.push = 0; ctl.jump = 0;
		return;
	}
	if (game.state == 'done') {
		ctl.steer += (0 - ctl.steer) * k; ctl.brake = 1; ctl.tuck = 0; ctl.push = 0;
		if (game.time - game.doneTime > 2.5 && ((L.trig > 0.5 && !L.pT) || (R.trig > 0.5 && !R.pT) || mouse.down)) menuButton();
		return;
	}

	if (vr) {
		steer = readSteer() + clamp(L.sx + R.sx, -1, 1);
		// brake: a grip button (not the grip that holds the weapon with two hands), or a stick to the rear
		brake = Math.max(game.spy ? G.grip : L.grip, game.spy && gun.two ? 0 : game.spy ? O.grip : R.grip, Math.max(L.sy, R.sy));
		// bend your knees = less air drag
		tuck = clamp((cal.h * TUCK_START - head.y) / (cal.h * 0.18), 0, 1);
		if (tuck > 0.15) game.lastTuck = game.time;
		// stand up fast from bent knees = jump. A faster move gives a higher jump.
		if (head.vy > JUMP_RISE && sk.ground && game.time - game.lastTuck < 0.5 && game.time - game.lastJump > 0.8) {
			ctl.jump = clamp(JUMP_MIN + 2.5 * (head.vy - JUMP_RISE), JUMP_MIN, JUMP_MAX); game.lastJump = game.time;
		}
		// push without poles: stick forward. In a free run also a trigger.
		if ((Math.min(L.sy, R.sy) < -0.5 || (!game.spy && (L.trig > 0.5 || R.trig > 0.5))) && sk.speed < 4) push += 2.5 * dt;
	} else {
		steer = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
		if (!game.spy) steer += clamp(dead(mouse.x, 0.06) * 1.6, -1, 1);
		brake = keys.KeyS || keys.ArrowDown ? 1 : 0;
		tuck = keys.ShiftLeft || keys.ShiftRight || keys.KeyC ? 1 : 0;
		if ((keys.KeyW || keys.ArrowUp) && sk.speed < 4) push += 2.5 * dt;
	}
	if (game.spy && chase.down > 0) { brake = 1; steer = 0; push = 0; }
	ctl.steer += (clamp(steer, -1, 1) - ctl.steer) * k;
	ctl.brake = clamp(brake, 0, 1);
	ctl.tuck += (tuck - ctl.tuck) * (vr ? 1 : k * 0.5);
	ctl.push += push;
}

// ---------- view ----------

// placeRig puts the play space on the skis. The horizon always stays level.
function placeRig(dt) {
	var c, s, want;
	if (!vr) viewDir += wrapPi(sk.hdg - viewDir) * (1 - Math.exp(-dt * 3));
	else if (opt.turn == 0) viewDir += wrapPi(pisteDir(sk.t + 30) - viewDir) * (1 - Math.exp(-dt * 0.8));
	else if (opt.turn == 2) {
		want = sk.speed > 3 ? Math.atan2(-sk.vx, -sk.vz) : sk.hdg;
		viewDir += wrapPi(want - viewDir) * (1 - Math.exp(-dt * 2));
	}
	rigYaw = viewDir - cal.fwd;
	if (Math.abs(sk.y - rigY) > 8) rigY = sk.y;
	rigY += (sk.y - rigY) * (1 - Math.exp(-dt / 0.03));
	c = Math.cos(rigYaw); s = Math.sin(rigYaw);
	rig.position.set(sk.x - (cal.cx * c + cal.cz * s), rigY, sk.z - (-cal.cx * s + cal.cz * c));
	rig.rotation.y = rigYaw;
	if (!vr) {
		camera.position.set(0, head.y, 0);
		// with the scope, the pointer moves the view slowly
		if (game.spy && gun.scoped) camera.rotation.set(gun.pitch0 - (mouse.y - gun.my0) * 0.12, gun.yaw0 - (mouse.x - gun.mx0) * 0.2, 0);
		else camera.rotation.set(-mouse.y * 0.5 - 0.1, -mouse.x * (game.spy ? 1.4 : 0.7), 0);
	}
}

// ---------- equipment ----------

var gear = null, skis = null, board = null, ring = null, flashPlane = null;

function makeGear() {
	var mat = new THREE.MeshLambertMaterial({ vertexColors: true }), names = ['left', 'right'], i, h, m, cv, c, g, x;
	var SKI = 0xff6a00, BOOT = 0x22252a;

	// skis and board: below you, they turn with the direction of travel
	gear = new THREE.Group(); gear.rotation.order = 'YXZ';
	x = [];
	for (i = -1; i <= 1; i += 2) {
		x.push(['b', 0.095, 0.02, 1.7, i * 0.14, 0.01, -0.1, SKI], ['b', 0.095, 0.02, 0.24, i * 0.14, 0.05, -1.05, SKI, 0.35],
			['b', 0.085, 0.05, 0.42, i * 0.14, 0.045, 0.02, 0x30343a], ['b', 0.11, 0.16, 0.3, i * 0.14, 0.14, 0.03, BOOT]);
	}
	skis = new THREE.Mesh(partsGeo(x), mat);
	// board: the boots point to the right (left foot in front). For the other stance the model is mirrored.
	board = new THREE.Mesh(partsGeo([
		['b', 0.27, 0.025, 1.3, 0, 0.012, 0, 0x1e5fbf], ['b', 0.27, 0.025, 0.2, 0, 0.04, -0.74, 0x1e5fbf, 0.3], ['b', 0.27, 0.025, 0.2, 0, 0.04, 0.74, 0x1e5fbf, -0.3],
		['b', 0.26, 0.012, 0.1, 0, 0.03, -0.58, 0xffd24a],
		['b', 0.3, 0.16, 0.12, 0.02, 0.11, -0.26, BOOT, 0, 0.26, 0], ['b', 0.3, 0.16, 0.12, 0.02, 0.11, 0.26, BOOT, 0, -0.1, 0],
		['b', 0.1, 0.05, 0.14, 0.15, 0.06, -0.3, 0xffffff, 0, 0.26, 0], ['b', 0.1, 0.05, 0.14, 0.15, 0.06, 0.27, 0xffffff, 0, -0.1, 0]
	]), mat);
	gear.add(skis, board);
	rig.add(gear);

	// each hand: glove, pole
	for (i = 0; i < 2; i++) {
		h = hands[names[i]];
		h.kit = new THREE.Group();
		h.glove = new THREE.Mesh(partsGeo([['b', 0.085, 0.1, 0.13, 0, -0.02, 0.05, 0x1e5fbf]]), mat);
		h.pole = new THREE.Group();
		m = new THREE.Mesh(partsGeo([['c', 0.008, 0.006, 1, 0, -0.5, 0, 0xd8dde3, 0, 0, 0, 6], ['c', 0.05, 0.05, 0.008, 0, -0.93, 0, 0x22252a, 0, 0, 0, 8]]), mat);
		h.pole.add(m);
		h.pole.rotation.x = -POLE_TILT;
		g = new THREE.Mesh(partsGeo([['c', 0.018, 0.016, 0.14, 0, -0.03, 0, 0x22252a, 0, 0, 0, 6]]), mat);
		g.rotation.x = -POLE_TILT;
		h.kit.add(h.glove, h.pole, g);
		h.gripMesh = g;
	}

	// comfort ring: a dark frame around your view that closes at speed
	cv = document.createElement('canvas'); cv.width = cv.height = 256;
	c = cv.getContext('2d'); g = c.createRadialGradient(128, 128, 32, 128, 128, 58);
	g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,1)');
	c.fillStyle = g; c.fillRect(0, 0, 256, 256);
	ring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), color: 0x0a0f18, transparent: true, depthTest: false, depthWrite: false, fog: false }));
	ring.position.z = -2; ring.renderOrder = 20; ring.visible = false;
	// flash: red when you are hit, white when you fall
	flashPlane = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false }));
	flashPlane.position.z = -0.6; flashPlane.renderOrder = 21; flashPlane.visible = false;
	camera.add(ring, flashPlane);
}

function updateGear(dt) {
	var names = ['left', 'right'], i, h, n, v, a, s, c, sn;
	// skis or board
	skis.visible = opt.gear == 0; board.visible = opt.gear == 1;
	board.scale.x = opt.stance ? -1 : 1;
	gear.position.set(cal.cx, sk.y - rigY, cal.cz);
	gear.rotation.set(Math.atan(sk.rise), sk.hdg - rigYaw, Math.asin(clamp(sk.tilt, -0.7, 0.7)) - ctl.steer * 0.35 * Math.min(1, sk.speed / 8));

	for (i = 0; i < 2; i++) {
		h = hands[names[i]];
		h.pole.visible = h.gripMesh.visible = !!h.hasPole;
	}

	// snow spray when you skid or brake
	if (sk.ground && sk.speed > 2 && game.state != 'menu') {
		n = Math.min(4, Math.floor((sk.skid * 0.8 + ctl.brake * sk.speed * 0.15 + (sk.fallen > 0 ? 3 : 0) + (sk.surf == 2 ? sk.speed * 0.05 : 0)) * 60 * dt + Math.random()));
		c = Math.cos(sk.hdg); sn = Math.sin(sk.hdg);
		for (i = 0; i < n; i++) {
			s = (Math.random() - 0.5) * 1.4;
			puff(fxSnow, sk.x - sn * s + (Math.random() - 0.5) * 0.4, sk.y + 0.1, sk.z - c * s + (Math.random() - 0.5) * 0.4,
				sk.vx * 0.5 + (Math.random() - 0.5) * 3, 1 + Math.random() * 2.5, sk.vz * 0.5 + (Math.random() - 0.5) * 3, 0.35 + Math.random() * 0.4);
		}
	}

	// comfort ring
	v = vr && opt.ring != 0 && game.state != 'menu' ? Math.max(sstep(4, 15, sk.speed), sk.fallen > 0 ? 1 : 0) : 0;
	ring.visible = v > 0.02;
	if (ring.visible) {
		a = lerp(62, RING_ANGLE[opt.ring], v) * Math.PI / 180;
		ring.scale.setScalar(8 * Math.tan(a));
		ring.material.opacity = Math.min(1, v * 2);
	}
	// flash
	game.white = Math.max(0, game.white - dt * 1.2);
	v = Math.max(chase.flash * 0.4, game.white * 0.8);
	flashPlane.visible = v > 0.01;
	if (flashPlane.visible) { flashPlane.material.opacity = v; flashPlane.material.color.setHex(game.white * 0.8 > chase.flash * 0.4 ? 0xffffff : 0xff1010); }
}

// ---------- hub ----------

// The hub is above your forward view. It shows speed, time, health, the objective, the weapon and messages.
// The options are on a second board that opens with A or X.

var hub = null, statusMesh = null, menuMesh = null, statusCv = null, menuCv = null, statusT = 0, menuKey = '';

function makeHub() {
	hub = new THREE.Group();
	statusCv = document.createElement('canvas'); statusCv.width = 1024; statusCv.height = 320;
	menuCv = document.createElement('canvas'); menuCv.width = 1024; menuCv.height = 1216;
	statusMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.47), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(statusCv), transparent: true, depthTest: false, depthWrite: false, fog: false }));
	menuMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.9), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(menuCv), transparent: true, depthTest: false, depthWrite: false, fog: false }));
	statusMesh.material.map.colorSpace = menuMesh.material.map.colorSpace = THREE.SRGBColorSpace;
	statusMesh.renderOrder = 30; menuMesh.renderOrder = 31;
	statusMesh.rotation.x = 0.26;
	hub.add(statusMesh, menuMesh);
	rig.add(hub);
}

function say(text, seconds) { game.msg = text; game.msgUntil = game.time + seconds; }

function timeText(s) {
	var m = Math.floor(s / 60);
	s -= m * 60;
	return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
}

function menuRows() {
	var rows = game.paused ? ['CONTINUE', 'NEW RUN'] : ['START'], i;
	rows.push('TAKE PHOTO 360', 'VIEW PHOTOS');
	for (i = 0; i < OPTS.length; i++) rows.push(OPTS[i]);
	return rows;
}

function drawStatus() {
	var c = statusCv.getContext('2d'), msg = '', w, hot = false, W = WPN[gun.w], s;
	c.clearRect(0, 0, 1024, 320);
	c.fillStyle = 'rgba(8,18,32,0.6)'; c.fillRect(0, 0, 1024, 320);
	c.fillStyle = '#ffffff'; c.textBaseline = 'middle';
	c.font = 'bold 84px sans-serif'; c.textAlign = 'left';
	c.fillText((sk.speed * 3.6).toFixed(0), 36, 72);
	w = c.measureText((sk.speed * 3.6).toFixed(0)).width;
	c.font = 'bold 36px sans-serif'; c.fillText('km/h', 48 + w, 88);
	if (game.spy) {
		// health bar and score
		c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(330, 48, 330, 44);
		c.fillStyle = chase.health > 35 ? '#3ddc84' : '#ff4040'; c.fillRect(330, 48, 3.3 * clamp(chase.health, 0, 100), 44);
		c.fillStyle = '#ffffff'; c.font = 'bold 60px sans-serif'; c.textAlign = 'right';
		c.fillText(String(chase.score), 990, 72);
	} else {
		c.font = 'bold 72px sans-serif'; c.textAlign = 'center'; c.fillText(timeText(game.runTime), 512, 72);
		c.textAlign = 'right'; c.font = 'bold 52px sans-serif'; c.fillText(Math.max(0, (T_END - sk.t) / 1000).toFixed(1) + ' km', 990, 72);
	}
	// middle line: message, or the objective
	if (game.time < game.msgUntil) { msg = game.msg; hot = true; }
	else if (game.spy && chaseTime - chase.msgTime < 2.5) { msg = chase.msg; hot = true; }
	else if (game.state == 'done') msg = game.result;
	else if (game.spy) msg = chase.text + (chase.left ? ':  ' + chase.left : '');
	else msg = sectionName(sk.t);
	c.textAlign = 'center'; c.font = 'bold 56px sans-serif';
	c.fillStyle = hot ? '#ffd24a' : '#ffffff';
	c.fillText(msg, 512, 170, 990);
	// bottom line: weapon, or the numbers of the run
	c.font = 'bold 40px sans-serif'; c.fillStyle = '#bcd0e6';
	if (game.spy) {
		s = W.name + (W.mag ? '  ' + (gun.reload > 0 ? 'RELOAD' : gun.ammo[gun.w]) : '') + (gun.two && pilotVR() ? '  2 HANDS' : '');
		c.textAlign = 'left'; c.fillText(s, 36, 268);
		c.textAlign = 'right'; c.fillText((opt.gear == 1 && pilotVR() ? 'STEER: ' + game.steerSrc + '    ' : '') + 'GRENADES ' + gun.gren + '    DOWN ' + chase.kills, 990, 268, 560);
	} else c.fillText((opt.gear == 1 && pilotVR() ? 'STEER: ' + game.steerSrc + '      ' : '') + 'MAX ' + (game.vmax * 3.6).toFixed(0) + ' km/h      JUMPS ' + game.jumps + '      AIR ' + game.air.toFixed(0) + ' s', 512, 268, 990);
	statusMesh.material.map.needsUpdate = true;
}

function drawMenu() {
	var c = menuCv.getContext('2d'), rows = menuRows(), i, y, r, key, v, inVR = pilotVR();
	key = menu.sel + JSON.stringify(opt) + game.paused + game.result + inVR + photo.list.length + Copilot.status + Copilot.copilots;
	if (key == menuKey) return;
	menuKey = key;
	c.clearRect(0, 0, 1024, 1216);
	c.fillStyle = 'rgba(8,18,32,0.86)'; c.fillRect(0, 0, 1024, 1216);
	c.textBaseline = 'middle'; c.textAlign = 'center';
	c.fillStyle = '#ffffff'; c.font = 'bold 64px sans-serif'; c.fillText('SKI', 512, 54);
	if (game.result) { c.fillStyle = '#ffd24a'; c.font = 'bold 40px sans-serif'; c.fillText(game.result, 512, 112, 980); }
	for (i = 0; i < rows.length; i++) {
		y = 166 + i * 52; r = rows[i];
		if (i == menu.sel) { c.fillStyle = 'rgba(255,210,74,0.9)'; c.fillRect(40, y - 25, 944, 50); }
		c.fillStyle = i == menu.sel ? '#081220' : '#ffffff';
		c.font = 'bold 40px sans-serif';
		if (typeof r == 'string') { c.textAlign = 'center'; c.fillText(r + (r == 'VIEW PHOTOS' ? '  (' + photo.list.length + ')' : ''), 512, y); }
		else {
			v = r.key == 'start' && opt.game == 2 ? 'TOP' : r.vals[opt[r.key]];
			c.textAlign = 'left'; c.fillText(r.label, 70, y);
			c.textAlign = 'right'; c.fillText('<  ' + v + '  >', 954, y);
		}
	}
	c.textAlign = 'center'; c.fillStyle = '#bcd0e6'; c.font = '29px sans-serif';
	if (inVR) {
		c.fillText('Stick: select and change.  Trigger: OK.  B or Y: set the center.  A or X: this board.', 512, 1010, 990);
		c.fillText('Skis: lean to turn. Board: front arm steers.  Grips: brake.  Bend your knees: speed.  Stand up fast: jump.', 512, 1052, 990);
		c.fillText('Chase: trigger = fire.  A = next weapon.  Other hand: grip = hold the weapon, trigger = grenade.', 512, 1094, 990);
		c.fillText('Push a thumbstick down: 360 photo.', 512, 1136, 990);
	} else {
		c.fillText('Arrow keys: select and change.  ENTER: OK.  M: this board.  N: new run.', 512, 1010, 990);
		c.fillText('Pointer or A D: turn.  W: push.  S: brake.  SHIFT: speed.  SPACE or J: jump.', 512, 1052, 990);
		c.fillText('Chase: click or SPACE = fire.  1 2 3 = weapon.  Q or right button = scope.  G = grenade.', 512, 1094, 990);
		c.fillText('P: 360 photo.', 512, 1136, 990);
	}
	c.fillStyle = '#ffd24a';
	c.fillText('Copilot code of this device: ' + Copilot.code + '   ' + Copilot.status, 512, 1182, 990);
	menuMesh.material.map.needsUpdate = true;
}

function updateHub(dt) {
	var d = wrapPi(head.yaw - hubYaw);
	// the hub turns with your head, but only after you turn away from it
	if (Copilot.role === 'copilot') hubYaw = cop.hubYaw;
	else if (!vr) hubYaw = camera.rotation.y;
	else {
		if (Math.abs(d) > (game.state == 'menu' ? 0.4 : 0.7)) hubMove = true;
		if (hubMove) { hubYaw += d * (1 - Math.exp(-dt * 4)); if (Math.abs(d) < 0.05) hubMove = false; }
	}
	hub.visible = vr || !(game.spy && gun.scoped);
	hub.position.set(cal.cx, 0, cal.cz); hub.rotation.y = hubYaw;
	statusMesh.position.set(0, cal.h + 0.66, -2.3);
	menuMesh.position.set(0, cal.h - 0.2, -2.0);
	menuMesh.visible = game.state == 'menu' && !photo.vrOn;
	statusMesh.visible = !menuMesh.visible;
	if (menuMesh.visible) drawMenu();
	statusT -= dt;
	if (statusT < 0) { statusT = 0.15; drawStatus(); }
}

function menuMove(dy) {
	var n = menuRows().length;
	menu.sel = (menu.sel + dy + n) % n;
}

function menuChange(dx) {
	var r = menuRows()[menu.sel];
	if (r == 'CONTINUE') { game.state = 'run'; game.paused = false; return; }
	if (r == 'START' || r == 'NEW RUN') { startRun(); return; }
	if (r == 'TAKE PHOTO 360') { photoTake(0); return; }           // the hub is not in the photo
	if (r == 'VIEW PHOTOS') { if (vr) photoVROpen(); else galleryShow(true); return; }
	if (optStep(r, dx) && game.paused) { game.paused = false; menu.sel--; }
}

// optStep changes one option. It returns true if the option stops the run (a new run is necessary).
function optStep(r, dx) {
	opt[r.key] = (opt[r.key] + dx + r.vals.length) % r.vals.length;
	saveOptions();
	if (r.key == 'look') applyLook();
	// equipment, game, enemies and start position are for a new run: a change of these stops the run that you have
	if (r.key == 'gear' || r.key == 'game' || r.key == 'start' || r.key == 'diff') {
		if (game.state == 'run' || game.state == 'done') { game.state = 'menu'; game.paused = false; menu.sel = 0; }
		toStart();
		return true;
	}
	return false;
}

// menuButton: A, X or M. It opens and closes the options board.
function menuButton() {
	if (game.state == 'run') { game.state = 'menu'; game.paused = true; menu.sel = 0; menuKey = ''; }
	else if (game.state == 'menu' && game.paused) { game.state = 'run'; game.paused = false; }
	else if (game.state == 'done') { game.state = 'menu'; game.paused = false; menu.sel = 0; toStart(); }
}

function startT() { return START_T[opt.game == 2 ? 0 : opt.start]; }

// toStart puts you at the start position, with no run.
function toStart() {
	stopChase(); game.spy = false;
	sk.mode = opt.gear ? 'board' : 'ski';
	resetSki(startT());
	viewDir = sk.hdg; rigY = sk.y;
}

// ---------- sound ----------

var AC = null, snd = {};

function initAudio() {
	var A = window.AudioContext || window.webkitAudioContext, d, i;
	if (AC) { if (AC.state == 'suspended') AC.resume(); return; }
	if (!A) return;
	AC = new A();
	snd.buf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
	d = snd.buf.getChannelData(0);
	for (i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
	snd.out = AC.createGain(); snd.out.gain.value = 0.8; snd.out.connect(AC.destination);
	snd.wind = loopNoise('bandpass', 400, 0.6);
	snd.carve = loopNoise('highpass', 1800, 0.5);
	snd.rotor = loopNoise('lowpass', 170, 1);
}

function loopNoise(type, freq, q) {
	var s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
	s.buffer = snd.buf; s.loop = true;
	f.type = type; f.frequency.value = freq; f.Q.value = q;
	g.gain.value = 0;
	s.connect(f); f.connect(g); g.connect(snd.out);
	s.start();
	return { f: f, g: g };
}

// burst: a short piece of noise through a filter. All the short sounds use it.
function burst(type, freq, dur, vol) {
	if (!AC || vol < 0.01) return;
	var s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(), t = AC.currentTime;
	s.buffer = snd.buf;
	f.type = type; f.frequency.value = freq;
	g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
	s.connect(f); f.connect(g); g.connect(snd.out);
	s.start(t, Math.random() * 1.5, dur + 0.05);
}

function sndShot(dist) { burst('lowpass', dist < 1 ? 2600 : 1500, 0.12, (dist < 1 ? 0.5 : 0.45) / (1 + dist / 30)); }
function sndRifle() { burst('lowpass', 1100, 0.45, 0.9); }
function sndBoom(dist) { burst('lowpass', 320, 1.0, 1.2 / (1 + dist / 90)); }
function sndClick() { burst('highpass', 3000, 0.04, 0.2); }
function sndThump(vol) { burst('lowpass', 170, 0.3, vol); }

function updateSound(dt) {
	var i, f, d, near = 1e9, on = game.state != 'menu', t;
	if (!AC) return;
	t = AC.currentTime;
	snd.wind.g.gain.setTargetAtTime(on ? Math.min(0.5, sk.speed * sk.speed / 1400) : 0, t, 0.1);
	snd.wind.f.frequency.setTargetAtTime(300 + sk.speed * 40, t, 0.1);
	snd.carve.g.gain.setTargetAtTime(on && sk.ground ? Math.min(0.3, sk.skid * 0.1 + ctl.brake * sk.speed * 0.015 + sk.speed * (sk.surf == 1 ? 0.006 : 0.002)) : 0, t, 0.05);
	for (i = 0; i < foes.length; i++) {
		f = foes[i];
		if (f.type != 'heli' && f.type != 'plane') continue;
		d = Math.sqrt((f.x - sk.x) * (f.x - sk.x) + (f.y - sk.y) * (f.y - sk.y) + (f.z - sk.z) * (f.z - sk.z));
		if (d < near) near = d;
	}
	snd.rotor.g.gain.setTargetAtTime(on && near < 1e8 ? (0.5 + 0.5 * Math.sin(game.time * 70)) * 0.9 / (1 + near / 60) : 0, t, 0.02);
}

// playerHit: chase.js calls it when a bullet or an explosion hits you.
function playerHit() {
	buzz(hands.left, 1, 120); buzz(hands.right, 1, 120);
	sndThump(0.7);
}

// ---------- game flow ----------

function startRun() {
	game.spy = opt.game > 0;
	sk.mode = opt.gear ? 'board' : 'ski';
	sk.assist = opt.assist == 1;
	resetSki(startT());
	resetGuns();
	if (game.spy) startChase(sk.t, opt.game == 2 ? 'mission' : 'chase', opt.diff); else stopChase();
	game.state = 'run'; game.paused = false; game.runTime = 0; game.vmax = 0; game.air = 0; game.jumps = 0; game.result = '';
	game.nFall = sk.nFall; game.nLand = sk.nLand; game.nHit = sk.nHit; game.nCrev = sk.nCrev; game.respawns = chase.respawns;
	game.sec = PSEC[tIndex(sk.t)];
	viewDir = sk.hdg; rigY = sk.y; acc = 0;
	if (!vr) say('W: PUSH', 4);
	else if (opt.gear == 1) say((opt.stance ? 'RIGHT' : 'LEFT') + ' SIDE TO THE FRONT. FRONT ARM STEERS.  ' + (game.spy ? 'STICK' : 'TRIGGER') + ': PUSH', 7);
	else say(game.spy ? 'PUSH: POLE, OR STICK FORWARD' : 'PUSH WITH YOUR POLES', 5);
}

function finishRun() {
	var key = (opt.gear ? 'board' : 'ski') + opt.game + opt.diff + startT(), b;
	game.state = 'done'; game.doneTime = game.time;
	if (game.spy) {
		endChase();
		b = best.score[key] || 0;
		if (chase.score > b) best.score[key] = b = chase.score;
		game.result = (opt.game == 2 ? 'MISSION COMPLETE   ' : 'YOU GOT AWAY   ') + chase.score + '   BEST ' + b;
	} else {
		b = best.time[key] || 0;
		if (!b || game.runTime < b) best.time[key] = b = game.runTime;
		game.result = 'FINISH   ' + timeText(game.runTime) + '   BEST ' + timeText(b);
	}
	saveOptions();
	menuKey = '';
}

// events: things that the physics and the chase did in this frame
function events() {
	var s;
	if (sk.nCrev != game.nCrev) {
		game.nCrev = sk.nCrev; game.nFall = sk.nFall; game.white = 1; rigY = sk.y;
		say('CREVASSE. JUMP, OR GO AROUND', 2.5); sndThump(0.9);
		buzz(hands.left, 1, 200); buzz(hands.right, 1, 200);
		if (game.spy) damagePlayer(10);
	}
	if (sk.nFall != game.nFall) {
		game.nFall = sk.nFall; game.white = 1;
		say('WIPEOUT', 2); sndThump(0.9);
		buzz(hands.left, 1, 200); buzz(hands.right, 1, 200);
	}
	if (sk.nLand != game.nLand) {
		game.nLand = sk.nLand; game.jumps++; game.air += sk.lastAir;
		sndThump(Math.min(0.8, sk.lastImpact / 10));
		buzz(hands.left, 0.6, 60); buzz(hands.right, 0.6, 60);
		if (sk.lastAir > 0.8 && sk.fallen == 0 && !game.spy) say('AIR  ' + sk.lastAir.toFixed(1) + ' s', 1.5);
	}
	if (sk.nHit != game.nHit) { game.nHit = sk.nHit; sndThump(0.6); buzz(hands.left, 0.8, 100); buzz(hands.right, 0.8, 100); }
	if (chase.respawns != game.respawns) { game.respawns = chase.respawns; viewDir = sk.hdg; rigY = sk.y; }
	s = PSEC[tIndex(sk.t)];
	if (s != game.sec && game.state == 'run') { game.sec = s; if (sk.moving && SEC[s][10] != SEC[Math.max(0, s - 1)][10]) say(SEC[s][10], 2.5); }
	if (sk.speed > game.vmax) game.vmax = sk.speed;
	if (game.state == 'run' && sk.t >= T_END) finishRun();
}

// ---------- copilot ----------

// The pilot (the Quest) sends: the skier, the view, the hub, the enemies, the explosions and the options.
// The copilot (the Mac) draws the same mountain from this state. It does not run the physics or the enemies.
// It shows the view of the pilot, or an outside view (key C). Its panel changes the options of the pilot.
// Photos that the pilot takes go to the copilot as JPEG files (photo.js).

var ROW_PHOTO = 2;                       // the copilot line that takes a photo
var FTYPE = ['skier', 'sled', 'truck', 'chute', 'heli', 'plane', 'guard'];
var STATES = ['menu', 'run', 'done'];
var cop = {
	view: 0,                             // 0 = the view of the pilot, 1 = outside view
	vr: 0,                               // the pilot is in VR
	ghosts: {},                          // the enemies, by id
	booms: [],                           // pilot: explosions for the next message
	headPos: new THREE.Vector3(0, 1.7, 0), quat: new THREE.Quaternion(), hubYaw: 0, look: -1,
	skier: null
};
var CV1 = new THREE.Vector3(), CV2 = new THREE.Vector3();

function pilotVR() { return Copilot.role === 'copilot' ? !!cop.vr : vr; }

function copilotStart() {
	Copilot.start({
		name: 'ski',
		getState: copState,
		setState: copApply,
		rows: copRows,
		select: copSelect,
		role: copRole,
		onFile: function (meta, blob) {
			if (meta.type !== 'image/jpeg' || Copilot.role !== 'copilot') return;
			meta.from = 'pilot';
			photoAdd(blob, meta, null);
		},
		onFileDone: function () { say('THE COPILOT HAS THE PHOTO', 2); },
		onCopilots: function (n) { say(n ? 'COPILOT CONNECTED' : 'NO COPILOT', 2); galleryDraw(); }
	});
}

// chase.js calls copBoom for each explosion
function copBoom(x, y, z, r) {
	if (Copilot.role === 'pilot' && Copilot.copilots && cop.booms.length < 40) cop.booms.push(r2(x), r2(y), r2(z), r2(r));
}

function r2(v) { return Math.round(v * 100) / 100; }
function r4(v) { return Math.round(v * 10000) / 10000; }

// pilot: the state, as one small object
function copState() {
	var f = [], pd = '', i, x, b = cop.booms, q = camera.quaternion;
	cop.booms = [];
	for (i = 0; i < foes.length; i++) {
		x = foes[i];
		if (!x.mesh.visible) continue;
		f.push(x.id, FTYPE.indexOf(x.type), r2(x.mesh.position.x), r2(x.mesh.position.y), r2(x.mesh.position.z),
			r4(x.mesh.rotation.x), r4(x.mesh.rotation.y), r4(x.mesh.rotation.z), (x.dead > 0 ? 1 : 0) | (x.air && x.part ? 2 : 0));
	}
	for (i = 0; i < props.length; i++) pd += props[i].dead ? '1' : '0';
	return {
		s: [r2(sk.x), r2(sk.y), r2(sk.z), r2(sk.vx), r2(sk.vy), r2(sk.vz), r4(sk.hdg), r2(sk.speed), r4(sk.rise), r4(sk.tilt),
			sk.ground ? 1 : 0, r2(sk.fallen), r2(sk.skid), sk.surf, r2(sk.t), r2(sk.d)],
		m: sk.mode,
		g: [STATES.indexOf(game.state), game.paused ? 1 : 0, game.spy ? 1 : 0, r2(game.runTime), r2(game.vmax), game.jumps, r2(game.air),
			r2(game.msgUntil - game.time), r2(game.white), game.steerSrc, menu.sel],
		gm: game.msg, gr: game.result,
		c: [chase.on ? 1 : 0, chase.mode, chase.diff, chase.score, chase.kills, r2(chase.health), chase.left, chase.stage, r2(chase.down), r2(chase.flash), r2(chaseTime - chase.msgTime)],
		ct: chase.text, cm: chase.msg,
		w: [gun.w, gun.ammo[gun.w], gun.reload > 0 ? 1 : 0, gun.gren, gun.two ? 1 : 0],
		o: opt,
		r: [r4(viewDir), r4(cal.cx), r4(cal.cz), r4(cal.h), r4(cal.fwd), r4(hubYaw)],
		h: [r4(head.x), r4(head.y), r4(head.z), r4(q.x), r4(q.y), r4(q.z), r4(q.w)],
		v: vr ? 1 : 0,
		f: f, pd: pd, b: b
	};
}

// the option lines of the copilot panel
function copRows() {
	var r = [['NEW RUN', ''], [game.state == 'run' ? 'PAUSE' : game.paused ? 'CONTINUE' : 'START', ''], ['TAKE PHOTO 360', photo.list.length + ' here']], i, o;
	for (i = 0; i < OPTS.length; i++) {
		o = OPTS[i];
		r.push([o.label, o.key == 'start' && opt.game == 2 ? 'TOP' : o.vals[opt[o.key]]]);
	}
	return r;
}

// pilot: a line of the copilot panel (or the panel on the page of the pilot)
function copSelect(i) {
	if (i == 0) startRun();
	else if (i == 1) { if (game.state == 'run' || game.paused) menuButton(); else startRun(); }
	else if (i == ROW_PHOTO) photoTake(0);
	else if (OPTS[i - 3]) optStep(OPTS[i - 3], 1);
	menuKey = '';
}

function copRole(r) {
	var i;
	if (r == 'copilot') {
		stopChase();
		game.state = 'menu'; game.paused = false;
		gun.scoped = false; setFov(72);
		cop.look = -1;
	} else {
		for (i in cop.ghosts) copDrop(cop.ghosts[i]);
		cop.ghosts = {};
		if (cop.skier) cop.skier.visible = false;
		while (props.length) chaseScene.remove(props.pop().mesh);
		loadOptions();                   // your own options again
		applyLook();
		game.state = 'menu'; game.paused = false; game.msg = ''; game.result = '';
		camera.position.set(0, 1.7, 0); camera.quaternion.identity(); camera.rotation.set(0, 0, 0);
		toStart();
	}
	menuKey = '';
	galleryDraw();
}

// copilot: copy the state of the pilot into this game
function copApply(s) {
	var a = s.s, g = s.g, c = s.c, w = s.w, k, i, p;
	sk.x = a[0]; sk.y = a[1]; sk.z = a[2]; sk.vx = a[3]; sk.vy = a[4]; sk.vz = a[5]; sk.hdg = a[6]; sk.speed = a[7];
	sk.rise = a[8]; sk.tilt = a[9]; sk.ground = !!a[10]; sk.fallen = a[11]; sk.skid = a[12]; sk.surf = a[13]; sk.t = a[14]; sk.d = a[15];
	sk.mode = s.m;
	game.state = STATES[g[0]] || 'menu'; game.paused = !!g[1]; game.spy = !!g[2]; game.runTime = g[3]; game.vmax = g[4]; game.jumps = g[5];
	game.air = g[6]; game.msgUntil = game.time + g[7]; game.white = g[8]; game.steerSrc = g[9]; menu.sel = g[10];
	game.msg = s.gm; game.result = s.gr;
	chase.on = !!c[0]; chase.mode = c[1]; chase.diff = c[2]; chase.score = c[3]; chase.kills = c[4]; chase.health = c[5];
	chase.left = c[6]; chase.stage = c[7]; chase.down = c[8]; chase.flash = Math.max(chase.flash, c[9]); chase.msgTime = chaseTime - c[10];
	chase.text = s.ct; chase.msg = s.cm;
	gun.w = w[0]; gun.ammo[gun.w] = w[1]; gun.reload = w[2]; gun.gren = w[3]; gun.two = !!w[4];
	for (k in s.o) if (k in opt) opt[k] = s.o[k];
	if (opt.look !== cop.look) {
		cop.look = opt.look;
		applyLook();
		for (k in cop.ghosts) copDrop(cop.ghosts[k]);
		cop.ghosts = {};
	}
	viewDir = s.r[0]; cal.cx = s.r[1]; cal.cz = s.r[2]; cal.h = s.r[3]; cal.fwd = s.r[4]; cop.hubYaw = s.r[5];
	cop.headPos.set(s.h[0], s.h[1], s.h[2]);
	cop.quat.set(s.h[3], s.h[4], s.h[5], s.h[6]).normalize();
	cop.vr = s.v;
	// the targets of the bases
	if (chase.on && !props.length) makeProps();
	if (!chase.on && props.length) while (props.length) chaseScene.remove(props.pop().mesh);
	for (i = 0; i < props.length && i < s.pd.length; i++) {
		p = props[i];
		if (s.pd[i] == '1' && !p.dead) propDead(p);
	}
	copFoes(s.f);
	for (i = 0; i + 3 < s.b.length; i += 4) boom(s.b[i], s.b[i + 1], s.b[i + 2], s.b[i + 3]);
}

// the enemies of the copilot are models with no behavior: they only copy the position of the enemies of the pilot
function copGhost(type) {
	var g = { type: type, mesh: new THREE.Mesh(foeGeo[type], foeMat), part: null, rotor: null, prop: null };
	g.mesh.rotation.order = 'YXZ';
	if (type == 'heli') {
		g.rotor = new THREE.Mesh(foeGeo.rotor, foeMat); g.rotor.position.y = 1.78; g.mesh.add(g.rotor);
		g.prop = new THREE.Mesh(foeGeo.prop, foeMat); g.prop.position.set(0.25, 1.1, 5.9); g.prop.rotation.y = Math.PI / 2; g.mesh.add(g.prop);
	} else if (type == 'plane') {
		g.prop = new THREE.Mesh(foeGeo.prop, foeMat); g.prop.position.set(0, -0.05, -3.75); g.mesh.add(g.prop);
	} else if (type == 'chute') {
		g.part = new THREE.Group();
		g.part.add(new THREE.Mesh(foeGeo.canopy, canopyMat), new THREE.Mesh(foeGeo.lines, foeMat));
		g.part.children[0].position.y = 5.2; g.part.children[1].position.y = -0.9;
		scene.add(g.part);
	}
	scene.add(g.mesh);
	return g;
}

function copDrop(g) {
	scene.remove(g.mesh);
	if (g.part) scene.remove(g.part);
}

function copFoes(f) {
	var seen = {}, i, id, type, g;
	for (i = 0; i + 8 < f.length; i += 9) {
		id = f[i]; type = FTYPE[f[i + 1]];
		if (!type) continue;
		g = cop.ghosts[id];
		if (!g || g.type !== type) { if (g) copDrop(g); g = cop.ghosts[id] = copGhost(type); }
		g.mesh.position.set(f[i + 2], f[i + 3], f[i + 4]);
		g.mesh.rotation.set(f[i + 5], f[i + 6], f[i + 7]);
		if (g.part) {
			g.part.visible = !!(f[i + 8] & 2);
			g.part.position.copy(g.mesh.position);
			g.part.rotation.z = g.mesh.rotation.z;
		}
		seen[id] = 1;
	}
	for (id in cop.ghosts) if (!seen[id]) { copDrop(cop.ghosts[id]); delete cop.ghosts[id]; }
}

// copilot: the camera. View of the pilot: the head of the pilot. Outside view: 8 m behind and 3.5 m above the skier.
function copView(dt) {
	var c, s, f;
	rigYaw = viewDir - cal.fwd;
	if (Math.abs(sk.y - rigY) > 8) rigY = sk.y;
	rigY += (sk.y - rigY) * (1 - Math.exp(-dt / 0.03));
	c = Math.cos(rigYaw); s = Math.sin(rigYaw);
	rig.position.set(sk.x - (cal.cx * c + cal.cz * s), rigY, sk.z - (-cal.cx * s + cal.cz * c));
	rig.rotation.y = rigYaw;
	rig.updateMatrixWorld(true);
	if (!cop.skier) {
		cop.skier = new THREE.Mesh(foeGeo.skier, new THREE.MeshLambertMaterial({ color: 0x3a7bd5 }));
		cop.skier.rotation.order = 'YXZ';
		scene.add(cop.skier);
	}
	cop.skier.visible = cop.view == 1;
	if (cop.view == 0) {
		camera.position.lerp(cop.headPos, Math.min(1, 12 * dt));
		camera.quaternion.slerp(cop.quat, Math.min(1, 8 * dt));
	} else {
		cop.skier.position.set(sk.x, sk.y, sk.z);
		cop.skier.rotation.set(Math.atan(sk.rise), sk.hdg, sk.fallen > 0 ? 1.2 : -ctl.steer * 0.3);
		f = Math.atan2(-sk.vx, -sk.vz);
		if (sk.speed < 2) f = sk.hdg;
		CV1.set(sk.x + Math.sin(f) * 8, sk.y + 3.5, sk.z + Math.cos(f) * 8);
		CV1.y = Math.max(CV1.y, groundAt(CV1.x, CV1.z) + 1.5);
		rig.worldToLocal(CV2.copy(CV1));
		camera.position.lerp(CV2, Math.min(1, 6 * dt));
		camera.updateMatrixWorld(true);
		camera.lookAt(sk.x, sk.y + 1.2, sk.z);
	}
}

// copilot: one frame
function copFrame(dt) {
	var k, g;
	// between two messages the skier moves on with its last speed
	if (game.state == 'run' && !game.paused) {
		sk.x += sk.vx * dt; sk.z += sk.vz * dt;
		sk.y = Math.max(sk.y + sk.vy * dt, groundAt(sk.x, sk.z));
	}
	chaseTime += dt;
	for (k in cop.ghosts) {
		g = cop.ghosts[k];
		if (g.rotor) g.rotor.rotation.y += 32 * dt;
		if (g.prop) g.prop.rotation[g.type == 'heli' ? 'x' : 'z'] += 50 * dt;
	}
	updateFx(dt);
	copView(dt);
	gunHolder.visible = false; aimDot.visible = false; deskCross.visible = false;
	updateWorld(sk.x, sk.y, sk.z, game.time);
	updateGear(dt);
	updateHub(dt);
	hub.visible = cop.view == 0;          // in the outside view the hub of the pilot is far away
	updateSound(dt);
	renderer.render(scene, camera);
}

// ---------- frame loop ----------

function frame(ms, xrFrame) {
	var now = ms / 1000, dt = clamp(now - lastT, 0.001, 0.05), n = 0;
	lastT = now;
	game.time += dt;
	vr = renderer.xr.isPresenting;
	Copilot.update();                 // the copilot link also works in VR
	if (Copilot.role === 'copilot' && !vr) { copFrame(dt); return; }

	readHead(dt, xrFrame);
	readInput(dt);

	if (game.state != 'menu') {
		acc += dt;
		while (acc >= DT && n < 8) { stepSki(DT); acc -= DT; n++; }
		if (acc > DT) acc = 0;
		if (game.state == 'run' && sk.moving) game.runTime += dt;
		if (game.spy) updateChase(dt);
		events();
	}
	updateFx(dt);
	placeRig(dt);
	rig.updateMatrixWorld(true);
	updateGuns(dt);
	updateWorld(sk.x, sk.y, sk.z, game.time);
	updateGear(dt);
	updateHub(dt);
	updateSound(dt);
	photoUpdate(dt);
	renderScope();
	renderer.render(scene, camera);
}

init();
