// ski.js - the physics of the skis and the snowboard. No drawing.
// Classic script. It uses groundAt(), normalAt(), pisteX(), pisteDir() and obstacleAt() from world.js.
//
// main.js writes the controls into ctl, then calls stepSki(DT) at a fixed rate.
// The result is in sk.
//
// Model:
//   - Gravity pulls you down the slope. Snow friction and air drag slow you.
//   - The edges hold you against a sideways slide, up to a limit (grip).
//     A soft turn stays below the limit and loses no speed (carve).
//     A hard turn goes above the limit: you slide sideways and lose speed (skid).
//   - Flat skis turn slowly into the fall line.
//   - If the snow drops away faster than gravity pulls you down, you are in the air.

var DT = 1 / 120;
var G = 9.81;

// glide: snow friction. dragUp, dragTuck: air drag when you stand and when you bend down.
// pivot: turn rate at low speed (rad/s). latAcc: turn force at speed (m/s2). grip: edge limit (m/s2).
// fall: how fast flat skis turn into the fall line. brake: snowplough (m/s2). crash: landing speed that makes you fall (m/s).
var GEAR = {
	ski:   { glide: 0.035, dragUp: 0.0048, dragTuck: 0.0019, pivot: 1.7, latAcc: 12.5, grip: 8.5, fall: 0.5, brake: 5.5, crash: 11 },
	board: { glide: 0.040, dragUp: 0.0052, dragTuck: 0.0026, pivot: 1.4, latAcc: 11.0, grip: 8.0, fall: 0.35, brake: 5.0, crash: 10 }
};
var ASSIST_VMAX = 17;    // easy mode: top speed (m/s)
var ASSIST_VMIN = 7;     // easy mode: the game pushes you below this speed

// steer: -1 = left, +1 = right. brake, tuck: 0 to 1. push: speed to add (m/s), one time. jump: one time.
var ctl = { steer: 0, brake: 0, tuck: 0, push: 0, jump: false };

var sk = {
	x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
	hdg: 0,              // direction of the skis. 0 = north, positive = left
	speed: 0, t: 0, d: 0,
	ground: true, air: 0, fallen: 0, skid: 0, rise: 0, tilt: 0,
	mode: 'ski', assist: false, moving: false,
	nLand: 0, nFall: 0, nHit: 0, lastImpact: 0, lastAir: 0   // counters: main.js looks for changes
};

var SN = {}, SOB = {};

function resetSki(t0) {
	sk.x = pisteX(t0); sk.z = Z0 - t0; sk.y = groundAt(sk.x, sk.z);
	sk.vx = sk.vy = sk.vz = 0; sk.hdg = pisteDir(t0);
	sk.speed = 0; sk.t = t0; sk.d = 0; sk.ground = true; sk.air = 0; sk.fallen = 0; sk.skid = 0; sk.moving = false;
	ctl.steer = ctl.brake = ctl.tuck = ctl.push = 0; ctl.jump = false;
}

function startFall() {
	if (sk.fallen > 0) return;
	sk.fallen = 1.8; sk.nFall++;
	sk.vx *= 0.5; sk.vy *= 0.5; sk.vz *= 0.5;
}

