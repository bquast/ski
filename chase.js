// chase.js - effects, enemies, grenades, targets, and the rules of the chase and the mission.
// Classic script. It uses THREE, world.js and the skier state (sk) from ski.js.
//
// main.js calls makeChase() one time, updateFx() each frame, and updateChase() each frame of a chase or mission.
// main.js supplies sndShot(), sndBoom(), playerHit() and say(). guns.js calls rayHit(), hitFoe(), hitProp() and throwGrenade().
//
// Enemies on the snow do not use the ski physics. They move in piste coordinates (t, d):
// each enemy has a slot near you (slotT ahead, slotD to the side) and goes to it.
// They can hit trees, rocks, ice blocks and houses, and they can fall into crevasses.
//
// Order of this file:
//   state, effects, models, hits, explosions and grenades, enemy fire, spawn, enemy update,
//   targets (props), director, mission, update.

// ---------- state ----------

var foes = [], props = [];
var chase = {
	on: false, done: false, mode: 'chase', diff: 1,
	score: 0, kills: 0, health: 100,
	heat: 1,                       // how hard the chase is at this moment. 0 = no new enemies.
	spawnT: 0, heliT: 30, planeT: 50, budget: 0,
	startT: 0, graceT: 0,
	checkT: 0, checkStage: 0,      // where you start again when you are down
	down: 0,                       // seconds until you start again
	respawns: 0,
	hitTime: -99, flash: 0,
	msg: '', msgTime: -99,
	stage: 0, text: '', left: 0    // mission: stage number, objective text, guards or targets that remain
};
var chaseTime = 0;
var foeCount = 0;          // each enemy has a number (the copilot uses it)
var chaseScene = null;

// hp: damage to destroy. r: hit sphere radius. cy: hit sphere height. fire: seconds between shots (min, max).
var FOE = {
	skier: { hp: 1, r: 0.9, cy: 1.0, score: 100, fire: [1.4, 2.8], dmg: 6, vmax: 31, wide: 0.5 },
	sled:  { hp: 2, r: 1.3, cy: 0.9, score: 250, fire: [1.1, 2.2], dmg: 6, vmax: 35, wide: 1.0 },
	truck: { hp: 14, r: 2.6, cy: 1.8, score: 500, fire: [0.5, 1.0], dmg: 7, vmax: 26, wide: 2.2 },
	chute: { hp: 1, r: 1.0, cy: 1.0, score: 150, fire: [1.8, 3.2], dmg: 6, vmax: 31, wide: 0.5 },
	heli:  { hp: 14, r: 3.3, cy: 0, score: 1000, fire: [4, 6.5], dmg: 10 },
	plane: { hp: 7, r: 3.3, cy: 0, score: 800, fire: [0, 0], dmg: 14 },
	guard: { hp: 1, r: 0.75, cy: 1.0, score: 200, fire: [2.2, 4.5], dmg: 8 }
};
// n: enemies on the snow at heat 1. rate: enemy shots each second when all of them are there. dmg: damage factor.
// wait: factor for the time between new enemies. heal: health that you get for each enemy that you shoot.
var DIFF = [{ n: 6, rate: 1.3, dmg: 0.8, wait: 1.3, heal: 4 }, { n: 10, rate: 2.2, dmg: 1, wait: 1, heal: 3 }, { n: 15, rate: 3.2, dmg: 1.2, wait: 0.75, heal: 2 }];

// The mission. k: 'ski' = go to t, 'stop' = stop at the overlook, 'snipe' = shoot the guards, 'destroy' = destroy the targets.
var STAGES = [
	{ k: 'ski', to: 2500, heat: 0.7, text: 'GO DOWN TO THE UPPER BASE' },
	{ k: 'stop', comp: 0, heat: 0, text: 'STOP AT THE GREEN LIGHT' },
	{ k: 'snipe', comp: 0, heat: 0, text: 'SNIPER RIFLE: SHOOT THE GUARDS' },
	{ k: 'destroy', comp: 0, heat: 0.5, text: 'DESTROY THE TANKS AND THE RADAR' },
	{ k: 'ski', to: 5540, heat: 1, text: 'ALARM. GO TO THE LOWER BASE' },
	{ k: 'stop', comp: 1, heat: 0, text: 'STOP AT THE GREEN LIGHT' },
	{ k: 'snipe', comp: 1, heat: 0, text: 'SNIPER RIFLE: SHOOT THE GUARDS' },
	{ k: 'destroy', comp: 1, heat: 0.6, text: 'DESTROY THE HELICOPTER, TANKS, RADAR' },
	{ k: 'ski', to: T_END, heat: 1.3, text: 'ESCAPE TO THE VILLAGE' }
];

// ---------- effects ----------

var fxSnow = null, fxSmoke = null, fxFire = null, puffTex = null;
var TR_N = 64;
var tr = null;
var booms = [], boomNext = 0;

