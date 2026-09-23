import type { StructureBuilder } from "./builder";
import { variation } from "./rng";
import { KERB_Z, PHASE } from "./complex";

/** Road geometry, all measured from the kerb line at the plinth edge.
 *
 *  Forecourt layout, back to front, with no overlaps:
 *    kerb 15.5 → steps 15.6–17.4 → bollards 19.6 → beds 20.5 → trees 23.4
 *    → road kerb 26 → carriageway 26–45 → far pavement 45–51.
 */
const STEP_DEPTH = 0.6;
const BOLLARD_Z = 19.6;
const ROAD = { z0: KERB_Z + 10.5, depth: 19.0 };
const FAR_WALK = { z0: ROAD.z0 + ROAD.depth, depth: 6.0 };
/** Half-width of the ground plate.
 *
 *  Sized so the plate's far edge lands close to the true horizon. A small base
 *  would read as a model on a board, but it would also put a hard edge right
 *  across the middle of the frame with a band of below-horizon sky above it —
 *  the one thing that gives away a fake sky. At 240 the edge sits far enough out
 *  that the warm horizon glow stays in view above it. */
const GROUND = { half: 240 };

/** Raised beds in the forecourt, either side of the entrance steps. */
export const PLANTERS: { x: number; z: number; len: number }[] = [
  { x: -22, z: 20.7, len: 12 },
  { x: -36, z: 20.7, len: 7 },
  { x: 22, z: 20.7, len: 12 },
  { x: 36, z: 20.7, len: 7 },
];

/**
 * Tree positions, shared with the vegetation module so the landscape plants
 * where the paving actually reserved a strip rather than at coordinates of its
 * own invention.
 */
export const TREE_SPOTS: [number, number, number][] = (() => {
  const spots: [number, number, number][] = [];
  // Near kerb: the avenue that frames the shopfronts. Kept tight to the kerb
  // line — a row out in the middle of the pavement stands between every close
  // camera station and the building it is supposed to frame.
  for (let i = 0; i < 13; i++) {
    const x = -58 + i * 9.6;
    spots.push([x + variation(i * 3 + 1) * 1.1, 0.28, 25.2 + variation(i * 3 + 2) * 0.5]);
  }
  // Far side of the road.
  for (let i = 0; i < 12; i++) {
    spots.push([-54 + i * 9.8 + variation(i + 40) * 1.6, 0.28, 47.8 + variation(i + 70) * 1.1]);
  }
  // Behind the complex, so an orbit never reveals a bare horizon.
  for (let i = 0; i < 9; i++) {
    spots.push([-52 + i * 13 + variation(i + 90) * 3.4, 0.28, -50 - variation(i + 120) * 4]);
  }
  return spots;
})();

const at = (span: [number, number], u: number) => span[0] + (span[1] - span[0]) * u;

/** Interior and street lighting all share the one emissive window, staggered so
 *  the scene comes alive outward from the atrium. */
const litAt = (u: number) => at(PHASE.lighting, 0.20 + u * 0.72);

type Car = { x: number; z: number; forward: number; tint: [number, number, number]; start: number };

/**
 * Traffic, both directions. Spaced out rather than jammed: the point is the
 * headlights, which are the only warm light sources at street level apart from
 * the shopfronts. `forward` is +1 for the near lane (travelling +X) and -1 for
 * the far one, so the two streams face each other.
 */
const CARS: Car[] = (() => {
  const cars: Car[] = [];
  const tints: [number, number, number][] = [
    [0.34, 0.36, 0.40], [1.55, 1.60, 1.62], [0.30, 0.30, 0.34], [1.10, 0.34, 0.30],
    [0.36, 0.42, 0.55], [1.30, 1.28, 1.18], [0.28, 0.34, 0.32],
  ];
  for (let i = 0; i < 7; i++) {
    const near = i % 2 === 0;
    cars.push({
      x: -52 + i * 17.5 + variation(i * 5 + 3) * 6,
      z: near ? ROAD.z0 + 5.0 : ROAD.z0 + ROAD.depth - 5.0,
      forward: near ? 1 : -1,
      tint: tints[i % tints.length],
      start: at(PHASE.street, 0.10 + i * 0.045),
    });
  }
  return cars;
})();

