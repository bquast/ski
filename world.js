// world.js - the mountain, the trees, the houses, the sky, the two looks.
// Classic script. It uses THREE from three.min.js.
// Units are meters. North is -z. East is +x. The run goes north, down the mountain.
//
// Mountain coordinates:
//   t = distance down the run (t = Z0 - z). t = 0 is the start gate. t = T_END is the finish line.
//   d = distance to the east of the center line (d = x - pisteX(t)). East is on your right.
//
// The mountain is open: you can ski on the full width of the face (the "open" value, 200 to 360 m to each side).
// The center line is a narrow groomed piste (the ribbon). It is the easy way down.
// The run is a list of sections (SEC). Each section has its own steepness, width, relief, moguls, trees, ice and rollers.
// makeProfile() makes one table for each of these, with one value for each meter of t.
//
// ski.js, guns.js and chase.js use groundAt(), normalAt(), pisteX(), pisteDir(), obstacleAt(),
// crevAt(), surfaceAt(), the tables, HOUSES and COMP.
// main.js calls makeWorld() one time, setTheme() for the look, and updateWorld() each frame.
//
// Order of this file:
//   constants, math, noise, sections, jumps, crevasses, heights, obstacles, houses and bases,
//   colors, parts, terrain mesh, trees, piste objects, sky, looks, update.

// ---------- constants ----------

var Z0 = 4000;           // z of the start gate
var T_END = 7900;        // finish line
var T_OFF = 900;         // the tables start at t = -900
var NT = 9801;           // size of the tables (t = -900 to 8900)
var CELL = 48;           // far terrain: cell size (along t and along d)
var NROW = 200;          // far terrain: number of cells along t (t = -800 to 8800)
var D_FINE = 1728;       // far terrain: the cells are 48 m wide from -D_FINE to +D_FINE, and wider outside
var SUB = 16;            // near cells in one far cell (3 m)
var PT = 12;             // near terrain: length along t, in far cells (576 m)
var PD = 10;             // near terrain: width along d, in far cells (480 m)
var RIBBON = 18;         // half width of the groomed piste
var LIFT_D = 85;         // the lift line is this far to the right of the center line
var TREELINE = 2000;     // no trees above this height
var TC = 16;             // obstacle grid: cell size
var TREE_R = 35;         // trees are drawn this many cells around you (560 m)
var D_MAX = 1400;        // you cannot go farther than this from the center line
var START_T = [0, 2500, 5540];  // TOP, UPPER BASE, LOWER BASE
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

// Each line: start t, steepness, open half width, gully half width (0 = no gully), gully wall steepness, moguls,
// trees on the open face, ice, rollers, clear (no trees, jumps or relief: start, overlooks, bases, village),
// length of the change from the section before, relief (hills, bowls and spurs on the face), name.
var SEC = [
	[0,    0.03, 200, 0,  0,   0, 0,    0, 0.0, 1, 30, 0.0,  'SUMMIT'],
	[30,   0.60, 320, 0,  0,   0, 0,    0, 0.4, 0, 40, 1.0,  'HEADWALL'],
	[700,  0.22, 360, 0,  0,   0, 0,    1, 1.0, 0, 60, 0.3,  'GLACIER'],
	[1900, 0.50, 300, 0,  0,   0, 0,    0, 0.7, 0, 60, 1.0,  'ICEFALL'],
	[2500, 0.03, 220, 0,  0,   0, 0,    0, 0.0, 1, 40, 0.0,  'OVERLOOK'],
	[2640, 0.58, 220, 0,  0,   0, 0,    0, 0.0, 1, 26, 0.0,  'UPPER BASE'],
	[2840, 0.05, 220, 0,  0,   0, 0,    0, 0.0, 1, 40, 0.0,  'UPPER BASE'],
	[3070, 0.50, 320, 13, 1.3, 0, 0,    0, 0.5, 0, 50, 0.8,  'THE GULLY'],
	[3860, 0.36, 300, 0,  0,   1, 0,    0, 0.3, 0, 50, 0.6,  'MOGULS'],
	[4400, 0.28, 320, 0,  0,   0, 1,    0, 0.8, 0, 60, 0.8,  'THE TREES'],
	[5540, 0.03, 220, 0,  0,   0, 0,    0, 0.0, 1, 40, 0.0,  'OVERLOOK'],
	[5680, 0.58, 220, 0,  0,   0, 0,    0, 0.0, 1, 26, 0.0,  'LOWER BASE'],
	[5880, 0.05, 220, 0,  0,   0, 0,    0, 0.0, 1, 40, 0.0,  'LOWER BASE'],
	[6130, 0.38, 300, 0,  0,   0, 0.35, 0, 1.0, 0, 50, 1.0,  'THE CLIFFS'],
	[7150, 0.16, 200, 0,  0,   0, 0,    0, 0.3, 1, 60, 0.0,  'VILLAGE'],
	[7800, 0.02, 200, 0,  0,   0, 0,    0, 0.0, 1, 40, 0.0,  'FINISH']
];

// The tables: one value for each meter of t.
var ELEV = new Float32Array(NT);     // height of the center line
var PS = new Float32Array(NT);       // open half width
var PGUL = new Float32Array(NT);     // gully half width
var PWALL = new Float32Array(NT);    // steepness of the gully walls
var PMOG = new Float32Array(NT);     // moguls: 0 to 1
var PTREE = new Float32Array(NT);    // trees on the open face: 0 to 1
var PICE = new Float32Array(NT);     // glacier: 0 to 1
var PROLL = new Float32Array(NT);    // rollers: 0 to 1
var PCLEAR = new Float32Array(NT);   // 1 = no trees, jumps or relief
var PREL = new Float32Array(NT);     // relief: 0 to 1
var PSEC = new Uint8Array(NT);       // index of the section

