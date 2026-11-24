import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { WebGPURenderer } from "three/webgpu";
import type { Season, TimeOfDay } from "./types.ts";

export interface RendererContext {
  renderer:
    | THREE.WebGLRenderer
    | {
        render(scene: THREE.Scene, camera: THREE.Camera): void;
        setSize(w: number, h: number): void;
        setPixelRatio(r: number): void;
        domElement: HTMLCanvasElement;
      };
  backend: "WebGPU" | "WebGL2";
  supportsTSL: boolean;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  sunLight: THREE.DirectionalLight;
  hemiLight: THREE.HemisphereLight;
  setAtmosphere(tod: TimeOfDay, season: Season): void;
  updateKeyboardPan(dt: number, keys: Set<string>): void;
}

const SKY_PRESETS: Record<
  TimeOfDay,
  {
    bg: number;
    fog: number;
    sunColor: number;
    sunIntensity: number;
    sunPos: [number, number, number];
    hemiSky: number;
    hemiGround: number;
    hemiIntensity: number;
  }
> = {
  morning: {
    bg: 0xbce3f7,
    fog: 0xcbe8f6,
    sunColor: 0xfff5dc,
    sunIntensity: 2.3,
    sunPos: [22, 30, 18],
    hemiSky: 0xdff4ff,
    hemiGround: 0x739c57,
    hemiIntensity: 1.05,
  },
  golden: {
    bg: 0xf7cfa0,
    fog: 0xf5d6ad,
    sunColor: 0xffb86b,
    sunIntensity: 2.5,
    sunPos: [30, 21, 14],
    hemiSky: 0xffe0b5,
    hemiGround: 0x6e5f3d,
    hemiIntensity: 0.9,
  },
  dusk: {
    bg: 0x263252,
    fog: 0x2d3a5e,
    sunColor: 0x8ea9e6,
    sunIntensity: 0.95,
    sunPos: [-20, 22, -16],
    hemiSky: 0x5c72ad,
    hemiGround: 0x222838,
    hemiIntensity: 0.65,
  },
};

