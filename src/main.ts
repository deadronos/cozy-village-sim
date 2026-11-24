import * as THREE from "three";
import { AssetLibrary } from "./game/assets.ts";
import { CozyAudio } from "./game/audio.ts";
import { CloudSystem } from "./game/clouds.ts";
import { compositePostcardCanvas, downloadPostcardPng } from "./game/postcard.ts";
import { createRendererContext } from "./game/renderer.ts";
import { VillageSimulation } from "./game/simulation.ts";
import { decodeSeedHash, decodeShareHash, loadAutosave, saveAutosave } from "./game/storage.ts";
import { TILE_SIZE, type BuildingKind, type ToolMode } from "./game/types.ts";
import { CozyHud } from "./game/ui.ts";
import { IslandWorld } from "./game/world.ts";

async function bootstrap(): Promise<void> {
  const appEl = document.getElementById("app");
  const canvas = document.getElementById("game-canvas") as HTMLCanvasElement | null;
  const vignetteEl = document.getElementById("photo-vignette");
  const hudEl = document.getElementById("hud");
  const floatingLayer = document.getElementById("floating-layer");
  if (!appEl || !canvas || !hudEl || !floatingLayer) {
    throw new Error("Missing required DOM elements");
  }

  const ctx = await createRendererContext(canvas);
  const assets = new AssetLibrary();
  await assets.loadAll();

  const audio = new CozyAudio();
  const world = new IslandWorld(ctx.scene, assets, ctx.supportsTSL);
  const clouds = new CloudSystem(ctx.scene);
  const sim = new VillageSimulation(ctx.scene, world, assets, audio, floatingLayer);

  let activeTool: ToolMode = { category: "select" };
  let buildRotation = 0;
  let isPointerDown = false;
  let lastPaintedKey = "";
  const pressedKeys = new Set<string>();

  const focusPosition = (x: number, y: number, z: number) => {
    const offset = ctx.camera.position.clone().sub(ctx.controls.target);
    ctx.controls.target.set(x, y, z);
    ctx.camera.position.copy(ctx.controls.target).add(offset);
  };

  const focusTownCenter = () => {
    const tc = world.layout.townCenter;
    const pos = world.gridToWorld(tc.gx, tc.gz);
    const elev = world.getTile(tc.gx, tc.gz)?.elevation ?? 0;
    focusPosition(pos.x, elev, pos.z);
  };

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

  let pendingPostcardCapture: { tiltShift: boolean; postcardFrame: boolean } | null = null;

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
      focusPosition(x, 0, z);
    },
    onNewIsland(config) {
      sim.startNewIsland(config);
      saveAutosave(sim.exportSaveData());
      focusTownCenter();
    },
    onPhotoModeChange(enabled) {
      appEl.classList.toggle("photo-mode", enabled);
      ctx.setPhotoModeCamera(enabled);
      if (enabled) {
        hoveredTile = null;
        hoverRing.visible = false;
        if (ghostMesh) ghostMesh.visible = false;
      }
    },
    onTurntableChange() {
      // Turntable state is read directly in the main loop
    },
    onTiltShiftChange(enabled) {
      appEl.classList.toggle("tilt-shift-active", enabled);
    },
    onCapturePostcard(options) {
      pendingPostcardCapture = options;
    },
  });

  sim.onAtmosphereChanged = (tod, season) => {
    ctx.setAtmosphere(tod, season);
    clouds.setAtmosphere(tod, season);
  };

  sim.onStateChanged = () => {
    if (!hud.isModalOpen && !hud.photoMode) hud.render();
  };

  // Restore shared village (#village=...), shared map seed (#seed=...), or local autosave on startup
  const shared = decodeShareHash(window.location.hash);
  const sharedSeed = decodeSeedHash(window.location.hash);
  if (shared && shared.ok) {
    sim.loadSaveData(shared.data);
    window.history.replaceState(null, "", window.location.pathname);
  } else if (sharedSeed) {
    sim.startNewIsland(sharedSeed);
    saveAutosave(sim.exportSaveData());
    window.history.replaceState(null, "", window.location.pathname);
  } else {
    const autosaved = loadAutosave();
    if (autosaved) {
      sim.loadSaveData(autosaved);
    }
  }
  ctx.setAtmosphere(sim.timeOfDay, sim.season);
  clouds.setAtmosphere(sim.timeOfDay, sim.season);
  focusTownCenter();
  hud.render();

  // Periodic subtle HUD refresh & localStorage auto-save
  let uiRefreshTimer = 0;
  let autosaveTimer = 0;

  // Raycasting
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hoveredTile: { gx: number; gz: number } | null = null;

  const updatePointer = (ev: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  };

  const raycastTile = (): { gx: number; gz: number } | null => {
    raycaster.setFromCamera(pointer, ctx.camera);
    return world.raycastGround(raycaster);
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
    const hoverY =
      tile.terrain === "water"
        ? -0.12
        : tile.hasSteps
          ? tile.elevation + 0.28
          : tile.elevation + 0.06;
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
    if (hud.photoMode) return;
    updatePointer(ev);
    hoveredTile = raycastTile();
    updateHoverVisuals();
    if (isPointerDown && (activeTool.category === "paint" || activeTool.category === "demolish")) {
      applyToolAtHovered();
    }
  });

  canvas.addEventListener("pointerdown", (ev) => {
    audio.unlock();
    if (hud.photoMode) return;
    if (ev.button !== 0) return; // Left-click only (right-click orbits)
    isPointerDown = true;
    lastPaintedKey = "";
    updatePointer(ev);
    hoveredTile = raycastTile();
    applyToolAtHovered();
  });

  window.addEventListener("pointerdown", () => {
    audio.unlock();
  });

  window.addEventListener("pointerup", () => {
    isPointerDown = false;
    lastPaintedKey = "";
  });

  window.addEventListener("keydown", (ev) => {
    audio.unlock();
    const target = ev.target as HTMLElement | null;
    const isTyping =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      Boolean(target?.isContentEditable);

    if (ev.code === "Escape") {
      if (hud.isModalOpen) {
        hud.closeModal();
        return;
      }
      if (hud.photoMode) {
        hud.togglePhotoMode(false);
        return;
      }
      hud.setTool({ category: "select" });
      sim.selectedBuildingId = null;
      sim.selectedVillagerId = null;
      hud.render();
      return;
    }

    if (isTyping) return;

    if (ev.code === "KeyH" && !hud.isModalOpen && !ev.repeat) {
      hud.togglePhotoMode();
      return;
    }

    if (ev.code === "KeyT" && !hud.isModalOpen && !ev.repeat) {
      hud.toggleTurntable();
      return;
    }

    pressedKeys.add(ev.code);
    if (ev.code === "KeyR" && activeTool.category === "build" && !hud.photoMode) {
      buildRotation = (buildRotation + 1) % 4;
      updateHoverVisuals();
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
    ctx.updateTurntable(dt, hud.turntable, pressedKeys);
    ctx.controls.update();
    world.updateVisuals(elapsed);
    clouds.update(dt, elapsed, ctx.camera);
    sim.update(dt, elapsed, ctx.camera);

    let windmillCount = 0;
    let smithyCount = 0;
    for (const b of sim.buildings) {
      if (!b.constructed) continue;
      if (b.kind === "windmill") windmillCount++;
      else if (b.kind === "smithy") smithyCount++;
    }
    const activeSmithWorking = sim.villagers.some(
      (v) => v.job === "smith" && v.state === "working",
    );
    const cameraDistance = ctx.camera.position.distanceTo(ctx.controls.target);
    audio.updateAmbient(dt, {
      timeOfDay: sim.timeOfDay,
      season: sim.season,
      windmillCount,
      smithyCount,
      activeSmithWorking,
      cameraDistance,
    });

    uiRefreshTimer += dt;
    if (uiRefreshTimer >= 1.2) {
      uiRefreshTimer = 0;
      if (
        !hud.isModalOpen &&
        !hud.photoMode &&
        (sim.selectedBuildingId || sim.selectedVillagerId || sim.villagers.length > 0)
      ) {
        hud.refreshDynamicText();
      }
    }

    autosaveTimer += dt;
    if (autosaveTimer >= 20) {
      autosaveTimer = 0;
      saveAutosave(sim.exportSaveData());
    }

    ctx.renderer.render(ctx.scene, ctx.camera);

    if (pendingPostcardCapture) {
      const opts = pendingPostcardCapture;
      pendingPostcardCapture = null;
      audio.playShutter();
      if (vignetteEl) {
        vignetteEl.classList.remove("shutter-flash");
        void vignetteEl.offsetWidth;
        vignetteEl.classList.add("shutter-flash");
      }
      const cfg = sim.getIslandConfig();
      const postcard = compositePostcardCanvas(canvas, {
        tiltShift: opts.tiltShift,
        postcardFrame: opts.postcardFrame,
        island: cfg,
        season: sim.season,
        timeOfDay: sim.timeOfDay,
        villagerCount: sim.villagers.length,
        buildingCount: sim.buildings.length,
        coziness: sim.getCoziness(),
      });
      void downloadPostcardPng(postcard, cfg.seed).then((ok) => {
        hud.showPhotoToast(ok ? "📸 Postcard PNG saved!" : "⚠️ Could not export PNG");
      });
    }
  };

  requestAnimationFrame(tick);
}

void bootstrap();
