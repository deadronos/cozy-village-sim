import * as THREE from "three";
import type { AssetLibrary } from "./assets.ts";
import type { CozyAudio } from "./audio.ts";
import {
  BUILDING_DEFS,
  JOB_META,
  MAP_SIZE,
  type BuildingInstance,
  type BuildingKind,
  type FloatingPopup,
  type GridTile,
  type ResourceBag,
  type VillagerInstance,
  type VillagerJob,
} from "./types.ts";
import type { IslandWorld } from "./world.ts";

const VILLAGER_NAMES = [
  "Pip",
  "Bramble",
  "Clover",
  "Rowan",
  "Hazel",
  "Milo",
  "Fern",
  "Otis",
  "Wren",
  "Toby",
  "Juniper",
  "Alder",
  "Maple",
  "Barnaby",
  "Poppy",
  "Cedric",
];

interface Particle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
}

export class VillageSimulation {
  public resources: ResourceBag = {
    wood: 38,
    stone: 16,
    food: 20,
    tools: 1,
  };

  public buildings: BuildingInstance[] = [];
  public villagers: VillagerInstance[] = [];
  public speedMultiplier = 1;
  public selectedBuildingId: string | null = null;
  public selectedVillagerId: string | null = null;

  public onStateChanged: (() => void) | null = null;

  private scene: THREE.Scene;
  private world: IslandWorld;
  private assets: AssetLibrary;
  private audio: CozyAudio;
  private floatingLayer: HTMLElement;

  private nextId = 1;
  private nameIndex = 0;
  private popups: FloatingPopup[] = [];
  private particles: Particle[] = [];
  private particleGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
  private smokeTimer = 0;

  constructor(
    scene: THREE.Scene,
    world: IslandWorld,
    assets: AssetLibrary,
    audio: CozyAudio,
    floatingLayer: HTMLElement,
  ) {
    this.scene = scene;
    this.world = world;
    this.assets = assets;
    this.audio = audio;
    this.floatingLayer = floatingLayer;

    this.setupStarterVillage();
  }

