import type { Point, StructureBuilder } from "./builder";
import type { SurfaceName } from "./materials";

/**
 * Every phase is an interval in the single 0..1 construction progress. Phases
 * overlap on purpose: a real site raises the tower frame while the retail podium
 * is still being clad, and overlapping reads as a place that is being built
 * rather than as a slideshow. `glassTower` and `tower` are subdivided per storey
 * below.
 */
export const PHASE = {
  site: [0.000, 0.075] as [number, number],
  plinth: [0.045, 0.125] as [number, number],
  /** White stone podium wings. The bulk of the building, and the bulk of the
   *  construction: each wing climbs as five full-height stone lifts. */
  wings: [0.095, 0.330] as [number, number],
  /** Glazed atrium: curtain wall, then its roof. */
  atrium: [0.300, 0.470] as [number, number],
  /** The dark curtain-wall tower behind everything. Tallest thing on site, so it
   *  starts early and finishes late — that is what a real programme looks like. */
  glassTower: [0.320, 0.700] as [number, number],
  /** White stone tower rising off the left wing. */
  tower: [0.420, 0.750] as [number, number],
  canopy: [0.600, 0.690] as [number, number],
  /** LOUIS VUITTON and the vertical 杭州大厦 characters. */
  signage: [0.680, 0.790] as [number, number],
  street: [0.750, 0.885] as [number, number],
  /** Every emissive piece is scheduled here, so the finale is the building
   *  coming alive at dusk rather than another pile of geometry. */
  lighting: [0.800, 0.996] as [number, number],
};

export type Footprint = { cx: number; hx: number; cz: number; hz: number };

/* --- design constants ------------------------------------------------------
 * One metre per world unit, floor-to-floor 3.6–3.7. Change one of these and the
 * lift loops, the glazing, the signage heights and the camera presets all have
 * to follow. Nothing downstream hard-codes a coordinate. */

export const PLINTH = { hx: 41, hz: 24.5, cz: -9, h: 0.9 };

export const WING_H = 16.0;
export const WING_TOP = PLINTH.h + WING_H;   // 16.9

/** Left and right wings run along the street; the back wing closes the atrium. */
export const WING_L: Footprint = { cx: -22, hx: 10, cz: -1, hz: 15 };
export const WING_R: Footprint = { cx: 22, hx: 10, cz: -1, hz: 15 };
export const WING_B: Footprint = { cx: 0, hx: 12, cz: -23, hz: 7 };
export const WINGS = [WING_L, WING_R, WING_B];

/** Glazed atrium. Its front face is deliberately set back from the wings so the
 *  two stone blocks frame a recessed bay instead of one flat wall. */
export const ATRIUM: Footprint = { cx: 0, hx: 12, cz: -3, hz: 13 };
export const ATRIUM_FRONT = ATRIUM.cz + ATRIUM.hz;   // 10

/** White stone tower, standing on the left wing. */
export const TOWER: Footprint = { cx: -24.5, hx: 7.5, cz: -8, hz: 8 };
export const TOWER_BASE = WING_TOP;
export const TOWER_FLOOR_H = 3.7;
export const TOWER_FLOORS = 10;
export const TOWER_ROOF = TOWER_BASE + TOWER_FLOORS * TOWER_FLOOR_H;   // 53.9

/** Dark curtain-wall tower behind the left wing. Taller than the stone tower,
 *  which is what makes it read as a separate mass rather than a parapet. */
export const GLASS_TOWER: Footprint = { cx: -32, hx: 8, cz: -39, hz: 7 };
export const GLASS_FLOOR_H = 3.6;
export const GLASS_FLOORS = 16;
export const GLASS_ROOF = PLINTH.h + GLASS_FLOORS * GLASS_FLOOR_H;   // 58.5

/** Dark glazed block on the far right, closing the composition. */
export const DARK_BLOCK: Footprint = { cx: 36, hx: 4, cz: -2, hz: 12 };
export const DARK_FLOORS = 8;
export const DARK_ROOF = PLINTH.h + DARK_FLOORS * 3.6;   // 29.7

