// world.js - the mountain, the piste, the trees, the houses, the sky.
// Classic script. It uses THREE from three.min.js.
// Units are meters. North is -z. East is +x. The run goes north, down the mountain.
//
// Piste coordinates:
//   t = distance down the run (t = Z0 - z). t = 0 is the start gate. t = T_END is the finish line.
//   d = distance to the east of the piste center (d = x - pisteX(t)). East is on your right.
//
// The run is a list of sections (SEC). Each section has its own steepness, width, side walls,
// moguls, trees, ice and rollers. makeProfile() makes one table for each of these, with one value for each meter of t.
//
// ski.js, guns.js and chase.js use groundAt(), normalAt(), pisteX(), pisteDir(), obstacleAt(),
// crevAt(), surfaceAt(), the tables, HOUSES and COMP.
// main.js calls makeWorld() one time, and updateWorld() each frame.
//
// Order of this file:
//   constants, math, noise, sections, jumps, crevasses, heights, obstacles, houses and bases,
//   colors, parts, terrain mesh, trees, piste objects, sky, update.

// ---------- constants ----------

var Z0 = 4000;           // z of the start gate
var T_END = 7900;        // finish line
var T_OFF = 900;         // the tables start at t = -900
var NT = 9801;           // size of the tables (t = -900 to 8900)
var ROW = 48;            // far terrain: distance between rows (along t)
var NROW = 200;          // far terrain: number of row steps (t = -800 to 8800)
var FPR = 16;            // near rows in one far row step (3 m)
var PATCH = 12;          // near terrain: length, in far row steps (576 m)
var TREELINE = 2000;     // no trees above this height
var TC = 16;             // obstacle grid: cell size
var TREE_R = 35;         // trees are drawn this many cells around you (560 m)
var D_MAX = 1400;        // you cannot go farther than this from the piste center
var START_T = [0, 2500, 5540];  // TOP, UPPER BASE, LOWER BASE
var FOG_COLOR = 0xdce8f2;
var SKY_COLOR = 0x3f7fd0;
var SUN_DIR = new THREE.Vector3(0.75, 0.6, -0.45).normalize();

