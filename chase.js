// chase.js - effects, the gun and the enemies of the spy chase.
// Classic script. It uses THREE, world.js and the skier state (sk) from ski.js.
//
// main.js calls makeChase() one time, updateFx() each frame, and updateChase() each frame of a chase.
// main.js supplies sndShot(), sndBoom() and playerHit().
//
// Enemies on the snow do not use the ski physics. They move in piste coordinates (t, d):
// each enemy has a slot near you (slotT ahead, slotD to the side) and goes to it.
//
// Order of this file:
//   state, effects, models, gun, enemy fire, spawn, enemy update, waves.

// ---------- state ----------

var foes = [];
var chase = {
	on: false, done: false,
	score: 0, kills: 0, health: 100, best: 0,
	wave: 0, gap: 600, startT: 0, graceT: 0,
	checkT: 0, checkWave: 0,       // where you start again when you are down
	down: 0,                       // seconds until you start again
	respawns: 0,
	hitTime: -99, flash: 0,
	msg: '', msgTime: -99
};
var chaseTime = 0;
var chaseScene = null;

// hp: hits to destroy. r: hit sphere radius. cy: hit sphere height. fire: seconds between shots (min, max).
var FOE = {
	skier: { hp: 1, r: 0.9, cy: 1.0, score: 100, fire: [1.4, 2.8], dmg: 6, vmax: 30 },
	sled:  { hp: 2, r: 1.3, cy: 0.9, score: 250, fire: [1.1, 2.2], dmg: 6, vmax: 34 },
	truck: { hp: 9, r: 2.6, cy: 1.8, score: 500, fire: [0.5, 1.0], dmg: 7, vmax: 26 },
	chute: { hp: 1, r: 1.0, cy: 1.0, score: 150, fire: [1.8, 3.2], dmg: 6, vmax: 30 },
	heli:  { hp: 10, r: 3.3, cy: 0, score: 1000, fire: [4.5, 7], dmg: 10 },
	plane: { hp: 5, r: 3.3, cy: 0, score: 800, fire: [0, 0], dmg: 14 }
};

// Each wave: type, count, type, count...
var WAVES = [
	['skier', 2], ['skier', 3], ['sled', 2], ['chute', 4],
	['heli', 1, 'skier', 2], ['truck', 2], ['plane', 1, 'sled', 2], ['chute', 4, 'skier', 3],
	['heli', 1, 'truck', 2], ['plane', 1, 'sled', 3, 'skier', 2], ['heli', 1, 'plane', 1, 'truck', 2], ['skier', 4, 'sled', 2]
];
var WAVE_TEXT = { skier: 'SKIERS', sled: 'SNOWMOBILES', truck: 'TRACKED TRUCKS', chute: 'PARACHUTES AHEAD', heli: 'HELICOPTER', plane: 'AIRPLANE' };

// ---------- effects ----------

