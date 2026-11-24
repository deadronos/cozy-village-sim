import { MAP_SIZE, type GridTile } from "./types.ts";
import type { IslandWorld } from "./world.ts";

export interface GridCoord {
  gx: number;
  gz: number;
}

export interface WorldWaypoint {
  x: number;
  z: number;
}

export interface PathOptions {
  /**
   * When true, stop on an adjacent walkable tile next to the goal (e.g. approaching a building
   * or chopping a tree) rather than walking onto the goal tile itself.
   */
  goalAdjacent?: boolean;
  /**
   * Allow stepping onto the goal tile even if it has a building (e.g. fisherman walking onto dock).
   */
  allowGoalBuilding?: boolean;
}

/**
 * Lowest possible per-tile traversal cost (Cobble Paths / Bridges).
 * Used to keep the A* octile heuristic admissible.
 */
export const MIN_TILE_COST = 0.4;

const DIRS: readonly [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/**
 * Returns the traversal cost multiplier for a grid tile, or `Infinity` if impassable.
 * Cobble Paths (and future Bridges) are strongly preferred so villagers naturally follow roads.
 */
export function getTileMoveCost(
  tile: GridTile | null,
  isStart: boolean,
  isGoal: boolean,
  allowGoalBuilding: boolean,
): number {
  if (!tile) return Infinity;

  // Water is impassable unless a bridge or dock occupies it
  const terrainName = tile.terrain as string;
  if (terrainName === "bridge") {
    return MIN_TILE_COST;
  }
  if (tile.terrain === "water") {
    return Infinity;
  }

  // Buildings block movement except when exiting the start tile or explicitly entering the goal
  if (tile.buildingId !== null && !isStart && !(isGoal && allowGoalBuilding)) {
    return Infinity;
  }

  let cost: number;
  switch (tile.terrain) {
    case "path":
      cost = MIN_TILE_COST; // Strongly preferred cobble road
      break;
    case "grass":
      cost = 1.0;
      break;
    case "meadow":
      cost = 1.05;
      break;
    case "sand":
      cost = 1.15;
      break;
    case "farm":
      cost = 1.35; // Mildly avoid trampling crops unless heading there
      break;
    default:
      cost = 1.0;
  }

  // Villagers weave around dense trees and boulders when walking through forests
  if (tile.prop === "tree_pine" || tile.prop === "tree_oak" || tile.prop === "rock") {
    cost += 0.65;
  }

  return cost;
}

function octileHeuristic(ax: number, az: number, bx: number, bz: number): number {
  const dx = Math.abs(ax - bx);
  const dz = Math.abs(az - bz);
  const diag = Math.min(dx, dz);
  const straight = dx + dz - 2 * diag;
  return (diag * Math.SQRT2 + straight) * MIN_TILE_COST;
}

function coordKey(gx: number, gz: number): number {
  return gz * MAP_SIZE + gx;
}

/**
 * Computes an optimal A* grid path from `(startGx, startGz)` to `(goalGx, goalGz)`.
 * Returns an array of grid coordinates (excluding the start tile) or `null` if unreachable.
 */
export function findGridPath(
  world: IslandWorld,
  startGx: number,
  startGz: number,
  goalGx: number,
  goalGz: number,
  options: PathOptions = {},
): GridCoord[] | null {
  const { goalAdjacent = false, allowGoalBuilding = false } = options;

  if (
    startGx < 0 ||
    startGx >= MAP_SIZE ||
    startGz < 0 ||
    startGz >= MAP_SIZE ||
    goalGx < 0 ||
    goalGx >= MAP_SIZE ||
    goalGz < 0 ||
    goalGz >= MAP_SIZE
  ) {
    return null;
  }

  const isGoalReached = (gx: number, gz: number): boolean => {
    if (goalAdjacent) {
      const dx = Math.abs(gx - goalGx);
      const dz = Math.abs(gz - goalGz);
      // Any cardinal or diagonal neighbor next to the goal (and not the goal building itself)
      if (dx <= 1 && dz <= 1 && !(dx === 0 && dz === 0)) {
        const t = world.getTile(gx, gz);
        return t !== null && t.terrain !== "water" && t.buildingId === null;
      }
      return false;
    }
    return gx === goalGx && gz === goalGz;
  };

  if (isGoalReached(startGx, startGz)) {
    return [];
  }

  const totalCells = MAP_SIZE * MAP_SIZE;
  const gScore = new Float64Array(totalCells);
  gScore.fill(Infinity);
  const fScore = new Float64Array(totalCells);
  fScore.fill(Infinity);
  const cameFrom = new Int32Array(totalCells);
  cameFrom.fill(-1);
  const closed = new Uint8Array(totalCells);
  const inOpen = new Uint8Array(totalCells);

  const startKey = coordKey(startGx, startGz);
  gScore[startKey] = 0;
  fScore[startKey] = octileHeuristic(startGx, startGz, goalGx, goalGz);

  // Small binary min-heap over grid cell keys (max 576 cells on 24x24 map)
  const openHeap: number[] = [startKey];
  inOpen[startKey] = 1;

  const heapPush = (key: number): void => {
    openHeap.push(key);
    let idx = openHeap.length - 1;
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      const pKey = openHeap[parent]!;
      if (fScore[key]! < fScore[pKey]!) {
        openHeap[idx] = pKey;
        openHeap[parent] = key;
        idx = parent;
      } else {
        break;
      }
    }
  };

  const heapPop = (): number => {
    const top = openHeap[0]!;
    const last = openHeap.pop()!;
    if (openHeap.length > 0) {
      openHeap[0] = last;
      let idx = 0;
      const len = openHeap.length;
      while (true) {
        const left = idx * 2 + 1;
        const right = left + 1;
        let smallest = idx;
        if (left < len && fScore[openHeap[left]!]! < fScore[openHeap[smallest]!]!) {
          smallest = left;
        }
        if (right < len && fScore[openHeap[right]!]! < fScore[openHeap[smallest]!]!) {
          smallest = right;
        }
        if (smallest !== idx) {
          const tmp = openHeap[idx]!;
          openHeap[idx] = openHeap[smallest]!;
          openHeap[smallest] = tmp;
          idx = smallest;
        } else {
          break;
        }
      }
    }
    return top;
  };

  while (openHeap.length > 0) {
    const currKey = heapPop();
    if (closed[currKey] === 1) continue;
    closed[currKey] = 1;

    const cx = currKey % MAP_SIZE;
    const cz = (currKey - cx) / MAP_SIZE;

    if (isGoalReached(cx, cz)) {
      const path: GridCoord[] = [];
      let k = currKey;
      while (k !== -1 && k !== startKey) {
        const gx = k % MAP_SIZE;
        const gz = (k - gx) / MAP_SIZE;
        path.push({ gx, gz });
        k = cameFrom[k]!;
      }
      path.reverse();
      return path;
    }

    const currG = gScore[currKey]!;

    for (const [dx, dz, stepDist] of DIRS) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nx >= MAP_SIZE || nz < 0 || nz >= MAP_SIZE) continue;

      const nKey = coordKey(nx, nz);
      if (closed[nKey] === 1) continue;

      const isGoalTile = nx === goalGx && nz === goalGz;
      const neighborTile = world.getTile(nx, nz);
      const moveCost = getTileMoveCost(neighborTile, false, isGoalTile, allowGoalBuilding);
      if (!Number.isFinite(moveCost)) continue;

      // Prevent diagonal corner-cutting past buildings or water
      if (dx !== 0 && dz !== 0) {
        const orthoA = world.getTile(cx + dx, cz);
        const orthoB = world.getTile(cx, cz + dz);
        const costA = getTileMoveCost(
          orthoA,
          cx + dx === startGx && cz === startGz,
          cx + dx === goalGx && cz === goalGz,
          allowGoalBuilding,
        );
        const costB = getTileMoveCost(
          orthoB,
          cx === startGx && cz + dz === startGz,
          cx === goalGx && cz + dz === goalGz,
          allowGoalBuilding,
        );
        if (!Number.isFinite(costA) || !Number.isFinite(costB)) continue;
      }

      const tentativeG = currG + moveCost * stepDist;
      if (tentativeG < gScore[nKey]!) {
        cameFrom[nKey] = currKey;
        gScore[nKey] = tentativeG;
        fScore[nKey] = tentativeG + octileHeuristic(nx, nz, goalGx, goalGz);
        heapPush(nKey);
        inOpen[nKey] = 1;
      }
    }
  }

  return null;
}

/**
 * Converts a grid path into world-space waypoints for smooth villager navigation.
 */
export function gridPathToWorldWaypoints(
  world: IslandWorld,
  gridPath: GridCoord[],
  finalOffset?: { x: number; z: number },
): WorldWaypoint[] {
  const waypoints = gridPath.map(({ gx, gz }) => {
    const pos = world.gridToWorld(gx, gz);
    return { x: pos.x, z: pos.z };
  });

  if (finalOffset && waypoints.length > 0) {
    const last = waypoints[waypoints.length - 1]!;
    last.x += finalOffset.x;
    last.z += finalOffset.z;
  }

  return waypoints;
}