export async function createRendererContext(canvas: HTMLCanvasElement): Promise<RendererContext> {
  let backend: "WebGPU" | "WebGL2" = "WebGL2";
  let supportsTSL = false;
  let renderer: RendererContext["renderer"];

  // Prefer Three.js WebGPURenderer (which uses WebGPU when available or WebGLBackend with TSL).
  try {
    const gpuRenderer = new WebGPURenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    gpuRenderer.shadowMap.enabled = true;
    gpuRenderer.shadowMap.type = THREE.PCFShadowMap;
    gpuRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    gpuRenderer.toneMappingExposure = 1.08;
    await gpuRenderer.init();
    const backendObj = gpuRenderer.backend as { isWebGPUBackend?: boolean } | undefined;
    backend = backendObj?.isWebGPUBackend ? "WebGPU" : "WebGL2";
    supportsTSL = true;
    renderer = gpuRenderer;
  } catch {
    backend = "WebGL2";
    supportsTSL = false;
    renderer = createWebGLFallback(canvas);
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY_PRESETS.morning.bg);
  scene.fog = new THREE.Fog(SKY_PRESETS.morning.fog, 42, 95);

  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.5, 180);
  camera.position.set(22, 23, 22);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 10;
  controls.maxDistance = 46;
  controls.maxPolarAngle = Math.PI * 0.43;
  controls.minPolarAngle = Math.PI * 0.14;
  controls.target.set(0, 0, 0);
  // Keep left-click free for building/painting; use right-drag / middle-drag to orbit/pan
  controls.mouseButtons = {
    LEFT: null as unknown as THREE.MOUSE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE,
  };
  controls.update();

  const hemiLight = new THREE.HemisphereLight(
    SKY_PRESETS.morning.hemiSky,
    SKY_PRESETS.morning.hemiGround,
    SKY_PRESETS.morning.hemiIntensity,
  );
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(
    SKY_PRESETS.morning.sunColor,
    SKY_PRESETS.morning.sunIntensity,
  );
  sunLight.position.set(...SKY_PRESETS.morning.sunPos);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 2;
  sunLight.shadow.camera.far = 100;
  const d = 32;
  sunLight.shadow.camera.left = -d;
  sunLight.shadow.camera.right = d;
  sunLight.shadow.camera.top = d;
  sunLight.shadow.camera.bottom = -d;
  sunLight.shadow.bias = -0.0008;
  scene.add(sunLight);

  const setAtmosphere = (tod: TimeOfDay, season: Season) => {
    const p = SKY_PRESETS[tod];
    const bg = new THREE.Color(p.bg);
    const fog = new THREE.Color(p.fog);
    const sunColor = new THREE.Color(p.sunColor);

    // Subtle seasonal mood tinting
    if (season === "spring" && tod !== "dusk") {
      bg.lerp(new THREE.Color(0xcdebf8), 0.25);
      fog.lerp(new THREE.Color(0xdaf0fa), 0.25);
    } else if (season === "autumn" && tod !== "dusk") {
      bg.lerp(new THREE.Color(0xf0cba0), 0.28);
      fog.lerp(new THREE.Color(0xf0d2ae), 0.28);
      sunColor.lerp(new THREE.Color(0xffc078), 0.25);
    } else if (season === "winter") {
      bg.lerp(new THREE.Color(tod === "dusk" ? 0x1c2844 : 0xd0e2f0), 0.45);
      fog.lerp(new THREE.Color(tod === "dusk" ? 0x243252 : 0xdbe9f4), 0.45);
      sunColor.lerp(new THREE.Color(0xe6f2ff), 0.3);
    }

    scene.background = bg;
    scene.fog = new THREE.Fog(fog.getHex(), 42, 95);
    sunLight.color.copy(sunColor);
    sunLight.intensity =
      season === "winter" && tod !== "dusk" ? p.sunIntensity * 0.9 : p.sunIntensity;
    sunLight.position.set(...p.sunPos);
    hemiLight.color.setHex(p.hemiSky);
    hemiLight.groundColor.setHex(season === "winter" && tod !== "dusk" ? 0xaabcc9 : p.hemiGround);
    hemiLight.intensity = p.hemiIntensity;
  };

  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();

  const updateKeyboardPan = (dt: number, keys: Set<string>) => {
    const panSpeed = 18 * dt;
    const rotSpeed = 1.6 * dt;

    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    right.crossVectors(forward, THREE.Object3D.DEFAULT_UP).normalize();

    const move = new THREE.Vector3();
    if (keys.has("KeyW") || keys.has("ArrowUp")) move.add(forward);
    if (keys.has("KeyS") || keys.has("ArrowDown")) move.sub(forward);
    if (keys.has("KeyD") || keys.has("ArrowRight")) move.add(right);
    if (keys.has("KeyA") || keys.has("ArrowLeft")) move.sub(right);

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(panSpeed);
      controls.target.add(move);
      camera.position.add(move);
      // Clamp camera target to island bounds
      controls.target.x = THREE.MathUtils.clamp(controls.target.x, -22, 22);
      controls.target.z = THREE.MathUtils.clamp(controls.target.z, -22, 22);
    }

    if (keys.has("KeyQ") || keys.has("KeyE")) {
      const angle = keys.has("KeyQ") ? rotSpeed : -rotSpeed;
      const offset = camera.position.clone().sub(controls.target);
      offset.applyAxisAngle(THREE.Object3D.DEFAULT_UP, angle);
      camera.position.copy(controls.target).add(offset);
    }
  };

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return {
    renderer,
    backend,
    supportsTSL,
    scene,
    camera,
    controls,
    sunLight,
    hemiLight,
    setAtmosphere,
    updateKeyboardPan,
  };
}

function createWebGLFallback(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const gl = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  gl.shadowMap.enabled = true;
  gl.shadowMap.type = THREE.PCFSoftShadowMap;
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = 1.08;
  return gl;
}
