import {
  DEFAULT_ISLAND_CONFIG,
  MAP_SIZE,
  type IslandArchetype,
  type IslandBiome,
  type IslandConfig,
  type ResourcePropType,
  type Season,
  type TerrainType,
} from "./types.ts";

export interface GeneratedTileData {
  gx: number;
  gz: number;
  terrain: TerrainType;
  elevation: number;
  prop: ResourcePropType;
  isRiver: boolean;
  hasSteps: boolean;
  stepRotation: number;
}

export interface IslandGenerationResult {
  config: IslandConfig;
  tiles: GeneratedTileData[][];
  townCenter: { gx: number; gz: number };
  starterBridges: Array<{ gx: number; gz: number; rotation: number }>;
  starterFarms: Array<{ gx: number; gz: number }>;
}

export interface BiomeSpec {
  oakRatio: number;
  treeDensity: number;
  rockDensity: number;
  meadowDensity: number;
  sandThresholdBoost: number;
  terrainPalette: Record<Season, Record<TerrainType, number>>;
  waterPalette: Record<Season, { shallow: number; deep: number; river: number; foam: number }>;
  oakColors: Record<Season, readonly number[]>;
  pineColors: Record<Season, readonly number[]>;
}

export const BIOME_SPECS: Record<IslandBiome, BiomeSpec> = {
  meadow: {
    oakRatio: 0.48,
    treeDensity: 0.25,
    rockDensity: 0.08,
    meadowDensity: 0.14,
    sandThresholdBoost: 0,
    terrainPalette: {
      spring: {
        water: 0x52b0d4,
        sand: 0xebd9a4,
        grass: 0x7dc864,
        path: 0xc8bca0,
        farm: 0x8b623b,
        meadow: 0x76c45a,
      },
      summer: {
        water: 0x4ca6c8,
        sand: 0xe9d69b,
        grass: 0x73b659,
        path: 0xc2b699,
        farm: 0x8b623b,
        meadow: 0x67ad4d,
      },
      autumn: {
        water: 0x458ea8,
        sand: 0xdcc58c,
        grass: 0xa49646,
        path: 0xbda886,
        farm: 0x7f5834,
        meadow: 0xb68b3d,
      },
      winter: {
        water: 0x4a82a6,
        sand: 0xd5dce0,
        grass: 0xdce7ef,
        path: 0xc4cfd8,
        farm: 0x867468,
        meadow: 0xe5eff6,
      },
    },
    waterPalette: {
      spring: { shallow: 0x5cd0d8, deep: 0x226e98, river: 0x54d4c2, foam: 0xf6fbff },
      summer: { shallow: 0x50c4d4, deep: 0x1d628c, river: 0x4ac8bc, foam: 0xf4fbff },
      autumn: { shallow: 0x499cb4, deep: 0x1c4b6e, river: 0x439c9a, foam: 0xebf3f7 },
      winter: { shallow: 0x5992b4, deep: 0x214a6c, river: 0x62a8be, foam: 0xf2f8fc },
    },
    oakColors: {
      spring: [0xf2a4be, 0x6ec458, 0x89d468],
      summer: [0x4f943d, 0x7ca638, 0x5ca044],
      autumn: [0xd96b27, 0xe39e2b, 0xb84624],
      winter: [0xd8e4ee, 0xb8ccd8, 0xc9dbe8],
    },
    pineColors: {
      spring: [0x316e3c, 0x3b7d46],
      summer: [0x2e6a39, 0x377643],
      autumn: [0x2c5c34, 0x35643c],
      winter: [0x8fb5ba, 0xa2c4ca],
    },
  },
  pine_fjord: {
    oakRatio: 0.14,
    treeDensity: 0.31,
    rockDensity: 0.13,
    meadowDensity: 0.09,
    sandThresholdBoost: -0.025,
    terrainPalette: {
      spring: {
        water: 0x489cb8,
        sand: 0xd8cdb0,
        grass: 0x589f58,
        path: 0xbcb6a6,
        farm: 0x7b5838,
        meadow: 0x4f9650,
      },
      summer: {
        water: 0x4292b2,
        sand: 0xd5c8a6,
        grass: 0x4d8e4f,
        path: 0xb6b0a0,
        farm: 0x785636,
        meadow: 0x468448,
      },
      autumn: {
        water: 0x3d7d96,
        sand: 0xc8b996,
        grass: 0x7d8045,
        path: 0xada290,
        farm: 0x6f4f32,
        meadow: 0x8d753d,
      },
      winter: {
        water: 0x447494,
        sand: 0xcfd7dc,
        grass: 0xd2dfe8,
        path: 0xbcc7d0,
        farm: 0x7a6c62,
        meadow: 0xdce8f0,
      },
    },
    waterPalette: {
      spring: { shallow: 0x46b2c2, deep: 0x194e74, river: 0x4ec4be, foam: 0xf2f9fc },
      summer: { shallow: 0x40a6bc, deep: 0x174568, river: 0x48b8b6, foam: 0xf0f8fc },
      autumn: { shallow: 0x3e899e, deep: 0x173954, river: 0x3e8d92, foam: 0xe6f0f5 },
      winter: { shallow: 0x4e82a2, deep: 0x1a3b5a, river: 0x5d9ab0, foam: 0xeff6fb },
    },
    oakColors: {
      spring: [0x6bb85c, 0x78c468, 0x5ca84f],
      summer: [0x47863a, 0x5a9442, 0x4f8a3c],
      autumn: [0xc96226, 0xd48e28, 0xa84324],
      winter: [0xcddbe6, 0xb2c6d4, 0xd8e5ee],
    },
    pineColors: {
      spring: [0x265b33, 0x306c3e],
      summer: [0x23552f, 0x2c6438],
      autumn: [0x224c2b, 0x2b5734],
      winter: [0x82aab4, 0x99bec8],
    },
  },
  golden_coast: {
    oakRatio: 0.7,
    treeDensity: 0.19,
    rockDensity: 0.08,
    meadowDensity: 0.12,
    sandThresholdBoost: 0.05,
    terrainPalette: {
      spring: {
        water: 0x58c4d8,
        sand: 0xf4e1a8,
        grass: 0x9ac658,
        path: 0xd4c39e,
        farm: 0x94683b,
        meadow: 0x8ec04d,
      },
      summer: {
        water: 0x4ec0d6,
        sand: 0xf2dc9e,
        grass: 0x97bd4d,
        path: 0xcfbb96,
        farm: 0x92663a,
        meadow: 0x8cb345,
      },
      autumn: {
        water: 0x48a2b8,
        sand: 0xe6cc8e,
        grass: 0xc29e44,
        path: 0xc8b288,
        farm: 0x865c36,
        meadow: 0xcb953d,
      },
      winter: {
        water: 0x4e8cb0,
        sand: 0xdde0dc,
        grass: 0xe2e8ec,
        path: 0xcacfd4,
        farm: 0x8a786a,
        meadow: 0xe8eff2,
      },
    },
    waterPalette: {
      spring: { shallow: 0x62d9dc, deep: 0x1d779e, river: 0x5cd8c8, foam: 0xfafdff },
      summer: { shallow: 0x56d4dc, deep: 0x196d96, river: 0x52d2c6, foam: 0xf9fdff },
      autumn: { shallow: 0x4eb0c0, deep: 0x1b5678, river: 0x48aba6, foam: 0xf0f6fa },
      winter: { shallow: 0x5a98b8, deep: 0x204f72, river: 0x66b0c4, foam: 0xf4f9fc },
    },
    oakColors: {
      spring: [0x82cf58, 0x9bd65c, 0x72c24e],
      summer: [0x6ea338, 0x86ad3a, 0x5e9638],
      autumn: [0xe37c26, 0xebaa2c, 0xc75422],
      winter: [0xdde6ec, 0xc4d4de, 0xd0dfe8],
    },
    pineColors: {
      spring: [0x3d7c42, 0x488a4c],
      summer: [0x38743d, 0x428246],
      autumn: [0x356438, 0x426e3e],
      winter: [0x99bdc0, 0xaccad0],
    },
  },
  blossom_isle: {
    oakRatio: 0.85,
    treeDensity: 0.24,
    rockDensity: 0.06,
    meadowDensity: 0.24,
    sandThresholdBoost: 0.015,
    terrainPalette: {
      spring: {
        water: 0x56bce0,
        sand: 0xf0dfc2,
        grass: 0x86d072,
        path: 0xd2c4ae,
        farm: 0x8b623f,
        meadow: 0x7ec968,
      },
      summer: {
        water: 0x50b4d8,
        sand: 0xeddab8,
        grass: 0x7bc366,
        path: 0xcbbea6,
        farm: 0x8a613d,
        meadow: 0x72bc5c,
      },
      autumn: {
        water: 0x4998b8,
        sand: 0xe0c9a2,
        grass: 0xb29a58,
        path: 0xc4b092,
        farm: 0x7e5836,
        meadow: 0xc28a52,
      },
      winter: {
        water: 0x4e88ae,
        sand: 0xdbe0e6,
        grass: 0xe4ecf4,
        path: 0xcad3dc,
        farm: 0x88786e,
        meadow: 0xedf3f8,
      },
    },
    waterPalette: {
      spring: { shallow: 0x68d4e0, deep: 0x246fa2, river: 0x62dacb, foam: 0xfafcff },
      summer: { shallow: 0x5ccae0, deep: 0x206598, river: 0x58d0c4, foam: 0xf8fcff },
      autumn: { shallow: 0x52a6c0, deep: 0x205076, river: 0x4ca6a8, foam: 0xf0f4fa },
      winter: { shallow: 0x5e96bc, deep: 0x244e74, river: 0x68aec6, foam: 0xf4f8fc },
    },
    oakColors: {
      spring: [0xf7adc6, 0xf296b6, 0xfac8d8],
      summer: [0xf2a4be, 0x74c25e, 0xf6b8cc],
      autumn: [0xe36b58, 0xe89a42, 0xd4526c],
      winter: [0xeae6f0, 0xd6d2e2, 0xebeef4],
    },
    pineColors: {
      spring: [0x3b7a4a, 0x468854],
      summer: [0x367244, 0x407e4e],
      autumn: [0x346240, 0x3e6c48],
      winter: [0x9bbec6, 0xaecdd4],
    },
  },
};

