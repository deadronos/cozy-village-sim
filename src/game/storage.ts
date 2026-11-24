import { normalizeSeed } from "./islandGen.ts";
import {
  ARCHETYPE_META,
  BIOME_META,
  BUILDING_DEFS,
  DEFAULT_ISLAND_CONFIG,
  JOB_META,
  MAP_SIZE,
  SEASON_META,
  TRAIT_META,
  type BuildingKind,
  type IslandArchetype,
  type IslandBiome,
  type IslandConfig,
  type ResourceBag,
  type ResourcePropType,
  type Season,
  type TerrainType,
  type TimeOfDay,
  type VillagerJob,
  type VillagerTraitId,
} from "./types.ts";

export const SAVE_SCHEMA_VERSION = 1 as const;

export interface SavedTerrainOverride {
  gx: number;
  gz: number;
  terrain: TerrainType;
  cropStage?: number;
}

export interface SavedPropOverride {
  gx: number;
  gz: number;
  prop: ResourcePropType;
}

export interface SavedBuilding {
  kind: BuildingKind;
  gx: number;
  gz: number;
  rotation: number;
  constructed: boolean;
  buildProgress: number;
  level: number;
}

export interface SavedVillager {
  name: string;
  trait: VillagerTraitId;
  job: VillagerJob;
  homeGx: number;
  homeGz: number;
}

export interface VillageSaveData {
  schemaVersion: typeof SAVE_SCHEMA_VERSION;
  savedAt: string;
  seed?: string;
  archetype?: IslandArchetype;
  biome?: IslandBiome;
  timeOfDay: TimeOfDay;
  season: Season;
  autoSeason: boolean;
  resources: ResourceBag;
  terrainOverrides: SavedTerrainOverride[];
  propOverrides: SavedPropOverride[];
  buildings: SavedBuilding[];
  villagers: SavedVillager[];
}

export interface SaveSummary {
  savedAt: string;
  seed: string;
  archetype: IslandArchetype;
  biome: IslandBiome;
  buildingCount: number;
  villagerCount: number;
  season: Season;
  timeOfDay: TimeOfDay;
  resources: ResourceBag;
}

export type ValidationResult =
  | { ok: true; data: VillageSaveData; summary: SaveSummary }
  | { ok: false; error: string };

const AUTOSAVE_KEY = "meadowbrook_autosave_v1";
const SLOT_PREFIX = "meadowbrook_slot_";
const VALID_TERRAINS = new Set<TerrainType>(["water", "sand", "grass", "path", "farm", "meadow"]);
const VALID_PROPS = new Set<ResourcePropType>(["tree_pine", "tree_oak", "rock", "stump", null]);
const VALID_TOD = new Set<TimeOfDay>(["morning", "golden", "dusk"]);
const VALID_SEASONS = new Set<Season>(Object.keys(SEASON_META) as Season[]);
const VALID_BUILDINGS = new Set<BuildingKind>(Object.keys(BUILDING_DEFS) as BuildingKind[]);
const VALID_JOBS = new Set<VillagerJob>(Object.keys(JOB_META) as VillagerJob[]);
const VALID_TRAITS = new Set<VillagerTraitId>(Object.keys(TRAIT_META) as VillagerTraitId[]);
const VALID_ARCHETYPES = new Set<IslandArchetype>(Object.keys(ARCHETYPE_META) as IslandArchetype[]);
const VALID_BIOMES = new Set<IslandBiome>(Object.keys(BIOME_META) as IslandBiome[]);

function isValidCoord(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n < MAP_SIZE;
}

function asNonNegInt(n: unknown, fallback = 0): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

