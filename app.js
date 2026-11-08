// The Mule AR preview: place a life-size Mule on real ground (WebXR, Chrome on ARCore Android phones),
// put any ad on it, and snap a photo to share. Without AR (desktop, iPhone) it shows a 3D preview instead.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { XREstimatedLight } from 'three/addons/webxr/XREstimatedLight.js';

const CAMPAIGNS = [
  ['fall_festival', 'Fall Festival'], ['ember_oak', 'Ember & Oak'], ['willow_creek', 'Willow Creek'],
  ['riverside', 'Riverside'], ['friday_lights', 'Friday Lights'], ['holiday_sale', 'Holiday Sale'],
  ['now_hiring', 'Now Hiring'], ['summer_nights', 'Summer Nights'], ['asinine', 'Asinine Signs'],
];
const CONTACT = 'asininesigns.com  ·  918.230.0056';
const SHARE_TEXT = 'Here is how THE MULE would look at your location. Asinine Signs, asininesigns.com, 918.230.0056';
const VIEWPORT = { Top: [84, 42], Bottom: [84, 13] };   // inches; replaced by the GLB's own numbers
const $ = (id) => document.getElementById(id);
const DEBUG = new URLSearchParams(location.search).has('debug');   // ?debug shows a log panel for phone testing

function log(...parts) {
  const line = parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ');
  console.log(line);
  if (!DEBUG) return;
  const el = $('log');
  (session ? $('ar') : document.body).append(el);   // like toast(): in AR only the overlay is on screen
  el.classList.remove('hidden');
  el.textContent = `${new Date().toLocaleTimeString()} ${line}\n${el.textContent}`.slice(0, 4000);
}
window.addEventListener('error', (e) => { log('error', e.message); toast(`Error: ${e.message}`); });
window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason?.message || String(e.reason);
  log('rejection', msg);
  toast(`Error: ${msg}`);
});

// ------------------------------------------------------------------ renderer, scene, lights
const canvas = $('preview');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;           // the snapshot re-renders without tone mapping; keep them equal
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local');

const scene = new THREE.Scene();
const previewBg = new THREE.Color(0x1b1d22);
scene.background = previewBg;
scene.fog = new THREE.Fog(previewBg, 12, 38);
const roomEnv = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = roomEnv;

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.05, 100);
const portrait = innerHeight > innerWidth;
camera.position.set(-2.6, 1.7, portrait ? 7.5 : 4.8).multiplyScalar(location.hash === '#back' ? -1 : 1);
camera.position.y = Math.abs(camera.position.y);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, portrait ? -0.2 : 0.45, 0);      // sign sits above the controls panel
Object.assign(controls, { enableDamping: true, maxPolarAngle: Math.PI * 0.495, minDistance: 1.2, maxDistance: 12 });

const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x5a5040, 1.1);
scene.add(hemi);

function shadowLight(color, intensity, extent, mapSize) {
  const l = new THREE.DirectionalLight(color, intensity);
  l.castShadow = true;
  l.shadow.mapSize.set(mapSize, mapSize);
  Object.assign(l.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 0.1, far: 20 });
  l.shadow.bias = -0.0005;
  l.shadow.normalBias = 0.02;
  scene.add(l, l.target);
  return l;
}
const sun = shadowLight(0xfff4e5, 2.2, 3.5, 2048);   // follows the phone's light estimate when there is one
const sky = shadowLight(0xffffff, 0.25, 2.0, 1024);  // straight down: soft contact shadow under the base
const sunDir = new THREE.Vector3(-0.35, 1, 0.55).normalize();
const ambient = new THREE.LightProbe();               // the phone's ambient estimate, copied here so it can be scaled
ambient.intensity = 0;
scene.add(ambient);
let brightness = 1;                                   // the "Sign brightness" slider; scales every light
try { brightness = Number(localStorage.getItem('mule.brightness')) || 1; } catch { /* private mode */ }