function makeProfile() {
	var slope = new Float32Array(NT), rel = new Float32Array(NT), i, j, k = 0, t, s, n, u, sum;
	for (i = 0; i < NT; i++) {
		t = i - T_OFF;
		while (k < SEC.length - 1 && t >= SEC[k + 1][0]) k++;
		s = SEC[k]; n = k < SEC.length - 1 ? SEC[k + 1] : s;
		u = sstep(n[0] - n[10], n[0], t);       // change to the next section
		slope[i] = lerp(s[1], n[1], u); PS[i] = lerp(s[2], n[2], u); PGUL[i] = lerp(s[3], n[3], u); PWALL[i] = lerp(s[4], n[4], u);
		PMOG[i] = lerp(s[5], n[5], u); PTREE[i] = lerp(s[6], n[6], u); PICE[i] = lerp(s[7], n[7], u); PROLL[i] = lerp(s[8], n[8], u);
		PCLEAR[i] = Math.max(s[9], n[9] * (u > 0 ? 1 : 0)); rel[i] = s[11]; PSEC[i] = k;
		if (t < -40) { slope[i] = 0.45; rel[i] = 1; }       // the mountain goes up behind the start
		else if (t < 0) slope[i] = 0.02;
		if (t > T_END) slope[i] = -0.035 * sstep(7900, 7960, t) - 0.3 * sstep(8200, 8500, t);   // run-out, then the opposite valley side
	}
	ELEV[T_OFF] = 3550;
	for (i = T_OFF; i < NT - 1; i++) ELEV[i + 1] = ELEV[i] - (slope[i] + slope[i + 1]) / 2;
	for (i = T_OFF; i > 0; i--) ELEV[i - 1] = ELEV[i] + (slope[i] + slope[i - 1]) / 2;
	// relief: a slow change between sections (the average of 100 m), so there is no sudden wall
	sum = 0;
	for (i = 0; i < 101; i++) sum += rel[i];
	for (i = 0; i < NT; i++) {
		PREL[i] = sum / 101;
		j = i - 50;
		if (j >= 0 && j + 101 < NT) sum += rel[j + 101] - rel[j];
	}
	// gully: it is cut into the face. It gets deeper in the first 250 m of its section, and less deep in the last 250 m.
	for (k = 0; k < SEC.length - 1; k++) {
		s = SEC[k]; n = SEC[k + 1];
		if (s[3] == 0) continue;
		for (t = s[0] - 60; t <= n[0] + 60; t++) {
			i = t + T_OFF;
			PWALL[i] = s[4] * sstep(s[0], s[0] + 250, t) * (1 - sstep(n[0] - 250, n[0], t));
			PGUL[i] = s[3];
		}
	}
}

function elevAt(t) {
	var u = clamp(t + T_OFF, 0, NT - 1.01), i = Math.floor(u);
	return ELEV[i] + (ELEV[i + 1] - ELEV[i]) * (u - i);
}

function tIndex(t) { var i = Math.round(t) + T_OFF; return i < 0 ? 0 : i > NT - 1 ? NT - 1 : i; }
function openAt(t) { return PS[tIndex(t)]; }
function sectionName(t) { return SEC[PSEC[tIndex(t)]][12]; }

// inGully: are you (or an enemy) in the narrow gully at this position?
function inGully(t, d) { return PWALL[tIndex(t)] > 0.5 && Math.abs(d) < 50; }

// pisteX gives the x of the center line. In the gully the line has short, fast bends.
function pisteX(t) {
	var g = t > 3090 && t < 3840 ? sstep(3090, 3200, t) * (1 - sstep(3740, 3840, t)) : 0;
	return 260 * Math.sin(t / 830 + 0.5) + 110 * Math.sin(t / 290 + 2.1) - 219.6 + g * 14 * Math.sin(t / 38);   // 219.6 makes x = 0 at the start gate
}

// pisteDir gives the direction of the center line as a heading. 0 = north. Positive = to the left (west).
function pisteDir(t) {
	return Math.atan2(-(pisteX(t + 1) - pisteX(t - 1)) / 2, 1);
}

// ---------- jumps ----------

// FEAT: jump ramps (kind 1) and ledges (kind 2: a flat top, then a drop). They are on the full width of the face.
// t = position of the edge, d = center, w = half width, len = length before the edge, h = height.
var FEAT = [], FEAT_AT = [];

