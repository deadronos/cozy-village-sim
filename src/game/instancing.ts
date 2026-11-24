import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { MAP_SIZE, TILE_SIZE } from "./types.ts";

export interface BakeGroupOptions {
  filter?: (mesh: THREE.Mesh) => boolean;
  /**
   * When true, stores subtle relative luminance variation per sub-mesh (0.88..1.08)
   * so `vertexColor * instanceColor` tints cleanly per season & biome.
   */
  normalizeColor?: boolean;
}

/**
 * Merges a multi-mesh GLB group into one non-indexed BufferGeometry with baked linear RGB
 * vertex colors so the entire group renders in a single InstancedMesh draw call.
 */
export function bakeGroupGeometry(
  group: THREE.Group,
  options: BakeGroupOptions = {},
): THREE.BufferGeometry {
  group.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  const tmpColor = new THREE.Color();

  let meshIdx = 0;
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (options.filter && !options.filter(child)) return;

    const nonIndexed = child.geometry.index
      ? child.geometry.toNonIndexed()
      : child.geometry.clone();
    nonIndexed.applyMatrix4(child.matrixWorld);

    // Normalize attributes so mergeGeometries receives uniform position/normal/color
    for (const attrName of Object.keys(nonIndexed.attributes)) {
      if (attrName !== "position" && attrName !== "normal") {
        nonIndexed.deleteAttribute(attrName);
      }
    }
    if (!nonIndexed.getAttribute("normal")) {
      nonIndexed.computeVertexNormals();
    }

    const posAttr = nonIndexed.getAttribute("position");
    const vertCount = posAttr.count;
    const colors = new Float32Array(vertCount * 3);

    if (options.normalizeColor) {
      const shade = meshIdx % 3 === 0 ? 1.04 : meshIdx % 3 === 1 ? 0.92 : 0.98;
      tmpColor.setRGB(shade, shade, shade);
    } else {
      const mat = Array.isArray(child.material) ? child.material[0] : child.material;
      if (mat && "color" in mat && mat.color instanceof THREE.Color) {
        tmpColor.copy(mat.color);
      } else {
        tmpColor.setRGB(1, 1, 1);
      }
    }

    for (let i = 0; i < vertCount; i++) {
      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;
    }
    nonIndexed.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    parts.push(nonIndexed);
    meshIdx++;
  });

  if (parts.length === 0) {
    return new THREE.BoxGeometry(0.1, 0.1, 0.1).toNonIndexed();
  }

  const merged = mergeGeometries(parts, false);
  for (const part of parts) {
    part.dispose();
  }
  return merged ?? new THREE.BoxGeometry(0.1, 0.1, 0.1).toNonIndexed();
}

/**
 * Procedural stone staircase spanning a 2.0x2.0 tile, rising from y=0.0 (+Z) to y=0.45 (-Z).
 * Rotating by `stepRotation * Math.PI / 2` aligns the upper (-Z) exit toward the uphill terrace.
 */
export function createStoneStepsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const stepCount = 5;
  const totalRise = 0.45;
  const stepDepth = (TILE_SIZE * 0.98) / stepCount;
  const stepWidth = TILE_SIZE * 0.72;

  const pushBox = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    hex: number,
  ) => {
    const geom = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    geom.deleteAttribute("uv");
    geom.translate(x, y, z);
    const col = new THREE.Color(hex);
    const count = geom.getAttribute("position").count;
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = col.r;
      arr[i * 3 + 1] = col.g;
      arr[i * 3 + 2] = col.b;
    }
    geom.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    parts.push(geom);
  };

  for (let i = 0; i < stepCount; i++) {
    const stepTop = ((i + 1) / stepCount) * totalRise;
    const h = stepTop + 0.04;
    const z = TILE_SIZE * 0.49 - (i + 0.5) * stepDepth;
    const hex = i % 2 === 0 ? 0xbcb6aa : 0xa59f92;
    pushBox(stepWidth, h, stepDepth * 1.02, 0, stepTop - h / 2, z, hex);
  }

  // Low stepped side stone curbs for a tidy diorama staircase silhouette
  for (const sx of [-1, 1] as const) {
    const curbX = sx * (stepWidth * 0.5 + 0.09);
    pushBox(0.18, 0.28, TILE_SIZE * 0.46, curbX, 0.12, TILE_SIZE * 0.24, 0x8a847a);
    pushBox(0.18, 0.48, TILE_SIZE * 0.5, curbX, 0.22, -TILE_SIZE * 0.22, 0x7b756b);
  }

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged ?? new THREE.BoxGeometry(1, 0.2, 1).toNonIndexed();
}

export interface InstancePoolEntry {
  gx: number;
  gz: number;
  matrix: THREE.Matrix4;
  color?: THREE.Color;
}