/** Street edge = the front edge of the plinth. */
export const KERB_Z = PLINTH.cz + PLINTH.hz;   // 15.5

const SHOP_GLASS_BOTTOM = PLINTH.h + 0.35;
const SHOP_GLASS_TOP = PLINTH.h + 4.3;
const SHOP_FASCIA_TOP = PLINTH.h + 4.8;
const UPPER_LIFTS = 5;
const WING_LIFT_GAP = 0.13;
const CANOPY_Y = PLINTH.h + 6.4;   // 7.3 — lands on an atrium transom

const at = (span: [number, number], u: number) => span[0] + (span[1] - span[0]) * u;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Radial fraction of a point around a footprint's axis, used to stagger glazing
 *  so a curtain wall sweeps around the building instead of closing in one gulp. */
function sweep(f: Footprint, x: number, z: number) {
  const angle = Math.atan2((z - f.cz) / f.hz, (x - f.cx) / f.hx);
  return (angle + Math.PI) / (Math.PI * 2);
}

type Face = { axis: "x" | "z"; sign: number };

/** Wall of one lift: front, two flanks, back.
 *
 *  The four walls are separate pieces on purpose. A single solid box would land
 *  as one slab and read as a crate being dropped; four walls read as formwork
 *  being struck, and they leave the volume hollow so an unfinished storey shows
 *  its own interior. `panels` splits the street-facing wall along its control
 *  joints, which is what makes a 20 m run of stone read as cladding.
 */
function lift(
  b: StructureBuilder,
  f: Footprint,
  y0: number,
  h: number,
  thickness: number,
  material: SurfaceName,
  start: number,
  options: { panels?: number; shade?: number; duration?: number; travel?: number } = {},
) {
  const panels = options.panels ?? 1;
  const duration = options.duration ?? 0.026;
  const travel = options.travel ?? 2.0;
  const shade = options.shade ?? 1;
  const cy = y0 + h / 2;
  const front = f.cz + f.hz - thickness / 2;

  if (panels <= 1) {
    b.box([f.hx * 2, h, thickness], [f.cx, cy, front], material, start, { duration, lift: travel, shade });
  } else {
    const pitch = (f.hx * 2) / panels;
    for (let k = 0; k < panels; k++) {
      const x = f.cx - f.hx + pitch * (k + 0.5);
      b.box([pitch - WING_LIFT_GAP, h, thickness], [x, cy, front], material, start + k * 0.0016, {
        duration, lift: travel, shade: shade * (k % 3 === 2 ? 0.972 : 1),
      });
    }
  }
  // Flanks get an identical shade — they face the same light — and the back is
  // pushed darker as cheap ambient occlusion.
  const flank: Point = [thickness, h, f.hz * 2 - thickness * 2];
  b.box(flank, [f.cx - f.hx + thickness / 2, cy, f.cz], material, start + 0.005, {
    duration, lift: travel, shade: shade * 0.96,
  });
  b.box(flank, [f.cx + f.hx - thickness / 2, cy, f.cz], material, start + 0.010, {
    duration, lift: travel, shade: shade * 0.96,
  });
  b.box([f.hx * 2 - thickness * 2, h, thickness], [f.cx, cy, f.cz - f.hz + thickness / 2], material, start + 0.014, {
    duration, lift: travel, shade: shade * 0.88,
  });
}

/** Address a point on one face of a footprint. `t` runs along the face, `depth`
 *  is an offset along the outward normal (positive = out of the building). */
function onFace(f: Footprint, face: Face) {
  const half = face.axis === "z" ? f.hx : f.hz;
  const plane = (face.axis === "z" ? f.hz : f.hx) * face.sign;
  return {
    half,
    point: (t: number, y: number, depth: number): Point =>
      face.axis === "z"
        ? [f.cx + t, y, f.cz + plane + depth * face.sign]
        : [f.cx + plane + depth * face.sign, y, f.cz + t],
    /** Box dimensions for a wall lying on this face. */
    slab: (width: number, height: number, depth: number): Point =>
      face.axis === "z" ? [width, height, depth] : [depth, height, width],
  };
}

