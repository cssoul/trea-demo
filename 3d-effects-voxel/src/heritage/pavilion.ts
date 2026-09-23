import * as THREE from "three";
import { HeritageBuilder, type Point } from "./builder";
import { roof, bracketBand, railing, facePoint, variation, TAU } from "./components";

/* ------------------------------------------------------------------ *
 * 三层中式亭子 —— 一木一石，逐层生长
 * 全部尺寸为场景单位（非米）。构建时序统一走 0..1 的 progress，
 * 每个构件带自己的 start；同一层的砖自下而上依次落位。
 * ------------------------------------------------------------------ */

type Storey = {
  yBase: number; half: number; wallH: number;       // 墙身
  bracketY: number; bracketR: number;                // 斗拱
  roofY: number; roofOuter: number; roofInner: number; roofH: number; // 飞檐
  deckY: number; deckHalf: number;                   // 平座
  railY: number; railR: number;
  start: number; end: number;                        // 该层墙身的时间窗
};

/** Lay red-brick courses on one face, bottom-up. Returns the last course's top. */
function brickFace(
  b: HeritageBuilder, a: number, half: number, y0: number, rows: number, courseH: number,
  start: number, end: number, skip: (x: number, y: number) => boolean,
) {
  const T = 0.58, brickW = 0.66;
  const n = Math.floor(2 * half / brickW);
  for (let r = 0; r < rows; r++) {
    const y = y0 + (r + 0.5) * courseH;
    const off = (r % 2) * brickW * 0.5;
    // 自下而上：同一面墙的第 r 层，落在时间窗内的对应位置
    const t = rows <= 1 ? 0 : r / (rows - 1);
    const s = start + t * (end - start) * .9;
    for (let i = -1; i <= n; i++) {
      const x = -half + i * brickW + off;
      if (x < -half + brickW * .35 || x > half - brickW * .35) continue;
      if (skip(x, y)) continue;
      const seed = r * 37 + i * 11 + Math.round(a * 10);
      b.box([brickW * .97, courseH * .95, T], facePoint(x, y, half, a), "brick", s + i * .00035, {
        r: [0, a, 0], shade: .93 + variation(seed) * .09, duration: .028, lift: .5,
      });
    }
  }
}

/** A dark recessed gallery band with timber posts, sill and lintel. */
function galleryBand(b: HeritageBuilder, a: number, half: number, y0: number, y1: number, start: number) {
  const h = y1 - y0;
  b.box([2 * half * .99, h, .3], facePoint(0, (y0 + y1) / 2, half - .17, a), "recess", start, { r: [0, a, 0] });
  b.box([2 * half + .1, .2, .74], facePoint(0, y0 - .1, half + .02, a), "wood", start, { r: [0, a, 0], duration: .03 });
  b.box([2 * half + .1, .24, .8], facePoint(0, y1 + .12, half + .03, a), "wood", start + .001, { r: [0, a, 0], duration: .03 });
  b.box([2 * half + .22, .07, .86], facePoint(0, y1 + .26, half + .05, a), "jade", start + .002, { r: [0, a, 0] });
  const n = 6;
  for (let i = -n; i <= n; i++) {
    const x = i * (half / n) * .93;
    b.box([.16, h * .94, .62], facePoint(x, (y0 + y1) / 2, half + .04, a), "wood", start + i * .0005, {
      r: [0, a, 0], shade: i % 2 ? .92 : 1.04, duration: .028,
    });
  }
}

/** Corner and mid posts, a stone plinth course and a top beam for one storey. */
function timberFrame(b: HeritageBuilder, a: number, half: number, y0: number, y1: number, start: number) {
  b.box([2 * half + .16, .26, 2 * half + .16], [0, y0 - .13, 0], "stone", start, { duration: .03, shade: .94 });
  for (const x of [-half + .22, -half * .34, half * .34, half - .22]) {
    b.box([.34, y1 - y0 + .3, .34], facePoint(x, (y0 + y1) / 2, half - .06, a), "wood", start + .004, {
      r: [0, a, 0], duration: .05, lift: 1.1, shade: 1.02,
    });
  }
  b.box([2 * half + .2, .3, .5], facePoint(0, y1 + .16, half - .05, a), "wood", start + .006, { r: [0, a, 0], duration: .04, shade: 1.05 });
}