function makePuffs(scene, n, size, hex, opacity, add, grav) {
	var g = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), i;
	for (i = 0; i < n; i++) pos[i * 3 + 1] = -9999;
	g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
	var m = new THREE.PointsMaterial({ size: size, color: hex, map: puffTex, transparent: true, opacity: opacity, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
	var pts = new THREE.Points(g, m);
	pts.frustumCulled = false;
	scene.add(pts);
	return { pts: pts, pos: pos, vel: new Float32Array(n * 3), life: new Float32Array(n), n: n, next: 0, grav: grav };
}

function puff(s, x, y, z, vx, vy, vz, life) {
	var i = s.next; s.next = (i + 1) % s.n;
	s.pos[i * 3] = x; s.pos[i * 3 + 1] = y; s.pos[i * 3 + 2] = z;
	s.vel[i * 3] = vx; s.vel[i * 3 + 1] = vy; s.vel[i * 3 + 2] = vz;
	s.life[i] = life;
}

function updatePuffs(s, dt) {
	var i, k;
	for (i = 0; i < s.n; i++) {
		if (s.life[i] <= 0) continue;
		k = i * 3; s.life[i] -= dt;
		if (s.life[i] <= 0) { s.pos[k + 1] = -9999; continue; }
		s.vel[k + 1] += s.grav * dt;
		s.pos[k] += s.vel[k] * dt; s.pos[k + 1] += s.vel[k + 1] * dt; s.pos[k + 2] += s.vel[k + 2] * dt;
	}
	s.pts.geometry.attributes.position.needsUpdate = true;
}

function snowBurst(x, y, z, n, v) {
	for (var i = 0; i < n; i++) puff(fxSnow, x, y + 0.2, z, (Math.random() - 0.5) * v, Math.random() * v, (Math.random() - 0.5) * v, 0.5 + Math.random() * 0.5);
}

// tracer draws a bright line that moves from a to b. If dmg > 0, it can hit you when it gets to b.
var TC1 = new THREE.Color();

function tracer(ax, ay, az, bx, by, bz, speed, streak, wid, hex, dmg) {
	var i = tr.next, dx = bx - ax, dy = by - ay, dz = bz - az, l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
	tr.next = (i + 1) % TR_N;
	tr.a[i * 3] = ax; tr.a[i * 3 + 1] = ay; tr.a[i * 3 + 2] = az;
	tr.d[i * 3] = dx / l; tr.d[i * 3 + 1] = dy / l; tr.d[i * 3 + 2] = dz / l;
	tr.len[i] = l; tr.pos[i] = 0; tr.spd[i] = speed; tr.stk[i] = streak; tr.wid[i] = wid; tr.dmg[i] = dmg; tr.on[i] = 1;
	tr.mesh.setColorAt(i, TC1.setHex(hex));
	tr.mesh.instanceColor.needsUpdate = true;
}

function updateTracers(dt) {
	var m = tr.mesh.instanceMatrix.array, i, k, j, head, tail, L, mid, dx, dy, dz, xx, xy, xz, yx, yy, yz, l, w, ex, ey, ez, hit;
	for (i = 0; i < TR_N; i++) {
		if (!tr.on[i]) continue;
		k = i * 3; j = i * 16;
		tr.pos[i] += tr.spd[i] * dt;
		if (tr.pos[i] - tr.stk[i] >= tr.len[i]) {
			tr.on[i] = 0; m[j] = m[j + 5] = m[j + 10] = 0; m[j + 13] = -9999;
			continue;
		}
		if (tr.dmg[i] > 0 && tr.pos[i] >= tr.len[i]) {
			// a bullet got to its aim point. If you bend your knees, you are a smaller target.
			ex = tr.a[k] + tr.d[k] * tr.len[i] - sk.x; ey = tr.a[k + 1] + tr.d[k + 1] * tr.len[i] - (sk.y + 1.15); ez = tr.a[k + 2] + tr.d[k + 2] * tr.len[i] - sk.z;
			hit = ctl.tuck > 0.5 ? 0.22 : 0.4;
			if (ex * ex + ey * ey + ez * ez < hit) damagePlayer(tr.dmg[i]);
			tr.dmg[i] = 0;
		}
		head = Math.min(tr.pos[i], tr.len[i]); tail = Math.max(0, tr.pos[i] - tr.stk[i]); L = Math.max(0.01, head - tail); mid = (head + tail) / 2;
		dx = tr.d[k]; dy = tr.d[k + 1]; dz = tr.d[k + 2];
		// x axis = up x d (or east x d, if d is vertical). y axis = d x x.
		if (Math.abs(dy) > 0.99) { xx = 0; xy = -dz; xz = dy; } else { xx = dz; xy = 0; xz = -dx; }
		l = 1 / Math.sqrt(xx * xx + xy * xy + xz * xz); xx *= l; xy *= l; xz *= l;
		yx = dy * xz - dz * xy; yy = dz * xx - dx * xz; yz = dx * xy - dy * xx;
		w = tr.wid[i];
		m[j] = xx * w; m[j + 1] = xy * w; m[j + 2] = xz * w; m[j + 3] = 0;
		m[j + 4] = yx * w; m[j + 5] = yy * w; m[j + 6] = yz * w; m[j + 7] = 0;
		m[j + 8] = dx * L; m[j + 9] = dy * L; m[j + 10] = dz * L; m[j + 11] = 0;
		m[j + 12] = tr.a[k] + dx * mid; m[j + 13] = tr.a[k + 1] + dy * mid; m[j + 14] = tr.a[k + 2] + dz * mid; m[j + 15] = 1;
	}
	tr.mesh.instanceMatrix.needsUpdate = true;
}

function boom(x, y, z, r) {
	if (typeof copBoom === 'function') copBoom(x, y, z, r);      // main.js: the copilot also sees it
	var b = booms[boomNext], i; boomNext = (boomNext + 1) % booms.length;
	b.mesh.position.set(x, y, z); b.mesh.visible = true; b.t = 0; b.r = r;
	for (i = 0; i < 10; i++) puff(fxFire, x, y, z, (Math.random() - 0.5) * r * 3, Math.random() * r * 2.5, (Math.random() - 0.5) * r * 3, 0.4 + Math.random() * 0.5);
	for (i = 0; i < 9; i++) puff(fxSmoke, x, y + 1, z, (Math.random() - 0.5) * r * 2, 1 + Math.random() * r, (Math.random() - 0.5) * r * 2, 1.2 + Math.random() * 1.5);
	snowBurst(x, y, z, 10, r * 3);
	sndBoom(Math.sqrt((x - sk.x) * (x - sk.x) + (z - sk.z) * (z - sk.z)));
}

function updateFx(dt) {
	var i, b, u;
	updatePuffs(fxSnow, dt); updatePuffs(fxSmoke, dt); updatePuffs(fxFire, dt);
	updateTracers(dt);
	for (i = 0; i < booms.length; i++) {
		b = booms[i];
		if (!b.mesh.visible) continue;
		b.t += dt; u = b.t / 0.45;
		if (u >= 1) { b.mesh.visible = false; continue; }
		b.mesh.scale.setScalar(b.r * (0.3 + 1.2 * Math.sqrt(u)));
		b.mesh.material.opacity = 0.9 * (1 - u);
	}
	if (chase.flash > 0) chase.flash = Math.max(0, chase.flash - dt * 2.5);
}

// ---------- models ----------

var foeGeo = {}, foeMat = null, canopyMat = null, beam = null;

// PAL: the colors of the enemies. Look 0: black suits with red. Look 1: white suits, white vehicles.
var PAL = [
	{ suit: 0x15171b, leg: 0x1b1e23, head: 0x0d0d0f, mark: 0xc8102e, gun: 0x555a60, gog: 0xff3b1f, ski: 0x101010, sled: 0xc8102e, low: 0x0d0d0f, truck: 0x3c4148, glass: 0x16222e, heli: 0x1c1f24, hglass: 0x27425e, plane: 0xe9e4d8, canopy: 0xd4202c },
	{ suit: 0xdde1e5, leg: 0xd0d5da, head: 0xe6e9ec, mark: 0xa9b1b8, gun: 0x2a2d32, gog: 0x15181b, ski: 0xb9c0c6, sled: 0xe4e8eb, low: 0x8f979e, truck: 0xe0e4e8, glass: 0x2a333b, heli: 0xc7cdd2, hglass: 0x3a4650, plane: 0xe9ecef, canopy: 0xdde1e4 }
];
var foeSets = [];

function setChaseTheme(n) {
	foeGeo = foeSets[n];
	canopyMat.color.setHex(PAL[n].canopy);
}

function makeFoeModels(P) {
	var foeGeo = {}, BLK = P.suit, DRK = P.head, RED = P.mark, GUN = P.gun, GOG = P.gog, i, sx, sz, tk = [];

	// All models look to -z. The origin of the ground models is on the snow.
	foeGeo.skier = partsGeo([
		['b', 0.09, 0.03, 1.7, -0.14, 0.015, -0.1, P.ski], ['b', 0.09, 0.03, 1.7, 0.14, 0.015, -0.1, P.ski],
		['b', 0.15, 0.5, 0.17, -0.13, 0.3, 0.03, P.leg, 0.25], ['b', 0.15, 0.5, 0.17, 0.13, 0.3, 0.03, P.leg, 0.25],
		['b', 0.4, 0.36, 0.28, 0, 0.68, 0.06, P.leg],
		['b', 0.44, 0.6, 0.27, 0, 1.12, -0.07, BLK, -0.3],
		['b', 0.23, 0.24, 0.24, 0, 1.56, -0.2, DRK], ['b', 0.2, 0.08, 0.04, 0, 1.58, -0.33, GOG],
		['b', 0.11, 0.11, 0.6, 0.27, 1.25, -0.42, BLK], ['b', 0.05, 0.12, 0.34, 0.27, 1.3, -0.82, GUN],
		['b', 0.11, 0.5, 0.11, -0.28, 1.0, -0.02, BLK, 0.4],
		['b', 0.3, 0.36, 0.14, 0, 1.18, 0.14, RED]
	]);
	// guard: stands, no skis, a rifle in two hands
	foeGeo.guard = partsGeo([
		['b', 0.16, 0.8, 0.18, -0.12, 0.4, 0, P.leg], ['b', 0.16, 0.8, 0.18, 0.12, 0.4, 0, P.leg],
		['b', 0.46, 0.65, 0.27, 0, 1.12, 0, BLK], ['b', 0.23, 0.24, 0.24, 0, 1.6, 0, DRK], ['b', 0.2, 0.08, 0.04, 0, 1.62, -0.13, GOG],
		['b', 0.1, 0.1, 0.5, 0.25, 1.2, -0.25, BLK], ['b', 0.1, 0.1, 0.5, -0.25, 1.2, -0.25, BLK], ['b', 0.06, 0.1, 0.9, 0, 1.22, -0.55, GUN],
		['b', 0.47, 0.2, 0.28, 0, 1.3, 0, RED]
	]);
	foeGeo.sled = partsGeo([
		['b', 0.95, 0.4, 2.3, 0, 0.5, 0, P.sled], ['b', 0.85, 0.3, 0.8, 0, 0.62, -1.25, P.sled, 0.35], ['b', 0.7, 0.42, 0.06, 0, 1.0, -0.75, P.glass, -0.45],
		['b', 0.13, 0.05, 1.2, -0.5, 0.03, -1.05, 0x111111], ['b', 0.13, 0.05, 1.2, 0.5, 0.03, -1.05, 0x111111],
		['b', 0.55, 0.3, 1.5, 0, 0.16, 0.45, DRK], ['b', 0.6, 0.14, 1.0, 0, 0.78, 0.45, 0x151515],
		['b', 0.42, 0.6, 0.27, 0, 1.25, 0.25, BLK, -0.35], ['b', 0.23, 0.24, 0.24, 0, 1.68, 0.08, DRK], ['b', 0.2, 0.08, 0.04, 0, 1.7, -0.05, GOG],
		['b', 0.1, 0.1, 0.6, 0.25, 1.25, -0.25, BLK], ['b', 0.1, 0.1, 0.6, -0.25, 1.25, -0.25, BLK], ['b', 0.05, 0.1, 0.4, 0.3, 1.32, -0.65, GUN]
	]);
	// truck: a box-shaped 4x4 with a triangular track unit in the position of each wheel
	tk = [
		['b', 2.3, 0.9, 4.8, 0, 1.5, 0, P.truck], ['b', 2.1, 0.8, 2.6, 0, 2.35, 0.3, P.truck],
		['b', 1.9, 0.55, 0.06, 0, 2.37, -1.02, P.glass, -0.2], ['b', 0.06, 0.5, 2.0, -1.06, 2.37, 0.3, P.glass], ['b', 0.06, 0.5, 2.0, 1.06, 2.37, 0.3, P.glass],
		['b', 2.1, 0.25, 0.3, 0, 1.2, -2.45, 0x1a1c1f], ['b', 0.3, 0.2, 0.08, -0.8, 1.65, -2.42, 0xffe9a0], ['b', 0.3, 0.2, 0.08, 0.8, 1.65, -2.42, 0xffe9a0],
		['b', 2.3, 0.12, 0.9, 0, 2.0, 1.95, RED],
		['b', 0.45, 0.6, 0.3, 0, 3.05, 0.6, BLK], ['b', 0.23, 0.24, 0.24, 0, 3.5, 0.6, DRK], ['b', 0.2, 0.08, 0.04, 0, 3.52, 0.47, GOG], ['b', 0.08, 0.1, 1.0, 0, 3.1, -0.1, GUN]
	];
	for (i = 0; i < 4; i++) {
		sx = i % 2 ? 1.25 : -1.25; sz = i < 2 ? -1.55 : 1.55;
		tk.push(['c', 0.85, 0.85, 0.55, sx, 0.43, sz, 0x0e0e0e, -Math.PI / 2, 0, Math.PI / 2, 3]);
		tk.push(['c', 0.3, 0.3, 0.62, sx, 1.0, sz, 0x777c82, 0, 0, Math.PI / 2, 8]);
	}
	foeGeo.truck = partsGeo(tk);
	// The origin of the air models is the center of the body.
	foeGeo.heli = partsGeo([
		['b', 1.9, 1.9, 3.4, 0, 0, 0, P.heli], ['b', 1.6, 1.3, 1.4, 0, -0.15, -2.2, P.heli, 0.25], ['b', 1.5, 0.9, 0.9, 0, 0.3, -1.9, P.hglass, 0.5],
		['b', 0.4, 0.45, 4.6, 0, 0.45, 3.9, P.heli], ['b', 0.12, 1.5, 0.8, 0, 1.1, 5.9, RED], ['b', 1.6, 0.1, 0.6, 0, 0.5, 5.6, P.heli],
		['b', 0.6, 0.5, 1.4, 0, 1.15, 0, 0x2a2e34], ['b', 0.14, 0.5, 0.14, 0, 1.5, 0, GUN],
		['b', 0.1, 0.1, 3.2, -0.95, -1.45, -0.2, GUN], ['b', 0.1, 0.1, 3.2, 0.95, -1.45, -0.2, GUN],
		['b', 0.08, 0.6, 0.08, -0.9, -1.15, -1.0, GUN], ['b', 0.08, 0.6, 0.08, 0.9, -1.15, -1.0, GUN], ['b', 0.08, 0.6, 0.08, -0.9, -1.15, 0.7, GUN], ['b', 0.08, 0.6, 0.08, 0.9, -1.15, 0.7, GUN],
		['b', 0.3, 0.3, 1.2, 1.1, -0.5, -0.6, GUN], ['b', 0.5, 0.5, 0.06, -0.96, 0.2, 0, RED]
	]);
	foeGeo.rotor = partsGeo([['b', 10.5, 0.06, 0.36, 0, 0, 0, BLK], ['b', 0.36, 0.06, 10.5, 0, 0, 0, BLK]]);
	foeGeo.plane = partsGeo([
		['b', 1.15, 1.2, 5.6, 0, 0, 0, P.plane], ['b', 0.9, 0.9, 1.0, 0, -0.05, -3.2, RED], ['b', 1.1, 0.6, 1.3, 0, 0.45, -1.2, P.glass],
		['b', 10.4, 0.14, 1.5, 0, 0.75, -0.9, P.plane], ['b', 1.2, 0.15, 1.52, -4.6, 0.75, -0.9, RED], ['b', 1.2, 0.15, 1.52, 4.6, 0.75, -0.9, RED],
		['b', 3.4, 0.1, 0.95, 0, 0.15, 2.6, P.plane], ['b', 0.12, 1.3, 1.0, 0, 0.8, 2.6, RED],
		['b', 0.1, 0.9, 0.1, -0.8, -0.95, -1.2, GUN], ['b', 0.1, 0.9, 0.1, 0.8, -0.95, -1.2, GUN],
		['b', 0.25, 0.06, 1.4, -0.8, -1.4, -1.2, 0x333333], ['b', 0.25, 0.06, 1.4, 0.8, -1.4, -1.2, 0x333333]
	]);
	foeGeo.prop = partsGeo([['b', 2.2, 0.18, 0.05, 0, 0, 0, BLK], ['b', 0.18, 2.2, 0.05, 0, 0, 0, BLK]]);
	foeGeo.canopy = new THREE.SphereGeometry(2.9, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2.2);
	foeGeo.canopy.scale(1, 0.62, 1);
	foeGeo.lines = partsGeo([
		['b', 0.03, 5.0, 0.03, 1.35, 3.75, 0, 0x222222, 0, 0, -0.56], ['b', 0.03, 5.0, 0.03, -1.35, 3.75, 0, 0x222222, 0, 0, 0.56],
		['b', 0.03, 5.0, 0.03, 0, 3.75, 1.35, 0x222222, 0.56, 0, 0], ['b', 0.03, 5.0, 0.03, 0, 3.75, -1.35, 0x222222, -0.56, 0, 0]
	]);
	// targets: fuel tank, radar
	foeGeo.tank = partsGeo([
		['c', 1.6, 1.6, 6.5, 0, 2.2, 0, 0xd8232a, Math.PI / 2, 0, 0, 12], ['c', 1.62, 1.62, 0.8, 0, 2.2, 0, 0xf2f2f2, Math.PI / 2, 0, 0, 12],
		['b', 2.6, 0.9, 0.5, 0, 0.45, -2.2, 0x4a4f55], ['b', 2.6, 0.9, 0.5, 0, 0.45, 2.2, 0x4a4f55]
	]);
	foeGeo.radar = partsGeo([
		['b', 3.2, 3, 3.2, 0, 1.5, 0, 0x7d858c], ['c', 0.2, 0.3, 2.4, 0, 4.2, 0, 0x4a4f55],
		['c', 2.6, 0.5, 1.0, 0, 5.6, -0.6, 0xe8ecef, 1.1, 0, 0, 12], ['b', 0.1, 0.1, 1.6, 0, 5.9, -1.4, 0x4a4f55, 1.1 - Math.PI / 2, 0, 0]
	]);
	return foeGeo;
}

function makeChase(scene) {
	var i, cv, c, g, m;
	chaseScene = scene;
	cv = document.createElement('canvas'); cv.width = cv.height = 64;
	c = cv.getContext('2d'); g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
	g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
	c.fillStyle = g; c.fillRect(0, 0, 64, 64);
	puffTex = new THREE.CanvasTexture(cv);
	fxSnow = makePuffs(scene, 300, 0.9, 0xffffff, 0.8, false, -5);
	fxSmoke = makePuffs(scene, 220, 2.6, 0x2a2a2a, 0.55, false, 1.2);
	fxFire = makePuffs(scene, 140, 1.7, 0xffa030, 0.9, true, 2);

	tr = {
		mesh: new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), TR_N),
		a: new Float32Array(TR_N * 3), d: new Float32Array(TR_N * 3), len: new Float32Array(TR_N), pos: new Float32Array(TR_N),
		spd: new Float32Array(TR_N), stk: new Float32Array(TR_N), wid: new Float32Array(TR_N), dmg: new Float32Array(TR_N), on: new Uint8Array(TR_N), next: 0
	};
	for (i = 0; i < TR_N; i++) { tr.mesh.instanceMatrix.array[i * 16 + 13] = -9999; tr.mesh.setColorAt(i, TC1.setHex(0xffffff)); }
	tr.mesh.frustumCulled = false;
	scene.add(tr.mesh);

	for (i = 0; i < 6; i++) {
		g = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
		g.visible = false; scene.add(g);
		booms.push({ mesh: g, t: 0, r: 1 });
	}
	// grenades: a dark ball, and a red ring on the snow that shows the danger area
	for (i = 0; i < 10; i++) {
		m = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshBasicMaterial({ color: 0x1c2a1c, fog: false }));
		g = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 24), new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, fog: false }));
		g.rotation.x = -Math.PI / 2;
		m.visible = g.visible = false; scene.add(m, g);
		grens.push({ mesh: m, ring: g, on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, fuse: 0, mine: false, landed: false });
	}
	// green light: the position where you must stop
	beam = new THREE.Mesh(new THREE.CylinderGeometry(30, 30, 70, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0x30ff70, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
	beam.visible = false;
	scene.add(beam);
	foeMat = new THREE.MeshLambertMaterial({ vertexColors: true });
	canopyMat = new THREE.MeshLambertMaterial({ color: 0xd4202c, side: THREE.DoubleSide });
	foeSets.push(makeFoeModels(PAL[0]), makeFoeModels(PAL[1]));
	foeGeo = foeSets[0];
}

// ---------- hits ----------

// AIM is the result of rayHit: the distance to the first enemy, target or snow, and what it is.
var AIM = { dist: 0, foe: null, prop: null, x: 0, y: 0, z: 0 };

// hitSphere gives the distance along the ray to a sphere, or -1. With aim help, the sphere gets larger with distance.
function hitSphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, help) {
	var mx = cx - ox, my = cy - oy, mz = cz - oz, tca = mx * dx + my * dy + mz * dz;
	if (tca < 0) return -1;
	var d2 = mx * mx + my * my + mz * mz - tca * tca, rr = r + help * (0.3 + 0.014 * tca);
	return d2 < rr * rr ? tca : -1;
}