function makeFeatures() {
	var t = 150, n = 0, i, S, sec, r, ledge, f, b, d;
	while (t < 7120) {
		i = tIndex(t); S = PS[i]; sec = SEC[PSEC[i]][12];
		if (PCLEAR[i] > 0.5 || PCLEAR[tIndex(t - 60)] > 0.5) { t += 30; continue; }
		r = hash2(n, 911); d = (hash2(n, 3) - 0.5) * 1.84 * S; f = null;
		ledge = sec == 'ICEFALL' || sec == 'THE CLIFFS' ? 0.65 : sec == 'HEADWALL' || sec == 'MOGULS' || sec == 'THE GULLY' ? 0.4 : 0.2;
		if (PWALL[i] > 0.05 && Math.abs(d) < 80) f = null;                  // the gully gets its own ramps (see below)
		else if (r < ledge) f = { t: t, d: d, w: 14 + 40 * hash2(n, 4), len: 55, h: 2.5 + 4.5 * hash2(n, 5), kind: 2 };
		else { f = { t: t, d: d, w: 6 + 6 * hash2(n, 4), len: 0, h: 1.3 + 1.6 * hash2(n, 5), kind: 1 }; f.len = 14 + 4 * f.h; }
		if (f) FEAT.push(f);
		t += 9 + 14 * hash2(n, 77); n++;
	}
	for (t = 3160; t < 3800; t += 50 + 40 * hash2(n, 77), n++) FEAT.push({ t: t, d: 0, w: 5, len: 12, h: 0.9 + 0.7 * hash2(n, 5), kind: 1 });
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

// On the glacier there is a row of crevasses each 95 m. In each row, pieces of 160 m have gaps of 100 m between them.
// The gaps of one row are not in line with the gaps of the next row.
// crevAt gives 1 in a crevasse, 0 out of it. You must jump, or go through a gap.
var CREV_T0 = 800, CREV_GAP = 95, CREV_N = 11;

function crevPiece(k, d) { return Math.cos(d * 0.02417 + k * 2.3); }      // more than -0.35 = crevasse, less = gap

function crevAt(t, d) {
	var k = Math.round((t - CREV_T0) / CREV_GAP), u;
	if (k < 0 || k >= CREV_N) return 0;
	u = Math.abs(t - (CREV_T0 + k * CREV_GAP + 8 * Math.sin(d / 22 + k)));
	if (u > 3.4) return 0;
	return (1 - sstep(2.4, 3.4, u)) * sstep(-0.35, -0.2, crevPiece(k, d));
}

// lipAt: the top edge of each crevasse is a ramp of 1.2 m, so above 40 km/h you fly across.
// The ramp ends 3.6 m before the center of the crevasse.
function lipAt(t, d) {
	var k = Math.round((t - CREV_T0 + 10) / CREV_GAP), u;
	if (k < 0 || k >= CREV_N) return 0;
	u = t - (CREV_T0 + k * CREV_GAP + 8 * Math.sin(d / 22 + k)) + 3.6;
	if (u < -13 || u > 0) return 0;
	u = (u + 13) / 13;
	return 1.2 * u * u * sstep(-0.5, -0.3, crevPiece(k, d));
}

// ---------- heights ----------

// groundAt gives the height of the snow. All other height data comes from this function.
function groundAt(x, z) {
	var t = Z0 - z, d = x - pisteX(t), a = Math.abs(d);
	var u = clamp(t + T_OFF, 0, NT - 1.01), i = Math.floor(u), f = u - i;
	var h = ELEV[i] + (ELEV[i + 1] - ELEV[i]) * f, S = PS[i] + (PS[i + 1] - PS[i]) * f, wall = PWALL[i] + (PWALL[i + 1] - PWALL[i]) * f;
	var rel = PREL[i] + (PREL[i + 1] - PREL[i]) * f, rib = sstep(14, 40, a), am, e;
	if (wall > 0.01) { am = a < 60 ? a : 60; e = 2 * Math.max(PGUL[i], 4); h += wall * (am * am / (am + e) - 3600 / (60 + e)); rel *= sstep(45, 130, a); }   // the gully: cut into the face, with very steep sides
	if (a > S) { e = a - S; h += 0.3 * e * e / (e + 80); }                // the sides of the face go up
	if (rel > 0.01) h += rel * rib * (26 * vnoise(x / 420 + 1, z / 420) + 8 * vnoise(x / 130 + 3, z / 130) + 2.2 * vnoise(x / 48 + 9, z / 48));   // hills, bowls and spurs
	h += 0.35 * rib * (1 - PCLEAR[i]) * vnoise(x / 11, z / 11);           // small bumps off the groomed piste
	if (PMOG[i] > 0.01) h += PMOG[i] * 0.5 * Math.sin(x * 0.52) * Math.sin(z * 0.52) * sstep(10, 25, a);
	if (PROLL[i] > 0.01) h += PROLL[i] * 1.3 * Math.sin(0.157 * t + 0.8 * Math.sin(t / 97) + 2.5 * vnoise(x / 260 + 5, z / 260));   // rollers: at speed, each top is a jump
	if (PCLEAR[i] < 0.5) h += featAt(t, d);
	if (PICE[i] > 0.5) h += lipAt(t, d);
	if (a > 700) h += sstep(700, 1900, a) * (260 + 420 * fbm(x / 1000, z / 1000));   // high ridges on the two sides
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

// surfaceAt gives the snow type: 0 = groomed piste, 1 = ice, 2 = open snow.
function surfaceAt(x, z, t, d) {
	var i = tIndex(t);
	if (icePatch(x, z, i)) return 1;
	return Math.abs(d) < RIBBON ? 0 : 2;
}

// ---------- obstacles ----------

// roughHeight: the height at a point, without the details. It is used for the tree line.
function roughHeight(i, a) {
	var e = a - PS[i];
	return ELEV[i] + (e > 0 ? 0.3 * e * e / (e + 80) : 0) + (a > 700 ? sstep(700, 1900, a) * 260 : 0);
}

// forestAt gives the tree density (0 to 1) at a point.
function forestAt(x, z, t, d) {
	var a = Math.abs(d), i = tIndex(t), S = PS[i], h, g;
	if (a < RIBBON || t < -60 || t > 8350) return 0;
	h = roughHeight(i, a);
	if (h > TREELINE) return 0;
	if (Math.abs(d - LIFT_D) < 11) return 0;           // the lift line
	if (PCLEAR[i] > 0.5 && a < 230) return 0;          // overlooks, bases, village
	if (PWALL[i] > 0.05 && a < 70) return 0;
	g = 0.5 + 0.5 * vnoise(x / 140 + 31, z / 140);     // dense groups and open glades
	return g * Math.sqrt(g) * sstep(TREELINE, TREELINE - 200, h) * lerp(PTREE[i], 1, sstep(0.6 * S, S, a)) * sstep(RIBBON, RIBBON + 16, a);
}

// obstacleAt writes the tree, rock or ice block of one grid cell into o.
// o.kind: 0 = nothing, 1 = tree, 2 = rock, 3 = ice block. The result is always the same for the same cell.
function obstacleAt(ci, cj, o) {
	var x = (ci + 0.15 + 0.7 * hash2(ci + 7919, cj)) * TC, z = (cj + 0.15 + 0.7 * hash2(ci, cj + 104729)) * TC;
	var t = Z0 - z, d = x - pisteX(t), a = Math.abs(d), r = hash2(ci, cj), i, size = hash2(ci + 31, cj + 17), open;
	o.kind = 0;
	if (a > 1500 || a < RIBBON || t < 20 || t > 8350 || r > 0.8) return o;
	i = tIndex(t); open = a < PS[i];
	if (PCLEAR[i] > 0.5 && a < 230) return o;
	if (PWALL[i] > 0.05 && a < 16) return o;           // the floor of the gully is clear
	if (Math.abs(d - LIFT_D) < 11) return o;
	if (roughHeight(i, a) < TREELINE) {
		if (r > 0.8 * forestAt(x, z, t, d)) return o;
		o.kind = 1;
	} else if (PICE[i] > 0.5) {
		if (r > (open ? 0.045 : 0.2) || crevAt(t, d) > 0 || lipAt(t, d) > 0.05) return o;
		o.kind = 3;
	} else {
		if (r > (open ? 0.02 : 0.05) || featAt(t, d) > 0.02) return o;
		o.kind = 2;
	}
	if (o.kind == 1) { o.h = 6 + 8 * size; o.r = 0.45; }
	else if (o.kind == 2) { o.h = 1.2 + 2.2 * size; o.r = o.h * 0.75; }
	else { o.h = 3 + 5 * size; o.r = 1.2 + 1.4 * size; }
	o.x = x; o.y = groundAt(x, z); o.z = z;
	return o;
}

// ---------- houses and bases ----------

// HOUSES: all buildings that you can hit. kind 0 = house, 1 = base building, 2 = a part of the headquarters (no copy of the house model).
var HOUSES = [];

function addHouse(t, d, rot, s, kind, r, h) {
	var x = pisteX(t) + d, z = Z0 - t;
	HOUSES.push({ x: x, y: groundAt(x, z) - 0.5, z: z, t: t, d: d, rot: pisteDir(t) + rot, s: s, kind: kind, r: r || 6.2 * s, h: h || 6.5 * s });
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
var HQ = [6015, 135];    // the headquarters: a large concrete building at the lower base

function makeHouses() {
	var r, c, i, k, t, d, cols = [-70, -42, -14, 14, 42, 70];
	addHouse(-26, -24, 0.3, 1, 0);                                           // start hut
	for (i = 0; i < 6; i++) addHouse(4290 + i * 17, (i % 2 ? 1 : -1) * (30 + 35 * hash2(i, 21)), hash2(i, 22) * 3, 0.9 + 0.3 * hash2(i, 23), 0);   // houses below the moguls
	// village: rows of houses with streets between them. The center line goes through the middle street.
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
	// headquarters: three circles for the collision
	addHouse(HQ[0], HQ[1], 0, 1, 2, 17, 40); addHouse(HQ[0] - 26, HQ[1] + 4, 0, 1, 2, 13, 14); addHouse(HQ[0] + 26, HQ[1] + 4, 0, 1, 2, 13, 14);
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

// tintAt gives the surface type: -5 = rock wall, -4 = crevasse, -3 = ice, -2 = jump ramp, -1 = groomed piste, 0 to 1 = tree density.
function tintAt(x, z, h, near) {
	var t = Z0 - z, d = x - pisteX(t), i = tIndex(t), a = Math.abs(d);
	if (near && PICE[i] > 0.5 && crevAt(t, d) > 0.3) return -4;
	if (PCLEAR[i] < 0.5 && featAt(t, d) > 0.05 && featKind == 1) return -2;
	if (icePatch(x, z, i)) return -3;
	if (a < RIBBON) return -1;
	if (PWALL[i] > 0.8 && a < 75 && vnoise(x / 7, h / 5) > -0.25) return -5;      // the walls of the gully are rock with some snow
	return forestAt(x, z, t, d);
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

// The terrain is two grids in mountain coordinates (t, d). A point (t, d) is at x = pisteX(t) + d, z = Z0 - t.
// Far terrain: cells of 48 m, for the full mountain.
// Near terrain: cells of 3 m, 576 m x 480 m around you. It moves with you, one far cell at a time, along t and along d.
// The edge of the near terrain is on the lines of the far terrain, so there is no gap.
// The far points below the near terrain are moved down, so they are not seen.

var FCOL = [], NFC = 0, FC0 = 0;       // far columns: the d of each one, the number, the index of d = -D_FINE
var snowMat = null;
var farGeo = null, farPos = null, farBase = null, farTint = null, farNy = null;
var nearGeo = null, nearPos = null, nearNor = null, nearCol = null, nearUv = null;
var nearH = null, nearH2 = null;
var patchRow = -1, patchCol = -1;

function makeCols() {
	var d, step = 64, i, side = [];
	for (d = D_FINE + step; d < 4700; d += step) { side.push(d); step = Math.min(420, step * 1.35); }
	for (i = side.length - 1; i >= 0; i--) FCOL.push(-side[i]);
	FC0 = FCOL.length;
	for (d = -D_FINE; d <= D_FINE; d += CELL) FCOL.push(d);
	for (i = 0; i < side.length; i++) FCOL.push(side[i]);
	NFC = FCOL.length;
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

// gridIndex makes the triangles for a grid of rows x cols cells. Row + 1 is farther down the mountain (-z).
function gridIndex(rows, cols) {
	var idx = new Uint32Array(rows * cols * 6), k = 0, i, j, a, b, c, d;
	for (j = 0; j < rows; j++) {
		for (i = 0; i < cols; i++) {
			a = j * (cols + 1) + i; b = a + 1; c = a + cols + 1; d = c + 1;
			idx[k++] = a; idx[k++] = b; idx[k++] = c;
			idx[k++] = b; idx[k++] = d; idx[k++] = c;
		}
	}
	return idx;
}

function farColors() {
	var n = (NROW + 1) * NFC, k, col = farGeo.attributes.color.array;
	for (k = 0; k < n; k++) terrainColor(farTint[k], farNy[k], col, k * 3);
	farGeo.attributes.color.needsUpdate = true;
}

function makeFar(scene) {
	var n = (NROW + 1) * NFC, r, j, k, x, z, t, px, h, o = {};
	var nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
	farPos = new Float32Array(n * 3); farBase = new Float32Array(n * 3); farTint = new Float32Array(n); farNy = new Float32Array(n);
	for (r = 0; r <= NROW; r++) {
		t = -800 + r * CELL; z = Z0 - t; px = pisteX(t);
		for (j = 0; j < NFC; j++) {
			k = r * NFC + j; x = px + FCOL[j];
			h = groundAt(x, z); normalAt(x, z, o);
			farPos[k * 3] = farBase[k * 3] = x; farPos[k * 3 + 1] = farBase[k * 3 + 1] = h; farPos[k * 3 + 2] = farBase[k * 3 + 2] = z;
			nor[k * 3] = o.x; nor[k * 3 + 1] = o.y; nor[k * 3 + 2] = o.z;
			uv[k * 2] = x / 6; uv[k * 2 + 1] = z / 6;
			farTint[k] = tintAt(x, z, h, false); farNy[k] = o.y;
		}
	}
	farGeo = new THREE.BufferGeometry();
	farGeo.setAttribute('position', new THREE.BufferAttribute(farPos, 3));
	farGeo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
	farGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
	farGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
	farGeo.setIndex(new THREE.BufferAttribute(gridIndex(NROW, NFC - 1), 1));
	farColors();
	var mesh = new THREE.Mesh(farGeo, snowMat);
	mesh.frustumCulled = false;
	scene.add(mesh);
}

function makeNear(scene) {
	var n = (PT * SUB + 1) * (PD * SUB + 1);
	nearPos = new Float32Array(n * 3); nearNor = new Float32Array(n * 3); nearCol = new Float32Array(n * 3); nearUv = new Float32Array(n * 2);
	nearH = new Float32Array(n); nearH2 = new Float32Array(n);
	nearGeo = new THREE.BufferGeometry();
	nearGeo.setAttribute('position', new THREE.BufferAttribute(nearPos, 3));
	nearGeo.setAttribute('normal', new THREE.BufferAttribute(nearNor, 3));
	nearGeo.setAttribute('color', new THREE.BufferAttribute(nearCol, 3));
	nearGeo.setAttribute('uv', new THREE.BufferAttribute(nearUv, 2));
	nearGeo.setIndex(new THREE.BufferAttribute(gridIndex(PT * SUB, PD * SUB), 1));
	var mesh = new THREE.Mesh(nearGeo, snowMat);
	mesh.frustumCulled = false;
	scene.add(mesh);
}

function farHole(row, col, dy) {
	var r, c, k;
	for (r = row + 1; r < row + PT; r++) {
		for (c = FC0 + col + 1; c < FC0 + col + PD; c++) { k = r * NFC + c; farPos[k * 3 + 1] = farBase[k * 3 + 1] + dy; }
	}
}

// moveData moves the contents of an array n places to the start (n > 0) or to the end (n < 0).
function moveData(arr, n) {
	if (n > 0) arr.copyWithin(0, n); else if (n < 0) arr.copyWithin(-n, 0, arr.length + n);
}

// updatePatch moves the near terrain when you go into a different far cell. It returns true if it moved.
// It keeps the data of the points that stay, and calculates only the new points and the edges.
function updatePatch(pt, pd) {
	var NB = PT * SUB, NA = PD * SUB, n1 = NA + 1, step = CELL / SUB;
	var row = clamp(Math.floor((pt + 800) / CELL) - PT / 2, 0, NROW - PT);
	var col = clamp(Math.floor((pd + D_FINE) / CELL) - PD / 2, 0, 2 * D_FINE / CELL - PD);
	if (row == patchRow && col == patchCol) return false;
	var t0 = -800 + row * CELL, d0 = -D_FINE + col * CELL, keep = patchRow >= 0;
	var db = (row - patchRow) * SUB, da = (col - patchCol) * SUB;
	var a, b, k, oa, ob, t, d, x, y, z, h, px, sx, i, c, u, k0, k1, ka, kb, gx, gt, gz, l, tmp;

	// 1. heights: keep the old data where the old and new areas overlap. Crevasses are shown as deep cuts.
	for (b = 0; b <= NB; b++) {
		t = t0 + b * step; z = Z0 - t; px = pisteX(t); i = tIndex(t); ob = b + db;
		for (a = 0; a <= NA; a++) {
			k = b * n1 + a; oa = a + da;
			if (keep && oa >= 0 && oa <= NA && ob >= 0 && ob <= NB) nearH2[k] = nearH[ob * n1 + oa];
			else {
				d = d0 + a * step; h = groundAt(px + d, z);
				if (PICE[i] > 0.5) { c = crevAt(t, d); if (c > 0) h -= 14 * c; }
				nearH2[k] = h;
			}
		}
	}
	tmp = nearH; nearH = nearH2; nearH2 = tmp;

	// 2. positions, normals, colors
	if (keep) {
		k = db * n1 + da;
		moveData(nearPos, k * 3); moveData(nearNor, k * 3); moveData(nearCol, k * 3); moveData(nearUv, k * 2);
	}
	for (b = 0; b <= NB; b++) {
		t = t0 + b * step; z = Z0 - t; px = pisteX(t); ob = b + db;
		sx = (pisteX(t + 3) - pisteX(t - 3)) / 6;                         // the columns move to the side with the center line
		for (a = 0; a <= NA; a++) {
			oa = a + da;
			if (keep && a > 0 && a < NA && b > 0 && b < NB && oa > 0 && oa < NA && ob > 0 && ob < NB) continue;
			k = b * n1 + a; x = px + d0 + a * step; y = nearH[k];
			if (b == 0 || b == NB) {              // top and bottom edges: on the line between two far points
				k0 = (row + b / SUB) * NFC + FC0 + col + Math.floor(a / SUB); k1 = a == NA ? k0 : k0 + 1; u = (a % SUB) / SUB;
				nearPos[k * 3] = lerp(farBase[k0 * 3], farBase[k1 * 3], u); nearPos[k * 3 + 1] = lerp(farBase[k0 * 3 + 1], farBase[k1 * 3 + 1], u); nearPos[k * 3 + 2] = lerp(farBase[k0 * 3 + 2], farBase[k1 * 3 + 2], u);
			} else if (a == 0 || a == NA) {       // left and right edges
				k0 = (row + Math.floor(b / SUB)) * NFC + FC0 + col + a / SUB; k1 = k0 + NFC; u = (b % SUB) / SUB;
				nearPos[k * 3] = lerp(farBase[k0 * 3], farBase[k1 * 3], u); nearPos[k * 3 + 1] = lerp(farBase[k0 * 3 + 1], farBase[k1 * 3 + 1], u); nearPos[k * 3 + 2] = lerp(farBase[k0 * 3 + 2], farBase[k1 * 3 + 2], u);
			} else { nearPos[k * 3] = x; nearPos[k * 3 + 1] = y; nearPos[k * 3 + 2] = z; }
			ka = a > 0 ? k - 1 : k; kb = a < NA ? k + 1 : k; gx = (nearH[kb] - nearH[ka]) / ((kb - ka) * step);
			ka = b > 0 ? k - n1 : k; kb = b < NB ? k + n1 : k; gt = (nearH[kb] - nearH[ka]) / ((kb - ka) / n1 * step);   // along the column
			gz = gx * sx - gt;                                                // along z
			l = 1 / Math.sqrt(gx * gx + gz * gz + 1);
			nearNor[k * 3] = -gx * l; nearNor[k * 3 + 1] = l; nearNor[k * 3 + 2] = -gz * l;
			nearUv[k * 2] = x / 6; nearUv[k * 2 + 1] = z / 6;
			terrainColor(tintAt(x, z, y, true), l, nearCol, k * 3);
		}
	}
	nearGeo.attributes.position.needsUpdate = true;
	nearGeo.attributes.normal.needsUpdate = true;
	nearGeo.attributes.color.needsUpdate = true;
	nearGeo.attributes.uv.needsUpdate = true;

	// 3. the hole in the far terrain
	if (keep) farHole(patchRow, patchCol, 0);
	farHole(row, col, -500);
	farGeo.attributes.position.needsUpdate = true;
	patchRow = row; patchCol = col;
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
	treeMesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), 4200);
	treeMesh.frustumCulled = false;
	scene.add(treeMesh);
	rockMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x6f6862, flatShading: true }), 600);
	rockMesh.frustumCulled = false;
	scene.add(rockMesh);
	iceMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 1, 1, 5), new THREE.MeshLambertMaterial({ color: 0xa8dcf2, flatShading: true }), 900);
	iceMesh.frustumCulled = false;
	scene.add(iceMesh);
	// markers: orange and blue for the edges of the groomed piste, red for crevasses
	markMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 5), new THREE.MeshBasicMaterial({ color: 0xffffff }), 600);
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

