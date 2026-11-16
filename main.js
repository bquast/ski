// main.js - setup, input, your equipment, the hub, sound, the frame loop.
// Classic script. It uses THREE, world.js, ski.js and chase.js.
//
// Order of this file:
//   numbers that you can change, state, options, setup, input, view, equipment,
//   gun, hub, sound, game flow, frame loop.

// ---------- numbers that you can change ----------

var POLE_TILT = 0.35;       // the pole points down from the controller, and this much to the rear (radians)
var POLE_GAIN = 1.6;        // speed that you get for each meter of pole push (m/s)
var LEAN_FULL = 0.17;       // body lean to the side for a full turn (m)
var LEAN_DEAD = 0.015;      // lean below this value does nothing (m)
var HAND_TILT_FULL = 0.45;  // skis: one hand higher than the other, as a ratio of the hand distance, for a full turn
var HAND_YAW_FULL = 0.6;    // snowboard: angle between your arms and the board for a full turn (radians)
var FIRE_TIME = 0.13;       // seconds between shots
var RING_ANGLE = [40, 0, 30];   // comfort ring: open angle at speed, for LIGHT, OFF, STRONG (degrees)

// ---------- state ----------

var renderer, scene, camera, rig;
var vr = false, lastT = 0, acc = 0;
var game = {
	state: 'menu',           // 'menu', 'run', 'done'
	paused: false, spy: false,
	time: 0, runTime: 0, vmax: 0, doneTime: 0,
	msg: '', msgUntil: 0, result: '',
	nFall: 0, nLand: 0, nHit: 0, respawns: 0, white: 0,
	lastFire: 0, lastJump: 0, lastTuck: -9
};
var head = { x: 0, y: 1.7, z: 0, yaw: 0, vy: 0 };
var cal = { cx: 0, cz: 0, h: 1.7, fwd: 0, pole: 1.15, wait: 0 };   // your standing position, set by B or Y
var viewDir = 0, rigYaw = 0, rigY = 0, hubYaw = 0, hubMove = false;
var hands = { left: makeHand(), right: makeHand() };
var keys = {}, mouse = { x: 0, y: 0, down: false };
var menu = { sel: 0, held: false };
var best = { time: {}, score: {} };

function makeHand() {
	return {
		obj: null, src: null, has: false, kit: null, glove: null, pole: null, gun: null, laser: null, flash: null,
		px: 0, py: 0, pz: 0, seen: false, planted: false,
		trig: 0, grip: 0, sx: 0, sy: 0, bA: false, bB: false,
		pT: false, pA: false, pB: false
	};
}

// ---------- options ----------

var OPTS = [
	{ key: 'gear', label: 'Equipment', vals: ['SKIS', 'SNOWBOARD'] },
	{ key: 'game', label: 'Game', vals: ['FREE RUN', 'SPY CHASE'] },
	{ key: 'start', label: 'Start', vals: ['TOP', 'MIDDLE', 'LOW'] },
	{ key: 'assist', label: 'Easy skiing', vals: ['OFF', 'ON'] },
	{ key: 'steer', label: 'Steer with', vals: ['LEAN + HANDS', 'LEAN', 'STICK'] },
	{ key: 'turn', label: 'View turns', vals: ['WITH THE PISTE', 'NEVER', 'WITH YOU'] },
	{ key: 'ring', label: 'Comfort ring', vals: ['LIGHT', 'OFF', 'STRONG'] },
	{ key: 'gun', label: 'Gun hand', vals: ['RIGHT', 'LEFT'] }
];
var opt = { gear: 0, game: 0, start: 0, assist: 0, steer: 0, turn: 0, ring: 0, gun: 0 };

function loadOptions() {
	var o, b, i;
	try {
		o = JSON.parse(localStorage.getItem('ski-opt') || '{}');
		for (i = 0; i < OPTS.length; i++) if (o[OPTS[i].key] >= 0 && o[OPTS[i].key] < OPTS[i].vals.length) opt[OPTS[i].key] = o[OPTS[i].key];
		b = JSON.parse(localStorage.getItem('ski-best') || '{}');
		if (b.time) best.time = b.time;
		if (b.score) best.score = b.score;
	} catch (e) {}
}