/** One storey: plinth, brick walls with a gallery band, posts, bracket band, roof, balcony. */
function storey(b: HeritageBuilder, s: Storey, door?: { halfW: number; top: number }) {
  const courseH = 0.3, T = 0.58;
  const rows = Math.max(5, Math.round(s.wallH / courseH));
  const H = rows * courseH;
  const winA = 0.42, winB = 0.72;
  const bandY0 = s.yBase + H * winA, bandY1 = s.yBase + H * winB;

  // 墙身：砖石逐层砌筑（跳过窗带与门洞）
  for (let side = 0; side < 4; side++) {
    const a = side * Math.PI / 2;
    const isFront = side === 0;
    brickFace(b, a, s.half, s.yBase, rows, courseH, s.start, s.start + (s.end - s.start) * .68,
      (x, y) => {
        if (y > bandY0 && y < bandY1) return true;                 // 画廊窗带留空
        if (door && isFront && Math.abs(x) < door.halfW && y < door.top) return true; // 门洞
        return false;
      });
  }
  // 底部石脚
  b.box([s.half * 2 - .02, .34, s.half * 2 - .02], [0, s.yBase + .17, 0], "stone", s.start, { duration: .03, shade: .9 });

  // 画廊窗带 + 木构
  const bs = s.start + (s.end - s.start) * .72;
  for (let side = 0; side < 4; side++) {
    galleryBand(b, side * Math.PI / 2, s.half, bandY0, bandY1, bs);
    timberFrame(b, side * Math.PI / 2, s.half, s.yBase, s.yBase + H, bs);
  }

  // 门洞（仅首层正面）
  if (door) {
    const zw = s.half, dh = door.top - s.yBase, cx = 0, cy = s.yBase + dh / 2;
    b.box([door.halfW * 2, dh, .42], facePoint(cx, cy, zw - .24, 0), "recess", bs, { duration: .03 });
    b.box([door.halfW * 2 + .5, .4, .62], facePoint(cx, door.top + .2, zw + .02, 0), "jade", bs + .004);
    for (const sx of [-1, 1]) b.box([.5, dh + .4, .66], facePoint(sx * (door.halfW + .25), cy, zw + .01, 0), "stone", bs + .003, { shade: .96 });
    b.box([door.halfW * 2 + .3, .1, .7], facePoint(cx, door.top + .44, zw + .04, 0), "tile", bs + .005);
  }

  // 斗拱
  bracketBand(b, s.bracketY, s.bracketR, s.start + (s.end - s.start) * .78);
  // 飞檐
  roof(b, s.roofY, s.roofOuter, s.roofInner, s.roofH, s.start + (s.end - s.start) * .82);
  // 平座与栏杆
  b.box([s.deckHalf * 2, .28, s.deckHalf * 2], [0, s.deckY, 0], "wood", s.end - .02, { duration: .03, shade: .98 });
  b.box([s.deckHalf * 2 + .16, .1, s.deckHalf * 2 + .16], [0, s.deckY - .17, 0], "jade", s.end - .018);
  railing(b, s.railY, s.railR, s.end - .012);
}

/** Golden lotus finial crowning the top roof. */
function finial(b: HeritageBuilder, y: number, start: number) {
  b.cylinder(.5, .72, .38, [0, y + .19, 0], "bronze", start, { duration: .04 });
  b.cylinder(.24, .44, .3, [0, y + .53, 0], "bronze", start + .004);
  const rings = [[.42, .3, .2], [.34, .27, .2], [.26, .24, .2], [.19, .21, .2]];
  rings.forEach(([r0, r1, h], i) => b.cylinder(r0, r1, h, [0, y + .78 + i * .2, 0], "bronze", start + .008 + i * .003));
  b.cylinder(.12, .1, .5, [0, y + 1.92, 0], "bronze", start + .022);
  b.sphere([0, y + 2.36, 0], [.24, .34, .24], "bronze", start + .026, { duration: .012, lift: .3 });
  b.sphere([0, y + 2.72, 0], [.1, .16, .1], "bronze", start + .03);
}

/** Assemble the whole 3-storey pavilion, bottom-up across progress 0..1. */
export function buildPavilion(b: HeritageBuilder) {
  const S: Storey[] = [
    { yBase: 0, half: 4.7, wallH: 7.4, bracketY: 7.62, bracketR: 5.1, roofY: 7.95, roofOuter: 7.2, roofInner: 3.15, roofH: 1.5, deckY: 9.19, deckHalf: 4.15, railY: 9.52, railR: 3.85, start: .05, end: .30 },
    { yBase: 9.45, half: 3.7, wallH: 5.0, bracketY: 14.69, bracketR: 4.1, roofY: 15.02, roofOuter: 6.2, roofInner: 2.25, roofH: 1.35, deckY: 16.14, deckHalf: 3.25, railY: 16.47, railR: 2.95, start: .32, end: .58 },
    { yBase: 16.42, half: 2.8, wallH: 4.3, bracketY: 20.94, bracketR: 3.2, roofY: 21.27, roofOuter: 5.0, roofInner: 0.9, roofH: 2.3, deckY: 0, deckHalf: 0, railY: 0, railR: 0, start: .60, end: .82 },
  ];
  // 首层正面门洞
  storey(b, S[0], { halfW: 1.15, top: 4.6 });
  storey(b, S[1]);
  storey(b, S[2]);
  finial(b, 21.27 + 2.3 + .12, .84);
}