// updateTrees puts the trees, rocks, ice blocks and markers around you.
function updateTrees(px, pz) {
	var ci0 = Math.floor(px / TC), cj0 = Math.floor(pz / TC), i, j, nt = 0, nr = 0, ni = 0, nm = 0, s, dist, t, t0, x, z, side, pt = Z0 - pz, pd = px - pisteX(pt), d;
	var ta = treeMesh.instanceMatrix.array, ra = rockMesh.instanceMatrix.array, ia = iceMesh.instanceMatrix.array, ma = markMesh.instanceMatrix.array;
	var far = TREE_R * TC, c = new THREE.Color();
	for (j = cj0 - TREE_R; j <= cj0 + TREE_R; j++) {
		for (i = ci0 - TREE_R; i <= ci0 + TREE_R; i++) {
			obstacleAt(i, j, OB);
			if (!OB.kind) continue;
			dist = Math.sqrt((OB.x - px) * (OB.x - px) + (OB.z - pz) * (OB.z - pz));
			if (dist > far) continue;
			s = sstep(far, far - 90, dist);
			if (OB.kind == 1 && nt < 4200) setInstance(ta, nt++, OB.x, OB.y - 0.3, OB.z, OB.h / 8.6 * s, OB.h / 8.6 * s, hash2(i, j + 5) * 6.28);
			else if (OB.kind == 2 && nr < 600) setInstance(ra, nr++, OB.x, OB.y, OB.z, OB.r * 1.3, OB.h * 0.8, hash2(i, j + 5) * 6.28);
			else if (OB.kind == 3 && ni < 900) setInstance(ia, ni++, OB.x, OB.y + OB.h * 0.4 * s, OB.z, OB.r * 1.25 * s, OB.h * s, hash2(i, j + 5) * 6.28);
		}
	}
	treeMesh.count = nt; treeMesh.instanceMatrix.needsUpdate = true;
	rockMesh.count = nr; rockMesh.instanceMatrix.needsUpdate = true;
	iceMesh.count = ni; iceMesh.instanceMatrix.needsUpdate = true;
	t0 = Math.floor(pt / 40) * 40;
	for (t = t0 - 480; t <= t0 + 800; t += 40) {
		if (t < 0 || t > T_END) continue;
		for (side = -1; side <= 1; side += 2) {
			x = pisteX(t) + side * (RIBBON + 1); z = Z0 - t;
			setInstance(ma, nm, x, groundAt(x, z) + 1.0, z, 1, 1, 0);
			markMesh.setColorAt(nm++, c.setHex(side < 0 ? 0xff5a1f : 0x1f6fff));
		}
	}
	// crevasses: a row of thick red poles on the top edge. A gap in the row is a way through.
	for (i = 0; i < CREV_N; i++) {
		t = CREV_T0 + i * CREV_GAP;
		if (Math.abs(t - pt) > 500) continue;
		for (d = Math.floor((pd - 330) / 12) * 12; d <= pd + 330 && nm < 600; d += 12) {
			if (crevAt(t + 8 * Math.sin(d / 22 + i), d) < 0.5) continue;
			z = Z0 - (t + 8 * Math.sin(d / 22 + i) - 4.5); x = pisteX(Z0 - z) + d;
			setInstance(ma, nm, x, groundAt(x, z) + 1.6, z, 3, 1.5, 0);
			markMesh.setColorAt(nm++, c.setHex(0xff1030));
		}
	}
	markMesh.count = nm; markMesh.instanceMatrix.needsUpdate = true;
	if (markMesh.instanceColor) markMesh.instanceColor.needsUpdate = true;
}