/**
 * Retail glazing along one face of a wing.
 *
 * The single most important thing in the whole scene at dusk: this is where the
 * warm interior light escapes. Everything above it is cold, closed stone, so the
 * ground floor is the only place the building admits it is inhabited.
 */
function shopfront(b: StructureBuilder, f: Footprint, face: Face, bayWidth: number, index: number) {
  const top = SHOP_GLASS_TOP;
  const h = top - SHOP_GLASS_BOTTOM;
  const cy = (SHOP_GLASS_BOTTOM + top) / 2;
  const { half, point, slab } = onFace(f, face);
  const bays = Math.max(2, Math.round((half * 2) / bayWidth));
  const pitch = (half * 2) / bays;
  const pierW = 0.95;
  const span = PHASE.wings;
  const base = lerp(span[0], span[1], index * 0.09);

  for (let k = 0; k <= bays; k++) {
    const t = -half + k * pitch;
    b.box(slab(pierW, h, 0.9), point(t, cy, 0), "white", base + 0.30 + (k / bays) * 0.16, {
      duration: 0.022, lift: 1.5, shade: 0.98,
    });
  }
  for (let k = 0; k < bays; k++) {
    const t = -half + pitch * (k + 0.5);
    const w = pitch - pierW;
    b.box(slab(w, h, 0.12), point(t, cy, -0.24), "glassClear", base + 0.46 + (k / bays) * 0.20, {
      duration: 0.024, lift: 2.2,
      drift: face.axis === "z" ? [0, 1, 0.8 * face.sign] : [0.8 * face.sign, 1, 0],
    });
    // The lit shop behind the glass. Scheduled in the lighting window, so the
    // street comes alive after the buildings are finished, not during.
    b.box(slab(w * 0.9, h - 1.1, 0.2), point(t, cy - 0.15, -1.5), "glowHot",
      lerp(PHASE.lighting[0], PHASE.lighting[1], 0.04 + (k / bays) * 0.22), { duration: 0.02, lift: 0.05 });
  }

  // Dark stone fascia capping the shopfront — the datum that separates the lit
  // ground floor from the blank stone above.
  b.box(slab(half * 2, SHOP_FASCIA_TOP - top + 0.5, 1.0), point(0, top + 0.25, 0.02), "stoneDark",
    base + 0.68, { duration: 0.024, lift: 1.6 });
}

function buildWing(b: StructureBuilder, f: Footprint, index: number) {
  const thickness = 0.7;
  const upperH = WING_TOP - SHOP_FASCIA_TOP;
  const liftH = upperH / UPPER_LIFTS;
  const span = PHASE.wings;
  const base = lerp(span[0], span[1], index * 0.09);

  for (let i = 0; i < UPPER_LIFTS; i++) {
    lift(b, f, SHOP_FASCIA_TOP + i * liftH, liftH - WING_LIFT_GAP, thickness, "white",
      base + (i / UPPER_LIFTS) * 0.60, {
        panels: 6, duration: 0.026, travel: 2.0, shade: 1 - i * 0.008,
      });
  }

  // A shadow gap reads as a floor line without costing a material.
  for (let i = 1; i < UPPER_LIFTS; i++) {
    b.box([f.hx * 2 + 0.06, 0.1, 0.14], [f.cx, SHOP_FASCIA_TOP + i * liftH - 0.05, f.cz + f.hz + 0.03],
      "stoneDark", base + (i / UPPER_LIFTS) * 0.60, { duration: 0.016, lift: 1.0, shade: 0.8 });
  }

  // Parapet: white band plus a dark coping, so the top of a blank stone mass
  // still ends deliberately.
  b.box([f.hx * 2 + 0.7, 0.9, f.hz * 2 + 0.7], [f.cx, WING_TOP + 0.45, f.cz], "white", base + 0.72, {
    duration: 0.024, lift: 1.3,
  });
  b.box([f.hx * 2 + 0.9, 0.18, f.hz * 2 + 0.9], [f.cx, WING_TOP + 0.99, f.cz], "stoneDark", base + 0.80, {
    duration: 0.018, lift: 0.8,
  });

  // Shops face the street; the two inner faces also light the atrium, which is
  // what makes the glazed hall worth looking into.
  if (f === WING_L) { shopfront(b, f, { axis: "z", sign: 1 }, 3.4, 0); shopfront(b, f, { axis: "x", sign: 1 }, 3.6, 0); }
  else if (f === WING_R) { shopfront(b, f, { axis: "z", sign: 1 }, 3.4, 1); shopfront(b, f, { axis: "x", sign: -1 }, 3.6, 1); }
  else { shopfront(b, f, { axis: "z", sign: 1 }, 3.6, 2); }
}