/**
 * Manages a dynamic per-tile InstancedMesh with O(1) coordinate lookup & swap-remove.
 */
export class TileInstancePool {
  public readonly mesh: THREE.InstancedMesh;
  private readonly coordToIndex = new Map<number, number>();
  private readonly indexToCoord: number[] = [];
  private readonly capacity: number;
  private readonly defaultColor = new THREE.Color(0xffffff);

  constructor(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    options: { castShadow?: boolean; receiveShadow?: boolean; capacity?: number } = {},
  ) {
    this.capacity = options.capacity ?? MAP_SIZE * MAP_SIZE;
    this.mesh = new THREE.InstancedMesh(geometry, material, this.capacity);
    this.mesh.castShadow = options.castShadow ?? true;
    this.mesh.receiveShadow = options.receiveShadow ?? true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;

    // Allocate instanceColor buffer immediately before WebGPU pipeline compilation
    this.mesh.setColorAt(0, this.defaultColor);
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }
  }

  private static key(gx: number, gz: number): number {
    return gz * MAP_SIZE + gx;
  }

  public clear(): void {
    this.coordToIndex.clear();
    this.indexToCoord.length = 0;
    this.mesh.count = 0;
    this.mesh.visible = false;
  }

  public setEntries(entries: InstancePoolEntry[], computeBounds = false): void {
    this.coordToIndex.clear();
    this.indexToCoord.length = 0;

    const limit = Math.min(entries.length, this.capacity);
    for (let i = 0; i < limit; i++) {
      const entry = entries[i]!;
      const k = TileInstancePool.key(entry.gx, entry.gz);
      this.coordToIndex.set(k, i);
      this.indexToCoord.push(k);
      this.mesh.setMatrixAt(i, entry.matrix);
      this.mesh.setColorAt(i, entry.color ?? this.defaultColor);
    }

    this.mesh.count = limit;
    this.mesh.visible = limit > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }
    if (computeBounds) {
      this.mesh.computeBoundingBox();
      this.mesh.computeBoundingSphere();
    }
  }

  public upsert(gx: number, gz: number, matrix: THREE.Matrix4, color?: THREE.Color): void {
    const k = TileInstancePool.key(gx, gz);
    let idx = this.coordToIndex.get(k);
    if (idx === undefined) {
      idx = this.indexToCoord.length;
      if (idx >= this.capacity) return;
      this.coordToIndex.set(k, idx);
      this.indexToCoord.push(k);
      this.mesh.count = this.indexToCoord.length;
      this.mesh.visible = true;
    }
    this.mesh.setMatrixAt(idx, matrix);
    this.mesh.setColorAt(idx, color ?? this.defaultColor);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }
  }

  public remove(gx: number, gz: number): boolean {
    const k = TileInstancePool.key(gx, gz);
    const idx = this.coordToIndex.get(k);
    if (idx === undefined) return false;

    const lastIdx = this.indexToCoord.length - 1;
    if (idx !== lastIdx) {
      const lastKey = this.indexToCoord[lastIdx]!;
      const tmpMat = new THREE.Matrix4();
      const tmpCol = new THREE.Color();
      this.mesh.getMatrixAt(lastIdx, tmpMat);
      this.mesh.setMatrixAt(idx, tmpMat);
      if (this.mesh.instanceColor) {
        this.mesh.getColorAt(lastIdx, tmpCol);
        this.mesh.setColorAt(idx, tmpCol);
      }
      this.indexToCoord[idx] = lastKey;
      this.coordToIndex.set(lastKey, idx);
    }

    this.indexToCoord.pop();
    this.coordToIndex.delete(k);
    this.mesh.count = this.indexToCoord.length;
    this.mesh.visible = this.mesh.count > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }
    return true;
  }

  public updateMatrix(gx: number, gz: number, matrix: THREE.Matrix4): void {
    const idx = this.coordToIndex.get(TileInstancePool.key(gx, gz));
    if (idx === undefined) return;
    this.mesh.setMatrixAt(idx, matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  public updateColor(gx: number, gz: number, color: THREE.Color): void {
    const idx = this.coordToIndex.get(TileInstancePool.key(gx, gz));
    if (idx === undefined) return;
    this.mesh.setColorAt(idx, color);
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }
  }

  public getAllCoords(): Array<{ gx: number; gz: number }> {
    return this.indexToCoord.map((k) => {
      const gx = k % MAP_SIZE;
      const gz = (k - gx) / MAP_SIZE;
      return { gx, gz };
    });
  }

  public getCoordByInstanceId(instanceId: number): { gx: number; gz: number } | null {
    const k = this.indexToCoord[instanceId];
    if (k === undefined) return null;
    const gx = k % MAP_SIZE;
    const gz = (k - gx) / MAP_SIZE;
    return { gx, gz };
  }
}