// ---------- piste objects ----------

var cabins = null, liftPts = [], houseMesh = [], objMat = null;

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

// houseSet makes one instanced mesh with a copy of geo for each house that passes the test.
function houseSet(scene, geo, test) {
	var m = new THREE.InstancedMesh(geo, objMat, HOUSES.length), n = 0, i, h;
	for (i = 0; i < HOUSES.length; i++) {
		h = HOUSES[i];
		if (h.kind == 2 || !test(h)) continue;
		setInstance(m.instanceMatrix.array, n++, h.x, h.y, h.z, h.s, h.s, h.rot);
	}
	m.count = n; m.frustumCulled = false;
	scene.add(m);
	return m;
}

function makePisteObjects(scene) {
	var i, k, t, x, z, y, m, n, arr, dir, CON = 0x8d9296, CON2 = 0x7b8085, SNW = 0xf2f5f8, WIN = 0x1c2228;
	objMat = new THREE.MeshLambertMaterial({ vertexColors: true });

	banner(scene, 22, 'START', '#c8102e');
	banner(scene, T_END, 'FINISH', '#1e5fbf');

	// houses: a wood chalet and a concrete block. Look 0: chalets, and blocks in the bases. Look 1: all are blocks.
	var chalet = partsGeo([
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
	var block = partsGeo([
		['b', 8.4, 5.2, 10.4, 0, 2.6, 0, CON], ['b', 9.0, 0.5, 11.0, 0, 5.45, 0, SNW], ['b', 5, 2.2, 6, 0.8, 6.6, 1, CON2], ['b', 5.5, 0.4, 6.5, 0.8, 7.9, 1, SNW],
		['b', 6.5, 0.7, 0.2, 0, 3.4, -5.25, WIN], ['b', 0.2, 0.7, 8, -4.25, 3.4, 0, WIN], ['b', 0.2, 0.7, 8, 4.25, 3.4, 0, WIN], ['b', 1.6, 2.4, 0.2, 0, 1.2, 5.25, WIN]
	]);
	houseMesh.push(houseSet(scene, chalet, function (h) { return h.kind == 0; }));
	houseMesh.push(houseSet(scene, block, function (h) { return h.kind == 1; }));
	houseMesh.push(houseSet(scene, block, function (h) { return true; }));

	// headquarters: a large concrete building with a tower, at the lower base
	t = HQ[0]; x = pisteX(t) + HQ[1]; z = Z0 - t;
	m = new THREE.Mesh(partsGeo([
		['b', 30, 22, 26, 0, 11, 0, CON], ['b', 31, 0.8, 27, 0, 22.4, 0, SNW], ['b', 18, 9, 16, -2, 27, 2, CON2], ['b', 19, 0.7, 17, -2, 31.8, 2, SNW],
		['b', 9, 42, 9, 12, 21, -9, CON2], ['b', 10, 0.7, 10, 12, 42.3, -9, SNW], ['b', 11, 3, 11, 12, 36, -9, WIN],
		['b', 0.3, 2, 22, -15.1, 16, 0, WIN], ['b', 0.3, 2, 22, -15.1, 10, 0, WIN], ['b', 0.3, 2, 22, -15.1, 4.5, 0, WIN],
		['b', 0.3, 2, 22, 15.1, 16, 0, WIN], ['b', 0.3, 2, 22, 15.1, 10, 0, WIN],
		['b', 26, 2, 0.3, 0, 16, 13.1, WIN], ['b', 26, 2, 0.3, 0, 10, 13.1, WIN], ['b', 26, 2, 0.3, 0, 16, -13.1, WIN],
		['b', 22, 10, 16, 0, 5, -26, CON2], ['b', 23, 0.7, 17, 0, 10.3, -26, SNW], ['b', 22, 10, 16, 0, 5, 26, CON2], ['b', 23, 0.7, 17, 0, 10.3, 26, SNW],
		['b', 18, 1.4, 0.3, 0, 6, -34.1, WIN], ['b', 18, 1.4, 0.3, 0, 6, 34.1, WIN]
	]), objMat);
	m.position.set(x, groundAt(x, z) - 1.5, z); m.rotation.y = pisteDir(t);
	scene.add(m);

	// bases: watchtowers, a pad for the helicopter, a mast
	var tower = partsGeo([
		['b', 0.3, 7, 0.3, -1.4, 3.5, -1.4, 0x4a4f55], ['b', 0.3, 7, 0.3, 1.4, 3.5, -1.4, 0x4a4f55], ['b', 0.3, 7, 0.3, -1.4, 3.5, 1.4, 0x4a4f55], ['b', 0.3, 7, 0.3, 1.4, 3.5, 1.4, 0x4a4f55],
		['b', 3.6, 0.3, 3.6, 0, 6.2, 0, 0x5b4a3a], ['b', 3.6, 1.0, 0.15, 0, 6.9, -1.75, 0x5b4a3a], ['b', 3.6, 1.0, 0.15, 0, 6.9, 1.75, 0x5b4a3a],
		['b', 0.15, 1.0, 3.6, -1.75, 6.9, 0, 0x5b4a3a], ['b', 0.15, 1.0, 3.6, 1.75, 6.9, 0, 0x5b4a3a], ['b', 4.2, 0.3, 4.2, 0, 9.0, 0, 0xf4f7fa],
		['b', 0.15, 2.0, 0.15, -1.7, 8.0, -1.7, 0x4a4f55], ['b', 0.15, 2.0, 0.15, 1.7, 8.0, 1.7, 0x4a4f55], ['b', 0.15, 2.0, 0.15, -1.7, 8.0, 1.7, 0x4a4f55], ['b', 0.15, 2.0, 0.15, 1.7, 8.0, -1.7, 0x4a4f55]
	]);
	for (k = 0; k < COMP.length; k++) {
		for (i = 0; i < COMP[k].towers.length; i++) {
			t = COMP[k].towers[i][0]; x = pisteX(t) + COMP[k].towers[i][1]; z = Z0 - t;
			m = new THREE.Mesh(tower, objMat); m.position.set(x, groundAt(x, z) - 0.4, z);
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
		m = new THREE.Mesh(partsGeo([['b', 0.4, 26, 0.4, 0, 13, 0, 0x8a9096], ['b', 3, 0.2, 0.2, 0, 22, 0, 0x8a9096], ['b', 2, 0.2, 0.2, 0, 18, 0, 0x8a9096], ['b', 0.6, 0.6, 0.6, 0, 26.3, 0, 0xff2020]]), objMat);
		m.position.set(x, groundAt(x, z) - 0.5, z);
		scene.add(m);
	}

	// lift: pylons, two cables, cabins
	var pylon = partsGeo([
		['b', 0.6, 13, 0.6, 0, 6.5, 0, 0x5a6068],
		['b', 5.2, 0.4, 0.6, 0, 12.8, 0, 0x5a6068]
	]);
	var pylons = new THREE.InstancedMesh(pylon, objMat, 60);
	arr = pylons.instanceMatrix.array;
	var c1 = [], c2 = [];
	n = 0;
	for (t = 30; t <= 7790; t += 160) {
		x = pisteX(t) + LIFT_D; z = Z0 - t; y = groundAt(x, z); dir = pisteDir(t);
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
	cabins = new THREE.InstancedMesh(cabin, new THREE.MeshLambertMaterial({ vertexColors: true }), 24);
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

var skyGroup = null, skyDome = null, skySun = null, skyRing = null, skyFloor = null, sunLight = null, hemiLight = null, flakes = null;
var FLAKE_N = 1500, FLAKE_BOX = 44;

function makeSky(scene) {
	var i, pos = [], cl = [], n = 120, a0, a1, h0, h1, r = 15000, g;
	skyGroup = new THREE.Group();

	g = new THREE.SphereGeometry(20000, 24, 12);
	g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3));
	skyDome = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
	skyDome.renderOrder = -2;
	skyGroup.add(skyDome);

	// sun
	var cv = document.createElement('canvas'); cv.width = cv.height = 128;
	var x = cv.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
	gr.addColorStop(0, 'rgba(255,255,245,1)'); gr.addColorStop(0.12, 'rgba(255,250,225,1)'); gr.addColorStop(0.3, 'rgba(255,240,200,0.35)'); gr.addColorStop(1, 'rgba(255,240,200,0)');
	x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
	skySun = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), fog: false, depthWrite: false, depthTest: false, transparent: true }));
	skySun.position.copy(SUN_DIR).multiplyScalar(18000); skySun.scale.set(6000, 6000, 1); skySun.renderOrder = -1;
	skyGroup.add(skySun);

	// far mountains: a ring of peaks around the world
	var base = new THREE.Color(0xdce8f2), peak = new THREE.Color(0xf6f9fc).lerp(base, 0.45);
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
	skyRing = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false }));
	skyRing.renderOrder = -1;
	skyGroup.add(skyRing);
	scene.add(skyGroup);

	// ground below and around the terrain
	skyFloor = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000), new THREE.MeshBasicMaterial({ color: 0x9fb4b8 }));
	skyFloor.rotation.x = -Math.PI / 2; skyFloor.position.y = 700;
	scene.add(skyFloor);

	// snowfall (look 1): points in a box that stays around you
	g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FLAKE_N * 3), 3));
	cv = document.createElement('canvas'); cv.width = cv.height = 32;
	x = cv.getContext('2d'); gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
	gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
	x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
	flakes = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.11, color: 0xffffff, map: new THREE.CanvasTexture(cv), transparent: true, opacity: 0.85, depthWrite: false, fog: false }));
	flakes.frustumCulled = false; flakes.visible = false;
	scene.add(flakes);

	scene.fog = new THREE.Fog(0xdce8f2, 300, 8500);
	scene.background = new THREE.Color(0xdce8f2);
	sunLight = new THREE.DirectionalLight(0xfff4e0, 3.8);
	sunLight.position.copy(SUN_DIR);
	scene.add(sunLight);
	hemiLight = new THREE.HemisphereLight(0xbcd6ff, 0xf2f6ff, 1.3);
	scene.add(hemiLight);
}