const xrLight = new XREstimatedLight(renderer);      // must exist before the session starts
let estimating = false;
xrLight.addEventListener('estimationstart', () => {
  estimating = true;
  log('light estimation started');
  scene.add(xrLight);
  xrLight.directionalLight.visible = false;           // its direction and colour drive `sun` instead
  xrLight.lightProbe.visible = false;                 // copied into `ambient` instead
  hemi.visible = false;
  if (xrLight.environment) scene.environment = xrLight.environment;
});
xrLight.addEventListener('estimationend', () => {
  estimating = false;
  scene.remove(xrLight);
  hemi.visible = true;
  ambient.intensity = 0;
  scene.environment = roomEnv;
});

// ------------------------------------------------------------------ the sign
const sign = new THREE.Group();                       // origin: centre of the sign on the ground, front = +Z
scene.add(sign);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.ShadowMaterial({ opacity: 0.4 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
ground.visible = false;                               // AR only: shadows on the real ground
sign.add(ground);
const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 96), new THREE.MeshStandardMaterial({ color: 0x2c2e2b, roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.001;
floor.receiveShadow = true;
scene.add(floor);                                     // desktop preview only

const adMeshes = {};                                  // 'Top_Front' -> mesh
new GLTFLoader().load('mule.glb', (gltf) => {
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    if (o.name.startsWith('Ad_')) {
      const key = o.name.slice(3);
      adMeshes[key] = o;
      if (o.userData.viewport_w_in) VIEWPORT[key.split('_')[0]] = [o.userData.viewport_w_in, o.userData.viewport_h_in];
      o.material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.65 });   // matte printed stock
    }
  });
  sign.add(gltf.scene);
  applyCampaign('fall_festival', 'both');
}, undefined, (e) => toast(`Could not load the sign model: ${e.message || e}`));

// ------------------------------------------------------------------ ads
function artTexture(img, vp) {
  const [w, h] = VIEWPORT[vp];
  const cw = 2048, ch = Math.round(cw * h / w);
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, cw, ch);
  const s = Math.max(cw / img.width, ch / img.height);       // fill the viewport, crop the overflow
  g.drawImage(img, (cw - img.width * s) / 2, (ch - img.height * s) / 2, img.width * s, img.height * s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false;                                           // glTF UVs: v = 0 at the top
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

function setArt(vp, faces, img) {
  for (const side of faces === 'both' ? ['Front', 'Back'] : [faces]) {
    const m = adMeshes[`${vp}_${side}`];
    if (!m) continue;
    m.material.map?.dispose();
    m.material.map = artTexture(img, vp);
    m.material.needsUpdate = true;
  }
}

function loadImage(src) {
  return new Promise((ok, fail) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = fail;
    im.src = src;
  });
}

async function applyCampaign(id, faces) {
  const [top, bottom] = await Promise.all([loadImage(`ads/${id}_top.jpg`), loadImage(`ads/${id}_bottom.jpg`)]);
  setArt('Top', faces, top);
  setArt('Bottom', faces, bottom);
}

async function applyFile(file, vp, faces) {
  if (!file) return;
  try {
    const img = await createImageBitmap(file, { imageOrientation: 'from-image' });
    setArt(vp, faces, img);
    const [w, h] = VIEWPORT[vp];
    if (Math.abs(img.width / img.height - w / h) / (w / h) > 0.08) {
      toast(`Artwork cropped to fit the ${w} × ${h} in ${vp.toLowerCase()} viewport`);
    }
  } catch (e) {
    toast(`Could not open that image: ${e.message || e}`);
  }
}

function buildAdControls(host) {
  host.append($('adsTemplate').content.cloneNode(true));
  const pick = host.querySelector('[data-role=campaign]');
  const faces = host.querySelector('[data-role=faces]');
  for (const [id, label] of CAMPAIGNS) pick.add(new Option(`Sample: ${label}`, id));
  pick.addEventListener('change', () => applyCampaign(pick.value, faces.value));
  for (const vp of ['top', 'bottom']) {
    const input = host.querySelector(`[data-role=${vp}]`);
    input.addEventListener('change', () => {
      applyFile(input.files[0], vp === 'top' ? 'Top' : 'Bottom', faces.value);
      input.value = '';
    });
  }
}
buildAdControls($('adsHome'));
buildAdControls($('adsAR'));

// ------------------------------------------------------------------ AR session
const reticle = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.2, 48).rotateX(-Math.PI / 2),
                               new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
reticle.matrixAutoUpdate = false;
reticle.visible = false;
scene.add(reticle);

