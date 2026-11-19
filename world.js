import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const MODEL_URL = "https://motionsites.org/assets/prompt-media/fa96096e78c8153a70d2.glb";
const canvas = document.getElementById("scene");
const worldScreen = document.getElementById("worldScreen");
const loaderLabel = document.getElementById("worldLoader");
const previousButton = document.getElementById("worldPrev");
const nextButton = document.getElementById("worldNext");
const dots = Array.from(document.querySelectorAll(".world-dot"));
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let worldActive = document.body.dataset.stage === "world";

if (!canvas || !worldScreen) throw new Error("Glass world canvas is missing.");

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
} catch (error) {
  worldScreen.classList.add("no-webgl");
  if (loaderLabel) loaderLabel.textContent = "当前浏览器未启用 WebGL";
  throw error;
}

renderer.setClearColor(0x0d0907, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const bgScene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
camera.position.set(0, 0, 10);
camera.lookAt(0, 0, 0);

const pivot = new THREE.Group();
const spinner = new THREE.Group();
scene.add(pivot);
pivot.add(spinner);
spinner.rotation.set(-0.42, 0.62, 0.18);

const fullscreenVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const atmosphereMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uAspect: { value: 1 }
  },
  vertexShader: fullscreenVertexShader,
  fragmentShader: `
    precision highp float;
    varying vec2 vUv;
    uniform float uTime;
    uniform float uAspect;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    void main() {
      vec2 uv = vUv;
      vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
      float glow = exp(-dot(p * vec2(0.82, 1.04), p * vec2(0.82, 1.04)) * 5.2);
      float lowerGlow = exp(-length(p - vec2(-0.42, -0.28)) * 2.6);
      float coolEdge = exp(-length(p - vec2(0.58, -0.5)) * 3.4);
      float current = sin((p.x * 1.7 + p.y * 1.15) + uTime * 0.035) * 0.5 + 0.5;
      vec3 color = vec3(0.025, 0.016, 0.012);
      color += vec3(0.16, 0.074, 0.027) * glow;
      color += vec3(0.08, 0.032, 0.014) * lowerGlow;
      color += vec3(0.022, 0.023, 0.021) * coolEdge;
      color += vec3(0.015, 0.006, 0.002) * current * glow;
      float vignette = smoothstep(1.08, 0.28, length((uv - 0.5) * vec2(0.78, 0.96)));
      color *= mix(0.38, 1.0, vignette);
      color += (hash(uv * vec2(1440.0, 900.0) + floor(uTime * 2.0)) - 0.5) * 0.012;
      gl_FragColor = vec4(color, 1.0);
      #include <colorspace_fragment>
    }
  `,
  depthTest: false,
  depthWrite: false
});

const atmospherePlane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), atmosphereMaterial);
atmospherePlane.frustumCulled = false;
bgScene.add(atmospherePlane);

const headlineCanvas = document.createElement("canvas");
const headlineContext = headlineCanvas.getContext("2d");
const headlineTexture = new THREE.CanvasTexture(headlineCanvas);
headlineTexture.colorSpace = THREE.SRGBColorSpace;
headlineTexture.minFilter = THREE.LinearFilter;
headlineTexture.magFilter = THREE.LinearFilter;
headlineTexture.generateMipmaps = false;

const headlineMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTexture: { value: headlineTexture }
  },
  vertexShader: fullscreenVertexShader,
  fragmentShader: `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uTexture;
    void main() {
      vec4 color = texture2D(uTexture, vUv);
      gl_FragColor = color;
      #include <colorspace_fragment>
    }
  `,
  transparent: true,
  depthTest: false,
  depthWrite: false
});

const headlinePlane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), headlineMaterial);
headlinePlane.frustumCulled = false;
bgScene.add(headlinePlane);