// ---------- math ----------

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, u) { return a + (b - a) * u; }
function sstep(a, b, v) { var u = clamp((v - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); }
function wrapPi(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

// ---------- noise ----------

// hash2 gives a fixed number from 0 to 1 for each grid point.
function hash2(i, j) {
	var h = Math.imul(i, 374761393) + Math.imul(j, 668265263) | 0;
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// vnoise gives a smooth number from -1 to 1.
function vnoise(x, z) {
	var i = Math.floor(x), j = Math.floor(z), u = x - i, v = z - j;
	u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
	var a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1);
	return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}

function fbm(x, z) {
	return 0.5 * vnoise(x, z) + 0.27 * vnoise(x * 2.1 + 5, z * 2.1) + 0.15 * vnoise(x * 4.3, z * 4.3 + 9) + 0.08 * vnoise(x * 8.7 + 3, z * 8.7);
}

// ---------- sections ----------

// Each line: start t, steepness, half width, side wall steepness, moguls, trees on the piste, ice, rollers,
// clear (no trees and no jumps: start, overlooks, bases, village), length of the change from the section before, name.
var SEC = [
	[0,    0.03,  45, 0.30, 0, 0,   0, 0.0, 1, 30, 'SUMMIT'],
	[30,   0.60,  75, 0.25, 0, 0,   0, 0.4, 0, 40, 'HEADWALL'],
	[700,  0.22, 120, 0.15, 0, 0,   1, 1.0, 0, 60, 'GLACIER'],
	[1900, 0.50,  60, 0.40, 0, 0,   0, 0.7, 0, 60, 'ICEFALL'],
	[2500, 0.03,  60, 0.30, 0, 0,   0, 0.0, 1, 40, 'OVERLOOK'],
	[2640, 0.58,  70, 0.30, 0, 0,   0, 0.0, 1, 26, 'UPPER BASE'],
	[2840, 0.05,  95, 0.20, 0, 0,   0, 0.0, 1, 40, 'UPPER BASE'],
	[3070, 0.50,  13, 1.30, 0, 0,   0, 0.5, 0, 50, 'THE GULLY'],
	[3860, 0.36,  80, 0.30, 1, 0,   0, 0.3, 0, 50, 'MOGULS'],
	[4400, 0.28,  75, 0.30, 0, 1,   0, 0.8, 0, 60, 'THE TREES'],
	[5540, 0.03,  60, 0.30, 0, 0,   0, 0.0, 1, 40, 'OVERLOOK'],
	[5680, 0.58,  70, 0.30, 0, 0,   0, 0.0, 1, 26, 'LOWER BASE'],
	[5880, 0.05,  95, 0.20, 0, 0,   0, 0.0, 1, 40, 'LOWER BASE'],
	[6130, 0.38,  65, 0.35, 0, 0.3, 0, 1.0, 0, 50, 'THE CLIFFS'],
	[7150, 0.16,  75, 0.25, 0, 0,   0, 0.3, 1, 60, 'VILLAGE'],
	[7800, 0.02,  75, 0.25, 0, 0,   0, 0.0, 1, 40, 'FINISH']
];

// The tables: one value for each meter of t.
var ELEV = new Float32Array(NT);     // height of the piste center
var PW = new Float32Array(NT);       // half width of the piste
var PWALL = new Float32Array(NT);    // steepness of the side walls
var PMOG = new Float32Array(NT);     // moguls: 0 to 1
var PGLADE = new Float32Array(NT);   // trees on the piste: 0 to 1
var PICE = new Float32Array(NT);     // glacier: 0 to 1
var PCLEAR = new Float32Array(NT);   // 1 = no trees and no jumps
var PSEC = new Uint8Array(NT);       // index of the section

function makeProfile() {
	var slope = new Float32Array(NT), roll = new Float32Array(NT), i, k = 0, t, s, n, u, c;
	for (i = 0; i < NT; i++) {
		t = i - T_OFF;
		while (k < SEC.length - 1 && t >= SEC[k + 1][0]) k++;
		s = SEC[k]; n = k < SEC.length - 1 ? SEC[k + 1] : s;
		u = sstep(n[0] - n[9], n[0], t);       // change to the next section
		slope[i] = lerp(s[1], n[1], u); PW[i] = lerp(s[2], n[2], u); PWALL[i] = lerp(s[3], n[3], u);
		PMOG[i] = lerp(s[4], n[4], u); PGLADE[i] = lerp(s[5], n[5], u); PICE[i] = lerp(s[6], n[6], u);
		roll[i] = lerp(s[7], n[7], u); PCLEAR[i] = Math.max(s[8], n[8] * (u > 0 ? 1 : 0)); PSEC[i] = k;
		if (t < -40) slope[i] = 0.45;                       // the mountain goes up behind the start
		else if (t < 0) slope[i] = 0.02;
		if (t > T_END) slope[i] = -0.035 * sstep(7900, 7960, t) - 0.3 * sstep(8200, 8500, t);   // run-out, then the opposite valley side
	}
	ELEV[T_OFF] = 3550;
	for (i = T_OFF; i < NT - 1; i++) ELEV[i + 1] = ELEV[i] - (slope[i] + slope[i + 1]) / 2;
	for (i = T_OFF; i > 0; i--) ELEV[i - 1] = ELEV[i] + (slope[i] + slope[i - 1]) / 2;
	// rollers: waves of 40 m across the piste. At speed, each top is a jump.
	for (i = 0; i < NT; i++) { t = i - T_OFF; ELEV[i] += roll[i] * 1.3 * Math.sin(0.157 * t + 0.8 * Math.sin(t / 97)); }
}

function elevAt(t) {
	var u = clamp(t + T_OFF, 0, NT - 1.01), i = Math.floor(u);
	return ELEV[i] + (ELEV[i + 1] - ELEV[i]) * (u - i);
}

function tIndex(t) { var i = Math.round(t) + T_OFF; return i < 0 ? 0 : i > NT - 1 ? NT - 1 : i; }
function widthAt(t) { return PW[tIndex(t)]; }
function sectionName(t) { return SEC[PSEC[tIndex(t)]][10]; }

// pisteX gives the x of the piste center. In the gully the piste has short, fast bends.
function pisteX(t) {
	var g = t > 3090 && t < 3840 ? sstep(3090, 3200, t) * (1 - sstep(3740, 3840, t)) : 0;
	return 260 * Math.sin(t / 830 + 0.5) + 110 * Math.sin(t / 290 + 2.1) - 219.6 + g * 14 * Math.sin(t / 38);   // 219.6 makes x = 0 at the start gate
}

// pisteDir gives the direction of the piste as a heading. 0 = north. Positive = to the left (west).
function pisteDir(t) {
	return Math.atan2(-(pisteX(t + 1) - pisteX(t - 1)) / 2, 1);
}

// ---------- jumps ----------

// FEAT: jump ramps (kind 1) and ledges (kind 2: a flat top, then a drop).
// t = position of the edge, d = center, w = half width, len = length before the edge, h = height.
var FEAT = [], FEAT_AT = [];

function makeFeatures() {
	var t = 150, n = 0, i, W, sec, r, ledge, f, b;
	while (t < 7120) {
		i = tIndex(t); W = PW[i]; sec = SEC[PSEC[i]][10];
		if (PCLEAR[i] > 0.5 || PCLEAR[tIndex(t - 60)] > 0.5) { t += 30; continue; }
		r = hash2(n, 911);
		ledge = sec == 'ICEFALL' || sec == 'THE CLIFFS' ? 0.7 : sec == 'HEADWALL' || sec == 'MOGULS' ? 0.4 : sec == 'THE GULLY' ? 0 : 0.2;
		if (W < 25) f = { t: t, d: 0, w: 5, len: 12, h: 0.9 + 0.7 * hash2(n, 5), kind: 1 };
		else if (r < ledge) f = { t: t, d: (hash2(n, 3) - 0.5) * 1.2 * W, w: 12 + 22 * hash2(n, 4), len: 55, h: 2.5 + 4 * hash2(n, 5), kind: 2 };
		else { f = { t: t, d: (hash2(n, 3) - 0.5) * 1.3 * W, w: 6 + 6 * hash2(n, 4), len: 0, h: 1.3 + 1.5 * hash2(n, 5), kind: 1 }; f.len = 14 + 4 * f.h; }
		FEAT.push(f);
		t += 34 + 44 * hash2(n, 77); n++;
	}
	for (b = 0; b < NT / 64 + 1; b++) FEAT_AT.push([]);
	for (i = 0; i < FEAT.length; i++) {
		f = FEAT[i];
		for (b = Math.floor((f.t - f.len + T_OFF) / 64); b <= Math.floor((f.t + 6 + T_OFF) / 64); b++) FEAT_AT[b].push(f);
	}
}

// featAt gives the height of the jumps at a point. featKind is the kind of the highest one (for the color).
var featKind = 0;

function featAt(t, d) {
	var list = FEAT_AT[Math.floor((t + T_OFF) / 64)], best = 0, i, f, u, w, p;
	featKind = 0;
	if (!list) return 0;
	for (i = 0; i < list.length; i++) {
		f = list[i]; u = t - f.t;
		if (u < -f.len || u > 5) continue;
		w = Math.abs(d - f.d);
		if (w > f.w + 4) continue;
		if (u > 0) p = (1 - u / 5) * (1 - u / 5);
		else if (f.kind == 1) p = (u + f.len) * (u + f.len) / (f.len * f.len);
		else p = sstep(-f.len, -f.len * 0.2, u);
		p *= f.h * (1 - sstep(f.w, f.w + 4, w));
		if (p > best) { best = p; featKind = f.kind; }
	}
	return best;
}

// ---------- crevasses ----------

// On the glacier there is a crevasse each 95 m. Each one goes from one side to 35% across the other half.
// crevAt gives 1 in a crevasse, 0 out of it. You must jump, or go around the open end.
var CREV_T0 = 800, CREV_GAP = 95, CREV_N = 11;

function crevAt(t, d) {
	var k = Math.round((t - CREV_T0) / CREV_GAP), u, W, e;
	if (k < 0 || k >= CREV_N) return 0;
	u = Math.abs(t - (CREV_T0 + k * CREV_GAP + 8 * Math.sin(d / 22 + k)));
	if (u > 3.4) return 0;
	W = PW[tIndex(t)];
	e = k % 2 ? d + W * 0.35 : W * 0.35 - d;     // distance from the open end, into the crevasse
	if (e < 0) return 0;
	return (1 - sstep(2.4, 3.4, u)) * sstep(0, 5, e);
}

// lipAt: the top edge of each crevasse is a ramp of 1.2 m, so above 40 km/h you fly across.
// The ramp ends 3.6 m before the center of the crevasse.
function lipAt(t, d) {
	var k = Math.round((t - CREV_T0 + 10) / CREV_GAP), u, W, e;
	if (k < 0 || k >= CREV_N) return 0;
	u = t - (CREV_T0 + k * CREV_GAP + 8 * Math.sin(d / 22 + k)) + 3.6;
	if (u < -13 || u > 0) return 0;
	W = PW[tIndex(t)];
	e = k % 2 ? d + W * 0.35 : W * 0.35 - d;
	if (e < -8) return 0;
	u = (u + 13) / 13;
	return 1.2 * u * u * sstep(-8, 2, e);
}

// ---------- heights ----------

// groundAt gives the height of the snow. All other height data comes from this function.
function groundAt(x, z) {
	var t = Z0 - z, d = x - pisteX(t), a = Math.abs(d);
	var u = clamp(t + T_OFF, 0, NT - 1.01), i = Math.floor(u), f = u - i;
	var h = ELEV[i] + (ELEV[i + 1] - ELEV[i]) * f, W = PW[i] + (PW[i + 1] - PW[i]) * f, wall = PWALL[i] + (PWALL[i + 1] - PWALL[i]) * f;
	var am = a < 60 ? a : 60;
	h += wall * am * am / (am + 2 * W);                      // the piste is the bottom of a valley. In the gully the sides are very steep.
	if (a > 60) h += 0.22 * (a - 60);
	if (a > W) h += sstep(W, W + 35, a) * (0.4 * vnoise(x / 11, z / 11) + 2.2 * vnoise(x / 57 + 9, z / 57));  // bumps off the piste
	else {
		if (PMOG[i] > 0.01) h += PMOG[i] * 0.5 * Math.sin(x * 0.52) * Math.sin(z * 0.52) * (1 - sstep(W * 0.6, W, a));
		if (PCLEAR[i] < 0.5) h += featAt(t, d);
	}
	if (PICE[i] > 0.5) h += lipAt(t, d);
	if (a > 250) h += sstep(250, 1400, a) * (260 + 420 * fbm(x / 1000, z / 1000));   // ridges on the two sides
	return h;
}

// normalAt writes the surface normal (x, y, z) and the gradient (gx, gz) into o.
function normalAt(x, z, o) {
	var gx = (groundAt(x + 1.5, z) - groundAt(x - 1.5, z)) / 3;
	var gz = (groundAt(x, z + 1.5) - groundAt(x, z - 1.5)) / 3;
	var l = 1 / Math.sqrt(gx * gx + gz * gz + 1);
	o.x = -gx * l; o.y = l; o.z = -gz * l; o.gx = gx; o.gz = gz;
	return o;
}

function icePatch(x, z, i) { return PICE[i] > 0.5 && vnoise(x / 45 + 7, z / 45) > 0.2; }

// surfaceAt gives the snow type: 0 = piste, 1 = ice, 2 = deep snow off the piste.
function surfaceAt(x, z, t, d) {
	var i = tIndex(t);
	if (Math.abs(d) > PW[i] + 3) return 2;
	return icePatch(x, z, i) ? 1 : 0;
}

// ---------- obstacles ----------

function liftD(i) { return PW[i] + 55; }

// forestAt gives the tree density (0 to 1) at a point off the piste. h is the ground height there.
function forestAt(x, z, t, d, h) {
	var a = Math.abs(d), i = tIndex(t), W = PW[i];
	if (a < W || h > TREELINE || t < -60 || t > 8350) return 0;
	if (Math.abs(d - liftD(i)) < 11) return 0;         // the lift line
	if (PCLEAR[i] > 0.5 && a < 170) return 0;          // overlooks, bases, village
	return (0.5 + 0.5 * vnoise(x / 140 + 31, z / 140)) * sstep(TREELINE, TREELINE - 200, h) * (0.3 + 0.7 * sstep(W + 6, W + 80, a)) * sstep(W, W + 12, a);
}

// obstacleAt writes the tree, rock or ice block of one grid cell into o.
// o.kind: 0 = nothing, 1 = tree, 2 = rock, 3 = ice block. The result is always the same for the same cell.
function obstacleAt(ci, cj, o) {
	var x = (ci + 0.15 + 0.7 * hash2(ci + 7919, cj)) * TC, z = (cj + 0.15 + 0.7 * hash2(ci, cj + 104729)) * TC;
	var t = Z0 - z, d = x - pisteX(t), a = Math.abs(d), r = hash2(ci, cj), i, W, h, size = hash2(ci + 31, cj + 17);
	o.kind = 0;
	if (a > 1500 || t < 20 || t > 8350 || r > 0.85) return o;
	i = tIndex(t); W = PW[i];
	if (a < W) {
		// on the piste
		if (PCLEAR[i] > 0.5) return o;
		if (PGLADE[i] > 0.05) {
			// trees, with one clear line that bends left and right
			if (r > 0.42 * PGLADE[i] || Math.abs(d - 18 * Math.sin(t / 60)) < 6) return o;
			h = groundAt(x, z);
			if (h > TREELINE) return o;
			o.kind = 1;
		} else if (PICE[i] > 0.5) {
			if (r > 0.05 || crevAt(t, d) > 0 || lipAt(t, d) > 0.05) return o;
			h = groundAt(x, z); o.kind = 3;
		} else {
			if (r > 0.012 || W < 25 || featAt(t, d) > 0.02) return o;
			h = groundAt(x, z); o.kind = 2;
		}
	} else {
		h = groundAt(x, z);
		if (Math.abs(d - liftD(i)) < 11) return o;
		if (h < TREELINE) {
			if (r > 0.85 * forestAt(x, z, t, d, h)) return o;
			o.kind = 1;
		} else if (PICE[i] > 0.5 && a < W + 80) {
			if (r > 0.22) return o;
			o.kind = 3;
		} else {
			if (r > 0.05 || h > TREELINE + 1700) return o;
			o.kind = 2;
		}
	}
	if (o.kind == 1) { o.h = 6 + 8 * size; o.r = 0.45; }
	else if (o.kind == 2) { o.h = 1.2 + 2.2 * size; o.r = o.h * 0.75; }
	else { o.h = 3 + 5 * size; o.r = 1.2 + 1.4 * size; }
	o.x = x; o.y = h; o.z = z;
	return o;
}

// ---------- houses and bases ----------

// HOUSES: all buildings that you can hit. kind 0 = chalet, 1 = base building.
var HOUSES = [];

function addHouse(t, d, rot, s, kind) {
	var x = pisteX(t) + d, z = Z0 - t;
	HOUSES.push({ x: x, y: groundAt(x, z) - 0.5, z: z, t: t, d: d, rot: pisteDir(t) + rot, s: s, kind: kind, r: 6.2 * s, h: 6.5 * s });
}

// COMP: the two enemy bases. All positions are [t, d].
// over = the overlook: the position where you stop to use the sniper rifle.
var COMP = [
	{
		name: 'UPPER BASE', over: 2630, t0: 2840, t1: 3070,
		houses: [[2900, -45], [2900, 45], [2990, -55], [3010, 50]],
		towers: [[2870, -70], [2870, 70]],
		tanks: [[2950, -25], [2950, -16], [2963, -20]],
		radar: [2985, 28], heli: null,
		guards: [[2880, -10], [2886, 12], [2930, 30], [2945, -38], [2975, 5], [3000, -25]]
	},
	{
		name: 'LOWER BASE', over: 5670, t0: 5880, t1: 6130,
		houses: [[5940, -50], [5945, 48], [6040, -55], [6060, 52], [6085, -22]],
		towers: [[5905, -72], [5905, 72], [6100, 70]],
		tanks: [[5985, -28], [5985, -19], [5998, -23], [6050, 28]],
		radar: [6030, -30], heli: [6005, 26],
		guards: [[5915, -8], [5920, 14], [5960, 30], [5975, -40], [6000, 0], [6030, 10], [6060, -30]]
	}
];

function makeHouses() {
	var r, c, i, k, t, d, cols = [-70, -42, -14, 14, 42, 70];
	addHouse(-26, -24, 0.3, 1, 0);                                           // start hut
	for (i = 0; i < 6; i++) addHouse(4290 + i * 17, (i % 2 ? 1 : -1) * (30 + 35 * hash2(i, 21)), hash2(i, 22) * 3, 0.9 + 0.3 * hash2(i, 23), 0);   // hamlet below the moguls
	// village: rows of houses with streets between them. The piste goes through the streets.
	for (r = 0; r < 17; r++) {
		for (c = 0; c < 6; c++) {
			if (hash2(r, c + 40) < 0.2) continue;
			t = 7205 + r * 34 + 6 * (hash2(r, c + 50) - 0.5); d = cols[c] + 4 * (hash2(r, c + 60) - 0.5);
			addHouse(t, d, 0.2 * (hash2(r, c + 70) - 0.5) + (hash2(r, c + 80) < 0.3 ? Math.PI / 2 : 0), 0.9 + 0.22 * hash2(r, c + 90), 0);
		}
	}
	for (k = 0; k < COMP.length; k++) {
		c = COMP[k];
		for (i = 0; i < c.houses.length; i++) addHouse(c.houses[i][0], c.houses[i][1], i % 2 ? 0.2 : -0.15, 1.15, 1);
	}
}

// ---------- colors ----------

var C_SNOW = new THREE.Color(0xf1f5fa);
var C_PISTE = new THREE.Color(0xffffff);
var C_ROCK = new THREE.Color(0x77706a);
var C_FOREST = new THREE.Color(0x5d7a6a);
var C_KICK = new THREE.Color(0x58a8ff);
var C_ICE = new THREE.Color(0xb4dcf0);
var C_WALL = new THREE.Color(0x6a635d);
var C_CREV = new THREE.Color(0x12324f);

// tintAt gives the surface type: -5 = rock wall, -4 = crevasse, -3 = ice, -2 = jump ramp, -1 = piste, 0 to 1 = tree density.
function tintAt(x, z, h, near) {
	var t = Z0 - z, d = x - pisteX(t), i = tIndex(t);
	if (Math.abs(d) < PW[i]) {
		if (near && PICE[i] > 0.5 && crevAt(t, d) > 0.3) return -4;
		if (PCLEAR[i] < 0.5 && featAt(t, d) > 0.05 && featKind == 1) return -2;
		if (icePatch(x, z, i)) return -3;
		return PGLADE[i] > 0.05 ? PGLADE[i] * 0.25 : -1;
	}
	if (PWALL[i] > 0.8 && Math.abs(d) < 75 && vnoise(x / 7, h / 5) > -0.25) return -5;      // the walls of the gully are rock with some snow
	return forestAt(x, z, t, d, h);
}

// terrainColor writes the color for a surface type and a normal height (ny) into arr at index k.
function terrainColor(tint, ny, arr, k) {
	var c = tint == -5 ? C_WALL : tint == -4 ? C_CREV : tint == -3 ? C_ICE : tint == -2 ? C_KICK : tint == -1 ? C_PISTE : C_SNOW;
	var r = c.r, g = c.g, b = c.b, u;
	if (tint > 0) { u = tint * 0.62; r += (C_FOREST.r - r) * u; g += (C_FOREST.g - g) * u; b += (C_FOREST.b - b) * u; }
	if (ny < 0.8 && tint > -2) { u = sstep(0.8, 0.62, ny); r += (C_ROCK.r - r) * u; g += (C_ROCK.g - g) * u; b += (C_ROCK.b - b) * u; }
	arr[k] = r; arr[k + 1] = g; arr[k + 2] = b;
}

// ---------- parts ----------

// partsGeo makes one geometry with colors from a list of boxes and cylinders.
// box:      ['b', width, height, depth, x, y, z, color, rx, ry, rz]
// cylinder: ['c', top radius, bottom radius, height, x, y, z, color, rx, ry, rz, sides]
function partsGeo(parts) {
	var pos = [], nor = [], col = [], i, k, p, g, gp, gn;
	var m = new THREE.Matrix4(), e = new THREE.Euler(), q = new THREE.Quaternion(), c = new THREE.Color();
	var v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
	for (i = 0; i < parts.length; i++) {
		p = parts[i];
		if (p[0] == 'b') g = new THREE.BoxGeometry(p[1], p[2], p[3]);
		else g = new THREE.CylinderGeometry(p[1], p[2], p[3], p[11] || 8);
		e.set(p[8] || 0, p[9] || 0, p[10] || 0);
		m.compose(v.set(p[4], p[5], p[6]), q.setFromEuler(e), one);
		g = g.toNonIndexed();
		g.applyMatrix4(m);
		c.setHex(p[7]);
		gp = g.attributes.position.array; gn = g.attributes.normal.array;
		for (k = 0; k < gp.length; k += 3) {
			pos.push(gp[k], gp[k + 1], gp[k + 2]);
			nor.push(gn[k], gn[k + 1], gn[k + 2]);
			col.push(c.r, c.g, c.b);
		}
	}
	g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
	g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
	return g;
}

// textTexture makes a texture with one line of text. It is used for the banners.
function textTexture(text, w, h, back, front) {
	var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
	var c = cv.getContext('2d');
	c.fillStyle = back; c.fillRect(0, 0, w, h);
	c.fillStyle = front; c.font = 'bold ' + Math.floor(h * 0.7) + 'px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
	c.fillText(text, w / 2, h / 2 + h * 0.04);
	var tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
}

// ---------- terrain mesh ----------

// The terrain is a grid in piste coordinates: rows along t, columns at fixed distances (COLS) from the piste center.
// The columns are 3 m apart near the piste and farther apart on the ridges. Thus the gully keeps its shape at all distances.
// Far terrain: one row each 48 m, for the full mountain.
// Near terrain: one row each 3 m, for 576 m around you. It moves with you, one far row step at a time.
// The far rows below the near terrain are moved down, so they are not seen.

var COLS = [], NCOL = 0;
var snowMat = null;
var farGeo = null, farPos = null, farH = null;
var nearGeo = null, nearPos = null, nearNor = null, nearCol = null, nearUv = null, nearH = null;
var patchRow = -1;

function makeCols() {
	var d, step = 3, i, side = [];
	for (d = 3; d < 4600; d += step) { side.push(d); if (d >= 150) step = Math.min(400, step * 1.35); }
	for (i = side.length - 1; i >= 0; i--) COLS.push(-side[i]);
	COLS.push(0);
	for (i = 0; i < side.length; i++) COLS.push(side[i]);
	NCOL = COLS.length;
}

function makeSnowTexture() {
	var cv = document.createElement('canvas'); cv.width = cv.height = 256;
	var c = cv.getContext('2d'), img = c.createImageData(256, 256), p = img.data, i, j, k, v;
	// pn: noise that repeats after n cells, so the texture has no visible edge
	function pn(x, z, n) {
		var i = Math.floor(x), j = Math.floor(z), u = x - i, w = z - j, i1 = (i + 1) % n, j1 = (j + 1) % n;
		u = u * u * (3 - 2 * u); w = w * w * (3 - 2 * w);
		return lerp(lerp(hash2(i, j), hash2(i1, j), u), lerp(hash2(i, j1), hash2(i1, j1), u), w) * 2 - 1;
	}
	for (j = 0; j < 256; j++) {
		for (i = 0; i < 256; i++) {
			v = 241 + 7 * pn(i / 256 * 48, j / 256 * 48, 48) + 5 * pn(i / 256 * 12, j / 256 * 12, 12) + 8 * (hash2(i, j) - 0.5);
			if (hash2(i + 999, j) > 0.992) v = 255;  // sparkle
			k = (j * 256 + i) * 4;
			p[k] = clamp(v - 3, 0, 255); p[k + 1] = clamp(v, 0, 255); p[k + 2] = clamp(v + 4, 0, 255); p[k + 3] = 255;
		}
	}
	c.putImageData(img, 0, 0);
	var tex = new THREE.CanvasTexture(cv);
	tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
	return tex;
}

// gridIndex makes the triangles for a grid of rows x (NCOL - 1) cells.
function gridIndex(rows) {
	var n = NCOL - 1, idx = new Uint32Array(rows * n * 6), k = 0, i, j, a, b, c, d;
	for (j = 0; j < rows; j++) {
		for (i = 0; i < n; i++) {
			a = j * NCOL + i; b = a + 1; c = a + NCOL; d = c + 1;
			idx[k++] = a; idx[k++] = b; idx[k++] = c;
			idx[k++] = b; idx[k++] = d; idx[k++] = c;
		}
	}
	return idx;
}

function makeFar(scene) {
	var n = (NROW + 1) * NCOL, r, j, k, x, z, t, px, h, o = {};
	var nor = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2);
	farPos = new Float32Array(n * 3); farH = new Float32Array(n);
	for (r = 0; r <= NROW; r++) {
		t = -800 + r * ROW; z = Z0 - t; px = pisteX(t);
		for (j = 0; j < NCOL; j++) {
			k = r * NCOL + j; x = px + COLS[j];
			h = groundAt(x, z); normalAt(x, z, o);
			farH[k] = h;
			farPos[k * 3] = x; farPos[k * 3 + 1] = h; farPos[k * 3 + 2] = z;
			nor[k * 3] = o.x; nor[k * 3 + 1] = o.y; nor[k * 3 + 2] = o.z;
			uv[k * 2] = x / 6; uv[k * 2 + 1] = z / 6;
			terrainColor(tintAt(x, z, h, false), o.y, col, k * 3);
		}
	}
	farGeo = new THREE.BufferGeometry();
	farGeo.setAttribute('position', new THREE.BufferAttribute(farPos, 3));
	farGeo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
	farGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
	farGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
	farGeo.setIndex(new THREE.BufferAttribute(gridIndex(NROW), 1));
	var mesh = new THREE.Mesh(farGeo, snowMat);
	mesh.frustumCulled = false;
	scene.add(mesh);
}

function makeNear(scene) {
	var rows = PATCH * FPR, n = (rows + 1) * NCOL;
	nearPos = new Float32Array(n * 3); nearNor = new Float32Array(n * 3); nearCol = new Float32Array(n * 3); nearUv = new Float32Array(n * 2);
	nearH = new Float32Array(n);
	nearGeo = new THREE.BufferGeometry();
	nearGeo.setAttribute('position', new THREE.BufferAttribute(nearPos, 3));
	nearGeo.setAttribute('normal', new THREE.BufferAttribute(nearNor, 3));
	nearGeo.setAttribute('color', new THREE.BufferAttribute(nearCol, 3));
	nearGeo.setAttribute('uv', new THREE.BufferAttribute(nearUv, 2));
	nearGeo.setIndex(new THREE.BufferAttribute(gridIndex(rows), 1));
	var mesh = new THREE.Mesh(nearGeo, snowMat);
	mesh.frustumCulled = false;
	scene.add(mesh);
}

function farHole(row, dy) {
	var r, j, k;
	for (r = row + 1; r < row + PATCH; r++) {
		for (j = 0; j < NCOL; j++) { k = r * NCOL + j; farPos[k * 3 + 1] = farH[k] + dy; }
	}
}

// moveData moves the contents of an array n places to the start (n > 0) or to the end (n < 0).
function moveData(arr, n) {
	if (n > 0) arr.copyWithin(0, n); else if (n < 0) arr.copyWithin(-n, 0, arr.length + n);
}

// nearRow calculates the heights of one near row. Crevasses are shown as deep cuts.
function nearRow(row0, b) {
	var t = -800 + row0 * ROW + b * (ROW / FPR), z = Z0 - t, px = pisteX(t), i = tIndex(t), j, k, x, h, c;
	for (j = 0; j < NCOL; j++) {
		k = b * NCOL + j; x = px + COLS[j];
		h = groundAt(x, z);
		if (PICE[i] > 0.5) { c = crevAt(t, COLS[j]); if (c > 0) h -= 14 * c; }
		nearH[k] = h;
		nearPos[k * 3] = x; nearPos[k * 3 + 1] = h; nearPos[k * 3 + 2] = z;
		nearUv[k * 2] = x / 6; nearUv[k * 2 + 1] = z / 6;
	}
}

// nearShade calculates the normals and colors of one near row from the heights of the rows around it.
function nearShade(row0, b) {
	var rows = PATCH * FPR, t = -800 + row0 * ROW + b * (ROW / FPR), z = Z0 - t, j, k, k0, k1, gx, gt, gz, l, slopeX;
	var b0 = b > 0 ? b - 1 : b, b1 = b < rows ? b + 1 : b, dt = (b1 - b0) * (ROW / FPR);
	slopeX = (nearPos[b1 * NCOL * 3] - nearPos[b0 * NCOL * 3]) / dt;       // the columns move to the side with the piste
	for (j = 0; j < NCOL; j++) {
		k = b * NCOL + j;
		k0 = j > 0 ? k - 1 : k; k1 = j < NCOL - 1 ? k + 1 : k;
		gx = (nearH[k1] - nearH[k0]) / (nearPos[k1 * 3] - nearPos[k0 * 3]);
		gt = (nearH[b1 * NCOL + j] - nearH[b0 * NCOL + j]) / dt;            // along the column
		gz = gx * slopeX - gt;                                              // along z
		l = 1 / Math.sqrt(gx * gx + gz * gz + 1);
		nearNor[k * 3] = -gx * l; nearNor[k * 3 + 1] = l; nearNor[k * 3 + 2] = -gz * l;
		terrainColor(tintAt(nearPos[k * 3], z, nearH[k], true), l, nearCol, k * 3);
	}
}

// updatePatch moves the near terrain when you go into a different far row. It returns true if it moved.
function updatePatch(pt) {
	var rows = PATCH * FPR, row = clamp(Math.floor((pt + 800) / ROW) - PATCH / 2, 0, NROW - PATCH), b, sh, lo, hi;
	if (row == patchRow) return false;
	sh = (row - patchRow) * FPR;
	if (patchRow < 0 || Math.abs(sh) >= rows) { lo = 0; hi = rows; }
	else {
		// keep the rows that stay, calculate the new rows
		moveData(nearPos, sh * NCOL * 3); moveData(nearNor, sh * NCOL * 3); moveData(nearCol, sh * NCOL * 3);
		moveData(nearUv, sh * NCOL * 2); moveData(nearH, sh * NCOL);
		if (sh > 0) { lo = rows - sh + 1; hi = rows; } else { lo = 0; hi = -sh - 1; }
	}
	for (b = lo; b <= hi; b++) nearRow(row, b);
	for (b = Math.max(0, lo - 1); b <= Math.min(rows, hi + 1); b++) nearShade(row, b);
	nearGeo.attributes.position.needsUpdate = true;
	nearGeo.attributes.normal.needsUpdate = true;
	nearGeo.attributes.color.needsUpdate = true;
	nearGeo.attributes.uv.needsUpdate = true;
	if (patchRow >= 0) farHole(patchRow, 0);
	farHole(row, -500);
	farGeo.attributes.position.needsUpdate = true;
	patchRow = row;
	return true;
}

// ---------- trees ----------

var treeMesh = null, rockMesh = null, iceMesh = null, markMesh = null;
var treesDirty = true;
var OB = {};

function makeTrees(scene) {
	var geo = partsGeo([
		['c', 0.22, 0.3, 1.6, 0, 0.8, 0, 0x4a3524, 0, 0, 0, 5],
		['c', 0, 2.3, 4.6, 0, 3.5, 0, 0x1f4a35, 0, 0, 0, 6],
		['c', 0, 1.7, 3.8, 0, 5.6, 0, 0x2c5e45, 0, 0.5, 0, 6],
		['c', 0, 1.0, 2.6, 0, 7.3, 0, 0xc9dcd6, 0, 0, 0, 6]
	]);
	treeMesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), 3600);
	treeMesh.frustumCulled = false;
	scene.add(treeMesh);
	rockMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x6f6862, flatShading: true }), 500);
	rockMesh.frustumCulled = false;
	scene.add(rockMesh);
	iceMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 1, 1, 5), new THREE.MeshLambertMaterial({ color: 0xa8dcf2, flatShading: true }), 700);
	iceMesh.frustumCulled = false;
	scene.add(iceMesh);
	// piste markers: orange on the left, blue on the right
	markMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 5), new THREE.MeshBasicMaterial({ color: 0xffffff }), 400);
	markMesh.frustumCulled = false;
	scene.add(markMesh);
}

