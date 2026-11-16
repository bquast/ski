// guns.js - your weapons: pistol, machine gun, sniper rifle with a scope, grenades.
// Classic script. It uses THREE, world.js, ski.js and chase.js (rayHit, hitFoe, hitProp, throwGrenade, tracer).
// It also uses things that main.js makes: renderer, scene, camera, rig, hands, head, opt, keys, mouse, game, vr.
//
// main.js calls makeGuns() one time, updateGuns() each frame, and renderScope() before it draws the frame.
//
// One hand holds the weapon (the gun hand). The trigger fires.
// Machine gun and sniper rifle: hold the grip button of the other hand near the weapon to use two hands.
// The weapon then points from the gun hand to the other hand. This is much more accurate.
// Sniper rifle: put the scope near your eye to see the scope picture.
// Grenade: pull the trigger of the other hand, move your arm, release the trigger.

// rate: seconds between shots. spread: error with one hand. spread2: error with two hands. help: aim help (0 to 1).
// mag: shots before a reload (0 = no reload). muzzle: distance from your hand to the end of the barrel.
var WPN = [
	{ name: 'PISTOL', rate: 0.2, dmg: 1, spread: 0.008, spread2: 0.008, range: 300, mag: 0, reload: 0, help: 1, auto: true, muzzle: 0.22 },
	{ name: 'MACHINE GUN', rate: 0.07, dmg: 1, spread: 0.045, spread2: 0.012, range: 400, mag: 40, reload: 1.5, help: 1, auto: true, muzzle: 0.62 },
	{ name: 'SNIPER RIFLE', rate: 1.1, dmg: 12, spread: 0.012, spread2: 0, range: 1500, mag: 5, reload: 2.2, help: 0.12, auto: false, muzzle: 1.12 }
];
var GREN_MAX = 6;          // grenades that you can have
var GREN_TIME = 12;        // seconds for one new grenade
var SCOPE_FOV = 3.5;       // degrees. Smaller = more zoom.

var gun = {
	w: 0, ammo: [0, 40, 5], reload: 0, last: -9, trigWas: false,
	two: false, scoped: false, rtOk: true,
	gren: GREN_MAX, grenT: 0, hold: false, gWas: false,
	opx: 0, opy: 0, opz: 0, hvx: 0, hvy: 0, hvz: 0, oSeen: false,     // the other hand: last position and speed
	hist: new Float32Array(24), hi: 0,                                // its speed in the last 8 frames
	mx0: 0, my0: 0, yaw0: 0, pitch0: 0                                // desktop scope: pointer and view direction at the start
};
var gunHolder = null, gunMesh = [], gunLaser = null, gunFlash = null, aimDot = null, handGren = null, deskCross = null;
var scopeRT = null, scopeCam = null, scopeDisc = null;
var GV1 = new THREE.Vector3(), GV2 = new THREE.Vector3(), GV3 = new THREE.Vector3(), GUP = new THREE.Vector3(), GM = new THREE.Matrix4(), GQ = new THREE.Quaternion();