const SEED_WORDS = [
  "MEADOW",
  "COVE",
  "WILLOW",
  "BRAMBLE",
  "HARBOR",
  "FJORD",
  "BROOK",
  "BLOSSOM",
  "TERRACE",
  "CLOVER",
  "MAPLE",
  "LANTERN",
  "PEBBLE",
  "HEARTH",
  "ACORN",
  "FERN",
  "MOSS",
  "THISTLE",
] as const;

export function normalizeSeed(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, "-").toUpperCase().slice(0, 24);
  return cleaned.length > 0 ? cleaned : DEFAULT_ISLAND_CONFIG.seed;
}

export function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function createRng(seedStr: string): () => number {
  let a = hashSeed(seedStr) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateRandomSeed(archetype?: IslandArchetype, biome?: IslandBiome): string {
  const weighted: string[] = [...SEED_WORDS];
  if (archetype === "archipelago") weighted.push("HARBOR", "COVE", "PEBBLE");
  else if (archetype === "river_valley") weighted.push("BROOK", "WILLOW", "FERN");
  else if (archetype === "highland_terrace") weighted.push("TERRACE", "ACORN", "FJORD");
  if (biome === "blossom_isle") weighted.push("BLOSSOM", "CLOVER");
  else if (biome === "pine_fjord") weighted.push("FJORD", "MOSS");
  const word = weighted[Math.floor(Math.random() * weighted.length)] ?? "MEADOW";
  const num = 10 + Math.floor(Math.random() * 990);
  return `${word}-${num}`;
}

export function deterministicTileNoise(seed: string, gx: number, gz: number): number {
  const s = hashSeed(seed);
  const n = Math.sin(gx * 127.1 + gz * 311.7 + (s % 9973) * 0.13) * 43758.5453123;
  return n - Math.floor(n);
}

const CARDINAL_DIRS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function createEmptyGrid(): GeneratedTileData[][] {
  const grid: GeneratedTileData[][] = [];
  for (let gz = 0; gz < MAP_SIZE; gz++) {
    const row: GeneratedTileData[] = [];
    for (let gx = 0; gx < MAP_SIZE; gx++) {
      row.push({
        gx,
        gz,
        terrain: "water",
        elevation: -0.45,
        prop: null,
        isRiver: false,
        hasSteps: false,
        stepRotation: 0,
      });
    }
    grid.push(row);
  }
  return grid;
}

function inBounds(gx: number, gz: number): boolean {
  return gx >= 0 && gx < MAP_SIZE && gz >= 0 && gz < MAP_SIZE;
}

function isInnerTile(gx: number, gz: number): boolean {
  return gx >= 1 && gx < MAP_SIZE - 1 && gz >= 1 && gz < MAP_SIZE - 1;
}

function hasFlatGrassPlaza(
  tiles: GeneratedTileData[][],
  cx: number,
  cz: number,
  requireSameElevation = true,
): boolean {
  const center = tiles[cz]?.[cx];
  if (!center || center.terrain !== "grass") return false;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const t = tiles[cz + dz]?.[cx + dx];
      if (!t || t.terrain !== "grass") return false;
      if (requireSameElevation && Math.abs(t.elevation - center.elevation) > 0.05) {
        return false;
      }
    }
  }
  return true;
}