// rayHit finds what a shot hits. o = start, d = direction (length 1). help: 1 = full aim help, 0 = none.
function rayHit(ox, oy, oz, dx, dy, dz, range, help) {
	var best = range, foe = null, prop = null, i, f, p, t, t0, t1, tm;
	// the snow: go along the ray in steps that get longer, then find the point more accurately
	t0 = 0;
	for (t = 3; t < range; t = t * 1.3 + 2) {
		if (oy + dy * t < groundAt(ox + dx * t, oz + dz * t)) {
			t1 = t;
			for (i = 0; i < 6; i++) { tm = (t0 + t1) / 2; if (oy + dy * tm < groundAt(ox + dx * tm, oz + dz * tm)) t1 = tm; else t0 = tm; }
			best = t1;
			break;
		}
		t0 = t;
	}
	for (i = 0; i < foes.length; i++) {
		f = foes[i];
		if (f.dead > 0) continue;
		t = hitSphere(ox, oy, oz, dx, dy, dz, f.x, f.y + f.def.cy, f.z, f.def.r, help);
		if (t < 0 && f.type == 'guard') t = hitSphere(ox, oy, oz, dx, dy, dz, f.x, f.y + 0.4, f.z, 0.5, help);    // legs
		if (t < 0 && f.air) t = hitSphere(ox, oy, oz, dx, dy, dz, f.x, f.y + 6.6, f.z, 2.6, help);               // parachute
		if (t >= 0 && t < best + 2 && (!foe && !prop || t < best)) { best = Math.min(best, t); foe = f; prop = null; }
	}
	for (i = 0; i < props.length; i++) {
		p = props[i];
		if (p.dead) continue;
		t = hitSphere(ox, oy, oz, dx, dy, dz, p.x, p.y + p.cy, p.z, p.r, help * 0.5);
		if (t >= 0 && t < best + 2 && (!foe && !prop || t < best)) { best = Math.min(best, t); prop = p; foe = null; }
	}
	AIM.dist = best; AIM.foe = foe; AIM.prop = prop;
	AIM.x = ox + dx * best; AIM.y = oy + dy * best; AIM.z = oz + dz * best;
	return AIM;
}