function setInstance(arr, n, x, y, z, sx, sy, rot) {
	var k = n * 16, c = Math.cos(rot) * sx, s = Math.sin(rot) * sx;
	arr[k] = c; arr[k + 1] = 0; arr[k + 2] = -s; arr[k + 3] = 0;
	arr[k + 4] = 0; arr[k + 5] = sy; arr[k + 6] = 0; arr[k + 7] = 0;
	arr[k + 8] = s; arr[k + 9] = 0; arr[k + 10] = c; arr[k + 11] = 0;
	arr[k + 12] = x; arr[k + 13] = y; arr[k + 14] = z; arr[k + 15] = 1;
}

// updateTrees puts the trees, rocks, ice blocks and piste markers around you.
function updateTrees(px, pz) {
	var ci0 = Math.floor(px / TC), cj0 = Math.floor(pz / TC), i, j, nt = 0, nr = 0, ni = 0, nm = 0, s, dist, t, t0, x, z, side;
	var ta = treeMesh.instanceMatrix.array, ra = rockMesh.instanceMatrix.array, ia = iceMesh.instanceMatrix.array, ma = markMesh.instanceMatrix.array;
	var far = TREE_R * TC, c = new THREE.Color();
	for (j = cj0 - TREE_R; j <= cj0 + TREE_R; j++) {
		for (i = ci0 - TREE_R; i <= ci0 + TREE_R; i++) {
			obstacleAt(i, j, OB);
			if (!OB.kind) continue;
			dist = Math.sqrt((OB.x - px) * (OB.x - px) + (OB.z - pz) * (OB.z - pz));
			if (dist > far) continue;
			s = sstep(far, far - 90, dist);
			if (OB.kind == 1 && nt < 3600) setInstance(ta, nt++, OB.x, OB.y - 0.3, OB.z, OB.h / 8.6 * s, OB.h / 8.6 * s, hash2(i, j + 5) * 6.28);
			else if (OB.kind == 2 && nr < 500) setInstance(ra, nr++, OB.x, OB.y, OB.z, OB.r * 1.3, OB.h * 0.8, hash2(i, j + 5) * 6.28);
			else if (OB.kind == 3 && ni < 700) setInstance(ia, ni++, OB.x, OB.y + OB.h * 0.4 * s, OB.z, OB.r * 1.25 * s, OB.h * s, hash2(i, j + 5) * 6.28);
		}
	}
	treeMesh.count = nt; treeMesh.instanceMatrix.needsUpdate = true;
	rockMesh.count = nr; rockMesh.instanceMatrix.needsUpdate = true;
	iceMesh.count = ni; iceMesh.instanceMatrix.needsUpdate = true;
	t0 = Math.floor((Z0 - pz) / 40) * 40;
	for (t = t0 - 480; t <= t0 + 800; t += 40) {
		if (t < 0 || t > T_END) continue;
		for (side = -1; side <= 1; side += 2) {
			x = pisteX(t) + side * (widthAt(t) + 1); z = Z0 - t;
			setInstance(ma, nm, x, groundAt(x, z) + 1.0, z, 1, 1, 0);
			markMesh.setColorAt(nm++, c.setHex(side < 0 ? 0xff5a1f : 0x1f6fff));
		}
	}
	// crevasses: a row of thick red poles on the top edge. The gap in the row is the way around.
	for (i = 0; i < CREV_N; i++) {
		t = CREV_T0 + i * CREV_GAP;
		if (Math.abs(t - (Z0 - pz)) > 600) continue;
		s = widthAt(t);
		for (side = -s - 10; side <= s + 10 && nm < 400; side += 9) {
			if (crevAt(t + 8 * Math.sin(side / 22 + i), side) < 0.5) continue;
			z = Z0 - (t + 8 * Math.sin(side / 22 + i) - 4.5); x = pisteX(Z0 - z) + side;
			setInstance(ma, nm, x, groundAt(x, z) + 1.6, z, 3, 1.5, 0);
			markMesh.setColorAt(nm++, c.setHex(0xff1030));
		}
	}
	markMesh.count = nm; markMesh.instanceMatrix.needsUpdate = true;
	if (markMesh.instanceColor) markMesh.instanceColor.needsUpdate = true;
}

