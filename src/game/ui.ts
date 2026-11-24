import type { CozyAudio } from "./audio.ts";
import type { VillageSimulation } from "./simulation.ts";
import {
  BUILDING_DEFS,
  JOB_META,
  type BuildingKind,
  type TimeOfDay,
  type ToolMode,
} from "./types.ts";

export interface HudCallbacks {
  onToolChange(tool: ToolMode): void;
  onTimeOfDayChange(tod: TimeOfDay): void;
  onFocusPosition(x: number, z: number): void;
}

const BUILD_ORDER: BuildingKind[] = [
  "cottage",
  "lumber_hut",
  "farmhouse",
  "fishing_dock",
  "smithy",
  "builder_yard",
  "well",
  "windmill",
];

export class CozyHud {
  private root: HTMLElement;
  private sim: VillageSimulation;
  private audio: CozyAudio;
  private backend: "WebGPU" | "WebGL2";
  private callbacks: HudCallbacks;

  private activeTab: "build" | "paint" = "build";
  private activeTool: ToolMode = { category: "select" };
  private timeOfDay: TimeOfDay = "morning";

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

  public setTool(tool: ToolMode): void {
    this.activeTool = tool;
    this.callbacks.onToolChange(tool);
    this.render();
  }

  public render(): void {
    const r = this.sim.resources;
    const pop = this.sim.villagers.length;
    const maxPop = this.sim.getMaxPopulation();
    const coziness = this.sim.getCoziness();
    const speedBonusPct = Math.round((this.sim.getToolSpeedBonus() - 1) * 100);

    const hintText =
      this.activeTool.category === "build"
        ? `Click to place ${BUILDING_DEFS[this.activeTool.building].name} • R to rotate • Esc to cancel`
        : this.activeTool.category === "paint"
          ? `Click & drag to paint ${this.activeTool.paint} • Esc to stop`
          : this.activeTool.category === "demolish"
            ? `Click tiles or buildings to clear • Esc to stop`
            : `WASD pan • Right-drag or Q/E orbit • Scroll zoom • Click any building or villager to inspect`;

    this.root.innerHTML = `
      <div class="hud-top">
        <div style="display:flex;flex-direction:column;align-items:flex-start;">
          <div class="glass-bar">
            <div class="title-pill">
              <span>🏡 Meadowbrook</span>
              <span class="backend-badge">${this.backend}</span>
            </div>
            <div class="resource-group">
              <div class="res-item" title="Wood (from Lumberjacks)">🪵 ${r.wood} <span class="res-label">Wood</span></div>
              <div class="res-item" title="Stone (from Smith mining)">🪨 ${r.stone} <span class="res-label">Stone</span></div>
              <div class="res-item" title="Food (Wheat & Fish)">🌾 ${r.food} <span class="res-label">Food</span></div>
              <div class="res-item" title="Tools boost villager speed (+${speedBonusPct}%)">⚒️ ${r.tools} <span class="res-label">Tools</span></div>
              <div class="res-item" title="Villagers / Housing capacity">👥 ${pop}/${maxPop}</div>
              <div class="res-item" title="Village Coziness">✨ ${coziness}</div>
            </div>
          </div>
          ${this.renderRosterHtml()}
        </div>

        <div class="glass-bar controls-group">
          <button class="icon-btn ${this.timeOfDay === "morning" ? "active" : ""}" data-tod="morning" title="Morning sun">☀️</button>
          <button class="icon-btn ${this.timeOfDay === "golden" ? "active" : ""}" data-tod="golden" title="Golden hour">🌅</button>
          <button class="icon-btn ${this.timeOfDay === "dusk" ? "active" : ""}" data-tod="dusk" title="Cozy dusk">🌙</button>
          <span style="opacity:0.25">|</span>
          <button class="icon-btn ${this.sim.speedMultiplier === 0 ? "active" : ""}" data-speed="0" title="Pause">⏸</button>
          <button class="icon-btn ${this.sim.speedMultiplier === 1 ? "active" : ""}" data-speed="1" title="Normal speed">1x</button>
          <button class="icon-btn ${this.sim.speedMultiplier === 2 ? "active" : ""}" data-speed="2" title="Fast speed">2x</button>
          <button class="icon-btn" data-mute="1" title="Toggle cozy audio">${this.audio.muted ? "🔇" : "🔊"}</button>
        </div>
      </div>

      ${this.renderInspectorHtml()}

      <div class="hud-bottom-wrap">
        <div class="hint-bar">${hintText}</div>
        <div class="toolbar-container">
          <div class="toolbar-tabs">
            <button class="tab-btn ${this.activeTab === "build" ? "active" : ""}" data-tab="build">🏗️ Buildings</button>
            <button class="tab-btn ${this.activeTab === "paint" ? "active" : ""}" data-tab="paint">🎨 Paint & Nature</button>
            <button class="tab-btn ${this.activeTool.category === "select" ? "active" : ""}" data-select="1">👆 Inspect</button>
            <button class="tab-btn ${this.activeTool.category === "demolish" ? "active" : ""}" data-demolish="1">🧹 Clear</button>
          </div>
          <div class="tool-cards">
            ${this.activeTab === "build" ? this.renderBuildCards() : this.renderPaintCards()}
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private renderBuildCards(): string {
    return BUILD_ORDER.map((kind) => {
      const def = BUILDING_DEFS[kind];
      const affordable = this.sim.canAfford(def.cost);
      const isActive = this.activeTool.category === "build" && this.activeTool.building === kind;
      const costParts: string[] = [];
      if (def.cost.wood) costParts.push(`🪵${def.cost.wood}`);
      if (def.cost.stone) costParts.push(`🪨${def.cost.stone}`);
      if (def.cost.tools) costParts.push(`⚒️${def.cost.tools}`);
      return `
        <button class="tool-card ${isActive ? "active" : ""} ${affordable ? "" : "disabled"}" data-build="${kind}" title="${def.description}">
          <span class="tool-icon">${def.icon}</span>
          <span class="tool-name">${def.name}</span>
          <span class="tool-cost">${costParts.join(" ") || "Free"}</span>
        </button>
      `;
    }).join("");
  }

  private renderPaintCards(): string {
    const paints: {
      id: "path" | "farm" | "meadow" | "tree";
      icon: string;
      name: string;
      sub: string;
    }[] = [
      { id: "path", icon: "🪨", name: "Cobble Path", sub: "+45% walk speed" },
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
        return `
          <div class="roster-item" data-villager="${v.id}">
            <div><strong>${meta.icon} ${v.name}</strong> · ${meta.label}</div>
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
      const upWood = 6 * b.level;
      const upStone = 3 * b.level;
      const upTools = b.level >= 2 ? 1 : 0;
      const canUpgrade =
        b.constructed &&
        b.level < 3 &&
        this.sim.canAfford({ wood: upWood, stone: upStone, tools: upTools });

      const statusLine = !b.constructed
        ? `Under construction (${Math.floor(b.buildProgress * 100)}%)`
        : worker
          ? `Worker: ${JOB_META[worker.job].icon} ${worker.name} — ${worker.statusText}`
          : def.job
            ? `Needs a Cottage for housing (+2 pop)`
            : `Level ${b.level} · +${def.coziness * b.level} Coziness`;

      return `
        <div class="inspector-card">
          <div class="inspector-header">
            <div class="inspector-title">${def.icon} ${def.name} <span style="font-size:11px;color:var(--accent-gold)">Lv.${b.level}</span></div>
            <button class="icon-btn" data-close-inspector="1">✕</button>
          </div>
          <div class="inspector-desc">${def.description}</div>
          <div class="inspector-desc" style="color:var(--text-cream)">${statusLine}</div>
          <div class="inspector-actions">
            ${
              b.level < 3 && b.constructed
                ? `<button class="btn-primary" data-upgrade="${b.id}" ${canUpgrade ? "" : "disabled"}>Upgrade (🪵${upWood} 🪨${upStone}${upTools ? ` ⚒️${upTools}` : ""})</button>`
                : `<button class="btn-primary" disabled>${b.constructed ? "Max Level ✨" : "Building..."}</button>`
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
      return `
        <div class="inspector-card">
          <div class="inspector-header">
            <div class="inspector-title">${meta.icon} ${v.name}</div>
            <button class="icon-btn" data-close-inspector="1">✕</button>
          </div>
          <div class="inspector-desc">Role: <strong>${meta.label}</strong></div>
          <div class="inspector-desc" style="color:var(--text-cream)">${v.statusText}</div>
        </div>
      `;
    }

    return "";
  }

  private bindEvents(): void {
    this.root.querySelectorAll<HTMLElement>("[data-tab]").forEach((el) => {
      el.addEventListener("click", () => {
        this.activeTab = el.dataset["tab"] as "build" | "paint";
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
        this.timeOfDay = el.dataset["tod"] as TimeOfDay;
        this.callbacks.onTimeOfDayChange(this.timeOfDay);
        this.render();
      });
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
  }
}