var fxSnow = null, fxSmoke = null, fxFire = null, puffTex = null;
var TR_N = 48;
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
	var m = tr.mesh.instanceMatrix.array, i, k, j, head, tail, L, mid, dx, dy, dz, xx, xy, xz, yx, yy, yz, l, w, ex, ey, ez;
	for (i = 0; i < TR_N; i++) {
		if (!tr.on[i]) continue;
		k = i * 3; j = i * 16;
		tr.pos[i] += tr.spd[i] * dt;
		if (tr.pos[i] - tr.stk[i] >= tr.len[i]) {
			tr.on[i] = 0; m[j] = m[j + 5] = m[j + 10] = 0; m[j + 13] = -9999;
			continue;
		}
		if (tr.dmg[i] > 0 && tr.pos[i] >= tr.len[i]) {
			ex = tr.a[k] + tr.d[k] * tr.len[i] - sk.x; ey = tr.a[k + 1] + tr.d[k + 1] * tr.len[i] - (sk.y + 1.15); ez = tr.a[k + 2] + tr.d[k + 2] * tr.len[i] - sk.z;
			if (ex * ex + ey * ey + ez * ez < 0.4) damagePlayer(tr.dmg[i]);
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

var foeGeo = {}, foeMat = null, canopyMat = null;

function makeFoeModels() {
	var BLK = 0x15171b, DRK = 0x0d0d0f, RED = 0xc8102e, GUN = 0x555a60, GOG = 0xff3b1f, i, sx, sz, tk = [];
	foeMat = new THREE.MeshLambertMaterial({ vertexColors: true });
	canopyMat = new THREE.MeshLambertMaterial({ color: 0xd4202c, side: THREE.DoubleSide });

	// All models look to -z. The origin of the ground models is on the snow.
	foeGeo.skier = partsGeo([
		['b', 0.09, 0.03, 1.7, -0.14, 0.015, -0.1, 0x101010], ['b', 0.09, 0.03, 1.7, 0.14, 0.015, -0.1, 0x101010],
		['b', 0.15, 0.5, 0.17, -0.13, 0.3, 0.03, 0x1b1e23, 0.25], ['b', 0.15, 0.5, 0.17, 0.13, 0.3, 0.03, 0x1b1e23, 0.25],
		['b', 0.4, 0.36, 0.28, 0, 0.68, 0.06, 0x1b1e23],
		['b', 0.44, 0.6, 0.27, 0, 1.12, -0.07, BLK, -0.3],
		['b', 0.23, 0.24, 0.24, 0, 1.56, -0.2, DRK], ['b', 0.2, 0.08, 0.04, 0, 1.58, -0.33, GOG],
		['b', 0.11, 0.11, 0.6, 0.27, 1.25, -0.42, BLK], ['b', 0.05, 0.12, 0.34, 0.27, 1.3, -0.82, GUN],
		['b', 0.11, 0.5, 0.11, -0.28, 1.0, -0.02, BLK, 0.4],
		['b', 0.3, 0.36, 0.14, 0, 1.18, 0.14, RED]
	]);
	foeGeo.sled = partsGeo([
		['b', 0.95, 0.4, 2.3, 0, 0.5, 0, RED], ['b', 0.85, 0.3, 0.8, 0, 0.62, -1.25, RED, 0.35], ['b', 0.7, 0.42, 0.06, 0, 1.0, -0.75, 0x1d2b3a, -0.45],
		['b', 0.13, 0.05, 1.2, -0.5, 0.03, -1.05, 0x111111], ['b', 0.13, 0.05, 1.2, 0.5, 0.03, -1.05, 0x111111],
		['b', 0.55, 0.3, 1.5, 0, 0.16, 0.45, DRK], ['b', 0.6, 0.14, 1.0, 0, 0.78, 0.45, 0x151515],
		['b', 0.42, 0.6, 0.27, 0, 1.25, 0.25, BLK, -0.35], ['b', 0.23, 0.24, 0.24, 0, 1.68, 0.08, DRK], ['b', 0.2, 0.08, 0.04, 0, 1.7, -0.05, GOG],
		['b', 0.1, 0.1, 0.6, 0.25, 1.25, -0.25, BLK], ['b', 0.1, 0.1, 0.6, -0.25, 1.25, -0.25, BLK], ['b', 0.05, 0.1, 0.4, 0.3, 1.32, -0.65, GUN]
	]);
	// truck: a box-shaped 4x4 with a triangular track unit in the position of each wheel
	tk = [
		['b', 2.3, 0.9, 4.8, 0, 1.5, 0, 0x3c4148], ['b', 2.1, 0.8, 2.6, 0, 2.35, 0.3, 0x3c4148],
		['b', 1.9, 0.55, 0.06, 0, 2.37, -1.02, 0x16222e, -0.2], ['b', 0.06, 0.5, 2.0, -1.06, 2.37, 0.3, 0x16222e], ['b', 0.06, 0.5, 2.0, 1.06, 2.37, 0.3, 0x16222e],
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
		['b', 1.9, 1.9, 3.4, 0, 0, 0, 0x1c1f24], ['b', 1.6, 1.3, 1.4, 0, -0.15, -2.2, 0x1c1f24, 0.25], ['b', 1.5, 0.9, 0.9, 0, 0.3, -1.9, 0x27425e, 0.5],
		['b', 0.4, 0.45, 4.6, 0, 0.45, 3.9, 0x1c1f24], ['b', 0.12, 1.5, 0.8, 0, 1.1, 5.9, RED], ['b', 1.6, 0.1, 0.6, 0, 0.5, 5.6, 0x1c1f24],
		['b', 0.6, 0.5, 1.4, 0, 1.15, 0, 0x2a2e34], ['b', 0.14, 0.5, 0.14, 0, 1.5, 0, GUN],
		['b', 0.1, 0.1, 3.2, -0.95, -1.45, -0.2, GUN], ['b', 0.1, 0.1, 3.2, 0.95, -1.45, -0.2, GUN],
		['b', 0.08, 0.6, 0.08, -0.9, -1.15, -1.0, GUN], ['b', 0.08, 0.6, 0.08, 0.9, -1.15, -1.0, GUN], ['b', 0.08, 0.6, 0.08, -0.9, -1.15, 0.7, GUN], ['b', 0.08, 0.6, 0.08, 0.9, -1.15, 0.7, GUN],
		['b', 0.3, 0.3, 1.2, 1.1, -0.5, -0.6, GUN], ['b', 0.5, 0.5, 0.06, -0.96, 0.2, 0, RED]
	]);
	foeGeo.rotor = partsGeo([['b', 10.5, 0.06, 0.36, 0, 0, 0, BLK], ['b', 0.36, 0.06, 10.5, 0, 0, 0, BLK]]);
	foeGeo.plane = partsGeo([
		['b', 1.15, 1.2, 5.6, 0, 0, 0, 0xe9e4d8], ['b', 0.9, 0.9, 1.0, 0, -0.05, -3.2, RED], ['b', 1.1, 0.6, 1.3, 0, 0.45, -1.2, 0x1d2b3a],
		['b', 10.4, 0.14, 1.5, 0, 0.75, -0.9, 0xe9e4d8], ['b', 1.2, 0.15, 1.52, -4.6, 0.75, -0.9, RED], ['b', 1.2, 0.15, 1.52, 4.6, 0.75, -0.9, RED],
		['b', 3.4, 0.1, 0.95, 0, 0.15, 2.6, 0xe9e4d8], ['b', 0.12, 1.3, 1.0, 0, 0.8, 2.6, RED],
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
}

function makeChase(scene) {
	var i, cv, c, g;
	chaseScene = scene;
	cv = document.createElement('canvas'); cv.width = cv.height = 64;
	c = cv.getContext('2d'); g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
	g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
	c.fillStyle = g; c.fillRect(0, 0, 64, 64);
	puffTex = new THREE.CanvasTexture(cv);
	fxSnow = makePuffs(scene, 260, 0.9, 0xffffff, 0.8, false, -5);
	fxSmoke = makePuffs(scene, 160, 2.6, 0x2a2a2a, 0.55, false, 1.2);
	fxFire = makePuffs(scene, 100, 1.7, 0xffa030, 0.9, true, 2);

	tr = {
		mesh: new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), TR_N),
		a: new Float32Array(TR_N * 3), d: new Float32Array(TR_N * 3), len: new Float32Array(TR_N), pos: new Float32Array(TR_N),
		spd: new Float32Array(TR_N), stk: new Float32Array(TR_N), wid: new Float32Array(TR_N), dmg: new Float32Array(TR_N), on: new Uint8Array(TR_N), next: 0
	};
	for (i = 0; i < TR_N; i++) { tr.mesh.instanceMatrix.array[i * 16 + 13] = -9999; tr.mesh.setColorAt(i, TC1.setHex(0xffffff)); }
	tr.mesh.frustumCulled = false;
	scene.add(tr.mesh);

	for (i = 0; i < 4; i++) {
		g = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
		g.visible = false; scene.add(g);
		booms.push({ mesh: g, t: 0, r: 1 });
	}
	makeFoeModels();
}

// ---------- gun ----------

// AIM is the result of gunAim: the distance to the first enemy or to the snow, and the enemy.
var AIM = { dist: 0, foe: null, x: 0, y: 0, z: 0 };

// hitSphere gives the distance along the ray to a sphere, or -1. The sphere gets larger with distance (aim help).
function hitSphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
	var mx = cx - ox, my = cy - oy, mz = cz - oz, tca = mx * dx + my * dy + mz * dz;
	if (tca < 0) return -1;
	var d2 = mx * mx + my * my + mz * mz - tca * tca, rr = r + 0.3 + 0.014 * tca;
	return d2 < rr * rr ? tca : -1;
}