// ---------- piste objects ----------

var cabins = null, liftPts = [];

function banner(scene, t, text, back) {
	var x = pisteX(t), z = Z0 - t, y = groundAt(x, z), g = new THREE.Group();
	var post = new THREE.MeshLambertMaterial({ color: 0x30343a });
	var p1 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 10, 0.4), post), p2 = p1.clone();
	p1.position.set(-16, 5, 0); p2.position.set(16, 5, 0);
	var b = new THREE.Mesh(new THREE.PlaneGeometry(32, 2.6), new THREE.MeshBasicMaterial({ map: textTexture(text, 1024, 96, back, '#ffffff'), side: THREE.DoubleSide }));
	b.position.set(0, 8.6, 0);   // the text is read from the south (uphill) side
	g.add(p1, p2, b);
	g.position.set(x, y - 0.5, z); g.rotation.y = pisteDir(t);
	scene.add(g);
}

function makePisteObjects(scene) {
	var i, k, t, x, z, y, m, n, h, c = new THREE.Color(), arr, dir;

	banner(scene, 22, 'START', '#c8102e');
	banner(scene, T_END, 'FINISH', '#1e5fbf');

	// houses: one geometry, many copies. Base buildings have a dark color.
	var house = partsGeo([
		['b', 8, 4, 10, 0, 2, 0, 0x9a6844],
		['b', 8.2, 1.2, 10.2, 0, 0.6, 0, 0xc9c4bb],
		['b', 6.2, 0.5, 11.4, -2.35, 5.2, 0, 0xf4f7fa, 0, 0, 0.62],
		['b', 6.2, 0.5, 11.4, 2.35, 5.2, 0, 0xf4f7fa, 0, 0, -0.62],
		['b', 7.6, 2.4, 9.8, 0, 4.6, 0, 0x86583a],
		['b', 1.2, 1.4, 0.2, -2, 2.4, -5.05, 0xffd98a],
		['b', 1.2, 1.4, 0.2, 2, 2.4, -5.05, 0xffd98a],
		['b', 1.3, 2.2, 0.2, 0, 1.3, 5.05, 0x3a2a1c],
		['b', 0.9, 2.2, 0.9, 2.2, 6.6, 2.5, 0x8c8279]
	]);
	var houses = new THREE.InstancedMesh(house, new THREE.MeshLambertMaterial({ vertexColors: true }), HOUSES.length);
	arr = houses.instanceMatrix.array;
	for (i = 0; i < HOUSES.length; i++) {
		h = HOUSES[i];
		setInstance(arr, i, h.x, h.y, h.z, h.s, h.s, h.rot);
		houses.setColorAt(i, c.setHex(h.kind ? 0x6f7a80 : 0xffffff));
	}
	houses.frustumCulled = false;
	scene.add(houses);

	// bases: watchtowers, a pad for the helicopter, a mast
	var tower = partsGeo([
		['b', 0.3, 7, 0.3, -1.4, 3.5, -1.4, 0x4a4f55], ['b', 0.3, 7, 0.3, 1.4, 3.5, -1.4, 0x4a4f55], ['b', 0.3, 7, 0.3, -1.4, 3.5, 1.4, 0x4a4f55], ['b', 0.3, 7, 0.3, 1.4, 3.5, 1.4, 0x4a4f55],
		['b', 3.6, 0.3, 3.6, 0, 6.2, 0, 0x5b4a3a], ['b', 3.6, 1.0, 0.15, 0, 6.9, -1.75, 0x5b4a3a], ['b', 3.6, 1.0, 0.15, 0, 6.9, 1.75, 0x5b4a3a],
		['b', 0.15, 1.0, 3.6, -1.75, 6.9, 0, 0x5b4a3a], ['b', 0.15, 1.0, 3.6, 1.75, 6.9, 0, 0x5b4a3a], ['b', 4.2, 0.3, 4.2, 0, 9.0, 0, 0xf4f7fa],
		['b', 0.15, 2.0, 0.15, -1.7, 8.0, -1.7, 0x4a4f55], ['b', 0.15, 2.0, 0.15, 1.7, 8.0, 1.7, 0x4a4f55], ['b', 0.15, 2.0, 0.15, -1.7, 8.0, 1.7, 0x4a4f55], ['b', 0.15, 2.0, 0.15, 1.7, 8.0, -1.7, 0x4a4f55]
	]);
	var mat = new THREE.MeshLambertMaterial({ vertexColors: true });
	for (k = 0; k < COMP.length; k++) {
		for (i = 0; i < COMP[k].towers.length; i++) {
			t = COMP[k].towers[i][0]; x = pisteX(t) + COMP[k].towers[i][1]; z = Z0 - t;
			m = new THREE.Mesh(tower, mat); m.position.set(x, groundAt(x, z) - 0.4, z);
			scene.add(m);
		}
		if (COMP[k].heli) {
			t = COMP[k].heli[0]; x = pisteX(t) + COMP[k].heli[1]; z = Z0 - t;
			m = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 0.5, 20), new THREE.MeshLambertMaterial({ color: 0x3d4248 }));
			m.position.set(x, groundAt(x, z) + 0.6, z);
			scene.add(m);
		}
		// mast with a red light at the gate of the base
		t = COMP[k].t0 + 20; x = pisteX(t) - 62; z = Z0 - t;
		m = new THREE.Mesh(partsGeo([['b', 0.4, 26, 0.4, 0, 13, 0, 0x8a9096], ['b', 3, 0.2, 0.2, 0, 22, 0, 0x8a9096], ['b', 2, 0.2, 0.2, 0, 18, 0, 0x8a9096], ['b', 0.6, 0.6, 0.6, 0, 26.3, 0, 0xff2020]]), mat);
		m.position.set(x, groundAt(x, z) - 0.5, z);
		scene.add(m);
	}

	// lift: pylons, two cables, cabins. It is 55 m to the right of the piste edge.
	var pylon = partsGeo([
		['b', 0.6, 13, 0.6, 0, 6.5, 0, 0x5a6068],
		['b', 5.2, 0.4, 0.6, 0, 12.8, 0, 0x5a6068]
	]);
	var pylons = new THREE.InstancedMesh(pylon, mat, 60);
	arr = pylons.instanceMatrix.array;
	var c1 = [], c2 = [];
	n = 0;
	for (t = 30; t <= 7790; t += 160) {
		x = pisteX(t) + liftD(tIndex(t)); z = Z0 - t; y = groundAt(x, z); dir = pisteDir(t);
		setInstance(arr, n++, x, y, z, 1, 1, dir);
		liftPts.push(x, y + 12.3, z, dir);
		c1.push(x - 2.3 * Math.cos(dir), y + 12.5, z + 2.3 * Math.sin(dir));
		c2.push(x + 2.3 * Math.cos(dir), y + 12.5, z - 2.3 * Math.sin(dir));
	}
	pylons.count = n; pylons.frustumCulled = false;
	scene.add(pylons);
	var lineMat = new THREE.LineBasicMaterial({ color: 0x30343a });
	for (i = 0; i < 2; i++) {
		m = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(i ? c2 : c1, 3)), lineMat);
		m.frustumCulled = false;
		scene.add(m);
	}
	var cabin = partsGeo([
		['b', 1.8, 2.0, 2.2, 0, -3.0, 0, 0xd8232a],
		['b', 1.85, 0.8, 2.25, 0, -2.7, 0, 0x26313d],
		['b', 0.12, 2.0, 0.12, 0, -1.0, 0, 0x30343a]
	]);
	cabins = new THREE.InstancedMesh(cabin, mat, 24);
	cabins.frustumCulled = false;
	scene.add(cabins);
}

