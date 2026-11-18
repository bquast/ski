// photo.js - 360 photos (photospheres): capture, storage on this device, gallery, viewers.
// Classic script. It uses THREE, world.js, ski.js, guns.js, copilot.js, and from main.js:
// renderer, scene, camera, rig, head, rigYaw, hub, statusMesh, menuMesh, ring, flashPlane, vr, opt, game, say(), buzz(), hands.
//
// How a photo is made:
//   1. A cube camera at the position of your eyes draws the world in six directions (the hub is not drawn).
//   2. A shader changes the cube to one equirectangular picture: 360 degrees across, 180 degrees from top to bottom.
//      The center of the picture is the direction that you look in.
//   3. The picture becomes a JPEG with the Google panorama tag (GPano), so that photo viewers show it as a 360 photo.
//   4. The JPEG goes into the browser storage of this device (IndexedDB), and to the connected copilots.
// From the gallery on the page you can look at the photos, save them as files, or save all of them as one ZIP file.
//
// main.js calls photoInit() one time, photoUpdate(dt) each frame before it draws, and photoTake() for a photo.

// ---------- numbers that you can change ----------

var PHOTO_W = [4096, 8192];     // width of the photo for the option 'Photo size'. The height is half the width.
var PHOTO_Q = 0.92;             // JPEG quality, 0 to 1
var PHOTO_STRIP = 256;          // rows that are read from the graphics card at one time

// ---------- state ----------

var photo = {
	list: [],                   // the photos on this device: meta data, newest last. The JPEG is in IndexedDB.
	pending: -1,                // seconds until the next photo. -1 = no photo to take.
	busy: false,
	unsaved: 0,                 // photos of this session that are not saved as a file
	vrOn: false, vrIndex: 0,    // the photo viewer in VR
	auto: false                 // save each photo from the pilot as a file (copilot)
};
var photoDB = null;
var capCube = null, capCam = null, capMat = null, capScene = null, capOrtho = null, capRT = null, capFace = 0, capW = 0;
var vrSphere = null, vrTex = null;
var PV = new THREE.Vector3();

// ---------- the shader that shows a photo on the inside of a sphere ----------

// The same projection is used to make the photo and to show it:
//   u = 0.5 is the front. u = 0.75 is 90 degrees to the right. v = 1 is straight up.
function sphereMaterial() {
	return new THREE.ShaderMaterial({
		uniforms: { map: { value: null } },
		vertexShader: 'varying vec3 vDir;\nvoid main() {\n\tvDir = position;\n\tgl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}',
		fragmentShader: 'uniform sampler2D map;\nvarying vec3 vDir;\nvoid main() {\n' +
			'\tvec3 d = normalize(vDir);\n' +
			'\tvec2 uv = vec2(atan(d.x, -d.z) / 6.2831853 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.1415927 + 0.5);\n' +
			'\tgl_FragColor = texture2D(map, uv);\n' +
			'\t#include <colorspace_fragment>\n}',
		side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false
	});
}

function photoTexture(img) {
	var tex = new THREE.Texture(img);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.generateMipmaps = false;           // mipmaps make a line at the back of the sphere
	tex.minFilter = THREE.LinearFilter;
	tex.wrapS = THREE.RepeatWrapping;
	tex.needsUpdate = true;
	return tex;
}

function loadImage(blob, done) {
	var url = URL.createObjectURL(blob), img = new Image();
	img.onload = function () { URL.revokeObjectURL(url); done(img); };
	img.onerror = function () { URL.revokeObjectURL(url); done(null); };
	img.src = url;
}

// ---------- capture ----------

