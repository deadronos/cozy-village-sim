import * as THREE from "three";
import {
  abs,
  clamp,
  cos,
  float,
  max,
  mix,
  positionGeometry,
  positionLocal,
  positionWorld,
  sin,
  smoothstep,
  texture,
  textureLevel,
  uniform,
  vec3,
} from "three/tsl";
import { MeshStandardNodeMaterial } from "three/webgpu";

export interface WaterShaderHandle {
  material: THREE.Material;
  updateTime(elapsed: number): void;
  setColors(shallow: number, deep: number, river: number, foam: number): void;
  dispose(): void;
}

export interface FoliageSwayOptions {
  baseY: number;
  swayHeight: number;
  amplitude: number;
  speed: number;
  roughness?: number;
  vertexColors?: boolean;
  color?: number;
}

export interface FoliageShaderHandle {
  material: THREE.Material;
  updateTime(elapsed: number): void;
  setWindStrength(strength: number): void;
  dispose(): void;
}

/**
 * Creates a stylized TSL diorama water material with animated vertex waves,
 * shallow-to-deep depth gradient, freshwater river tinting, and crisp shoreline/piling foam.
 * Falls back cleanly to standard MeshStandardMaterial when running without NodeMaterial support.
 */
export function createStylizedWaterMaterial(
  supportsTSL: boolean,
  waterFieldTex: THREE.DataTexture,
  worldFieldSize: number,
  onFallbackBob?: (offsetY: number) => void,
): WaterShaderHandle {
  if (!supportsTSL) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x4ca6c8,
      roughness: 0.24,
      metalness: 0.06,
      flatShading: true,
      transparent: true,
      opacity: 0.88,
    });
    return {
      material: mat,
      updateTime(elapsed: number) {
        onFallbackBob?.(Math.sin(elapsed * 1.4) * 0.045);
      },
      setColors(shallow: number) {
        mat.color.setHex(shallow);
      },
      dispose() {
        mat.dispose();
      },
    };
  }

  const uTime = uniform(0);
  const uShallowColor = uniform(new THREE.Color(0x50c4d4));
  const uDeepColor = uniform(new THREE.Color(0x1d628c));
  const uRiverColor = uniform(new THREE.Color(0x4ac8bc));
  const uFoamColor = uniform(new THREE.Color(0xf4fbff));

  const invSize = float(1 / worldFieldSize);
  const halfSize = float(worldFieldSize * 0.5);

  // Vertex stage: use textureLevel (LOD 0) because WGSL forbids implicit mip sampling in vertex shaders
  const waterUv = clamp(positionLocal.xz.add(halfSize).mul(invSize), 0.004, 0.996);
  const vField = textureLevel(waterFieldTex, waterUv, float(0));
  const vShore = vField.x;
  const waveAmp = mix(float(0.32), float(1.0), smoothstep(0.0, 0.24, vShore));

  const w1 = sin(positionLocal.x.mul(0.55).add(positionLocal.z.mul(0.38)).add(uTime.mul(1.7)));
  const w2 = cos(positionLocal.x.mul(0.42).sub(positionLocal.z.mul(0.64)).sub(uTime.mul(1.35)));
  const w3 = sin(positionLocal.x.mul(1.15).add(positionLocal.z.mul(1.05)).add(uTime.mul(2.4)));
  const waveY = w1.mul(0.042).add(w2.mul(0.028)).add(w3.mul(0.015)).mul(waveAmp);
  const waterPosNode = vec3(positionLocal.x, positionLocal.y.add(waveY), positionLocal.z);

  // Fragment stage: depth tint, freshwater rivers, shallow caustics, and crisp surf/piling foam
  const fragUv = clamp(positionWorld.xz.add(halfSize).mul(invSize), 0.004, 0.996);
  const field = texture(waterFieldTex, fragUv);
  const shoreDist = field.x;
  const pilingDist = field.y;
  const riverMask = field.z;

  const depthMix = smoothstep(0.04, 0.68, shoreDist);
  const baseCol = mix(uShallowColor, uDeepColor, depthMix);
  const waterCol = mix(baseCol, uRiverColor, riverMask.mul(0.68));

  const causticWave = sin(positionWorld.x.mul(1.15).add(uTime.mul(1.3)))
    .mul(cos(positionWorld.z.mul(1.05).sub(uTime.mul(0.95))))
    .mul(0.5)
    .add(0.5);
  const shallowGlow = float(1.0).sub(smoothstep(0.0, 0.48, shoreDist));
  const sunlitCol = waterCol.add(vec3(0.08, 0.14, 0.14).mul(causticWave).mul(shallowGlow));

  // Shoreline contact foam + gentle pulsing surf band
  const contactFoam = float(1.0).sub(smoothstep(0.02, 0.11, shoreDist));
  const surfBand = sin(shoreDist.mul(36.0).sub(uTime.mul(2.4)))
    .mul(0.5)
    .add(0.5);
  const surfZone = float(1.0).sub(smoothstep(0.06, 0.34, shoreDist));
  const shoreFoam = max(contactFoam, surfBand.mul(surfZone).mul(0.85));

  // Concentric foam rings hugging Fishing Dock and Bridge pilings
  const pilingContact = float(1.0).sub(smoothstep(0.08, 0.24, pilingDist));
  const pilingRipple = sin(pilingDist.mul(24.0).sub(uTime.mul(3.2)))
    .mul(0.5)
    .add(0.5);
  const pilingZone = float(1.0).sub(smoothstep(0.14, 0.62, pilingDist));
  const pilingFoam = max(pilingContact, pilingRipple.mul(pilingZone).mul(0.9));

  const crispFoam = smoothstep(0.36, 0.62, max(shoreFoam, pilingFoam));
  const finalColor = mix(sunlitCol, uFoamColor, crispFoam);

  const mat = new MeshStandardNodeMaterial({
    roughness: 0.24,
    metalness: 0.06,
    flatShading: true,
    transparent: true,
  });
  mat.positionNode = waterPosNode;
  mat.colorNode = finalColor;
  mat.roughnessNode = mix(float(0.22), float(0.86), crispFoam);
  mat.opacityNode = mix(
    float(0.84),
    float(0.98),
    max(crispFoam, smoothstep(0.14, 0.72, shoreDist)),
  );

  return {
    material: mat,
    updateTime(elapsed: number) {
      uTime.value = elapsed;
    },
    setColors(shallow: number, deep: number, river: number, foam: number) {
      uShallowColor.value.setHex(shallow);
      uDeepColor.value.setHex(deep);
      uRiverColor.value.setHex(river);
      uFoamColor.value.setHex(foam);
    },
    dispose() {
      mat.dispose();
    },
  };
}

