import type * as THREE from "three";

export type TerrainType = "water" | "sand" | "grass" | "path" | "farm" | "meadow";

export type ResourcePropType = "tree_pine" | "tree_oak" | "rock" | "stump" | null;

export type BuildingKind =
  | "town_hall"
  | "cottage"
  | "lumber_hut"
  | "farmhouse"
  | "fishing_dock"
  | "smithy"
  | "builder_yard"
  | "well"
  | "windmill";

export type VillagerJob = "builder" | "lumberjack" | "farmer" | "fisherman" | "smith";

export type ToolMode =
  | { category: "select" }
  | { category: "build"; building: BuildingKind }
  | { category: "paint"; paint: "path" | "farm" | "meadow" | "tree" }
  | { category: "demolish" };

export type TimeOfDay = "morning" | "golden" | "dusk";

export interface ResourceBag {
  wood: number;
  stone: number;
  food: number;
  tools: number;
}

export interface BuildingDefinition {
  kind: BuildingKind;
  name: string;
  icon: string;
  description: string;
  cost: Partial<ResourceBag>;
  buildTime: number;
  job?: VillagerJob;
  housing?: number;
  coziness: number;
  shoreOnly?: boolean;
  unique?: boolean;
}

export interface GridTile {
  gx: number;
  gz: number;
  terrain: TerrainType;
  elevation: number;
  prop: ResourcePropType;
  propMesh: THREE.Object3D | null;
  decorMesh: THREE.Object3D | null;
  cropStage: number; // 0..1 for farmfields
  buildingId: string | null;
  regrowTimer: number;
}

export interface BuildingInstance {
  id: string;
  kind: BuildingKind;
  gx: number;
  gz: number;
  rotation: number; // 0, 1, 2, 3 (multiples of 90 deg)
  constructed: boolean;
  buildProgress: number; // 0..1
  level: number;
  mesh: THREE.Object3D;
  bladesMesh?: THREE.Object3D;
  workerId: string | null;
  popAnim: number; // 0..1 squash-stretch pop-in
}

export interface VillagerInstance {
  id: string;
  name: string;
  job: VillagerJob;
  homeBuildingId: string;
  x: number;
  z: number;
  targetX: number;
  targetZ: number;
  state: "idle" | "moving" | "working" | "returning";
  statusText: string;
  workTimer: number;
  targetTile: { gx: number; gz: number } | null;
  targetBuildingId: string | null;
  carrying: keyof ResourceBag | null;
  carryingAmount: number;
  mesh: THREE.Group;
  toolMesh: THREE.Object3D | null;
  walkPhase: number;
}

export interface FloatingPopup {
  x: number;
  y: number;
  z: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  el: HTMLDivElement;
}

export const TILE_SIZE = 2.0;
export const MAP_SIZE = 24;

export const BUILDING_DEFS: Record<BuildingKind, BuildingDefinition> = {
  town_hall: {
    kind: "town_hall",
    name: "Town Hall",
    icon: "🏛️",
    description: "Heart of the village. Houses your starter Builder.",
    cost: {},
    buildTime: 0,
    job: "builder",
    housing: 3,
    coziness: 10,
    unique: true,
  },
  cottage: {
    kind: "cottage",
    name: "Cottage",
    icon: "🏡",
    description: "Cozy thatch home. Adds +2 villager capacity.",
    cost: { wood: 8 },
    buildTime: 4.5,
    housing: 2,
    coziness: 5,
  },
  lumber_hut: {
    kind: "lumber_hut",
    name: "Lumber Hut",
    icon: "🪓",
    description: "Assigns a Lumberjack to chop trees & replant saplings.",
    cost: { wood: 6 },
    buildTime: 4.0,
    job: "lumberjack",
    coziness: 2,
  },
  farmhouse: {
    kind: "farmhouse",
    name: "Farmhouse",
    icon: "🌾",
    description: "Assigns a Farmer to tend & harvest painted Farmfields.",
    cost: { wood: 8 },
    buildTime: 4.5,
    job: "farmer",
    coziness: 4,
  },
  fishing_dock: {
    kind: "fishing_dock",
    name: "Fishing Dock",
    icon: "🎣",
    description: "Place on shoreline sand. Assigns a Fisherman for steady Fish.",
    cost: { wood: 8 },
    buildTime: 4.0,
    job: "fisherman",
    coziness: 4,
    shoreOnly: true,
  },
  smithy: {
    kind: "smithy",
    name: "Smithy",
    icon: "⚒️",
    description: "Assigns a Smith to gather ore & forge Tools (+work speed!).",
    cost: { wood: 10, stone: 6 },
    buildTime: 5.5,
    job: "smith",
    coziness: 3,
  },
  builder_yard: {
    kind: "builder_yard",
    name: "Builder Yard",
    icon: "🔨",
    description: "Adds an extra Builder to construct & upgrade buildings faster.",
    cost: { wood: 10, stone: 4 },
    buildTime: 4.5,
    job: "builder",
    coziness: 2,
  },
  well: {
    kind: "well",
    name: "Village Well",
    icon: "🪣",
    description: "Charming centerpiece that boosts village coziness.",
    cost: { wood: 4, stone: 4 },
    buildTime: 2.5,
    coziness: 8,
  },
  windmill: {
    kind: "windmill",
    name: "Windmill",
    icon: "🌬️",
    description: "Spinning landmark that doubles nearby farm harvests.",
    cost: { wood: 14, stone: 8, tools: 1 },
    buildTime: 6.5,
    coziness: 14,
  },
};

export const JOB_META: Record<
  VillagerJob,
  { label: string; icon: string; tunicColor: number; hatColor: number }
> = {
  builder: { label: "Builder", icon: "🔨", tunicColor: 0xd99b26, hatColor: 0xf4c430 },
  lumberjack: { label: "Lumberjack", icon: "🪓", tunicColor: 0xc44536, hatColor: 0x6b2d1f },
  farmer: { label: "Farmer", icon: "🌾", tunicColor: 0x4f8a4b, hatColor: 0xe6c35c },
  fisherman: { label: "Fisherman", icon: "🎣", tunicColor: 0x3b7aa8, hatColor: 0x264e70 },
  smith: { label: "Smith", icon: "⚒️", tunicColor: 0x454955, hatColor: 0x2b2d34 },
};