export function buildSite(b: StructureBuilder) {
  const site = PHASE.site;

  // Ground plate. One big slab; everything else is laid on top of it, so the
  // miniature has a definite edge instead of fading into nothing.
  b.box([GROUND.half * 2, 1.2, GROUND.half * 2], [0, -0.6, 0], "paving", at(site, 0.0), {
    duration: 0.05, lift: 1.0, shade: 0.62,
  });

  // --- road and pavements -------------------------------------------------
  b.box([GROUND.half * 2, 0.24, ROAD.depth], [0, 0.12, ROAD.z0 + ROAD.depth / 2], "asphalt", at(site, 0.16), {
    duration: 0.04, lift: 0.5, shade: 0.9,
  });
  b.box([GROUND.half * 2, 0.3, 10.5], [0, 0.15, KERB_Z + 5.25], "paving", at(site, 0.30), {
    duration: 0.03, lift: 0.5,
  });
  b.box([GROUND.half * 2, 0.3, FAR_WALK.depth], [0, 0.15, FAR_WALK.z0 + FAR_WALK.depth / 2], "paving", at(site, 0.38), {
    duration: 0.03, lift: 0.5, shade: 0.92,
  });
  // Kerbs. A light line at each edge of the carriageway is what gives the road
  // its width; without them asphalt and pavement merge into one field at dusk.
  for (const z of [ROAD.z0, ROAD.z0 + ROAD.depth]) {
    b.box([GROUND.half * 2, 0.36, 0.36], [0, 0.18, z], "white", at(site, 0.46), { duration: 0.03, lift: 0.5 });
  }
  // Centre line, dashed.
  for (let i = 0; i < 17; i++) {
    b.box([3.4, 0.04, 0.26], [-62 + i * 7.8, 0.255, ROAD.z0 + ROAD.depth / 2], "white",
      at(site, 0.56 + (i / 17) * 0.3), { duration: 0.02, lift: 0.3, shade: 0.95 });
  }

  // --- forecourt ----------------------------------------------------------
  // Raised beds. Cast with the paving; the planting arrives with the landscape.
  for (const [index, bed] of PLANTERS.entries()) {
    b.box([bed.len, 0.72, 3.4], [bed.x, 0.51, bed.z], "stoneDark", at(site, 0.70 + index * 0.04), {
      duration: 0.026, lift: 0.6,
    });
    b.box([bed.len - 0.5, 0.12, 2.9], [bed.x, 0.93, bed.z], "lawn", at(PHASE.street, 0.06 + index * 0.03), {
      duration: 0.02, lift: 0.3,
    });
  }
  // Three steps up to the plinth, spanning the entrance bay only.
  for (let i = 0; i < 3; i++) {
    b.box([30, 0.2, STEP_DEPTH], [0, 0.1 + i * 0.2, KERB_Z + 0.3 + i * STEP_DEPTH], "stone",
      at(site, 0.60 + i * 0.05), { duration: 0.024, lift: 0.4 });
  }

  // Bollard lights along the forecourt edge, inside the steps' span so they
  // never land in a planting bed.
  const bollards: [number, number][] = [];
  for (let k = 0; k < 9; k++) bollards.push([-14 + k * 3.5, BOLLARD_Z]);
  bollards.forEach(([x, z], index) => {
    b.box([0.26, 1.15, 0.26], [x, 0.875, z], "steel", at(PHASE.street, 0.34 + (index / bollards.length) * 0.30), {
      duration: 0.018, lift: 1.3,
    });
    // The lens shares the emissive surface used by the shopfronts, so the whole
    // street comes alight from one schedule instead of three.
    b.box([0.18, 0.3, 0.18], [x, 1.47, z], "glowHot", litAt((index / bollards.length) * 0.5), {
      duration: 0.016, lift: 0.05,
    });
  });

  // --- traffic -------------------------------------------------------------
  for (const car of CARS) {
    // The body box is already axis-aligned along X; `p` mirrors the offsets so a
    // car in the far lane points the other way.
    const p = (dx: number, y: number, dz: number): [number, number, number] =>
      [car.x + dx * car.forward, y, car.z + dz * car.forward];
    b.box([4.5, 0.86, 1.94], p(0, 0.78, 0), "carPaint", car.start, {
      duration: 0.026, lift: 1.4, tint: car.tint,
    });
    b.box([2.5, 0.72, 1.78], p(-0.15, 1.56, 0), "carPaint", car.start + 0.010, {
      duration: 0.024, lift: 1.6,
      tint: [car.tint[0] * 0.72, car.tint[1] * 0.72, car.tint[2] * 0.72],
    });
    b.box([2.36, 0.44, 1.82], p(-0.15, 1.62, 0), "glassDeep", car.start + 0.016, {
      duration: 0.020, lift: 1.6, shade: 0.8,
    });
    for (const dx of [-1.5, 1.5]) {
      for (const dz of [-0.92, 0.92]) {
        b.cylinder(0.44, 0.44, 0.24, p(dx, 0.44, dz), "stoneDark", car.start + 0.02, {
          duration: 0.016, lift: 0.8, r: [Math.PI / 2, 0, 0], shade: 0.55,
        });
      }
    }
    // Headlights, on the leading face only.
    for (const dz of [-0.66, 0.66]) {
      b.box([0.1, 0.22, 0.42], p(2.2, 0.86, dz), "glowHot", litAt(0.42 + dz * 0.05), {
        duration: 0.014, lift: 0.05,
      });
    }
  }
}