function makeGuns() {
	var mat = new THREE.MeshLambertMaterial({ vertexColors: true }), H = Math.PI / 2, DK = 0x1b1d20, BD = 0x2a2d32, WD = 0x4a3a28, cv, c, tex, m;
	gunHolder = new THREE.Group();
	rig.add(gunHolder);
	// All models point to -z. The origin is your gun hand.
	gunMesh.push(new THREE.Mesh(partsGeo([
		['b', 0.034, 0.045, 0.2, 0, 0, -0.1, BD], ['b', 0.03, 0.11, 0.045, 0, -0.07, -0.01, DK, 0.2], ['b', 0.012, 0.03, 0.05, 0, -0.035, -0.06, DK]
	]), mat));
	gunMesh.push(new THREE.Mesh(partsGeo([
		['b', 0.05, 0.07, 0.42, 0, 0.01, -0.17, BD], ['c', 0.012, 0.012, 0.24, 0, 0.02, -0.5, DK, H, 0, 0, 6],
		['b', 0.035, 0.17, 0.05, 0, -0.1, -0.14, DK, 0.15], ['b', 0.04, 0.06, 0.24, 0, 0, 0.16, BD], ['b', 0.045, 0.11, 0.03, 0, -0.03, 0.29, BD],
		['b', 0.03, 0.09, 0.03, 0, -0.07, -0.32, DK], ['b', 0.03, 0.1, 0.045, 0, -0.07, -0.01, DK, 0.2]
	]), mat));
	gunMesh.push(new THREE.Mesh(partsGeo([
		['b', 0.05, 0.07, 0.62, 0, 0, -0.2, WD], ['c', 0.011, 0.011, 0.62, 0, 0.015, -0.81, DK, H, 0, 0, 6],
		['b', 0.045, 0.11, 0.34, 0, -0.025, 0.26, WD], ['c', 0.032, 0.032, 0.3, 0, 0.085, -0.15, DK, H, 0, 0, 10],
		['b', 0.02, 0.04, 0.03, 0, 0.05, -0.08, DK], ['b', 0.02, 0.04, 0.03, 0, 0.05, -0.22, DK],
		['b', 0.03, 0.1, 0.045, 0, -0.07, -0.01, DK, 0.2], ['b', 0.03, 0.12, 0.04, 0, -0.08, -0.25, DK]
	]), mat));
	gunHolder.add(gunMesh[0], gunMesh[1], gunMesh[2]);

	gunLaser = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 1), new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.45, fog: false }));
	gunFlash = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0xffd060, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
	gunFlash.scale.setScalar(0.2); gunFlash.visible = false;
	gunHolder.add(gunLaser, gunFlash);

	// scope: a second camera draws a small picture. The picture is on a disc at the rear end of the scope.
	scopeRT = new THREE.WebGLRenderTarget(384, 384);
	scopeCam = new THREE.PerspectiveCamera(SCOPE_FOV, 1, 1, 30000);
	scene.add(scopeCam);
	scopeDisc = new THREE.Mesh(new THREE.CircleGeometry(0.055, 28), new THREE.MeshBasicMaterial({ color: 0x05080c, fog: false }));
	scopeDisc.position.set(0, 0.085, 0.01);
	cv = document.createElement('canvas'); cv.width = cv.height = 256;
	c = cv.getContext('2d');
	c.strokeStyle = '#000'; c.lineWidth = 14; c.beginPath(); c.arc(128, 128, 121, 0, 6.2832); c.stroke();
	c.lineWidth = 2; c.beginPath(); c.moveTo(0, 128); c.lineTo(256, 128); c.moveTo(128, 0); c.lineTo(128, 256); c.stroke();
	c.lineWidth = 5; c.beginPath(); c.moveTo(0, 128); c.lineTo(80, 128); c.moveTo(176, 128); c.lineTo(256, 128); c.moveTo(128, 176); c.lineTo(128, 256); c.stroke();
	tex = new THREE.CanvasTexture(cv);
	m = new THREE.Mesh(new THREE.CircleGeometry(0.055, 28), new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false }));
	m.position.z = 0.001;
	scopeDisc.add(m);
	gunMesh[2].add(scopeDisc);
	// desktop: the scope is the full view, with the same cross
	deskCross = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, fog: false }));
	deskCross.position.z = -1; deskCross.renderOrder = 40; deskCross.visible = false;
	camera.add(deskCross);

	aimDot = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020, fog: false, depthTest: false, transparent: true }));
	aimDot.renderOrder = 15; aimDot.visible = false;
	scene.add(aimDot);
	handGren = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshLambertMaterial({ color: 0x2c4a2c }));
	handGren.visible = false;
	rig.add(handGren);
}

function resetGuns() {
	gun.w = 0; gun.ammo[1] = WPN[1].mag; gun.ammo[2] = WPN[2].mag; gun.reload = 0; gun.gren = GREN_MAX; gun.grenT = 0; gun.hold = false; gun.two = false; gun.scoped = false;
}

function setWeapon(w) {
	if (w == gun.w) return;
	gun.w = w; gun.reload = WPN[w].mag && gun.ammo[w] <= 0 ? WPN[w].reload : 0;
	say(WPN[w].name, 1.2);
	sndClick();
}

function setFov(f) {
	if (camera.fov == f) return;
	camera.fov = f; camera.updateProjectionMatrix();
}

// toWorld turns a direction of the play space into a world direction (the play space turns around the vertical axis only).
function toWorld(v) {
	var c = Math.cos(rigYaw), s = Math.sin(rigYaw), x = v.x;
	v.x = x * c + v.z * s; v.z = -x * s + v.z * c;
	return v;
}