function saveOptions() {
	try { localStorage.setItem('ski-opt', JSON.stringify(opt)); localStorage.setItem('ski-best', JSON.stringify(best)); } catch (e) {}
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
	camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.12, 30000);
	camera.rotation.order = 'YXZ';
	rig = new THREE.Group();
	rig.add(camera);
	scene.add(rig);

	makeWorld(scene);
	makeChase(scene);
	makeGear();
	makeHub();
	loadOptions();

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
	renderer.xr.addEventListener('sessionend', function () { calibrate(); btn.textContent = 'ENTER VR'; });
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
	window.addEventListener('mousedown', function () { mouse.down = true; initAudio(); });
	window.addEventListener('mouseup', function () { mouse.down = false; });

	toStart();
	renderer.setAnimationLoop(frame);
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
	var gunHand = opt.gun ? 'left' : 'right', hasPole, tip = readHands.tip, back, gy, was;
	for (i = 0; i < 2; i++) {
		h = hands[names[i]];
		h.pT = h.trig > 0.5; h.pA = h.bA; h.pB = h.bB;
		h.has = !!(vr && h.obj && h.obj.visible && h.src);
		gp = h.has ? h.src.gamepad : null;
		if (gp) {
			h.trig = gp.buttons[0] ? gp.buttons[0].value : 0;
			h.grip = gp.buttons[1] ? gp.buttons[1].value : 0;
			h.bA = !!(gp.buttons[4] && gp.buttons[4].pressed);
			h.bB = !!(gp.buttons[5] && gp.buttons[5].pressed);
			h.sx = dead(gp.axes[2] || 0, 0.15); h.sy = dead(gp.axes[3] || 0, 0.15);
		} else { h.trig = h.grip = h.sx = h.sy = 0; h.bA = h.bB = false; }
		if (!h.has) { h.seen = false; h.planted = false; continue; }

		// pole: the tip is in the snow if it is below the surface. A hand that moves to the rear then pushes you forward.
		o = h.obj;
		hasPole = opt.gear == 0 && !(game.spy && names[i] == gunHand);
		was = h.planted; h.planted = false;
		if (hasPole && h.seen && sk.ground && game.state == 'run') {
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
	var L = hands.left, R = hands.right, raw = 0, dx, dz, l, cf, cr, sep;
	if (opt.steer != 2) raw += dead((head.x - cal.cx) * rx + (head.z - cal.cz) * rz, LEAN_DEAD) / LEAN_FULL;
	if (opt.steer == 0 && !game.spy && L.has && R.has) {
		dx = R.px - L.px; dz = R.pz - L.pz;
		if (opt.gear == 0) {
			// skis: your hands are a bar. Left hand down = left turn.
			sep = dx * rx + dz * rz;
			if (sep > 0.2) raw -= dead((R.py - L.py) / sep, 0.07) / HAND_TILT_FULL;
		} else {
			// snowboard: you stand with one side to the front. The front hand points where you want to go.
			l = Math.sqrt(dx * dx + dz * dz) || 1;
			cf = (dx * fx + dz * fz) / l; cr = (dx * rx + dz * rz) / l;
			if (cf < 0) { cf = -cf; cr = -cr; }
			raw += sstep(0.4, 0.75, cf) * dead(Math.atan2(cr, cf), 0.05) / HAND_YAW_FULL;
		}
	}
	return raw;
}

function onKey(e) {
	keys[e.code] = true;
	initAudio();
	if (e.code == 'KeyM' || e.code == 'Escape') menuButton();
	else if (e.code == 'KeyN') startRun();
	else if (game.state == 'menu') {
		if (e.code == 'ArrowUp' || e.code == 'KeyW') menuMove(-1);
		else if (e.code == 'ArrowDown' || e.code == 'KeyS') menuMove(1);
		else if (e.code == 'ArrowLeft' || e.code == 'KeyA') menuChange(-1);
		else if (e.code == 'ArrowRight' || e.code == 'KeyD' || e.code == 'Enter' || e.code == 'Space') menuChange(1);
	} else if (game.state == 'done' && (e.code == 'Enter' || e.code == 'Space')) menuButton();
	else if (e.code == 'KeyJ' || (e.code == 'Space' && !game.spy)) ctl.jump = sk.ground;
	if (e.code == 'Space' || e.code.indexOf('Arrow') == 0) e.preventDefault();
}

// readInput fills ctl from the controllers, your body, the keys and the pointer.
function readInput(dt) {
	var L = hands.left, R = hands.right, push = readHands(dt), k = 1 - Math.exp(-dt * 10);
	var gunHand = opt.gun ? L : R, other = opt.gun ? R : L, steer = 0, brake = 0, tuck = 0, sy, trigPush, m;

	// buttons that work in all states
	if ((L.bB && !L.pB) || (R.bB && !R.pB)) { calibrate(); say('CENTER SET', 1.5); }
	if ((L.bA && !L.pA) || (R.bA && !R.pA)) menuButton();

	if (game.state == 'menu') {
		sy = Math.abs(L.sy) > Math.abs(R.sy) ? L.sy : R.sy; m = Math.abs(L.sx) > Math.abs(R.sx) ? L.sx : R.sx;
		if (Math.abs(sy) < 0.3 && Math.abs(m) < 0.3) menu.held = false;
		else if (!menu.held) {
			menu.held = true;
			if (Math.abs(sy) > Math.abs(m)) menuMove(sy > 0 ? 1 : -1); else menuChange(m > 0 ? 1 : -1);
		}
		if ((L.trig > 0.5 && !L.pT) || (R.trig > 0.5 && !R.pT)) menuChange(1);
		ctl.push = 0;
		return;
	}
	if (game.state == 'done') {
		ctl.steer += (0 - ctl.steer) * k; ctl.brake = 1; ctl.tuck = 0; ctl.push = 0;
		if (game.time - game.doneTime > 2.5 && ((L.trig > 0.5 && !L.pT) || (R.trig > 0.5 && !R.pT) || mouse.down)) menuButton();
		return;
	}

	if (vr) {
		steer = readSteer() + clamp(L.sx + R.sx, -1, 1);
		brake = Math.max(L.grip, R.grip, Math.max(L.sy, R.sy));
		tuck = clamp((cal.h * 0.9 - head.y) / (cal.h * 0.2), 0, 1);
		if (tuck > 0.3) game.lastTuck = game.time;
		// stand up fast from bent knees = jump
		if (head.vy > 1.0 && sk.ground && game.time - game.lastTuck < 0.6 && game.time - game.lastJump > 1.2) { ctl.jump = true; game.lastJump = game.time; }
		// push without poles: stick forward, or the trigger of the hand that has no gun
		trigPush = game.spy ? other.trig > 0.5 : (L.trig > 0.5 || R.trig > 0.5);
		if ((Math.min(L.sy, R.sy) < -0.5 || trigPush) && sk.speed < 4) push += 2.5 * dt;
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
		camera.rotation.set(-mouse.y * 0.5 - 0.1, -mouse.x * (game.spy ? 1.4 : 0.7), 0);
	}
}

// ---------- equipment ----------

var gear = null, skis = null, board = null, ring = null, flashPlane = null, aimDot = null, deskGun = null;

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
	board = new THREE.Mesh(partsGeo([
		['b', 0.27, 0.025, 1.3, 0, 0.012, 0, 0x1e5fbf], ['b', 0.27, 0.025, 0.2, 0, 0.04, -0.74, 0x1e5fbf, 0.3], ['b', 0.27, 0.025, 0.2, 0, 0.04, 0.74, 0x1e5fbf, -0.3],
		['b', 0.26, 0.012, 0.12, 0, 0.03, 0, 0xffffff],
		['b', 0.3, 0.16, 0.12, 0, 0.11, -0.26, BOOT, 0, 0.25, 0], ['b', 0.3, 0.16, 0.12, 0, 0.11, 0.26, BOOT, 0, -0.1, 0]
	]), mat);
	gear.add(skis, board);
	rig.add(gear);

	// each hand: glove, pole, gun
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
		h.gun = new THREE.Group();
		h.gun.add(new THREE.Mesh(partsGeo([
			['b', 0.034, 0.045, 0.2, 0, 0, -0.1, 0x2a2d32], ['b', 0.03, 0.11, 0.045, 0, -0.07, -0.01, 0x1b1d20, 0.2], ['b', 0.012, 0.03, 0.05, 0, -0.035, -0.06, 0x1b1d20]
		]), mat));
		h.laser = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 1), new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.45, fog: false }));
		h.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0xffd060, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
		h.flash.position.z = -0.24; h.flash.scale.setScalar(0.16); h.flash.visible = false;
		h.gun.add(h.laser, h.flash);
		h.kit.add(h.glove, h.pole, g, h.gun);
		h.grip = 0; h.gripMesh = g;
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

	aimDot = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020, fog: false, depthTest: false, transparent: true }));
	aimDot.renderOrder = 15; aimDot.visible = false;
	scene.add(aimDot);

	// desktop: the gun is at the bottom right of the view
	deskGun = new THREE.Group();
	deskGun.position.set(0.17, -0.16, -0.5);
	deskGun.add(new THREE.Mesh(hands.right.gun.children[0].geometry, mat));
	camera.add(deskGun);
}