function capSetup(W) {
	var face = W >= 8192 ? 2048 : 1536;
	if (capCube && capW === W) return;
	if (capCube) { capCube.dispose(); capRT.dispose(); }
	capW = W; capFace = face;
	capCube = new THREE.WebGLCubeRenderTarget(face, { type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter });
	capCam = new THREE.CubeCamera(0.05, 30000, capCube);
	capRT = new THREE.WebGLRenderTarget(W, PHOTO_STRIP, { depthBuffer: false });
	if (!capMat) {
		capMat = new THREE.ShaderMaterial({
			uniforms: { cube: { value: null }, head: { value: 0 }, v0: { value: 0 }, v1: { value: 1 } },
			vertexShader: 'varying vec2 vUv;\nvoid main() {\n\tvUv = uv;\n\tgl_Position = vec4(position.xy, 0.0, 1.0);\n}',
			fragmentShader: 'uniform samplerCube cube;\nuniform float head, v0, v1;\nvarying vec2 vUv;\n' +
				'vec3 toSRGB(vec3 c) {\n\tc = clamp(c, 0.0, 1.0);\n\treturn mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));\n}\n' +
				'void main() {\n' +
				'\tfloat lon = (vUv.x - 0.5) * 6.2831853;\n' +
				'\tfloat lat = (mix(v0, v1, vUv.y) - 0.5) * 3.1415927;\n' +
				'\tvec3 d = vec3(sin(lon) * cos(lat), sin(lat), -cos(lon) * cos(lat));\n' +       // -z = front, +x = right
				'\tfloat c = cos(head), s = sin(head);\n' +
				'\tvec3 w = vec3(d.x * c + d.z * s, d.y, -d.x * s + d.z * c);\n' +                // turn to your heading
				'\tgl_FragColor = vec4(toSRGB(textureCube(cube, w).rgb), 1.0);\n}',
			depthTest: false, depthWrite: false
		});
		capScene = new THREE.Scene();
		var quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), capMat);
		quad.frustumCulled = false;
		capScene.add(quad);
		capOrtho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
	}
	capMat.uniforms.cube.value = capCube.texture;
}

// photoEye writes the position of your eyes (world) into PV and returns your look heading (0 = north, positive = left).
function photoEye() {
	PV.set(head.x, head.y, head.z);
	rig.localToWorld(PV);
	return rigYaw + (vr ? head.yaw : camera.rotation.y);
}

// photoRender draws the 360 picture into a canvas of W x W/2. It returns the canvas.
function photoRender(W, heading) {
	var H = W / 2, n = H / PHOTO_STRIP, cv, ctx, img, buf, k, r, src, dst, row = W * 4;
	var hide = [hub, ring, flashPlane, aimDot, gunLaser, vrSphere, deskCross, vr ? null : gunHolder], was = [], prevRT, prevXR, i;
	capSetup(W);
	cv = document.createElement('canvas');
	cv.width = W; cv.height = H;
	ctx = cv.getContext('2d');
	img = ctx.createImageData(W, PHOTO_STRIP);
	buf = new Uint8Array(W * PHOTO_STRIP * 4);
	for (i = 0; i < hide.length; i++) { was[i] = hide[i] ? hide[i].visible : false; if (hide[i]) hide[i].visible = false; }
	prevRT = renderer.getRenderTarget();
	prevXR = renderer.xr.enabled;
	renderer.xr.enabled = false;
	try {
		capCam.position.copy(PV);
		capCam.updateMatrixWorld(true);
		capCam.update(renderer, scene);
		capMat.uniforms.head.value = heading;
		for (k = 0; k < n; k++) {
			capMat.uniforms.v0.value = k * PHOTO_STRIP / H;
			capMat.uniforms.v1.value = (k + 1) * PHOTO_STRIP / H;
			renderer.setRenderTarget(capRT);
			renderer.render(capScene, capOrtho);
			renderer.readRenderTargetPixels(capRT, 0, 0, W, PHOTO_STRIP, buf);
			// row 0 of the graphics card is the bottom row: turn the strip upside down
			for (r = 0; r < PHOTO_STRIP; r++) {
				src = r * row; dst = (PHOTO_STRIP - 1 - r) * row;
				img.data.set(buf.subarray(src, src + row), dst);
			}
			ctx.putImageData(img, 0, H - (k + 1) * PHOTO_STRIP);
		}
	} finally {
		renderer.setRenderTarget(prevRT);
		renderer.xr.enabled = prevXR;
		for (i = 0; i < hide.length; i++) if (hide[i]) hide[i].visible = was[i];
	}
	return cv;
}

// photoTake: take a photo after 'delay' seconds (the menu board must close first)
function photoTake(delay) {
	if (photo.busy || photo.pending >= 0) return;
	photo.pending = delay || 0;
}

function photoUpdate(dt) {
	if (photo.vrOn) photoVRFrame();
	if (photo.pending < 0) return;
	photo.pending -= dt;
	if (photo.pending <= 0) { photo.pending = -1; photoCapture(); }
}