/**
 * Creates a GPU wind-swaying foliage material for instanced wheat, meadow grass, and tree canopies.
 * Reads `positionGeometry.y` to keep roots/trunks anchored and `positionLocal.xz` (post-instancing)
 * so every instance gets an organic rolling wind phase across the island.
 */
export function createSwayingFoliageMaterial(
  supportsTSL: boolean,
  opts: FoliageSwayOptions,
): FoliageShaderHandle {
  if (!supportsTSL) {
    const mat = new THREE.MeshStandardMaterial({
      color: opts.color ?? 0xffffff,
      roughness: opts.roughness ?? 0.88,
      metalness: 0.0,
      flatShading: true,
      vertexColors: opts.vertexColors ?? true,
    });
    return {
      material: mat,
      updateTime() {},
      setWindStrength() {},
      dispose() {
        mat.dispose();
      },
    };
  }

  const uTime = uniform(0);
  const uWindStrength = uniform(1.0);

  const rawWeight = smoothstep(opts.baseY, opts.baseY + opts.swayHeight, positionGeometry.y);
  const heightWeight = rawWeight.mul(rawWeight);

  // `instancedMesh(object)` executes before `positionNode`, so `positionLocal.xz` already has per-instance XZ
  const phase = positionLocal.x.mul(0.42).add(positionLocal.z.mul(0.31));
  const gust = sin(phase.add(uTime.mul(opts.speed))).add(
    cos(phase.mul(1.65).sub(uTime.mul(opts.speed * 0.72))).mul(0.42),
  );
  const sway = gust.mul(heightWeight).mul(opts.amplitude).mul(uWindStrength);

  const swayedPos = vec3(
    positionLocal.x.add(sway.mul(0.85)),
    positionLocal.y.sub(abs(sway).mul(0.12)),
    positionLocal.z.add(sway.mul(0.52)),
  );

  const mat = new MeshStandardNodeMaterial({
    color: opts.color ?? 0xffffff,
    roughness: opts.roughness ?? 0.88,
    metalness: 0.0,
    flatShading: true,
    vertexColors: opts.vertexColors ?? true,
  });
  mat.positionNode = swayedPos;

  return {
    material: mat,
    updateTime(elapsed: number) {
      uTime.value = elapsed;
    },
    setWindStrength(strength: number) {
      uWindStrength.value = strength;
    },
    dispose() {
      mat.dispose();
    },
  };
}
