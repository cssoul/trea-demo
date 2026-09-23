import * as THREE from "three";
import { makeRandom } from "./rng";
import type { SkySpec } from "./daylight";

export type SurfaceName =
  | "concrete"      // 清水混凝土：竖向结构、柱、核心筒
  | "concreteDeep"  // 背光混凝土：室内楼板底、核心筒内壁
  | "white"         // 白色石材幕墙板（裙房与白塔的主材）
  | "stone"         // 浅色花岗岩铺装
  | "stoneDark"     // 深色石材：勒脚、深色横向带
  | "paving"        // 深色人行道铺装
  | "asphalt"       // 沥青车行道
  | "roof"          // 屋面砾石
  | "mullion"       // 铝型材竖梃
  | "steel"         // 结构钢 / 雨篷柱 / 栏杆
  | "wood"          // 室内木饰面
  | "glass"         // 镜面玻璃
  | "glassDeep"     // 深蓝绿镀膜玻璃：塔楼幕墙
  | "glassClear"    // 通透玻璃：中庭、橱窗
  | "glow"          // 室内暖光
  | "glowHot"       // 商铺橱窗 / 雨篷底：强暖光
  | "glowCool"      // 冷白内透：办公层
  | "signage"       // 竖排汉字招牌（杭州大厦）
  | "signageAlt"    // 横排店招（LOUIS VUITTON / CHANEL）
  | "carPaint"      // 车身漆
  | "planting"      // 灌木
  | "lawn";         // 草坪

/** Surfaces that must not cast or receive baked shadows. */
export const NO_CAST: SurfaceName[] = [
  "glass", "glassDeep", "glassClear", "glow", "glowHot", "glowCool",
  "signage", "signageAlt", "lawn", "planting", "asphalt",
];
export const NO_RECEIVE: SurfaceName[] = [
  "glass", "glassDeep", "glassClear", "glow", "glowHot", "glowCool", "signage", "signageAlt",
];
/** Surfaces whose texture origin must stay aligned across pieces (panel joints). */
export const NO_UV_JITTER: SurfaceName[] = [
  "glass", "glassDeep", "glassClear", "glow", "glowHot", "glowCool",
  "signage", "signageAlt", "white",
];

type Feature = "boardform" | "paneljoint" | "stonepanel" | "brushed" | "slats" | "foliage" | "gravel" | "speckle";

const PALETTE: Record<SurfaceName, string> = {
  concrete: "#c5c2ba",
  concreteDeep: "#8f8d87",
  white: "#e9e7e1",
  stone: "#b6b1a6",
  stoneDark: "#3b3d40",
  paving: "#9d988f",
  asphalt: "#4a4b4d",
  roof: "#a9a59d",
  mullion: "#aeb3b8",
  steel: "#6d7175",
  wood: "#c49a6a",
  glass: "#7f9cb4",
  glassDeep: "#33474e",
  glassClear: "#b6c7d4",
  glow: "#4a4034",
  glowHot: "#4a3826",
  glowCool: "#3b4250",
  signage: "#eceae4",
  signageAlt: "#eceae4",
  carPaint: "#2b3138",
  planting: "#4d6a3c",
  lawn: "#6f8a52",
};

const FEATURE: Partial<Record<SurfaceName, Feature>> = {
  concrete: "boardform",
  concreteDeep: "boardform",
  white: "stonepanel",
  stone: "speckle",
  stoneDark: "speckle",
  paving: "speckle",
  asphalt: "speckle",
  roof: "gravel",
  mullion: "brushed",
  steel: "brushed",
  wood: "slats",
  planting: "foliage",
  lawn: "foliage",
};

/** Emissive bases. Kept near 1.0–1.3: ACES tone mapping flattens anything much
 *  higher into white and the window stops reading as a window. */
const EMISSIVE: Partial<Record<SurfaceName, { color: string; intensity: number }>> = {
  glow: { color: "#ffd9a8", intensity: 1.20 },
  glowHot: { color: "#ffb469", intensity: 1.45 },
  glowCool: { color: "#cfe2f5", intensity: 0.85 },
};