function photoCapture() {
	var W = PHOTO_W[opt.photo] || 4096, heading, cv, t0 = performance.now(), meta;
	if (W > renderer.capabilities.maxTextureSize) W = 4096;
	photo.busy = true;
	heading = photoEye();
	try {
		cv = photoRender(W, heading);
	} catch (e) {
		photo.busy = false;
		if (W > 4096) { opt.photo = 0; say('PHOTO TOO LARGE FOR THIS DEVICE. SIZE IS NOW 4096', 3); }
		else say('NO PHOTO: ' + (e && e.message ? e.message : 'ERROR'), 3);
		return;
	}
	meta = {
		id: 'p' + Date.now(), time: Date.now(), w: W, h: W / 2,
		heading: heading, place: sectionName(sk.t), km: Math.round(sk.t) / 1000,
		look: opt.look, from: 'here', ms: Math.round(performance.now() - t0)
	};
	meta.name = photoName(meta.time);
	sndShutter();
	buzz(hands.left, 0.4, 40); buzz(hands.right, 0.4, 40);
	cv.toBlob(function (jpeg) {
		if (!jpeg) { photo.busy = false; say('NO PHOTO: THE JPEG FAILED', 3); return; }
		jpeg.arrayBuffer().then(function (buf) {
			var blob = new Blob([addPanoTag(new Uint8Array(buf), meta.w, meta.h, meta.heading)], { type: 'image/jpeg' });
			photoAdd(blob, meta, cv);
			photo.busy = false;
		});
	}, 'image/jpeg', PHOTO_Q);
}

function photoName(t) {
	var d = new Date(t);
	function two(n) { return (n < 10 ? '0' : '') + n; }
	return 'ski-360-' + d.getFullYear() + two(d.getMonth() + 1) + two(d.getDate()) + '-' + two(d.getHours()) + two(d.getMinutes()) + two(d.getSeconds()) + '.jpg';
}

// addPanoTag puts an XMP block with the Google panorama tags (GPano) after the first segment of the JPEG.
function addPanoTag(jpg, w, h, heading) {
	var deg = ((-heading * 180 / Math.PI) % 360 + 360) % 360;      // compass heading: clockwise from north
	var xmp = 'http://ns.adobe.com/xap/1.0/\u0000<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
		'<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
		'<rdf:Description rdf:about="" xmlns:GPano="http://ns.google.com/photos/1.0/panorama/"' +
		' GPano:ProjectionType="equirectangular" GPano:UsePanoramaViewer="True"' +
		' GPano:FullPanoWidthPixels="' + w + '" GPano:FullPanoHeightPixels="' + h + '"' +
		' GPano:CroppedAreaImageWidthPixels="' + w + '" GPano:CroppedAreaImageHeightPixels="' + h + '"' +
		' GPano:CroppedAreaLeftPixels="0" GPano:CroppedAreaTopPixels="0"' +
		' GPano:PoseHeadingDegrees="' + deg.toFixed(1) + '" GPano:CaptureSoftware="ski"/>' +
		'</rdf:RDF></x:xmpmeta><?xpacket end="w"?>';
	var x = new TextEncoder().encode(xmp), len = x.length + 2, at = 2, out;
	if (jpg[2] === 0xff && jpg[3] === 0xe0) at = 4 + (jpg[4] << 8 | jpg[5]);     // after the JFIF segment
	out = new Uint8Array(jpg.length + len + 2);
	out.set(jpg.subarray(0, at), 0);
	out[at] = 0xff; out[at + 1] = 0xe1; out[at + 2] = len >> 8; out[at + 3] = len & 255;
	out.set(x, at + 4);
	out.set(jpg.subarray(at), at + 4 + x.length);
	return out;
}

// ---------- storage ----------

function dbOpen(done) {
	var req;
	try {
		req = indexedDB.open('ski-photos', 1);
	} catch (e) {
		done(); return;
	}
	req.onupgradeneeded = function () { req.result.createObjectStore('photos', { keyPath: 'id' }); };
	req.onsuccess = function () { photoDB = req.result; done(); };
	req.onerror = function () { done(); };
}

function dbPut(rec) {
	if (!photoDB) return;
	try { photoDB.transaction('photos', 'readwrite').objectStore('photos').put(rec); } catch (e) { /* no storage: the photo stays in memory */ }
}

