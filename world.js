// world.js - the mountain, the piste, the trees, the sky.
// Classic script. It uses THREE from three.min.js.
// Units are meters. North is -z. East is +x. The run goes north, down the mountain.
//
// Piste coordinates:
//   t = distance down the run (t = Z0 - z). t = 0 is the start gate. t = T_END is the finish line.
//   d = distance to the east of the piste center (d = x - pisteX(t)). East is on your right.
//
// ski.js and chase.js use groundAt(), normalAt(), pisteX(), pisteDir() and obstacleAt().
// main.js calls makeWorld() one time, and updateWorld() each frame.
//
// Order of this file:
//   constants, math, noise, run profile, heights, obstacles, colors, parts,
//   far terrain, near terrain, trees, piste objects, sky, update.

// ---------- constants ----------

var HALF = 4800;         // the terrain goes from -HALF to +HALF
var CS = 48;             // far terrain: cell size
var NC = 200;            // far terrain: cells on each side
var FS = 3;              // near terrain: cell size
var FPC = 16;            // near cells in one far cell (CS / FS)
var PATCH = 10;          // near terrain: size, in far cells (480 m)
var NF = PATCH * FPC;    // near terrain: cells on each side
var Z0 = 4000;           // z of the start gate
var T_END = 7900;        // finish line
var TREELINE = 2150;     // no trees above this height
var TC = 16;             // obstacle grid: cell size
var TREE_R = 35;         // trees are drawn this many cells around you (560 m)
var PISTE_W = 38;        // half of the piste width
var START_T = [0, 2600, 5000];  // TOP, MIDDLE, LOW
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

// ---------- run profile ----------

// slopeAt gives the steepness of the piste (meters down for each meter forward).
function slopeAt(t) {
	if (t < -40) return 0.45;                 // the mountain goes up behind the start
	if (t < 4) return 0.02;                   // start platform
	if (t > 7900) return -0.035 * sstep(7900, 7960, t) - 0.3 * sstep(8200, 8500, t);  // run-out, then the opposite valley side
	var s = 0.25 + 0.085 * Math.sin(t / 410) + 0.075 * Math.sin(t / 147 + 1.3);
	if (t > 3000 && t < 3500) s += 0.13 * Math.pow(Math.sin(Math.PI * (t - 3000) / 500), 2);  // the wall
	if (t > 5200 && t < 5700) s -= 0.10 * Math.pow(Math.sin(Math.PI * (t - 5200) / 500), 2);  // the flat
	if (s < 0.05) s = 0.05;
	if (t < 45) s = lerp(0.02, s, sstep(4, 45, t));
	if (t > 7650) s = lerp(s, 0, sstep(7650, 7900, t));
	return s;
}

// ELEV is the height of the piste center for each meter of t, from t = -900 to t = 8900.
var ELEV = new Float32Array(9801);

function makeElev() {
	var i;
	ELEV[900] = 2950;
	for (i = 900; i < 9800; i++) ELEV[i + 1] = ELEV[i] - slopeAt(i - 900 + 0.5);
	for (i = 900; i > 0; i--) ELEV[i - 1] = ELEV[i] + slopeAt(i - 900 - 0.5);
}

function elevAt(t) {
	var u = clamp(t + 900, 0, 9799.99), i = Math.floor(u);
	return ELEV[i] + (ELEV[i + 1] - ELEV[i]) * (u - i);
}

// pisteX gives the x of the piste center.
function pisteX(t) {
	return 260 * Math.sin(t / 830 + 0.5) + 110 * Math.sin(t / 290 + 2.1) - 219.6;   // 219.6 makes x = 0 at the start gate
}

// pisteDir gives the direction of the piste as a heading. 0 = north. Positive = to the left (west).
function pisteDir(t) {
	return Math.atan2(-(pisteX(t + 1) - pisteX(t - 1)) / 2, 1);
}

// ---------- heights ----------

// kickAt gives the height of a jump ramp. There is one ramp each 560 m, left and right in turn.
var NKICK = 13;