function addScore(n, text) {
	chase.score += n;
	chase.msg = text || '+' + n; chase.msgTime = chaseTime;
}

// hitFoe: damage to an enemy. crash = true if it hit a tree or fell into a crevasse (half the points).
function hitFoe(f, dmg, crash) {
	var i;
	if (f.dead > 0) return;
	f.hp -= dmg;
	if (!crash) for (i = 0; i < 3; i++) puff(fxFire, f.x, f.y + f.def.cy, f.z, (Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4, 0.15 + Math.random() * 0.15);
	if (f.type == 'guard') alarm(f.comp, 3);
	if (f.hp > 0) return;
	f.dead = 0.001;
	chase.kills++;
	if (!crash && chase.down == 0) chase.health = Math.min(100, chase.health + DIFF[chase.diff].heal);
	addScore(crash ? f.def.score / 2 : f.def.score, crash ? 'CRASH +' + f.def.score / 2 : '');
	if (f.type == 'skier' || f.type == 'chute' || f.type == 'guard') snowBurst(f.x, f.y, f.z, 8, 5);
	else boom(f.x, f.y + f.def.cy, f.z, f.type == 'sled' ? 2.5 : 4.5);
	if (f.part && f.type == 'chute') { chaseScene.remove(f.part); f.part = null; }
}

// hitProp: damage to a target of a base. When it is destroyed, the explosion damages the things near it.
function hitProp(p, dmg) {
	if (p.dead) return;
	p.hp -= dmg;
	puff(fxFire, p.x, p.y + p.cy, p.z, 0, 2, 0, 0.3);
	alarm(p.comp, 0);
	if (p.hp > 0) return;
	propDead(p);
	addScore(p.score, p.name + ' +' + p.score);
	explode(p.x, p.y + p.cy, p.z, 13, 14, 45, true);
}

var deadMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });

// propDead: the look of a destroyed target. It burns for 14 s.
function propDead(p) {
	p.dead = true; p.smoke = 14;
	p.mesh.rotation.z = 0.25; p.mesh.position.y -= 0.6;
	p.mesh.material = deadMat;
}

// ---------- explosions and grenades ----------

var grens = [];

// explode: r = radius. power = damage to enemies and targets. hurt = maximum damage to you.
function explode(x, y, z, r, power, hurt, big) {
	var i, f, p, dx, dy, dz, d;
	boom(x, y, z, big ? 8 : 5);
	for (i = 0; i < foes.length; i++) {
		f = foes[i];
		if (f.dead > 0) continue;
		dx = f.x - x; dy = f.y + f.def.cy - y; dz = f.z - z; d = Math.sqrt(dx * dx + dy * dy + dz * dz);
		if (d < r + f.def.r) hitFoe(f, d < r * 0.6 ? power : power / 2, false);
	}
	for (i = 0; i < props.length; i++) {
		p = props[i];
		if (p.dead) continue;
		dx = p.x - x; dy = p.y + p.cy - y; dz = p.z - z; d = Math.sqrt(dx * dx + dy * dy + dz * dz);
		if (d < r + p.r) hitProp(p, power);
	}
	dx = sk.x - x; dy = sk.y + 1 - y; dz = sk.z - z; d = Math.sqrt(dx * dx + dy * dy + dz * dz);
	if (d < r * 0.75) damagePlayer(hurt * (1 - d / (r * 0.75)));
}

// throwGrenade: mine = true for your grenade. It explodes when the fuse time is done, or when your grenade touches an enemy.
function throwGrenade(x, y, z, vx, vy, vz, fuse, mine) {
	var i, g = null;
	for (i = 0; i < grens.length; i++) if (!grens[i].on) { g = grens[i]; break; }
	if (!g) return false;
	g.on = true; g.x = x; g.y = y; g.z = z; g.vx = vx; g.vy = vy; g.vz = vz; g.fuse = fuse; g.mine = mine; g.landed = false;
	g.mesh.visible = true; g.ring.visible = false;
	return true;
}

function updateGrenades(dt) {
	var i, j, g, h, f, dx, dy, dz, hit;
	for (i = 0; i < grens.length; i++) {
		g = grens[i];
		if (!g.on) continue;
		g.fuse -= dt; hit = false;
		if (!g.landed) {
			g.vy -= 9.81 * dt;
			g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt;
			h = groundAt(g.x, g.z);
			if (g.y < h + 0.1) { g.y = h + 0.1; g.landed = true; g.vx = g.vy = g.vz = 0; snowBurst(g.x, h, g.z, 2, 2); }
			if (g.mine) {
				for (j = 0; j < foes.length; j++) {
					f = foes[j];
					if (f.dead > 0) continue;
					dx = f.x - g.x; dy = f.y + f.def.cy - g.y; dz = f.z - g.z;
					if (dx * dx + dy * dy + dz * dz < (f.def.r + 0.6) * (f.def.r + 0.6)) hit = true;
				}
			}
		}
		g.mesh.position.set(g.x, g.y, g.z);
		// the enemy grenade shows its danger area. It flashes faster when the time is almost done.
		g.ring.visible = !g.mine && Math.sin(chaseTime * (g.fuse < 0.6 ? 40 : 16)) > -0.3;
		if (g.ring.visible) { h = groundAt(g.x, g.z); g.ring.position.set(g.x, h + 0.3, g.z); g.ring.scale.setScalar(5.5); }
		if (g.fuse <= 0 || hit) {
			g.on = false; g.mesh.visible = g.ring.visible = false;
			if (g.mine) explode(g.x, g.y + 0.5, g.z, 10, 12, 30, false);
			else explode(g.x, g.y + 0.5, g.z, 8.5, 0, 38 * DIFF[chase.diff].dmg, false);
		}
	}
}

function clearGrenades() {
	for (var i = 0; i < grens.length; i++) { grens[i].on = false; grens[i].mesh.visible = grens[i].ring.visible = false; }
}

// ---------- enemy fire ----------