function dbGet(id, done) {
	var m = photoFind(id), req;
	if (m && m.blob) { done(m.blob); return; }
	if (!photoDB) { done(null); return; }
	req = photoDB.transaction('photos').objectStore('photos').get(id);
	req.onsuccess = function () { done(req.result ? req.result.blob : null); };
	req.onerror = function () { done(null); };
}

function dbDelete(id) {
	if (photoDB) photoDB.transaction('photos', 'readwrite').objectStore('photos').delete(id);
}

function photoFind(id) {
	for (var i = 0; i < photo.list.length; i++) if (photo.list[i].id === id) return photo.list[i];
	return null;
}

// photoAdd keeps a new photo: thumbnail, storage, gallery, copilots
function photoAdd(blob, meta, cv) {
	var m = photoFind(meta.id);
	if (m) return;
	m = meta;
	m.size = blob.size;
	m.saved = false;
	photo.list.push(m);
	if (!photoDB) m.blob = blob;
	photo.unsaved++;
	dbPut({ id: m.id, meta: photoMeta(m), blob: blob, thumb: null });
	makeThumb(cv, blob, function (thumb) {
		m.thumb = thumb;
		dbPut({ id: m.id, meta: photoMeta(m), blob: blob, thumb: thumb });
		galleryDraw();
	});
	galleryDraw();
	if (meta.from === 'here') {
		m.sent = Copilot.role === 'pilot' && Copilot.copilots ? Copilot.sendFile(blob, photoMeta(m)) : 0;
		say('360 PHOTO ' + photo.list.length + (m.sent ? '. SENT TO THE COPILOT' : '. SAVED ON THIS DEVICE'), 2.5);
	} else {
		toast('New 360 photo from the pilot: ' + m.place);
		if (photo.auto) photoSave(m);
	}
}

// the meta data without the blobs (for storage and for the copilot)
function photoMeta(m) {
	return { id: m.id, time: m.time, w: m.w, h: m.h, heading: m.heading, place: m.place, km: m.km, look: m.look, from: m.from, name: m.name, size: m.size, saved: m.saved };
}

function makeThumb(cv, blob, done) {
	function draw(src) {
		var t = document.createElement('canvas');
		t.width = 512; t.height = 256;
		t.getContext('2d').drawImage(src, 0, 0, 512, 256);
		t.toBlob(function (b) { done(b); }, 'image/jpeg', 0.8);
	}
	if (cv) draw(cv);
	else loadImage(blob, function (img) { if (img) draw(img); else done(null); });
}

function photoLoadList(done) {
	var req;
	if (!photoDB) { done(); return; }
	req = photoDB.transaction('photos').objectStore('photos').openCursor();
	req.onsuccess = function () {
		var c = req.result, m;
		if (!c) {
			photo.list.sort(function (a, b) { return a.time - b.time; });
			done();
			return;
		}
		m = c.value.meta;
		m.thumb = c.value.thumb;
		photo.list.push(m);
		c.continue();
	};
	req.onerror = function () { done(); };
}

// ---------- files ----------

function download(blob, name) {
	var a = document.createElement('a'), url = URL.createObjectURL(blob);
	a.href = url; a.download = name;
	document.body.appendChild(a);
	a.click();
	setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 4000);
}

function photoSave(m) {
	dbGet(m.id, function (blob) {
		if (!blob) { toast('This photo is not on this device'); return; }
		download(blob, m.name);
		markSaved([m]);
	});
}

function markSaved(list) {
	for (var i = 0; i < list.length; i++) {
		if (!list[i].saved && photo.unsaved > 0) photo.unsaved--;
		list[i].saved = true;
		updateMeta(list[i]);
	}
	galleryDraw();
}

function updateMeta(m) {
	if (!photoDB) return;
	var st = photoDB.transaction('photos', 'readwrite').objectStore('photos'), req = st.get(m.id);
	req.onsuccess = function () { if (req.result) { req.result.meta = photoMeta(m); st.put(req.result); } };
}