// updateFlakes: each snowflake has a fixed place in a box. The box repeats, and wind and time move the flakes through it.
function updateFlakes(px, py, pz, time) {
	var p = flakes.geometry.attributes.position.array, i, k, B = FLAKE_BOX, x, y, z;
	for (i = 0; i < FLAKE_N; i++) {
		k = i * 3;
		x = hash2(i, 1) * B + time * 3.5 - px; y = hash2(i, 2) * B - time * (1.6 + hash2(i, 4)) - py; z = hash2(i, 3) * B + time * 1.2 - pz;
		p[k] = px + ((x % B) + B) % B - B / 2; p[k + 1] = py + 1.5 + ((y % B) + B) % B - B / 2; p[k + 2] = pz + ((z % B) + B) % B - B / 2;
	}
	flakes.geometry.attributes.position.needsUpdate = true;
}

// ---------- looks ----------

// Look 0: alpine. Blue sky, sun, wood chalets, green trees.
// Look 1: snow fortress. Cloud, snowfall, short view, gray trees, concrete buildings. chase.js gives the enemies white suits.
var LOOKS = [
	{ fog: 0xdce8f2, near: 300, far: 8500, sky: 0x3f7fd0, sun: 3.8, sunColor: 0xfff4e0, hemi: 1.3, hemiSky: 0xbcd6ff, snow: 0xffffff, tree: 0xffffff, cabin: 0xffffff, iceBlock: 0xa8dcf2, rock: 0x6f6862, kick: 0x58a8ff, ice: 0xb4dcf0, forest: 0x5d7a6a, floor: 0x9fb4b8 },
	{ fog: 0xc6ccd2, near: 30, far: 1500, sky: 0xaab1b8, sun: 0.9, sunColor: 0xffffff, hemi: 2.9, hemiSky: 0xe4e8ec, snow: 0xe9edf1, tree: 0x7d8a8a, cabin: 0x9aa0a6, iceBlock: 0x9fb4c0, rock: 0x5f5f60, kick: 0xa9b6c2, ice: 0xbfd0da, forest: 0x7c8a88, floor: 0xb4bac0 }
];
var look = 0;

