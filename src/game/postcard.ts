import {
  ARCHETYPE_META,
  BIOME_META,
  SEASON_META,
  type IslandConfig,
  type Season,
  type TimeOfDay,
} from "./types.ts";

export interface PostcardOptions {
  tiltShift: boolean;
  postcardFrame: boolean;
  island: IslandConfig;
  season: Season;
  timeOfDay: TimeOfDay;
  villagerCount: number;
  buildingCount: number;
  coziness: number;
}

const TOD_LABEL: Record<TimeOfDay, string> = {
  morning: "Morning",
  golden: "Golden Hour",
  dusk: "Cozy Dusk",
};

/**
 * Composites the live 3D canvas into a downloadable Diorama Postcard PNG,
 * optionally baking in subtle tilt-shift blur and a warm vintage postcard border.
 */
export function compositePostcardCanvas(
  sourceCanvas: HTMLCanvasElement,
  options: PostcardOptions,
): HTMLCanvasElement {
  const srcW = Math.max(1, sourceCanvas.width);
  const srcH = Math.max(1, sourceCanvas.height);

  // Build the processed scene image (with optional tilt-shift + soft vignette)
  const sceneCanvas = document.createElement("canvas");
  sceneCanvas.width = srcW;
  sceneCanvas.height = srcH;
  const sctx = sceneCanvas.getContext("2d");
  if (!sctx) return sceneCanvas;

  sctx.drawImage(sourceCanvas, 0, 0, srcW, srcH);

  if (options.tiltShift) {
    // Render a blurred version of the scene and mask it smoothly to top & bottom bands
    const blurCanvas = document.createElement("canvas");
    blurCanvas.width = srcW;
    blurCanvas.height = srcH;
    const bctx = blurCanvas.getContext("2d");
    if (bctx) {
      const blurPx = Math.max(4, Math.round(srcH * 0.006));
      bctx.filter = `blur(${blurPx}px)`;
      bctx.drawImage(sourceCanvas, 0, 0, srcW, srcH);
      bctx.filter = "none";

      // Mask blurred copy so center horizontal focus band stays crisp
      bctx.globalCompositeOperation = "destination-in";
      const maskGrad = bctx.createLinearGradient(0, 0, 0, srcH);
      maskGrad.addColorStop(0.0, "rgba(0,0,0,1)");
      maskGrad.addColorStop(0.14, "rgba(0,0,0,0.85)");
      maskGrad.addColorStop(0.32, "rgba(0,0,0,0)");
      maskGrad.addColorStop(0.68, "rgba(0,0,0,0)");
      maskGrad.addColorStop(0.86, "rgba(0,0,0,0.85)");
      maskGrad.addColorStop(1.0, "rgba(0,0,0,1)");
      bctx.fillStyle = maskGrad;
      bctx.fillRect(0, 0, srcW, srcH);

      sctx.drawImage(blurCanvas, 0, 0);
    }
  }

  // Soft warm diorama vignette
  const cx = srcW * 0.5;
  const cy = srcH * 0.5;
  const outerR = Math.hypot(cx, cy);
  const vig = sctx.createRadialGradient(cx, cy, outerR * 0.45, cx, cy, outerR);
  vig.addColorStop(0, "rgba(255, 245, 224, 0)");
  vig.addColorStop(1, "rgba(28, 18, 10, 0.24)");
  sctx.fillStyle = vig;
  sctx.fillRect(0, 0, srcW, srcH);

  if (!options.postcardFrame) {
    return sceneCanvas;
  }

  // Warm cream Polaroid / Postcard border with caption & vintage stamp
  const pad = Math.max(24, Math.round(Math.min(srcW, srcH) * 0.036));
  const footerH = Math.max(76, Math.round(srcH * 0.115));
  const outW = srcW + pad * 2;
  const outH = srcH + pad * 2 + footerH;

  const outCanvas = document.createElement("canvas");
  outCanvas.width = outW;
  outCanvas.height = outH;
  const octx = outCanvas.getContext("2d");
  if (!octx) return sceneCanvas;

  // Warm parchment background
  octx.fillStyle = "#fbf4e6";
  octx.fillRect(0, 0, outW, outH);

  // Subtle paper grain / edge border
  octx.strokeStyle = "rgba(130, 100, 68, 0.28)";
  octx.lineWidth = Math.max(2, Math.round(pad * 0.08));
  octx.strokeRect(
    Math.round(pad * 0.35),
    Math.round(pad * 0.35),
    outW - Math.round(pad * 0.7),
    outH - Math.round(pad * 0.7),
  );

  // Draw framed village photo
  octx.drawImage(sceneCanvas, pad, pad, srcW, srcH);
  octx.strokeStyle = "rgba(74, 52, 32, 0.22)";
  octx.lineWidth = Math.max(1.5, Math.round(pad * 0.05));
  octx.strokeRect(pad, pad, srcW, srcH);

  // Caption area
  const footerTop = pad + srcH;
  const arch = ARCHETYPE_META[options.island.archetype];
  const biome = BIOME_META[options.island.biome];
  const season = SEASON_META[options.season];

  const titleSize = Math.max(22, Math.round(footerH * 0.34));
  const subSize = Math.max(13, Math.round(footerH * 0.19));
  const fontStack = '"SF Pro Rounded", "Nunito", system-ui, -apple-system, sans-serif';

  octx.fillStyle = "#352618";
  octx.font = `800 ${titleSize}px ${fontStack}`;
  octx.textBaseline = "middle";
  octx.fillText("Greetings from Meadowbrook", pad + 4, footerTop + footerH * 0.38);

  octx.fillStyle = "#7a6146";
  octx.font = `600 ${subSize}px ${fontStack}`;
  octx.fillText(
    `${arch.label} · ${biome.label} · ${season.label} ${TOD_LABEL[options.timeOfDay]}`,
    pad + 4,
    footerTop + footerH * 0.72,
  );

  // Vintage seed & stats stamp on the right
  const stampW = Math.max(170, Math.round(outW * 0.22));
  const stampH = Math.round(footerH * 0.74);
  const stampX = outW - pad - stampW;
  const stampY = footerTop + Math.round((footerH - stampH) * 0.52);

  octx.save();
  octx.strokeStyle = "rgba(181, 118, 56, 0.55)";
  octx.fillStyle = "rgba(240, 185, 73, 0.14)";
  octx.lineWidth = 2;
  octx.setLineDash([5, 4]);
  octx.fillRect(stampX, stampY, stampW, stampH);
  octx.strokeRect(stampX, stampY, stampW, stampH);
  octx.setLineDash([]);

  octx.fillStyle = "#5a3d20";
  octx.font = `800 ${Math.max(12, Math.round(subSize * 0.95))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  octx.textAlign = "center";
  octx.fillText(`SEED ${options.island.seed}`, stampX + stampW * 0.5, stampY + stampH * 0.36);

  octx.fillStyle = "#7a6146";
  octx.font = `700 ${Math.max(11, Math.round(subSize * 0.85))}px ${fontStack}`;
  octx.fillText(
    `${options.villagerCount} Villagers · ${options.buildingCount} Bldgs · ✨ ${options.coziness}`,
    stampX + stampW * 0.5,
    stampY + stampH * 0.72,
  );
  octx.restore();

  return outCanvas;
}

/**
 * Exports a composited postcard canvas as a PNG download.
 */
export function downloadPostcardPng(canvas: HTMLCanvasElement, seed: string): Promise<boolean> {
  return new Promise((resolve) => {
    const safeSeed = seed.toLowerCase().replace(/[^a-z0-9-]+/g, "-") || "island";
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `meadowbrook-${safeSeed}-${stamp}.png`;

    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(false);
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      resolve(true);
    }, "image/png");
  });
}
