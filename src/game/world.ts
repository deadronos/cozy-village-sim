import * as THREE from "three";
import type { AssetLibrary } from "./assets.ts";
import {
  bakeGroupGeometry,
  createStoneStepsGeometry,
  TileInstancePool,
  type InstancePoolEntry,
} from "./instancing.ts";
import {
  BIOME_SPECS,
  deterministicTileNoise,
  generateIslandLayout,
  type IslandGenerationResult,
} from "./islandGen.ts";
import {
  createSwayingFoliageMaterial,
  createStylizedWaterMaterial,
  type FoliageShaderHandle,
  type WaterShaderHandle,
} from "./shaders.ts";
import {
  DEFAULT_ISLAND_CONFIG,
  MAP_SIZE,
  TILE_SIZE,
  type GridTile,
  type IslandConfig,
  type ResourcePropType,
  type Season,
  type TerrainType,
} from "./types.ts";

const WATER_FIELD_RES = 128;
const WATER_FIELD_SIZE = 64;
const WATER_CELL_SIZE = WATER_FIELD_SIZE / WATER_FIELD_RES;
const MAX_SHORE_DIST = 9.0;
const MAX_PILING_DIST = 2.4;

function isCrownOrConeMesh(mesh: THREE.Mesh): boolean {
  const n = mesh.name.toLowerCase();
  return n.includes("crown") || n.includes("cone");
}

function createStaticVertexMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.9,
    flatShading: true,
    vertexColors: true,
  });
}

function runChamferDistance(dist: Float32Array, size: number): void {
  const diag = Math.SQRT2;
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const idx = z * size + x;
      let d = dist[idx]!;
      if (x > 0) d = Math.min(d, dist[idx - 1]! + 1);
      if (z > 0) {
        d = Math.min(d, dist[idx - size]! + 1);
        if (x > 0) d = Math.min(d, dist[idx - size - 1]! + diag);
        if (x + 1 < size) d = Math.min(d, dist[idx - size + 1]! + diag);
      }
      dist[idx] = d;
    }
  }
  for (let z = size - 1; z >= 0; z--) {
    for (let x = size - 1; x >= 0; x--) {
      const idx = z * size + x;
      let d = dist[idx]!;
      if (x + 1 < size) d = Math.min(d, dist[idx + 1]! + 1);
      if (z + 1 < size) {
        d = Math.min(d, dist[idx + size]! + 1);
        if (x > 0) d = Math.min(d, dist[idx + size - 1]! + diag);
        if (x + 1 < size) d = Math.min(d, dist[idx + size + 1]! + diag);
      }
      dist[idx] = d;
    }
  }
}

export class IslandWorld {
  public tiles: GridTile[][] = [];
  public readonly worldGroup = new THREE.Group();
  public season: Season = "summer";
  public config: IslandConfig = { ...DEFAULT_ISLAND_CONFIG };
  public layout!: IslandGenerationResult;

  private waterMesh: THREE.Mesh;
  private waterBaseY = -0.18;
  private waterFieldData: Uint8Array;
  private waterFieldTex: THREE.DataTexture;
  private waterShader: WaterShaderHandle;
  private lastPilings: Array<{ x: number; z: number }> = [];

  private terrainPool: TileInstancePool;
  private pathStonesPool: TileInstancePool;
  private stepsPool: TileInstancePool;
  private grassPool: TileInstancePool;
  private wheatPool: TileInstancePool;
  private oakTrunkPool: TileInstancePool;
  private oakCrownPool: TileInstancePool;
  private pineTrunkPool: TileInstancePool;
  private pineCrownPool: TileInstancePool;
  private rockPool: TileInstancePool;
  private stumpPool: TileInstancePool;
  private foliageHandles: FoliageShaderHandle[] = [];