  private setupStarterVillage(): void {
    const cx = Math.floor((MAP_SIZE - 1) / 2);
    const cz = Math.floor((MAP_SIZE - 1) / 2);

    // Paint cozy cobblestone square around Town Hall
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        this.world.setTileTerrain(cx + dx, cz + dz, "path");
      }
    }

    // Place starter Town Hall (already constructed)
    this.spawnBuilding("town_hall", cx, cz, 0, true);

    // Place a couple of starter farmfields nearby so players see wheat right away
    this.world.setTileTerrain(cx - 2, cz + 1, "farm");
    this.world.setTileTerrain(cx - 2, cz + 2, "farm");
    this.world.setTileTerrain(cx - 3, cz + 1, "farm");
    const t = this.world.getTile(cx - 2, cz + 1);
    if (t) {
      t.cropStage = 0.85;
      this.world.updateCropVisual(t);
    }
  }

  public getMaxPopulation(): number {
    let cap = 0;
    for (const b of this.buildings) {
      if (!b.constructed) continue;
      const def = BUILDING_DEFS[b.kind];
      if (def.housing) {
        cap += def.housing + (b.level - 1);
      }
    }
    return cap;
  }

  public getCoziness(): number {
    let score = 0;
    for (const b of this.buildings) {
      if (!b.constructed) continue;
      score += BUILDING_DEFS[b.kind].coziness * b.level;
    }
    // Bonus for painted meadows & paths
    for (let gz = 0; gz < MAP_SIZE; gz++) {
      for (let gx = 0; gx < MAP_SIZE; gx++) {
        const t = this.world.getTile(gx, gz);
        if (t?.terrain === "meadow") score += 1;
      }
    }
    return score;
  }

  public getToolSpeedBonus(): number {
    return 1 + Math.min(this.resources.tools, 10) * 0.12;
  }

  public canAfford(cost: Partial<ResourceBag>): boolean {
    return (
      (cost.wood ?? 0) <= this.resources.wood &&
      (cost.stone ?? 0) <= this.resources.stone &&
      (cost.food ?? 0) <= this.resources.food &&
      (cost.tools ?? 0) <= this.resources.tools
    );
  }

  private spend(cost: Partial<ResourceBag>): void {
    this.resources.wood -= cost.wood ?? 0;
    this.resources.stone -= cost.stone ?? 0;
    this.resources.food -= cost.food ?? 0;
    this.resources.tools -= cost.tools ?? 0;
  }

  public canPlaceBuilding(
    kind: BuildingKind,
    gx: number,
    gz: number,
  ): { ok: boolean; reason?: string } {
    const tile = this.world.getTile(gx, gz);
    if (!tile) return { ok: false, reason: "Out of bounds" };
    if (tile.buildingId) return { ok: false, reason: "Tile occupied" };

    const def = BUILDING_DEFS[kind];
    if (def.unique && this.buildings.some((b) => b.kind === kind)) {
      return { ok: false, reason: "Already built" };
    }

    if (def.shoreOnly) {
      if (tile.terrain !== "sand" || !this.world.isAdjacentToWater(gx, gz)) {
        return { ok: false, reason: "Must be placed on sandy shoreline" };
      }
    } else {
      if (tile.terrain === "water" || tile.terrain === "sand") {
        return { ok: false, reason: "Needs grassy inland tile" };
      }
    }

    if (!this.canAfford(def.cost)) {
      return { ok: false, reason: "Not enough resources" };
    }
    return { ok: true };
  }

  public placeBuilding(kind: BuildingKind, gx: number, gz: number, rotation: number): boolean {
    const check = this.canPlaceBuilding(kind, gx, gz);
    if (!check.ok) return false;

    const def = BUILDING_DEFS[kind];
    this.spend(def.cost);

    // Clear any tree/rock on the tile (granting a tiny cozy refund)
    const tile = this.world.getTile(gx, gz);
    if (tile?.prop === "tree_pine" || tile?.prop === "tree_oak") {
      this.resources.wood += 2;
      this.world.setTileProp(gx, gz, null);
    } else if (tile?.prop === "rock") {
      this.resources.stone += 2;
      this.world.setTileProp(gx, gz, null);
    } else if (tile?.prop === "stump") {
      this.world.setTileProp(gx, gz, null);
    }

    const finalRot = def.shoreOnly ? this.world.getWaterFacingRotation(gx, gz) : rotation;
    this.spawnBuilding(kind, gx, gz, finalRot, def.buildTime === 0);
    this.audio.playPlace();
    this.onStateChanged?.();
    return true;
  }

  private spawnBuilding(
    kind: BuildingKind,
    gx: number,
    gz: number,
    rotation: number,
    constructed: boolean,
  ): BuildingInstance {
    const id = `b_${this.nextId++}`;
    const tile = this.world.getTile(gx, gz);
    const pos = this.world.gridToWorld(gx, gz);
    const y = tile?.elevation ?? 0;

    const { mesh, bladesMesh } = this.createBuildingVisual(kind, constructed);
    mesh.position.set(pos.x, y, pos.z);
    mesh.rotation.y = rotation * (Math.PI / 2);
    mesh.userData = { buildingId: id };
    this.scene.add(mesh);

    const inst: BuildingInstance = {
      id,
      kind,
      gx,
      gz,
      rotation,
      constructed,
      buildProgress: constructed ? 1 : 0,
      level: 1,
      mesh,
      bladesMesh,
      workerId: null,
      popAnim: 0,
    };

    if (tile) {
      tile.buildingId = id;
    }
    this.buildings.push(inst);

    if (constructed) {
      this.tryAssignWorker(inst);
    }
    return inst;
  }

  private createBuildingVisual(
    kind: BuildingKind,
    constructed: boolean,
  ): { mesh: THREE.Group; bladesMesh?: THREE.Object3D } {
    if (!constructed) {
      return { mesh: this.assets.clone("scaffold") };
    }
    if (kind === "windmill") {
      const base = this.assets.clone("windmill_base");
      const blades = this.assets.clone("windmill_blades");
      // Hub sits at (0, 1.72, 0.56) in Y-up Three.js coordinates
      blades.position.set(0, 1.72, 0.58);
      base.add(blades);
      return { mesh: base, bladesMesh: blades };
    }
    return { mesh: this.assets.clone(kind) };
  }

  public completeBuilding(b: BuildingInstance): void {
    if (b.constructed) return;
    b.constructed = true;
    b.buildProgress = 1;
    b.popAnim = 0.01;

    const pos = b.mesh.position.clone();
    const rotY = b.mesh.rotation.y;
    this.scene.remove(b.mesh);

    const { mesh, bladesMesh } = this.createBuildingVisual(b.kind, true);
    mesh.position.copy(pos);
    mesh.rotation.y = rotY;
    mesh.userData = { buildingId: b.id };
    this.scene.add(mesh);
    b.mesh = mesh;
    b.bladesMesh = bladesMesh;

    this.spawnParticles(pos.x, pos.y + 0.7, pos.z, 0xf6d56a, 10);
    this.spawnPopup(pos.x, pos.y + 1.8, pos.z, `${BUILDING_DEFS[b.kind].name} built!`, "#ffe484");
    this.audio.playComplete();

    // Assign worker to this building AND check if any other constructed buildings were waiting on housing
    this.tryAssignWorker(b);
    for (const other of this.buildings) {
      if (other.constructed && !other.workerId) {
        this.tryAssignWorker(other);
      }
    }
    this.onStateChanged?.();
  }

  public upgradeBuilding(buildingId: string): boolean {
    const b = this.buildings.find((x) => x.id === buildingId);
    if (!b || !b.constructed || b.level >= 3) return false;

    const cost: Partial<ResourceBag> = {
      wood: 6 * b.level,
      stone: 3 * b.level,
      tools: b.level >= 2 ? 1 : 0,
    };
    if (!this.canAfford(cost)) return false;

    this.spend(cost);
    b.level += 1;
    b.popAnim = 0.01;
    this.spawnParticles(
      b.mesh.position.x,
      b.mesh.position.y + 1.0,
      b.mesh.position.z,
      0xffd166,
      12,
    );
    this.spawnPopup(
      b.mesh.position.x,
      b.mesh.position.y + 2.0,
      b.mesh.position.z,
      `Upgraded Lv.${b.level}!`,
      "#9ef0a4",
    );
    this.audio.playComplete();
    // Re-check unassigned workers in case Cottage upgraded housing
    for (const other of this.buildings) {
      if (other.constructed && !other.workerId) {
        this.tryAssignWorker(other);
      }
    }
    this.onStateChanged?.();
    return true;
  }

  public demolishAt(gx: number, gz: number): boolean {
    const tile = this.world.getTile(gx, gz);
    if (!tile) return false;

    if (tile.buildingId) {
      const idx = this.buildings.findIndex((b) => b.id === tile.buildingId);
      if (idx === -1) return false;
      const b = this.buildings[idx]!;
      if (b.kind === "town_hall") return false; // Protect Town Hall

      this.scene.remove(b.mesh);
      tile.buildingId = null;
      this.buildings.splice(idx, 1);

      // Remove associated villager
      if (b.workerId) {
        const vIdx = this.villagers.findIndex((v) => v.id === b.workerId);
        if (vIdx !== -1) {
          this.scene.remove(this.villagers[vIdx]!.mesh);
          this.villagers.splice(vIdx, 1);
        }
      }
      if (this.selectedBuildingId === b.id) this.selectedBuildingId = null;

      // Partial cozy refund
      const def = BUILDING_DEFS[b.kind];
      this.resources.wood += Math.floor((def.cost.wood ?? 0) * 0.5);
      this.resources.stone += Math.floor((def.cost.stone ?? 0) * 0.5);
      this.audio.playDemolish();
      this.onStateChanged?.();
      return true;
    }

    if (tile.prop) {
      this.world.setTileProp(gx, gz, null);
      this.audio.playDemolish();
      return true;
    }

    if (tile.terrain === "path" || tile.terrain === "farm" || tile.terrain === "meadow") {
      this.world.setTileTerrain(gx, gz, "grass");
      this.audio.playDemolish();
      this.onStateChanged?.();
      return true;
    }
    return false;
  }

  public paintAt(gx: number, gz: number, paint: "path" | "farm" | "meadow" | "tree"): boolean {
    const tile = this.world.getTile(gx, gz);
    if (!tile || tile.terrain === "water" || tile.terrain === "sand" || tile.buildingId) {
      return false;
    }

    if (paint === "tree") {
      if (tile.prop) return false;
      if (tile.terrain !== "grass" && tile.terrain !== "meadow") {
        this.world.setTileTerrain(gx, gz, "grass");
      }
      this.world.setTileProp(gx, gz, Math.random() < 0.5 ? "tree_pine" : "tree_oak");
      this.audio.playPaint();
      return true;
    }

    if (tile.terrain === paint) return false;
    if (tile.prop) {
      this.world.setTileProp(gx, gz, null);
    }
    this.world.setTileTerrain(gx, gz, paint);
    this.audio.playPaint();
    this.onStateChanged?.();
    return true;
  }

  private tryAssignWorker(b: BuildingInstance): void {
    const def = BUILDING_DEFS[b.kind];
    if (!def.job || b.workerId) return;
    if (this.villagers.length >= this.getMaxPopulation()) return;

    const id = `v_${this.nextId++}`;
    const name = VILLAGER_NAMES[this.nameIndex % VILLAGER_NAMES.length]!;
    this.nameIndex++;

    const { group, toolMesh } = this.assets.createVillagerMesh(def.job);
    const homePos = this.world.gridToWorld(b.gx, b.gz);
    group.position.set(homePos.x + 0.5, 0, homePos.z + 0.7);
    group.userData = { villagerId: id };
    this.scene.add(group);

    const villager: VillagerInstance = {
      id,
      name,
      job: def.job,
      homeBuildingId: b.id,
      x: homePos.x + 0.5,
      z: homePos.z + 0.7,
      targetX: homePos.x + 0.5,
      targetZ: homePos.z + 0.7,
      state: "idle",
      statusText: `Ready as ${JOB_META[def.job].label}`,
      workTimer: 0,
      targetTile: null,
      targetBuildingId: null,
      carrying: null,
      carryingAmount: 0,
      mesh: group,
      toolMesh,
      walkPhase: Math.random() * 6.28,
    };

    b.workerId = id;
    this.villagers.push(villager);
    this.spawnPopup(
      homePos.x,
      1.6,
      homePos.z,
      `${JOB_META[def.job].icon} ${name} joined!`,
      "#b8f2ff",
    );
  }

  public update(dt: number, elapsed: number, camera: THREE.Camera): void {
    const simDt = dt * this.speedMultiplier;

    // Animate buildings (pop-in & windmill blades)
    for (const b of this.buildings) {
      if (b.popAnim > 0 && b.popAnim < 1) {
        b.popAnim = Math.min(1, b.popAnim + dt * 3.8);
        // Elastic bounce scale
        const t = b.popAnim;
        const s = 1 + Math.sin(t * Math.PI) * 0.16;
        b.mesh.scale.set(s, 0.75 + t * 0.25 + Math.sin(t * Math.PI) * 0.12, s);
        if (b.popAnim >= 1) b.mesh.scale.set(1, 1, 1);
      }
      if (b.bladesMesh && b.constructed) {
        b.bladesMesh.rotation.z -= simDt * 1.1;
      }
    }

    // Gentle chimney smoke from cottages, town hall & smithy
    this.smokeTimer += simDt;
    if (this.smokeTimer > 0.65) {
      this.smokeTimer = 0;
      for (const b of this.buildings) {
        if (!b.constructed) continue;
        if (b.kind === "cottage" || b.kind === "town_hall" || b.kind === "smithy") {
          const isSmithy = b.kind === "smithy";
          this.spawnParticles(
            b.mesh.position.x + (isSmithy ? -0.3 : 0.3),
            b.mesh.position.y + (isSmithy ? 2.2 : 1.75),
            b.mesh.position.z - 0.2,
            isSmithy ? 0xff9f59 : 0xf2f4f7,
            1,
            true,
          );
        }
      }
    }

    // Grow farmfields & regrow stumps into saplings over time
    if (simDt > 0) {
      for (let gz = 0; gz < MAP_SIZE; gz++) {
        for (let gx = 0; gx < MAP_SIZE; gx++) {
          const tile = this.world.getTile(gx, gz);
          if (!tile) continue;
          if (tile.terrain === "farm" && tile.cropStage < 1) {
            tile.cropStage = Math.min(1, tile.cropStage + simDt * 0.055);
            this.world.updateCropVisual(tile);
          }
          if (tile.prop === "stump") {
            tile.regrowTimer += simDt;
            if (tile.regrowTimer > 28) {
              tile.regrowTimer = 0;
              this.world.setTileProp(gx, gz, Math.random() < 0.5 ? "tree_pine" : "tree_oak");
            }
          }
        }
      }

      // Update all autonomous villagers
      for (const v of this.villagers) {
        this.updateVillager(v, simDt, elapsed);
      }
    }

    // Update particles & floating popups
    this.updateParticles(dt);
    this.updatePopups(dt, camera);
  }

  private updateVillager(v: VillagerInstance, dt: number, elapsed: number): void {
    const home = this.buildings.find((b) => b.id === v.homeBuildingId);
    if (!home) return;

    const toolBoost = this.getToolSpeedBonus();
    const homeLevel = home.level;

    if (v.state === "idle") {
      this.pickTaskForVillager(v, home);
      return;
    }

    if (v.state === "moving" || v.state === "returning") {
      const dx = v.targetX - v.x;
      const dz = v.targetZ - v.z;
      const dist = Math.hypot(dx, dz);

      // Faster walking on cobblestone paths!
      const currGrid = this.world.worldToGrid(v.x, v.z);
      const currTile = currGrid ? this.world.getTile(currGrid.gx, currGrid.gz) : null;
      const pathBoost = currTile?.terrain === "path" ? 1.45 : 1.0;
      const speed = 2.4 * pathBoost * (0.9 + toolBoost * 0.1);

      if (dist < 0.16) {
        v.x = v.targetX;
        v.z = v.targetZ;
        if (v.state === "moving") {
          v.state = "working";
          v.workTimer = this.getWorkDuration(v.job) / toolBoost;
        } else {
          // Arrived home -> deposit carried resources
          if (v.carrying && v.carryingAmount > 0) {
            this.resources[v.carrying] += v.carryingAmount;
            const icon =
              v.carrying === "wood"
                ? "🪵"
                : v.carrying === "stone"
                  ? "🪨"
                  : v.carrying === "food"
                    ? v.job === "fisherman"
                      ? "🐟"
                      : "🌾"
                    : "⚒️";
            this.spawnPopup(
              v.x,
              1.3,
              v.z,
              `+${v.carryingAmount} ${icon}`,
              v.carrying === "tools" ? "#ffd166" : "#b8f5a8",
            );
            this.audio.playHarvest();
            v.carrying = null;
            v.carryingAmount = 0;
            this.onStateChanged?.();
          }
          v.state = "idle";
        }
      } else {
        v.x += (dx / dist) * speed * dt;
        v.z += (dz / dist) * speed * dt;
        v.walkPhase += dt * 11 * pathBoost;
        v.mesh.rotation.y = Math.atan2(dx, dz);
        v.mesh.position.set(v.x, Math.abs(Math.sin(v.walkPhase)) * 0.09, v.z);
      }
      return;
    }

    if (v.state === "working") {
      // Cute tool-swing animation while working
      v.mesh.position.set(v.x, Math.abs(Math.sin(elapsed * 8)) * 0.05, v.z);
      if (v.toolMesh) {
        v.toolMesh.rotation.x = Math.sin(elapsed * 12) * 0.65;
      }

      if (v.job === "builder" && v.targetBuildingId) {
        const site = this.buildings.find((b) => b.id === v.targetBuildingId);
        if (!site || site.constructed) {
          v.targetBuildingId = null;
          v.state = "idle";
          return;
        }
        const def = BUILDING_DEFS[site.kind];
        site.buildProgress +=
          (dt * toolBoost * (1 + (homeLevel - 1) * 0.35)) / Math.max(def.buildTime, 1);
        v.statusText = `Building ${def.name} (${Math.min(99, Math.floor(site.buildProgress * 100))}%)`;
        if (Math.random() < dt * 4) {
          this.spawnParticles(site.mesh.position.x, 0.7, site.mesh.position.z, 0xdcb47a, 2);
        }
        if (site.buildProgress >= 1) {
          this.completeBuilding(site);
          v.targetBuildingId = null;
          v.state = "idle";
        }
        return;
      }

      v.workTimer -= dt;
      if (v.job === "smith" && Math.random() < dt * 5) {
        this.spawnParticles(v.x, 0.6, v.z, 0xff8c2b, 2);
      }
      if (v.workTimer <= 0) {
        if (v.toolMesh) v.toolMesh.rotation.x = 0;
        this.finishWorkAction(v, home);
      }
    }
  }

  private getWorkDuration(job: VillagerJob): number {
    switch (job) {
      case "lumberjack":
        return 3.2;
      case "farmer":
        return 2.8;
      case "fisherman":
        return 3.8;
      case "smith":
        return 4.5;
      case "builder":
        return 2.0;
    }
  }

  private pickTaskForVillager(v: VillagerInstance, home: BuildingInstance): void {
    const homePos = this.world.gridToWorld(home.gx, home.gz);

    if (v.job === "builder") {
      // Find nearest unconstructed building
      const site = this.buildings.find((b) => !b.constructed);
      if (site) {
        const pos = this.world.gridToWorld(site.gx, site.gz);
        v.targetBuildingId = site.id;
        v.targetX = pos.x + 0.75;
        v.targetZ = pos.z + 0.75;
        v.state = "moving";
        v.statusText = `Heading to build ${BUILDING_DEFS[site.kind].name}`;
      } else {
        // Cozy patrol near Town Hall / Builder Yard
        v.targetX = homePos.x + (Math.random() - 0.5) * 3.0;
        v.targetZ = homePos.z + (Math.random() - 0.5) * 3.0;
        v.state = "moving";
        v.targetBuildingId = null;
        v.workTimer = 1.5;
        v.statusText = "Inspecting village structures";
      }
      return;
    }

    if (v.job === "lumberjack") {
      const treeTile = this.findNearestTile(
        home.gx,
        home.gz,
        (t) => t.prop === "tree_pine" || t.prop === "tree_oak",
      );
      if (treeTile) {
        const pos = this.world.gridToWorld(treeTile.gx, treeTile.gz);
        v.targetTile = { gx: treeTile.gx, gz: treeTile.gz };
        v.targetX = pos.x + 0.5;
        v.targetZ = pos.z + 0.5;
        v.state = "moving";
        v.statusText = "Walking to chop timber";
      } else {
        v.statusText = "Waiting for trees (paint Trees!)";
      }
      return;
    }

    if (v.job === "farmer") {
      // Prefer ripe farmfields, else tend growing ones
      const farmTile =
        this.findNearestTile(
          home.gx,
          home.gz,
          (t) => t.terrain === "farm" && t.cropStage >= 0.85,
        ) ?? this.findNearestTile(home.gx, home.gz, (t) => t.terrain === "farm");
      if (farmTile) {
        const pos = this.world.gridToWorld(farmTile.gx, farmTile.gz);
        v.targetTile = { gx: farmTile.gx, gz: farmTile.gz };
        v.targetX = pos.x;
        v.targetZ = pos.z;
        v.state = "moving";
        v.statusText =
          farmTile.cropStage >= 0.85 ? "Heading to harvest wheat" : "Tending farmfields";
      } else {
        v.statusText = "Needs painted Farmfields nearby!";
      }
      return;
    }

    if (v.job === "fisherman") {
      // Walk onto the fishing dock pier
      v.targetX = homePos.x + 0.25;
      v.targetZ = homePos.z + 0.25;
      v.state = "moving";
      v.statusText = "Casting line off the dock";
      return;
    }

    if (v.job === "smith") {
      const rockTile = this.findNearestTile(home.gx, home.gz, (t) => t.prop === "rock");
      if (rockTile && Math.random() < 0.45) {
        const pos = this.world.gridToWorld(rockTile.gx, rockTile.gz);
        v.targetTile = { gx: rockTile.gx, gz: rockTile.gz };
        v.targetX = pos.x + 0.5;
        v.targetZ = pos.z + 0.5;
        v.state = "moving";
        v.statusText = "Mining stone & iron ore";
      } else {
        v.targetTile = null;
        v.targetX = homePos.x + 0.55;
        v.targetZ = homePos.z + 0.55;
        v.state = "moving";
        v.statusText = "Forging tools at the anvil";
      }
    }
  }

  private finishWorkAction(v: VillagerInstance, home: BuildingInstance): void {
    const homePos = this.world.gridToWorld(home.gx, home.gz);
    const bonus = home.level;

    if (v.job === "lumberjack" && v.targetTile) {
      const tile = this.world.getTile(v.targetTile.gx, v.targetTile.gz);
      if (tile && (tile.prop === "tree_pine" || tile.prop === "tree_oak")) {
        this.world.setTileProp(tile.gx, tile.gz, "stump");
        tile.regrowTimer = 0;
        this.spawnParticles(v.x, 0.7, v.z, 0x8f6138, 6);
        v.carrying = "wood";
        v.carryingAmount = 2 + bonus;
      }
      v.targetX = homePos.x + 0.4;
      v.targetZ = homePos.z + 0.5;
      v.state = "returning";
      v.statusText = "Carrying timber home";
      return;
    }

    if (v.job === "farmer" && v.targetTile) {
      const tile = this.world.getTile(v.targetTile.gx, v.targetTile.gz);
      if (tile && tile.terrain === "farm") {
        if (tile.cropStage >= 0.85) {
          tile.cropStage = 0.15;
          this.world.updateCropVisual(tile);
          const hasWindmill = this.buildings.some(
            (b) =>
              b.kind === "windmill" &&
              b.constructed &&
              Math.hypot(b.gx - tile.gx, b.gz - tile.gz) <= 5.5,
          );
          v.carrying = "food";
          v.carryingAmount = (2 + bonus) * (hasWindmill ? 2 : 1);
          this.spawnParticles(v.x, 0.5, v.z, 0xf2cf52, 6);
          v.targetX = homePos.x + 0.4;
          v.targetZ = homePos.z + 0.5;
          v.state = "returning";
          v.statusText = "Delivering golden wheat";
          return;
        }
        // Tending speeds up growth!
        tile.cropStage = Math.min(1, tile.cropStage + 0.45);
        this.world.updateCropVisual(tile);
      }
      v.state = "idle";
      return;
    }

    if (v.job === "fisherman") {
      v.carrying = "food";
      v.carryingAmount = 2 + bonus;
      this.spawnParticles(v.x, 0.4, v.z, 0x7fd4ff, 6);
      v.targetX = homePos.x - 0.3;
      v.targetZ = homePos.z - 0.3;
      v.state = "returning";
      v.statusText = "Reeling in fresh fish";
      return;
    }

    if (v.job === "smith") {
      if (v.targetTile) {
        v.carrying = "stone";
        v.carryingAmount = 2 + bonus;
        v.statusText = "Hauling ore to the Smithy";
      } else {
        v.carrying = "tools";
        v.carryingAmount = 1;
        this.resources.stone += 1;
        v.statusText = "Finished forging cozy tools!";
      }
      v.targetX = homePos.x + 0.3;
      v.targetZ = homePos.z + 0.3;
      v.state = "returning";
      return;
    }

    v.state = "idle";
  }

  private findNearestTile(
    fromGx: number,
    fromGz: number,
    pred: (tile: GridTile) => boolean,
  ): GridTile | null {
    let best: GridTile | null = null;
    let bestDist = Infinity;
    for (let gz = 0; gz < MAP_SIZE; gz++) {
      for (let gx = 0; gx < MAP_SIZE; gx++) {
        const t = this.world.getTile(gx, gz);
        if (!t || !pred(t)) continue;
        const d = Math.hypot(gx - fromGx, gz - fromGz);
        if (d < bestDist) {
          bestDist = d;
          best = t;
        }
      }
    }
    return best;
  }

  private spawnParticles(
    x: number,
    y: number,
    z: number,
    color: number,
    count: number,
    isSmoke = false,
  ): void {
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.9,
      flatShading: true,
      transparent: isSmoke,
      opacity: isSmoke ? 0.65 : 1,
    });
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(this.particleGeo, mat);
      m.position.set(x, y, z);
      this.scene.add(m);
      this.particles.push({
        mesh: m,
        vx: (Math.random() - 0.5) * (isSmoke ? 0.4 : 2.2),
        vy: isSmoke ? 0.8 + Math.random() * 0.4 : 1.8 + Math.random() * 1.5,
        vz: (Math.random() - 0.5) * (isSmoke ? 0.4 : 2.2),
        life: 0,
        maxLife: isSmoke ? 1.8 : 0.75,
      });
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      if (p.maxLife < 1.0) {
        p.vy -= 5.2 * dt; // Gravity for chips/sparks
      }
      const s = 1 - p.life / p.maxLife;
      p.mesh.scale.setScalar(Math.max(0.05, s));
    }
  }

  public spawnPopup(x: number, y: number, z: number, text: string, color: string): void {
    const el = document.createElement("div");
    el.className = "floating-popup";
    el.textContent = text;
    el.style.color = color;
    this.floatingLayer.appendChild(el);
    this.popups.push({ x, y, z, text, color, life: 0, maxLife: 1.5, el });
  }

  private updatePopups(dt: number, camera: THREE.Camera): void {
    const v = new THREE.Vector3();
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i]!;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.el.remove();
        this.popups.splice(i, 1);
        continue;
      }
      p.y += dt * 0.85;
      v.set(p.x, p.y, p.z).project(camera);
      const sx = (v.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-v.y * 0.5 + 0.5) * window.innerHeight;
      p.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%)`;
      p.el.style.opacity = `${Math.max(0, 1 - p.life / p.maxLife)}`;
    }
  }
}