function findBestTownCenter(
  tiles: GeneratedTileData[][],
  preferX: number,
  preferZ: number,
  avoidRiver = false,
): { gx: number; gz: number } {
  let best: { gx: number; gz: number } | null = null;
  let bestScore = Infinity;

  for (let gz = 2; gz < MAP_SIZE - 2; gz++) {
    for (let gx = 2; gx < MAP_SIZE - 2; gx++) {
      if (!hasFlatGrassPlaza(tiles, gx, gz, true)) continue;
      if (avoidRiver) {
        let nearRiver = false;
        for (let dz = -2; dz <= 2 && !nearRiver; dz++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (tiles[gz + dz]?.[gx + dx]?.isRiver) {
              nearRiver = true;
              break;
            }
          }
        }
        if (nearRiver) continue;
      }
      const t = tiles[gz]![gx]!;
      const elevPenalty = t.elevation * 4.5;
      const dist = Math.hypot(gx - preferX, gz - preferZ) + elevPenalty;
      if (dist < bestScore) {
        bestScore = dist;
        best = { gx, gz };
      }
    }
  }

  if (best) return best;

  // Fallback without river exclusion
  for (let gz = 2; gz < MAP_SIZE - 2; gz++) {
    for (let gx = 2; gx < MAP_SIZE - 2; gx++) {
      if (!hasFlatGrassPlaza(tiles, gx, gz, true)) continue;
      const dist = Math.hypot(gx - preferX, gz - preferZ);
      if (dist < bestScore) {
        bestScore = dist;
        best = { gx, gz };
      }
    }
  }

  return best ?? { gx: Math.floor((MAP_SIZE - 1) / 2), gz: Math.floor((MAP_SIZE - 1) / 2) };
}

function generateClassicCove(
  tiles: GeneratedTileData[][],
  rng: () => number,
  sandBoost: number,
): { gx: number; gz: number } {
  const center = (MAP_SIZE - 1) / 2;
  const cx = center + (rng() - 0.5) * 1.4;
  const cz = center + (rng() - 0.5) * 1.4;
  const sx = 0.92 + rng() * 0.16;
  const sz = 0.92 + rng() * 0.16;
  const p1 = rng() * Math.PI * 2;
  const p2 = rng() * Math.PI * 2;
  const p3 = rng() * Math.PI * 2;
  const a1 = 0.08 + rng() * 0.05;
  const a2 = 0.04 + rng() * 0.04;
  const a3 = 0.02 + rng() * 0.025;

  for (let gz = 1; gz < MAP_SIZE - 1; gz++) {
    for (let gx = 1; gx < MAP_SIZE - 1; gx++) {
      const dx = (gx - cx) / (MAP_SIZE * 0.48 * sx);
      const dz = (gz - cz) / (MAP_SIZE * 0.48 * sz);
      const angle = Math.atan2(dz, dx);
      const wobble =
        a1 * Math.sin(angle * 3 + p1) +
        a2 * Math.cos(angle * 5 + p2) +
        a3 * Math.sin(angle * 7 + p3);
      const dist = Math.hypot(dx, dz) + wobble;

      const tile = tiles[gz]![gx]!;
      if (dist < 0.78 - sandBoost * 0.35) {
        tile.terrain = "grass";
        tile.elevation = 0.0;
      } else if (dist < 0.91 + sandBoost * 0.65) {
        tile.terrain = "sand";
        tile.elevation = -0.08;
      }
    }
  }

  return findBestTownCenter(tiles, Math.round(cx), Math.round(cz));
}

export function findConnectedComponents(
  tiles: GeneratedTileData[][],
  pred: (t: GeneratedTileData) => boolean,
): GeneratedTileData[][] {
  const visited = Array.from({ length: MAP_SIZE }, () => new Uint8Array(MAP_SIZE));
  const components: GeneratedTileData[][] = [];

  for (let gz = 0; gz < MAP_SIZE; gz++) {
    for (let gx = 0; gx < MAP_SIZE; gx++) {
      if (visited[gz]![gx] === 1) continue;
      const start = tiles[gz]![gx]!;
      if (!pred(start)) continue;

      const comp: GeneratedTileData[] = [];
      const queue: GeneratedTileData[] = [start];
      visited[gz]![gx] = 1;

      while (queue.length > 0) {
        const cur = queue.shift()!;
        comp.push(cur);
        for (const [dx, dz] of CARDINAL_DIRS) {
          const nx = cur.gx + dx;
          const nz = cur.gz + dz;
          if (!inBounds(nx, nz) || visited[nz]![nx] === 1) continue;
          const nt = tiles[nz]![nx]!;
          if (!pred(nt)) continue;
          visited[nz]![nx] = 1;
          queue.push(nt);
        }
      }
      components.push(comp);
    }
  }

  components.sort((a, b) => b.length - a.length);
  return components;
}