function updateGear(dt) {
	var names = ['left', 'right'], gunHand = opt.gun ? 'left' : 'right', i, h, n, v, a, s, c, sn;
	// skis or board
	skis.visible = opt.gear == 0; board.visible = opt.gear == 1;
	gear.position.set(cal.cx, sk.y - rigY, cal.cz);
	gear.rotation.set(Math.atan(sk.rise), sk.hdg - rigYaw, Math.asin(clamp(sk.tilt, -0.7, 0.7)) - ctl.steer * 0.35 * Math.min(1, sk.speed / 8));

	for (i = 0; i < 2; i++) {
		h = hands[names[i]];
		h.pole.visible = h.gripMesh.visible = opt.gear == 0 && !(game.spy && names[i] == gunHand);
		h.gun.visible = game.spy && names[i] == gunHand && vr;
	}

	// snow spray when you skid or brake
	if (sk.ground && sk.speed > 2 && game.state != 'menu') {
		n = Math.min(4, Math.floor((sk.skid * 0.8 + ctl.brake * sk.speed * 0.15 + (sk.fallen > 0 ? 3 : 0)) * 60 * dt + Math.random()));
		c = Math.cos(sk.hdg); sn = Math.sin(sk.hdg);
		for (i = 0; i < n; i++) {
			s = (Math.random() - 0.5) * 1.4;
			puff(fxSnow, sk.x - sn * s + (Math.random() - 0.5) * 0.4, sk.y + 0.1, sk.z - c * s + (Math.random() - 0.5) * 0.4,
				sk.vx * 0.5 + (Math.random() - 0.5) * 3, 1 + Math.random() * 2.5, sk.vz * 0.5 + (Math.random() - 0.5) * 3, 0.35 + Math.random() * 0.4);
		}
	}

	// comfort ring
	v = vr && opt.ring != 1 && game.state != 'menu' ? Math.max(sstep(4, 15, sk.speed), sk.fallen > 0 ? 1 : 0) : 0;
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

// ---------- gun ----------

var GV1 = new THREE.Vector3(), GV2 = new THREE.Vector3();

function updateGun() {
	var h = hands[opt.gun ? 'left' : 'right'], on = game.spy && game.state == 'run', fire = false, src;
	aimDot.visible = false;
	deskGun.visible = on && !vr;
	hands.left.flash.visible = hands.right.flash.visible = false;
	if (!on) return;
	if (vr) {
		if (!h.has) return;
		src = h.obj; fire = h.trig > 0.5;
	} else { src = camera; fire = mouse.down || keys.Space || keys.KeyF; }
	src.getWorldPosition(GV1); src.getWorldDirection(GV2);
	if (vr) GV2.negate();      // for a controller, getWorldDirection gives +z. The gun points to -z.
	else GV1.y -= 0.15;
	gunAim(GV1.x, GV1.y, GV1.z, GV2.x, GV2.y, GV2.z);
	aimDot.visible = true;
	aimDot.position.set(AIM.x, AIM.y, AIM.z);
	aimDot.scale.setScalar(Math.max(0.012, AIM.dist * (AIM.foe ? 0.009 : 0.005)));
	h.laser.scale.z = Math.min(AIM.dist, 40); h.laser.position.z = -h.laser.scale.z / 2 - 0.2;
	if (fire && chase.down == 0 && game.time - game.lastFire > FIRE_TIME) {
		game.lastFire = game.time;
		fireGun(GV1.x, GV1.y, GV1.z, GV2.x, GV2.y, GV2.z);
		sndShot(0);
		if (vr) { buzz(h, 0.8, 40); h.flash.visible = true; h.flash.material.rotation = Math.random() * 6; }
	}
}

// ---------- hub ----------

// The hub is above your forward view. It shows speed, time and messages.
// The options are on a second board that opens with A or X.

var hub = null, statusMesh = null, menuMesh = null, statusCv = null, menuCv = null, statusT = 0, menuKey = '';

function makeHub() {
	hub = new THREE.Group();
	statusCv = document.createElement('canvas'); statusCv.width = 1024; statusCv.height = 256;
	menuCv = document.createElement('canvas'); menuCv.width = 1024; menuCv.height = 832;
	statusMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.375), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(statusCv), transparent: true, depthTest: false, depthWrite: false, fog: false }));
	menuMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.3), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(menuCv), transparent: true, depthTest: false, depthWrite: false, fog: false }));
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
	for (i = 0; i < OPTS.length; i++) rows.push(OPTS[i]);
	return rows;
}