function buildPlinth(b: StructureBuilder) {
  const span = PHASE.plinth;
  b.box([PLINTH.hx * 2, PLINTH.h, PLINTH.hz * 2], [0, PLINTH.h / 2, PLINTH.cz], "white", at(span, 0.05), {
    duration: 0.05, lift: 1.1,
  });
  // Dark stone toe. Without it the white plinth melts into the paving.
  b.box([PLINTH.hx * 2 + 1.2, 0.34, PLINTH.hz * 2 + 1.2], [0, 0.17, PLINTH.cz], "stoneDark", at(span, 0.0), {
    duration: 0.04, lift: 0.7, shade: 0.72,
  });
}

/**
 * The glazed hall between the wings.
 *
 * Built as a real curtain wall — mullions, transoms, one pane per bay per row —
 * because each pane is a separate piece and therefore a separate beat in the
 * construction. Behind it sits a lit interior volume, so from the street the
 * atrium reads as a warm room rather than a mirror.
 */
function buildAtrium(b: StructureBuilder) {
  const span = PHASE.atrium;
  const bottom = PLINTH.h;
  const top = WING_TOP;
  const rows = 5;
  const rowH = (top - bottom) / rows;
  const bays = 14;
  const pitch = (ATRIUM.hx * 2) / bays;
  const face: Face = { axis: "z", sign: 1 };
  const { point, slab } = onFace(ATRIUM, face);
  const mullionW = 0.16;

  // Curtain wall mullions.
  for (let k = 0; k <= bays; k++) {
    const t = -ATRIUM.hx + k * pitch;
    b.box(slab(mullionW, top - bottom, 0.3), point(t, (bottom + top) / 2, 0), "mullion",
      at(span, 0.06 + (k / bays) * 0.30), { duration: 0.020, lift: 2.0 });
  }
  // Transoms, one per row line.
  for (let r = 0; r <= rows; r++) {
    b.box(slab(ATRIUM.hx * 2, 0.14, 0.26), point(0, bottom + r * rowH, 0.02), "mullion",
      at(span, 0.10 + (r / rows) * 0.22), { duration: 0.020, lift: 2.0 });
  }
  // Glazing. The sweep is taken around the atrium's own axis so the panes close
  // from one end to the other instead of all at once.
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < bays; k++) {
      const t = -ATRIUM.hx + pitch * (k + 0.5);
      const y = bottom + rowH * (r + 0.5);
      b.box(slab(pitch - mullionW, rowH - 0.14, 0.08), point(t, y, 0), "glassClear",
        at(span, 0.34 + sweep(ATRIUM, t, ATRIUM.cz + ATRIUM.hz) * 0.20 + r * 0.012), {
          duration: 0.024, lift: 2.4, drift: [0, 1, 0.85],
        });
    }
  }

  // Interior. Three mezzanine levels, pulled back from the glazing line: filling
  // the full footprint would put white plates right behind the glass and the warm
  // interior would never be visible from the street. Each level carries a lit
  // fascia, so the hall reads as a stack of shopping floors rather than a void —
  // and the floor lines are what the eye measures the height against.
  const mezzDepth = ATRIUM.hz * 2 - 10;
  const mezzCz = ATRIUM.cz - 3;
  for (let i = 1; i <= 3; i++) {
    const y = PLINTH.h + 3.9 * i;
    // Dark interior surfaces, so the warm light has something to read against.
    // A white slab here throws the sky back at the camera and the hall looks like
    // an empty car park however bright the emissives are.
    b.box([ATRIUM.hx * 2 - 0.6, 0.42, mezzDepth], [0, y, mezzCz], "concreteDeep",
      at(span, 0.28 + i * 0.08), { duration: 0.024, lift: 1.6, shade: 0.40 + i * 0.03 });
    b.box([ATRIUM.hx * 2 - 1.0, 1.2, 0.24], [0, y - 0.72, mezzCz + mezzDepth / 2], "glowHot",
      lerp(PHASE.lighting[0], PHASE.lighting[1], 0.06 + i * 0.09), { duration: 0.02, lift: 0.05 });
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.box([0.9, WING_TOP - PLINTH.h, 0.9], [sx * (ATRIUM.hx - 2.2), (PLINTH.h + WING_TOP) / 2, ATRIUM.cz + sz * (ATRIUM.hz - 3)],
        "white", at(span, 0.24), { duration: 0.026, lift: 2.2, shade: 0.9 });
    }
  }
  // The lit back wall: the source of the glow you see through the glass from the
  // street. Pushed as close to the mezzanines as it can go without touching them,
  // so enough of it stays visible in the gaps between floors. Scheduled in the
  // lighting window.
  b.box([ATRIUM.hx * 2 - 1.0, WING_TOP - PLINTH.h - 2.0, 0.3], [0, (PLINTH.h + WING_TOP) / 2 + 0.4, mezzCz - mezzDepth / 2 - 1.6],
    "glowHot", lerp(PHASE.lighting[0], PHASE.lighting[1], 0.02), { duration: 0.024, lift: 0.05 });

  // Glazed roof. Without it the atrium is an open courtyard, and a high camera
  // looks straight down into it — which reads as a hole in the building rather
  // than as a hall. The panes are scheduled late so the hall closes over last.
  const roofBaysX = 6, roofBaysZ = 5;
  const roofZ0 = ATRIUM.cz - ATRIUM.hz, roofZ1 = ATRIUM.cz + ATRIUM.hz;
  const stepX = (ATRIUM.hx * 2) / roofBaysX;
  const stepZ = (roofZ1 - roofZ0) / roofBaysZ;
  for (let i = 0; i <= roofBaysX; i++) {
    b.box([0.18, 0.34, roofZ1 - roofZ0], [-ATRIUM.hx + i * stepX, WING_TOP + 0.17, ATRIUM.cz], "mullion",
      at(span, 0.62 + (i / roofBaysX) * 0.16), { duration: 0.020, lift: 1.6 });
  }
  for (let j = 0; j <= roofBaysZ; j++) {
    b.box([ATRIUM.hx * 2, 0.3, 0.16], [0, WING_TOP + 0.15, roofZ0 + j * stepZ], "mullion",
      at(span, 0.66 + (j / roofBaysZ) * 0.14), { duration: 0.020, lift: 1.6 });
  }
  for (let i = 0; i < roofBaysX; i++) {
    for (let j = 0; j < roofBaysZ; j++) {
      b.box([stepX - 0.18, 0.08, stepZ - 0.16],
        [-ATRIUM.hx + stepX * (i + 0.5), WING_TOP + 0.06, roofZ0 + stepZ * (j + 0.5)], "glassClear",
        at(span, 0.72 + ((i + j) / (roofBaysX + roofBaysZ)) * 0.24), { duration: 0.022, lift: 2.0 });
    }
  }
}

