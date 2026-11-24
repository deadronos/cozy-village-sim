import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { TimeOfDay } from "./types.ts";

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
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  sunLight: THREE.DirectionalLight;
  hemiLight: THREE.HemisphereLight;
  setTimeOfDay(tod: TimeOfDay): void;
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
    sunPos: [30, 16, 14],
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
  let renderer: RendererContext["renderer"];

  // Prefer Three.js WebGPURenderer when navigator.gpu is available, with seamless WebGL2 fallback.
  if (typeof navigator !== "undefined" && "gpu" in navigator) {
    try {
      const webgpuMod = await import("three/webgpu");
      const gpuRenderer = new webgpuMod.WebGPURenderer({
        canvas,
        antialias: true,
        powerPreference: "high-performance",
      });
      gpuRenderer.shadowMap.enabled = true;
      gpuRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
      gpuRenderer.toneMapping = THREE.ACESFilmicToneMapping;
      gpuRenderer.toneMappingExposure = 1.08;
      await gpuRenderer.init();
      backend = "WebGPU";
      renderer = gpuRenderer;
    } catch {
      backend = "WebGL2";
      renderer = createWebGLFallback(canvas);
    }
  } else {
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
  sunLight.shadow.camera.far = 90;
  const d = 28;
  sunLight.shadow.camera.left = -d;
  sunLight.shadow.camera.right = d;
  sunLight.shadow.camera.top = d;
  sunLight.shadow.camera.bottom = -d;
  sunLight.shadow.bias = -0.0008;
  scene.add(sunLight);

  const setTimeOfDay = (tod: TimeOfDay) => {
    const p = SKY_PRESETS[tod];
    scene.background = new THREE.Color(p.bg);
    scene.fog = new THREE.Fog(p.fog, 42, 95);
    sunLight.color.setHex(p.sunColor);
    sunLight.intensity = p.sunIntensity;
    sunLight.position.set(...p.sunPos);
    hemiLight.color.setHex(p.hemiSky);
    hemiLight.groundColor.setHex(p.hemiGround);
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
    scene,
    camera,
    controls,
    sunLight,
    hemiLight,
    setTimeOfDay,
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