const vertexShader = `
  varying vec3 vNormal;
  varying vec3 vEye;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vec4 mvPos = viewMatrix * worldPos;
    gl_Position = projectionMatrix * mvPos;
    vNormal = normalize(normalMatrix * normal);
    vEye = normalize(mvPos.xyz);
  }
`;

const fragmentShader = `
  precision highp float;
  varying vec3 vNormal;
  varying vec3 vEye;

  uniform sampler2D uTexture;
  uniform vec2 uResolution;
  uniform float uIorR;
  uniform float uIorY;
  uniform float uIorG;
  uniform float uIorC;
  uniform float uIorB;
  uniform float uIorP;
  uniform float uRefractPower;
  uniform float uChromatic;
  uniform float uSaturation;
  uniform float uShininess;
  uniform float uDiffuseness;
  uniform float uFresnelPower;
  uniform vec3 uLight;
  uniform float uBackside;

  float specular(vec3 lightPos, float shininess, float diffuseness) {
    vec3 lightVector = normalize(-lightPos);
    vec3 view = normalize(-vEye);
    vec3 halfVector = normalize(lightVector + view);
    vec3 n = normalize(vNormal);
    float normalDotLight = max(0.0, dot(n, lightVector));
    float normalDotHalf = max(0.0, dot(n, halfVector));
    return pow(normalDotHalf, shininess) + normalDotLight * diffuseness;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;
    vec3 n = normalize(vNormal);
    if (uBackside > 0.5) n = -n;
    vec3 eye = normalize(vEye);
    vec3 color = vec3(0.0);
    const int LOOP = 16;

    for (int i = 0; i < LOOP; i++) {
      float slide = float(i) / float(LOOP) * 0.045;
      vec3 refrR = refract(eye, n, 1.0 / uIorR);
      vec3 refrY = refract(eye, n, 1.0 / uIorY);
      vec3 refrG = refract(eye, n, 1.0 / uIorG);
      vec3 refrC = refract(eye, n, 1.0 / uIorC);
      vec3 refrB = refract(eye, n, 1.0 / uIorB);
      vec3 refrP = refract(eye, n, 1.0 / uIorP);

      vec3 txR = texture2D(uTexture, uv + refrR.xy * (uRefractPower + slide) * uChromatic).rgb;
      vec3 txY = texture2D(uTexture, uv + refrY.xy * (uRefractPower + slide) * uChromatic).rgb;
      vec3 txG = texture2D(uTexture, uv + refrG.xy * (uRefractPower + slide * 2.0) * uChromatic).rgb;
      vec3 txC = texture2D(uTexture, uv + refrC.xy * (uRefractPower + slide * 2.5) * uChromatic).rgb;
      vec3 txB = texture2D(uTexture, uv + refrB.xy * (uRefractPower + slide * 3.0) * uChromatic).rgb;
      vec3 txP = texture2D(uTexture, uv + refrP.xy * (uRefractPower + slide) * uChromatic).rgb;

      float r = txR.x * 0.5;
      float y = (txY.x * 2.0 + txY.y * 2.0 - txY.z) / 6.0;
      float g = txG.y * 0.5;
      float c = (txC.y * 2.0 + txC.z * 2.0 - txC.x) / 6.0;
      float b = txB.z * 0.5;
      float p = (txP.z * 2.0 + txP.x * 2.0 - txP.y) / 6.0;

      float mixedR = r + (2.0 * p + 2.0 * y - c) / 3.0;
      float mixedG = g + (2.0 * y + 2.0 * c - p) / 3.0;
      float mixedB = b + (2.0 * c + 2.0 * p - y) / 3.0;
      color += vec3(mixedR, mixedG, mixedB);
    }

    color /= float(LOOP);
    float luma = dot(color, vec3(0.2125, 0.7154, 0.0721));
    color = mix(vec3(luma), color, uSaturation);

    float spec = specular(uLight, uShininess, uDiffuseness);
    spec += 0.6 * specular(vec3(1.0, 1.0, -1.0), uShininess * 0.6, uDiffuseness * 0.5);
    color += spec * (uBackside > 0.5 ? 0.35 : 1.0);

    float f = pow(1.0 + dot(eye, n), uFresnelPower);
    color = mix(color, vec3(1.0, 0.92, 0.82), f * (uBackside > 0.5 ? 0.25 : 0.55));
    color += vec3(0.004, 0.005, 0.007);
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

function createMaterial(backside, texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTexture: { value: texture },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uIorR: { value: 1.15 },
      uIorY: { value: 1.16 },
      uIorG: { value: 1.18 },
      uIorC: { value: 1.22 },
      uIorB: { value: 1.22 },
      uIorP: { value: 1.22 },
      uRefractPower: { value: backside ? 0.22 : 0.3 },
      uChromatic: { value: 0.5 },
      uSaturation: { value: 1.08 },
      uShininess: { value: 90 },
      uDiffuseness: { value: 0.02 },
      uFresnelPower: { value: 5 },
      uLight: { value: new THREE.Vector3(-1, 1, 1) },
      uBackside: { value: backside ? 1 : 0 }
    },
    vertexShader,
    fragmentShader,
    side: backside ? THREE.BackSide : THREE.FrontSide
  });
}

const renderTargetOptions = {
  type: THREE.HalfFloatType,
  depthBuffer: true,
  colorSpace: THREE.LinearSRGBColorSpace
};
const rtBack = new THREE.WebGLRenderTarget(1, 1, renderTargetOptions);
const rtFront = new THREE.WebGLRenderTarget(1, 1, renderTargetOptions);
const backMaterial = createMaterial(true, rtBack.texture);
const frontMaterial = createMaterial(false, rtFront.texture);
let cubeMesh = null;

function addCube(geometry) {
  if (cubeMesh) {
    spinner.remove(cubeMesh);
    cubeMesh.geometry.dispose();
  }
  cubeMesh = new THREE.Mesh(geometry, frontMaterial);
  spinner.add(cubeMesh);
  worldScreen.classList.add("has-webgl");
  if (loaderLabel) loaderLabel.classList.add("is-done");
}

function createFallbackCube() {
  addCube(new RoundedBoxGeometry(1, 1, 1, 8, 0.12));
}

function normalizeModel(gltf) {
  gltf.scene.updateMatrixWorld(true);
  const geometries = [];

  gltf.scene.traverse((object) => {
    if (!object.isMesh || !object.geometry) return;
    let geometry = object.geometry.clone();
    Object.keys(geometry.attributes).forEach((name) => {
      if (name !== "position" && name !== "normal") geometry.deleteAttribute(name);
    });
    geometry = mergeVertices(geometry, 1e-4);
    geometry.computeVertexNormals();
    geometry.applyMatrix4(object.matrixWorld);
    geometries.push(geometry);
  });

  if (!geometries.length) throw new Error("3D model contains no mesh geometry.");
  let geometry = mergeGeometries(geometries, false);
  geometries.forEach((part) => part.dispose());
  if (!geometry) throw new Error("3D model geometry could not be merged.");

  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const largest = Math.max(size.x, size.y, size.z) || 1;
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.scale(1 / largest, 1 / largest, 1 / largest);
  geometry.computeVertexNormals();
  return geometry;
}

new GLTFLoader().load(
  MODEL_URL,
  (gltf) => {
    try {
      addCube(normalizeModel(gltf));
    } catch (error) {
      console.warn("Glass model fallback:", error);
      createFallbackCube();
    }
  },
  undefined,
  (error) => {
    console.warn("Glass model failed to load, using rounded cube.", error);
    createFallbackCube();
  }
);

function drawHeadline(width, height, dpr) {
  headlineCanvas.width = Math.max(1, Math.round(width * dpr));
  headlineCanvas.height = Math.max(1, Math.round(height * dpr));
  headlineContext.setTransform(dpr, 0, 0, dpr, 0, 0);
  headlineContext.clearRect(0, 0, width, height);

  const mobile = width < 768 || width / height < 1;
  let fontSize = Math.min(height * 0.21, width * (mobile ? 0.21 : 0.118));
  const lines = ["Explore", "New", "Ideas"];

  headlineContext.textAlign = "center";
  headlineContext.textBaseline = "alphabetic";
  headlineContext.font = `800 ${fontSize}px Poppins, sans-serif`;
  const widest = Math.max(...lines.map((line) => headlineContext.measureText(line).width));
  const available = width * (mobile ? 0.9 : 0.5);
  if (widest > available) fontSize *= available / widest;

  headlineContext.font = `800 ${fontSize}px Poppins, sans-serif`;
  headlineContext.fillStyle = "rgba(250, 239, 222, 0.94)";
  headlineContext.shadowColor = "rgba(229, 164, 90, 0.13)";
  headlineContext.shadowBlur = Math.max(18, fontSize * 0.28);

  const centerX = width * (mobile ? 0.5 : 0.505);
  const centerY = height * (mobile ? 0.45 : 0.468);
  const lineGap = fontSize * 1.07;
  const capHeight = fontSize * 0.7;

  lines.forEach((line, index) => {
    const baseline = centerY + capHeight / 2 + (index - 1) * lineGap;
    headlineContext.fillText(line, centerX, baseline);
  });
  headlineContext.shadowBlur = 0;
  headlineTexture.needsUpdate = true;
}

function layout() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  const drawingWidth = Math.round(width * dpr);
  const drawingHeight = Math.round(height * dpr);
  rtBack.setSize(drawingWidth, drawingHeight);
  rtFront.setSize(drawingWidth, drawingHeight);
  backMaterial.uniforms.uResolution.value.set(drawingWidth, drawingHeight);
  frontMaterial.uniforms.uResolution.value.set(drawingWidth, drawingHeight);
  atmosphereMaterial.uniforms.uAspect.value = camera.aspect;

  const visibleHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
  const visibleWidth = visibleHeight * camera.aspect;
  const mobile = width < 768 || width / height < 1;
  const screenX = mobile ? 0.5 : 0.517;
  const screenY = mobile ? 0.45 : 0.488;
  pivot.position.set(
    (screenX - 0.5) * visibleWidth,
    (0.5 - screenY) * visibleHeight,
    0
  );
  const edgePixels = Math.min(height * 0.44, width * (mobile ? 0.45 : 0.29));
  const scale = (edgePixels / height) * visibleHeight;
  pivot.scale.setScalar(scale);
  drawHeadline(width, height, dpr);
}

let dragging = false;
let pointerId = null;
let previousX = 0;
let previousY = 0;
let velocityX = 0;
let velocityY = 0;
let lastPointerTime = 0;
let idleTime = 0;
let idleBlend = 1;
let spinRemaining = 0;

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 && event.pointerType !== "touch") return;
  dragging = true;
  pointerId = event.pointerId;
  previousX = event.clientX;
  previousY = event.clientY;
  lastPointerTime = performance.now();
  velocityX = 0;
  velocityY = 0;
  spinRemaining = 0;
  idleBlend = 0;
  idleTime = 0;
  canvas.setPointerCapture(event.pointerId);
  canvas.classList.add("is-dragging");
});

canvas.addEventListener("pointermove", (event) => {
  if (!dragging || event.pointerId !== pointerId) return;
  const now = performance.now();
  const frameFactor = Math.max(0.25, (now - lastPointerTime) / 16.667);
  const dx = (event.clientX - previousX) * 0.008;
  const dy = (event.clientY - previousY) * 0.008;
  const yAxis = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx);
  const xAxis = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), dy);
  spinner.quaternion.premultiply(yAxis).premultiply(xAxis);
  velocityX = dy / frameFactor;
  velocityY = dx / frameFactor;
  previousX = event.clientX;
  previousY = event.clientY;
  lastPointerTime = now;
});

function releasePointer(event) {
  if (!dragging || (event && event.pointerId !== pointerId)) return;
  dragging = false;
  idleTime = 0;
  idleBlend = 0;
  canvas.classList.remove("is-dragging");
  if (pointerId !== null && canvas.hasPointerCapture(pointerId)) {
    canvas.releasePointerCapture(pointerId);
  }
  pointerId = null;
}

canvas.addEventListener("pointerup", releasePointer);
canvas.addEventListener("pointercancel", releasePointer);
canvas.addEventListener("lostpointercapture", () => releasePointer());

function rotateCube(direction) {
  velocityX = 0;
  velocityY = 0;
  spinRemaining += direction * Math.PI / 2;
  idleBlend = 0;
  idleTime = 0;
}

previousButton?.addEventListener("click", () => rotateCube(-1));
nextButton?.addEventListener("click", () => rotateCube(1));

dots.forEach((dot, index) => {
  dot.addEventListener("click", () => {
    const views = [
      [-0.42, 0.62, 0.18],
      [-0.18, 2.08, -0.08],
      [0.35, 3.62, 0.2]
    ];
    spinner.rotation.set(...views[index]);
    spinner.quaternion.setFromEuler(spinner.rotation);
    velocityX = 0;
    velocityY = 0;
    spinRemaining = 0;
    idleBlend = 0;
    idleTime = 0;
    dots.forEach((item) => item.classList.toggle("is-active", item === dot));
  });
});

let previousFrame = performance.now();
function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, Math.max(0.001, (now - previousFrame) / 1000));
  previousFrame = now;
  atmosphereMaterial.uniforms.uTime.value = now / 1000;

  if (!worldActive) return;

  if (!dragging) {
    if (Math.abs(velocityX) > 0.00004 || Math.abs(velocityY) > 0.00004) {
      const damping = Math.pow(0.94, dt * 60);
      spinner.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), velocityX);
      spinner.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), velocityY);
      velocityX *= damping;
      velocityY *= damping;
    }

    if (Math.abs(spinRemaining) > 0.0005) {
      const step = spinRemaining * Math.min(1, 0.09 * dt * 60);
      spinner.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), step);
      spinRemaining -= step;
    }

    idleTime += dt;
    if (idleTime > 0.6) idleBlend = Math.min(1, idleBlend + dt);
  }

  if (!reducedMotion && idleBlend > 0 && Math.abs(spinRemaining) < 0.0005) {
    spinner.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), 0.0035 * dt * 60 * idleBlend);
    spinner.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), 0.0012 * dt * 60 * idleBlend);
  }

  renderer.setRenderTarget(rtBack);
  renderer.clear();
  renderer.render(bgScene, camera);

  renderer.setRenderTarget(rtFront);
  renderer.clear();
  renderer.render(bgScene, camera);
  if (cubeMesh) {
    cubeMesh.material = backMaterial;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(scene, camera);
    renderer.autoClear = true;
  }

  renderer.setRenderTarget(null);
  renderer.clear();
  renderer.render(bgScene, camera);
  if (cubeMesh) {
    cubeMesh.material = frontMaterial;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(scene, camera);
    renderer.autoClear = true;
  }
}

layout();
window.addEventListener("resize", layout);
window.addEventListener("experience:stage", (event) => {
  worldActive = event.detail.stage === "world";
  if (worldActive) previousFrame = performance.now();
});
document.fonts?.addEventListener?.("loadingdone", layout);
Promise.race([
  Promise.all([
    document.fonts?.load?.("800 100px Poppins") || Promise.resolve(),
    document.fonts?.ready || Promise.resolve()
  ]),
  new Promise((resolve) => window.setTimeout(resolve, 2500))
]).finally(layout);

requestAnimationFrame(animate);