function updateGuns(dt) {
	var on = game.spy && game.state == 'run', W = WPN[gun.w], G = hands[opt.gun ? 'left' : 'right'], O = hands[opt.gun ? 'right' : 'left'];
	var i, fire, press, d, s, was, sp, gKey;
	aimDot.visible = false; gunFlash.visible = false; handGren.visible = false; deskCross.visible = false; gunLaser.visible = false;
	if (!on) { gunHolder.visible = false; gun.scoped = false; gun.two = false; gun.hold = false; gun.oSeen = false; if (!vr) setFov(72); return; }

	if (gun.reload > 0) { gun.reload -= dt; if (gun.reload <= 0) { gun.reload = 0; gun.ammo[gun.w] = W.mag; sndClick(); } }
	gun.grenT += dt;
	if (gun.grenT > GREN_TIME && gun.gren < GREN_MAX) { gun.gren++; gun.grenT = 0; }
	for (i = 0; i < 3; i++) gunMesh[i].visible = i == gun.w;
	was = gun.scoped;

	if (vr) {
		gunHolder.visible = G.has;
		if (!G.has) return;
		// two hands: the weapon points from the gun hand to the other hand
		d = O.has ? G.obj.position.distanceTo(O.obj.position) : 9;
		gun.two = gun.w > 0 && O.has && O.grip > 0.5 && d > 0.12 && d < (gun.two ? 0.95 : 0.75);
		gunHolder.position.copy(G.obj.position);
		if (gun.two) {
			GM.lookAt(G.obj.position, O.obj.position, GUP.set(0, 1, 0).applyQuaternion(G.obj.quaternion));
			gunHolder.quaternion.setFromRotationMatrix(GM);
		} else gunHolder.quaternion.copy(G.obj.quaternion);
		fire = G.trig > 0.5;
		// scope: on when the rear end of the scope is near your head
		GV3.set(0, 0.085, 0.01).applyQuaternion(gunHolder.quaternion).add(gunHolder.position);
		d = Math.sqrt((GV3.x - head.x) * (GV3.x - head.x) + (GV3.y - head.y) * (GV3.y - head.y) + (GV3.z - head.z) * (GV3.z - head.z));
		gun.scoped = gun.w == 2 && d < (was ? 0.38 : 0.3);

		// grenade: trigger of the other hand. Release it to throw. The speed of your hand is the speed of the grenade.
		if (O.has) {
			if (gun.oSeen) {
				gun.hvx += ((O.obj.position.x - gun.opx) / dt - gun.hvx) * 0.4;
				gun.hvy += ((O.obj.position.y - gun.opy) / dt - gun.hvy) * 0.4;
				gun.hvz += ((O.obj.position.z - gun.opz) / dt - gun.hvz) * 0.4;
			}
			gun.opx = O.obj.position.x; gun.opy = O.obj.position.y; gun.opz = O.obj.position.z; gun.oSeen = true;
			gun.hi = (gun.hi + 1) % 8; gun.hist[gun.hi * 3] = gun.hvx; gun.hist[gun.hi * 3 + 1] = gun.hvy; gun.hist[gun.hi * 3 + 2] = gun.hvz;
			if (O.trig > 0.5 && gun.gren > 0 && !gun.two) { gun.hold = true; handGren.visible = true; handGren.position.copy(O.obj.position); }
			else if (gun.hold) {
				gun.hold = false;
				// use the highest hand speed of the last 8 frames: your hand is already slower when you release the trigger
				sp = 0;
				for (i = 0; i < 8; i++) {
					d = gun.hist[i * 3] * gun.hist[i * 3] + gun.hist[i * 3 + 1] * gun.hist[i * 3 + 1] + gun.hist[i * 3 + 2] * gun.hist[i * 3 + 2];
					if (d > sp) { sp = d; GV3.set(gun.hist[i * 3], gun.hist[i * 3 + 1], gun.hist[i * 3 + 2]); }
				}
				sp = Math.sqrt(sp);
				if (sp < 1.2) GV3.set(0, 0.35, -1).applyQuaternion(O.obj.quaternion).multiplyScalar(9);    // no arm movement: a soft throw to the front
				else GV3.multiplyScalar(1.8);
				toWorld(GV3);
				O.obj.getWorldPosition(GV1);
				if (throwGrenade(GV1.x, GV1.y, GV1.z, GV3.x + sk.vx, GV3.y + sk.vy + 1, GV3.z + sk.vz, 1.8, true)) { gun.gren--; gun.grenT = 0; buzz(O, 0.6, 50); }
			}
		} else { gun.oSeen = false; gun.hold = false; }
	} else {
		// desktop: the weapon is at the bottom right of the view. Q or the right button: scope.
		gun.two = true;
		gun.scoped = gun.w == 2 && !!(keys.KeyQ || mouse.right);
		if (gun.scoped && !was) { gun.mx0 = mouse.x; gun.my0 = mouse.y; gun.yaw0 = camera.rotation.y; gun.pitch0 = camera.rotation.x; }
		gunHolder.visible = !gun.scoped;
		gunHolder.position.copy(camera.position).add(GV3.set(0.2, -0.2, -0.7).applyQuaternion(camera.quaternion));
		gunHolder.quaternion.copy(camera.quaternion);
		fire = mouse.down || keys.Space || keys.KeyF;
		setFov(gun.scoped ? 7 : 72);
		deskCross.visible = gun.scoped;
		gKey = !!keys.KeyG;
		if (gKey && !gun.gWas && gun.gren > 0) {
			camera.getWorldPosition(GV1); camera.getWorldDirection(GV3);
			if (throwGrenade(GV1.x, GV1.y - 0.2, GV1.z, GV3.x * 17 + sk.vx, GV3.y * 17 + 4 + sk.vy, GV3.z * 17 + sk.vz, 1.8, true)) { gun.gren--; gun.grenT = 0; }
		}
		gun.gWas = gKey;
	}

	// start point and direction of the shot, in the world
	gunHolder.updateMatrixWorld(true);
	if (vr) { gunHolder.getWorldPosition(GV1); gunHolder.getWorldQuaternion(GQ); GV2.set(0, 0, -1).applyQuaternion(GQ); }
	else { camera.getWorldPosition(GV1); camera.getWorldDirection(GV2); }

	// red dot (not for the sniper rifle: it has the scope)
	if (gun.w != 2) {
		rayHit(GV1.x, GV1.y, GV1.z, GV2.x, GV2.y, GV2.z, 250, W.help);
		aimDot.visible = true;
		aimDot.position.set(AIM.x, AIM.y, AIM.z);
		aimDot.scale.setScalar(Math.max(0.012, AIM.dist * (AIM.foe || AIM.prop ? 0.009 : 0.005)));
		gunLaser.visible = vr;
		gunLaser.scale.z = Math.min(AIM.dist, 40); gunLaser.position.z = -gunLaser.scale.z / 2 - W.muzzle;
	}

	press = fire && !gun.trigWas; gun.trigWas = fire;
	if (fire && (W.auto || press) && gun.reload == 0 && game.time - gun.last >= W.rate && chase.down == 0) {
		gun.last = game.time;
		s = gun.two ? W.spread2 : W.spread;
		GV3.set(GV2.x + (Math.random() - 0.5) * 2 * s, GV2.y + (Math.random() - 0.5) * 2 * s, GV2.z + (Math.random() - 0.5) * 2 * s).normalize();
		rayHit(GV1.x, GV1.y, GV1.z, GV3.x, GV3.y, GV3.z, W.range, W.help);
		tracer(GV1.x + GV2.x * W.muzzle, GV1.y + GV2.y * W.muzzle - (vr ? 0 : 0.12), GV1.z + GV2.z * W.muzzle, AIM.x, AIM.y, AIM.z, gun.w == 2 ? 900 : 500, gun.w == 2 ? 30 : 14, gun.w == 2 ? 0.06 : 0.035, 0xfff2b0, 0);
		if (AIM.foe) hitFoe(AIM.foe, W.dmg, false);
		else if (AIM.prop) hitProp(AIM.prop, W.dmg);
		else if (AIM.dist < W.range - 1) snowBurst(AIM.x, AIM.y, AIM.z, 3, 3);
		if (gun.w == 2) sndRifle(); else sndShot(0);
		gunFlash.visible = true; gunFlash.position.set(0, gun.w == 0 ? 0 : 0.02, -W.muzzle - 0.04); gunFlash.material.rotation = Math.random() * 6;
		buzz(G, gun.w == 2 ? 1 : 0.7, gun.w == 2 ? 90 : 35);
		if (gun.two) buzz(O, 0.5, 35);
		if (W.mag) { gun.ammo[gun.w]--; if (gun.ammo[gun.w] <= 0) gun.reload = W.reload; }
	}
}