function generateArchipelago(
  tiles: GeneratedTileData[][],
  rng: () => number,
  sandBoost: number,
): {
  townCenter: { gx: number; gz: number };
  starterBridges: Array<{ gx: number; gz: number; rotation: number }>;
} {
  const center = (MAP_SIZE - 1) / 2;
  const baseAngle = rng() * Math.PI * 2;
  const mainDist = 4.1 + rng() * 0.4;
  const satDist = 6.2 + rng() * 0.35;
  const satAngleDelta = 2.14 + (rng() - 0.5) * 0.16;

  const islets = [
    {
      x: center + Math.cos(baseAngle) * mainDist,
      z: center + Math.sin(baseAngle) * mainDist,
      grassR: 3.65 - sandBoost * 1.1,
      sandR: 4.45 + sandBoost * 1.4,
      p1: rng() * Math.PI * 2,
      p2: rng() * Math.PI * 2,
    },
    {
      x: center + Math.cos(baseAngle + satAngleDelta) * satDist,
      z: center + Math.sin(baseAngle + satAngleDelta) * satDist,
      grassR: 2.45 - sandBoost * 0.9,
      sandR: 3.15 + sandBoost * 1.2,
      p1: rng() * Math.PI * 2,
      p2: rng() * Math.PI * 2,
    },
    {
      x: center + Math.cos(baseAngle - satAngleDelta) * satDist,
      z: center + Math.sin(baseAngle - satAngleDelta) * satDist,
      grassR: 2.45 - sandBoost * 0.9,
      sandR: 3.15 + sandBoost * 1.2,
      p1: rng() * Math.PI * 2,
      p2: rng() * Math.PI * 2,
    },
  ];

  // Track which islet owns each land tile to guarantee clean water straits between islets
  const ownerGrid = Array.from({ length: MAP_SIZE }, () => new Int8Array(MAP_SIZE).fill(-1));

  for (let gz = 1; gz < MAP_SIZE - 1; gz++) {
    for (let gx = 1; gx < MAP_SIZE - 1; gx++) {
      let bestIdx = -1;
      let bestNorm = Infinity;
      let secondNorm = Infinity;

      for (let i = 0; i < islets.length; i++) {
        const isl = islets[i]!;
        const dx = gx - isl.x;
        const dz = gz - isl.z;
        const ang = Math.atan2(dz, dx);
        const wobble = 0.22 * Math.sin(ang * 3 + isl.p1) + 0.14 * Math.cos(ang * 5 + isl.p2);
        const d = Math.hypot(dx, dz) + wobble;
        const norm = d / isl.sandR;
        if (norm < bestNorm) {
          secondNorm = bestNorm;
          bestNorm = norm;
          bestIdx = i;
        } else if (norm < secondNorm) {
          secondNorm = norm;
        }
      }

      if (bestIdx === -1) continue;
      if (secondNorm - bestNorm < 0.2 && bestNorm > 0.6) continue;

      const isl = islets[bestIdx]!;
      const dx = gx - isl.x;
      const dz = gz - isl.z;
      const ang = Math.atan2(dz, dx);
      const wobble = 0.22 * Math.sin(ang * 3 + isl.p1) + 0.14 * Math.cos(ang * 5 + isl.p2);
      const d = Math.hypot(dx, dz) + wobble;

      const tile = tiles[gz]![gx]!;
      if (d < isl.grassR) {
        tile.terrain = "grass";
        tile.elevation = 0.0;
        ownerGrid[gz]![gx] = bestIdx;
      } else if (d < isl.sandR) {
        tile.terrain = "sand";
        tile.elevation = -0.08;
        ownerGrid[gz]![gx] = bestIdx;
      }
    }
  }

  // Ensure main islet has a clean flat 3x3 grass square around its center
  const mainCx = Math.round(islets[0]!.x);
  const mainCz = Math.round(islets[0]!.z);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const gx = mainCx + dx;
      const gz = mainCz + dz;
      if (isInnerTile(gx, gz)) {
        const t = tiles[gz]![gx]!;
        t.terrain = "grass";
        t.elevation = 0.0;
        ownerGrid[gz]![gx] = 0;
      }
    }
  }

  // Guarantee at least a 1-tile ocean strait separating distinct islets
  for (let gz = 1; gz < MAP_SIZE - 1; gz++) {
    for (let gx = 1; gx < MAP_SIZE - 1; gx++) {
      const owner = ownerGrid[gz]![gx]!;
      if (owner <= 0) continue;
      const touchesOther = [-1, 0, 1].some((dz) =>
        [-1, 0, 1].some((dx) => {
          if (dx === 0 && dz === 0) return false;
          const no = ownerGrid[gz + dz]?.[gx + dx] ?? -1;
          return no !== -1 && no !== owner;
        }),
      );
      if (touchesOther) {
        const t = tiles[gz]![gx]!;
        t.terrain = "water";
        t.elevation = -0.45;
        ownerGrid[gz]![gx] = -1;
      }
    }
  }

  const townCenter = findBestTownCenter(tiles, mainCx, mainCz);
  const components = findConnectedComponents(tiles, (t) => t.terrain !== "water");
  const starterBridges: Array<{ gx: number; gz: number; rotation: number }> = [];
  const bridgeCoords = new Set<string>();

  const tcIdx = components.findIndex((c) =>
    c.some((t) => t.gx === townCenter.gx && t.gz === townCenter.gz),
  );
  const connected = new Set<number>(tcIdx >= 0 ? [tcIdx] : [0]);

  while (connected.size < components.length) {
    let bestSpan: Array<{ gx: number; gz: number; rotation: number }> | null = null;
    let bestTargetComp = -1;
    let bestDist = Infinity;

    for (const cIdx of connected) {
      const compA = components[cIdx]!;
      for (let otherIdx = 0; otherIdx < components.length; otherIdx++) {
        if (connected.has(otherIdx)) continue;
        const compB = components[otherIdx]!;

        // Prefer a clean straight cardinal water span (1..5 tiles)
        for (const a of compA) {
          for (const b of compB) {
            if (a.gx !== b.gx && a.gz !== b.gz) continue;
            const steps = Math.abs(a.gx - b.gx) + Math.abs(a.gz - b.gz);
            if (steps < 2 || steps > 6) continue;
            const sx = Math.sign(b.gx - a.gx);
            const sz = Math.sign(b.gz - a.gz);
            let valid = true;
            const span: Array<{ gx: number; gz: number; rotation: number }> = [];
            const rot = sx !== 0 ? 0 : 1;
            for (let k = 1; k < steps; k++) {
              const bx = a.gx + sx * k;
              const bz = a.gz + sz * k;
              const bt = tiles[bz]?.[bx];
              if (!bt || bt.terrain !== "water") {
                valid = false;
                break;
              }
              span.push({ gx: bx, gz: bz, rotation: rot });
            }
            if (valid && steps < bestDist) {
              bestDist = steps;
              bestSpan = span;
              bestTargetComp = otherIdx;
            }
          }
        }
      }
    }

    if (bestSpan && bestTargetComp !== -1) {
      for (const br of bestSpan) {
        const key = `${br.gx},${br.gz}`;
        if (!bridgeCoords.has(key)) {
          bridgeCoords.add(key);
          starterBridges.push(br);
        }
      }
      connected.add(bestTargetComp);
      continue;
    }

    // Fallback: shortest BFS water path from connected components to any disconnected component
    const dist = Array.from({ length: MAP_SIZE }, () => new Int16Array(MAP_SIZE).fill(-1));
    const prev = Array.from({ length: MAP_SIZE }, () => new Int16Array(MAP_SIZE).fill(-1));
    const q: Array<{ gx: number; gz: number }> = [];
    for (const cIdx of connected) {
      for (const t of components[cIdx]!) {
        dist[t.gz]![t.gx] = 0;
        q.push({ gx: t.gx, gz: t.gz });
      }
    }
    const targetTiles = new Map<number, number>();
    for (let otherIdx = 0; otherIdx < components.length; otherIdx++) {
      if (connected.has(otherIdx)) continue;
      for (const t of components[otherIdx]!) {
        targetTiles.set(t.gz * MAP_SIZE + t.gx, otherIdx);
      }
    }
    let foundEnd: { gx: number; gz: number; comp: number } | null = null;
    while (q.length > 0 && !foundEnd) {
      const cur = q.shift()!;
      for (const [dx, dz] of CARDINAL_DIRS) {
        const nx = cur.gx + dx;
        const nz = cur.gz + dz;
        if (!isInnerTile(nx, nz) || dist[nz]![nx] !== -1) continue;
        dist[nz]![nx] = dist[cur.gz]![cur.gx]! + 1;
        prev[nz]![nx] = cur.gz * MAP_SIZE + cur.gx;
        const hitComp = targetTiles.get(nz * MAP_SIZE + nx);
        if (hitComp !== undefined) {
          foundEnd = { gx: nx, gz: nz, comp: hitComp };
          break;
        }
        if (tiles[nz]![nx]!.terrain === "water") {
          q.push({ gx: nx, gz: nz });
        }
      }
    }
    if (!foundEnd) break;

    let k = prev[foundEnd.gz]![foundEnd.gx]!;
    while (k !== -1) {
      const gx = k % MAP_SIZE;
      const gz = (k - gx) / MAP_SIZE;
      if (tiles[gz]![gx]!.terrain === "water") {
        const key = `${gx},${gz}`;
        if (!bridgeCoords.has(key)) {
          bridgeCoords.add(key);
          const hasHoriz =
            tiles[gz]?.[gx - 1]?.terrain !== "water" || tiles[gz]?.[gx + 1]?.terrain !== "water";
          starterBridges.push({ gx, gz, rotation: hasHoriz ? 0 : 1 });
        }
      }
      k = prev[gz]![gx]!;
    }
    connected.add(foundEnd.comp);
  }

  return { townCenter, starterBridges };
}

