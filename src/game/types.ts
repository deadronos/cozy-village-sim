import type * as THREE from "three";

export type TerrainType = "water" | "sand" | "grass" | "path" | "farm" | "meadow";

export type IslandArchetype = "classic_cove" | "archipelago" | "river_valley" | "highland_terrace";

export type IslandBiome = "meadow" | "pine_fjord" | "golden_coast" | "blossom_isle";

export interface IslandConfig {
  seed: string;
  archetype: IslandArchetype;
  biome: IslandBiome;
}

export const DEFAULT_ISLAND_CONFIG: IslandConfig = {
  seed: "MEADOW-42",
  archetype: "classic_cove",
  biome: "meadow",
};

export const ARCHETYPE_META: Record<
  IslandArchetype,
  { label: string; icon: string; description: string }
> = {
  classic_cove: {
    label: "Classic Cove",
    icon: "🏝️",
    description: "Lush sheltered island with gentle sandy bays.",
  },
  archipelago: {
    label: "Archipelago",
    icon: "🌊",
    description: "Three cozy islets linked by wooden footbridges.",
  },
  river_valley: {
    label: "River Valley",
    icon: "🏞️",
    description: "Winding freshwater stream dividing fertile banks.",
  },
  highland_terrace: {
    label: "Highland Terrace",
    icon: "⛰️",
    description: "Tiered green plateaus connected by stone steps.",
  },
};

export const BIOME_META: Record<
  IslandBiome,
  { label: string; icon: string; description: string; swatch: string }
> = {
  meadow: {
    label: "Lush Meadow",
    icon: "🌿",
    description: "Balanced oak & pine woods with wildflower meadows.",
    swatch: "#73b659",
  },
  pine_fjord: {
    label: "Pine Fjord",
    icon: "🌲",
    description: "Evergreen highlands, dense pines & mossy crags.",
    swatch: "#3d7a47",
  },
  golden_coast: {
    label: "Sunlit Coast",
    icon: "☀️",
    description: "Warm golden grasslands, wide sands & oak groves.",
    swatch: "#c8b24d",
  },
  blossom_isle: {
    label: "Blossom Isle",
    icon: "🌸",
    description: "Sakura-tinted oak canopies & abundant wild blooms.",
    swatch: "#f2a4be",
  },
};

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
  | "windmill"
  | "bakery"
  | "sawmill"
  | "quarry"
  | "tavern"
  | "bridge"
  | "wood_fence"
  | "stone_wall"
  | "lantern"
  | "flower_box"
  | "bench";

export type VillagerJob =
  | "builder"
  | "lumberjack"
  | "farmer"
  | "fisherman"
  | "smith"
  | "baker"
  | "sawyer"
  | "miner";

export type VillagerTraitId =
  | "early_bird"
  | "fast_walker"
  | "green_thumb"
  | "master_smith"
  | "keen_builder"
  | "lumber_pro"
  | "chatty"
  | "lucky_angler";

export interface VillagerTraitDefinition {
  id: VillagerTraitId;
  label: string;
  icon: string;
  description: string;
  preferredJobs?: VillagerJob[];
}

export type ToolMode =
  | { category: "select" }
  | { category: "build"; building: BuildingKind }
  | { category: "paint"; paint: "path" | "farm" | "meadow" | "tree" }
  | { category: "demolish" };

export type TimeOfDay = "morning" | "golden" | "dusk";

export type Season = "spring" | "summer" | "autumn" | "winter";

export interface ResourceBag {
  wood: number;
  stone: number;
  food: number;
  tools: number;
  planks: number;
  bread: number;
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
  waterOnly?: boolean;
  decor?: boolean;
  walkable?: boolean;
  unique?: boolean;
}

export interface GridTile {
  gx: number;
  gz: number;
  terrain: TerrainType;
  elevation: number;
  prop: ResourcePropType;
  cropStage: number; // 0..1 for farmfields
  buildingId: string | null;
  hasBridge?: boolean;
  isRiver?: boolean;
  hasSteps?: boolean;
  stepRotation?: number; // 0..3, facing uphill
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
  light?: THREE.PointLight;
  workerId: string | null;
  popAnim: number; // 0..1 squash-stretch pop-in
}

export interface VillagerInstance {
  id: string;
  name: string;
  trait: VillagerTraitId;
  job: VillagerJob;
  homeBuildingId: string;
  x: number;
  z: number;
  targetX: number;
  targetZ: number;
  path: Array<{ x: number; z: number }>;
  pathNavVersion: number;
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
  chatCooldown: number;
  waitEmoteTimer: number;
}