function drawStatus() {
	var c = statusCv.getContext('2d'), msg = '', w;
	c.clearRect(0, 0, 1024, 256);
	c.fillStyle = 'rgba(8,18,32,0.6)'; c.fillRect(0, 0, 1024, 256);
	c.fillStyle = '#ffffff'; c.textBaseline = 'middle';
	c.font = 'bold 84px sans-serif'; c.textAlign = 'left';
	c.fillText((sk.speed * 3.6).toFixed(0), 36, 76);
	w = c.measureText((sk.speed * 3.6).toFixed(0)).width;
	c.font = 'bold 36px sans-serif'; c.fillText('km/h', 48 + w, 92);
	if (game.spy) {
		// health bar and score
		c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(330, 52, 330, 44);
		c.fillStyle = chase.health > 35 ? '#3ddc84' : '#ff4040'; c.fillRect(330, 52, 3.3 * chase.health, 44);
		c.fillStyle = '#ffffff'; c.font = 'bold 60px sans-serif'; c.textAlign = 'right';
		c.fillText(String(chase.score), 990, 76);
	} else {
		c.font = 'bold 72px sans-serif'; c.textAlign = 'center'; c.fillText(timeText(game.runTime), 512, 76);
		c.textAlign = 'right'; c.font = 'bold 52px sans-serif'; c.fillText(Math.max(0, (T_END - sk.t) / 1000).toFixed(1) + ' km', 990, 76);
	}
	if (game.time < game.msgUntil) msg = game.msg;
	else if (game.spy && chaseTime - chase.msgTime < 2.5) msg = chase.msg;
	else if (game.state == 'done') msg = game.result;
	else if (game.spy) msg = 'WAVE ' + chase.wave + ' / ' + WAVES.length + '     DOWN ' + chase.kills;
	else msg = 'MAX ' + (game.vmax * 3.6).toFixed(0) + ' km/h';
	c.textAlign = 'center'; c.font = 'bold 60px sans-serif';
	c.fillStyle = game.time < game.msgUntil || (game.spy && chaseTime - chase.msgTime < 2.5) ? '#ffd24a' : '#bcd0e6';
	c.fillText(msg, 512, 186, 980);
	statusMesh.material.map.needsUpdate = true;
}

