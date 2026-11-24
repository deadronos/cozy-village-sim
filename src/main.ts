import * as THREE from "three";
import { AssetLibrary } from "./game/assets.ts";
import { CozyAudio } from "./game/audio.ts";
import { createRendererContext } from "./game/renderer.ts";
import { VillageSimulation } from "./game/simulation.ts";
import { decodeShareHash, loadAutosave, saveAutosave } from "./game/storage.ts";
import { TILE_SIZE, type BuildingKind, type ToolMode } from "./game/types.ts";
import { CozyHud } from "./game/ui.ts";
import { IslandWorld } from "./game/world.ts";

async function bootstrap(): Promise<void> {
  const canvas = document.getElementById("game-canvas") as HTMLCanvasElement | null;
  const hudEl = document.getElementById("hud");
  const floatingLayer = document.getElementById("floating-layer");
  if (!canvas || !hudEl || !floatingLayer) {
    throw new Error("Missing required DOM elements");
  }

  const ctx = await createRendererContext(canvas);
  const assets = new AssetLibrary();
  await assets.loadAll();

  const audio = new CozyAudio();
  const world = new IslandWorld(ctx.scene, assets);
  const sim = new VillageSimulation(ctx.scene, world, assets, audio, floatingLayer);

  let activeTool: ToolMode = { category: "select" };
  let buildRotation = 0;
  let isPointerDown = false;
  let lastPaintedKey = "";
  const pressedKeys = new Set<string>();

  // Hover tile outline & translucent 3D placement ghost
  const hoverRing = new THREE.Mesh(
    new THREE.RingGeometry(TILE_SIZE * 0.42, TILE_SIZE * 0.5, 4),
    new THREE.MeshBasicMaterial({
      color: 0xffe484,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    }),
  );
  hoverRing.rotation.x = -Math.PI / 2;
  hoverRing.rotation.z = Math.PI / 4;
  hoverRing.position.y = 0.06;
  hoverRing.visible = false;
  ctx.scene.add(hoverRing);

  let ghostMesh: THREE.Group | null = null;
  let ghostKind: BuildingKind | null = null;

  const setGhostBuilding = (kind: BuildingKind | null) => {
    if (ghostMesh) {
      ctx.scene.remove(ghostMesh);
      ghostMesh = null;
      ghostKind = null;
    }
    if (!kind) return;
    ghostKind = kind;
    const clone = assets.clone(kind);
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = false;
        child.receiveShadow = false;
        const m = (child.material as THREE.MeshStandardMaterial).clone();
        m.transparent = true;
        m.opacity = 0.58;
        child.material = m;
      }
    });
    clone.visible = false;
    ctx.scene.add(clone);
    ghostMesh = clone;
  };

  const tintGhost = (valid: boolean) => {
    if (!ghostMesh) return;
    const tint = valid ? 0x6de384 : 0xf06b5d;
    ghostMesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const m = child.material as THREE.MeshStandardMaterial;
        m.emissive.setHex(tint);
        m.emissiveIntensity = 0.45;
      }
    });
  };

  const hud = new CozyHud(hudEl, sim, audio, ctx.backend, {
    onToolChange(tool) {
      activeTool = tool;
      setGhostBuilding(tool.category === "build" ? tool.building : null);
    },
    onTimeOfDayChange(tod) {
      sim.setTimeOfDay(tod);
    },
    onSeasonChange(season) {
      sim.setSeason(season);
    },
    onFocusPosition(x, z) {
      const offset = ctx.camera.position.clone().sub(ctx.controls.target);
      ctx.controls.target.set(x, 0, z);
      ctx.camera.position.copy(ctx.controls.target).add(offset);
    },
  });

  sim.onAtmosphereChanged = (tod, season) => {
    ctx.setAtmosphere(tod, season);
  };

  sim.onStateChanged = () => {
    if (!hud.isModalOpen) hud.render();
  };

  // Restore shared village link (#village=...) or local autosave on startup
  const shared = decodeShareHash(window.location.hash);
  if (shared && shared.ok) {
    sim.loadSaveData(shared.data);
    window.history.replaceState(null, "", window.location.pathname);
  } else {
    const autosaved = loadAutosave();
    if (autosaved) {
      sim.loadSaveData(autosaved);
    }
  }
  ctx.setAtmosphere(sim.timeOfDay, sim.season);
  hud.render();

  // Periodic subtle HUD refresh & localStorage auto-save
  let uiRefreshTimer = 0;
  let autosaveTimer = 0;

  // Raycasting
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.18);
  const waterHit = new THREE.Vector3();
  let hoveredTile: { gx: number; gz: number } | null = null;

  const updatePointer = (ev: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  };

  const raycastTile = (): { gx: number; gz: number } | null => {
    raycaster.setFromCamera(pointer, ctx.camera);
    const hits = raycaster.intersectObjects(world.groundPickables, false);
    const first = hits[0];
    if (first) {
      const data = first.object.userData as { gx?: number; gz?: number };
      if (typeof data.gx === "number" && typeof data.gz === "number") {
        return { gx: data.gx, gz: data.gz };
      }
    }
    // Fallback to water plane so players can place, inspect, or demolish Wooden Bridges over water
    if (raycaster.ray.intersectPlane(waterPlane, waterHit)) {
      return world.worldToGrid(waterHit.x, waterHit.z);
    }
    return null;
  };

  const updateHoverVisuals = () => {
    if (!hoveredTile) {
      hoverRing.visible = false;
      if (ghostMesh) ghostMesh.visible = false;
      return;
    }

    const tile = world.getTile(hoveredTile.gx, hoveredTile.gz);
    if (!tile) return;
    const pos = world.gridToWorld(hoveredTile.gx, hoveredTile.gz);
    const hoverY = tile.terrain === "water" ? -0.12 : tile.elevation + 0.06;
    hoverRing.position.set(pos.x, hoverY, pos.z);
    hoverRing.visible = true;

    const ringMat = hoverRing.material as THREE.MeshBasicMaterial;
    if (activeTool.category === "build" && ghostMesh && ghostKind) {
      const check = sim.canPlaceBuilding(ghostKind, hoveredTile.gx, hoveredTile.gz);
      const rot =
        ghostKind === "fishing_dock"
          ? world.getWaterFacingRotation(hoveredTile.gx, hoveredTile.gz)
          : buildRotation;
      const ghostY = ghostKind === "bridge" ? -0.2 : tile.elevation;
      ghostMesh.position.set(pos.x, ghostY, pos.z);
      ghostMesh.rotation.y = rot * (Math.PI / 2);
      ghostMesh.visible = true;
      tintGhost(check.ok);
      ringMat.color.setHex(check.ok ? 0x7be88b : 0xf06b5d);
    } else if (activeTool.category === "demolish") {
      ringMat.color.setHex(0xf06b5d);
    } else {
      ringMat.color.setHex(0xffe484);
    }
  };

  const applyToolAtHovered = () => {
    if (!hoveredTile) return;
    const { gx, gz } = hoveredTile;
    const key = `${gx},${gz}`;

    if (activeTool.category === "build") {
      sim.placeBuilding(activeTool.building, gx, gz, buildRotation);
      updateHoverVisuals();
      return;
    }

    if (activeTool.category === "paint") {
      if (lastPaintedKey === key) return;
      lastPaintedKey = key;
      sim.paintAt(gx, gz, activeTool.paint);
      return;
    }

    if (activeTool.category === "demolish") {
      if (lastPaintedKey === key) return;
      lastPaintedKey = key;
      sim.demolishAt(gx, gz);
      return;
    }

    // Select mode: inspect building or villager on clicked tile
    const tile = world.getTile(gx, gz);
    if (tile?.buildingId) {
      sim.selectedBuildingId = tile.buildingId;
      sim.selectedVillagerId = null;
      hud.render();
      return;
    }

    const pos = world.gridToWorld(gx, gz);
    const nearestVillager = sim.villagers.find((v) => Math.hypot(v.x - pos.x, v.z - pos.z) < 1.3);
    if (nearestVillager) {
      sim.selectedVillagerId = nearestVillager.id;
      sim.selectedBuildingId = null;
      hud.render();
      return;
    }

    sim.selectedBuildingId = null;
    sim.selectedVillagerId = null;
    hud.render();
  };

  canvas.addEventListener("pointermove", (ev) => {
    updatePointer(ev);
    hoveredTile = raycastTile();
    updateHoverVisuals();
    if (isPointerDown && (activeTool.category === "paint" || activeTool.category === "demolish")) {
      applyToolAtHovered();
    }
  });

  canvas.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0) return; // Left-click only (right-click orbits)
    isPointerDown = true;
    lastPaintedKey = "";
    updatePointer(ev);
    hoveredTile = raycastTile();
    applyToolAtHovered();
  });

  window.addEventListener("pointerup", () => {
    isPointerDown = false;
    lastPaintedKey = "";
  });

  window.addEventListener("keydown", (ev) => {
    pressedKeys.add(ev.code);
    if (ev.code === "KeyR" && activeTool.category === "build") {
      buildRotation = (buildRotation + 1) % 4;
      updateHoverVisuals();
    } else if (ev.code === "Escape") {
      if (hud.isModalOpen) {
        hud.closeModal();
        return;
      }
      hud.setTool({ category: "select" });
      sim.selectedBuildingId = null;
      sim.selectedVillagerId = null;
      hud.render();
    }
  });

  window.addEventListener("keyup", (ev) => {
    pressedKeys.delete(ev.code);
  });

  // Main animation loop
  let lastTime = performance.now();
  const startTime = lastTime;

  const tick = (now: number) => {
    requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    const elapsed = (now - startTime) / 1000;

    ctx.updateKeyboardPan(dt, pressedKeys);
    ctx.controls.update();
    world.updateWater(elapsed);
    sim.update(dt, elapsed, ctx.camera);

    uiRefreshTimer += dt;
    if (uiRefreshTimer >= 1.2) {
      uiRefreshTimer = 0;
      if (
        !hud.isModalOpen &&
        (sim.selectedBuildingId || sim.selectedVillagerId || sim.villagers.length > 0)
      ) {
        hud.render();
      }
    }

    autosaveTimer += dt;
    if (autosaveTimer >= 20) {
      autosaveTimer = 0;
      saveAutosave(sim.exportSaveData());
    }

    ctx.renderer.render(ctx.scene, ctx.camera);
  };

  requestAnimationFrame(tick);
}

void bootstrap();