// photoSaveAll saves all photos (or only the ones that are not saved) as one ZIP file
function photoSaveAll(onlyNew) {
	var list = photo.list.filter(function (m) { return !onlyNew || !m.saved; }), files = [], i = 0;
	if (!list.length) { toast('No photos to save'); return; }
	toast('Making the ZIP file: ' + list.length + ' photos');
	function next() {
		if (i >= list.length) {
			download(makeZip(files), 'ski-360-photos-' + photoName(Date.now()).slice(8, 23) + '.zip');
			markSaved(list);
			return;
		}
		var m = list[i++];
		dbGet(m.id, function (blob) {
			if (!blob) { next(); return; }
			blob.arrayBuffer().then(function (b) { files.push({ name: m.name, data: new Uint8Array(b), time: m.time }); next(); });
		});
	}
	next();
}

// makeZip makes a ZIP file with no compression (the JPEGs are compressed already)
var CRC_T = null;

function crc32(d) {
	var c, i, k;
	if (!CRC_T) {
		CRC_T = new Uint32Array(256);
		for (i = 0; i < 256; i++) { c = i; for (k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_T[i] = c; }
	}
	c = 0xffffffff;
	for (i = 0; i < d.length; i++) c = CRC_T[(c ^ d[i]) & 255] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function makeZip(files) {
	var parts = [], dir = [], off = 0, i, f, name, crc, t, dt, dd, h, cd, size = 0, e;
	function u16(a, p, v) { a[p] = v & 255; a[p + 1] = v >>> 8 & 255; }
	function u32(a, p, v) { a[p] = v & 255; a[p + 1] = v >>> 8 & 255; a[p + 2] = v >>> 16 & 255; a[p + 3] = v >>> 24 & 255; }
	for (i = 0; i < files.length; i++) {
		f = files[i]; name = new TextEncoder().encode(f.name); crc = crc32(f.data); t = new Date(f.time);
		dt = t.getHours() << 11 | t.getMinutes() << 5 | t.getSeconds() >> 1;
		dd = (t.getFullYear() - 1980) << 9 | (t.getMonth() + 1) << 5 | t.getDate();
		h = new Uint8Array(30 + name.length);
		u32(h, 0, 0x04034b50); u16(h, 4, 20); u16(h, 10, dt); u16(h, 12, dd);
		u32(h, 14, crc); u32(h, 18, f.data.length); u32(h, 22, f.data.length); u16(h, 26, name.length); h.set(name, 30);
		cd = new Uint8Array(46 + name.length);
		u32(cd, 0, 0x02014b50); u16(cd, 4, 20); u16(cd, 6, 20); u16(cd, 12, dt); u16(cd, 14, dd);
		u32(cd, 16, crc); u32(cd, 20, f.data.length); u32(cd, 24, f.data.length); u16(cd, 28, name.length); u32(cd, 42, off); cd.set(name, 46);
		parts.push(h, f.data); dir.push(cd);
		off += h.length + f.data.length;
	}
	for (i = 0; i < dir.length; i++) size += dir[i].length;
	e = new Uint8Array(22);
	u32(e, 0, 0x06054b50); u16(e, 8, files.length); u16(e, 10, files.length); u32(e, 12, size); u32(e, 16, off);
	return new Blob(parts.concat(dir, [e]), { type: 'application/zip' });
}

// ---------- the page: button, gallery, viewer ----------

var gal = null, viewer = null;

var PHOTO_CSS = '#photo-btn{position:fixed;left:10px;top:10px;z-index:15;padding:7px 12px;font:13px ui-monospace,Menlo,monospace;color:#fff;' +
	'background:rgba(10,16,24,.72);border:1px solid rgba(255,255,255,.35);border-radius:6px;cursor:pointer}' +
	'#photo-gal{position:fixed;left:10px;top:48px;bottom:40px;width:min(560px,calc(100vw - 290px));z-index:16;display:none;flex-direction:column;' +
	'color:#e8ede8;font:12px ui-monospace,Menlo,monospace;background:rgba(10,16,24,.9);border-radius:8px;padding:10px}' +
	'#photo-gal .pg-top{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px}' +
	'#photo-gal button,#photo-view button{font:12px ui-monospace,Menlo,monospace;color:#e8ede8;background:rgba(255,255,255,.1);' +
	'border:1px solid rgba(255,255,255,.3);border-radius:4px;padding:4px 8px;cursor:pointer}' +
	'#photo-gal button:hover,#photo-view button:hover{background:rgba(80,140,200,.5)}' +
	'#photo-gal .pg-list{overflow-y:auto;flex:1;display:grid;grid-template-columns:1fr 1fr;gap:8px;align-content:start}' +
	'#photo-gal .pg-item{background:rgba(255,255,255,.06);border-radius:6px;padding:5px}' +
	'#photo-gal .pg-item img{width:100%;aspect-ratio:2/1;object-fit:cover;border-radius:4px;cursor:zoom-in;display:block;background:#333}' +
	'#photo-gal .pg-item div{margin:4px 0}' +
	'#photo-gal .pg-new{color:#ffd24a}' +
	'#photo-view{position:fixed;inset:0;z-index:30;display:none;background:#000}' +
	'#photo-view canvas{display:block;width:100%;height:100%;cursor:grab}' +
	'#photo-view .pv-bar{position:absolute;left:0;right:0;bottom:0;display:flex;gap:6px;justify-content:center;align-items:center;padding:10px;' +
	'color:#e8ede8;font:12px ui-monospace,Menlo,monospace;background:linear-gradient(transparent,rgba(0,0,0,.7))}' +
	'#photo-toast{position:fixed;left:50%;bottom:48px;transform:translateX(-50%);z-index:40;padding:8px 14px;border-radius:6px;' +
	'background:rgba(10,16,24,.88);color:#ffd24a;font:13px ui-monospace,Menlo,monospace;display:none;pointer-events:none}';

function el2(tag, cls, parent, text) {
	var e = document.createElement(tag);
	if (cls) e.className = cls;
	if (text) e.textContent = text;
	if (parent) parent.appendChild(e);
	return e;
}

function toast(text) {
	var t = document.getElementById('photo-toast');
	if (!t) return;
	t.textContent = text;
	t.style.display = 'block';
	clearTimeout(toast.timer);
	toast.timer = setTimeout(function () { t.style.display = 'none'; }, 3500);
}

function photoInit() {
	var st = document.createElement('style'), top, lab, cb;
	st.textContent = PHOTO_CSS;
	document.head.appendChild(st);
	gal = { btn: el2('button', '', document.body), box: el2('div', '', document.body), key: '' };
	gal.btn.id = 'photo-btn';
	gal.btn.onclick = function () { galleryShow(gal.box.style.display !== 'flex'); };
	gal.box.id = 'photo-gal';
	top = el2('div', 'pg-top', gal.box);
	el2('button', '', top, 'TAKE PHOTO').onclick = function () { if (Copilot.role === 'copilot') Copilot.select(ROW_PHOTO); else photoTake(0.05); };
	el2('button', '', top, 'SAVE NEW (ZIP)').onclick = function () { photoSaveAll(true); };
	el2('button', '', top, 'SAVE ALL (ZIP)').onclick = function () { photoSaveAll(false); };
	el2('button', '', top, 'CLOSE').onclick = function () { galleryShow(false); };
	lab = el2('label', '', top);
	cb = el2('input', '', lab);
	cb.type = 'checkbox';
	el2('span', '', lab, ' save each new photo from the pilot as a file');
	try { photo.auto = localStorage.getItem('ski.autosave') === '1'; } catch (e) { /* no storage */ }
	cb.checked = photo.auto;
	cb.onchange = function () { photo.auto = cb.checked; try { localStorage.setItem('ski.autosave', cb.checked ? '1' : '0'); } catch (e) { /* no storage */ } };
	gal.auto = lab;
	gal.info = el2('div', '', gal.box);
	gal.list = el2('div', 'pg-list', gal.box);
	el2('div', '', document.body).id = 'photo-toast';
	dbOpen(function () { photoLoadList(galleryDraw); });
	galleryDraw();
}

function galleryShow(on) {
	gal.box.style.display = on ? 'flex' : 'none';
	gal.key = '';
	galleryDraw();
}

function photoDate(t) {
	var d = new Date(t);
	return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
}

function galleryDraw() {
	var i, m, it, img, row, key, n = photo.list.length, list;
	if (!gal) return;
	gal.btn.textContent = 'PHOTOS 360 (' + n + ')' + (photo.unsaved ? '  ' + photo.unsaved + ' NEW' : '');
	gal.auto.style.display = Copilot.role === 'copilot' ? '' : 'none';
	if (gal.box.style.display !== 'flex') return;
	key = n + '|' + photo.list.map(function (m) { return m.id + (m.saved ? 's' : '') + (m.thumb ? 't' : ''); }).join(',') + Copilot.copilots + Copilot.role;
	if (key === gal.key) return;
	gal.key = key;
	gal.info.textContent = n ? n + ' photos on this device. Click a photo to look around in it. ' +
		(vr ? '' : 'In VR: push a thumbstick to take a photo.') : 'No photos. In VR: push a thumbstick (press it down) to take a 360 photo. On the Mac: P.';
	gal.list.textContent = '';
	list = photo.list.slice().reverse();
	for (i = 0; i < list.length; i++) {
		m = list[i];
		it = el2('div', 'pg-item', gal.list);
		img = el2('img', '', it);
		if (m.thumb) { img.src = URL.createObjectURL(m.thumb); img.onload = function () { URL.revokeObjectURL(this.src); }; }
		img.onclick = (function (k) { return function () { viewerOpen(k); }; })(photo.list.indexOf(m));
		el2('div', m.saved ? '' : 'pg-new', it, (m.saved ? '' : 'NEW  ') + m.place + '  ' + (m.km || 0).toFixed(1) + ' km');
		el2('div', '', it, photoDate(m.time) + '  ' + m.w + ' x ' + m.h + '  ' + ((m.size || 0) / 1e6).toFixed(1) + ' MB' + (m.from === 'pilot' ? '  (from the pilot)' : ''));
		row = el2('div', '', it);
		el2('button', '', row, 'SAVE').onclick = (function (p) { return function () { photoSave(p); }; })(m);
		if (Copilot.role === 'pilot' && Copilot.copilots) el2('button', '', row, 'SEND').onclick = (function (p) { return function () { photoSend(p); }; })(m);
		el2('button', '', row, 'DELETE').onclick = (function (p) { return function () { photoDelete(p); }; })(m);
	}
}

function photoSend(m) {
	dbGet(m.id, function (blob) {
		if (blob && Copilot.sendFile(blob, photoMeta(m))) toast('Sent to the copilot: ' + m.name);
	});
}

function photoDelete(m) {
	var k = photo.list.indexOf(m);
	if (k < 0 || !window.confirm('Delete this photo from this device?')) return;
	photo.list.splice(k, 1);
	if (!m.saved && photo.unsaved > 0) photo.unsaved--;
	dbDelete(m.id);
	galleryDraw();
}

// the viewer on the page: drag to look around, wheel to zoom, arrow keys for the next photo
function viewerOpen(index) {
	var v = viewer;
	if (!v) {
		v = viewer = { box: el2('div', '', document.body), yaw: 0, pitch: 0, fov: 80, drag: null, index: 0, on: false };
		v.box.id = 'photo-view';
		v.canvas = el2('canvas', '', v.box);
		v.bar = el2('div', 'pv-bar', v.box);
		el2('button', '', v.bar, '< PREVIOUS').onclick = function () { viewerStep(-1); };
		v.text = el2('span', '', v.bar);
		el2('button', '', v.bar, 'NEXT >').onclick = function () { viewerStep(1); };
		el2('button', '', v.bar, 'SAVE').onclick = function () { photoSave(photo.list[v.index]); };
		el2('button', '', v.bar, 'CLOSE (Esc)').onclick = viewerClose;
		v.renderer = new THREE.WebGLRenderer({ canvas: v.canvas, antialias: true });
		v.scene = new THREE.Scene();
		v.cam = new THREE.PerspectiveCamera(80, 1, 0.1, 100);
		v.cam.rotation.order = 'YXZ';
		v.mat = sphereMaterial();
		v.scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), v.mat));
		v.canvas.addEventListener('pointerdown', function (e) { v.drag = [e.clientX, e.clientY, v.yaw, v.pitch]; v.canvas.setPointerCapture(e.pointerId); });
		v.canvas.addEventListener('pointermove', function (e) {
			if (!v.drag) return;
			var k = v.fov / v.canvas.clientHeight * Math.PI / 180;
			v.yaw = v.drag[2] + (e.clientX - v.drag[0]) * k;
			v.pitch = clamp(v.drag[3] + (e.clientY - v.drag[1]) * k, -1.5, 1.5);
		});
		v.canvas.addEventListener('pointerup', function () { v.drag = null; });
		v.canvas.addEventListener('wheel', function (e) { v.fov = clamp(v.fov + e.deltaY * 0.05, 25, 110); e.preventDefault(); }, { passive: false });
		window.addEventListener('keydown', function (e) {
			if (!v.on) return;
			if (e.code === 'Escape') viewerClose();
			else if (e.code === 'ArrowLeft') viewerStep(-1);
			else if (e.code === 'ArrowRight') viewerStep(1);
			e.stopPropagation();
		}, true);
	}
	v.on = true;
	v.box.style.display = 'block';
	viewerLoad(index);
	requestAnimationFrame(viewerFrame);
}