function drawMenu() {
	var c = menuCv.getContext('2d'), rows = menuRows(), i, y, r, key;
	key = menu.sel + JSON.stringify(opt) + game.paused + game.result + vr;
	if (key == menuKey) return;
	menuKey = key;
	c.clearRect(0, 0, 1024, 832);
	c.fillStyle = 'rgba(8,18,32,0.86)'; c.fillRect(0, 0, 1024, 832);
	c.textBaseline = 'middle'; c.textAlign = 'center';
	c.fillStyle = '#ffffff'; c.font = 'bold 64px sans-serif'; c.fillText('SKI', 512, 54);
	if (game.result) { c.fillStyle = '#ffd24a'; c.font = 'bold 40px sans-serif'; c.fillText(game.result, 512, 112, 980); }
	for (i = 0; i < rows.length; i++) {
		y = 168 + i * 54; r = rows[i];
		if (i == menu.sel) { c.fillStyle = 'rgba(255,210,74,0.9)'; c.fillRect(40, y - 25, 944, 50); }
		c.fillStyle = i == menu.sel ? '#081220' : '#ffffff';
		c.font = 'bold 40px sans-serif';
		if (typeof r == 'string') { c.textAlign = 'center'; c.fillText(r, 512, y); }
		else {
			c.textAlign = 'left'; c.fillText(r.label, 70, y);
			c.textAlign = 'right'; c.fillText('<  ' + (r.key == 'assist' && opt.game == 1 ? 'ON' : r.vals[opt[r.key]]) + '  >', 954, y);
		}
	}
	c.textAlign = 'center'; c.fillStyle = '#bcd0e6'; c.font = '30px sans-serif';
	if (vr) {
		c.fillText('Stick: select and change.  Trigger: OK.  B or Y: set the center.', 512, 746);
		c.fillText('Lean to turn.  Grips: brake.  Bend your knees: speed.  A or X: this board.', 512, 790, 990);
	} else {
		c.fillText('Arrow keys: select and change.  ENTER: OK.  M: this board.', 512, 746);
		c.fillText('Pointer or A D: turn.  W: push.  S: brake.  SHIFT: speed.  SPACE: jump or fire.', 512, 790, 990);
	}
	menuMesh.material.map.needsUpdate = true;
}