export interface EmoteBubble {
  villagerId?: string;
  buildingId?: string;
  x: number;
  y: number;
  z: number;
  icon: string;
  life: number;
  maxLife: number;
  el: HTMLDivElement;
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
    cost: { wood: 10, planks: 4, stone: 8, tools: 1 },
    buildTime: 6.5,
    coziness: 14,
  },
  bakery: {
    kind: "bakery",
    name: "Bakery",
    icon: "🥐",
    description: "Turns Food into warm Bread (+walk & work speed and Coziness!).",
    cost: { wood: 10, stone: 6 },
    buildTime: 4.5,
    job: "baker",
    coziness: 7,
  },
  sawmill: {
    kind: "sawmill",
    name: "Sawmill",
    icon: "🪚",
    description: "Refines Wood into Planks for Level 2–3 upgrades & landmarks.",
    cost: { wood: 8, stone: 4 },
    buildTime: 4.0,
    job: "sawyer",
    coziness: 3,
  },
  quarry: {
    kind: "quarry",
    name: "Stone Quarry",
    icon: "⛏️",
    description: "Dedicated Miner extracts steady Stone & Ore for your village.",
    cost: { wood: 10, stone: 4 },
    buildTime: 4.5,
    job: "miner",
    coziness: 2,
  },
  tavern: {
    kind: "tavern",
    name: "Cozy Tavern",
    icon: "🍺",
    description: "Social hub & inn (+2 pop, huge Coziness, dusk gathering spot!).",
    cost: { wood: 12, planks: 4, stone: 8 },
    buildTime: 6.0,
    housing: 2,
    coziness: 18,
  },
  bridge: {
    kind: "bridge",
    name: "Wooden Bridge",
    icon: "🌉",
    description: "Place over water tiles to connect coves. Villagers love bridges!",
    cost: { wood: 4 },
    buildTime: 0,
    coziness: 3,
    waterOnly: true,
    walkable: true,
  },
  wood_fence: {
    kind: "wood_fence",
    name: "Wood Fence",
    icon: "🪵",
    description: "Charming wooden pasture fence (+2 Coziness). Press R to rotate.",
    cost: { wood: 1 },
    buildTime: 0,
    coziness: 2,
    decor: true,
  },
  stone_wall: {
    kind: "stone_wall",
    name: "Stone Wall",
    icon: "🧱",
    description: "Low cobblestone garden wall (+2 Coziness). Press R to rotate.",
    cost: { stone: 2 },
    buildTime: 0,
    coziness: 2,
    decor: true,
  },
  lantern: {
    kind: "lantern",
    name: "Street Lantern",
    icon: "🏮",
    description: "Warm glowing lamp post that lights up paths at Dusk (+4 Coziness).",
    cost: { wood: 2, stone: 1 },
    buildTime: 0,
    coziness: 4,
    decor: true,
  },
  flower_box: {
    kind: "flower_box",
    name: "Flower Box",
    icon: "🌺",
    description: "Wooden planter bursting with village blooms (+3 Coziness).",
    cost: { wood: 2 },
    buildTime: 0,
    coziness: 3,
    decor: true,
  },
  bench: {
    kind: "bench",
    name: "Park Bench",
    icon: "🪑",
    description: "Cozy wooden bench for evening rests (+3 Coziness).",
    cost: { wood: 2 },
    buildTime: 0,
    coziness: 3,
    decor: true,
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
  baker: { label: "Baker", icon: "🥐", tunicColor: 0xe8dfd1, hatColor: 0xfaf7f0 },
  sawyer: { label: "Sawyer", icon: "🪚", tunicColor: 0x8c5a32, hatColor: 0x4d6b3c },
  miner: { label: "Miner", icon: "⛏️", tunicColor: 0x5c6778, hatColor: 0xd4a438 },
};

export const SEASON_META: Record<Season, { label: string; icon: string }> = {
  spring: { label: "Spring", icon: "🌸" },
  summer: { label: "Summer", icon: "☀️" },
  autumn: { label: "Autumn", icon: "🍂" },
  winter: { label: "Winter", icon: "❄️" },
};

export const TRAIT_META: Record<VillagerTraitId, VillagerTraitDefinition> = {
  early_bird: {
    id: "early_bird",
    label: "Early Bird",
    icon: "🌅",
    description: "Works 25% faster in the Morning and +10% at Golden Hour.",
  },
  fast_walker: {
    id: "fast_walker",
    label: "Fast Walker",
    icon: "👟",
    description: "Walks 25% faster across the village (stacks with Cobble Paths).",
  },
  green_thumb: {
    id: "green_thumb",
    label: "Green Thumb",
    icon: "🌱",
    description: "Harvests +1 bonus Food and nurtures wheat fields faster.",
    preferredJobs: ["farmer"],
  },
  master_smith: {
    id: "master_smith",
    label: "Master Smith",
    icon: "🔥",
    description: "Forges & mines 25% faster with a chance for bonus Tools or Stone.",
    preferredJobs: ["smith"],
  },
  keen_builder: {
    id: "keen_builder",
    label: "Keen Builder",
    icon: "📐",
    description: "Constructs new village buildings 30% faster.",
    preferredJobs: ["builder"],
  },
  lumber_pro: {
    id: "lumber_pro",
    label: "Hearty Woodsman",
    icon: "🪵",
    description: "Chops 15% faster and brings home +1 bonus Wood per tree.",
    preferredJobs: ["lumberjack"],
  },
  chatty: {
    id: "chatty",
    label: "Chatterbox",
    icon: "💬",
    description: "Loves greeting neighbors on the road (+2 Village Coziness).",
  },
  lucky_angler: {
    id: "lucky_angler",
    label: "Lucky Angler",
    icon: "🍀",
    description: "Reels in +1 bonus Fish and occasionally hooks driftwood or stone.",
    preferredJobs: ["fisherman"],
  },
};