function viewerLoad(index) {
	var v = viewer, m = photo.list[index];
	if (!m) return;
	v.index = index; v.yaw = 0; v.pitch = 0;
	v.text.textContent = (index + 1) + ' / ' + photo.list.length + '   ' + m.place + '   ' + photoDate(m.time) + '   drag to look around, wheel to zoom';
	dbGet(m.id, function (blob) {
		if (!blob) return;
		loadImage(blob, function (img) {
			if (!img || v.index !== index) return;
			if (v.mat.uniforms.map.value) v.mat.uniforms.map.value.dispose();
			v.mat.uniforms.map.value = photoTexture(img);
		});
	});
}

function viewerStep(d) {
	var n = photo.list.length;
	if (n) viewerLoad((viewer.index + d + n) % n);
}

function viewerFrame() {
	var v = viewer, w, h;
	if (!v.on) return;
	requestAnimationFrame(viewerFrame);
	w = v.canvas.clientWidth; h = v.canvas.clientHeight;
	if (v.canvas.width !== w || v.canvas.height !== h) { v.renderer.setSize(w, h, false); v.cam.aspect = w / h; }
	v.cam.fov = v.fov; v.cam.updateProjectionMatrix();
	v.cam.rotation.set(v.pitch, v.yaw, 0);
	if (v.mat.uniforms.map.value) v.renderer.render(v.scene, v.cam);
}