let session = null, hitSource = null, localSpace = null, glBinding = null;
let placing = true, snapPending = false, stripOn = true, lastHint = '';
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);

async function checkSupport() {
  const btn = $('startAR');
  let ok = false;
  try { ok = !!navigator.xr && await navigator.xr.isSessionSupported('immersive-ar'); } catch { ok = false; }
  log('immersive-ar supported:', ok, navigator.userAgent);
  btn.disabled = !ok;
  btn.textContent = ok ? 'Place it in AR' : 'AR not available here';
  if (!ok) {
    const s = $('support');
    s.textContent = isIOS
      ? 'AR in the browser needs an Android phone with Chrome. You can still try ads on the 3D model above.'
      : 'AR needs Chrome on an ARCore-supported Android phone. You can still try ads on the 3D model above.';
    s.classList.remove('hidden');
  }
}
checkSupport();

$('startAR').addEventListener('click', async () => {
  try {
    session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay', 'light-estimation', 'camera-access'],
      domOverlay: { root: $('ar') },
    });
  } catch (e) {
    log('requestSession failed', e.name, e.message);
    toast(`Could not start AR: ${e.message || e}`);
    return;
  }
  log('session features', [...(session.enabledFeatures || ['(not reported)'])]);
  session.addEventListener('end', onSessionEnd);
  session.addEventListener('select', () => {
    if (placing && reticle.visible) placing = false;   // tap on the camera view drops the sign
  });
  await renderer.xr.setSession(session);
  localSpace = renderer.xr.getReferenceSpace();
  const viewer = await session.requestReferenceSpace('viewer');
  hitSource = await session.requestHitTestSource({ space: viewer });
  glBinding = null;
  placing = true;
  sign.visible = false;
  scene.background = null;
  floor.visible = false;
  ground.visible = true;
  controls.enabled = false;
  $('home').classList.add('hidden');
  $('result').classList.add('hidden');
  $('ar').classList.remove('hidden');
});

function onSessionEnd() {
  session = null;
  hitSource = null;
  reticle.visible = false;
  sign.position.set(0, 0, 0);
  sign.rotation.set(0, 0, 0);
  sign.visible = true;
  scene.background = previewBg;
  floor.visible = true;
  ground.visible = false;
  controls.enabled = true;
  $('ar').classList.add('hidden');
  $('adsheet').classList.add('hidden');
  if ($('result').classList.contains('hidden')) $('home').classList.remove('hidden');
}

// buttons on the overlay must not also count as a tap on the camera view
for (const id of ['arbar', 'exit', 'adsheet']) $(id).addEventListener('beforexrselect', (e) => e.preventDefault());
$('exit').addEventListener('click', () => session?.end());
$('move').addEventListener('click', () => { placing = true; });
$('face').addEventListener('click', faceCamera);
$('adsBtn').addEventListener('click', () => $('adsheet').classList.toggle('hidden'));
$('bright').value = brightness;
$('bright').addEventListener('input', (e) => {
  brightness = Number(e.target.value);
  try { localStorage.setItem('mule.brightness', String(brightness)); } catch { /* private mode */ }
});
$('brightReset').addEventListener('click', () => {
  $('bright').value = 1;
  $('bright').dispatchEvent(new Event('input'));
});
$('strip').addEventListener('click', () => {
  stripOn = !stripOn;
  $('strip').textContent = `Info: ${stripOn ? 'on' : 'off'}`;
});
$('snap').addEventListener('click', () => {
  if (placing) { toast('Place the sign first'); return; }
  snapPending = true;
  const f = $('flash');
  f.style.opacity = '0.8';
  setTimeout(() => { f.style.opacity = '0'; }, 120);
});

// one finger dragged sideways on the camera view turns the sign
let dragX = null;
$('ar').addEventListener('pointerdown', (e) => { if (e.target === $('ar')) dragX = e.clientX; });
$('ar').addEventListener('pointermove', (e) => {
  if (dragX === null || placing) return;
  sign.rotation.y += (e.clientX - dragX) * 0.008;
  dragX = e.clientX;
});
for (const ev of ['pointerup', 'pointercancel']) $('ar').addEventListener(ev, () => { dragX = null; });

