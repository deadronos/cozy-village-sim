import * as THREE from "three";
import type { AssetLibrary } from "./assets.ts";
import {
  MAP_SIZE,
  TILE_SIZE,
  type GridTile,
  type ResourcePropType,
  type TerrainType,
} from "./types.ts";

const TERRAIN_COLORS: Record<TerrainType, number> = {
  water: 0x4ca6c8,
  sand: 0xe9d69b,
  grass: 0x73b659,
  path: 0xc2b699,
  farm: 0x8b623b,
  meadow: 0x67ad4d,
};

function hash2d(x: number, z: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

export class IslandWorld {
  public readonly tiles: GridTile[][] = [];
  public readonly tileMeshes: THREE.Mesh[][] = [];
  public readonly worldGroup = new THREE.Group();
  public readonly groundPickables: THREE.Object3D[] = [];

  private waterMesh: THREE.Mesh;
  private waterBaseY = -0.18;
  private assets: AssetLibrary;
  private tileGeo = new THREE.BoxGeometry(TILE_SIZE * 0.99, 0.5, TILE_SIZE * 0.99);

  constructor(scene: THREE.Scene, assets: AssetLibrary) {
    this.assets = assets;
    scene.add(this.worldGroup);

    // Stylized ocean surrounding the diorama island
    const waterGeo = new THREE.PlaneGeometry(160, 160, 40, 40);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x49a6cc,
      roughness: 0.25,
      metalness: 0.08,
      flatShading: true,
      transparent: true,
      opacity: 0.88,
    });
    this.waterMesh = new THREE.Mesh(waterGeo, waterMat);
    this.waterMesh.position.y = this.waterBaseY;
    this.waterMesh.receiveShadow = true;
    this.worldGroup.add(this.waterMesh);

    // Deep seabed below water so water has nice depth
    const seabed = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 160),
      new THREE.MeshStandardMaterial({ color: 0x245d78, roughness: 1 }),
    );
    seabed.rotation.x = -Math.PI / 2;
    seabed.position.y = -1.2;
    this.worldGroup.add(seabed);

    this.generateIsland();
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
    // Default dock faces -Z (rotation 0) or +Z; orient pier toward nearest water tile
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

  private generateIsland(): void {
    const center = (MAP_SIZE - 1) / 2;

    for (let gz = 0; gz < MAP_SIZE; gz++) {
      const row: GridTile[] = [];
      const meshRow: THREE.Mesh[] = [];

      for (let gx = 0; gx < MAP_SIZE; gx++) {
        const dx = (gx - center) / (MAP_SIZE * 0.48);
        const dz = (gz - center) / (MAP_SIZE * 0.48);
        const angle = Math.atan2(dz, dx);
        // Organic cozy cove shape
        const coastlineNoise = 0.11 * Math.sin(angle * 3 + 0.6) + 0.07 * Math.cos(angle * 5 - 0.8);
        const dist = Math.hypot(dx, dz) + coastlineNoise;

        let terrain: TerrainType = "water";
        let elevation = -0.45;
        if (dist < 0.78) {
          terrain = "grass";
          elevation = 0.0;
        } else if (dist < 0.91) {
          terrain = "sand";
          elevation = -0.08;
        }

        const tile: GridTile = {
          gx,
          gz,
          terrain,
          elevation,
          prop: null,
          propMesh: null,
          decorMesh: null,
          cropStage: 0,
          buildingId: null,
          regrowTimer: 0,
        };
        row.push(tile);

        const pos = this.gridToWorld(gx, gz);
        const color = new THREE.Color(TERRAIN_COLORS[terrain]);
        // Gentle checkerboard/organic variation on grass for miniature diorama feel
        if (terrain === "grass") {
          const v = (hash2d(gx, gz) - 0.5) * 0.06;
          color.offsetHSL(0, 0, v);
        }

        const mat = new THREE.MeshStandardMaterial({
          color,
          roughness: 0.92,
          flatShading: true,
        });
        const mesh = new THREE.Mesh(this.tileGeo, mat);
        mesh.position.set(pos.x, elevation - 0.25, pos.z);
        mesh.receiveShadow = true;
        mesh.userData = { gx, gz };

        if (terrain === "water") {
          mesh.visible = false;
        } else {
          this.worldGroup.add(mesh);
          this.groundPickables.push(mesh);
        }
        meshRow.push(mesh);
      }

      this.tiles.push(row);
      this.tileMeshes.push(meshRow);
    }

    // Populate natural forests, rocks & wildflowers away from the central town square
    const cx = Math.floor(center);
    const cz = Math.floor(center);

    for (let gz = 0; gz < MAP_SIZE; gz++) {
      for (let gx = 0; gx < MAP_SIZE; gx++) {
        const tile = this.getTile(gx, gz);
        if (!tile || tile.terrain !== "grass") continue;

        const distFromCenter = Math.hypot(gx - cx, gz - cz);
        if (distFromCenter < 3.4) continue; // Keep town plaza clear

        const r = hash2d(gx * 3.1, gz * 2.7);
        const cluster = Math.sin(gx * 0.45) * Math.cos(gz * 0.45);

        if (distFromCenter > 4.2 && (r < 0.26 || (cluster > 0.32 && r < 0.52))) {
          this.setTileProp(gx, gz, r < 0.14 ? "tree_oak" : "tree_pine");
        } else if (distFromCenter > 5.0 && r > 0.91) {
          this.setTileProp(gx, gz, "rock");
        } else if (r > 0.76 && r <= 0.85) {
          this.setTileTerrain(gx, gz, "meadow");
        }
      }
    }
  }

  public setTileTerrain(gx: number, gz: number, terrain: TerrainType): void {
    const tile = this.getTile(gx, gz);
    const mesh = this.tileMeshes[gz]?.[gx];
    if (!tile || !mesh || tile.terrain === "water") return;

    tile.terrain = terrain;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    mat.color.setHex(TERRAIN_COLORS[terrain]);

    // Clear old terrain decor
    if (tile.decorMesh) {
      this.worldGroup.remove(tile.decorMesh);
      tile.decorMesh = null;
    }

    const pos = this.gridToWorld(gx, gz);
    if (terrain === "path") {
      const stones = this.assets.clone("path_stones");
      stones.position.set(pos.x, tile.elevation, pos.z);
      stones.rotation.y = ((gx * 7 + gz * 13) % 4) * (Math.PI / 2);
      this.worldGroup.add(stones);
      tile.decorMesh = stones;
    } else if (terrain === "meadow") {
      const grass = this.assets.clone("grass_patch");
      grass.position.set(pos.x, tile.elevation, pos.z);
      grass.rotation.y = ((gx * 5 + gz * 11) % 6) * 1.04;
      this.worldGroup.add(grass);
      tile.decorMesh = grass;
    } else if (terrain === "farm") {
      tile.cropStage = 0.25;
      const wheat = this.assets.clone("wheat_patch");
      wheat.position.set(pos.x, tile.elevation, pos.z);
      wheat.scale.set(1, 0.3, 1);
      this.worldGroup.add(wheat);
      tile.decorMesh = wheat;
    }
  }

  public updateCropVisual(tile: GridTile): void {
    if (tile.terrain !== "farm" || !tile.decorMesh) return;
    const s = THREE.MathUtils.lerp(0.25, 1.1, tile.cropStage);
    tile.decorMesh.scale.set(1, s, 1);
  }

  public setTileProp(gx: number, gz: number, prop: ResourcePropType): void {
    const tile = this.getTile(gx, gz);
    if (!tile) return;

    if (tile.propMesh) {
      this.worldGroup.remove(tile.propMesh);
      tile.propMesh = null;
    }
    tile.prop = prop;
    if (!prop) return;

    const pos = this.gridToWorld(gx, gz);
    let mesh: THREE.Group;
    if (prop === "tree_pine") {
      mesh = this.assets.clone("tree_pine");
    } else if (prop === "tree_oak") {
      mesh = this.assets.clone("tree_oak");
    } else if (prop === "rock") {
      mesh = this.assets.clone("rock_cluster");
    } else {
      mesh = this.assets.clone("stump");
    }

    const scale = prop === "stump" ? 1 : 0.9 + (((gx * 17 + gz * 31) % 10) / 10) * 0.25;
    mesh.scale.setScalar(scale);
    mesh.rotation.y = ((gx * 13 + gz * 7) % 12) * 0.52;
    mesh.position.set(pos.x, tile.elevation, pos.z);
    this.worldGroup.add(mesh);
    tile.propMesh = mesh;
  }

  public updateWater(elapsed: number): void {
    this.waterMesh.position.y = this.waterBaseY + Math.sin(elapsed * 1.4) * 0.045;
  }
}