function kickAt(t, d) {
	var i = Math.floor((t - 520 + 280) / 560);
	if (i < 0 || i >= NKICK) return 0;
	var u = t - (520 + i * 560), w = Math.abs(d - (i % 2 ? 13 : -13));
	if (u < -16 || u > 4 || w > 7) return 0;
	var p = u < 0 ? (u + 16) / 16 : 1 - u / 4;
	return (1.6 + (i % 3) * 0.3) * p * p * (1 - sstep(4, 7, w));
}

// groundAt gives the height of the snow. All other height data comes from this function.
function groundAt(x, z) {
	var t = Z0 - z, d = x - pisteX(t), a = Math.abs(d);
	var h = elevAt(t);
	h += a < 200 ? 0.0005 * a * a : 20 + 0.2 * (a - 200);        // the piste is the bottom of a wide valley
	if (a > 35) h += sstep(35, 70, a) * (0.4 * vnoise(x / 11, z / 11) + 2.2 * vnoise(x / 57 + 9, z / 57));  // bumps off the piste
	if (a > 250) h += sstep(250, 1400, a) * (260 + 420 * fbm(x / 1000, z / 1000));                         // ridges on the two sides
	else if (a < 21) h += kickAt(t, d);
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

// ---------- obstacles ----------

// forestAt gives the tree density (0 to 1) at a point. h is the ground height there.
function forestAt(x, z, t, d, h) {
	var a = Math.abs(d);
	if (a < PISTE_W || h > TREELINE || t < -60 || t > 8350) return 0;
	if (d > 60 && d < 82) return 0;               // the lift line
	if (t > 7700 && a < 170) return 0;            // the village
	return (0.5 + 0.5 * vnoise(x / 140 + 31, z / 140)) * sstep(TREELINE, TREELINE - 200, h) * (0.3 + 0.7 * sstep(44, 120, a)) * sstep(PISTE_W, 50, a);
}

// obstacleAt writes the tree or rock of one grid cell into o.
// o.kind: 0 = nothing, 1 = tree, 2 = rock. The result is always the same for the same cell.
function obstacleAt(ci, cj, o) {
	var x = (ci + 0.15 + 0.7 * hash2(ci + 7919, cj)) * TC, z = (cj + 0.15 + 0.7 * hash2(ci, cj + 104729)) * TC;
	var t = Z0 - z, d = x - pisteX(t), a = Math.abs(d), r = hash2(ci, cj);
	o.kind = 0;
	if (a < 44 || a > 1500 || t < -60 || t > 8350) return o;
	if (r > 0.85) return o;
	var h = groundAt(x, z);
	if (h < TREELINE) {
		if (r > 0.85 * forestAt(x, z, t, d, h)) return o;
		o.kind = 1; o.h = 6 + 8 * hash2(ci + 31, cj + 17); o.r = 0.45;
	} else {
		if (r > 0.035 || h > TREELINE + 900 || (d > 60 && d < 82)) return o;
		o.kind = 2; o.h = 1.2 + 2.2 * hash2(ci + 31, cj + 17); o.r = o.h * 0.75;
	}
	o.x = x; o.y = h; o.z = z;
	return o;
}

// ---------- colors ----------

var C_SNOW = new THREE.Color(0xf1f5fa);
var C_PISTE = new THREE.Color(0xffffff);
var C_ROCK = new THREE.Color(0x77706a);
var C_FOREST = new THREE.Color(0x5d7a6a);
var C_KICK = new THREE.Color(0x58a8ff);

// tintAt gives the surface type: -2 = jump ramp, -1 = piste, 0 to 1 = tree density.
function tintAt(x, z, h) {
	var t = Z0 - z, d = x - pisteX(t);
	if (Math.abs(d) < PISTE_W) return kickAt(t, d) > 0.04 ? -2 : -1;
	return forestAt(x, z, t, d, h);
}

// terrainColor writes the color for a surface type and a normal height (ny) into arr at index k.
function terrainColor(tint, ny, arr, k) {
	var c = tint == -2 ? C_KICK : tint == -1 ? C_PISTE : C_SNOW;
	var r = c.r, g = c.g, b = c.b, u;
	if (tint > 0) { u = tint * 0.62; r += (C_FOREST.r - r) * u; g += (C_FOREST.g - g) * u; b += (C_FOREST.b - b) * u; }
	if (ny < 0.8) { u = sstep(0.8, 0.62, ny); r += (C_ROCK.r - r) * u; g += (C_ROCK.g - g) * u; b += (C_ROCK.b - b) * u; }
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

// textCanvas makes a canvas with one line of text. It is used for the banners.
function textTexture(text, w, h, back, front) {
	var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
	var c = cv.getContext('2d');
	c.fillStyle = back; c.fillRect(0, 0, w, h);
	c.fillStyle = front; c.font = 'bold ' + Math.floor(h * 0.7) + 'px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
	c.fillText(text, w / 2, h / 2 + h * 0.04);
	var tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
}

// ---------- far terrain ----------

var snowMat = null;
var farGeo = null, farPos = null, farH = null;

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

function gridIndex(n) {
	var idx = new Uint16Array(n * n * 6), k = 0, i, j, a, b, c, d;
	for (j = 0; j < n; j++) {
		for (i = 0; i < n; i++) {
			a = j * (n + 1) + i; b = a + 1; c = a + n + 1; d = c + 1;
			idx[k++] = a; idx[k++] = c; idx[k++] = b;
			idx[k++] = b; idx[k++] = c; idx[k++] = d;
		}
	}
	return idx;
}

function makeFar(scene) {
	var n1 = NC + 1, n = n1 * n1, i, j, k, x, z, h, o = {};
	var nor = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2);
	farPos = new Float32Array(n * 3); farH = new Float32Array(n);
	for (j = 0; j < n1; j++) {
		for (i = 0; i < n1; i++) {
			k = j * n1 + i; x = -HALF + i * CS; z = -HALF + j * CS;
			h = groundAt(x, z); normalAt(x, z, o);
			farH[k] = h;
			farPos[k * 3] = x; farPos[k * 3 + 1] = h; farPos[k * 3 + 2] = z;
			nor[k * 3] = o.x; nor[k * 3 + 1] = o.y; nor[k * 3 + 2] = o.z;
			uv[k * 2] = x / 6; uv[k * 2 + 1] = z / 6;
			terrainColor(tintAt(x, z, h), o.y, col, k * 3);
		}
	}
	farGeo = new THREE.BufferGeometry();
	farGeo.setAttribute('position', new THREE.BufferAttribute(farPos, 3));
	farGeo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
	farGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
	farGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
	farGeo.setIndex(new THREE.BufferAttribute(gridIndex(NC), 1));
	var mesh = new THREE.Mesh(farGeo, snowMat);
	mesh.frustumCulled = false;
	scene.add(mesh);
}

// ---------- near terrain ----------

// The near terrain is a square of small cells that moves with you, one far cell at a time.
// Its edge uses the heights of the far terrain, so there is no gap.
// The far terrain points below it are moved down, so they are not seen.

var nearGeo = null, nearPos = null, nearNor = null, nearCol = null, nearUv = null;
var nearH = null, nearH2 = null, nearTint = null, nearTint2 = null;
var patchI = -1, patchJ = -1;

function makeNear(scene) {
	var n = (NF + 1) * (NF + 1);
	nearPos = new Float32Array(n * 3); nearNor = new Float32Array(n * 3); nearCol = new Float32Array(n * 3); nearUv = new Float32Array(n * 2);
	nearH = new Float32Array(n); nearH2 = new Float32Array(n); nearTint = new Float32Array(n); nearTint2 = new Float32Array(n);
	nearGeo = new THREE.BufferGeometry();
	nearGeo.setAttribute('position', new THREE.BufferAttribute(nearPos, 3));
	nearGeo.setAttribute('normal', new THREE.BufferAttribute(nearNor, 3));
	nearGeo.setAttribute('color', new THREE.BufferAttribute(nearCol, 3));
	nearGeo.setAttribute('uv', new THREE.BufferAttribute(nearUv, 2));
	nearGeo.setIndex(new THREE.BufferAttribute(gridIndex(NF), 1));
	var mesh = new THREE.Mesh(nearGeo, snowMat);
	mesh.frustumCulled = false;
	scene.add(mesh);
}

function farHole(ci, cj, dy) {
	var i, j, k, n1 = NC + 1;
	for (j = cj + 1; j < cj + PATCH; j++) {
		for (i = ci + 1; i < ci + PATCH; i++) { k = j * n1 + i; farPos[k * 3 + 1] = farH[k] + dy; }
	}
}

// moveData moves the contents of an array n places to the start (n > 0) or to the end (n < 0).
function moveData(arr, n) {
	if (n > 0) arr.copyWithin(0, n); else if (n < 0) arr.copyWithin(-n, 0, arr.length + n);
}

// updatePatch moves the near terrain when you go into a different far cell. It returns true if it moved.
function updatePatch(px, pz) {
	var ci = clamp(Math.floor((px + HALF) / CS) - PATCH / 2, 0, NC - PATCH);
	var cj = clamp(Math.floor((pz + HALF) / CS) - PATCH / 2, 0, NC - PATCH);
	if (ci == patchI && cj == patchJ) return false;
	var n1 = NF + 1, c1 = NC + 1, a, b, k, oa, ob, x, z, h, u, k0, k1, gx, gz, l, tmp;
	var x0 = -HALF + ci * CS, z0 = -HALF + cj * CS;
	var da = (ci - patchI) * FPC, db = (cj - patchJ) * FPC, keep = patchI >= 0;

	// 1. heights and surface types: keep the old data where the old and new squares overlap
	for (b = 0; b < n1; b++) {
		z = z0 + b * FS; ob = b + db;
		for (a = 0; a < n1; a++) {
			k = b * n1 + a; oa = a + da;
			if (keep && oa >= 0 && oa <= NF && ob >= 0 && ob <= NF) {
				nearH2[k] = nearH[ob * n1 + oa]; nearTint2[k] = nearTint[ob * n1 + oa];
			} else {
				x = x0 + a * FS; h = groundAt(x, z);
				nearH2[k] = h; nearTint2[k] = tintAt(x, z, h);
			}
		}
	}
	tmp = nearH; nearH = nearH2; nearH2 = tmp;
	tmp = nearTint; nearTint = nearTint2; nearTint2 = tmp;

	// 2. positions, normals, colors: move the data of the points that stay, then calculate the new points and the edges
	if (keep) {
		k = db * n1 + da;
		moveData(nearPos, k * 3); moveData(nearNor, k * 3); moveData(nearCol, k * 3); moveData(nearUv, k * 2);
	}
	for (b = 0; b < n1; b++) {
		z = z0 + b * FS; ob = b + db;
		for (a = 0; a < n1; a++) {
			oa = a + da;
			if (keep && a > 0 && a < NF && b > 0 && b < NF && oa > 0 && oa < NF && ob > 0 && ob < NF) continue;
			k = b * n1 + a; x = x0 + a * FS; h = nearH[k];
			if (a == 0 || a == NF) {          // west and east edges: line between two far points
				k0 = (cj + Math.floor(b / FPC)) * c1 + ci + a / FPC; u = (b % FPC) / FPC;
				h = b == NF ? farH[k0] : farH[k0] + (farH[k0 + c1] - farH[k0]) * u;
			} else if (b == 0 || b == NF) {   // north and south edges
				k0 = (cj + b / FPC) * c1 + ci + Math.floor(a / FPC); u = (a % FPC) / FPC;
				h = farH[k0] + (farH[k0 + 1] - farH[k0]) * u;
			}
			nearPos[k * 3] = x; nearPos[k * 3 + 1] = h; nearPos[k * 3 + 2] = z;
			k0 = a > 0 ? k - 1 : k; k1 = a < NF ? k + 1 : k; gx = (nearH[k1] - nearH[k0]) / ((k1 - k0) * FS);
			k0 = b > 0 ? k - n1 : k; k1 = b < NF ? k + n1 : k; gz = (nearH[k1] - nearH[k0]) / ((k1 - k0) / n1 * FS);
			l = 1 / Math.sqrt(gx * gx + gz * gz + 1);
			nearNor[k * 3] = -gx * l; nearNor[k * 3 + 1] = l; nearNor[k * 3 + 2] = -gz * l;
			nearUv[k * 2] = x / 6; nearUv[k * 2 + 1] = z / 6;
			terrainColor(nearTint[k], l, nearCol, k * 3);
		}
	}
	nearGeo.attributes.position.needsUpdate = true;
	nearGeo.attributes.normal.needsUpdate = true;
	nearGeo.attributes.color.needsUpdate = true;
	nearGeo.attributes.uv.needsUpdate = true;

	// 3. the hole in the far terrain
	if (keep) farHole(patchI, patchJ, 0);
	farHole(ci, cj, -400);
	farGeo.attributes.position.needsUpdate = true;
	patchI = ci; patchJ = cj;
	return true;
}

// ---------- trees ----------

var treeMesh = null, rockMesh = null, markMesh = null;
var treesDirty = true;
var OB = {};

function makeTrees(scene) {
	var geo = partsGeo([
		['c', 0.22, 0.3, 1.6, 0, 0.8, 0, 0x4a3524, 0, 0, 0, 5],
		['c', 0, 2.3, 4.6, 0, 3.5, 0, 0x1f4a35, 0, 0, 0, 6],
		['c', 0, 1.7, 3.8, 0, 5.6, 0, 0x2c5e45, 0, 0.5, 0, 6],
		['c', 0, 1.0, 2.6, 0, 7.3, 0, 0xc9dcd6, 0, 0, 0, 6]
	]);
	var mat = new THREE.MeshLambertMaterial({ vertexColors: true });
	treeMesh = new THREE.InstancedMesh(geo, mat, 3200);
	treeMesh.frustumCulled = false;
	scene.add(treeMesh);
	rockMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x6f6862, flatShading: true }), 400);
	rockMesh.frustumCulled = false;
	scene.add(rockMesh);
	// piste markers: orange on the left, blue on the right
	markMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 5), new THREE.MeshBasicMaterial({ color: 0xffffff }), 80);
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