function updateCabins(time) {
	var arr = cabins.instanceMatrix.array, np = liftPts.length / 4, i, u, k, f, x, y, z, dir, side;
	for (i = 0; i < 24; i++) {
		side = i % 2 ? 1 : -1;                                   // one cable goes up, one goes down
		u = ((i / 24 + side * time * 0.0025) % 1 + 1) % 1 * (np - 1);
		k = Math.min(np - 2, Math.floor(u)); f = u - k;
		x = lerp(liftPts[k * 4], liftPts[k * 4 + 4], f); y = lerp(liftPts[k * 4 + 1], liftPts[k * 4 + 5], f);
		z = lerp(liftPts[k * 4 + 2], liftPts[k * 4 + 6], f); dir = liftPts[k * 4 + 3];
		setInstance(arr, i, x + side * 2.3 * Math.cos(dir), y, z - side * 2.3 * Math.sin(dir), 1, 1, dir);
	}
	cabins.instanceMatrix.needsUpdate = true;
}

// ---------- sky ----------

var skyGroup = null;

function makeSky(scene) {
	var i, u, c = new THREE.Color(), fog = new THREE.Color(FOG_COLOR), top = new THREE.Color(SKY_COLOR);
	skyGroup = new THREE.Group();

	var g = new THREE.SphereGeometry(20000, 24, 12), p = g.attributes.position, col = new Float32Array(p.count * 3);
	for (i = 0; i < p.count; i++) {
		u = Math.pow(clamp(p.getY(i) / 20000, 0, 1), 0.55);
		c.copy(fog).lerp(top, u);
		col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
	}
	g.setAttribute('color', new THREE.BufferAttribute(col, 3));
	var dome = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
	dome.renderOrder = -2;
	skyGroup.add(dome);

	// sun
	var cv = document.createElement('canvas'); cv.width = cv.height = 128;
	var x = cv.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
	gr.addColorStop(0, 'rgba(255,255,245,1)'); gr.addColorStop(0.12, 'rgba(255,250,225,1)'); gr.addColorStop(0.3, 'rgba(255,240,200,0.35)'); gr.addColorStop(1, 'rgba(255,240,200,0)');
	x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
	var sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), fog: false, depthWrite: false, depthTest: false, transparent: true }));
	sun.position.copy(SUN_DIR).multiplyScalar(18000); sun.scale.set(6000, 6000, 1); sun.renderOrder = -1;
	skyGroup.add(sun);

	// far mountains: a ring of peaks around the world
	var pos = [], cl = [], n = 120, a0, a1, h0, h1, r = 15000, base = new THREE.Color(FOG_COLOR), peak = new THREE.Color(0xf6f9fc).lerp(base, 0.45);
	function ringH(i) { i = (i % n + n) % n; return 2900 + 1500 * hash2(i, 77) + 900 * hash2(Math.floor(i / 5), 78); }
	for (i = 0; i < n; i++) {
		a0 = i / n * 6.2832; a1 = (i + 1) / n * 6.2832; h0 = ringH(i); h1 = ringH(i + 1);
		pos.push(r * Math.cos(a0), -500, r * Math.sin(a0), r * Math.cos(a0), h0, r * Math.sin(a0), r * Math.cos(a1), -500, r * Math.sin(a1));
		pos.push(r * Math.cos(a1), -500, r * Math.sin(a1), r * Math.cos(a0), h0, r * Math.sin(a0), r * Math.cos(a1), h1, r * Math.sin(a1));
		cl.push(base.r, base.g, base.b, peak.r, peak.g, peak.b, base.r, base.g, base.b, base.r, base.g, base.b, peak.r, peak.g, peak.b, peak.r, peak.g, peak.b);
	}
	g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
	var ring = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false }));
	ring.renderOrder = -1;
	skyGroup.add(ring);
	scene.add(skyGroup);

	// ground below and around the terrain
	var floor = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000), new THREE.MeshBasicMaterial({ color: 0x9fb4b8 }));
	floor.rotation.x = -Math.PI / 2; floor.position.y = 700;
	scene.add(floor);

	scene.fog = new THREE.Fog(FOG_COLOR, 300, 8500);
	scene.background = new THREE.Color(FOG_COLOR);
	var sunLight = new THREE.DirectionalLight(0xfff4e0, 3.8);
	sunLight.position.copy(SUN_DIR);
	scene.add(sunLight);
	scene.add(new THREE.HemisphereLight(0xbcd6ff, 0xf2f6ff, 1.3));
}

// ---------- update ----------

// makeData makes all the tables and lists. It needs no drawing, so the tests in Node use it also.
function makeData() {
	makeProfile();
	makeFeatures();
	makeHouses();
}

function makeWorld(scene) {
	makeData();
	makeCols();
	snowMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: makeSnowTexture() });
	makeFar(scene);
	makeNear(scene);
	makeTrees(scene);
	makePisteObjects(scene);
	makeSky(scene);
}

// updateWorld moves the near terrain, the trees and the sky to your position.
// The terrain and the trees are done in different frames, to keep each frame short.
function updateWorld(px, pz, time) {
	if (updatePatch(Z0 - pz)) treesDirty = true;
	else if (treesDirty) { updateTrees(px, pz); treesDirty = false; }
	skyGroup.position.set(px, 0, pz);
	updateCabins(time);
}