/* ------------------------------------------------------------------ *
 * 体素微缩沙盘：水面 + 岛台 + 草木 + 石径
 * ------------------------------------------------------------------ */

function tree(b: HeritageBuilder, x: number, z: number, y: number, scale: number, seed: number) {
  const h = 3.4 * scale;
  b.cylinder(.16 * scale, .26 * scale, h, [x, y + h / 2, z], "wood", -1, { lift: 0, shade: .9 });
  const canopyY = y + h * .96, rad = 1.5 * scale;
  const n = 26;
  for (let i = 0; i < n; i++) {
    const s = seed * 41 + i;
    const an = i * 2.399963, rr = Math.sqrt((i + .5) / n) * rad;
    const py = canopyY + (variation(s) - .35) * rad * .95 + Math.sin(i * 1.7) * rad * .12;
    const px = x + Math.cos(an) * rr, pz = z + Math.sin(an) * rr;
    const r = (.52 + variation(s + 1) * .38) * scale;
    b.sphere([px, py, pz], [r, r * (.72 + variation(s + 2) * .3), r], "moss", -1, {
      lift: 0, shade: .74 + variation(s + 3) * .3, r: [variation(s + 4) * .6, an, variation(s + 5) * .5],
    });
  }
}

/** A lush voxel-ish island: water, stone base, grass field, trees and a stone path. */
export function buildIsland(b: HeritageBuilder) {
  // 水面（巨大的湖面；顶面略高于岛台底，避免浮空缝隙）
  b.box([200, 1.0, 200], [0, -1.65, 0], "water", -1, { lift: 0, shade: 1 });
  // 岛台石基与土层
  b.box([30, 1.05, 30], [0, -1.1, 0], "stone", -1, { lift: 0, shade: .88 });
  b.box([28.4, .6, 28.4], [0, -.34, 0], "moss", -1, { lift: 0, shade: .7 });
  // 草地：体素块，中心避开亭台
  for (let gx = -13; gx <= 13; gx++) for (let gz = -13; gz <= 13; gz++) {
    const x = gx * 1.05, z = gz * 1.05;
    const d = Math.max(Math.abs(x), Math.abs(z));
    if (d > 13 || (Math.abs(x) < 6.6 && Math.abs(z) < 6.6)) continue;
    const seed = gx * 91 + gz * 53;
    b.box([1.02, .34, 1.02], [x, variation(seed) * .1, z], "grass", -1, {
      lift: 0, shade: .82 + variation(seed + 7) * .26, duration: .02,
    });
  }
  // 亭台基座：三层石阶 + 月台
  b.box([15.4, .5, 15.4], [0, .25, 0], "stone", .002, { shade: .94, duration: .03, lift: .2 });
  b.box([13.6, .42, 13.6], [0, .66, 0], "stone", .004, { shade: .98, duration: .03, lift: .2 });
  for (let step = 0; step < 3; step++) {
    b.box([5.6 - step * .5, .26, .9], [0, .14 + step * .01, 7.9 + step * .82], "stone", .006 + step * .001, { shade: .92 });
  }
  // 石径
  for (let i = 0; i < 6; i++) {
    b.box([1.7, .16, 1.5], [(i % 2 ? -.5 : .5), .06, 9.6 + i * 1.55], "stone", -1, { lift: 0, shade: .82 + variation(i) * .14 });
  }
  // 环岛树林（体素微缩的浓密感）
  const spots: [number, number, number][] = [
    [9.5, 8.5, 1.5], [12, 2, 1.35], [11.5, -6.5, 1.6], [6, -11.5, 1.4], [-2, -12.5, 1.55],
    [-9, -9, 1.45], [-12.5, -1.5, 1.5], [-10, 7.5, 1.35], [-4.5, 11.5, 1.5], [3.5, 12, 1.3],
    [8.5, -10, 1.25], [-8, 11, 1.28], [13, 6.5, 1.2], [-13, 4.5, 1.22], [1.5, -11, 1.18], [-13.2, -5.5, 1.24],
  ];
  spots.forEach(([x, z, sc], i) => tree(b, x, z, .1, sc, i * 17 + 3));
  // 近处几丛矮灌木
  for (let i = 0; i < 22; i++) {
    const an = i * 2.399963, rr = 8.6 + variation(i * 5 + 2) * 3.2;
    const x = Math.cos(an) * rr, z = Math.sin(an) * rr;
    if (Math.abs(x) < 6.4 && Math.abs(z) < 6.4) continue;
    const s = .55 + variation(i * 3 + 9) * .4;
    b.sphere([x, .3 + s * .5, z], [s, s * .8, s], "moss", -1, { lift: 0, shade: .72 + variation(i + 4) * .3 });
  }
}