function stepSki(dt) {
	var P = GEAR[sk.mode], n = normalAt(sk.x, sk.z, SN), h = groundAt(sk.x, sk.z);
	var fx, fy, fz, sx, sy, sz, l, vn, vf, vs, w, sp, k, g2, e, i, j, ci, cj, dx, dz, r, want;

	sk.vy -= G * dt;
	if (sk.fallen > 0) sk.fallen = Math.max(0, sk.fallen - dt);

	if (sk.y - h < 0.06) {
		// ----- on the snow -----
		vn = sk.vx * n.x + sk.vy * n.y + sk.vz * n.z;
		if (vn < 0) {
			if (!sk.ground && sk.air > 0.3) {
				sk.lastImpact = -vn; sk.lastAir = sk.air; sk.nLand++;
				if (-vn > P.crash && !sk.assist) startFall();
			}
			sk.vx -= vn * n.x; sk.vy -= vn * n.y; sk.vz -= vn * n.z; vn = 0;
		}
		sk.ground = true; sk.air = 0;
		sp = Math.sqrt(sk.vx * sk.vx + sk.vy * sk.vy + sk.vz * sk.vz);

		// turn
		w = -ctl.steer * Math.min(P.pivot, P.latAcc / Math.max(sp, 1));
		g2 = Math.sqrt(n.gx * n.gx + n.gz * n.gz);
		if (g2 > 0.01) w += P.fall * Math.min(1.5, g2 / 0.25) * Math.sin(wrapPi(Math.atan2(n.gx, n.gz) - sk.hdg)) * (1 - Math.abs(ctl.steer)) * (1 - ctl.brake) * Math.min(1, sp / 3);
		if (sk.assist) {
			// easy mode: with no steer input, the skis follow the piste
			want = pisteDir(sk.t) + clamp(sk.d / 90, -0.45, 0.45) * sstep(12, 40, Math.abs(sk.d));
			w += 1.3 * wrapPi(want - sk.hdg) * (1 - Math.abs(ctl.steer)) * Math.min(1, sp / 3);
		}
		if (sk.fallen > 0) w = 0;
		sk.hdg = wrapPi(sk.hdg + w * dt);

		// forward (f) and right (s) directions on the snow surface
		fx = -Math.sin(sk.hdg); fz = -Math.cos(sk.hdg);
		k = fx * n.x + fz * n.z;
		fx -= k * n.x; fy = -k * n.y; fz -= k * n.z;
		l = 1 / Math.sqrt(fx * fx + fy * fy + fz * fz); fx *= l; fy *= l; fz *= l;
		sx = fy * n.z - fz * n.y; sy = fz * n.x - fx * n.z; sz = fx * n.y - fy * n.x;
		vf = sk.vx * fx + sk.vy * fy + sk.vz * fz;
		vs = sk.vx * sx + sk.vy * sy + sk.vz * sz;
		sk.rise = fy / Math.sqrt(fx * fx + fz * fz);    // slope along the skis
		sk.tilt = sy;                                   // slope across the skis

		// edges: remove the sideways speed, up to the grip limit
		k = clamp(-vs, -P.grip * dt, P.grip * dt);
		vs += k;
		sk.skid = Math.abs(vs);

		// snow friction along the skis
		k = P.glide * G * n.y * dt;
		vf = Math.abs(vf) <= k ? 0 : vf - (vf > 0 ? k : -k);

		// brake, and the slide after a fall
		k = (ctl.brake * P.brake + (sk.fallen > 0 ? 7 : 0)) * dt;
		sp = Math.sqrt(vf * vf + vs * vs);
		if (k > 0 && sp > 0) { k = Math.max(0, sp - k) / sp; vf *= k; vs *= k; }

		// air drag
		sp = Math.sqrt(vf * vf + vs * vs);
		k = 1 / (1 + lerp(P.dragUp, P.dragTuck, ctl.tuck) * sp * dt);
		vf *= k; vs *= k;

		if (sk.fallen == 0) {
			vf += ctl.push;
			if (ctl.jump) vn += 3.2;
			if (sk.assist && sk.moving) {
				if (sp > ASSIST_VMAX) vf -= (sp - ASSIST_VMAX) * 2 * dt;
				if (sp < ASSIST_VMIN && ctl.brake < 0.1) vf += 1.6 * dt;
			}
		}
		sk.vx = fx * vf + sx * vs + n.x * vn;
		sk.vy = fy * vf + sy * vs + n.y * vn;
		sk.vz = fz * vf + sz * vs + n.z * vn;
	} else {
		// ----- in the air -----
		sk.ground = false; sk.air += dt; sk.skid = 0;
		sp = Math.sqrt(sk.vx * sk.vx + sk.vy * sk.vy + sk.vz * sk.vz);
		k = 1 / (1 + P.dragUp * 0.7 * sp * dt);
		sk.vx *= k; sk.vy *= k; sk.vz *= k;
		sk.hdg = wrapPi(sk.hdg - ctl.steer * 0.8 * dt);
		sk.rise = sp > 1 ? sk.vy / sp : 0; sk.tilt = 0;
	}
	ctl.push = 0; ctl.jump = false;

	sk.x += sk.vx * dt; sk.y += sk.vy * dt; sk.z += sk.vz * dt;
	sk.x = clamp(sk.x, -HALF + 60, HALF - 60); sk.z = clamp(sk.z, -HALF + 60, HALF - 60);
	h = groundAt(sk.x, sk.z);
	if (sk.y < h) sk.y = h;
	sk.speed = Math.sqrt(sk.vx * sk.vx + sk.vy * sk.vy + sk.vz * sk.vz);
	if (sk.speed > 1) sk.moving = true;
	sk.t = Z0 - sk.z; sk.d = sk.x - pisteX(sk.t);

	// trees and rocks
	if (Math.abs(sk.d) > 40 && sk.speed > 0.1) {
		ci = Math.floor(sk.x / TC); cj = Math.floor(sk.z / TC);
		for (j = cj - 1; j <= cj + 1; j++) {
			for (i = ci - 1; i <= ci + 1; i++) {
				obstacleAt(i, j, SOB);
				if (!SOB.kind) continue;
				dx = sk.x - SOB.x; dz = sk.z - SOB.z; r = SOB.r + 0.35; l = dx * dx + dz * dz;
				if (l > r * r || sk.y - SOB.y > SOB.h * 0.6) continue;
				l = Math.sqrt(l) || 0.01;
				sk.x = SOB.x + dx / l * r; sk.z = SOB.z + dz / l * r;
				k = (sk.vx * dx + sk.vz * dz) / l;             // speed into the obstacle
				if (k < 0) { sk.vx -= 1.4 * k * dx / l; sk.vz -= 1.4 * k * dz / l; }
				if (sk.speed > 4 && sk.fallen == 0) {
					sk.nHit++;
					if (sk.assist) { sk.vx *= 0.5; sk.vz *= 0.5; } else startFall();
				}
			}
		}
	}
}