/** Entrance canopy: the one horizontal gesture in an otherwise vertical facade. */
function buildCanopy(b: StructureBuilder) {
  const span = PHASE.canopy;
  const depth = 9.5;
  const cz = ATRIUM_FRONT + depth / 2;
  b.box([30, 0.55, depth], [0, CANOPY_Y - 0.275, cz], "white", at(span, 0.10), { duration: 0.030, lift: 1.8 });
  b.box([28.4, 0.16, depth - 1.0], [0, CANOPY_Y - 0.63, cz], "glowHot",
    lerp(PHASE.lighting[0], PHASE.lighting[1], 0.06), { duration: 0.020, lift: 0.05 });
  // Slender steel posts. Four is enough; a forest of columns would compete with
  // the vertical mullions behind.
  for (const x of [-13.4, -4.6, 4.6, 13.4]) {
    b.cylinder(0.17, 0.17, CANOPY_Y - PLINTH.h - 0.55, [x, PLINTH.h + (CANOPY_Y - PLINTH.h - 0.55) / 2, cz + depth / 2 - 0.6],
      "steel", at(span, 0.52), { duration: 0.018, lift: 1.6 });
  }
}

/**
 * White stone tower over the left wing.
 *
 * Two walls are missing from the perimeter: the ones on the front-right corner
 * are replaced by a full-height glazed slot. That corner slot is the tower's
 * whole character — a blank white slab with one dark vertical cut through it.
 */