function damagePlayer(n) {
	if (chase.down > 0 || chase.done || !chase.on) return;
	chase.health -= n; chase.hitTime = chaseTime; chase.flash = 1;
	playerHit();
	if (chase.health <= 0) {
		chase.health = 0; chase.down = 3.5;
		chase.msg = 'YOU ARE DOWN'; chase.msgTime = chaseTime;
	}
}

// foeShot: one bullet to the position where you will be, with an error that gets larger with distance.
// spread: error factor. far: error for each meter of distance.
function foeShot(ox, oy, oz, dmg, spread, far) {
	var cx = sk.x - ox, cy = sk.y + 1.15 - oy, cz = sk.z - oz, dist = Math.sqrt(cx * cx + cy * cy + cz * cz), ft = dist / 170;
	var r = (0.45 + far * dist) * spread;
	tracer(ox, oy, oz,
		sk.x + sk.vx * ft + (Math.random() - 0.5) * 2 * r,
		sk.y + 1.15 + sk.vy * ft + (Math.random() - 0.5) * 2 * r,
		sk.z + sk.vz * ft + (Math.random() - 0.5) * 2 * r, 170, 7, 0.07, 0xffc23a, dmg * DIFF[chase.diff].dmg);
	sndShot(dist);
}

// strafe: one bullet into the snow at (x, z). It hits you if it is very near.
function strafe(f, x, z, dmg) {
	var y = groundAt(x, z), dx = x - sk.x, dz = z - sk.z;
	tracer(f.x, f.y - 1, f.z, x, y, z, 320, 10, 0.08, 0xffc23a, 0);
	snowBurst(x, y, z, 3, 4);
	if (dx * dx + dz * dz < 2.2 && sk.y - y < 2.5 && !f.hitDone) { f.hitDone = true; damagePlayer(dmg * DIFF[chase.diff].dmg); }
}

// ---------- spawn ----------

function spawnFoe(type) {
	var def = FOE[type], side = Math.random() < 0.5 ? -1 : 1, m, r = Math.random();
	var f = {
		id: ++foeCount, type: type, def: def, hp: def.hp, dead: 0, phase: Math.random() * 6.28,
		fireT: 1.5 + Math.random() * 2, grenT: type == 'skier' && Math.random() < 0.3 || type == 'sled' && Math.random() < 0.4 ? 3 + Math.random() * 4 : 1e9,
		x: 0, y: 0, z: 0, te: 0, de: 0, slotT: 0, slotD: 0, vt: 0,
		hdg: sk.hdg, pitch: 0, alt: 0, air: false, vy: 0, mesh: null, part: null, part2: null, wait: false, obT: Math.random() * 0.1, hop: 0,
		burst: 0, burstT: 0, bx: 0, bz: 0, ex: 0, ez: 0, hitDone: false, lineD: 0, lined: false, pass: 0, ramT: -9, smokeT: 0, comp: -1
	};
	if (type == 'skier' || type == 'sled') {
		if (r < 0.5) { f.te = sk.t - 45 - Math.random() * 40; f.de = sk.d + side * (4 + Math.random() * 14); }       // from behind
		else if (r < 0.8 || type == 'sled') { f.te = sk.t + 150 + Math.random() * 60; f.de = sk.d + side * (45 + Math.random() * 45); }     // from the side, in front of you
		else { f.te = sk.t + 200 + Math.random() * 80; f.de = sk.d + (Math.random() - 0.5) * 90; f.wait = true; }     // waits for you, in your way
		f.slotT = type == 'skier' ? -10 + Math.random() * 48 : -8 + Math.random() * 34;
		f.slotD = side * (4 + Math.random() * 18);
		m = new THREE.Mesh(foeGeo[type], foeMat);
	} else if (type == 'truck') {
		f.te = sk.t + 250 + Math.random() * 70; f.de = sk.d + side * 18;
		f.slotT = 22 + Math.random() * 24; f.slotD = side * (9 + Math.random() * 9);
		m = new THREE.Mesh(foeGeo.truck, foeMat);
	} else if (type == 'chute') {
		f.te = sk.t + 150 + Math.random() * 90; f.de = sk.d + (Math.random() - 0.5) * 60;
		f.slotT = 4 + Math.random() * 30; f.slotD = side * (4 + Math.random() * 16);
		f.alt = 55 + Math.random() * 40; f.air = true;
		m = new THREE.Mesh(foeGeo.skier, foeMat);
		f.part = new THREE.Group();
		f.part.add(new THREE.Mesh(foeGeo.canopy, canopyMat), new THREE.Mesh(foeGeo.lines, foeMat));
		f.part.children[0].position.y = 5.2; f.part.children[1].position.y = -0.9;
		chaseScene.add(f.part);
	} else if (type == 'heli') {
		f.x = pisteX(sk.t + 600); f.z = Z0 - (sk.t + 600); f.y = groundAt(f.x, f.z) + 170;
		m = new THREE.Mesh(foeGeo.heli, foeMat);
		f.part = new THREE.Mesh(foeGeo.rotor, foeMat); f.part.position.y = 1.78; m.add(f.part);
		f.part2 = new THREE.Mesh(foeGeo.prop, foeMat); f.part2.position.set(0.25, 1.1, 5.9); f.part2.rotation.y = Math.PI / 2; m.add(f.part2);
		f.fireT = 4;
	} else if (type == 'plane') {
		f.te = sk.t + 800; f.de = sk.d; f.alt = 75;
		m = new THREE.Mesh(foeGeo.plane, foeMat);
		f.part = new THREE.Mesh(foeGeo.prop, foeMat); f.part.position.set(0, -0.05, -3.75); m.add(f.part);
	} else {
		m = new THREE.Mesh(foeGeo.guard, foeMat);     // guard: makeBase sets the position
	}
	if (f.te) { f.de = sideLimit(f.te, f.de, def.wide || 0.5); f.x = pisteX(f.te) + f.de; f.z = Z0 - f.te; f.y = groundAt(f.x, f.z) + f.alt; }
	m.rotation.order = 'YXZ';
	m.position.set(f.x, f.y, f.z);
	f.mesh = m;
	chaseScene.add(m);
	foes.push(f);
	return f;
}

function removeFoe(f) {
	chaseScene.remove(f.mesh);
	if (f.part && f.type == 'chute') chaseScene.remove(f.part);
	foes.splice(foes.indexOf(f), 1);
}

// clearFoes removes the enemies. all = false keeps the guards of the bases.
function clearFoes(all) {
	for (var i = foes.length - 1; i >= 0; i--) if (all || foes[i].type != 'guard') removeFoe(foes[i]);
}

// ---------- enemy update ----------

var FOB = {};

// sideLimit keeps an enemy on the face. In the gully section it stays in the gully if you are in it, or on your side of it.
function sideLimit(te, de, wide) {
	var i = tIndex(te), S = PS[i] + 40, g;
	if (PWALL[i] > 0.5) {
		if (Math.abs(sk.d) < 50) { g = PGUL[i] - 1.5 - wide; return clamp(de, -g, g); }
		return sk.d > 0 ? clamp(de, 70, S) : clamp(de, -S, -70);
	}
	return clamp(de, -S, S);
}

// foeBlocked: is there a tree, rock, ice block or house at the position of this enemy? It returns the x direction to go away from it, or 0.
function foeBlocked(f, x, z) {
	var ci = Math.floor(x / TC), cj = Math.floor(z / TC), i, j, dx, dz, r, h;
	for (j = cj - 1; j <= cj + 1; j++) {
		for (i = ci - 1; i <= ci + 1; i++) {
			obstacleAt(i, j, FOB);
			if (!FOB.kind) continue;
			dx = x - FOB.x; dz = z - FOB.z; r = FOB.r + f.def.wide;
			if (dx * dx + dz * dz < r * r) return dx > 0 ? 1 : -1;
		}
	}
	for (i = 0; i < HOUSES.length; i++) {
		h = HOUSES[i];
		if (Math.abs(h.t - f.te) > 12) continue;
		dx = x - h.x; dz = z - h.z; r = h.r + f.def.wide;
		if (dx * dx + dz * dz < r * r) return dx > 0 ? 1 : -1;
	}
	return 0;
}