function updateHub(dt) {
	var d = wrapPi(head.yaw - hubYaw);
	// the hub turns with your head, but only after you turn away from it
	if (!vr) hubYaw = camera.rotation.y;
	else {
		if (Math.abs(d) > (game.state == 'menu' ? 0.4 : 0.7)) hubMove = true;
		if (hubMove) { hubYaw += d * (1 - Math.exp(-dt * 4)); if (Math.abs(d) < 0.05) hubMove = false; }
	}
	hub.position.set(cal.cx, 0, cal.cz); hub.rotation.y = hubYaw;
	statusMesh.position.set(0, cal.h + 0.62, -2.3);
	menuMesh.position.set(0, cal.h - 0.12, -2.0);
	menuMesh.visible = game.state == 'menu';
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
	if (r.key == 'assist' && opt.game == 1) return;
	opt[r.key] = (opt[r.key] + dx + r.vals.length) % r.vals.length;
	saveOptions();
	// equipment, game and start position are for a new run: a change of these stops the run that you have
	if (r.key == 'gear' || r.key == 'game' || r.key == 'start') {
		if (game.paused) { game.paused = false; menu.sel--; }
		toStart();
	}
}

// menuButton: A, X or M. It opens and closes the options board.
function menuButton() {
	if (game.state == 'run') { game.state = 'menu'; game.paused = true; menu.sel = 0; menuKey = ''; }
	else if (game.state == 'menu' && game.paused) { game.state = 'run'; game.paused = false; }
	else if (game.state == 'done') { game.state = 'menu'; game.paused = false; menu.sel = 0; toStart(); }
}