function buildWhiteTower(b: StructureBuilder) {
  const span = PHASE.tower;
  const thickness = 0.9;
  const front = TOWER.cz + TOWER.hz;          // z = 0
  const rightPlane = TOWER.cx + TOWER.hx;     // x = -17
  const slotW = 4.0;
  const stoneW = TOWER.hx * 2 - slotW;        // 11

  for (let i = 0; i < TOWER_FLOORS; i++) {
    const y0 = TOWER_BASE + i * TOWER_FLOOR_H;
    const h = TOWER_FLOOR_H - 0.14;
    const cy = y0 + h / 2;
    const start = at(span, (i / TOWER_FLOORS) * 0.84);
    const shade = 1 - (i % 4) * 0.006;

    // Front: stone wall + the glazed slot at its right end.
    b.box([stoneW, h, thickness], [TOWER.cx - TOWER.hx + stoneW / 2, cy, front - thickness / 2], "white", start, {
      duration: 0.026, lift: 2.2, shade,
    });
    b.box([slotW, h, 0.16], [rightPlane - slotW / 2, cy, front - 0.10], "glassDeep", start + 0.012, {
      duration: 0.022, lift: 2.4, drift: [0, 1, 0.8],
    });
    // Right flank: stone wall + the slot turning the corner.
    b.box([thickness, h, TOWER.hz * 2 - slotW], [rightPlane - thickness / 2, cy, TOWER.cz - slotW / 2], "white",
      start + 0.004, { duration: 0.026, lift: 2.2, shade: shade * 0.96 });
    b.box([0.16, h, slotW], [rightPlane - 0.10, cy, front - slotW / 2], "glassDeep", start + 0.016, {
      duration: 0.022, lift: 2.4, drift: [0.8, 1, 0],
    });
    // Far flank and back, closed.
    b.box([thickness, h, TOWER.hz * 2], [TOWER.cx - TOWER.hx + thickness / 2, cy, TOWER.cz], "white",
      start + 0.008, { duration: 0.026, lift: 2.2, shade: shade * 0.96 });
    b.box([TOWER.hx * 2 - thickness * 2, h, thickness], [TOWER.cx, cy, TOWER.cz - TOWER.hz + thickness / 2], "white",
      start + 0.010, { duration: 0.026, lift: 2.2, shade: shade * 0.88 });
  }

  const rs = PHASE.signage;
  // Roof slab, parapet and plant enclosure.
  b.box([TOWER.hx * 2 + 0.5, 0.5, TOWER.hz * 2 + 0.5], [TOWER.cx, TOWER_ROOF + 0.25, TOWER.cz], "white",
    at(rs, 0.0), { duration: 0.026, lift: 1.6 });
  b.box([TOWER.hx * 2 + 0.7, 1.1, 0.28], [TOWER.cx, TOWER_ROOF + 1.05, front + 0.1], "white", at(rs, 0.20), {
    duration: 0.022, lift: 1.2,
  });
  b.box([TOWER.hx * 2 + 0.7, 1.1, 0.28], [TOWER.cx, TOWER_ROOF + 1.05, TOWER.cz - TOWER.hz - 0.1], "white", at(rs, 0.24), {
    duration: 0.022, lift: 1.2, shade: 0.9,
  });
  for (const sx of [-1, 1]) {
    b.box([0.28, 1.1, TOWER.hz * 2], [TOWER.cx + sx * (TOWER.hx + 0.1), TOWER_ROOF + 1.05, TOWER.cz], "white",
      at(rs, 0.28), { duration: 0.022, lift: 1.2, shade: sx > 0 ? 1 : 0.9 });
  }
  b.box([6.4, 3.4, 6.0], [TOWER.cx - 1.0, TOWER_ROOF + 0.5 + 1.7, TOWER.cz - 1.2], "white", at(rs, 0.34), {
    duration: 0.028, lift: 2.4,
  });
}