// Enemies on the snow: skier, snowmobile, truck, and a parachute skier after the landing.
function updateGround(f, dt) {
	var def = f.def, tt, td, nx, ny, nz, dx, dz, mv, dist, i = tIndex(f.te), side, T, tx, tz;
	if (f.dead > 0) {
		f.vt = Math.max(0, f.vt - (f.type == 'truck' ? 14 : 9) * dt);
	} else if (f.wait) {
		// this one waits on the piste and fires. It starts to move when you get near.
		f.vt = 0;
		if (sk.t > f.te - 25) { f.wait = false; f.vt = Math.max(0, -sk.vz * 0.7); }
	} else {
		tt = sk.t + f.slotT + 5 * Math.sin(chaseTime * 0.6 + f.phase);
		td = sideLimit(f.te, sk.d + f.slotD + 4 * Math.sin(chaseTime * 0.9 + f.phase * 1.7), def.wide);
		f.vt = clamp(-sk.vz + (tt - f.te) * 0.8, 0, def.vmax);
		// a truck cannot go into the gully section, between the trees or between the crevasses
		if (f.type == 'truck' && (PWALL[i] > 0.05 || PTREE[tIndex(f.te + 30)] > 0.05 || PICE[i] > 0.5)) f.vt = 0;
		f.de += clamp(td - f.de, -7, 7) * dt;
	}
	f.te += f.vt * dt;
	nx = pisteX(f.te) + f.de; nz = Z0 - f.te; ny = groundAt(nx, nz);
	dx = nx - f.x; dz = nz - f.z; mv = Math.sqrt(dx * dx + dz * dz);
	if (mv > 0.02) { f.hdg = Math.atan2(-dx, -dz); f.pitch += (Math.atan2(ny - f.y, mv) - f.pitch) * Math.min(1, dt * 8); }
	f.x = nx; f.y = ny; f.z = nz;
	if (f.hop > 0) { f.hop -= dt; ny += 6 * f.hop * (0.7 - f.hop); }
	f.mesh.position.set(nx, ny, nz);
	dx = sk.x - nx; dz = sk.z - nz; dist = Math.sqrt(dx * dx + dz * dz);

	if (f.dead > 0) {
		// skiers fall forward, snowmobiles roll, trucks stop and burn
		if (f.type == 'truck') {
			f.smokeT -= dt;
			if (f.smokeT < 0) { f.smokeT = 0.12; puff(fxSmoke, nx, ny + 2.5, nz, 0, 3, 0, 2.2); if (f.dead < 2) puff(fxFire, nx + Math.random() - 0.5, ny + 2, nz, 0, 2, 0, 0.5); }
			f.mesh.rotation.set(f.pitch, f.hdg, 0);
		} else if (f.type == 'sled') {
			f.mesh.rotation.set(f.pitch, f.hdg, Math.min(f.dead * 7, 9.4));
			f.mesh.position.y = ny + Math.max(0, 5 * f.dead - 5 * f.dead * f.dead) + 0.5;
		} else {
			f.mesh.rotation.set(-Math.min(1.5, f.dead * 5), f.hdg, 0.4);
			if (f.vt > 2 && Math.random() < 0.3) puff(fxSnow, nx, ny + 0.3, nz, 0, 2, 0, 0.5);
		}
		return;
	}
	if (f.wait) f.hdg = Math.atan2(-dx, -dz);
	f.mesh.rotation.set(f.wait ? 0 : f.pitch, f.hdg, f.wait ? 0 : clamp((sk.d + f.slotD - f.de) * -0.03, -0.3, 0.3));
	if ((f.type == 'sled' || f.type == 'truck') && f.vt > 4 && Math.random() < 0.25) puff(fxSnow, nx, ny + 0.3, nz, (Math.random() - 0.5) * 2, 1.5, (Math.random() - 0.5) * 2, 0.6);

	// obstacles and crevasses, 10 times each second
	f.obT -= dt;
	if (f.obT < 0 && f.vt > 3) {
		f.obT = 0.1;
		side = foeBlocked(f, nx, nz);
		if (side) {
			if (Math.random() < (f.type == 'sled' ? 0.6 : f.type == 'truck' ? 1 : 0.2)) { hitFoe(f, 99, true); return; }
			f.de += side * (1.5 + def.wide); f.slotD += side * 3;       // a quick move to the side
		}
		if (PICE[i] > 0.5 && f.hop <= 0 && crevAt(f.te + f.vt * 0.15, f.de) > 0.5) {
			if (Math.random() < (f.type == 'sled' ? 0.45 : f.type == 'truck' ? 1 : 0.08)) { hitFoe(f, 99, true); f.mesh.visible = false; return; }
			f.hop = 0.7;                                                // it jumps across
		}
	}

	// truck: do not touch it
	if (f.type == 'truck' && dist < 3.3 && Math.abs(sk.y - ny) < 3 && chaseTime - f.ramT > 1) {
		f.ramT = chaseTime;
		sk.vx = sk.vx * 0.4 - dx / dist * 3; sk.vz = sk.vz * 0.4 - dz / dist * 3;
		damagePlayer(12);
	}
	if (chase.down > 0) return;
	// fire: each shot uses one unit of the fire budget of the director
	f.fireT -= dt;
	if (f.fireT < 0 && dist < 120) {
		if (chase.budget < 1) f.fireT = 0.25;
		else {
			chase.budget--;
			f.fireT = def.fire[0] + Math.random() * (def.fire[1] - def.fire[0]);
			foeShot(nx, ny + def.cy + 0.3, nz, def.dmg, f.type == 'truck' ? 0.8 : 1, 0.022);
		}
	}
	// grenade: thrown to the position where you will be in 1.3 seconds
	f.grenT -= dt;
	if (f.grenT < 0 && dist < 60 && dist > 9) {
		f.grenT = 5 + Math.random() * 5;
		T = 1.3; tx = sk.x + sk.vx * (T + 0.5); tz = sk.z + sk.vz * (T + 0.5);
		throwGrenade(nx, ny + 1.6, nz, (tx - nx) / T, (groundAt(tx, tz) - ny - 1.6) / T + 4.9 * T, (tz - nz) / T, 2.4, false);
	}
}

function updateChute(f, dt) {
	var dx, dz, dist;
	f.te += Math.max(4, -sk.vz * 0.8) * dt;
	f.de += clamp(sk.d + f.slotD - f.de, -3, 3) * dt;
	if (f.dead > 0) { f.vy -= 12 * dt; f.alt += f.vy * dt; } else f.alt -= 8 * dt;
	f.x = pisteX(f.te) + f.de; f.z = Z0 - f.te;
	f.y = groundAt(f.x, f.z) + Math.max(0, f.alt);
	f.mesh.position.set(f.x, f.y, f.z);
	if (f.dead > 0) f.mesh.rotation.set(f.dead * 4, f.hdg, 0);
	else {
		f.hdg = Math.atan2(-(sk.x - f.x), -(sk.z - f.z));
		f.mesh.rotation.set(0, f.hdg, 0.12 * Math.sin(chaseTime * 1.5 + f.phase));
		f.part.position.set(f.x, f.y, f.z); f.part.rotation.z = f.mesh.rotation.z;
	}
	if (f.alt <= 0) {
		// landing: from this point it is a skier
		f.air = false; f.alt = 0;
		if (f.part) { chaseScene.remove(f.part); f.part = null; }
		if (f.dead > 0) snowBurst(f.x, f.y, f.z, 8, 5);
		else { f.hdg = pisteDir(f.te); f.vt = -sk.vz * 0.8; }
		return;
	}
	if (f.dead > 0 || chase.down > 0) return;
	dx = sk.x - f.x; dz = sk.z - f.z; dist = Math.sqrt(dx * dx + dz * dz);
	f.fireT -= dt;
	if (f.fireT < 0 && dist < 130 && chase.budget >= 1) {
		chase.budget--;
		f.fireT = f.def.fire[0] + Math.random() * (f.def.fire[1] - f.def.fire[0]);
		foeShot(f.x, f.y + 1.3, f.z, f.def.dmg, 1.2, 0.022);
	}
}

// fallAir: a helicopter or airplane that was shot down. It returns true when it hits the snow.
function fallAir(f, dt, spin) {
	f.vy -= 9 * dt;
	f.y += f.vy * dt;
	f.x += -Math.sin(f.hdg) * f.vt * dt; f.z += -Math.cos(f.hdg) * f.vt * dt;
	f.mesh.position.set(f.x, f.y, f.z);
	f.mesh.rotation.y += spin * dt; f.mesh.rotation.x -= 0.4 * dt;
	f.smokeT -= dt;
	if (f.smokeT < 0) { f.smokeT = 0.07; puff(fxSmoke, f.x, f.y, f.z, 0, 2, 0, 1.8); puff(fxFire, f.x, f.y, f.z, 0, 1, 0, 0.3); }
	if (f.y > groundAt(f.x, f.z) + 1.5) return false;
	explode(f.x, f.y, f.z, 12, 12, 30, true);
	return true;
}