  private waterRayPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.18);
  private waterRayHit = new THREE.Vector3();
  private tmpMat = new THREE.Matrix4();
  private tmpPos = new THREE.Vector3();
  private tmpQuat = new THREE.Quaternion();
  private tmpScale = new THREE.Vector3();
  private tmpAxis = new THREE.Vector3(0, 1, 0);

  constructor(
    scene: THREE.Scene,
    assets: AssetLibrary,
    supportsTSL: boolean,
    initialConfig: IslandConfig = DEFAULT_ISLAND_CONFIG,
  ) {
    scene.add(this.worldGroup);

    // Distance-field DataTexture encoding shoreline distance (R), piling distance (G), and rivers (B)
    this.waterFieldData = new Uint8Array(WATER_FIELD_RES * WATER_FIELD_RES * 4);
    this.waterFieldTex = new THREE.DataTexture(
      this.waterFieldData,
      WATER_FIELD_RES,
      WATER_FIELD_RES,
      THREE.RGBAFormat,
    );
    this.waterFieldTex.minFilter = THREE.LinearFilter;
    this.waterFieldTex.magFilter = THREE.LinearFilter;
    this.waterFieldTex.wrapS = THREE.ClampToEdgeWrapping;
    this.waterFieldTex.wrapT = THREE.ClampToEdgeWrapping;
    this.waterFieldTex.flipY = false;
    this.waterFieldTex.generateMipmaps = false;
    this.waterFieldTex.colorSpace = THREE.NoColorSpace;

    // Stylized TSL ocean & shallow-water plane surrounding the diorama island
    const waterGeo = new THREE.PlaneGeometry(180, 180, 112, 112);
    waterGeo.rotateX(-Math.PI / 2);
    this.waterShader = createStylizedWaterMaterial(
      supportsTSL,
      this.waterFieldTex,
      WATER_FIELD_SIZE,
      (offsetY) => {
        this.waterMesh.position.y = this.waterBaseY + offsetY;
      },
    );
    this.waterMesh = new THREE.Mesh(waterGeo, this.waterShader.material);
    this.waterMesh.position.y = this.waterBaseY;
    this.waterMesh.receiveShadow = true;
    this.worldGroup.add(this.waterMesh);

    // Deep seabed below water for depth contrast
    const seabed = new THREE.Mesh(
      new THREE.PlaneGeometry(180, 180),
      new THREE.MeshStandardMaterial({ color: 0x1a4660, roughness: 1 }),
    );
    seabed.rotation.x = -Math.PI / 2;
    seabed.position.y = -1.2;
    this.worldGroup.add(seabed);

    // Build GPU-instanced pools for terrain, stones, steps, swaying foliage, and natural props
    const terrainGeo = new THREE.BoxGeometry(TILE_SIZE * 0.995, 1.0, TILE_SIZE * 0.995);
    terrainGeo.translate(0, -0.5, 0);
    const terrainMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.92,
      flatShading: true,
    });
    this.terrainPool = new TileInstancePool(terrainGeo, terrainMat, {
      castShadow: true,
      receiveShadow: true,
    });

    this.pathStonesPool = new TileInstancePool(
      bakeGroupGeometry(assets.clone("path_stones")),
      createStaticVertexMaterial(),
      { castShadow: false, receiveShadow: true },
    );

    this.stepsPool = new TileInstancePool(
      createStoneStepsGeometry(),
      createStaticVertexMaterial(),
      {
        castShadow: true,
        receiveShadow: true,
      },
    );

    const grassHandle = createSwayingFoliageMaterial(supportsTSL, {
      baseY: 0.02,
      swayHeight: 0.24,
      amplitude: 0.075,
      speed: 2.3,
    });
    const wheatHandle = createSwayingFoliageMaterial(supportsTSL, {
      baseY: 0.04,
      swayHeight: 0.48,
      amplitude: 0.11,
      speed: 2.1,
    });
    const oakCrownHandle = createSwayingFoliageMaterial(supportsTSL, {
      baseY: 0.55,
      swayHeight: 1.15,
      amplitude: 0.095,
      speed: 1.55,
    });
    const pineCrownHandle = createSwayingFoliageMaterial(supportsTSL, {
      baseY: 0.45,
      swayHeight: 1.35,
      amplitude: 0.085,
      speed: 1.45,
    });
    this.foliageHandles.push(grassHandle, wheatHandle, oakCrownHandle, pineCrownHandle);

    this.grassPool = new TileInstancePool(
      bakeGroupGeometry(assets.clone("grass_patch")),
      grassHandle.material,
      { castShadow: false, receiveShadow: true },
    );
    this.wheatPool = new TileInstancePool(
      bakeGroupGeometry(assets.clone("wheat_patch")),
      wheatHandle.material,
      { castShadow: true, receiveShadow: true },
    );

    const oakTemplate = assets.clone("tree_oak");
    this.oakTrunkPool = new TileInstancePool(
      bakeGroupGeometry(oakTemplate, { filter: (m) => !isCrownOrConeMesh(m) }),
      createStaticVertexMaterial(),
      { castShadow: true, receiveShadow: true },
    );
    this.oakCrownPool = new TileInstancePool(
      bakeGroupGeometry(oakTemplate, { filter: isCrownOrConeMesh, normalizeColor: true }),
      oakCrownHandle.material,
      { castShadow: true, receiveShadow: true },
    );

    const pineTemplate = assets.clone("tree_pine");
    this.pineTrunkPool = new TileInstancePool(
      bakeGroupGeometry(pineTemplate, { filter: (m) => !isCrownOrConeMesh(m) }),
      createStaticVertexMaterial(),
      { castShadow: true, receiveShadow: true },
    );
    this.pineCrownPool = new TileInstancePool(
      bakeGroupGeometry(pineTemplate, { filter: isCrownOrConeMesh, normalizeColor: true }),
      pineCrownHandle.material,
      { castShadow: true, receiveShadow: true },
    );

    this.rockPool = new TileInstancePool(
      bakeGroupGeometry(assets.clone("rock_cluster")),
      createStaticVertexMaterial(),
      { castShadow: true, receiveShadow: true },
    );
    this.stumpPool = new TileInstancePool(
      bakeGroupGeometry(assets.clone("stump")),
      createStaticVertexMaterial(),
      { castShadow: true, receiveShadow: true },
    );

    this.worldGroup.add(
      this.terrainPool.mesh,
      this.pathStonesPool.mesh,
      this.stepsPool.mesh,
      this.grassPool.mesh,
      this.wheatPool.mesh,
      this.oakTrunkPool.mesh,
      this.oakCrownPool.mesh,
      this.pineTrunkPool.mesh,
      this.pineCrownPool.mesh,
      this.rockPool.mesh,
      this.stumpPool.mesh,
    );

    this.generateIsland(initialConfig);
  }

  private composeMatrix(
    x: number,
    y: number,
    z: number,
    rotY: number,
    sx: number,
    sy: number,
    sz: number,
  ): THREE.Matrix4 {
    this.tmpPos.set(x, y, z);
    this.tmpQuat.setFromAxisAngle(this.tmpAxis, rotY);
    this.tmpScale.set(sx, sy, sz);
    return this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale).clone();
  }

  public gridToWorld(gx: number, gz: number): THREE.Vector3 {
    const half = (MAP_SIZE - 1) / 2;
    return new THREE.Vector3((gx - half) * TILE_SIZE, 0, (gz - half) * TILE_SIZE);
  }

  public worldToGrid(wx: number, wz: number): { gx: number; gz: number } | null {
    const half = (MAP_SIZE - 1) / 2;
    const gx = Math.round(wx / TILE_SIZE + half);
    const gz = Math.round(wz / TILE_SIZE + half);
    if (gx < 0 || gx >= MAP_SIZE || gz < 0 || gz >= MAP_SIZE) return null;
    return { gx, gz };
  }

  public getTile(gx: number, gz: number): GridTile | null {
    return this.tiles[gz]?.[gx] ?? null;
  }

  public isAdjacentToWater(gx: number, gz: number): boolean {
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const;
    return dirs.some(([dx, dz]) => {
      const t = this.getTile(gx + dx, gz + dz);
      return t !== null && t.terrain === "water";
    });
  }

  public getWaterFacingRotation(gx: number, gz: number): number {
    const neighbors: [number, number, number][] = [
      [0, 1, 0],
      [1, 0, 1],
      [0, -1, 2],
      [-1, 0, 3],
    ];
    for (const [dx, dz, rot] of neighbors) {
      const t = this.getTile(gx + dx, gz + dz);
      if (t && t.terrain === "water") return rot;
    }
    return 0;
  }

  public raycastGround(raycaster: THREE.Raycaster): { gx: number; gz: number } | null {
    const hits = raycaster.intersectObject(this.terrainPool.mesh, false);
    const first = hits[0];
    if (first && typeof first.instanceId === "number") {
      const coord = this.terrainPool.getCoordByInstanceId(first.instanceId);
      if (coord) return coord;
    }
    if (raycaster.ray.intersectPlane(this.waterRayPlane, this.waterRayHit)) {
      return this.worldToGrid(this.waterRayHit.x, this.waterRayHit.z);
    }
    return null;
  }

  public generateIsland(nextConfig?: IslandConfig): IslandGenerationResult {
    const result = generateIslandLayout(nextConfig ?? this.config);
    this.config = result.config;
    this.layout = result;

    this.tiles = result.tiles.map((row) =>
      row.map((cell) => ({
        gx: cell.gx,
        gz: cell.gz,
        terrain: cell.terrain,
        elevation: cell.elevation,
        prop: cell.prop,
        cropStage: 0,
        buildingId: null,
        hasBridge: false,
        isRiver: cell.isRiver,
        hasSteps: cell.hasSteps,
        stepRotation: cell.stepRotation,
        regrowTimer: 0,
      })),
    );

    this.rebuildAllPools();
    this.applySeasonAndBiomeColors();
    this.updateWaterField([]);
    return result;
  }

  public resetIsland(): void {
    this.generateIsland(this.config);
  }

  private getPropTransform(
    tile: GridTile,
    prop: Exclude<ResourcePropType, null>,
  ): { x: number; y: number; z: number; rotY: number; scale: number } {
    const pos = this.gridToWorld(tile.gx, tile.gz);
    const scale = prop === "stump" ? 1 : 0.9 + (((tile.gx * 17 + tile.gz * 31) % 10) / 10) * 0.25;
    const rotY = ((tile.gx * 13 + tile.gz * 7) % 12) * 0.52;
    return { x: pos.x, y: tile.elevation, z: pos.z, rotY, scale };
  }

  private getTreeCrownColor(prop: "tree_oak" | "tree_pine", gx: number, gz: number): THREE.Color {
    const spec = BIOME_SPECS[this.config.biome];
    const palette =
      prop === "tree_oak" ? spec.oakColors[this.season] : spec.pineColors[this.season];
    const hex = palette[(gx * 7 + gz * 13) % palette.length] ?? 0x4f943d;
    return new THREE.Color(hex);
  }

  private getMeadowTint(): THREE.Color {
    if (this.season === "winter") return new THREE.Color(0xdce6ee);
    if (this.season === "autumn") return new THREE.Color(0xdec79b);
    return new THREE.Color(0xffffff);
  }

  private rebuildAllPools(): void {
    const terrainEntries: InstancePoolEntry[] = [];
    const stoneEntries: InstancePoolEntry[] = [];
    const stepEntries: InstancePoolEntry[] = [];
    const grassEntries: InstancePoolEntry[] = [];
    const wheatEntries: InstancePoolEntry[] = [];
    const oakTrunkEntries: InstancePoolEntry[] = [];
    const oakCrownEntries: InstancePoolEntry[] = [];
    const pineTrunkEntries: InstancePoolEntry[] = [];
    const pineCrownEntries: InstancePoolEntry[] = [];
    const rockEntries: InstancePoolEntry[] = [];
    const stumpEntries: InstancePoolEntry[] = [];
    const meadowTint = this.getMeadowTint();

    for (let gz = 0; gz < MAP_SIZE; gz++) {
      for (let gx = 0; gx < MAP_SIZE; gx++) {
        const tile = this.getTile(gx, gz);
        if (!tile) continue;
        const pos = this.gridToWorld(gx, gz);

        if (tile.terrain !== "water") {
          const boxH = Math.max(0.55, tile.elevation + 0.65);
          terrainEntries.push({
            gx,
            gz,
            matrix: this.composeMatrix(pos.x, tile.elevation, pos.z, 0, 1, boxH, 1),
            color: this.computeTileColor(tile.terrain, gx, gz),
          });
        }

        if (tile.hasSteps) {
          stepEntries.push({
            gx,
            gz,
            matrix: this.composeMatrix(
              pos.x,
              tile.elevation,
              pos.z,
              (tile.stepRotation ?? 0) * (Math.PI / 2),
              1,
              1,
              1,
            ),
          });
        } else if (tile.terrain === "path") {
          stoneEntries.push({
            gx,
            gz,
            matrix: this.composeMatrix(
              pos.x,
              tile.elevation,
              pos.z,
              ((gx * 7 + gz * 13) % 4) * (Math.PI / 2),
              1,
              1,
              1,
            ),
          });
        } else if (tile.terrain === "meadow") {
          grassEntries.push({
            gx,
            gz,
            matrix: this.composeMatrix(
              pos.x,
              tile.elevation,
              pos.z,
              ((gx * 5 + gz * 11) % 6) * 1.04,
              1,
              1,
              1,
            ),
            color: meadowTint,
          });
        } else if (tile.terrain === "farm") {
          const s = THREE.MathUtils.lerp(0.25, 1.1, tile.cropStage);
          wheatEntries.push({
            gx,
            gz,
            matrix: this.composeMatrix(pos.x, tile.elevation, pos.z, 0, 1, s, 1),
          });
        }

        if (tile.prop) {
          const t = this.getPropTransform(tile, tile.prop);
          const mat = this.composeMatrix(t.x, t.y, t.z, t.rotY, t.scale, t.scale, t.scale);
          if (tile.prop === "tree_oak") {
            oakTrunkEntries.push({ gx, gz, matrix: mat });
            oakCrownEntries.push({
              gx,
              gz,
              matrix: mat,
              color: this.getTreeCrownColor("tree_oak", gx, gz),
            });
          } else if (tile.prop === "tree_pine") {
            pineTrunkEntries.push({ gx, gz, matrix: mat });
            pineCrownEntries.push({
              gx,
              gz,
              matrix: mat,
              color: this.getTreeCrownColor("tree_pine", gx, gz),
            });
          } else if (tile.prop === "rock") {
            rockEntries.push({ gx, gz, matrix: mat });
          } else if (tile.prop === "stump") {
            stumpEntries.push({ gx, gz, matrix: mat });
          }
        }
      }
    }

    this.terrainPool.setEntries(terrainEntries, true);
    this.pathStonesPool.setEntries(stoneEntries);
    this.stepsPool.setEntries(stepEntries);
    this.grassPool.setEntries(grassEntries);
    this.wheatPool.setEntries(wheatEntries);
    this.oakTrunkPool.setEntries(oakTrunkEntries);
    this.oakCrownPool.setEntries(oakCrownEntries);
    this.pineTrunkPool.setEntries(pineTrunkEntries);
    this.pineCrownPool.setEntries(pineCrownEntries);
    this.rockPool.setEntries(rockEntries);
    this.stumpPool.setEntries(stumpEntries);
  }

  private computeTileColor(terrain: TerrainType, gx: number, gz: number): THREE.Color {
    const palette = BIOME_SPECS[this.config.biome].terrainPalette[this.season];
    const color = new THREE.Color(palette[terrain]);
    if (terrain === "grass" || terrain === "meadow") {
      const v = (deterministicTileNoise(this.config.seed, gx, gz) - 0.5) * 0.055;
      color.offsetHSL(0, 0, v);
    }
    return color;
  }

  private applySeasonAndBiomeColors(): void {
    const waterColors = BIOME_SPECS[this.config.biome].waterPalette[this.season];
    this.waterShader.setColors(
      waterColors.shallow,
      waterColors.deep,
      waterColors.river,
      waterColors.foam,
    );

    const windStrength = this.season === "autumn" || this.season === "winter" ? 1.32 : 1.0;
    for (const handle of this.foliageHandles) {
      handle.setWindStrength(windStrength);
    }

    const meadowTint = this.getMeadowTint();
    for (let gz = 0; gz < MAP_SIZE; gz++) {
      for (let gx = 0; gx < MAP_SIZE; gx++) {
        const tile = this.getTile(gx, gz);
        if (!tile) continue;
        if (tile.terrain !== "water") {
          this.terrainPool.updateColor(gx, gz, this.computeTileColor(tile.terrain, gx, gz));
        }
        if (tile.terrain === "meadow") {
          this.grassPool.updateColor(gx, gz, meadowTint);
        }
        if (tile.prop === "tree_oak") {
          this.oakCrownPool.updateColor(gx, gz, this.getTreeCrownColor("tree_oak", gx, gz));
        } else if (tile.prop === "tree_pine") {
          this.pineCrownPool.updateColor(gx, gz, this.getTreeCrownColor("tree_pine", gx, gz));
        }
      }
    }
  }

  public setSeason(season: Season): void {
    this.season = season;
    this.applySeasonAndBiomeColors();
  }

  public setTileTerrain(gx: number, gz: number, terrain: TerrainType): void {
    const tile = this.getTile(gx, gz);
    if (!tile || tile.terrain === "water" || tile.hasSteps) return;

    tile.terrain = terrain;
    this.terrainPool.updateColor(gx, gz, this.computeTileColor(terrain, gx, gz));

    this.pathStonesPool.remove(gx, gz);
    this.grassPool.remove(gx, gz);
    this.wheatPool.remove(gx, gz);

    const pos = this.gridToWorld(gx, gz);
    if (terrain === "path") {
      this.pathStonesPool.upsert(
        gx,
        gz,
        this.composeMatrix(
          pos.x,
          tile.elevation,
          pos.z,
          ((gx * 7 + gz * 13) % 4) * (Math.PI / 2),
          1,
          1,
          1,
        ),
      );
    } else if (terrain === "meadow") {
      this.grassPool.upsert(
        gx,
        gz,
        this.composeMatrix(pos.x, tile.elevation, pos.z, ((gx * 5 + gz * 11) % 6) * 1.04, 1, 1, 1),
        this.getMeadowTint(),
      );
    } else if (terrain === "farm") {
      tile.cropStage = 0.25;
      const s = THREE.MathUtils.lerp(0.25, 1.1, tile.cropStage);
      this.wheatPool.upsert(gx, gz, this.composeMatrix(pos.x, tile.elevation, pos.z, 0, 1, s, 1));
    }
  }

  public updateCropVisual(tile: GridTile): void {
    if (tile.terrain !== "farm") return;
    const pos = this.gridToWorld(tile.gx, tile.gz);
    const s = THREE.MathUtils.lerp(0.25, 1.1, tile.cropStage);
    this.wheatPool.updateMatrix(
      tile.gx,
      tile.gz,
      this.composeMatrix(pos.x, tile.elevation, pos.z, 0, 1, s, 1),
    );
  }

  public setTileProp(gx: number, gz: number, prop: ResourcePropType): void {
    const tile = this.getTile(gx, gz);
    if (!tile) return;

    tile.prop = prop;
    this.oakTrunkPool.remove(gx, gz);
    this.oakCrownPool.remove(gx, gz);
    this.pineTrunkPool.remove(gx, gz);
    this.pineCrownPool.remove(gx, gz);
    this.rockPool.remove(gx, gz);
    this.stumpPool.remove(gx, gz);

    if (!prop) return;
    const t = this.getPropTransform(tile, prop);
    const mat = this.composeMatrix(t.x, t.y, t.z, t.rotY, t.scale, t.scale, t.scale);

    if (prop === "tree_oak") {
      this.oakTrunkPool.upsert(gx, gz, mat);
      this.oakCrownPool.upsert(gx, gz, mat, this.getTreeCrownColor("tree_oak", gx, gz));
    } else if (prop === "tree_pine") {
      this.pineTrunkPool.upsert(gx, gz, mat);
      this.pineCrownPool.upsert(gx, gz, mat, this.getTreeCrownColor("tree_pine", gx, gz));
    } else if (prop === "rock") {
      this.rockPool.upsert(gx, gz, mat);
    } else if (prop === "stump") {
      this.stumpPool.upsert(gx, gz, mat);
    }
  }

  /**
   * Updates the 128x128 water distance-field texture for shoreline surf foam,
   * Fishing Dock / Bridge piling foam rings, and freshwater river shading.
   */
  public updateWaterField(pilings: Array<{ x: number; z: number }> = this.lastPilings): void {
    this.lastPilings = pilings;
    const total = WATER_FIELD_RES * WATER_FIELD_RES;
    const landDist = new Float32Array(total).fill(1e6);
    const pilingDist = new Float32Array(total).fill(1e6);
    const riverRaw = new Float32Array(total);
    const riverBlur = new Float32Array(total);

    for (let iz = 0; iz < WATER_FIELD_RES; iz++) {
      const wz = ((iz + 0.5) / WATER_FIELD_RES - 0.5) * WATER_FIELD_SIZE;
      for (let ix = 0; ix < WATER_FIELD_RES; ix++) {
        const wx = ((ix + 0.5) / WATER_FIELD_RES - 0.5) * WATER_FIELD_SIZE;
        const coord = this.worldToGrid(wx, wz);
        const tile = coord ? this.getTile(coord.gx, coord.gz) : null;
        const idx = iz * WATER_FIELD_RES + ix;
        if (tile) {
          if (tile.terrain !== "water") landDist[idx] = 0;
          if (tile.isRiver) riverRaw[idx] = 1;
        }
      }
    }

    runChamferDistance(landDist, WATER_FIELD_RES);

    if (pilings.length > 0) {
      for (const p of pilings) {
        const fx = (p.x / WATER_FIELD_SIZE + 0.5) * WATER_FIELD_RES - 0.5;
        const fz = (p.z / WATER_FIELD_SIZE + 0.5) * WATER_FIELD_RES - 0.5;
        const x0 = Math.max(0, Math.floor(fx));
        const z0 = Math.max(0, Math.floor(fz));
        for (let dz = 0; dz <= 1; dz++) {
          for (let dx = 0; dx <= 1; dx++) {
            const ix = x0 + dx;
            const iz = z0 + dz;
            if (ix < 0 || ix >= WATER_FIELD_RES || iz < 0 || iz >= WATER_FIELD_RES) continue;
            const wx = ((ix + 0.5) / WATER_FIELD_RES - 0.5) * WATER_FIELD_SIZE;
            const wz = ((iz + 0.5) / WATER_FIELD_RES - 0.5) * WATER_FIELD_SIZE;
            const dTexels = Math.hypot(wx - p.x, wz - p.z) / WATER_CELL_SIZE;
            const idx = iz * WATER_FIELD_RES + ix;
            if (dTexels < pilingDist[idx]!) {
              pilingDist[idx] = dTexels;
            }
          }
        }
      }
      runChamferDistance(pilingDist, WATER_FIELD_RES);
    }

    // Gentle 3x3 box blur for freshwater river tint transitions
    for (let iz = 0; iz < WATER_FIELD_RES; iz++) {
      for (let ix = 0; ix < WATER_FIELD_RES; ix++) {
        let sum = 0;
        let count = 0;
        for (let dz = -1; dz <= 1; dz++) {
          const nz = iz + dz;
          if (nz < 0 || nz >= WATER_FIELD_RES) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = ix + dx;
            if (nx < 0 || nx >= WATER_FIELD_RES) continue;
            sum += riverRaw[nz * WATER_FIELD_RES + nx]!;
            count++;
          }
        }
        riverBlur[iz * WATER_FIELD_RES + ix] = count > 0 ? sum / count : 0;
      }
    }

    for (let i = 0; i < total; i++) {
      const rNorm = Math.min(1, (landDist[i]! * WATER_CELL_SIZE) / MAX_SHORE_DIST);
      const gNorm =
        pilings.length > 0 ? Math.min(1, (pilingDist[i]! * WATER_CELL_SIZE) / MAX_PILING_DIST) : 1;
      const bNorm = Math.min(1, riverBlur[i]!);
      const off = i * 4;
      this.waterFieldData[off] = Math.round(rNorm * 255);
      this.waterFieldData[off + 1] = Math.round(gNorm * 255);
      this.waterFieldData[off + 2] = Math.round(bNorm * 255);
      this.waterFieldData[off + 3] = 255;
    }

    this.waterFieldTex.needsUpdate = true;
  }

  public updateVisuals(elapsed: number): void {
    this.waterShader.updateTime(elapsed);
    for (const handle of this.foliageHandles) {
      handle.updateTime(elapsed);
    }
  }
}