function setTheme(n) {
	var L = LOOKS[n], p = skyDome.geometry.attributes.position, col = skyDome.geometry.attributes.color.array, i, u, c = new THREE.Color(), fog = new THREE.Color(L.fog), top = new THREE.Color(L.sky);
	look = n;
	scene.fog.color.setHex(L.fog); scene.fog.near = L.near; scene.fog.far = L.far; scene.background.setHex(L.fog);
	for (i = 0; i < p.count; i++) {
		u = Math.pow(clamp(p.getY(i) / 20000, 0, 1), 0.55);
		c.copy(fog).lerp(top, u);
		col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
	}
	skyDome.geometry.attributes.color.needsUpdate = true;
	skySun.visible = skyRing.visible = n == 0;
	flakes.visible = n == 1;
	sunLight.intensity = L.sun; sunLight.color.setHex(L.sunColor); hemiLight.intensity = L.hemi; hemiLight.color.setHex(L.hemiSky);
	snowMat.color.setHex(L.snow); iceMesh.material.color.setHex(L.iceBlock); rockMesh.material.color.setHex(L.rock); treeMesh.material.color.setHex(L.tree); cabins.material.color.setHex(L.cabin); skyFloor.material.color.setHex(L.floor);
	houseMesh[0].visible = houseMesh[1].visible = n == 0; houseMesh[2].visible = n == 1;
	// terrain colors: new colors for the far terrain, and a new near terrain
	C_KICK.setHex(L.kick); C_ICE.setHex(L.ice); C_FOREST.setHex(L.forest);
	farColors();
	if (patchRow >= 0) { farHole(patchRow, patchCol, 0); patchRow = -1; patchCol = -1; }
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
function updateWorld(px, py, pz, time) {
	var pt = Z0 - pz;
	if (updatePatch(pt, px - pisteX(pt))) treesDirty = true;
	else if (treesDirty) { updateTrees(px, pz); treesDirty = false; }
	skyGroup.position.set(px, 0, pz);
	updateCabins(time);
	if (look == 1) updateFlakes(px, py, pz, time);
}