function updateHeli(f, dt) {
	var tx, ty, tz, k, dx, dz, dist, px, pz, l, u;
	f.part.rotation.y += 32 * dt; f.part2.rotation.x += 50 * dt;
	if (f.dead > 0) return fallAir(f, dt, 5);
	// position: in front of you, to your left or right, 30 m above the snow
	tx = pisteX(sk.t + 80) + sk.d + 38 * Math.sin(chaseTime * 0.22 + f.phase); tz = Z0 - (sk.t + 80);
	ty = groundAt(tx, tz) + (inGully(sk.t + 80, sk.d) ? 60 : 30) + 5 * Math.sin(chaseTime * 0.5);
	k = 1 - Math.exp(-dt * 0.9);
	dx = (tx - f.x) * k; dz = (tz - f.z) * k;
	f.vt = Math.sqrt(dx * dx + dz * dz) / dt; f.hdg = Math.atan2(-dx, -dz);
	f.x += dx; f.y += (ty - f.y) * k; f.z += dz;
	f.mesh.position.set(f.x, f.y, f.z);
	dx = sk.x - f.x; dz = sk.z - f.z; dist = Math.sqrt(dx * dx + dz * dz);
	f.mesh.rotation.set(-0.1, Math.atan2(-dx, -dz), 0.1 * Math.sin(chaseTime * 0.22 + f.phase));
	if (f.hp < 6 && Math.random() < 0.2) puff(fxSmoke, f.x, f.y + 1, f.z, 0, 2, 0, 1.5);

	// fire: a line of bullets in the snow that comes to the position where you will be
	if (f.burst > 0) {
		f.burstT -= dt;
		if (f.burstT < 0) {
			f.burstT = 0.08; u = (13 - f.burst) / 9;
			strafe(f, lerp(f.bx, f.ex, u) + (Math.random() - 0.5) * 0.6, lerp(f.bz, f.ez, u) + (Math.random() - 0.5) * 0.6, f.def.dmg);
			sndShot(dist);
			f.burst--;
		}
		return false;
	}
	f.fireT -= dt;
	if (f.fireT < 0 && dist < 220 && chase.down == 0) {
		f.fireT = f.def.fire[0] + Math.random() * (f.def.fire[1] - f.def.fire[0]);
		f.burst = 13; f.burstT = 0; f.hitDone = false;
		f.ex = sk.x + sk.vx * 0.75; f.ez = sk.z + sk.vz * 0.75;       // end: your position in 0.75 s
		px = f.x - f.ex; pz = f.z - f.ez; l = Math.sqrt(px * px + pz * pz) || 1;
		f.bx = f.ex + px / l * 22; f.bz = f.ez + pz / l * 22;         // start: 22 m nearer to the helicopter
	}
	return false;
}

function updatePlane(f, dt) {
	var gap, ti, wantAlt;
	f.part.rotation.z += 60 * dt;
	if (f.dead > 0) return fallAir(f, dt, 1.5);
	// it flies up the mountain, to you, then goes over you
	f.te -= 52 * dt;
	gap = f.te - sk.t;
	if (gap < 380 && !f.lined) { f.lined = true; f.lineD = sk.d; f.hitDone = false; }
	if (f.lined) f.de += clamp(f.lineD - f.de, -12, 12) * dt;
	wantAlt = gap > 500 ? 75 : gap > -80 ? 26 : 90;
	f.alt += clamp(wantAlt - f.alt, -22, 22) * dt;
	f.x = pisteX(f.te) + f.de; f.z = Z0 - f.te; f.y = groundAt(f.x, f.z) + f.alt;
	f.hdg = pisteDir(f.te) + Math.PI; f.vt = 52;
	f.mesh.position.set(f.x, f.y, f.z);
	f.mesh.rotation.set(0, f.hdg, 0.15 * Math.sin(chaseTime * 0.8));
	if (f.hp < 4 && Math.random() < 0.3) puff(fxSmoke, f.x, f.y, f.z, 0, 1, 0, 1.5);

	// fire: a line of bullets down the mountain, at the side position that you had when it started
	if (f.lined && gap < 330 && gap > 60 && chase.down == 0) {
		f.burstT -= dt;
		if (f.burstT < 0) {
			f.burstT = 0.06; ti = f.te - 85;
			strafe(f, pisteX(ti) + f.lineD + (Math.random() - 0.5) * 0.8, Z0 - ti, f.def.dmg);
			if (Math.random() < 0.4) sndShot(Math.abs(gap));
		}
	}
	if (gap < -450) {
		f.pass++; f.lined = false;
		if (f.pass >= 3) return true;
		f.te = sk.t + 850; f.de = sk.d; f.alt = 75;
	}
	return false;
}

// Guard of a base: it stands in one position. After the alarm it fires at you, also from far away.
function updateGuard(f, dt) {
	var dx = sk.x - f.x, dz = sk.z - f.z, dist = Math.sqrt(dx * dx + dz * dz), a = baseAlarm[f.comp];
	if (f.dead > 0) { f.mesh.rotation.x = -Math.min(1.5, f.dead * 4); f.mesh.position.y = f.y - Math.min(f.alt, f.dead * 9); return; }
	if (dist < 130) alarm(f.comp, 0);
	if (a > 0) { f.mesh.rotation.y = Math.sin(chaseTime * 0.4 + f.phase) * 1.2 + f.phase; return; }     // no alarm: it looks around
	f.mesh.rotation.y = Math.atan2(-dx, -dz);
	if (chase.down > 0 || dist > 520) return;
	f.fireT -= dt;
	if (f.fireT < 0) {
		f.fireT = f.def.fire[0] + Math.random() * (f.def.fire[1] - f.def.fire[0]);
		foeShot(f.x, f.y + 1.3, f.z, f.def.dmg, 1 + sk.speed * 0.08, 0.009);
	}
}

// ---------- targets ----------

// baseAlarm: for each base, the seconds until the alarm. 0 = alarm. 1e9 = quiet.
var baseAlarm = [1e9, 1e9];

function alarm(comp, delay) {
	if (comp < 0 || baseAlarm[comp] <= delay) return;
	baseAlarm[comp] = delay;
}

function addProp(comp, kind, td, name, hp, r, cy, score) {
	var x = pisteX(td[0]) + td[1], z = Z0 - td[0], y = groundAt(x, z), m;
	if (kind == 'heli') {
		m = new THREE.Mesh(foeGeo.heli, foeMat); y += 2.6;
		m.add(new THREE.Mesh(foeGeo.rotor, foeMat)); m.children[0].position.y = 1.78;
	} else m = new THREE.Mesh(foeGeo[kind], foeMat);
	m.position.set(x, y - (kind == 'heli' ? 0 : 0.3), z); m.rotation.y = pisteDir(td[0]) + (kind == 'tank' ? 0.1 : 0.6);
	chaseScene.add(m);
	props.push({ comp: comp, kind: kind, name: name, x: x, y: y, z: z, r: r, cy: cy, hp: hp, score: score, dead: false, smoke: 0, mesh: m });
}

// makeBases puts the guards and the targets in the two bases.
// makeProps puts the targets in the two bases (the copilot also uses it)
function makeProps() {
	var k, i, c;
	while (props.length) chaseScene.remove(props.pop().mesh);
	for (k = 0; k < COMP.length; k++) {
		c = COMP[k];
		for (i = 0; i < c.tanks.length; i++) addProp(k, 'tank', c.tanks[i], 'TANK', 10, 2.3, 2.2, 300);
		addProp(k, 'radar', c.radar, 'RADAR', 20, 2.6, 4, 600);
		if (c.heli) addProp(k, 'heli', c.heli, 'HELICOPTER', 30, 3.3, 0, 1500);
	}
}

function makeBases() {
	var k, i, c, f, g, x, z;
	makeProps();
	for (k = 0; k < COMP.length; k++) {
		c = COMP[k]; baseAlarm[k] = 1e9;
		g = c.guards.concat(c.towers);
		for (i = 0; i < g.length; i++) {
			f = spawnFoe('guard');
			x = pisteX(g[i][0]) + g[i][1]; z = Z0 - g[i][0];
			f.alt = i >= c.guards.length ? 6.0 : 0;          // on a watchtower
			f.x = x; f.z = z; f.y = groundAt(x, z) + f.alt - (f.alt ? 0.1 : 0); f.te = g[i][0]; f.de = g[i][1]; f.comp = k;
			f.mesh.position.set(f.x, f.y, f.z);
		}
	}
}

function updateProps(dt) {
	var i, p;
	for (i = 0; i < props.length; i++) {
		p = props[i];
		if (!p.dead && p.kind == 'heli' && baseAlarm[p.comp] <= 0) p.mesh.children[0].rotation.y += 12 * dt;
		if (p.smoke <= 0) continue;
		p.smoke -= dt;
		if (Math.random() < 0.3) puff(fxSmoke, p.x + (Math.random() - 0.5) * 2, p.y + p.cy, p.z, 0, 3, 0, 2.5);
		if (Math.random() < 0.15) puff(fxFire, p.x + (Math.random() - 0.5) * 2, p.y + p.cy, p.z, 0, 2, 0, 0.5);
	}
	for (i = 0; i < baseAlarm.length; i++) if (baseAlarm[i] > 0 && baseAlarm[i] < 1e8) baseAlarm[i] = Math.max(0, baseAlarm[i] - dt);
}