// renderScope draws the scope picture. It is done only when the scope is near your eye.
function renderScope() {
	var want = game.spy && game.state == 'run' && gun.scoped && vr && gun.rtOk, m = scopeDisc.material, prev, xr, v1, v2, v3, v4;
	if ((m.map != null) != want) { m.map = want ? scopeRT.texture : null; m.color.setHex(want ? 0xffffff : 0x05080c); m.needsUpdate = true; }
	if (!want) return;
	gunHolder.getWorldPosition(scopeCam.position); gunHolder.getWorldQuaternion(scopeCam.quaternion);
	scopeCam.position.addScaledVector(GV2, 1.2);
	scopeCam.updateMatrixWorld(true);
	v1 = gunHolder.visible; v2 = ring.visible; v3 = hub.visible; v4 = flashPlane.visible;
	gunHolder.visible = ring.visible = hub.visible = flashPlane.visible = false;
	try {
		prev = renderer.getRenderTarget(); xr = renderer.xr.enabled;
		renderer.xr.enabled = false;
		renderer.setRenderTarget(scopeRT);
		renderer.render(scene, scopeCam);
		renderer.setRenderTarget(prev);
		renderer.xr.enabled = xr;
	} catch (e) { gun.rtOk = false; renderer.xr.enabled = true; }
	gunHolder.visible = v1; ring.visible = v2; hub.visible = v3; flashPlane.visible = v4;
}