export function validateSaveData(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Save data must be a JSON object." };
  }
  const obj = raw as Record<string, unknown>;

  if (obj["schemaVersion"] !== SAVE_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Unsupported schemaVersion (${String(obj["schemaVersion"])}). Expected ${SAVE_SCHEMA_VERSION}.`,
    };
  }

  const timeOfDay: TimeOfDay = VALID_TOD.has(obj["timeOfDay"] as TimeOfDay)
    ? (obj["timeOfDay"] as TimeOfDay)
    : "morning";
  const season: Season = VALID_SEASONS.has(obj["season"] as Season)
    ? (obj["season"] as Season)
    : "summer";
  const autoSeason = Boolean(obj["autoSeason"]);
  const savedAt = typeof obj["savedAt"] === "string" ? obj["savedAt"] : new Date().toISOString();
  const seed =
    typeof obj["seed"] === "string" && obj["seed"].trim()
      ? normalizeSeed(obj["seed"])
      : DEFAULT_ISLAND_CONFIG.seed;
  const archetype: IslandArchetype = VALID_ARCHETYPES.has(obj["archetype"] as IslandArchetype)
    ? (obj["archetype"] as IslandArchetype)
    : DEFAULT_ISLAND_CONFIG.archetype;
  const biome: IslandBiome = VALID_BIOMES.has(obj["biome"] as IslandBiome)
    ? (obj["biome"] as IslandBiome)
    : DEFAULT_ISLAND_CONFIG.biome;

  const rawRes = obj["resources"];
  if (!rawRes || typeof rawRes !== "object") {
    return { ok: false, error: "Missing or invalid 'resources' object." };
  }
  const resObj = rawRes as Record<string, unknown>;
  const resources: ResourceBag = {
    wood: asNonNegInt(resObj["wood"]),
    stone: asNonNegInt(resObj["stone"]),
    food: asNonNegInt(resObj["food"]),
    tools: asNonNegInt(resObj["tools"]),
    planks: asNonNegInt(resObj["planks"]),
    bread: asNonNegInt(resObj["bread"]),
  };

  if (!Array.isArray(obj["buildings"])) {
    return { ok: false, error: "Missing 'buildings' array." };
  }
  const buildings: SavedBuilding[] = [];
  for (const b of obj["buildings"]) {
    if (!b || typeof b !== "object") continue;
    const rec = b as Record<string, unknown>;
    const kind = rec["kind"] as BuildingKind;
    if (!VALID_BUILDINGS.has(kind)) {
      return { ok: false, error: `Unknown building kind: "${String(rec["kind"])}".` };
    }
    if (!isValidCoord(rec["gx"]) || !isValidCoord(rec["gz"])) {
      return { ok: false, error: `Building "${kind}" has out-of-bounds coordinates.` };
    }
    buildings.push({
      kind,
      gx: rec["gx"],
      gz: rec["gz"],
      rotation: ((asNonNegInt(rec["rotation"]) % 4) + 4) % 4,
      constructed: Boolean(rec["constructed"]),
      buildProgress:
        typeof rec["buildProgress"] === "number"
          ? Math.min(1, Math.max(0, rec["buildProgress"]))
          : rec["constructed"]
            ? 1
            : 0,
      level: Math.min(3, Math.max(1, asNonNegInt(rec["level"], 1))),
    });
  }

  const terrainOverrides: SavedTerrainOverride[] = [];
  if (Array.isArray(obj["terrainOverrides"])) {
    for (const t of obj["terrainOverrides"]) {
      if (!t || typeof t !== "object") continue;
      const rec = t as Record<string, unknown>;
      const terrain = rec["terrain"] as TerrainType;
      if (!isValidCoord(rec["gx"]) || !isValidCoord(rec["gz"]) || !VALID_TERRAINS.has(terrain)) {
        continue;
      }
      terrainOverrides.push({
        gx: rec["gx"],
        gz: rec["gz"],
        terrain,
        cropStage:
          typeof rec["cropStage"] === "number"
            ? Math.min(1, Math.max(0, rec["cropStage"]))
            : undefined,
      });
    }
  }

  const propOverrides: SavedPropOverride[] = [];
  if (Array.isArray(obj["propOverrides"])) {
    for (const p of obj["propOverrides"]) {
      if (!p || typeof p !== "object") continue;
      const rec = p as Record<string, unknown>;
      const prop = (rec["prop"] ?? null) as ResourcePropType;
      if (!isValidCoord(rec["gx"]) || !isValidCoord(rec["gz"]) || !VALID_PROPS.has(prop)) {
        continue;
      }
      propOverrides.push({ gx: rec["gx"], gz: rec["gz"], prop });
    }
  }

  const villagers: SavedVillager[] = [];
  if (Array.isArray(obj["villagers"])) {
    for (const v of obj["villagers"]) {
      if (!v || typeof v !== "object") continue;
      const rec = v as Record<string, unknown>;
      const job = rec["job"] as VillagerJob;
      const trait = rec["trait"] as VillagerTraitId;
      if (!VALID_JOBS.has(job) || !isValidCoord(rec["homeGx"]) || !isValidCoord(rec["homeGz"])) {
        continue;
      }
      villagers.push({
        name:
          typeof rec["name"] === "string" && rec["name"].trim() ? rec["name"].slice(0, 24) : "Pip",
        trait: VALID_TRAITS.has(trait) ? trait : "early_bird",
        job,
        homeGx: rec["homeGx"],
        homeGz: rec["homeGz"],
      });
    }
  }

  const data: VillageSaveData = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    savedAt,
    seed,
    archetype,
    biome,
    timeOfDay,
    season,
    autoSeason,
    resources,
    terrainOverrides,
    propOverrides,
    buildings,
    villagers,
  };

  return {
    ok: true,
    data,
    summary: {
      savedAt,
      seed,
      archetype,
      biome,
      buildingCount: buildings.length,
      villagerCount: villagers.length,
      season,
      timeOfDay,
      resources,
    },
  };
}

export function parseSaveJson(text: string): ValidationResult {
  try {
    const parsed: unknown = JSON.parse(text);
    return validateSaveData(parsed);
  } catch (err) {
    return {
      ok: false,
      error: `Invalid JSON syntax: ${err instanceof Error ? err.message : "parse failed"}`,
    };
  }
}

export function saveAutosave(data: VillageSaveData): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadAutosave(): VillageSaveData | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const res = parseSaveJson(raw);
    return res.ok ? res.data : null;
  } catch {
    return null;
  }
}

export function clearAutosave(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // Ignore
  }
}

export function saveToSlot(slot: number, data: VillageSaveData): void {
  try {
    localStorage.setItem(`${SLOT_PREFIX}${slot}_v1`, JSON.stringify(data));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadFromSlot(slot: number): ValidationResult | null {
  try {
    const raw = localStorage.getItem(`${SLOT_PREFIX}${slot}_v1`);
    if (!raw) return null;
    return parseSaveJson(raw);
  } catch {
    return null;
  }
}

export function deleteSlot(slot: number): void {
  try {
    localStorage.removeItem(`${SLOT_PREFIX}${slot}_v1`);
  } catch {
    // Ignore
  }
}

/**
 * Encodes village JSON into a compact URL-safe base64 hash fragment (`#village=...`).
 */
export function encodeShareHash(data: VillageSaveData): string {
  const json = JSON.stringify(data);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const b64 = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `#village=${b64}`;
}

export function decodeShareHash(hash: string): ValidationResult | null {
  if (!hash.startsWith("#village=")) return null;
  try {
    let b64 = hash.slice("#village=".length).replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4 !== 0) b64 += "=";
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const json = new TextDecoder().decode(bytes);
    return parseSaveJson(json);
  } catch {
    return { ok: false, error: "Could not decode shared village link." };
  }
}

export function encodeSeedHash(config: IslandConfig): string {
  const params = new URLSearchParams();
  params.set("seed", normalizeSeed(config.seed));
  params.set("archetype", config.archetype);
  params.set("biome", config.biome);
  return `#${params.toString()}`;
}

export function decodeSeedHash(hash: string): IslandConfig | null {
  if (!hash.startsWith("#seed=")) return null;
  try {
    const params = new URLSearchParams(hash.slice(1));
    const rawSeed = params.get("seed");
    if (!rawSeed) return null;
    const rawArch = params.get("archetype") as IslandArchetype | null;
    const rawBiome = params.get("biome") as IslandBiome | null;
    return {
      seed: normalizeSeed(rawSeed),
      archetype:
        rawArch && VALID_ARCHETYPES.has(rawArch) ? rawArch : DEFAULT_ISLAND_CONFIG.archetype,
      biome: rawBiome && VALID_BIOMES.has(rawBiome) ? rawBiome : DEFAULT_ISLAND_CONFIG.biome,
    };
  } catch {
    return null;
  }
}
