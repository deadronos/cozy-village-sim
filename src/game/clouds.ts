import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Season, TimeOfDay } from "./types.ts";

interface CloudEntry {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  baseY: number;
  speedFactor: number;
  phase: number;
}

const WRAP_LIMIT = 44;
const WIND_DIR_X = 0.85;
const WIND_DIR_Z = 0.38;

function buildCloudGeometry(seed: number): THREE.BufferGeometry {
  // Simple deterministic LCG per cloud so each cloud has a unique fluffy faceted silhouette
  let s = (seed * 73856093) >>> 0 || 1;
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };

  const puffs: THREE.BufferGeometry[] = [];
  const puffCount = 5 + (seed % 3);

  for (let i = 0; i < puffCount; i++) {
    const t = i / (puffCount - 1) - 0.5;
    const radius = i === Math.floor(puffCount / 2) ? 1.05 : 0.65 + rand() * 0.38;
    const raw = new THREE.IcosahedronGeometry(radius, 1);
    const geom = raw.index ? raw.toNonIndexed() : raw;
    if (geom !== raw) raw.dispose();
    geom.deleteAttribute("uv");

    const pos = geom.getAttribute("position");
    const sx = 1.2 + rand() * 0.35;
    const sy = 0.52 + rand() * 0.16;
    const sz = 0.95 + rand() * 0.3;
    for (let v = 0; v < pos.count; v++) {
      const vx = pos.getX(v) * sx;
      const vy = pos.getY(v) * sy;
      const vz = pos.getZ(v) * sz;
      pos.setXYZ(v, vx, vy, vz);
    }

    const ox = t * 2.45 + (rand() - 0.5) * 0.35;
    const oy = (1 - Math.abs(t) * 1.4) * 0.25 + (rand() - 0.5) * 0.12;
    const oz = (rand() - 0.5) * 0.95;
    geom.translate(ox, oy, oz);
    geom.computeVertexNormals();
    puffs.push(geom);
  }

  const merged = mergeGeometries(puffs, false);
  for (const p of puffs) p.dispose();
  return merged ?? new THREE.IcosahedronGeometry(1, 1);
}

/**
 * Drifting low-poly faceted clouds high above the island that cast soft moving shadows
 * and smoothly fade when passing close to the camera.
 */
export class CloudSystem {
  public readonly group = new THREE.Group();
  private clouds: CloudEntry[] = [];
  private baseColor = new THREE.Color(0xfffdf8);
  private baseOpacity = 0.82;
  private windSpeed = 0.72;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);

    const cloudCount = 9;
    for (let i = 0; i < cloudCount; i++) {
      const angle = (i / cloudCount) * Math.PI * 2 + 0.35;
      const radius = 10 + (i % 3) * 11.5;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const baseY = 14.8 + (i % 4) * 0.75;
      const scale = 0.95 + (i % 3) * 0.34;

      const geom = buildCloudGeometry(i + 17);
      const mat = new THREE.MeshStandardMaterial({
        color: this.baseColor.clone(),
        roughness: 0.95,
        metalness: 0.0,
        flatShading: true,
        transparent: true,
        opacity: this.baseOpacity,
        depthWrite: false,
      });

      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(x, baseY, z);
      mesh.scale.setScalar(scale);
      mesh.rotation.y = (i * 1.1) % (Math.PI * 2);
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      this.group.add(mesh);

      this.clouds.push({
        mesh,
        material: mat,
        baseY,
        speedFactor: 0.78 + (i % 4) * 0.14,
        phase: i * 1.37,
      });
    }
  }

  public setAtmosphere(tod: TimeOfDay, season: Season): void {
    if (tod === "dusk") {
      this.baseColor.setHex(0x5d6f9a);
      this.baseOpacity = 0.52;
    } else if (tod === "golden") {
      this.baseColor.setHex(season === "winter" ? 0xf6e6dc : 0xffe0bd);
      this.baseOpacity = 0.78;
    } else {
      this.baseColor.setHex(season === "winter" ? 0xf0f6fc : 0xfffdf8);
      this.baseOpacity = season === "winter" ? 0.86 : 0.82;
    }

    this.windSpeed = season === "autumn" || season === "winter" ? 0.95 : 0.68;

    for (const c of this.clouds) {
      c.material.color.copy(this.baseColor);
    }
  }

  public update(dt: number, elapsed: number, camera: THREE.Camera): void {
    for (const c of this.clouds) {
      const move = this.windSpeed * c.speedFactor * dt;
      c.mesh.position.x += WIND_DIR_X * move;
      c.mesh.position.z += WIND_DIR_Z * move;
      c.mesh.position.y = c.baseY + Math.sin(elapsed * 0.45 + c.phase) * 0.18;

      if (c.mesh.position.x > WRAP_LIMIT) c.mesh.position.x -= WRAP_LIMIT * 2;
      if (c.mesh.position.x < -WRAP_LIMIT) c.mesh.position.x += WRAP_LIMIT * 2;
      if (c.mesh.position.z > WRAP_LIMIT) c.mesh.position.z -= WRAP_LIMIT * 2;
      if (c.mesh.position.z < -WRAP_LIMIT) c.mesh.position.z += WRAP_LIMIT * 2;

      // Edge fade near wrap boundaries so clouds never pop in/out
      const maxAxis = Math.max(Math.abs(c.mesh.position.x), Math.abs(c.mesh.position.z));
      const edgeFade = maxAxis > 34 ? Math.max(0, 1 - (maxAxis - 34) / (WRAP_LIMIT - 34)) : 1;

      // Softly fade opacity when drifting close to the camera lens while shadows remain active
      const camDist = c.mesh.position.distanceTo(camera.position);
      const camFade = camDist < 19 ? Math.max(0.06, (camDist - 6) / 13) : 1;

      c.material.opacity = this.baseOpacity * edgeFade * camFade;
    }
  }
}