function generateRiverValley(
  tiles: GeneratedTileData[][],
  rng: () => number,
  sandBoost: number,
): {
  townCenter: { gx: number; gz: number };
  starterBridges: Array<{ gx: number; gz: number; rotation: number }>;
} {
  const center = (MAP_SIZE - 1) / 2;
  const p1 = rng() * Math.PI * 2;
  const p2 = rng() * Math.PI * 2;

  for (let gz = 1; gz < MAP_SIZE - 1; gz++) {
    for (let gx = 1; gx < MAP_SIZE - 1; gx++) {
      const dx = (gx - center) / (MAP_SIZE * 0.48);
      const dz = (gz - center) / (MAP_SIZE * 0.48);
      const ang = Math.atan2(dz, dx);
      const wobble = 0.08 * Math.sin(ang * 3 + p1) + 0.05 * Math.cos(ang * 5 + p2);
      const dist = Math.hypot(dx, dz) + wobble;
      const tile = tiles[gz]![gx]!;
      if (dist < 0.83 - sandBoost * 0.3) {
        tile.terrain = "grass";
        tile.elevation = 0.0;
      } else if (dist < 0.93 + sandBoost * 0.5) {
        tile.terrain = "sand";
        tile.elevation = -0.08;
      }
    }
  }

  // Carve a continuous 4-connected meandering freshwater river from coast to coast
  const verticalFlow = rng() < 0.5;
  const amp1 = 2.4 + rng() * 1.4;
  const amp2 = 0.7 + rng() * 0.6;
  const rp1 = rng() * Math.PI * 2;
  const rp2 = rng() * Math.PI * 2;
  const offset = (rng() - 0.5) * 1.6;

  const carveRiverTile = (gx: number, gz: number) => {
    if (!inBounds(gx, gz)) return;
    const t = tiles[gz]![gx]!;
    t.terrain = "water";
    t.elevation = -0.45;
    t.isRiver = true;
  };

  let prevCross: number | null = null;
  for (let along = 0; along < MAP_SIZE; along++) {
    const tNorm = (along / (MAP_SIZE - 1)) * 2 - 1;
    const rawCross =
      center +
      offset +
      amp1 * Math.sin(tNorm * Math.PI * 1.15 + rp1) +
      amp2 * Math.cos(tNorm * Math.PI * 2.1 + rp2);
    const cross = Math.max(3, Math.min(MAP_SIZE - 4, Math.round(rawCross)));

    if (prevCross === null || cross === prevCross) {
      if (verticalFlow) carveRiverTile(cross, along);
      else carveRiverTile(along, cross);
    } else {
      const step = Math.sign(cross - prevCross);
      for (let c = prevCross; c !== cross + step; c += step) {
        if (verticalFlow) carveRiverTile(c, along);
        else carveRiverTile(along, c);
      }
    }
    prevCross = cross;
  }

  // Pick largest contiguous grass bank for Town Hall
  const grassComponents = findConnectedComponents(tiles, (t) => t.terrain === "grass");
  const mainBank = grassComponents[0] ?? [];
  let sumX = 0;
  let sumZ = 0;
  for (const t of mainBank) {
    sumX += t.gx;
    sumZ += t.gz;
  }
  const avgX = mainBank.length > 0 ? sumX / mainBank.length : center;
  const avgZ = mainBank.length > 0 ? sumZ / mainBank.length : center;
  const townCenter = findBestTownCenter(tiles, avgX, avgZ, true);

  // Label land components so starter bridges prioritize connecting distinct valley banks
  const landComponents = findConnectedComponents(tiles, (t) => t.terrain !== "water");
  const landCompId = new Int16Array(MAP_SIZE * MAP_SIZE).fill(-1);
  landComponents.forEach((comp, id) => {
    for (const t of comp) {
      landCompId[t.gz * MAP_SIZE + t.gx] = id;
    }
  });

  // Pick 1-2 clean 1-tile river crossings with grass/sand on both opposite banks
  const candidates: Array<{ gx: number; gz: number; rotation: number; score: number }> = [];
  for (let gz = 3; gz < MAP_SIZE - 3; gz++) {
    for (let gx = 3; gx < MAP_SIZE - 3; gx++) {
      const t = tiles[gz]![gx]!;
      if (!t.isRiver) continue;
      const west = tiles[gz]![gx - 1]!;
      const east = tiles[gz]![gx + 1]!;
      const north = tiles[gz - 1]![gx]!;
      const south = tiles[gz + 1]![gx]!;

      const canHoriz = west.terrain !== "water" && east.terrain !== "water";
      const canVert = north.terrain !== "water" && south.terrain !== "water";
      if (!canHoriz && !canVert) continue;

      const rotation = canHoriz ? 0 : 1;
      const compA = canHoriz
        ? landCompId[gz * MAP_SIZE + (gx - 1)]!
        : landCompId[(gz - 1) * MAP_SIZE + gx]!;
      const compB = canHoriz
        ? landCompId[gz * MAP_SIZE + (gx + 1)]!
        : landCompId[(gz + 1) * MAP_SIZE + gx]!;
      const connectsDifferentBanks = compA !== -1 && compB !== -1 && compA !== compB;
      const bankPenalty = connectsDifferentBanks ? 0 : 100;
      const grassBonus = canHoriz
        ? (west.terrain === "grass" ? 0 : 2) + (east.terrain === "grass" ? 0 : 2)
        : (north.terrain === "grass" ? 0 : 2) + (south.terrain === "grass" ? 0 : 2);
      const distPenalty = Math.hypot(gx - townCenter.gx, gz - townCenter.gz);
      candidates.push({ gx, gz, rotation, score: bankPenalty + distPenalty + grassBonus });
    }
  }

  candidates.sort((a, b) => a.score - b.score);
  const starterBridges: Array<{ gx: number; gz: number; rotation: number }> = [];
  for (const c of candidates) {
    if (
      starterBridges.every((b) => Math.hypot(b.gx - c.gx, b.gz - c.gz) >= 6.5) &&
      starterBridges.length < 2
    ) {
      starterBridges.push({ gx: c.gx, gz: c.gz, rotation: c.rotation });
    }
  }

  return { townCenter, starterBridges };
}

