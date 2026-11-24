import type { CozyAudio } from "./audio.ts";
import {
  BIOME_SPECS,
  generateIslandLayout,
  generateRandomSeed,
  normalizeSeed,
} from "./islandGen.ts";
import type { VillageSimulation } from "./simulation.ts";
import {
  clearAutosave,
  deleteSlot,
  encodeSeedHash,
  encodeShareHash,
  loadFromSlot,
  parseSaveJson,
  saveAutosave,
  saveToSlot,
  type ValidationResult,
} from "./storage.ts";
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
  type Season,
  type TimeOfDay,
  type ToolMode,
} from "./types.ts";

export interface HudCallbacks {
  onToolChange(tool: ToolMode): void;
  onTimeOfDayChange(tod: TimeOfDay): void;
  onSeasonChange(season: Season): void;
  onFocusPosition(x: number, z: number): void;
  onNewIsland(config: IslandConfig): void;
  onPhotoModeChange(enabled: boolean): void;
  onTurntableChange(enabled: boolean): void;
  onTiltShiftChange(enabled: boolean): void;
  onCapturePostcard(options: { tiltShift: boolean; postcardFrame: boolean }): void;
}

const BUILD_ORDER: BuildingKind[] = [
  "cottage",
  "lumber_hut",
  "sawmill",
  "farmhouse",
  "bakery",
  "fishing_dock",
  "quarry",
  "smithy",
  "builder_yard",
  "tavern",
  "bridge",
  "well",
  "windmill",
];

const DECOR_ORDER: BuildingKind[] = ["wood_fence", "stone_wall", "lantern", "flower_box", "bench"];

const SEASON_ORDER: Season[] = ["spring", "summer", "autumn", "winter"];
const ARCHETYPE_ORDER: IslandArchetype[] = [
  "classic_cove",
  "archipelago",
  "river_valley",
  "highland_terrace",
];
const BIOME_ORDER: IslandBiome[] = ["meadow", "pine_fjord", "golden_coast", "blossom_isle"];

function hexCss(hex: number): string {
  return `#${hex.toString(16).padStart(6, "0")}`;
}

export class CozyHud {
  private root: HTMLElement;
  private sim: VillageSimulation;
  private audio: CozyAudio;
  private backend: "WebGPU" | "WebGL2";
  private callbacks: HudCallbacks;

  private activeTab: "build" | "decor" | "paint" = "build";
  private activeTool: ToolMode = { category: "select" };
  private saveModalOpen = false;
  private newIslandModalOpen = false;
  private draftIsland: IslandConfig = { ...DEFAULT_ISLAND_CONFIG };
  private importDraft = "";
  private importValidation: ValidationResult | null = null;
  private modalFeedback = "";