function gunAim(ox, oy, oz, dx, dy, dz) {
	var best = 400, foe = null, i, f, t, t0, t1, tm;
	// the snow: go along the ray in steps that get longer, then find the point more accurately
	t0 = 0;
	for (t = 3; t < 400; t = t * 1.3 + 2) {
		if (oy + dy * t < groundAt(ox + dx * t, oz + dz * t)) {
			t1 = t;
			for (i = 0; i < 5; i++) { tm = (t0 + t1) / 2; if (oy + dy * tm < groundAt(ox + dx * tm, oz + dz * tm)) t1 = tm; else t0 = tm; }
			best = t1;
			break;
		}
		t0 = t;
	}
	for (i = 0; i < foes.length; i++) {
		f = foes[i];
		if (f.dead > 0) continue;
		t = hitSphere(ox, oy, oz, dx, dy, dz, f.x, f.y + f.def.cy, f.z, f.def.r);
		if (t < 0 && f.air) t = hitSphere(ox, oy, oz, dx, dy, dz, f.x, f.y + 6.6, f.z, 2.6);   // parachute
		if (t >= 0 && t < best + 2) { if (!foe || t < best) { best = Math.min(best, t); foe = f; } }
	}
	AIM.dist = best; AIM.foe = foe;
	AIM.x = ox + dx * best; AIM.y = oy + dy * best; AIM.z = oz + dz * best;
	return AIM;
}

