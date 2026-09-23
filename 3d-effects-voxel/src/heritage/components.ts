import * as THREE from "three";
import { HeritageBuilder, type Point } from "./builder";

export const TAU = Math.PI * 2;

/** Deterministic pseudo-random in [0,1). Fixed seed keeps replay/scrub identical. */
export const variation = (n: number) => {
  const v = Math.sin(n * 127.1 + 31.7) * 43758.5453;
  return v - Math.floor(v);
};

/** Parametric surface grid; `uvMap` lets callers keep continuous UVs across courses. */
export function surfaceGrid(
  nx: number,
  ny: number,
  point: (u: number, v: number) => Point,
  uvMap?: (u: number, v: number) => [number, number],
) {
  const p: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const u = i / nx, v = j / ny;
    p.push(...point(u, v));
    uv.push(...(uvMap ? uvMap(u, v) : [u, v]));
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Rotate a local (x,y,z) offset into a storey whose front faces +z by `angle`. */
export const facePoint = (x: number, y: number, z: number, angle: number): Point =>
  [x * Math.cos(angle) + z * Math.sin(angle), y, z * Math.cos(angle) - x * Math.sin(angle)];

/** Flip triangle winding so a downward-facing soffit renders instead of vanishing. */
function flipWinding(g: THREE.BufferGeometry) {
  const idx = g.index!;
  for (let n = 0; n < idx.count; n += 3) {
    const tmp = idx.getX(n + 1);
    idx.setX(n + 1, idx.getX(n + 2));
    idx.setX(n + 2, tmp);
  }
  g.computeVertexNormals();
}

/**
 * One curved, four-sided pagoda roof: continuous boarded deck, closed soffit and
 * fascia, rafters, purlins, real overlapping ceramic shells, eave-end discs,
 * swept hip ridges, terminal beasts and a corner bell. `inner` is the ridge
 * opening that the storey above passes through.
 */
export function roof(b: HeritageBuilder, y: number, outer: number, inner: number, height: number, start: number) {
  const profile = (x: number, z: number) => {
    // 钳制插值参数：z 因浮点可能微超 outer，会让 pow(负数, 1.75) 变成 NaN
    const t = Math.min(1, Math.max(0, (z - inner) / (outer - inner)));
    const inv = Math.max(0, 1 - t);
    const xr = Math.min(1, Math.abs(x) / outer);
    return height * Math.pow(inv, 1.75) + .2 * Math.pow(t, 5) + .85 * Math.pow(xr, 8) * Math.pow(t, 3);
  };
  for (let side = 0; side < 4; side++) {
    const a = side * Math.PI / 2;
    const deck = surfaceGrid(28, 18, (u, v) => {
      const z = inner + v * (outer - inner), x = (u * 2 - 1) * z;
      return facePoint(x, y + profile(x, z) - .045, z, a);
    });
    b.add(deck, "tile", start, { duration: .025, lift: .35 });
    deck.dispose();
    const soffit = surfaceGrid(20, 10, (u, v) => {
      const z = inner + v * (outer - inner), x = (u * 2 - 1) * z;
      return facePoint(x, y + profile(x, z) - .24, z, a);
    });
    flipWinding(soffit);
    b.add(soffit, "wood", start, { shade: .79, lift: .35 });
    soffit.dispose();
    const fascia = surfaceGrid(32, 1, (u, v) => {
      const x = (u * 2 - 1) * outer;
      return facePoint(x, y + profile(x, outer) - .24 + v * .23, outer, a);
    });
    b.add(fascia, "jade", start + .005, { shade: .8, lift: .35 });
    fascia.dispose();
    for (let j = 0; j < 22; j++) {
      const x = (j / 21 - .5) * outer * 1.87, z0 = Math.max(inner, Math.abs(x) + .1);
      if (z0 >= outer - .2) continue;
      const pts: Point[] = [];
      for (let k = 0; k < 6; k++) { const z = z0 + (outer - z0) * k / 5; pts.push(facePoint(x, y + profile(x, z) - .32, z, a)); }
      b.tube(pts, .075, "wood", start, { shade: .9, duration: .022 }, 8);
    }
    for (const t of [.24, .57, .88]) {
      const z = inner + (outer - inner) * t, pts: Point[] = [];
      for (let k = 0; k < 12; k++) { const x = (k / 11 * 2 - 1) * z; pts.push(facePoint(x, y + profile(x, z) - .43, z, a)); }
      b.tube(pts, .105, "wood", start, { shade: .83 }, 12);
    }
    const spacing = .29;
    for (let i = 0; i <= Math.floor(outer * 2 / spacing); i++) {
      const x = -outer + i * spacing;
      const z0 = Math.max(inner, Math.abs(x) + .055);
      const count = Math.max(1, Math.ceil((outer - z0) / .52));
      for (let row = 0; row < count; row++) {
        const seed = i * 13 + row * 47 + side * 109 + y * 7;
        const front = outer - row * .52, back = Math.max(z0, front - .56 - (variation(seed) - .5) * .024);
        if (back >= front - .035) continue;
        const tile = surfaceGrid(5, 2, (u, v) => {
          const theta = (1 - u) * Math.PI, z = back + (front - back) * v;
          const xx = x + Math.cos(theta) * (.145 + (variation(seed + 4) - .5) * .006) + (v - .5) * (variation(seed + 8) - .5) * .014;
          return facePoint(xx, y + profile(xx, z) + Math.sin(theta) * (.12 + (variation(seed + 2) - .5) * .008) + .025, z, a);
        });
        b.add(tile, "tile", start + .014 + row * .003 + i * .00012, { shade: .9 + variation(seed) * .16, tint: [.96 + variation(seed + 1) * .08, .98 + variation(seed + 2) * .04, .96 + variation(seed + 3) * .09], duration: .016, lift: .22 });
        tile.dispose();
      }
      if (Math.abs(x) < outer - .12) {
        const yy = y + profile(x, outer);
        const disk = new THREE.CylinderGeometry(.139, .139, .06, 12); disk.rotateX(Math.PI / 2);
        b.add(disk, "tile", start + .049, { p: facePoint(x, yy + .045, outer + .025, a), r: [0, a, 0], shade: 1.1 }); disk.dispose();
        b.sphere(facePoint(x, yy + .045, outer + .068, a), [.043, .043, .022], "stone", start + .052, { r: [0, a, 0], shade: .73 });
        const lip = new THREE.TorusGeometry(.105, .012, 4, 12);
        b.add(lip, "jade", start + .052, { p: facePoint(x, yy + .045, outer + .062, a), r: [0, a, 0], shade: .88 }); lip.dispose();
        if (i % 2 === 0) {
          const drop = new THREE.Shape();
          drop.moveTo(-.1, 0); drop.lineTo(.1, 0); drop.quadraticCurveTo(.095, -.13, 0, -.18); drop.quadraticCurveTo(-.095, -.13, -.1, 0);
          const dg = new THREE.ExtrudeGeometry(drop, { depth: .035, bevelEnabled: false, curveSegments: 3 });
          b.add(dg, "jade", start + .053, { p: facePoint(x + .145, yy - .035, outer, a), r: [0, a, 0], shade: .86 }); dg.dispose();
        }
      }
    }
    for (let layer = 0; layer < 3; layer++) {
      const points: Point[] = [];
      for (let i = 0; i <= 32; i++) { const x = -outer + 2 * outer * i / 32; points.push(facePoint(x, y + profile(x, outer) - .15 - layer * .12, outer - .07 * layer, a)); }
      b.tube(points, layer === 1 ? .043 : .092, layer === 1 ? "bronze" : "jade", start + .043, { lift: .3 }, 40);
    }
    for (let i = 0; i < 38; i++) {
      const x = (i / 37 - .5) * outer * 1.92;
      b.box([.14, .15, .85], facePoint(x, y + profile(x, outer) - .36, outer - .42, a), "wood", start + .01, { r: [0, a, 0], shade: i % 2 ? .96 : 1.08 });
      b.box([.11, .11, .035], facePoint(x, y + profile(x, outer) - .36, outer + .02, a), "stone", start + .032, { r: [0, a, 0], shade: .85 });
    }
    const ridge: Point[] = [];
    for (let i = 0; i <= 18; i++) { const z = inner + (outer - inner) * i / 18; ridge.push(facePoint(z, y + profile(z, z) + .13, z, a)); }
    b.tube(ridge, .15, "tile", start + .065, { lift: .3 }, 28);
    for (let j = 1; j < Math.floor((outer - inner) / .55); j++) {
      const z = inner + j * .55, points: Point[] = [];
      for (let k = 0; k <= 8; k++) {
        const t = k / 8 * Math.PI, dx = Math.cos(t) * .153;
        points.push(facePoint(z + dx, y + profile(z, z) + .13 + Math.sin(t) * .155, z - dx, a));
      }
      b.tube(points, .021, "jade", start + .066, { shade: .82 + variation(j) * .12 }, 8);
    }
    const corner = facePoint(outer, y + 1.16, outer, a);
    const flourish: Point[] = [facePoint(outer - .65, y + .64, outer - .65, a), corner, facePoint(outer + .22, y + 1.78, outer + .22, a), facePoint(outer - .04, y + 1.86, outer - .04, a)];
    b.tube(flourish, .115, "jade", start + .071, { lift: .25 }, 18);
    for (let beast = 0; beast < 3; beast++) {
      const z = outer - .75 - beast * .48, yy = y + profile(z, z) + .26;
      b.sphere(facePoint(z, yy, z, a), [.11, .21, .14], "tile", start + .069 + beast * .002);
      b.sphere(facePoint(z, yy + .22, z + .05, a), [.105, .09, .12], "tile", start + .07 + beast * .002);
    }
    const bellPos = facePoint(outer - .12, y + .38, outer - .12, a);
    b.cylinder(.018, .018, .54, bellPos, "bronze", start + .077);
    b.cylinder(.095, .19, .25, [bellPos[0], bellPos[1] - .35, bellPos[2]], "bronze", start + .079);
    b.sphere([bellPos[0], bellPos[1] - .49, bellPos[2]], [.045, .065, .045], "bronze", start + .08);
    const rim = new THREE.TorusGeometry(.183, .017, 4, 12); rim.rotateX(Math.PI / 2);
    b.add(rim, "bronze", start + .08, { p: [bellPos[0], bellPos[1] - .475, bellPos[2]] }); rim.dispose();
  }
  b.box([inner * 2 + .12, .15, inner * 2 + .12], [0, y + height + .01, 0], "tile", start + .068);
}

/** A dougong bracket band: cloud-shaped arms stepping outward, with a painted beam. */
export function bracketBand(b: HeritageBuilder, y: number, r: number, start: number) {
  const outline = new THREE.Shape();
  outline.moveTo(-.65, .13); outline.lineTo(.65, .13); outline.lineTo(.59, -.02);
  outline.bezierCurveTo(.36, -.03, .33, -.22, .12, -.23); outline.lineTo(-.12, -.23);
  outline.bezierCurveTo(-.33, -.22, -.36, -.03, -.59, -.02); outline.closePath();
  const arm = new THREE.ExtrudeGeometry(outline, { depth: .22, bevelEnabled: true, bevelThickness: .018, bevelSize: .02, bevelSegments: 1, steps: 1, curveSegments: 6 });
  arm.translate(0, 0, -.11);
  for (let side = 0; side < 4; side++) {
    const a = side * Math.PI / 2;
    b.box([r * 2 + .45, .3, .45], facePoint(0, y, r, a), "wood", start, { r: [0, a, 0] });
    for (let i = -4; i <= 4; i++) {
      const along = i * r / 4.4;
      b.box([.33, .3, .42], facePoint(along, y - .64, r, a), "brick", start + .002, { r: [0, a, 0] });
      for (let level = 0; level < 3; level++) {
        const z = r + .12 + level * .2, yy = y - .46 + level * .22;
        b.add(arm, "jade", start + .005 + level * .005, { p: facePoint(along, yy, z, a), r: [0, a, 0], s: [.7 + level * .22, 1, 1] });
        b.add(arm, "jade", start + .006 + level * .005, { p: facePoint(along, yy + .1, z, a), r: [0, a + Math.PI / 2, 0], s: [.75 + level * .2, 1, 1] });
        for (const sign of [-1, 1]) b.box([.17, .16, .19], facePoint(along + sign * (.28 + level * .1), yy + .17, z, a), "brick", start + .009 + level * .005, { r: [0, a, 0], shade: .85 });
      }
    }
    b.box([r * 2 + .7, .2, .25], facePoint(0, y + .3, r + .55, a), "jade", start + .025, { r: [0, a, 0] });
    b.box([r * 2 + .6, .034, .025], facePoint(0, y + .32, r + .69, a), "bronze", start + .028, { r: [0, a, 0] });
    for (let i = -6; i <= 6; i++) b.box([.39, .105, .03], facePoint(i * r / 6.6, y + .04, r + .245, a), "jade", start + .023, { r: [0, a, 0], shade: 1.07 });
  }
  arm.dispose();
}

/** A timber railing ring (平座栏杆) around a balcony deck. */
export function railing(b: HeritageBuilder, y: number, r: number, start: number) {
  for (let side = 0; side < 4; side++) {
    const a = side * Math.PI / 2;
    for (const h of [0, .37, .95]) b.box([r * 2 + .18, .1, .16], facePoint(0, y + h, r, a), "wood", start + h * .004, { r: [0, a, 0] });
    for (let i = -6; i <= 6; i++) {
      const x = i * r / 6;
      b.box([.13, 1.08, .14], facePoint(x, y + .47, r, a), "wood", start + .008, { r: [0, a, 0] });
      for (const h of [.05, .9]) {
        b.box([.19, .12, .2], facePoint(x, y + h, r, a), "wood", start + .009, { r: [0, a, 0], shade: .88 });
        b.sphere(facePoint(x, y + h, r + .105, a), [.021, .021, .009], "wood", start + .01, { r: [0, a, 0], shade: .66 });
      }
      b.cylinder(.09, .1, .065, facePoint(x, y + 1.04, r, a), "bronze", start + .012);
      if (i < 6) {
        const cx = x + r / 12;
        for (const sign of [-1, 1]) b.box([.052, .58, .065], facePoint(cx, y + .64, r, a), "wood", start + .013, { r: [0, a, sign * .69] });
        b.box([r / 6 - .18, .065, .065], facePoint(cx, y + .21, r, a), "jade", start + .014, { r: [0, a, 0] });
      }
    }
  }
}