const _v = new THREE.Vector3(), _m = new THREE.Matrix4();
function faceCamera() {
  const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  _v.setFromMatrixPosition(cam.matrixWorld);
  sign.rotation.y = Math.atan2(_v.x - sign.position.x, _v.z - sign.position.z);
}

function hint(text) {
  if (text !== lastHint) $('hint').textContent = lastHint = text;
}

function updateHits(frame) {
  let hit = null;
  for (const r of frame.getHitTestResults(hitSource)) {
    const p = r.getPose(localSpace);
    if (!p) continue;
    _m.fromArray(p.transform.matrix);
    if (_v.set(0, 1, 0).transformDirection(_m).y > 0.9) { hit = _m; break; }   // floors only, not walls
  }
  reticle.visible = placing && !!hit;
  if (hit) reticle.matrix.copy(hit);
  if (placing && hit) {
    sign.position.setFromMatrixPosition(hit);
    sign.visible = true;
    faceCamera();
  }
  hint(!placing ? 'Drag sideways to turn it. Tap Move to reposition.'
       : hit ? 'Tap the screen to place the sign' : 'Point at the ground and move the phone slowly');
}

let lastLightLog = 0;
function updateLights(t) {
  if (estimating) {
    const d = xrLight.directionalLight;
    if (d.position.lengthSq() > 0) sunDir.copy(d.position).normalize();
    sun.color.copy(d.color);
    sun.intensity = d.intensity * brightness;
    ambient.sh.copy(xrLight.lightProbe.sh);
    ambient.intensity = brightness;
    if (DEBUG && t - lastLightLog > 3000) {
      lastLightLog = t;
      const c = xrLight.lightProbe.sh.coefficients[0];
      log('light: sun', d.intensity.toFixed(2), `#${d.color.getHexString()}`, 'dir', sunDir.toArray().map((v) => v.toFixed(2)),
        'ambient', [c.x, c.y, c.z].map((v) => v.toFixed(2)), 'env', !!xrLight.environment);
    }
  } else {
    sun.color.set(0xfff4e5);
    sun.intensity = 2.2 * brightness;
    hemi.intensity = 1.1 * brightness;
  }
  sky.intensity = 0.25 * brightness;
  scene.environmentIntensity = brightness;
  sun.position.copy(sign.position).addScaledVector(sunDir, 8);
  sun.target.position.copy(sign.position);
  sky.position.copy(sign.position).add(_v.set(0, 8, 0));
  sky.target.position.copy(sign.position);
}

renderer.setAnimationLoop((t, frame) => {
  if (frame && hitSource) updateHits(frame);
  else controls.update();
  updateLights(t);
  renderer.render(scene, camera);
  if (snapPending && frame) {
    snapPending = false;
    capture(frame);
  }
});