/**
 * Draw a sign: characters only, on a transparent field.
 *
 * The characters hang directly on the stone, with no backing panel — matching
 * how raised metal lettering actually looks on a white-clad facade. The material
 * uses `alphaTest` rather than `transparent`, so cutting the glyphs out does not
 * push the sign into the transparent queue and cost a sort.
 *
 * These are the only textures in the set that must NOT tile: a shop sign that
 * repeats every metre is worse than no sign at all.
 */
export function createSignTexture(
  lines: string[],
  options: { vertical?: boolean; width?: number; length?: number; ink?: string; font?: string } = {},
) {
  const vertical = options.vertical ?? false;
  const ink = options.ink ?? "#25272b";
  const font = options.font ?? '600 %SIZEpx "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';

  const width = options.width ?? 256;
  const length = options.length ?? 1280;
  const canvas = document.createElement("canvas");
  canvas.width = vertical ? width : length;
  canvas.height = vertical ? length : width;
  const ctx = canvas.getContext("2d")!;

  // No fill: the field stays transparent so only the glyphs survive alphaTest.
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = font.replace("%SIZE", String(Math.floor(width * (vertical ? 0.78 : 0.66))));

  const step = length / lines.length;
  lines.forEach((line, i) => {
    const t = step * (i + 0.5);
    if (vertical) ctx.fillText(line, canvas.width / 2, t);
    else ctx.fillText(line, t, canvas.height / 2);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/**
 * Build the whole modern-material set from canvases. No image files, no network,
 * and the same seed always produces the same wall.
 *
 * **Texture scale contract:** the builder's extruded boxes emit UVs in world
 * units, so one texture tile covers exactly one world unit (≈ one metre here).
 * Every feature below is therefore authored in metres: a 1024 px canvas means
 * 1024 px = 1 m, and a board-form line drawn every 256 px is a joint every
 * 25 cm. Keep that contract when you re-paint these or the joints will drift
 * between a transom and a slab band.
 */
export function createModernMaterials(renderer: THREE.WebGLRenderer) {
  const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const textures: THREE.Texture[] = [];
  const output = {} as Record<SurfaceName, THREE.MeshStandardMaterial>;

  const finishTexture = (texture: THREE.Texture) => {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = maxAnisotropy;
    textures.push(texture);
    return texture;
  };

  for (const [name, base] of Object.entries(PALETTE) as [SurfaceName, string][]) {
    // --- reflective glass -------------------------------------------------
    // Curtain wall glass is OPAQUE mirror glass. At building scale that is both
    // what real coated glass looks like and the only way to get a crisp sky /
    // city reflection without fighting transparency sorting across hundreds of
    // bays. The construction reads because you see the bare frame before the
    // glass sweeps around and seals each floor.
    if (name === "glass" || name === "glassDeep") {
      const dark = name === "glassDeep";
      output[name] = new THREE.MeshPhysicalMaterial({
        color: base, metalness: dark ? 0.86 : 0.88, roughness: dark ? 0.07 : 0.055,
        envMapIntensity: dark ? 1.15 : 1.45, clearcoat: 1, clearcoatRoughness: 0.04,
        vertexColors: true,
      });
      continue;
    }
    // Lobby and atrium glass stays see-through so the warm interior is visible
    // from the street. This is the single most important material in the scene:
    // it is what turns a dusk facade into a place with people behind it.
    if (name === "glassClear") {
      output[name] = new THREE.MeshPhysicalMaterial({
        color: base, metalness: 0.06, roughness: 0.03, transparent: true, opacity: 0.26,
        envMapIntensity: 1.3, clearcoat: 1, clearcoatRoughness: 0.03, vertexColors: true,
      });
      continue;
    }
    if (EMISSIVE[name]) {
      const spec = EMISSIVE[name]!;
      output[name] = new THREE.MeshStandardMaterial({
        color: base, emissive: new THREE.Color(spec.color), emissiveIntensity: spec.intensity,
        roughness: 0.55, metalness: 0, vertexColors: true,
      });
      continue;
    }
    // Car paint: clearcoat is what separates "car" from "grey box" at this scale.
    if (name === "carPaint") {
      output[name] = new THREE.MeshPhysicalMaterial({
        color: base, metalness: 0.55, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12,
        envMapIntensity: 1.1, vertexColors: true,
      });
      continue;
    }
    // --- signage ----------------------------------------------------------
    // The wording lives here because the material owns its texture. Sign panels
    // are placed by `complex.ts`, which only has to decide where they hang.
    // `alphaTest` (not `transparent`) keeps the glyphs in the opaque queue.
    if (name === "signage" || name === "signageAlt") {
      const texture = createSignTexture(
        name === "signage" ? ["杭", "州", "大", "厦"] : ["LOUIS VUITTON"],
        { vertical: name === "signage", width: name === "signage" ? 256 : 160, length: name === "signage" ? 1280 : 1920 },
      );
      textures.push(texture);
      output[name] = new THREE.MeshStandardMaterial({
        map: texture, alphaTest: 0.45, roughness: 0.44, metalness: 0.10,
        envMapIntensity: 0.6, vertexColors: true,
      });
      continue;
    }

    // --- pigment ---------------------------------------------------------
    const feature = FEATURE[name];
    const size = name === "concrete" || name === "concreteDeep" || name === "white" ? 1024 : 512;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const rand = makeRandom(83 + name.length * 101);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);

    if (feature === "boardform") {
      // Board-form joints every 25 cm plus the tie-rod holes that hold the
      // formwork: the two marks that make concrete read as cast, not painted.
      const board = size / 4;
      for (let y = 0; y < size; y += board) {
        ctx.fillStyle = "rgba(58,55,50,.20)";
        ctx.fillRect(0, y, size, 2);
        ctx.fillStyle = "rgba(255,252,244,.12)";
        ctx.fillRect(0, y + 2, size, 1.5);
      }
      for (let y = board / 2; y < size; y += board) {
        for (let x = board / 2; x < size; x += board) {
          const r = size * 0.006;
          ctx.fillStyle = "rgba(48,45,40,.42)";
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "rgba(255,250,240,.20)";
          ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.5, 0, Math.PI * 2); ctx.fill();
        }
      }
      // Rain runs below the joints — vertical, never circular stains.
      for (let i = 0; i < 34; i++) {
        const x = rand() * size, w = size * (0.004 + rand() * 0.02), h = size * (0.1 + rand() * 0.5);
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, "rgba(74,78,70,.13)");
        g.addColorStop(1, "rgba(74,78,70,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x, rand() * size * 0.4, w, h);
      }
    }

    if (feature === "stonepanel") {
      // Large-format stone cladding. One panel per texture tile (= 1 m), joint
      // drawn once at the tile edge, so a 17 m wing shows a calm 1 m grid rather
      // than a busy brick pattern. Wet-polished at dusk: the joints are the only
      // thing that keeps a white wall from reading as untextured plastic.
      ctx.fillStyle = "rgba(126,124,118,.34)";
      ctx.fillRect(0, 0, 2.5, size);
      ctx.fillRect(0, 0, size, 2.5);
      ctx.fillStyle = "rgba(255,255,255,.55)";
      ctx.fillRect(2.5, 0, 1.5, size);
      ctx.fillRect(0, 2.5, size, 1.5);
      // Faint vertical panel-to-panel tone drift, so a long run is not a mirror.
      for (let x = 0; x < size; x += size / 4) {
        ctx.fillStyle = `rgba(150,148,142,${0.02 + rand() * 0.035})`;
        ctx.fillRect(x, 0, size / 8, size);
      }
    }

    if (feature === "brushed") {
      for (let i = 0; i < 1400; i++) {
        const x = rand() * size;
        ctx.strokeStyle = rand() > 0.5 ? `rgba(255,255,255,${0.02 + rand() * 0.09})` : `rgba(40,44,48,${0.02 + rand() * 0.08})`;
        ctx.lineWidth = 0.5 + rand() * 1.4;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + (rand() - 0.5) * 6, size);
        ctx.stroke();
      }
    }

    if (feature === "slats") {
      const slat = size / 8;
      for (let x = 0; x < size; x += slat) {
        ctx.fillStyle = "rgba(60,38,18,.34)";
        ctx.fillRect(x, 0, 3, size);
        for (let i = 0; i < 14; i++) {
          ctx.strokeStyle = i % 3 ? "rgba(92,58,26,.10)" : "rgba(255,226,180,.12)";
          ctx.lineWidth = 0.4 + rand() * 1.2;
          const gx = x + 4 + rand() * (slat - 8);
          ctx.beginPath();
          ctx.moveTo(gx, 0);
          for (let y = 0; y <= size; y += 16) ctx.lineTo(gx + Math.sin(y * 0.03 + gx) * 1.6, y);
          ctx.stroke();
        }
      }
    }

    if (feature === "foliage" || feature === "gravel" || feature === "speckle") {
      const blobs = feature === "foliage" ? 340 : feature === "gravel" ? 1500 : 900;
      for (let i = 0; i < blobs; i++) {
        const x = rand() * size, y = rand() * size;
        const r = feature === "foliage" ? size * (0.02 + rand() * 0.09) : size * (0.004 + rand() * 0.012);
        const v = 0.5 + rand() * 0.5;
        ctx.fillStyle =
          feature === "foliage"
            ? (i % 3 ? `rgba(30,52,22,${0.05 + rand() * 0.14})` : `rgba(178,206,126,${0.05 + rand() * 0.12})`)
            : `rgba(${Math.floor(150 * v)},${Math.floor(148 * v)},${Math.floor(142 * v)},${0.18 + rand() * 0.22})`;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Mineral clouding: pigment ages in patches, not per texel.
    for (let i = 0; i < 170; i++) {
      const x = rand() * size, y = rand() * size, r = size * (0.02 + rand() * 0.13);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, i % 3 ? "rgba(44,42,36,.045)" : "rgba(252,250,240,.055)");
      gradient.addColorStop(1, "rgba(120,116,104,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // Fine grain, denser on the materials that are supposed to feel sandy.
    const grain = size === 1024 ? 26000 : 9000;
    for (let i = 0; i < grain; i++) {
      ctx.fillStyle = rand() > 0.45
        ? `rgba(255,252,244,${0.03 + rand() * 0.12})`
        : `rgba(34,32,28,${0.025 + rand() * 0.09})`;
      const s = 0.5 + rand() * 1.6;
      ctx.fillRect(rand() * size, rand() * size, s, s);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    finishTexture(texture);

    // Micro-height only. Stains are not craters, so the bump map stays flat
    // banding-free noise and the roughness map carries the weathering.
    const detail = document.createElement("canvas");
    detail.width = detail.height = 256;
    const dc = detail.getContext("2d")!;
    const pixels = dc.createImageData(256, 256);
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const i = (y * 256 + x) * 4;
        const v = 128 + (rand() - 0.5) * (name === "stone" || name === "roof" ? 70 : 26);
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = v;
        pixels.data[i + 3] = 255;
      }
    }
    dc.putImageData(pixels, 0, 0);
    const bump = finishTexture(new THREE.CanvasTexture(detail));

    const roughCanvas = document.createElement("canvas");
    roughCanvas.width = roughCanvas.height = 256;
    const roughCtx = roughCanvas.getContext("2d")!;
    const polished = name === "stone" || name === "white";
    roughCtx.fillStyle = polished ? "#8e8e8e" : name === "wood" ? "#d6d6d6" : "#efefef";
    roughCtx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 90; i++) {
      roughCtx.fillStyle = `rgba(58,58,58,${0.02 + rand() * 0.05})`;
      roughCtx.fillRect(rand() * 256, rand() * 256, 8 + rand() * 36, 8 + rand() * 36);
    }
    const roughness = finishTexture(new THREE.CanvasTexture(roughCanvas));

    const bumpScale =
      name === "concrete" ? 0.010 : name === "concreteDeep" ? 0.008 : name === "white" ? 0.002
      : name === "wood" ? 0.016 : name === "roof" ? 0.030 : name === "stone" ? 0.020
      : name === "paving" ? 0.022 : name === "asphalt" ? 0.014 : 0.006;

    const metal = name === "mullion" ? 0.92 : name === "steel" ? 0.78 : 0;
    output[name] = new THREE.MeshStandardMaterial({
      map: texture, bumpMap: bump, roughnessMap: roughness, bumpScale,
      roughness: name === "mullion" ? 0.30 : name === "steel" ? 0.54 : name === "stone" ? 0.62
        : name === "white" ? 0.50 : name === "asphalt" ? 0.82 : name === "roof" ? 0.9 : 0.94,
      metalness: metal,
      // Reflection strength against the procedural sky. Concrete barely picks it
      // up; polished stone and the metal work are what sell the scale.
      envMapIntensity: name === "mullion" ? 1.0 : name === "steel" ? 0.75
        : name === "white" ? 0.62 : name === "stone" ? 0.5 : 0.30,
      vertexColors: true,
    });
  }

  return {
    materials: output,
    /**
     * Scale every interior-light material at once — the per-hour half of "is the
     * building occupied".
     *
     * This is a plain material property, so it costs no shader recompile: the
     * growth shader's per-piece `rampedEmissive` ramp multiplies on top of it and
     * is untouched by the change. `setInterior(0)` at noon therefore leaves the
     * atrium glass and shopfront glow behind it dark, which is exactly what a
     * closed building should look like in daylight.
     */
    setInterior(factor: number) {
      for (const name of Object.keys(EMISSIVE) as SurfaceName[]) {
        const material = output[name];
        if (material) material.emissiveIntensity = EMISSIVE[name]!.intensity * factor;
      }
    },
    dispose() {
      textures.forEach((t) => t.dispose());
      Object.values(output).forEach((m) => m.dispose());
    },
  };
}

/**
 * A procedural equirectangular sky, pre-filtered into an environment map *and*
 * returned as a background texture. Which sky is drawn comes from a `SkySpec`
 * in `daylight.ts`, so one function serves all four hours of the day.
 *
 * Two jobs, one canvas. As an environment map it is what makes glass read as
 * glass: outside of noon there is no strong sun, so most of a facade's
 * brightness arrives as reflection. A uniform colour environment gives a flat,
 * dead sheen; what the curtain wall actually mirrors is the **hard horizon line**
 * plus whatever sits on it — warm city glow at dusk, white haze at noon,
 * deep indigo at night.
 *
 * As `scene.background` it puts the horizon at the true horizon line. That
 * matters: a CSS gradient on the page behind the canvas cannot do it, because
 * where the horizon lands in the frame depends on the camera's pitch, and it
 * moves the moment anyone orbits.
 *
 * Costs one 1024×512 canvas and one PMREM pass. Switching hour rebuilds it, so
 * the caller must dispose the previous `environment` + `sky`.
 */
export function createSkyEnvironment(
  renderer: THREE.WebGLRenderer,
  sky: SkySpec,
  /** 0 = every interior light off (noon), 1 = fully lit (night). */
  interior: number,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  // v = 0.5 is the horizon, 0 is the zenith, 1 the nadir. The band below the
  // horizon has to fall away fast into a tone close to the lit ground, or the
  // far edge of the ground plane shows as a seam.
  const gradient = ctx.createLinearGradient(0, 0, 0, 512);
  // Where the stops sit is decided by the camera, not by taste — see the header
  // of `daylight.ts`. What matters here is only that the stops in the spec were
  // authored against the slice of v the stations can actually see.
  for (const [v, color] of sky.stops) gradient.addColorStop(v, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1024, 512);

  const rand = makeRandom(4242);

  // City-glow pools straddling the horizon, at different azimuths, so the
  // reflection travels as the camera orbits instead of pulsing.
  //
  // FLATTEN THE Y AXIS. The texture is equirect 1024×512, so it is 2:1 and one
  // canvas pixel of *height* is worth 0.35° of elevation while one pixel of
  // width is worth 0.35° of azimuth — but a radial gradient drawn on it is
  // circular in pixels, which silently turns a 230 px radius into ~81° of
  // elevation. That is the whole sky. Squashing y by 0.22 brings the pool back
  // to a ~18° light dome sitting on the horizon, which is what a city at dusk
  // actually throws up.
  for (const [cx, spread, alpha] of sky.glows) {
    const pool = ctx.createRadialGradient(cx, 258, 0, cx, 258, spread);
    pool.addColorStop(0, `rgba(255,198,126,${alpha})`);
    pool.addColorStop(0.45, `rgba(246,158,92,${alpha * 0.45})`);
    pool.addColorStop(1, "rgba(240,150,80,0)");
    ctx.save();
    ctx.translate(0, 258); ctx.scale(1, 0.22); ctx.translate(0, -258);
    ctx.fillStyle = pool;
    ctx.fillRect(0, 258 - spread * 0.22 - 4, 1024, spread * 0.44 + 8);
    ctx.restore();
  }

  // Cloud bands in the upper sky. Dim and cool, but they give the mirror glass a
  // gradient to slide over, which is the cheapest way to make it feel wet. The
  // multiplier per hour is what makes noon hazy and night clear.
  if (sky.cloud > 0.01) {
    for (let i = 0; i < 30; i++) {
      const x = rand() * 1024, y = 50 + rand() * 180, w = 70 + rand() * 260, h = 6 + rand() * 20;
      const tint = i % 3 === 0 ? "206,150,140" : sky.cloudTint;
      const a = (0.12 + rand() * 0.22) * sky.cloud;
      const cloud = ctx.createRadialGradient(x, y, 0, x, y, w);
      cloud.addColorStop(0, `rgba(${tint},${a})`);
      cloud.addColorStop(1, `rgba(${tint},0)`);
      ctx.save();
      ctx.translate(x, y); ctx.scale(1, h / w); ctx.translate(-x, -y);
      ctx.fillStyle = cloud;
      ctx.beginPath(); ctx.arc(x, y, w, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // A handful of lit windows in the ground half — the neighbouring blocks. They
  // are only a few pixels, but they are what stops the lower hemisphere from
  // reading as flat asphalt in the facade reflections. They follow the hour too:
  // a city that has its own lights off at noon should not be shining back at us.
  const windowAlpha = 0.15 + 0.85 * clamp01(interior);
  for (let i = 0; i < 240; i++) {
    const x = rand() * 1024, y = 274 + rand() * 120;
    ctx.fillStyle = rand() > 0.3
      ? `rgba(255,206,150,${(0.20 + rand() * 0.55) * windowAlpha})`
      : `rgba(190,220,255,${(0.15 + rand() * 0.35) * windowAlpha})`;
    ctx.fillRect(x, y, 1 + rand() * 2.4, 1 + rand() * 2.2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromEquirectangular(texture);
  pmrem.dispose();
  // `texture` stays alive: the caller uses it as scene.background.
  return { environment, sky: texture };
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * The page behind the canvas is the sky, so the two must agree or the miniature
 * floats on a rectangle that belongs to a different hour of the day. This paints
 * the same blue-hour gradient the environment map uses, as CSS.
 */
export const DUSK_BACKDROP =
  "linear-gradient(180deg,#0b1730 0%,#132a4d 22%,#234a72 40%,#3f6c92 54%,#8ea6b4 64%,#d9b183 70%,#f0a865 74%,#5c4a3a 80%,#302a24 92%,#16130f 100%)";