/**
 * The dark curtain-wall tower.
 *
 * Five bays of glass per storey per visible face, each pane its own piece. This
 * is the piece count driver of the whole scene and the longest single phase —
 * deliberately, because a 58 m tower is the thing you want to watch being built.
 */
function buildGlassTower(b: StructureBuilder) {
  const span = PHASE.glassTower;
  const faces: Face[] = [
    { axis: "z", sign: 1 }, { axis: "x", sign: 1 }, { axis: "x", sign: -1 }, { axis: "z", sign: -1 },
  ];
  const paneH = GLASS_FLOOR_H - 0.72;

  for (let i = 0; i < GLASS_FLOORS; i++) {
    const y0 = PLINTH.h + i * GLASS_FLOOR_H;
    const start = at(span, (i / GLASS_FLOORS) * 0.90);
    const glassY = y0 + 0.42 + paneH / 2;

    b.box([GLASS_TOWER.hx * 2 + 0.4, 0.34, GLASS_TOWER.hz * 2 + 0.4], [GLASS_TOWER.cx, y0 + 0.17, GLASS_TOWER.cz],
      "stoneDark", start, { duration: 0.024, lift: 2.4, shade: 0.9 });

    faces.forEach((face, fi) => {
      const { half, point, slab } = onFace(GLASS_TOWER, face);
      const bays = face.axis === "z" ? 5 : 4;
      const pitch = (half * 2) / bays;
      const back = face.axis === "z" && face.sign === -1;

      if (!back) {
        for (let k = 0; k <= bays; k++) {
          b.box(slab(0.16, paneH + 0.3, 0.28), point(-half + k * pitch, glassY, 0.1), "mullion",
            start + 0.010, { duration: 0.017, lift: 2.0 });
        }
      }
      for (let k = 0; k < bays; k++) {
        const t = -half + pitch * (k + 0.5);
        b.box(slab(pitch - 0.16, paneH, 0.08), point(t, glassY, 0), "glassDeep",
          start + 0.022 + sweep(GLASS_TOWER, face.axis === "z" ? t : 0, face.axis === "z" ? 0 : t) * 0.006, {
            duration: 0.024, lift: 2.6,
            drift: face.axis === "z" ? [0, 1, 0.8 * face.sign] : [0.8 * face.sign, 1, 0],
          });
      }
    });
  }

  // Vertical service strip on the left edge: a brighter glass band that gives the
  // tower a corner highlight against the sky. The one thing that stops a dark
  // slab from reading as a silhouette.
  const stripX = GLASS_TOWER.cx - GLASS_TOWER.hx + 1.0;
  b.box([2.0, GLASS_ROOF - PLINTH.h - 1.0, 0.5], [stripX, (PLINTH.h + GLASS_ROOF) / 2, GLASS_TOWER.cz + GLASS_TOWER.hz + 0.2],
    "glass", at(PHASE.glassTower, 0.86), { duration: 0.05, lift: 3.0 });

  b.box([GLASS_TOWER.hx * 2 + 0.6, 0.5, GLASS_TOWER.hz * 2 + 0.6], [GLASS_TOWER.cx, GLASS_ROOF + 0.25, GLASS_TOWER.cz],
    "stoneDark", at(PHASE.glassTower, 0.96), { duration: 0.024, lift: 1.6 });
  // Roof plant and a beacon, the last thing on the tallest building to come on.
  b.box([7.0, 3.0, 6.0], [GLASS_TOWER.cx, GLASS_ROOF + 0.5 + 1.5, GLASS_TOWER.cz - 1.0], "stoneDark",
    at(PHASE.lighting, 0.30), { duration: 0.026, lift: 2.0, shade: 0.8 });
  b.sphere([GLASS_TOWER.cx, GLASS_ROOF + 5.4, GLASS_TOWER.cz - 1.0], [0.26, 0.26, 0.26], "glow",
    lerp(PHASE.lighting[0], PHASE.lighting[1], 0.94), { duration: 0.014, lift: 0.05 });
}