  public photoMode = false;
  public turntable = false;
  public tiltShift = false;
  public postcardFrame = true;
  private photoToast = "";
  private photoToastTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    root: HTMLElement,
    sim: VillageSimulation,
    audio: CozyAudio,
    backend: "WebGPU" | "WebGL2",
    callbacks: HudCallbacks,
  ) {
    this.root = root;
    this.sim = sim;
    this.audio = audio;
    this.backend = backend;
    this.callbacks = callbacks;
    this.render();
  }

  public get isModalOpen(): boolean {
    return this.saveModalOpen || this.newIslandModalOpen;
  }

  public setTool(tool: ToolMode): void {
    this.activeTool = tool;
    this.callbacks.onToolChange(tool);
    this.render();
  }

  public openNewIslandModal(): void {
    this.draftIsland = { ...this.sim.getIslandConfig() };
    this.newIslandModalOpen = true;
    this.saveModalOpen = false;
    this.modalFeedback = "";
    this.render();
  }

  public closeModal(): void {
    if (!this.isModalOpen) return;
    this.saveModalOpen = false;
    this.newIslandModalOpen = false;
    this.modalFeedback = "";
    this.render();
  }

  public togglePhotoMode(force?: boolean): void {
    const next = force !== undefined ? force : !this.photoMode;
    if (next === this.photoMode) return;
    this.photoMode = next;
    if (this.photoMode) {
      this.saveModalOpen = false;
      this.newIslandModalOpen = false;
      this.sim.selectedBuildingId = null;
      this.sim.selectedVillagerId = null;
    }
    this.callbacks.onPhotoModeChange(this.photoMode);
    this.callbacks.onTiltShiftChange(this.photoMode && this.tiltShift);
    this.render();
  }

  public toggleTurntable(force?: boolean): void {
    const next = force !== undefined ? force : !this.turntable;
    if (next === this.turntable) return;
    this.turntable = next;
    this.callbacks.onTurntableChange(this.turntable);
    this.render();
  }

  public showPhotoToast(message: string): void {
    this.photoToast = message;
    if (this.photoToastTimeout) {
      clearTimeout(this.photoToastTimeout);
    }
    this.photoToastTimeout = setTimeout(() => {
      this.photoToast = "";
      this.photoToastTimeout = null;
      if (this.photoMode) this.render();
    }, 2600);
    if (this.photoMode) this.render();
  }

  /**
   * Updates villager roster and inspector status text in place without replacing interactive DOM nodes.
   */
  public refreshDynamicText(): void {
    for (const v of this.sim.villagers) {
      const statusEl = this.root.querySelector<HTMLElement>(
        `[data-villager="${v.id}"] .roster-status`,
      );
      if (statusEl && statusEl.textContent !== v.statusText) {
        statusEl.textContent = v.statusText;
      }
    }

    const inspEl = this.root.querySelector<HTMLElement>("[data-inspector-status]");
    if (!inspEl) return;

    if (this.sim.selectedBuildingId) {
      const b = this.sim.buildings.find((x) => x.id === this.sim.selectedBuildingId);
      if (!b) return;
      const def = BUILDING_DEFS[b.kind];
      const worker = b.workerId ? this.sim.villagers.find((v) => v.id === b.workerId) : null;
      const statusLine = !b.constructed
        ? `Under construction (${Math.floor(b.buildProgress * 100)}%)`
        : worker
          ? `Worker: ${JOB_META[worker.job].icon} ${worker.name} — ${worker.statusText}`
          : def.job
            ? `Needs a Cottage or Tavern for housing (+2 pop)`
            : def.decor || def.walkable
              ? `+${def.coziness} Coziness`
              : `Level ${b.level} · +${def.coziness * b.level} Coziness`;
      if (inspEl.textContent !== statusLine) {
        inspEl.textContent = statusLine;
      }
    } else if (this.sim.selectedVillagerId) {
      const v = this.sim.villagers.find((x) => x.id === this.sim.selectedVillagerId);
      if (v && inspEl.textContent !== v.statusText) {
        inspEl.textContent = v.statusText;
      }
    }
  }

  public render(): void {
    if (this.photoMode) {
      this.renderPhotoModeHud();
      this.bindPhotoModeEvents();
      return;
    }

    const r = this.sim.resources;
    const pop = this.sim.villagers.length;
    const maxPop = this.sim.getMaxPopulation();
    const coziness = this.sim.getCoziness();
    const speedBonusPct = Math.round((this.sim.getToolSpeedBonus() - 1) * 100);
    const breadBonusPct = Math.round((this.sim.getBreadSpeedBonus() - 1) * 100);
    const tod = this.sim.timeOfDay;
    const season = this.sim.season;
    const cfg = this.sim.getIslandConfig();

    const hintText =
      this.activeTool.category === "build"
        ? `Click to place ${BUILDING_DEFS[this.activeTool.building].name} • R to rotate • Esc to cancel`
        : this.activeTool.category === "paint"
          ? `Click & drag to paint ${this.activeTool.paint} • Esc to stop`
          : this.activeTool.category === "demolish"
            ? `Click tiles or buildings to clear • Esc to stop`
            : `WASD pan • Right-drag or Q/E orbit • Scroll zoom • H Photo Mode • T Turntable`;

    this.root.innerHTML = `
      <div class="hud-top">
        <div style="display:flex;flex-direction:column;align-items:flex-start;">
          <div class="glass-bar">
            <div class="title-pill">
              <span>🏡 Meadowbrook</span>
              <button class="seed-pill" data-open-island="1" title="${ARCHETYPE_META[cfg.archetype].label} · ${BIOME_META[cfg.biome].label} (Click to generate new island)">${ARCHETYPE_META[cfg.archetype].icon} ${this.escapeHtml(cfg.seed)}</button>
              <span class="backend-badge">${this.backend}</span>
            </div>
            <div class="resource-group">
              <div class="res-item" title="Wood (from Lumberjacks)">🪵 ${r.wood} <span class="res-label">Wood</span></div>
              <div class="res-item" title="Planks (from Sawmill — used for upgrades & landmarks)">🪚 ${r.planks} <span class="res-label">Planks</span></div>
              <div class="res-item" title="Stone (from Quarry & Smith mining)">🪨 ${r.stone} <span class="res-label">Stone</span></div>
              <div class="res-item" title="Food (Wheat & Fish)">🌾 ${r.food} <span class="res-label">Food</span></div>
              <div class="res-item" title="Bread (from Bakery — +${breadBonusPct}% walk/work speed & Coziness)">🥐 ${r.bread} <span class="res-label">Bread</span></div>
              <div class="res-item" title="Tools boost villager speed (+${speedBonusPct}%)">⚒️ ${r.tools} <span class="res-label">Tools</span></div>
              <div class="res-item" title="Villagers / Housing capacity">👥 ${pop}/${maxPop}</div>
              <div class="res-item" title="Village Coziness">✨ ${coziness}</div>
            </div>
          </div>
          ${this.renderRosterHtml()}
        </div>

        <div class="glass-bar controls-group">
          <button class="icon-btn ${tod === "morning" ? "active" : ""}" data-tod="morning" title="Morning sun">☀️</button>
          <button class="icon-btn ${tod === "golden" ? "active" : ""}" data-tod="golden" title="Golden hour">🌅</button>
          <button class="icon-btn ${tod === "dusk" ? "active" : ""}" data-tod="dusk" title="Cozy dusk & nightlife">🌙</button>
          <span style="opacity:0.25">|</span>
          ${SEASON_ORDER.map(
            (s) =>
              `<button class="icon-btn ${season === s ? "active" : ""}" data-season="${s}" title="${SEASON_META[s].label}">${SEASON_META[s].icon}</button>`,
          ).join("")}
          <button class="icon-btn ${this.sim.autoSeason ? "active" : ""}" data-autoseason="1" title="Auto-cycle seasons">🔄</button>
          <span style="opacity:0.25">|</span>
          <button class="icon-btn ${this.sim.speedMultiplier === 0 ? "active" : ""}" data-speed="0" title="Pause">⏸</button>
          <button class="icon-btn ${this.sim.speedMultiplier === 1 ? "active" : ""}" data-speed="1" title="Normal speed">1x</button>
          <button class="icon-btn ${this.sim.speedMultiplier === 2 ? "active" : ""}" data-speed="2" title="Fast speed">2x</button>
          <button class="icon-btn" data-mute="1" title="Toggle cozy audio & ambient soundscape">${this.audio.muted ? "🔇" : "🔊"}</button>
          <button class="icon-btn ${this.photoMode ? "active" : ""}" data-photo-mode="1" title="Photo Mode & Diorama Postcards (H)">📷</button>
          <button class="icon-btn ${this.newIslandModalOpen ? "active" : ""}" data-open-island="1" title="New Island & Map Seed Generator">🗺️</button>
          <button class="icon-btn ${this.saveModalOpen ? "active" : ""}" data-open-save="1" title="Save, Load & Share JSON">💾</button>
        </div>
      </div>

      ${this.renderInspectorHtml()}
      ${this.saveModalOpen ? this.renderSaveModalHtml() : ""}
      ${this.newIslandModalOpen ? this.renderNewIslandModalHtml() : ""}

      <div class="hud-bottom-wrap">
        <div class="hint-bar">${hintText}</div>
        <div class="toolbar-container">
          <div class="toolbar-tabs">
            <button class="tab-btn ${this.activeTab === "build" ? "active" : ""}" data-tab="build">🏗️ Buildings</button>
            <button class="tab-btn ${this.activeTab === "decor" ? "active" : ""}" data-tab="decor">🪴 Decor</button>
            <button class="tab-btn ${this.activeTab === "paint" ? "active" : ""}" data-tab="paint">🎨 Paint & Nature</button>
            <button class="tab-btn ${this.activeTool.category === "select" ? "active" : ""}" data-select="1">👆 Inspect</button>
            <button class="tab-btn ${this.activeTool.category === "demolish" ? "active" : ""}" data-demolish="1">🧹 Clear</button>
          </div>
          <div class="tool-cards">
            ${
              this.activeTab === "build"
                ? this.renderBuildCards(BUILD_ORDER)
                : this.activeTab === "decor"
                  ? this.renderBuildCards(DECOR_ORDER)
                  : this.renderPaintCards()
            }
          </div>
        </div>
      </div>
    `;

    if (this.newIslandModalOpen) {
      this.drawSeedPreviewCanvas();
    }
    this.bindEvents();
  }

  private renderBuildCards(list: BuildingKind[]): string {
    return list
      .map((kind) => {
        const def = BUILDING_DEFS[kind];
        const affordable = this.sim.canAfford(def.cost);
        const isActive = this.activeTool.category === "build" && this.activeTool.building === kind;
        const costParts: string[] = [];
        if (def.cost.wood) costParts.push(`🪵${def.cost.wood}`);
        if (def.cost.planks) costParts.push(`🪚${def.cost.planks}`);
        if (def.cost.stone) costParts.push(`🪨${def.cost.stone}`);
        if (def.cost.tools) costParts.push(`⚒️${def.cost.tools}`);
        return `
          <button class="tool-card ${isActive ? "active" : ""} ${affordable ? "" : "disabled"}" data-build="${kind}" title="${def.description}">
            <span class="tool-icon">${def.icon}</span>
            <span class="tool-name">${def.name}</span>
            <span class="tool-cost">${costParts.join(" ") || "Free"}</span>
          </button>
        `;
      })
      .join("");
  }

  private renderPaintCards(): string {
    const paints: {
      id: "path" | "farm" | "meadow" | "tree";
      icon: string;
      name: string;
      sub: string;
    }[] = [
      { id: "path", icon: "🪨", name: "Cobble Path", sub: "Preferred · +45% spd" },
      { id: "farm", icon: "🌾", name: "Farmfield", sub: "Grows wheat" },
      { id: "meadow", icon: "🌼", name: "Meadow", sub: "+1 Coziness" },
      { id: "tree", icon: "🌲", name: "Plant Tree", sub: "Forest regrowth" },
    ];
    return paints
      .map((p) => {
        const isActive = this.activeTool.category === "paint" && this.activeTool.paint === p.id;
        return `
          <button class="tool-card ${isActive ? "active" : ""}" data-paint="${p.id}">
            <span class="tool-icon">${p.icon}</span>
            <span class="tool-name">${p.name}</span>
            <span class="tool-cost">${p.sub}</span>
          </button>
        `;
      })
      .join("");
  }

  private renderRosterHtml(): string {
    if (this.sim.villagers.length === 0) return "";
    const items = this.sim.villagers
      .map((v) => {
        const meta = JOB_META[v.job];
        const trait = TRAIT_META[v.trait];
        return `
          <div class="roster-item" data-villager="${v.id}" title="${trait.icon} ${trait.label}: ${trait.description}">
            <div><strong>${meta.icon} ${v.name}</strong> · ${meta.label} <span class="roster-trait">${trait.icon}</span></div>
            <div class="roster-status">${v.statusText}</div>
          </div>
        `;
      })
      .join("");
    return `
      <div class="roster-strip">
        <div class="roster-title">Villagers (${this.sim.villagers.length})</div>
        ${items}
      </div>
    `;
  }

  private renderInspectorHtml(): string {
    if (this.sim.selectedBuildingId) {
      const b = this.sim.buildings.find((x) => x.id === this.sim.selectedBuildingId);
      if (!b) return "";
      const def = BUILDING_DEFS[b.kind];
      const worker = b.workerId ? this.sim.villagers.find((v) => v.id === b.workerId) : null;
      const isUpgradable = !def.decor && !def.walkable;
      const upCost = this.sim.getUpgradeCost(b);
      const canUpgrade = isUpgradable && b.constructed && b.level < 3 && this.sim.canAfford(upCost);

      const upParts: string[] = [];
      if (upCost.wood) upParts.push(`🪵${upCost.wood}`);
      if (upCost.planks) upParts.push(`🪚${upCost.planks}`);
      if (upCost.stone) upParts.push(`🪨${upCost.stone}`);
      if (upCost.tools) upParts.push(`⚒️${upCost.tools}`);

      const statusLine = !b.constructed
        ? `Under construction (${Math.floor(b.buildProgress * 100)}%)`
        : worker
          ? `Worker: ${JOB_META[worker.job].icon} ${worker.name} — ${worker.statusText}`
          : def.job
            ? `Needs a Cottage or Tavern for housing (+2 pop)`
            : def.decor || def.walkable
              ? `+${def.coziness} Coziness`
              : `Level ${b.level} · +${def.coziness * b.level} Coziness`;

      return `
        <div class="inspector-card">
          <div class="inspector-header">
            <div class="inspector-title">${def.icon} ${def.name} ${isUpgradable ? `<span style="font-size:11px;color:var(--accent-gold)">Lv.${b.level}</span>` : ""}</div>
            <button class="icon-btn" data-close-inspector="1">✕</button>
          </div>
          <div class="inspector-desc">${def.description}</div>
          <div class="inspector-desc" data-inspector-status="1" style="color:var(--text-cream)">${statusLine}</div>
          <div class="inspector-actions">
            ${
              isUpgradable
                ? b.level < 3 && b.constructed
                  ? `<button class="btn-primary" data-upgrade="${b.id}" ${canUpgrade ? "" : "disabled"}>Upgrade (${upParts.join(" ")})</button>`
                  : `<button class="btn-primary" disabled>${b.constructed ? "Max Level ✨" : "Building..."}</button>`
                : ""
            }
            ${b.kind !== "town_hall" ? `<button class="btn-danger" data-remove-building="${b.id}">Remove</button>` : ""}
          </div>
        </div>
      `;
    }

    if (this.sim.selectedVillagerId) {
      const v = this.sim.villagers.find((x) => x.id === this.sim.selectedVillagerId);
      if (!v) return "";
      const meta = JOB_META[v.job];
      const trait = TRAIT_META[v.trait];
      return `
        <div class="inspector-card">
          <div class="inspector-header">
            <div class="inspector-title">${meta.icon} ${v.name}</div>
            <button class="icon-btn" data-close-inspector="1">✕</button>
          </div>
          <div class="inspector-desc">Role: <strong>${meta.label}</strong></div>
          <div class="trait-badge" title="${trait.description}">
            <span>${trait.icon} <strong>${trait.label}</strong></span>
            <span class="trait-desc">${trait.description}</span>
          </div>
          <div class="inspector-desc" data-inspector-status="1" style="color:var(--text-cream)">${v.statusText}</div>
        </div>
      `;
    }

    return "";
  }

  private renderSaveModalHtml(): string {
    const slotRows = [1, 2, 3]
      .map((slot) => {
        const res = loadFromSlot(slot);
        const info =
          res && res.ok
            ? `${ARCHETYPE_META[res.summary.archetype].icon} ${this.escapeHtml(res.summary.seed)} · ${SEASON_META[res.summary.season].icon} ${res.summary.buildingCount} bldgs · ${res.summary.villagerCount} villagers`
            : "Empty slot";
        return `
          <div class="slot-row">
            <div class="slot-info">
              <strong>Slot ${slot}</strong>
              <span class="slot-meta">${info}</span>
            </div>
            <div class="slot-btns">
              <button class="icon-btn" data-slot-save="${slot}">Save</button>
              <button class="icon-btn" data-slot-load="${slot}" ${res && res.ok ? "" : "disabled"}>Load</button>
              ${res && res.ok ? `<button class="icon-btn" data-slot-del="${slot}" title="Clear slot">🗑</button>` : ""}
            </div>
          </div>
        `;
      })
      .join("");

    let previewHtml = "";
    if (this.importValidation) {
      if (this.importValidation.ok) {
        const s = this.importValidation.summary;
        previewHtml = `
          <div class="preview-box preview-box--ok">
            ✅ Ready to load: <strong>${s.buildingCount}</strong> buildings, <strong>${s.villagerCount}</strong> villagers, ${ARCHETYPE_META[s.archetype].icon} ${this.escapeHtml(s.seed)} (${BIOME_META[s.biome].label}), ${SEASON_META[s.season].icon} ${SEASON_META[s.season].label}
            (🪵${s.resources.wood} 🪚${s.resources.planks} 🪨${s.resources.stone} 🌾${s.resources.food} 🥐${s.resources.bread})
          </div>
        `;
      } else {
        previewHtml = `<div class="preview-box preview-box--err">⚠️ ${this.importValidation.error}</div>`;
      }
    }

    return `
      <div class="modal-backdrop" data-modal-backdrop="1">
        <div class="modal-card">
          <div class="inspector-header">
            <div class="inspector-title">💾 Save, Load & Share Village</div>
            <button class="icon-btn" data-close-save="1">✕</button>
          </div>

          ${this.modalFeedback ? `<div class="toast-msg">${this.modalFeedback}</div>` : ""}

          <div class="modal-section">
            <div class="modal-section-title">Local Save Slots (Auto-save enabled)</div>
            ${slotRows}
            <div class="modal-actions-row" style="justify-content:flex-end;margin-top:4px;">
              <button class="icon-btn" data-open-island="1">🗺️ New Island & Seed...</button>
              <button class="btn-danger" data-new-village="1">🌱 Reset Current Island</button>
            </div>
          </div>

          <div class="modal-section">
            <div class="modal-section-title">Export & One-Click Share</div>
            <div class="modal-actions-row">
              <button class="btn-primary" data-copy-json="1">📋 Copy JSON</button>
              <button class="icon-btn" data-download-json="1">⬇️ Download .json</button>
              <button class="icon-btn" data-copy-link="1">🔗 Share Link</button>
            </div>
          </div>

          <div class="modal-section">
            <div class="modal-section-title">Import from JSON Text or File</div>
            <textarea class="import-textarea" data-import-text="1" placeholder="Paste Meadowbrook JSON here, or drop a .json file...">${this.escapeHtml(this.importDraft)}</textarea>
            <div class="modal-actions-row">
              <label class="icon-btn" style="display:inline-flex;align-items:center;gap:4px;">
                📂 Choose .json
                <input type="file" accept=".json,application/json" data-import-file="1" style="display:none;" />
              </label>
              <button class="btn-primary" data-confirm-import="1" ${this.importValidation?.ok ? "" : "disabled"}>Load Previewed Village</button>
            </div>
            ${previewHtml}
          </div>
        </div>
      </div>
    `;
  }

  private renderNewIslandModalHtml(): string {
    const archCards = ARCHETYPE_ORDER.map((arch) => {
      const meta = ARCHETYPE_META[arch];
      const active = this.draftIsland.archetype === arch;
      return `
        <button class="arch-card ${active ? "active" : ""}" data-arch="${arch}">
          <div class="arch-card-head"><span>${meta.icon}</span><strong>${meta.label}</strong></div>
          <div class="arch-card-desc">${meta.description}</div>
        </button>
      `;
    }).join("");

    const biomePills = BIOME_ORDER.map((biome) => {
      const meta = BIOME_META[biome];
      const active = this.draftIsland.biome === biome;
      return `
        <button class="biome-pill ${active ? "active" : ""}" data-biome="${biome}" title="${meta.description}">
          <span class="biome-swatch" style="background:${meta.swatch};"></span>
          <span>${meta.icon} ${meta.label}</span>
        </button>
      `;
    }).join("");

    const draftArch = ARCHETYPE_META[this.draftIsland.archetype];
    const draftBiome = BIOME_META[this.draftIsland.biome];

    return `
      <div class="modal-backdrop" data-modal-backdrop="1">
        <div class="modal-card modal-card--wide">
          <div class="inspector-header">
            <div class="inspector-title">🗺️ New Island & Map Seed</div>
            <button class="icon-btn" data-close-island="1">✕</button>
          </div>

          ${this.modalFeedback ? `<div class="toast-msg">${this.modalFeedback}</div>` : ""}

          <div class="modal-section">
            <div class="modal-section-title">Map Seed (Shareable with friends)</div>
            <div class="seed-row">
              <input
                type="text"
                class="seed-input"
                data-seed-input="1"
                maxlength="24"
                value="${this.escapeHtml(this.draftIsland.seed)}"
                placeholder="e.g. MEADOW-42"
              />
              <button class="icon-btn" data-seed-random="1" title="Generate random cozy seed">🎲 Random</button>
              <button class="icon-btn" data-seed-copy-link="1" title="Copy shareable seed URL">🔗 Copy Seed Link</button>
            </div>
          </div>

          <div class="modal-section">
            <div class="modal-section-title">Island Archetype & Live Preview</div>
            <div class="island-grid">
              <div class="seed-preview-wrap">
                <canvas width="144" height="144" class="seed-preview-canvas" data-seed-preview="1"></canvas>
                <div class="seed-preview-meta" data-seed-meta="1">
                  ${draftArch.icon} ${draftArch.label} · ${draftBiome.icon} ${draftBiome.label}
                </div>
                <div class="seed-preview-legend">★ Town Square · Brown: Bridges/Steps</div>
              </div>
              <div class="archetype-grid">
                ${archCards}
              </div>
            </div>
          </div>

          <div class="modal-section">
            <div class="modal-section-title">Biome Palette</div>
            <div class="biome-row">
              ${biomePills}
            </div>
          </div>

          <div class="modal-actions-row" style="justify-content:flex-end;padding-top:4px;">
            <button class="icon-btn" data-close-island="1">Cancel</button>
            <button class="btn-primary" style="flex:0 0 auto;padding:8px 16px;" data-generate-island="1">✨ Generate & Start Village</button>
          </div>
        </div>
      </div>
    `;
  }

  private drawSeedPreviewCanvas(): void {
    const canvas = this.root.querySelector<HTMLCanvasElement>("[data-seed-preview]");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const layout = generateIslandLayout(this.draftIsland);
    const spec = BIOME_SPECS[layout.config.biome];
    const palette = spec.terrainPalette.summer;
    const water = spec.waterPalette.summer;
    const cell = canvas.width / MAP_SIZE;

    ctx.fillStyle = hexCss(water.deep);
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let gz = 0; gz < MAP_SIZE; gz++) {
      for (let gx = 0; gx < MAP_SIZE; gx++) {
        const t = layout.tiles[gz]![gx]!;
        const x = gx * cell;
        const y = gz * cell;

        if (t.terrain === "water") {
          if (t.isRiver) {
            ctx.fillStyle = hexCss(water.river);
            ctx.fillRect(x, y, cell, cell);
          } else {
            // Subtle shallow ring near coast
            const hasLand = [
              layout.tiles[gz]?.[gx - 1],
              layout.tiles[gz]?.[gx + 1],
              layout.tiles[gz - 1]?.[gx],
              layout.tiles[gz + 1]?.[gx],
            ].some((n) => n && n.terrain !== "water");
            if (hasLand) {
              ctx.fillStyle = hexCss(water.shallow);
              ctx.fillRect(x, y, cell, cell);
            }
          }
          continue;
        }

        if (t.terrain === "sand") {
          ctx.fillStyle = hexCss(palette.sand);
        } else if (t.terrain === "meadow") {
          ctx.fillStyle = hexCss(palette.meadow);
        } else {
          ctx.fillStyle = hexCss(palette.grass);
        }
        ctx.fillRect(x, y, cell, cell);

        // Elevation shading on Highland Terrace
        if (t.elevation >= 0.8) {
          ctx.fillStyle = "rgba(255, 255, 255, 0.24)";
          ctx.fillRect(x, y, cell, cell);
        } else if (t.elevation >= 0.4) {
          ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
          ctx.fillRect(x, y, cell, cell);
        }

        if (t.hasSteps) {
          ctx.fillStyle = "#c9bfb0";
          ctx.fillRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
        } else if (t.prop === "tree_oak" || t.prop === "tree_pine") {
          ctx.fillStyle =
            t.prop === "tree_oak"
              ? hexCss(spec.oakColors.summer[0] ?? 0x4f943d)
              : hexCss(spec.pineColors.summer[0] ?? 0x2e6a39);
          ctx.beginPath();
          ctx.arc(x + cell * 0.5, y + cell * 0.5, cell * 0.34, 0, Math.PI * 2);
          ctx.fill();
        } else if (t.prop === "rock") {
          ctx.fillStyle = "#6e737b";
          ctx.fillRect(x + 1.5, y + 1.5, cell - 3, cell - 3);
        }
      }
    }

    // Highlight starter bridges
    ctx.fillStyle = "#9b6b3c";
    for (const br of layout.starterBridges) {
      ctx.fillRect(br.gx * cell + 0.5, br.gz * cell + 0.5, cell - 1, cell - 1);
    }

    // Highlight starter farmfields
    ctx.fillStyle = "#eab949";
    for (const f of layout.starterFarms) {
      ctx.fillRect(f.gx * cell + 1, f.gz * cell + 1, cell - 2, cell - 2);
    }

    // Highlight Town Hall center
    const tcX = (layout.townCenter.gx + 0.5) * cell;
    const tcY = (layout.townCenter.gz + 0.5) * cell;
    ctx.fillStyle = "#ffe574";
    ctx.strokeStyle = "#2b1d10";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(tcX, tcY, cell * 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const metaEl = this.root.querySelector<HTMLElement>("[data-seed-meta]");
    if (metaEl) {
      const a = ARCHETYPE_META[layout.config.archetype];
      const b = BIOME_META[layout.config.biome];
      metaEl.textContent = `${a.icon} ${a.label} · ${b.icon} ${b.label} (${layout.config.seed})`;
    }
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  private bindEvents(): void {
    this.root.querySelectorAll<HTMLElement>("[data-tab]").forEach((el) => {
      el.addEventListener("click", () => {
        this.activeTab = el.dataset["tab"] as "build" | "decor" | "paint";
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLElement>("[data-build]").forEach((el) => {
      el.addEventListener("click", () => {
        const building = el.dataset["build"] as BuildingKind;
        this.setTool({ category: "build", building });
      });
    });

    this.root.querySelectorAll<HTMLElement>("[data-paint]").forEach((el) => {
      el.addEventListener("click", () => {
        const paint = el.dataset["paint"] as "path" | "farm" | "meadow" | "tree";
        this.setTool({ category: "paint", paint });
      });
    });

    const selectBtn = this.root.querySelector<HTMLElement>("[data-select]");
    selectBtn?.addEventListener("click", () => this.setTool({ category: "select" }));

    const demolishBtn = this.root.querySelector<HTMLElement>("[data-demolish]");
    demolishBtn?.addEventListener("click", () => this.setTool({ category: "demolish" }));

    this.root.querySelectorAll<HTMLElement>("[data-tod]").forEach((el) => {
      el.addEventListener("click", () => {
        const tod = el.dataset["tod"] as TimeOfDay;
        this.callbacks.onTimeOfDayChange(tod);
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLElement>("[data-season]").forEach((el) => {
      el.addEventListener("click", () => {
        const s = el.dataset["season"] as Season;
        this.callbacks.onSeasonChange(s);
        this.render();
      });
    });

    const autoSeasonBtn = this.root.querySelector<HTMLElement>("[data-autoseason]");
    autoSeasonBtn?.addEventListener("click", () => {
      this.sim.autoSeason = !this.sim.autoSeason;
      this.render();
    });

    this.root.querySelectorAll<HTMLElement>("[data-speed]").forEach((el) => {
      el.addEventListener("click", () => {
        this.sim.speedMultiplier = Number(el.dataset["speed"]);
        this.render();
      });
    });

    const muteBtn = this.root.querySelector<HTMLElement>("[data-mute]");
    muteBtn?.addEventListener("click", () => {
      this.audio.muted = !this.audio.muted;
      this.render();
    });

    const photoModeBtn = this.root.querySelector<HTMLElement>("[data-photo-mode]");
    photoModeBtn?.addEventListener("click", () => {
      this.togglePhotoMode();
    });

    this.root.querySelectorAll<HTMLElement>("[data-open-island]").forEach((el) => {
      el.addEventListener("click", () => {
        if (this.newIslandModalOpen) {
          this.closeModal();
        } else {
          this.openNewIslandModal();
        }
      });
    });

    const openSaveBtn = this.root.querySelector<HTMLElement>("[data-open-save]");
    openSaveBtn?.addEventListener("click", () => {
      this.saveModalOpen = !this.saveModalOpen;
      this.newIslandModalOpen = false;
      this.modalFeedback = "";
      this.render();
    });

    this.root.querySelectorAll<HTMLElement>("[data-villager]").forEach((el) => {
      el.addEventListener("click", () => {
        const id = el.dataset["villager"] ?? null;
        this.sim.selectedVillagerId = id;
        this.sim.selectedBuildingId = null;
        const v = this.sim.villagers.find((x) => x.id === id);
        if (v) this.callbacks.onFocusPosition(v.x, v.z);
        this.render();
      });
    });

    const closeBtn = this.root.querySelector<HTMLElement>("[data-close-inspector]");
    closeBtn?.addEventListener("click", () => {
      this.sim.selectedBuildingId = null;
      this.sim.selectedVillagerId = null;
      this.render();
    });

    const upgradeBtn = this.root.querySelector<HTMLElement>("[data-upgrade]");
    upgradeBtn?.addEventListener("click", () => {
      const id = upgradeBtn.dataset["upgrade"];
      if (id) this.sim.upgradeBuilding(id);
    });

    const removeBtn = this.root.querySelector<HTMLElement>("[data-remove-building]");
    removeBtn?.addEventListener("click", () => {
      const id = removeBtn.dataset["removeBuilding"];
      const b = this.sim.buildings.find((x) => x.id === id);
      if (b) this.sim.demolishAt(b.gx, b.gz);
    });

    // Shared backdrop close handler
    if (this.isModalOpen) {
      const backdrop = this.root.querySelector<HTMLElement>("[data-modal-backdrop]");
      backdrop?.addEventListener("click", (ev) => {
        if (ev.target === backdrop) this.closeModal();
      });
    }

    // Save/Load modal events
    if (this.saveModalOpen) {
      this.root
        .querySelector<HTMLElement>("[data-close-save]")
        ?.addEventListener("click", () => this.closeModal());

      this.root.querySelectorAll<HTMLElement>("[data-slot-save]").forEach((el) => {
        el.addEventListener("click", () => {
          const slot = Number(el.dataset["slotSave"]);
          saveToSlot(slot, this.sim.exportSaveData());
          this.modalFeedback = `Saved village to Slot ${slot}!`;
          this.render();
        });
      });

      this.root.querySelectorAll<HTMLElement>("[data-slot-load]").forEach((el) => {
        el.addEventListener("click", () => {
          const slot = Number(el.dataset["slotLoad"]);
          const res = loadFromSlot(slot);
          if (res && res.ok) {
            this.sim.loadSaveData(res.data);
            saveAutosave(res.data);
            this.modalFeedback = `Loaded Slot ${slot}!`;
            this.render();
          }
        });
      });

      this.root.querySelectorAll<HTMLElement>("[data-slot-del]").forEach((el) => {
        el.addEventListener("click", () => {
          const slot = Number(el.dataset["slotDel"]);
          deleteSlot(slot);
          this.modalFeedback = `Cleared Slot ${slot}.`;
          this.render();
        });
      });

      this.root.querySelector<HTMLElement>("[data-new-village]")?.addEventListener("click", () => {
        clearAutosave();
        this.sim.resetToStarterVillage();
        this.modalFeedback = "Reset current island to starter village!";
        this.render();
      });

      this.root.querySelector<HTMLElement>("[data-copy-json]")?.addEventListener("click", () => {
        const json = JSON.stringify(this.sim.exportSaveData(), null, 2);
        void navigator.clipboard?.writeText(json);
        this.modalFeedback = "Copied village JSON to clipboard!";
        this.render();
      });

      this.root
        .querySelector<HTMLElement>("[data-download-json]")
        ?.addEventListener("click", () => {
          const json = JSON.stringify(this.sim.exportSaveData(), null, 2);
          const blob = new Blob([json], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `meadowbrook-${new Date().toISOString().slice(0, 10)}.json`;
          a.click();
          URL.revokeObjectURL(url);
          this.modalFeedback = "Downloaded village .json file!";
          this.render();
        });

      this.root.querySelector<HTMLElement>("[data-copy-link]")?.addEventListener("click", () => {
        const hash = encodeShareHash(this.sim.exportSaveData());
        const shareUrl = `${window.location.origin}${window.location.pathname}${hash}`;
        void navigator.clipboard?.writeText(shareUrl);
        this.modalFeedback = "Copied one-click share link to clipboard!";
        this.render();
      });

      const textarea = this.root.querySelector<HTMLTextAreaElement>("[data-import-text]");
      if (textarea) {
        textarea.addEventListener("input", () => {
          this.importDraft = textarea.value;
          this.importValidation = this.importDraft.trim() ? parseSaveJson(this.importDraft) : null;
          const pos = textarea.selectionStart;
          this.render();
          const nextTa = this.root.querySelector<HTMLTextAreaElement>("[data-import-text]");
          if (nextTa) {
            nextTa.focus();
            nextTa.setSelectionRange(pos, pos);
          }
        });

        textarea.addEventListener("dragover", (ev) => {
          ev.preventDefault();
        });
        textarea.addEventListener("drop", (ev) => {
          ev.preventDefault();
          const file = ev.dataTransfer?.files[0];
          if (!file) return;
          void file.text().then((txt) => {
            this.importDraft = txt;
            this.importValidation = parseSaveJson(txt);
            this.render();
          });
        });
      }

      const fileInput = this.root.querySelector<HTMLInputElement>("[data-import-file]");
      fileInput?.addEventListener("change", () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        void file.text().then((txt) => {
          this.importDraft = txt;
          this.importValidation = parseSaveJson(txt);
          this.render();
        });
      });

      this.root
        .querySelector<HTMLElement>("[data-confirm-import]")
        ?.addEventListener("click", () => {
          if (this.importValidation?.ok) {
            this.sim.loadSaveData(this.importValidation.data);
            saveAutosave(this.importValidation.data);
            this.importDraft = "";
            this.importValidation = null;
            this.saveModalOpen = false;
            this.render();
          }
        });
    }

    // New Island / Seed modal events
    if (this.newIslandModalOpen) {
      this.root
        .querySelectorAll<HTMLElement>("[data-close-island]")
        .forEach((el) => el.addEventListener("click", () => this.closeModal()));

      const seedInput = this.root.querySelector<HTMLInputElement>("[data-seed-input]");
      seedInput?.addEventListener("input", () => {
        this.draftIsland.seed = seedInput.value;
        this.drawSeedPreviewCanvas();
      });

      this.root.querySelector<HTMLElement>("[data-seed-random]")?.addEventListener("click", () => {
        this.draftIsland.seed = generateRandomSeed(
          this.draftIsland.archetype,
          this.draftIsland.biome,
        );
        this.modalFeedback = "";
        this.render();
      });

      this.root
        .querySelector<HTMLElement>("[data-seed-copy-link]")
        ?.addEventListener("click", () => {
          const normalized: IslandConfig = {
            ...this.draftIsland,
            seed: normalizeSeed(this.draftIsland.seed),
          };
          const shareUrl = `${window.location.origin}${window.location.pathname}${encodeSeedHash(normalized)}`;
          void navigator.clipboard?.writeText(shareUrl);
          this.modalFeedback = `Copied seed link for ${normalized.seed}!`;
          this.render();
        });

      this.root.querySelectorAll<HTMLElement>("[data-arch]").forEach((el) => {
        el.addEventListener("click", () => {
          this.draftIsland.archetype = el.dataset["arch"] as IslandArchetype;
          this.render();
        });
      });

      this.root.querySelectorAll<HTMLElement>("[data-biome]").forEach((el) => {
        el.addEventListener("click", () => {
          this.draftIsland.biome = el.dataset["biome"] as IslandBiome;
          this.render();
        });
      });

      this.root
        .querySelector<HTMLElement>("[data-generate-island]")
        ?.addEventListener("click", () => {
          const finalConfig: IslandConfig = {
            seed: normalizeSeed(this.draftIsland.seed),
            archetype: this.draftIsland.archetype,
            biome: this.draftIsland.biome,
          };
          clearAutosave();
          this.newIslandModalOpen = false;
          this.modalFeedback = "";
          this.callbacks.onNewIsland(finalConfig);
          this.render();
        });
    }
  }

  private renderPhotoModeHud(): void {
    const tod = this.sim.timeOfDay;
    this.root.innerHTML = `
      <div class="photo-mode-spacer"></div>
      <div class="photo-dock-wrap">
        ${this.photoToast ? `<div class="toast-msg photo-toast">${this.escapeHtml(this.photoToast)}</div>` : ""}
        <div class="hint-bar">Drag to orbit low diorama angles • WASD pan • Scroll zoom • T turntable • H exit</div>
        <div class="glass-bar photo-dock">
          <button class="btn-primary photo-snap-btn" data-capture-postcard="1" title="Save diorama postcard as PNG">📸 Save Postcard PNG</button>
          <button class="icon-btn ${this.postcardFrame ? "active" : ""}" data-toggle-frame="1" title="Include warm postcard border & seed stamp">🖼️ Frame</button>
          <button class="icon-btn ${this.tiltShift ? "active" : ""}" data-toggle-tiltshift="1" title="Toggle subtle miniature tilt-shift blur">🎞️ Tilt-Shift</button>
          <button class="icon-btn ${this.turntable ? "active" : ""}" data-toggle-turntable="1" title="Gentle slow camera orbit around village (T)">🌀 Turntable</button>
          <span style="opacity:0.25">|</span>
          <button class="icon-btn ${tod === "morning" ? "active" : ""}" data-tod="morning" title="Morning sun">☀️</button>
          <button class="icon-btn ${tod === "golden" ? "active" : ""}" data-tod="golden" title="Golden hour">🌅</button>
          <button class="icon-btn ${tod === "dusk" ? "active" : ""}" data-tod="dusk" title="Cozy dusk">🌙</button>
          <button class="icon-btn" data-mute="1" title="Toggle cozy audio & ambient soundscape">${this.audio.muted ? "🔇" : "🔊"}</button>
          <button class="icon-btn" data-photo-mode="1" title="Exit Photo Mode (H / Esc)">✕ Exit</button>
        </div>
      </div>
    `;
  }

  private bindPhotoModeEvents(): void {
    this.root
      .querySelector<HTMLElement>("[data-capture-postcard]")
      ?.addEventListener("click", () => {
        this.callbacks.onCapturePostcard({
          tiltShift: this.tiltShift,
          postcardFrame: this.postcardFrame,
        });
      });

    this.root.querySelector<HTMLElement>("[data-toggle-frame]")?.addEventListener("click", () => {
      this.postcardFrame = !this.postcardFrame;
      this.render();
    });

    this.root
      .querySelector<HTMLElement>("[data-toggle-tiltshift]")
      ?.addEventListener("click", () => {
        this.tiltShift = !this.tiltShift;
        this.callbacks.onTiltShiftChange(this.tiltShift);
        this.render();
      });

    this.root
      .querySelector<HTMLElement>("[data-toggle-turntable]")
      ?.addEventListener("click", () => {
        this.toggleTurntable();
      });

    this.root.querySelectorAll<HTMLElement>("[data-tod]").forEach((el) => {
      el.addEventListener("click", () => {
        const tod = el.dataset["tod"] as TimeOfDay;
        this.callbacks.onTimeOfDayChange(tod);
        this.render();
      });
    });

    this.root.querySelector<HTMLElement>("[data-mute]")?.addEventListener("click", () => {
      this.audio.muted = !this.audio.muted;
      this.render();
    });

    this.root.querySelector<HTMLElement>("[data-photo-mode]")?.addEventListener("click", () => {
      this.togglePhotoMode(false);
    });
  }
}