function viewerClose() {
	if (!viewer) return;
	viewer.on = false;
	viewer.box.style.display = 'none';
}

// ---------- the viewer in VR ----------

// The photo is on a sphere around your head. The stick changes the photo. Trigger, A or X closes it.
function photoVROpen() {
	if (!photo.list.length) { say('NO PHOTOS. PUSH A THUMBSTICK TO TAKE ONE', 3); return; }
	if (!vrSphere) {
		vrSphere = new THREE.Mesh(new THREE.SphereGeometry(40, 64, 32), sphereMaterial());
		vrSphere.renderOrder = 100;
		vrSphere.frustumCulled = false;
		scene.add(vrSphere);
	}
	photo.vrOn = true;
	photo.vrIndex = photo.list.length - 1;
	photoVRLoad();
	vrSphere.visible = false;      // until the photo is loaded
	statusMesh.renderOrder = 102;
}

function photoVRLoad() {
	var m = photo.list[photo.vrIndex], k = photo.vrIndex;
	if (!m) return;
	say('PHOTO ' + (k + 1) + ' / ' + photo.list.length + '  ' + m.place + '    STICK: NEXT    TRIGGER: CLOSE', 600);
	dbGet(m.id, function (blob) {
		if (!blob) return;
		loadImage(blob, function (img) {
			if (!img || !photo.vrOn || k !== photo.vrIndex) return;
			if (vrSphere.material.uniforms.map.value) vrSphere.material.uniforms.map.value.dispose();
			vrSphere.material.uniforms.map.value = photoTexture(img);
			vrSphere.visible = true;
			vrSphere.rotation.y = rigYaw + (vr ? head.yaw : camera.rotation.y);     // the front of the photo is where you look now
		});
	});
}

function photoVRStep(d) {
	var n = photo.list.length;
	if (!n) return;
	photo.vrIndex = (photo.vrIndex + d + n) % n;
	photoVRLoad();
}

function photoVRClose() {
	photo.vrOn = false;
	if (vrSphere) vrSphere.visible = false;
	statusMesh.renderOrder = 30;
	game.msgUntil = 0;
}

function photoVRFrame() {
	PV.set(head.x, head.y, head.z);
	rig.localToWorld(PV);
	if (vrSphere) vrSphere.position.copy(PV);
}

// ---------- sound ----------

function sndShutter() {
	burst('highpass', 2500, 0.05, 0.35);
	setTimeout(function () { burst('highpass', 1800, 0.08, 0.3); }, 90);
}