function getStepRotationToward(dx: number, dz: number): number {
  if (dz === -1) return 0;
  if (dx === -1) return 1;
  if (dz === 1) return 2;
  return 3;
}

function generateHighlandTerrace(
  tiles: GeneratedTileData[][],
  rng: () => number,
  sandBoost: number,
): { gx: number; gz: number } {
  const center = (MAP_SIZE - 1) / 2;
  const p1 = rng() * Math.PI * 2;
  const p2 = rng() * Math.PI * 2;

  // Base coastal island
  for (let gz = 1; gz < MAP_SIZE - 1; gz++) {
    for (let gx = 1; gx < MAP_SIZE - 1; gx++) {
      const dx = (gx - center) / (MAP_SIZE * 0.48);
      const dz = (gz - center) / (MAP_SIZE * 0.48);
      const ang = Math.atan2(dz, dx);
      const wobble = 0.08 * Math.sin(ang * 3 + p1) + 0.05 * Math.cos(ang * 4 + p2);
      const dist = Math.hypot(dx, dz) + wobble;
      const tile = tiles[gz]![gx]!;
      if (dist < 0.84 - sandBoost * 0.3) {
        tile.terrain = "grass";
        tile.elevation = 0.0;
      } else if (dist < 0.94 + sandBoost * 0.5) {
        tile.terrain = "sand";
        tile.elevation = -0.08;
      }
    }
  }

  // Generate 2 mid-terrace lobes and 1 summit plateau
  const hillAngle = rng() * Math.PI * 2;
  const lobe1 = {
    x: center + Math.cos(hillAngle) * 2.4,
    z: center + Math.sin(hillAngle) * 2.4,
    r: 4.9 + rng() * 0.9,
  };
  const lobe2 = {
    x: center - Math.cos(hillAngle + 0.5) * 3.1,
    z: center - Math.sin(hillAngle + 0.5) * 3.1,
    r: 3.9 + rng() * 0.8,
  };
  const summit = {
    x: lobe1.x + (rng() - 0.5) * 1.2,
    z: lobe1.z + (rng() - 0.5) * 1.2,
    r: 2.7 + rng() * 0.5,
  };
  const hp = rng() * Math.PI * 2;

  for (let gz = 2; gz < MAP_SIZE - 2; gz++) {
    for (let gx = 2; gx < MAP_SIZE - 2; gx++) {
      const tile = tiles[gz]![gx]!;
      if (tile.terrain !== "grass") continue;

      // Never raise tiles directly bordering sand or water so coast has a clean lowland ring
      const bordersCoast = CARDINAL_DIRS.some(([dx, dz]) => {
        const n = tiles[gz + dz]?.[gx + dx];
        return !n || n.terrain === "water" || n.terrain === "sand";
      });
      if (bordersCoast) continue;

      const wobble = 0.55 * Math.sin(gx * 0.55 + hp) * Math.cos(gz * 0.55 - hp);
      const d1 = Math.hypot(gx - lobe1.x, gz - lobe1.z) + wobble;
      const d2 = Math.hypot(gx - lobe2.x, gz - lobe2.z) - wobble * 0.6;
      const ds = Math.hypot(gx - summit.x, gz - summit.z) + wobble * 0.45;

      if (ds < summit.r) {
        tile.elevation = 0.9;
      } else if (d1 < lobe1.r || d2 < lobe2.r) {
        tile.elevation = 0.45;
      }
    }
  }

  // Smooth cliffs so tier 0.90 never borders tier 0.00 directly
  for (let gz = 1; gz < MAP_SIZE - 1; gz++) {
    for (let gx = 1; gx < MAP_SIZE - 1; gx++) {
      const tile = tiles[gz]![gx]!;
      if (tile.elevation < 0.8) continue;
      const touchesLow = CARDINAL_DIRS.some(([dx, dz]) => {
        const n = tiles[gz + dz]?.[gx + dx];
        return !n || n.elevation < 0.25;
      });
      if (touchesLow) {
        tile.elevation = 0.45;
      }
    }
  }

  // Pick a flat 3x3 lowland or mid-terrace plaza for Town Hall
  const townCenter = findBestTownCenter(
    tiles,
    center - Math.cos(hillAngle) * 3.5,
    center - Math.sin(hillAngle) * 3.5,
  );

  const inTownPlaza = (gx: number, gz: number): boolean =>
    Math.abs(gx - townCenter.gx) <= 1 && Math.abs(gz - townCenter.gz) <= 1;

  // Place scenic stone steps along tier transitions (0.0 -> 0.45 and 0.45 -> 0.90)
  const placedSteps: GeneratedTileData[] = [];

  const placeStep = (lowerTile: GeneratedTileData, upperDirDx: number, upperDirDz: number) => {
    lowerTile.hasSteps = true;
    lowerTile.terrain = "path";
    lowerTile.stepRotation = getStepRotationToward(upperDirDx, upperDirDz);
    placedSteps.push(lowerTile);
  };

  for (const [lowElev, highElev, maxCount] of [
    [0.0, 0.45, 3],
    [0.45, 0.9, 2],
  ] as const) {
    const candidates: Array<{ tile: GeneratedTileData; dx: number; dz: number; score: number }> =
      [];
    for (let gz = 2; gz < MAP_SIZE - 2; gz++) {
      for (let gx = 2; gx < MAP_SIZE - 2; gx++) {
        const t = tiles[gz]![gx]!;
        if (t.terrain !== "grass" || inTownPlaza(gx, gz) || t.hasSteps) continue;
        if (Math.abs(t.elevation - lowElev) > 0.05) continue;

        let highDir: [number, number] | null = null;
        let highCount = 0;
        let lowNeighbors = 0;
        for (const [dx, dz] of CARDINAL_DIRS) {
          const n = tiles[gz + dz]?.[gx + dx];
          if (!n || n.terrain !== "grass") continue;
          if (Math.abs(n.elevation - highElev) < 0.05) {
            highDir = [dx, dz];
            highCount++;
          } else if (Math.abs(n.elevation - lowElev) < 0.05) {
            lowNeighbors++;
          }
        }
        // Clean staircase spot: rises directly into one upper tile and has approach room below
        if (highCount === 1 && highDir && lowNeighbors >= 1) {
          const backTile = tiles[gz - highDir[1]]?.[gx - highDir[0]];
          const hasStraightApproach =
            backTile &&
            backTile.terrain === "grass" &&
            Math.abs(backTile.elevation - lowElev) < 0.05;
          const distToTc = Math.hypot(gx - townCenter.gx, gz - townCenter.gz);
          candidates.push({
            tile: t,
            dx: highDir[0],
            dz: highDir[1],
            score: (hasStraightApproach ? 0 : 8) + distToTc,
          });
        }
      }
    }
    candidates.sort((a, b) => a.score - b.score);
    let added = 0;
    for (const c of candidates) {
      if (added >= maxCount) break;
      if (placedSteps.some((s) => Math.hypot(s.gx - c.tile.gx, s.gz - c.tile.gz) < 3.6)) {
        continue;
      }
      placeStep(c.tile, c.dx, c.dz);
      added++;
    }
  }

  // Verify 100% reachability of all grass tiles from townCenter via BFS; repair any isolated plateau
  for (let pass = 0; pass < 16; pass++) {
    const visited = Array.from({ length: MAP_SIZE }, () => new Uint8Array(MAP_SIZE));
    const q: Array<{ gx: number; gz: number }> = [{ gx: townCenter.gx, gz: townCenter.gz }];
    visited[townCenter.gz]![townCenter.gx] = 1;

    while (q.length > 0) {
      const cur = q.shift()!;
      const curTile = tiles[cur.gz]![cur.gx]!;
      for (const [dx, dz] of CARDINAL_DIRS) {
        const nx = cur.gx + dx;
        const nz = cur.gz + dz;
        if (!inBounds(nx, nz) || visited[nz]![nx] === 1) continue;
        const nt = tiles[nz]![nx]!;
        if (nt.terrain === "water") continue;
        const elevDiff = Math.abs(nt.elevation - curTile.elevation);
        if (elevDiff <= 0.25 || (elevDiff <= 0.55 && (curTile.hasSteps || nt.hasSteps))) {
          visited[nz]![nx] = 1;
          q.push({ gx: nx, gz: nz });
        }
      }
    }

    // Check if any grass tile is unvisited
    let frontier: { low: GeneratedTileData; dx: number; dz: number } | null = null;
    for (let gz = 1; gz < MAP_SIZE - 1 && !frontier; gz++) {
      for (let gx = 1; gx < MAP_SIZE - 1 && !frontier; gx++) {
        const t = tiles[gz]![gx]!;
        if (t.terrain !== "grass" || visited[gz]![gx] === 1) continue;
        // Look for an adjacent visited non-water tile that differs by <= 0.55
        for (const [dx, dz] of CARDINAL_DIRS) {
          const nx = gx + dx;
          const nz = gz + dz;
          const n = tiles[nz]?.[nx];
          if (!n || n.terrain === "water" || visited[nz]![nx] !== 1) continue;
          const elevDiff = Math.abs(n.elevation - t.elevation);
          if (elevDiff <= 0.55) {
            if (n.elevation < t.elevation) {
              frontier = { low: n, dx: -dx, dz: -dz };
            } else {
              frontier = { low: t, dx, dz };
            }
            break;
          }
        }
      }
    }

    if (!frontier) break;
    placeStep(frontier.low, frontier.dx, frontier.dz);
  }

  return townCenter;
}