// updateTrees puts the trees, rocks and piste markers around you.
function updateTrees(px, pz) {
	var ci0 = Math.floor(px / TC), cj0 = Math.floor(pz / TC), i, j, nt = 0, nr = 0, nm = 0, s, dist, t, t0, x, z, side;
	var ta = treeMesh.instanceMatrix.array, ra = rockMesh.instanceMatrix.array, ma = markMesh.instanceMatrix.array;
	var far = TREE_R * TC, c = new THREE.Color();
	for (j = cj0 - TREE_R; j <= cj0 + TREE_R; j++) {
		for (i = ci0 - TREE_R; i <= ci0 + TREE_R; i++) {
			obstacleAt(i, j, OB);
			if (!OB.kind) continue;
			dist = Math.sqrt((OB.x - px) * (OB.x - px) + (OB.z - pz) * (OB.z - pz));
			if (dist > far) continue;
			if (OB.kind == 1 && nt < 3200) {
				s = OB.h / 8.6 * sstep(far, far - 90, dist);
				setInstance(ta, nt++, OB.x, OB.y - 0.3, OB.z, s, s, hash2(i, j + 5) * 6.28);
			} else if (OB.kind == 2 && nr < 400) {
				setInstance(ra, nr++, OB.x, OB.y, OB.z, OB.r * 1.3, OB.h * 0.8, hash2(i, j + 5) * 6.28);
			}
		}
	}
	treeMesh.count = nt; treeMesh.instanceMatrix.needsUpdate = true;
	rockMesh.count = nr; rockMesh.instanceMatrix.needsUpdate = true;
	t0 = Math.floor((Z0 - pz) / 40) * 40;
	for (t = t0 - 480; t <= t0 + 800; t += 40) {
		if (t < 0 || t > T_END) continue;
		for (side = -1; side <= 1; side += 2) {
			x = pisteX(t) + side * (PISTE_W + 1); z = Z0 - t;
			setInstance(ma, nm, x, groundAt(x, z) + 1.0, z, 1, 1, 0);
			markMesh.setColorAt(nm++, c.setHex(side < 0 ? 0xff5a1f : 0x1f6fff));
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
	var i, t, x, z, y, m, n, s, side;

	banner(scene, 26, 'START', '#c8102e');
	banner(scene, T_END, 'FINISH', '#1e5fbf');

	// start hut and village houses: one geometry, many copies
	var house = partsGeo([
		['b', 8, 4, 10, 0, 2, 0, 0x7a5236],
		['b', 8.2, 1.2, 10.2, 0, 0.6, 0, 0xb9b4ab],
		['b', 6.2, 0.5, 11.4, -2.35, 5.2, 0, 0xf4f7fa, 0, 0, 0.62],
		['b', 6.2, 0.5, 11.4, 2.35, 5.2, 0, 0xf4f7fa, 0, 0, -0.62],
		['b', 7.6, 2.4, 9.8, 0, 4.6, 0, 0x6a452c],
		['b', 1.2, 1.4, 0.2, -2, 2.4, -5.05, 0xffd98a],
		['b', 1.2, 1.4, 0.2, 2, 2.4, -5.05, 0xffd98a],
		['b', 1.3, 2.2, 0.2, 0, 1.3, 5.05, 0x3a2a1c],
		['b', 0.9, 2.2, 0.9, 2.2, 6.6, 2.5, 0x8c8279]
	]);
	var houses = new THREE.InstancedMesh(house, new THREE.MeshLambertMaterial({ vertexColors: true }), 20);
	var arr = houses.instanceMatrix.array;
	n = 0;
	x = -24; z = Z0 + 26; setInstance(arr, n++, x, groundAt(x, z) - 0.4, z, 1, 1, 0.3);   // start hut
	for (i = 0; i < 18; i++) {
		side = i % 2 ? 1 : -1;
		t = 7790 + Math.floor(i / 2) * 44 + 20 * hash2(i, 3);
		x = pisteX(t) + side * (58 + 75 * hash2(i, 9)); z = Z0 - t;
		s = 0.9 + 0.6 * hash2(i, 5);
		setInstance(arr, n++, x, groundAt(x, z) - 0.6, z, s, s, hash2(i, 7) * 6.28);
	}
	houses.count = n; houses.frustumCulled = false;
	scene.add(houses);

	// lift: pylons, two cables, cabins
	var pylon = partsGeo([
		['b', 0.6, 13, 0.6, 0, 6.5, 0, 0x5a6068],
		['b', 5.2, 0.4, 0.6, 0, 12.8, 0, 0x5a6068]
	]);
	var pylons = new THREE.InstancedMesh(pylon, new THREE.MeshLambertMaterial({ vertexColors: true }), 60);
	arr = pylons.instanceMatrix.array;
	var c1 = [], c2 = [], dir;
	n = 0;
	for (t = 30; t <= 7790; t += 160) {
		x = pisteX(t) + 71; z = Z0 - t; y = groundAt(x, z); dir = pisteDir(t);
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

var skyGroup = null;

function makeSky(scene) {
	var i, k, y, u, c = new THREE.Color(), fog = new THREE.Color(FOG_COLOR), top = new THREE.Color(SKY_COLOR);
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
	function ringH(i) { i = (i % n + n) % n; return 2300 + 1500 * hash2(i, 77) + 900 * hash2(Math.floor(i / 5), 78); }
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
	floor.rotation.x = -Math.PI / 2; floor.position.y = 900;
	scene.add(floor);

	scene.fog = new THREE.Fog(FOG_COLOR, 300, 7500);
	scene.background = new THREE.Color(FOG_COLOR);
	var sunLight = new THREE.DirectionalLight(0xfff4e0, 3.8);
	sunLight.position.copy(SUN_DIR);
	scene.add(sunLight);
	scene.add(new THREE.HemisphereLight(0xbcd6ff, 0xf2f6ff, 1.3));
}

// ---------- update ----------

function makeWorld(scene) {
	makeElev();
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
	if (updatePatch(px, pz)) treesDirty = true;
	else if (treesDirty) { updateTrees(px, pz); treesDirty = false; }
	skyGroup.position.set(px, 0, pz);
	updateCabins(time);
}