addEventListener('resize', () => {
  if (renderer.xr.isPresenting) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ------------------------------------------------------------------ photo
// The camera picture comes from WebXR raw camera access; the sign is rendered again from the same view into
// an sRGB render target with a transparent background, and the two are composited (in linear light) here.
const DEC = new Float32Array(256).map((_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});
const ENC = new Uint8ClampedArray(4096).map((_, i) => {
  const c = i / 4095;
  return 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
});

function readTexture(gl, tex, w, h) {
  const prev = gl.getParameter(gl.FRAMEBUFFER_BINDING);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  let px = null;
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
    px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, prev);
  gl.deleteFramebuffer(fb);
  return px;
}

function capture(frame) {
  const view = frame.getViewerPose(localSpace)?.views[0];
  let cam = null, w = 0, h = 0;
  try {
    if (view?.camera) {
      const gl = renderer.getContext();
      glBinding ??= new XRWebGLBinding(session, gl);
      w = view.camera.width;
      h = view.camera.height;
      cam = readTexture(gl, glBinding.getCameraImage(view.camera), w, h);
      log('camera image', w, 'x', h, 'view', renderer.domElement.width, 'x', renderer.domElement.height);
    } else {
      log('no view.camera on this frame');
    }
  } catch (e) {
    log('camera access failed', e.name, e.message);
  }
  if (!cam) {
    toast('This phone did not share the camera picture. Take a screenshot instead (Power + Volume down).');
    return;
  }
  const xrCam = renderer.xr.getCamera();
  const sub = xrCam.cameras[0] || xrCam;
  const snapCam = new THREE.PerspectiveCamera();
  snapCam.matrixAutoUpdate = false;
  snapCam.matrix.copy(sub.matrixWorld);
  snapCam.matrixWorld.copy(sub.matrixWorld);
  snapCam.matrixWorldInverse.copy(sub.matrixWorld).invert();
  snapCam.projectionMatrix.copy(sub.projectionMatrix);
  snapCam.projectionMatrixInverse.copy(sub.projectionMatrixInverse);

  const rt = new THREE.WebGLRenderTarget(w, h, { samples: 4, colorSpace: THREE.SRGBColorSpace });
  const px = new Uint8Array(w * h * 4);
  const prevTarget = renderer.getRenderTarget();
  const prevAlpha = renderer.getClearAlpha();
  reticle.visible = false;
  renderer.xr.enabled = false;
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, snapCam);
  renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearAlpha(prevAlpha);
  renderer.xr.enabled = true;
  rt.dispose();

  const img = new ImageData(w, h);
  const o = img.data;
  for (let y = 0; y < h; y++) {
    const src = (h - 1 - y) * w * 4, dst = y * w * 4;      // GL rows run bottom-up
    for (let x = 0; x < w * 4; x += 4) {
      const i = src + x, k = 1 - px[i + 3] / 255;
      for (let c = 0; c < 3; c++) {
        const lin = DEC[px[i + c]] + DEC[cam[i + c]] * k;   // premultiplied sign over the camera picture
        o[dst + x + c] = ENC[Math.min(4095, (lin * 4095 + 0.5) | 0)];
      }
      o[dst + x + 3] = 255;
    }
  }
  finishPhoto(img);
}

async function finishPhoto(img) {
  const { width: w, height: h } = img;
  const strip = stripOn ? Math.round(Math.max(w, h) * 0.06) : 0;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h + strip;
  const g = c.getContext('2d');
  g.putImageData(img, 0, 0);
  if (strip) {
    g.fillStyle = '#111';
    g.fillRect(0, h, w, strip);
    g.fillStyle = '#f28c28';
    g.fillRect(0, h, Math.round(strip * 0.12), strip);
    g.textBaseline = 'middle';
    const pad = strip * 0.45, size = Math.round(strip * 0.36);
    g.font = `800 ${size}px system-ui, sans-serif`;
    g.fillText('THE MULE', pad, h + strip / 2);
    const lead = g.measureText('THE MULE  ').width;
    g.fillStyle = '#f2f2f2';
    g.font = `600 ${Math.round(size * 0.8)}px system-ui, sans-serif`;
    g.fillText(`by ASININE SIGNS`, pad + lead, h + strip / 2);
    g.textAlign = 'right';
    g.fillStyle = '#bdbdbd';
    g.fillText(CONTACT, w - pad, h + strip / 2);
  }
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.92));
  showResult(blob);
  session?.end();
}

let shot = null;
function showResult(blob) {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  shot = new File([blob], `Mule-preview-${stamp}.jpg`, { type: 'image/jpeg' });
  const im = $('shot');
  if (im.src) URL.revokeObjectURL(im.src);
  im.src = URL.createObjectURL(blob);
  $('home').classList.add('hidden');
  $('result').classList.remove('hidden');
}

$('back').addEventListener('click', () => {
  $('result').classList.add('hidden');
  $('home').classList.remove('hidden');
});
$('save').addEventListener('click', () => {
  if (!shot) return;
  const a = document.createElement('a');
  a.href = $('shot').src;
  a.download = shot.name;
  a.click();
});
$('share').addEventListener('click', async () => {
  if (!shot) return;
  if (navigator.canShare?.({ files: [shot] })) {
    try {
      await navigator.share({ files: [shot], title: 'THE MULE', text: SHARE_TEXT });
    } catch (e) {
      if (e.name !== 'AbortError') toast(`Sharing failed: ${e.message}`);
    }
  } else {
    toast('Sharing is not available in this browser; use Save instead.');
  }
});

// ------------------------------------------------------------------ toast
let toastTimer = 0;
function toast(msg) {
  const t = $('toast');
  (session ? $('ar') : document.body).append(t);         // in AR only the overlay is on screen
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 4000);
}