export function generateIslandLayout(rawConfig: IslandConfig): IslandGenerationResult {
  const config: IslandConfig = {
    seed: normalizeSeed(rawConfig.seed),
    archetype: rawConfig.archetype,
    biome: rawConfig.biome,
  };

  const rng = createRng(`${config.seed}|${config.archetype}|${config.biome}`);
  const biomeSpec = BIOME_SPECS[config.biome];
  const tiles = createEmptyGrid();

  let townCenter: { gx: number; gz: number };
  let starterBridges: Array<{ gx: number; gz: number; rotation: number }> = [];

  if (config.archetype === "archipelago") {
    const res = generateArchipelago(tiles, rng, biomeSpec.sandThresholdBoost);
    townCenter = res.townCenter;
    starterBridges = res.starterBridges;
  } else if (config.archetype === "river_valley") {
    const res = generateRiverValley(tiles, rng, biomeSpec.sandThresholdBoost);
    townCenter = res.townCenter;
    starterBridges = res.starterBridges;
  } else if (config.archetype === "highland_terrace") {
    townCenter = generateHighlandTerrace(tiles, rng, biomeSpec.sandThresholdBoost);
  } else {
    townCenter = generateClassicCove(tiles, rng, biomeSpec.sandThresholdBoost);
  }

  const tcTile = tiles[townCenter.gz]?.[townCenter.gx];
  const tcElev = tcTile?.elevation ?? 0;

  // Pick 3 adjacent/nearby grass tiles for starter farmfields (outside 3x3 town plaza)
  const starterFarms: Array<{ gx: number; gz: number }> = [];
  const farmOffsets: readonly [number, number][] = [
    [-2, 1],
    [-2, 2],
    [-3, 1],
    [2, 1],
    [2, 2],
    [1, 2],
    [-1, 2],
    [-2, 0],
    [2, 0],
    [0, 2],
    [0, -2],
    [-2, -1],
  ];
  for (const [dx, dz] of farmOffsets) {
    if (starterFarms.length >= 3) break;
    const gx = townCenter.gx + dx;
    const gz = townCenter.gz + dz;
    const t = tiles[gz]?.[gx];
    if (t && t.terrain === "grass" && !t.hasSteps && Math.abs(t.elevation - tcElev) <= 0.05) {
      starterFarms.push({ gx, gz });
    }
  }

  const farmSet = new Set(starterFarms.map((f) => `${f.gx},${f.gz}`));
  const bridgeNeighborSet = new Set<string>();
  for (const br of starterBridges) {
    for (const [dx, dz] of CARDINAL_DIRS) {
      bridgeNeighborSet.add(`${br.gx + dx},${br.gz + dz}`);
    }
  }

  // Populate forests, rocks & wildflower meadows per biome rules
  const phaseX = rng() * 6.28;
  const phaseZ = rng() * 6.28;

  for (let gz = 0; gz < MAP_SIZE; gz++) {
    for (let gx = 0; gx < MAP_SIZE; gx++) {
      const tile = tiles[gz]![gx]!;
      if (tile.terrain !== "grass" || tile.hasSteps) continue;

      const key = `${gx},${gz}`;
      if (farmSet.has(key) || bridgeNeighborSet.has(key)) continue;

      const inTownPlaza = Math.abs(gx - townCenter.gx) <= 1 && Math.abs(gz - townCenter.gz) <= 1;
      if (inTownPlaza) continue; // Keep Town Hall plaza clear

      const distFromTown = Math.hypot(gx - townCenter.gx, gz - townCenter.gz);
      const minClearDist = config.archetype === "archipelago" ? 2.1 : 3.0;
      const minTreeDist = config.archetype === "archipelago" ? 2.3 : 3.8;
      if (distFromTown < minClearDist) continue;

      const r = rng();
      const cluster = Math.sin(gx * 0.45 + phaseX) * Math.cos(gz * 0.45 + phaseZ);
      const treeChance =
        distFromTown > minTreeDist - 0.2
          ? cluster > 0.28
            ? biomeSpec.treeDensity + 0.22
            : biomeSpec.treeDensity
          : 0;

      if (distFromTown > minTreeDist && r < treeChance) {
        tile.prop = rng() < biomeSpec.oakRatio ? "tree_oak" : "tree_pine";
      } else if (distFromTown > minTreeDist + 0.6 && r > 1.0 - biomeSpec.rockDensity) {
        tile.prop = "rock";
      } else if (r > 0.62 && r <= 0.62 + biomeSpec.meadowDensity) {
        tile.terrain = "meadow";
      }
    }
  }

  return {
    config,
    tiles,
    townCenter,
    starterBridges,
    starterFarms,
  };
}