/** Dark glazed block closing the right of the composition. */
function buildDarkBlock(b: StructureBuilder) {
  const span = PHASE.glassTower;
  const thickness = 0.6;
  for (let i = 0; i < DARK_FLOORS; i++) {
    const y0 = PLINTH.h + i * 3.6;
    const h = 3.6 - 0.36;
    const cy = y0 + 0.18 + h / 2;
    const start = at(span, 0.24 + (i / DARK_FLOORS) * 0.66);
    b.box([DARK_BLOCK.hx * 2, 0.36, DARK_BLOCK.hz * 2], [DARK_BLOCK.cx, y0 + 0.18, DARK_BLOCK.cz], "stoneDark",
      start, { duration: 0.022, lift: 2.2, shade: 0.85 });
    lift(b, DARK_BLOCK, y0 + 0.36, 3.6 - 0.4, thickness, "glassDeep", start + 0.008, {
      duration: 0.024, travel: 2.4, shade: 1,
    });
  }
  b.box([DARK_BLOCK.hx * 2 + 0.5, 0.5, DARK_BLOCK.hz * 2 + 0.5], [DARK_BLOCK.cx, DARK_ROOF + 0.25, DARK_BLOCK.cz],
    "stoneDark", at(PHASE.lighting, 0.16), { duration: 0.024, lift: 1.5, shade: 0.85 });
}

/**
 * Signage. Both pieces are single letter-cut planes — the characters are drawn
 * on a transparent field and cut out with alphaTest, so they hang on the stone
 * the way real fabricated lettering does.
 */
function buildSignage(b: StructureBuilder) {
  const span = PHASE.signage;
  // Vertical characters on the blank front face of the stone tower.
  b.panel(3.6, 18, [TOWER.cx - 5.6, TOWER_BASE + 16.2, TOWER.cz + TOWER.hz + 0.06], "signage", at(span, 0.10), {
    duration: 0.030, lift: 1.4,
  });
  // Horizontal store name on the right wing.
  b.panel(11, 0.92, [WING_R.cx, PLINTH.h + 8.6, WING_R.cz + WING_R.hz + 0.06], "signageAlt", at(span, 0.46), {
    duration: 0.030, lift: 1.4,
  });
}

export function buildComplex(b: StructureBuilder) {
  buildPlinth(b);
  WINGS.forEach((wing, index) => buildWing(b, wing, index));
  buildAtrium(b);
  buildCanopy(b);
  buildWhiteTower(b);
  buildGlassTower(b);
  buildDarkBlock(b);
  buildSignage(b);
}

/** Storey index the animation is currently working on, for the HUD. Counted on
 *  the dark tower because it is the tallest mass and the one the eye watches. */
export function floorsAt(progress: number) {
  const span = PHASE.glassTower;
  if (progress <= span[0]) return 0;
  return Math.min(GLASS_FLOORS, Math.floor(((progress - span[0]) / (span[1] - span[0])) / 0.90 * GLASS_FLOORS));
}