// toStart puts you at the start position, with no run.
function toStart() {
	stopChase(); game.spy = false;
	sk.mode = opt.gear ? 'board' : 'ski';
	resetSki(START_T[opt.start]);
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
function sndBoom(dist) { burst('lowpass', 320, 1.0, 1.2 / (1 + dist / 90)); }
function sndClick() { burst('highpass', 3000, 0.04, 0.2); }
function sndThump(vol) { burst('lowpass', 170, 0.3, vol); }

function updateSound(dt) {
	var i, f, d, near = 1e9, on = game.state != 'menu', t;
	if (!AC) return;
	t = AC.currentTime;
	snd.wind.g.gain.setTargetAtTime(on ? Math.min(0.5, sk.speed * sk.speed / 1400) : 0, t, 0.1);
	snd.wind.f.frequency.setTargetAtTime(300 + sk.speed * 40, t, 0.1);
	snd.carve.g.gain.setTargetAtTime(on && sk.ground ? Math.min(0.3, sk.skid * 0.1 + ctl.brake * sk.speed * 0.015 + sk.speed * 0.002) : 0, t, 0.05);
	for (i = 0; i < foes.length; i++) {
		f = foes[i];
		if (f.type != 'heli' && f.type != 'plane') continue;
		d = Math.sqrt((f.x - sk.x) * (f.x - sk.x) + (f.y - sk.y) * (f.y - sk.y) + (f.z - sk.z) * (f.z - sk.z));
		if (d < near) near = d;
	}
	snd.rotor.g.gain.setTargetAtTime(on && near < 1e8 ? (0.5 + 0.5 * Math.sin(game.time * 70)) * 0.9 / (1 + near / 60) : 0, t, 0.02);
}

// playerHit: chase.js calls it when a bullet hits you.
function playerHit() {
	buzz(hands.left, 1, 120); buzz(hands.right, 1, 120);
	sndThump(0.7);
}

// ---------- game flow ----------

function startRun() {
	game.spy = opt.game == 1;
	sk.mode = opt.gear ? 'board' : 'ski';
	sk.assist = game.spy || opt.assist == 1;
	resetSki(START_T[opt.start]);
	if (game.spy) startChase(sk.t); else stopChase();
	game.state = 'run'; game.paused = false; game.runTime = 0; game.vmax = 0; game.result = '';
	game.nFall = sk.nFall; game.nLand = sk.nLand; game.nHit = sk.nHit; game.respawns = chase.respawns;
	viewDir = sk.hdg; rigY = sk.y; acc = 0;
	if (vr) say(opt.gear == 0 && !game.spy ? 'PUSH WITH YOUR POLES' : 'PULL THE TRIGGER TO PUSH OFF', 5);
	else say('W: PUSH', 4);
}

function finishRun() {
	var key = (opt.gear ? 'board' : 'ski') + opt.start, b;
	game.state = 'done'; game.doneTime = game.time;
	if (game.spy) {
		endChase();
		b = best.score[key] || 0;
		if (chase.score > b) best.score[key] = b = chase.score;
		game.result = 'MISSION COMPLETE   ' + chase.score + '   BEST ' + b;
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
	if (sk.nFall != game.nFall) {
		game.nFall = sk.nFall; game.white = 1;
		say('WIPEOUT', 2); sndThump(0.9);
		buzz(hands.left, 1, 200); buzz(hands.right, 1, 200);
	}
	if (sk.nLand != game.nLand) {
		game.nLand = sk.nLand;
		sndThump(Math.min(0.8, sk.lastImpact / 10));
		buzz(hands.left, 0.6, 60); buzz(hands.right, 0.6, 60);
		if (sk.lastAir > 0.6 && sk.fallen == 0) say('AIR  ' + sk.lastAir.toFixed(1) + ' s', 1.5);
	}
	if (sk.nHit != game.nHit) { game.nHit = sk.nHit; sndThump(0.6); buzz(hands.left, 0.8, 100); buzz(hands.right, 0.8, 100); }
	if (chase.respawns != game.respawns) { game.respawns = chase.respawns; viewDir = sk.hdg; rigY = sk.y; }
	if (sk.speed > game.vmax) game.vmax = sk.speed;
	if (game.state == 'run' && sk.t >= T_END) finishRun();
}

// ---------- frame loop ----------

function frame(ms, xrFrame) {
	var now = ms / 1000, dt = clamp(now - lastT, 0.001, 0.05), n = 0;
	lastT = now;
	game.time += dt;
	vr = renderer.xr.isPresenting;

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
	updateGun();
	updateWorld(sk.x, sk.z, game.time);
	updateGear(dt);
	updateHub(dt);
	updateSound(dt);
	renderer.render(scene, camera);
}

init();
