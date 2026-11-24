import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { JOB_META, type BuildingKind, type VillagerJob } from "./types.ts";

export type AssetKey =
  | BuildingKind
  | "windmill_base"
  | "windmill_blades"
  | "scaffold"
  | "villager"
  | "tree_pine"
  | "tree_oak"
  | "rock_cluster"
  | "stump"
  | "grass_patch"
  | "wheat_patch"
  | "path_stones";

const ASSET_PATHS: Record<AssetKey, string> = {
  town_hall: "assets/models/town_hall.glb",
  cottage: "assets/models/cottage.glb",
  lumber_hut: "assets/models/lumber_hut.glb",
  farmhouse: "assets/models/farmhouse.glb",
  fishing_dock: "assets/models/fishing_dock.glb",
  smithy: "assets/models/smithy.glb",
  builder_yard: "assets/models/builder_yard.glb",
  well: "assets/models/well.glb",
  windmill: "assets/models/windmill_base.glb",
  windmill_base: "assets/models/windmill_base.glb",
  windmill_blades: "assets/models/windmill_blades.glb",
  bakery: "assets/models/bakery.glb",
  sawmill: "assets/models/sawmill.glb",
  quarry: "assets/models/quarry.glb",
  tavern: "assets/models/tavern.glb",
  bridge: "assets/models/bridge.glb",
  wood_fence: "assets/kit/wood_fence.glb",
  stone_wall: "assets/models/stone_wall.glb",
  lantern: "assets/models/lantern.glb",
  flower_box: "assets/models/flower_box.glb",
  bench: "assets/models/bench.glb",
  scaffold: "assets/models/scaffold.glb",
  villager: "assets/models/villager.glb",
  tree_pine: "assets/kit/tree_pine.glb",
  tree_oak: "assets/kit/tree_oak.glb",
  rock_cluster: "assets/kit/rock_cluster.glb",
  stump: "assets/kit/stump.glb",
  grass_patch: "assets/kit/grass_patch.glb",
  wheat_patch: "assets/kit/wheat_patch.glb",
  path_stones: "assets/kit/path_stones.glb",
};

export class AssetLibrary {
  private templates = new Map<AssetKey, THREE.Group>();
  private loader = new GLTFLoader();

  public async loadAll(): Promise<void> {
    const base = import.meta.env.BASE_URL;
    const entries = Object.entries(ASSET_PATHS) as [AssetKey, string][];
    await Promise.all(
      entries.map(async ([key, path]) => {
        const gltf = await this.loader.loadAsync(`${base}${path}`);
        const root = gltf.scene;
        root.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        this.templates.set(key, root);
      }),
    );
  }

  public clone(key: AssetKey): THREE.Group {
    const tpl = this.templates.get(key);
    if (!tpl) {
      throw new Error(`Asset not loaded: ${key}`);
    }
    return tpl.clone(true);
  }

  /**
   * Builds a job-styled villager from the Blender villager.glb plus a cozy job hat & tool.
   */
  public createVillagerMesh(job: VillagerJob): {
    group: THREE.Group;
    toolMesh: THREE.Object3D;
  } {
    const group = new THREE.Group();
    const body = this.clone("villager");
    const meta = JOB_META[job];

    // Tint tunic material per job
    body.traverse((child) => {
      if (child instanceof THREE.Mesh && child.name.toLowerCase().includes("tunic")) {
        const clonedMat = (child.material as THREE.MeshStandardMaterial).clone();
        clonedMat.color.setHex(meta.tunicColor);
        child.material = clonedMat;
      }
    });
    group.add(body);

    // Job-specific hat
    const hatMat = new THREE.MeshStandardMaterial({
      color: meta.hatColor,
      roughness: 0.85,
      flatShading: true,
    });
    if (job === "farmer") {
      // Wide straw hat
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.25, 0.04, 8), hatMat);
      brim.position.set(0, 0.65, 0);
      brim.castShadow = true;
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.11, 8), hatMat);
      crown.position.set(0, 0.71, 0);
      crown.castShadow = true;
      group.add(brim, crown);
    } else if (job === "baker") {
      // Puffy white chef toque
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.1, 8), hatMat);
      band.position.set(0, 0.66, 0);
      band.castShadow = true;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), hatMat);
      puff.position.set(0, 0.77, 0);
      puff.castShadow = true;
      group.add(band, puff);
    } else if (job === "builder" || job === "miner") {
      // Rounded hard-cap
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.165, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
        hatMat,
      );
      cap.position.set(0, 0.56, 0);
      cap.castShadow = true;
      group.add(cap);
    } else {
      // Cozy beanie / cap
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.2, 7), hatMat);
      cap.position.set(0, 0.72, 0);
      cap.castShadow = true;
      group.add(cap);
    }

    // Job-specific handheld tool
    const toolPivot = new THREE.Group();
    toolPivot.position.set(0.2, 0.32, 0.06);
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x6d4728,
      roughness: 0.85,
      flatShading: true,
    });
    const ironMat = new THREE.MeshStandardMaterial({
      color: 0x5c6470,
      roughness: 0.4,
      metalness: 0.8,
      flatShading: true,
    });

    if (job === "lumberjack" || job === "sawyer") {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.42, 5), woodMat);
      handle.position.y = 0.12;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.04), ironMat);
      blade.position.set(0.05, 0.28, 0);
      toolPivot.add(handle, blade);
    } else if (job === "builder" || job === "smith" || job === "miner") {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.34, 5), woodMat);
      handle.position.y = 0.1;
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(job === "miner" ? 0.22 : 0.15, 0.07, 0.07),
        ironMat,
      );
      head.position.set(0, 0.26, 0);
      toolPivot.add(handle, head);
    } else if (job === "baker") {
      // Wooden baker's peel paddle
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.44, 5), woodMat);
      handle.position.y = 0.14;
      const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.025), woodMat);
      paddle.position.set(0, 0.36, 0);
      toolPivot.add(handle, paddle);
    } else if (job === "fisherman") {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.75, 5), woodMat);
      rod.position.set(0, 0.28, 0.22);
      rod.rotation.x = 0.65;
      toolPivot.add(rod);
    } else {
      // Farmer's pitchfork / hoe
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 5), woodMat);
      handle.position.y = 0.15;
      const prongs = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.04), ironMat);
      prongs.position.set(0, 0.38, 0);
      toolPivot.add(handle, prongs);
    }

    group.add(toolPivot);
    return { group, toolMesh: toolPivot };
  }
}