function countGuards(comp) { var n = 0, i; for (i = 0; i < foes.length; i++) if (foes[i].type == 'guard' && foes[i].comp == comp && foes[i].dead == 0) n++; return n; }
function countProps(comp) { var n = 0, i; for (i = 0; i < props.length; i++) if (props[i].comp == comp && !props[i].dead) n++; return n; }

// ---------- director ----------

// The director keeps a number of enemies around you at all times. The number comes from the heat and the difficulty.
function updateDirector(dt) {
	var D = DIFF[chase.diff], heat = chase.heat, i, n = 0, nHeli = 0, nPlane = 0, nTruck = 0, r, type, k = tIndex(sk.t), gully = inGully(sk.t, sk.d), k2 = tIndex(sk.t + 280), truckOk;
	for (i = 0; i < foes.length; i++) {
		if (foes[i].dead > 0) continue;
		type = foes[i].type;
		if (type == 'heli') nHeli++; else if (type == 'plane') nPlane++; else if (type != 'guard') { n++; if (type == 'truck') nTruck++; }
	}
	// the enemies fire more when there are more of them. If you shoot them, the fire decreases.
	chase.budget = Math.min(3, chase.budget + D.rate * Math.min(1.3, n / D.n) * dt);
	if (heat <= 0 || sk.t < chase.graceT || sk.t > T_END - 150 || !sk.moving) return;
	chase.spawnT -= dt;
	if (n < Math.round(D.n * heat) && chase.spawnT <= 0) {
		chase.spawnT = (1.0 + Math.random() * 1.2) / Math.max(heat, 0.5) * D.wait;
		r = Math.random();
		if (gully) type = r < 0.85 ? 'skier' : 'chute';                                   // gully
		else if (PTREE[k] > 0.05) type = r < 0.65 ? 'skier' : r < 0.85 ? 'sled' : 'chute';   // trees
		else if (PICE[k] > 0.5) type = r < 0.5 ? 'skier' : r < 0.85 ? 'sled' : 'chute';       // glacier
		else {
			truckOk = nTruck < 3 && PWALL[k2] < 0.05 && PWALL[k] < 0.05 && PTREE[k2] < 0.05 && PICE[k2] < 0.5;     // a truck needs open snow with no trees
			type = r < 0.45 ? 'skier' : r < 0.7 ? 'sled' : r < 0.82 ? 'chute' : truckOk ? 'truck' : 'skier';
		}
		spawnFoe(type);
	}
	chase.heliT -= dt * heat; chase.planeT -= dt * heat;
	if (chase.heliT < 0 && nHeli < (chase.diff == 2 ? 2 : 1)) { chase.heliT = 50 + Math.random() * 25; spawnFoe('heli'); chase.msg = 'HELICOPTER'; chase.msgTime = chaseTime; }
	if (chase.planeT < 0 && nPlane == 0 && !gully) { chase.planeT = 65 + Math.random() * 30; spawnFoe('plane'); chase.msg = 'AIRPLANE'; chase.msgTime = chaseTime; }
}

// ---------- mission ----------

function setStage(i) {
	var s = STAGES[i], c;
	chase.stage = i; chase.text = s.text; chase.heat = s.heat;
	chase.msg = s.text; chase.msgTime = chaseTime + 1.5;
	if (s.k == 'ski') { chase.checkT = Math.max(sk.t, chase.startT); chase.checkStage = i; }
	if (s.k == 'stop') {
		c = COMP[s.comp];
		chase.checkT = c.over - 125; chase.checkStage = i;
		clearFoes(false);                       // the chasers lose you
	}
}

function updateMission(dt) {
	var s = STAGES[chase.stage], c = s.comp == null ? null : COMP[s.comp], next = false, x, z;
	beam.visible = false; chase.left = 0;
	if (s.k == 'ski') next = sk.t >= s.to && s.to < T_END;
	else if (s.k == 'stop') {
		x = pisteX(c.over + 2); z = Z0 - c.over - 2;
		beam.visible = true; beam.position.set(x, groundAt(x, z) + 30, z);
		if (Math.abs(sk.t - c.over - 2) < 10 && Math.abs(sk.d) < 32 && sk.speed < 1.2) { next = true; addScore(500, 'IN POSITION'); }
		if (sk.t > c.over + 45) { chase.stage++; next = true; alarm(s.comp, 0); }     // you went past it: no sniper stage
	} else if (s.k == 'snipe') {
		chase.left = countGuards(s.comp);
		if (chase.left == 0) { next = true; addScore(1000, 'GUARDS DOWN +1000'); }
		if (sk.t > c.over + 45) { next = true; alarm(s.comp, 0); }
	} else if (s.k == 'destroy') {
		chase.left = countProps(s.comp);
		if (baseAlarm[s.comp] > 60) alarm(s.comp, 25);
		chase.heat = baseAlarm[s.comp] <= 0 ? s.heat : 0;
		if (chase.left == 0) { next = true; addScore(1500, 'BASE DESTROYED +1500'); }
		else if (sk.t > c.t1 + 90 && chase.down == 0) { chase.msg = 'YOU DID NOT DESTROY THE TARGETS'; chase.msgTime = chaseTime; chase.down = 2.5; }
	}
	if (next && chase.stage < STAGES.length - 1) setStage(chase.stage + 1);
}

// startChase: mode = 'chase' or 'mission'. diff = 0, 1, 2.
function startChase(t0, mode, diff) {
	clearFoes(true); clearGrenades();
	chase.on = true; chase.done = false; chase.mode = mode; chase.diff = diff;
	chase.score = 0; chase.kills = 0; chase.health = 100;
	chase.startT = t0; chase.graceT = t0 + 60; chase.checkT = t0; chase.checkStage = 0; chase.down = 0;
	chase.spawnT = 0; chase.heliT = 35; chase.planeT = 55; chase.budget = 0; chase.left = 0;
	makeBases();
	if (mode == 'mission') setStage(0);
	else { chase.heat = 0.8; chase.text = 'GET TO THE VILLAGE'; chase.msg = 'THEY ARE BEHIND YOU'; chase.msgTime = chaseTime; }
}

function stopChase() {
	clearFoes(true); clearGrenades();
	while (props.length) chaseScene.remove(props.pop().mesh);
	beam.visible = false;
	chase.on = false;
}

// endChase: you are at the finish line.
function endChase() {
	var i;
	for (i = 0; i < foes.length; i++) if (foes[i].dead == 0 && foes[i].type != 'guard') boom(foes[i].x, foes[i].y + 1, foes[i].z, 3);
	clearFoes(true); clearGrenades();
	chase.done = true;
	chase.score += Math.round(chase.health) * 10;
}

// respawnChase: you were down. Start again at the last checkpoint.
function respawnChase() {
	clearFoes(false); clearGrenades();
	resetSki(chase.checkT);
	chase.health = 100; chase.graceT = sk.t + 70;
	chase.score = Math.max(0, chase.score - 500);
	chase.respawns++;
	if (chase.mode == 'mission') setStage(chase.checkStage);
	else { chase.msg = 'GO'; chase.msgTime = chaseTime; }
}

// ---------- update ----------

function updateChase(dt) {
	var i, f, gone;
	chaseTime += dt;
	if (!chase.on || chase.done) return;
	if (chase.down > 0) {
		chase.down -= dt;
		if (chase.down <= 0) { chase.down = 0; respawnChase(); }
	}
	if (chaseTime - chase.hitTime > 5 && chase.health < 100 && chase.down == 0) chase.health = Math.min(100, chase.health + 3 * dt);

	// each new section of the mountain is a checkpoint
	i = SEC[PSEC[tIndex(sk.t)]][0];
	if (i > chase.checkT + 100 && chase.down == 0 && sk.t > i + 20 && (chase.mode == 'chase' || STAGES[chase.stage].k == 'ski')) chase.checkT = i + 10;
	if (chase.mode == 'mission') updateMission(dt);
	else chase.heat = 0.8 + 0.7 * clamp((sk.t - chase.startT) / (T_END - chase.startT), 0, 1);     // the chase gets harder on the way down
	updateDirector(dt);
	updateProps(dt);
	updateGrenades(dt);

	for (i = foes.length - 1; i >= 0; i--) {
		f = foes[i]; gone = false;
		if (f.dead > 0) f.dead += dt;
		if (f.type == 'heli') gone = updateHeli(f, dt);
		else if (f.type == 'plane') gone = updatePlane(f, dt);
		else if (f.type == 'guard') updateGuard(f, dt);
		else if (f.air) updateChute(f, dt);
		else {
			updateGround(f, dt);
			gone = f.dead > 7 || sk.t - f.te > 300 || f.te - sk.t > 700;
		}
		if (gone) removeFoe(f);
	}
}