// fireGun is your shot. o = position of the gun, d = direction (length 1).
function fireGun(ox, oy, oz, dx, dy, dz) {
	gunAim(ox, oy, oz, dx, dy, dz);
	tracer(ox + dx * 0.3, oy + dy * 0.3, oz + dz * 0.3, AIM.x, AIM.y, AIM.z, 500, 14, 0.035, 0xfff2b0, 0);
	if (AIM.foe) hitFoe(AIM.foe, AIM.x, AIM.y, AIM.z);
	else if (AIM.dist < 399) snowBurst(AIM.x, AIM.y, AIM.z, 3, 3);
}

function hitFoe(f, x, y, z) {
	var i;
	f.hp--;
	for (i = 0; i < 3; i++) puff(fxFire, x, y, z, (Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4, 0.15 + Math.random() * 0.15);
	if (f.hp > 0) return;
	f.dead = 0.001;
	chase.score += f.def.score; chase.kills++;
	chase.msg = '+' + f.def.score; chase.msgTime = chaseTime;
	if (f.type == 'skier' || f.type == 'chute') snowBurst(f.x, f.y, f.z, 8, 5);
	else boom(f.x, f.y + f.def.cy, f.z, f.type == 'sled' ? 2.5 : 4.5);
	if (f.part && f.type == 'chute') { chaseScene.remove(f.part); f.part = null; }
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
function foeShot(ox, oy, oz, dmg, spread) {
	var cx = sk.x - ox, cy = sk.y + 1.15 - oy, cz = sk.z - oz, dist = Math.sqrt(cx * cx + cy * cy + cz * cz), ft = dist / 170;
	var r = (0.45 + 0.022 * dist) * spread;
	tracer(ox, oy, oz,
		sk.x + sk.vx * ft + (Math.random() - 0.5) * 2 * r,
		sk.y + 1.15 + sk.vy * ft + (Math.random() - 0.5) * 2 * r,
		sk.z + sk.vz * ft + (Math.random() - 0.5) * 2 * r, 170, 7, 0.07, 0xffc23a, dmg);
	sndShot(dist);
}

// strafe: one bullet into the snow at (x, z). It hits you if it is very near.
function strafe(f, x, z, dmg) {
	var y = groundAt(x, z), dx = x - sk.x, dz = z - sk.z;
	tracer(f.x, f.y - 1, f.z, x, y, z, 320, 10, 0.08, 0xffc23a, 0);
	snowBurst(x, y, z, 3, 4);
	if (dx * dx + dz * dz < 2.2 && sk.y - y < 2.5 && !f.hitDone) { f.hitDone = true; damagePlayer(dmg); }
}

// ---------- spawn ----------

function spawnFoe(type) {
	var def = FOE[type], side = Math.random() < 0.5 ? -1 : 1, m;
	var f = {
		type: type, def: def, hp: def.hp, dead: 0, phase: Math.random() * 6.28,
		fireT: 1.5 + Math.random() * 2, x: 0, y: 0, z: 0, te: 0, de: 0, slotT: 0, slotD: 0, vt: 0,
		hdg: sk.hdg, pitch: 0, alt: 0, air: false, vy: 0, mesh: null, part: null, part2: null,
		burst: 0, burstT: 0, bx: 0, bz: 0, ex: 0, ez: 0, hitDone: false, lineD: 0, lined: false, pass: 0, ramT: -9, smokeT: 0
	};
	if (type == 'skier' || type == 'sled') {
		if (Math.random() < 0.6) { f.te = sk.t - 45 - Math.random() * 35; f.de = clamp(sk.d + side * (10 + Math.random() * 14), -34, 34); }
		else { f.te = sk.t + 150 + Math.random() * 40; f.de = side * 35; }
		f.slotT = type == 'skier' ? 6 + Math.random() * 30 : -4 + Math.random() * 28;
		f.slotD = side * (7 + Math.random() * 15);
		m = new THREE.Mesh(foeGeo[type], foeMat);
	} else if (type == 'truck') {
		f.te = sk.t + 250 + Math.random() * 70; f.de = side * 18;
		f.slotT = 26 + Math.random() * 22; f.slotD = side * (10 + Math.random() * 8);
		m = new THREE.Mesh(foeGeo.truck, foeMat);
	} else if (type == 'chute') {
		f.te = sk.t + 150 + Math.random() * 90; f.de = (Math.random() - 0.5) * 60;
		f.slotT = 8 + Math.random() * 28; f.slotD = side * (7 + Math.random() * 15);
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
		f.fireT = 5;
	} else {
		f.te = sk.t + 800; f.de = 0; f.alt = 75;
		m = new THREE.Mesh(foeGeo.plane, foeMat);
		f.part = new THREE.Mesh(foeGeo.prop, foeMat); f.part.position.set(0, -0.05, -3.75); m.add(f.part);
	}
	if (f.te) { f.x = pisteX(f.te) + f.de; f.z = Z0 - f.te; f.y = groundAt(f.x, f.z) + f.alt; }
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

function clearFoes() {
	while (foes.length) removeFoe(foes[0]);
}

// ---------- enemy update ----------

// Enemies on the snow: skier, snowmobile, truck, and a parachute skier after the landing.
function updateGround(f, dt) {
	var def = f.def, tt, td, vt, nx, ny, nz, dx, dz, mv, dist;
	if (f.dead > 0) {
		f.vt = Math.max(0, f.vt - (f.type == 'truck' ? 14 : 9) * dt);
	} else {
		tt = sk.t + f.slotT + 5 * Math.sin(chaseTime * 0.6 + f.phase);
		td = clamp(sk.d + f.slotD + 4 * Math.sin(chaseTime * 0.9 + f.phase * 1.7), -PISTE_W + 3, PISTE_W - 3);
		f.vt = clamp(-sk.vz + (tt - f.te) * 0.8, 0, def.vmax);
		f.de += clamp(td - f.de, -6, 6) * dt;
	}
	f.te += f.vt * dt;
	nx = pisteX(f.te) + f.de; nz = Z0 - f.te; ny = groundAt(nx, nz);
	dx = nx - f.x; dz = nz - f.z; mv = Math.sqrt(dx * dx + dz * dz);
	if (mv > 0.02) { f.hdg = Math.atan2(-dx, -dz); f.pitch += (Math.atan2(ny - f.y, mv) - f.pitch) * Math.min(1, dt * 8); }
	f.x = nx; f.y = ny; f.z = nz;
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
	f.mesh.rotation.set(f.pitch, f.hdg, clamp((sk.d + f.slotD - f.de) * -0.03, -0.3, 0.3));
	if ((f.type == 'sled' || f.type == 'truck') && f.vt > 4 && Math.random() < 0.25) puff(fxSnow, nx, ny + 0.3, nz, (Math.random() - 0.5) * 2, 1.5, (Math.random() - 0.5) * 2, 0.6);

	// truck: do not touch it
	if (f.type == 'truck' && dist < 3.3 && Math.abs(sk.y - ny) < 3 && chaseTime - f.ramT > 1) {
		f.ramT = chaseTime;
		sk.vx = sk.vx * 0.4 - dx / dist * 3; sk.vz = sk.vz * 0.4 - dz / dist * 3;
		damagePlayer(12);
	}
	// fire
	f.fireT -= dt;
	if (f.fireT < 0 && dist < 120 && chase.down == 0) {
		f.fireT = def.fire[0] + Math.random() * (def.fire[1] - def.fire[0]);
		foeShot(nx, ny + def.cy + 0.3, nz, def.dmg, f.type == 'truck' ? 0.8 : 1);
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
	if (f.dead > 0) return;
	dx = sk.x - f.x; dz = sk.z - f.z; dist = Math.sqrt(dx * dx + dz * dz);
	f.fireT -= dt;
	if (f.fireT < 0 && dist < 130 && chase.down == 0) {
		f.fireT = f.def.fire[0] + Math.random() * (f.def.fire[1] - f.def.fire[0]);
		foeShot(f.x, f.y + 1.3, f.z, f.def.dmg, 1.2);
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
	boom(f.x, f.y, f.z, 7);
	return true;
}

function updateHeli(f, dt) {
	var tx, ty, tz, k, dx, dz, dist, px, pz, l, u;
	f.part.rotation.y += 32 * dt; f.part2.rotation.x += 50 * dt;
	if (f.dead > 0) return fallAir(f, dt, 5);
	// position: in front of you, to the left or right of the piste, 30 m above the snow
	tx = pisteX(sk.t + 80) + 38 * Math.sin(chaseTime * 0.22 + f.phase); tz = Z0 - (sk.t + 80);
	ty = groundAt(tx, tz) + 30 + 5 * Math.sin(chaseTime * 0.5);
	k = 1 - Math.exp(-dt * 0.9);
	dx = (tx - f.x) * k; dz = (tz - f.z) * k;
	f.vt = Math.sqrt(dx * dx + dz * dz) / dt; f.hdg = Math.atan2(-dx, -dz);
	f.x += dx; f.y += (ty - f.y) * k; f.z += dz;
	f.mesh.position.set(f.x, f.y, f.z);
	dx = sk.x - f.x; dz = sk.z - f.z; dist = Math.sqrt(dx * dx + dz * dz);
	f.mesh.rotation.set(-0.1, Math.atan2(-dx, -dz), 0.1 * Math.sin(chaseTime * 0.22 + f.phase));
	if (f.hp < 5 && Math.random() < 0.2) puff(fxSmoke, f.x, f.y + 1, f.z, 0, 2, 0, 1.5);

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
	// it flies up the piste, to you, then goes over you
	f.te -= 52 * dt;
	gap = f.te - sk.t;
	if (gap < 380 && !f.lined) { f.lined = true; f.lineD = clamp(sk.d, -PISTE_W, PISTE_W); f.hitDone = false; }
	if (f.lined) f.de += clamp(f.lineD - f.de, -12, 12) * dt;
	wantAlt = gap > 500 ? 75 : gap > -80 ? 24 : 90;
	f.alt += clamp(wantAlt - f.alt, -22, 22) * dt;
	f.x = pisteX(f.te) + f.de; f.z = Z0 - f.te; f.y = groundAt(f.x, f.z) + f.alt;
	f.hdg = pisteDir(f.te) + Math.PI; f.vt = 52;
	f.mesh.position.set(f.x, f.y, f.z);
	f.mesh.rotation.set(0, f.hdg, 0.15 * Math.sin(chaseTime * 0.8));
	if (f.hp < 3 && Math.random() < 0.3) puff(fxSmoke, f.x, f.y, f.z, 0, 1, 0, 1.5);

	// fire: a line of bullets down the piste, at the side position that you had when it started
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
		f.te = sk.t + 850; f.de = 0; f.alt = 75;
	}
	return false;
}

// ---------- waves ----------

function startChase(t0) {
	clearFoes();
	chase.on = true; chase.done = false; chase.score = 0; chase.kills = 0; chase.health = 100;
	chase.wave = 0; chase.startT = t0; chase.graceT = t0; chase.checkT = t0; chase.checkWave = 0; chase.down = 0;
	chase.gap = Math.max(420, (T_END - t0 - 500) / WAVES.length);
	chase.msg = 'THEY ARE BEHIND YOU'; chase.msgTime = chaseTime;
}

function stopChase() {
	clearFoes();
	chase.on = false;
}

// endChase: you are at the finish line.
function endChase() {
	var i;
	for (i = 0; i < foes.length; i++) if (foes[i].dead == 0) boom(foes[i].x, foes[i].y + 1, foes[i].z, 3);
	clearFoes();
	chase.done = true;
	chase.score += Math.round(chase.health) * 10;
}

// respawnChase: you were down. Start again at the last wave.
function respawnChase() {
	clearFoes();
	resetSki(chase.checkT);
	chase.health = 100; chase.wave = chase.checkWave; chase.graceT = sk.t + 90;
	chase.score = Math.max(0, chase.score - 500);
	chase.respawns++;
	chase.msg = 'GO'; chase.msgTime = chaseTime;
}

function updateChase(dt) {
	var i, j, f, w, gone, text;
	chaseTime += dt;
	if (!chase.on || chase.done) return;
	if (chase.down > 0) {
		chase.down -= dt;
		if (chase.down <= 0) { chase.down = 0; respawnChase(); }
	}
	if (chaseTime - chase.hitTime > 4 && chase.health < 100 && chase.down == 0) chase.health = Math.min(100, chase.health + 4 * dt);

	// next wave
	if (chase.wave < WAVES.length && sk.t > chase.graceT && sk.t - chase.startT > 100 + chase.wave * chase.gap && sk.t < T_END - 250 && foes.length < 12) {
		w = WAVES[chase.wave]; text = '';
		for (i = 0; i < w.length; i += 2) {
			for (j = 0; j < w[i + 1]; j++) spawnFoe(w[i]);
			text += (text ? ' + ' : '') + WAVE_TEXT[w[i]];
		}
		chase.msg = text; chase.msgTime = chaseTime;
		chase.checkT = sk.t; chase.checkWave = chase.wave;
		chase.wave++;
	}

	for (i = foes.length - 1; i >= 0; i--) {
		f = foes[i]; gone = false;
		if (f.dead > 0) f.dead += dt;
		if (f.type == 'heli') gone = updateHeli(f, dt);
		else if (f.type == 'plane') gone = updatePlane(f, dt);
		else if (f.air) updateChute(f, dt);
		else {
			updateGround(f, dt);
			gone = f.dead > 7 || sk.t - f.te > 300 || f.te - sk.t > 700;
		}
		if (gone) removeFoe(f);
	}
}
