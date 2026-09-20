#!/usr/bin/env python3
"""
生成 v2 等轴测设备 SVG 图标（topo-3d/public/imgs，busbar 除外）
投影与画布默认视角一致（SceneManager azimuth=45° / polar=35.264° true isometric）：
  sx = (x - z) * cos30 ; sy = (x + z) * sin30 - y
+Z 面朝屏幕左下（可见正面），+X 面朝屏幕右下（可见侧面），Y 向上。

用法（在仓库的 scripts/ 目录下）：
  python3 gen-device-icons.py                    # 输出到当前目录
  python3 gen-device-icons.py /path/to/imgs      # 直接输出到 public/imgs
生成后可用 icon-preview-sheet.html（放同目录）在浏览器里目检。

要点（踩过的坑）：
  - 3D 模型的"正面"是 +Z 方向（不是 -Z），图标可见面为 顶面 / +Z 面 / +X 面
  - 贴面部件（屏幕/门/SOC 条）用 zmin 提升绘制层级，否则会被柜体遮挡
  - 输出统一 fitBounds 到 100x100，风格对齐 materialLibrary.js PALETTE
"""
import math
import json

COS30 = math.cos(math.radians(30))


def iso(x, y, z):
    return ((x - z) * COS30, (x + z) * 0.5 - y)


OUTLINE = "#5b6470"

C = {
    "white_t": "#f8fafc", "white_f": "#eef1f6", "white_s": "#d9dfe8",
    "gray_t": "#e2e7ee", "gray_f": "#d0d8e1", "gray_s": "#b6bfcb",
    "dark_t": "#a7b0bc", "dark_f": "#939dab", "dark_s": "#7c8794",
    "plinth_t": "#6d7684", "plinth_f": "#5b6470", "plinth_s": "#474f5a",
    "alu_t": "#d5dbe3", "alu_f": "#c2c9d3", "alu_s": "#a8b1bd",
    "dk_t": "#3c434e", "dk_f": "#2b3038", "dk_s": "#1e232a",
    "scr": "#0d131c",
    "cu_t": "#d99a55", "cu_f": "#c8813c", "cu_s": "#96562a",
    "pv_t": "#2e5a90", "pv_f": "#1d3f6d", "pv_s": "#152f4d",
    "steel": "#5c7b74", "steel_d": "#465f5a",
    "por_t": "#eef1f5", "por_f": "#e2e6eb", "por_s": "#c9cfd8",
    "ok": "#22c26e", "ok_glow": "#48e094",
    "amber": "#f0a020",
    "cell": "#3e74b8", "cell_d": "#2a568e",
    "red": "#e0464c",
    "rubber": "#23272e",
    "glass": "#b9d2ea",
}


class Svg:
    def __init__(self):
        self.parts = []   # (z_order, fragment, all_points)

    def _reg(self, fragment, allpts, y_min=None):
        # y_min 显式指定绘制层级（屏幕 y 越小越先画=越靠上），默认取几何最小 y
        if y_min is None:
            y_min = min(p[1] for p in allpts)
        self.parts.append((y_min, fragment, allpts))

    def poly(self, polygon, fill, stroke=OUTLINE, sw=1.3, opacity=None, zmin=None):
        op = f' opacity="{opacity}"' if opacity is not None else ""
        st = f' stroke="{stroke}" stroke-width="{sw}" stroke-linejoin="round"' if stroke else ""
        frag = f'<polygon points="{self.fmt(polygon)}" fill="{fill}"{op}{st}/>'
        self._reg(frag, polygon, zmin)

    def line(self, p1, p2, stroke, sw=1.2, opacity=None):
        op = f' opacity="{opacity}"' if opacity is not None else ""
        frag = (f'<line x1="{p1[0]:.1f}" y1="{p1[1]:.1f}" x2="{p2[0]:.1f}" y2="{p2[1]:.1f}" '
                f'stroke="{stroke}" stroke-width="{sw}" stroke-linecap="round"{op}/>')
        self._reg(frag, [p1, p2])

    def circle(self, cx, cy, r, fill, stroke=None, sw=1.0):
        st = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
        frag = f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{fill}"{st}/>'
        self._reg(frag, [(cx - r, cy - r), (cx + r, cy + r)])

    def text(self, cx, cy, s, size, fill="#cfe2ee", weight=700):
        frag = (f'<text x="{cx:.1f}" y="{cy:.1f}" font-family="Arial,Helvetica,sans-serif" '
                f'font-size="{size}" font-weight="{weight}" fill="{fill}" '
                f'text-anchor="middle" dominant-baseline="central">{s}</text>')
        self._reg(frag, [(cx - len(s) * size * 0.3, cy - size / 2), (cx + len(s) * size * 0.3, cy + size / 2)])

    @staticmethod
    def fmt(polygon):
        return " ".join(f"{p[0]:.1f},{p[1]:.1f}" for p in polygon)

    def box(self, x, yb, z, w, h, d, top, front, side, outline=OUTLINE, sw=1.3, zmin=None):
        """长方体：yb 底面高度（世界 y 向上），h 高。
        可见面：顶面(y+h)、+Z 面（z+d，朝屏幕左下）、+X 面（x+w，朝屏幕右下）。
        zmin: 覆盖默认排序层级（屏幕 y）。
        绘制顺序：侧面 -> 正面 -> 顶面（保证棱线干净）"""
        tp = [iso(x, yb + h, z), iso(x + w, yb + h, z), iso(x + w, yb + h, z + d), iso(x, yb + h, z + d)]
        fp = [iso(x, yb, z + d), iso(x + w, yb, z + d), iso(x + w, yb + h, z + d), iso(x, yb + h, z + d)]
        sp = [iso(x + w, yb, z), iso(x + w, yb, z + d), iso(x + w, yb + h, z + d), iso(x + w, yb + h, z)]
        zm = zmin if zmin is not None else min(p[1] for p in tp + fp + sp)
        self.poly(sp, side, stroke=outline, sw=sw, zmin=zm)
        self.poly(fp, front, stroke=outline, sw=sw, zmin=zm)
        self.poly(tp, top, stroke=outline, sw=sw, zmin=zm)

    def hline_box(self, x0, x1, y, z, thick, fill):
        """顶面上的扁平横条（格栅）。"""
        p = [iso(x0, y, z), iso(x1, y, z), iso(x1, y, z + thick), iso(x0, y, z + thick)]
        self.poly(p, fill, stroke=None)

    def fit_render(self, title, desc, pad=7.0):
        """按内容边界自动缩放平移，输出 100x100 SVG。"""
        allpts = []
        for _, _, pts in self.parts:
            allpts.extend(pts)
        xs = [p[0] for p in allpts]
        ys = [p[1] for p in allpts]
        minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
        w = max(maxx - minx, 1e-6)
        h = max(maxy - miny, 1e-6)
        scale = min((100 - 2 * pad) / w, (100 - 2 * pad) / h)
        ox = 50 - (minx + maxx) / 2 * scale
        oy = 50 - (miny + maxy) / 2 * scale
        # 按 min-y 排序：屏幕 y 小（高处）的先画，符合前后遮挡
        self.parts.sort(key=lambda t: t[0])
        body = "\n  ".join(f for _, f, _ in self.parts)
        return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <title>{title}</title>
  <desc>{desc}</desc>
  <g transform="translate({ox:.2f} {oy:.2f}) scale({scale:.4f})">
  {body}
  </g>
</svg>'''


# ================================================================ 电池柜
def battery_cabinet(s, is_stack):
    w, d = 46, 34
    height = w * (1.9 if is_stack else 1.45)
    plinth_h = height * 0.05
    body_h = height - plinth_h - 3
    rows = 5 if is_stack else 4
    zF = d / 2

    # 底座 / 柜体 / 压顶
    s.box(-w/2 - 3, 0, -d/2 - 3, w + 6, plinth_h, d + 6, C["plinth_t"], C["plinth_f"], C["plinth_s"])
    s.box(-w/2, plinth_h, -d/2, w, body_h, d, C["white_t"], C["white_f"], C["white_s"])
    s.box(-w/2 - 2.5, plinth_h + body_h, -d/2 - 2.5, w + 5, 3, d + 5, C["gray_t"], C["gray_f"], C["gray_s"])

    # 顶面散热格栅（深色横条贴在顶面）
    for i in range(4):
        x0 = -w * 0.32 + i * (w * 0.64 / 4)
        s.hline_box(x0, x0 + w * 0.11, plinth_h + body_h + 3.2, -d * 0.15, d * 0.28, C["dk_f"])

    # +Z 面：左门 + 内腔（层叠蓝色模组）+ 右 SOC 条（薄板贴面，绘制层级高于柜体）
    door_w = w * 0.22
    door_h = body_h * 0.8
    door_y = plinth_h + body_h * 0.08
    zF = d / 2
    face_z = 1.0   # 贴面部件统一绘制层级（确保盖在柜体之上）
    s.box(-w/2 + 1.2, door_y, zF - 0.5, door_w, door_h, 0.5, C["gray_t"], C["gray_f"], C["gray_s"], sw=1.0, zmin=face_z)
    # 门把手
    hx = -w/2 + door_w + 0.8
    s.box(hx, door_y + door_h * 0.42, zF - 0.2, 1.8, door_h * 0.14, 0.8, C["alu_t"], C["alu_f"], C["alu_s"], outline=None, zmin=face_z)

    open_w = w * 0.56
    open_h = body_h * 0.66
    open_yb = plinth_h + body_h * 0.14
    ox = -w * 0.02
    s.box(ox, open_yb, zF - 0.5, open_w, open_h, 0.5, C["dk_t"], C["dk_f"], C["dk_s"], sw=1.0, zmin=face_z)
    gap = open_h * 0.055
    mod_h = (open_h - gap * (rows + 1)) / rows
    for i in range(rows):
        my = open_yb + gap + i * (mod_h + gap)
        # 蓝色电芯条（实景视觉签名）
        strip_h = mod_h * 0.56
        s.box(ox + 2.6, my + mod_h * 0.16, zF - 0.1, open_w - 5.2, strip_h, 0.6,
              C["cell"], C["cell"], C["cell_d"], outline=None, sw=0.7, zmin=face_z)

    # SOC 电量条（内腔右侧，绿色 72%）
    soc_w = max(3.0, w * 0.07)
    soc_x = ox + open_w + 1.2
    s.box(soc_x, open_yb, zF - 0.5, soc_w, open_h, 0.5, C["dk_t"], C["dk_f"], C["dk_s"], outline=None, sw=0.9, zmin=face_z)
    fill_h = open_h * 0.72
    s.box(soc_x + soc_w * 0.2, open_yb + 1.2, zF - 0.1, soc_w * 0.6, fill_h, 0.5,
          C["ok"], C["ok"], "#189a52", outline=None, sw=0.7, zmin=face_z)

    # 侧面通风栅（右侧面 4 条深色横栅）
    for i in range(4):
        vy = plinth_h + body_h * 0.28 + i * (body_h * 0.13)
        p = [iso(w/2, vy, -d * 0.32), iso(w/2 + 1.6, vy, -d * 0.32),
             iso(w/2 + 1.6, vy + 2.6, -d * 0.32), iso(w/2, vy + 2.6, -d * 0.32)]
        s.poly(p, C["dk_s"], stroke=None)

    # 顶部指示灯（左前角绿色）
    icx, icy = iso(-w/2 + w * 0.1, plinth_h + body_h + 4.5, zF - 2)
    s.circle(icx, icy, 2.6, C["ok_glow"], stroke="#0f7a42", sw=1.0)


# ================================================================ PCS
def pcs(s):
    w, d = 46, 34
    height = w * 1.72
    plinth_h = height * 0.055
    body_h = height - plinth_h - 3
    zF = d / 2

    s.box(-w/2 - 3, 0, -d/2 - 3, w + 6, plinth_h, d + 6, C["plinth_t"], C["plinth_f"], C["plinth_s"])
    s.box(-w/2, plinth_h, -d/2, w, body_h, d, C["white_t"], C["white_f"], C["white_s"])
    s.box(-w/2 - 3, plinth_h + body_h, -d/2 - 3, w + 6, 3, d + 6, C["gray_t"], C["gray_f"], C["gray_s"])

    # 顶部排风格栅
    for i in range(4):
        x0 = -w * 0.34 + i * (w * 0.68 / 4)
        s.hline_box(x0, x0 + w * 0.12, plinth_h + body_h + 3.2, -d * 0.14, d * 0.26, C["dk_f"])

    # +Z 面液晶屏（薄贴面，绘制层级高于柜体）
    scr_w = w * 0.42
    scr_h = body_h * 0.17
    scy = plinth_h + body_h * 0.62
    zF = d / 2
    face_z = 1.0
    s.box(-scr_w/2, scy, zF - 0.5, scr_w, scr_h, 0.5, C["dk_t"], C["dk_f"], C["dk_s"], sw=1.0, zmin=face_z)
    p = [iso(-scr_w/2 + 2.4, scy + scr_h - 1.8, zF), iso(scr_w/2 - 2.4, scy + scr_h - 1.8, zF),
         iso(scr_w/2 - 2.4, scy + 1.8, zF), iso(-scr_w/2 + 2.4, scy + 1.8, zF)]
    s.poly(p, C["scr"], stroke=None, zmin=face_z)
    tx, ty = iso(0, scy + scr_h * 0.52, zF + 0.1)
    s.text(tx, ty, "PCS", 6.2)

    # 双开门（下半部，中缝 + 把手 + 下部格栅，薄贴面，层级高于柜体）
    door_h = body_h * 0.5
    door_y = plinth_h + body_h * 0.06
    for x0, side in ((-w/2 + 1.2, -1), (1.2, 1)):
        dw = w/2 - 2.4
        s.box(x0, door_y, zF - 0.4, dw, door_h, 0.5, C["gray_t"], C["gray_f"], C["gray_s"], sw=1.0, zmin=face_z)
        for i in range(3):
            gy = door_y + door_h * 0.56 + i * (door_h * 0.14)
            p = [iso(x0 + dw * 0.16, gy, zF + 0.1), iso(x0 + dw * 0.84, gy, zF + 0.1),
                 iso(x0 + dw * 0.84, gy + 1.6, zF + 0.1), iso(x0 + dw * 0.16, gy + 1.6, zF + 0.1)]
            s.poly(p, C["dk_s"], stroke=None, zmin=face_z)
        # 中缝侧把手
        hxp = (x0 + dw - 3.2) if side < 0 else (x0 + 1.4)
        s.box(hxp, door_y + door_h * 0.42, zF - 0.2, 1.8, door_h * 0.15, 0.8,
              C["alu_t"], C["alu_f"], C["alu_s"], outline=None, zmin=face_z)

    # 指示灯（屏下居中偏左）
    icx, icy = iso(-w * 0.1, door_y + door_h + 3.4, zF + 0.1)
    s.circle(icx, icy, 2.2, C["ok_glow"], stroke="#0f7a42", sw=0.9)

    # 右侧面竖向散热鳍片
    for i in range(4):
        fy = plinth_h + body_h * 0.22 + i * (body_h * 0.15)
        p = [iso(w/2, fy, -d * 0.36), iso(w/2 + 2.4, fy + 1.2, -d * 0.36),
             iso(w/2 + 2.4, fy + 1.2 + body_h * 0.09, -d * 0.36), iso(w/2, fy + body_h * 0.09, -d * 0.36)]
        s.poly(p, C["alu_s"], stroke=None)

    # 底部三根铜排（贴在 +Z 面底部）
    for i in range(3):
        bx = -w * 0.26 + i * w * 0.26
        s.box(bx, 0, zF - 1.0, w * 0.14, plinth_h * 1.3, 1.0, C["cu_t"], C["cu_f"], C["cu_s"], outline=None, sw=0.8)


# ================================================================ 光伏逆变器 pinvt
def pinvt(s):
    """壁挂扁箱 + 顶部 9 片铝散热鳍 + 大液晶屏 + 三色指示灯"""
    w, d = 44, 30
    mount_h = 7
    body_h = w * 1.05
    body_d = d * 0.72
    fin_h = w * 0.13
    zF = body_d / 2

    # 底座支架
    s.box(-w * 0.45, 0, -d * 0.45, w * 0.9, mount_h, d * 0.95, C["plinth_t"], C["plinth_f"], C["plinth_s"])
    # 主机箱
    s.box(-w/2, mount_h, -body_d/2, w, body_h, body_d, C["white_t"], C["white_f"], C["white_s"])
    # 箱盖
    s.box(-w/2 - 1.5, mount_h + body_h, -body_d/2 - 1.5, w + 3, 2.6, body_d + 3, C["gray_t"], C["gray_f"], C["gray_s"])

    # 顶部散热鳍片（横贯顶面的竖板）
    for i in range(6):
        fx = -w * 0.4 + i * (w * 0.8 / 5)
        s.hline_box(fx, fx + w * 0.055, mount_h + body_h + 2.8 + fin_h, -body_d * 0.42, body_d * 0.84, C["alu_t"])
        p1 = iso(fx, mount_h + body_h + 2.8, -body_d * 0.42)
        p2 = iso(fx + w * 0.055, mount_h + body_h + 2.8, -body_d * 0.42)
        s.poly([p1, p2, (p2[0], p2[1] + fin_h * 0.7), (p1[0], p1[1] + fin_h * 0.7)], C["alu_f"], stroke=None)

    # 大液晶屏（+Z 面，绘制层级高于箱体）
    scr_w = w * 0.62
    scr_h = body_h * 0.38
    scy = mount_h + body_h * 0.42
    zF = body_d / 2
    face_z = 1.0
    s.box(-scr_w/2, scy, zF - 0.7, scr_w, scr_h, 0.7, C["dk_t"], C["dk_f"], C["dk_s"], zmin=face_z)
    p = [iso(-scr_w/2 + 2.6, scy + scr_h - 2, zF), iso(scr_w/2 - 2.6, scy + scr_h - 2, zF),
         iso(scr_w/2 - 2.6, scy + 2, zF), iso(-scr_w/2 + 2.6, scy + 2, zF)]
    s.poly(p, C["scr"], stroke=None, zmin=face_z)
    tx, ty = iso(0, scy + scr_h * 0.5, zF + 0.1)
    s.text(tx, ty, "PV", 6.5)

    # 三色指示灯（屏下：绿/黄/灰）
    for i, col in enumerate((C["ok_glow"], C["amber"], "#99a2ad")):
        lx = -w * 0.3 + i * w * 0.3
        icx, icy = iso(lx, mount_h + body_h * 0.14, zF + 0.1)
        s.circle(icx, icy, 2.2, col, stroke="#3a414c", sw=0.8)

    # 机箱分模线
    s.box(-w * 0.47, mount_h + body_h * 0.88, -body_d/2 + 0.5, w * 0.94, 1.6, body_d - 1, C["dark_t"], C["dark_f"], C["dark_s"], outline=None, sw=0.8, zmin=face_z)

    # 底部直流端子（铜）
    s.box(-w * 0.25, mount_h * 0.25, zF - 3, w * 0.5, 3, 6, C["dk_t"], C["dk_f"], C["dk_s"], outline=None, sw=0.8, zmin=face_z)
    s.box(-w * 0.15, mount_h * 0.25 + 3, zF - 3, w * 0.3, 3.5, 4, C["cu_t"], C["cu_f"], C["cu_s"], outline=None, sw=0.8, zmin=face_z)


# ================================================================ 双向电表 meter
def meter(s):
    """白色表体 + 顶部圆弧盖 + 液晶屏 + 透明罩 + 底部四路铜端子"""
    w, d = 46, 26
    height = w * 1.0
    body_d = max(12, d)
    base_h = height * 0.07
    body_h = height - base_h - 8
    zF = body_d / 2

    s.box(-w * 0.43, 0, -body_d/2 - 2, w * 0.86, base_h, body_d + 4, C["plinth_t"], C["plinth_f"], C["plinth_s"])
    s.box(-w/2, base_h, -body_d/2, w, body_h, body_d, C["white_t"], C["white_f"], C["white_s"])

    # 顶部圆弧盖：半圆柱沿 X 轴横放（3D rx=PI/2, rz=PI/2 的投影近似）
    top_y = base_h + body_h
    L0 = iso(-w/2, top_y, -body_d/2)      # 左端上沿
    L1 = iso(-w/2, top_y, body_d/2)       # 左端下沿（+Z）
    R0 = iso(w/2, top_y, -body_d/2)
    R1 = iso(w/2, top_y, body_d/2)
    r = w * 0.17                            # 圆弧顶脊抬升量
    L0t = (L0[0], L0[1] - r)
    L1t = (L1[0], L1[1] - r)
    R0t = (R0[0], R0[1] - r)
    R1t = (R1[0], R1[1] - r)
    # 平顶面（亮）
    s.poly([L0, L1, R1, R0], C["gray_t"])
    # 左端椭圆盖（暗，先画）
    s.poly([L0, L1, L1t, L0t], C["gray_s"])
    # 圆弧脊面（沿 +Z 半边，画在最后覆盖接缝）
    s.poly([L1, R1, R1t, L1t], C["gray_f"])

    # +Z 面凸面板（薄，绘制层级高于表体）
    face_z = 1.0
    s.box(-w * 0.42, base_h + body_h * 0.12, body_d/2 - 0.6, w * 0.84, body_h * 0.74, 0.6, C["gray_t"], C["gray_f"], C["gray_s"], sw=1.0, zmin=face_z)
    # 液晶屏 kWh
    scr_w = w * 0.56
    scr_h = body_h * 0.34
    scy = base_h + body_h * 0.42
    zF = body_d / 2
    s.box(-scr_w/2, scy, zF - 0.3, scr_w, scr_h, 0.5, C["dk_t"], C["dk_f"], C["dk_s"], sw=0.9, zmin=face_z)
    p = [iso(-scr_w/2 + 2.2, scy + scr_h - 1.6, zF + 0.2), iso(scr_w/2 - 2.2, scy + scr_h - 1.6, zF + 0.2),
         iso(scr_w/2 - 2.2, scy + 1.6, zF + 0.2), iso(-scr_w/2 + 2.2, scy + 1.6, zF + 0.2)]
    s.poly(p, C["scr"], stroke=None, zmin=face_z)
    tx, ty = iso(0, scy + scr_h * 0.5, zF + 0.3)
    s.text(tx, ty, "kWh", 5.6)

    # 两枚操作按钮
    for bx in (-w * 0.22, w * 0.22):
        icx, icy = iso(bx, base_h + body_h * 0.14, zF + 0.1)
        s.circle(icx, icy, 2.2, C["dk_f"], stroke=C["dk_s"], sw=0.9)

    # 脉冲指示灯
    icx, icy = iso(w * 0.3, base_h + body_h * 0.88, zF + 0.1)
    s.circle(icx, icy, 1.9, C["ok_glow"], stroke="#0f7a42", sw=0.8)

    # 底部四路铜端子（薄贴面，层级高于底座）
    for i in range(4):
        bx = -w * 0.32 + i * (w * 0.64 / 3) - w * 0.055
        s.box(bx, base_h + 0.5, zF - 0.6, w * 0.11, body_h * 0.1, 0.8, C["cu_t"], C["cu_f"], C["cu_s"], outline=None, sw=0.6, zmin=face_z)


# ================================================================ 充电桩 charger
def charger(s):
    """立式桩体 + 顶部遮雨帽 + 计费屏 + 状态灯带 + 侧挂充电枪 + 垂坠线缆"""
    w, d = 34, 26
    height = 78
    base_h = 6
    body_h = height - base_h - 4
    body_w = w * 0.78
    body_d = max(12, d * 0.62)

    s.box(-w * 0.46, 0, -body_d/2 - 2.5, w * 0.92, base_h, body_d + 5, C["plinth_t"], C["plinth_f"], C["plinth_s"])
    s.box(-body_w/2, base_h, -body_d/2, body_w, body_h, body_d, C["white_t"], C["white_f"], C["white_s"])
    s.box(-body_w/2 * 1.08, base_h + body_h, -body_d/2 * 1.08 - 0.5, body_w * 1.08 + 1, 4, body_d * 1.08 + 1, C["gray_t"], C["gray_f"], C["gray_s"])

    zF = body_d / 2
    face_z = 1.0
    # 计费屏（+Z 面，层级高于桩体）
    scr_w = body_w * 0.62
    scr_h = body_h * 0.2
    scy = base_h + body_h * 0.72
    s.box(-scr_w/2, scy, zF - 0.8, scr_w, scr_h, 0.8, C["dk_t"], C["dk_f"], C["dk_s"], zmin=face_z)
    p = [iso(-scr_w/2 + 2, scy + scr_h - 1.5, zF), iso(scr_w/2 - 2, scy + scr_h - 1.5, zF),
         iso(scr_w/2 - 2, scy + 1.5, zF), iso(-scr_w/2 + 2, scy + 1.5, zF)]
    s.poly(p, C["scr"], stroke=None, zmin=face_z)
    tx, ty = iso(0, scy + scr_h * 0.5, zF + 0.1)
    s.text(tx, ty, "⚡", 6)

    # 状态灯带（左侧竖向绿条）
    s.box(-body_w/2 + 3, base_h + body_h * 0.28, zF - 0.8, 2.6, body_h * 0.36, 0.8,
          C["ok"], C["ok"], "#189a52", outline=None, sw=0.8, zmin=face_z)

    # 刷卡区 + 急停红钮
    s.box(body_w * 0.08, base_h + body_h * 0.56, zF - 0.8, body_w * 0.34, body_h * 0.09, 0.8, C["dk_t"], C["dk_f"], C["dk_s"], outline=None, sw=0.8, zmin=face_z)
    icx, icy = iso(body_w * 0.25, base_h + body_h * 0.47, zF - 0.2)
    s.circle(icx, icy, 2.4, C["red"], stroke="#8f272c", sw=0.9)

    # 底部散热百叶
    for i in range(3):
        gy = base_h + body_h * 0.06 + i * (body_h * 0.045)
        p = [iso(-body_w * 0.3, gy, zF - 0.4), iso(body_w * 0.3, gy, zF - 0.4),
             iso(body_w * 0.3, gy + 1.4, zF - 0.4), iso(-body_w * 0.3, gy + 1.4, zF - 0.4)]
        s.poly(p, C["dk_s"], stroke=None, zmin=face_z)

    # 侧挂充电枪（右侧）
    gun_x = body_w/2 + 4.5
    gun_y = base_h + body_h * 0.5
    s.box(body_w/2 + 0.5, gun_y - 4, zF - 4, 5, 8, 4, C["gray_t"], C["gray_f"], C["gray_s"], outline=None, sw=0.9, zmin=face_z)
    s.box(gun_x - 2, gun_y - 6, zF - 4, 4.5, 12, 5, C["gray_t"], C["gray_f"], C["gray_s"], outline=None, sw=0.9, zmin=face_z)
    # 线缆垂坠
    pts3d = [(gun_x, gun_y - 7, zF - 2), (gun_x + 5, gun_y - 12, zF), (gun_x + 3, gun_y - 20, zF - 1), (body_w/2 - 2, base_h + 2, zF - 2)]
    scr_pts = [iso(*p) for p in pts3d]
    for i in range(len(scr_pts) - 1):
        s.line(scr_pts[i], scr_pts[i + 1], C["rubber"], sw=3.4)


# ================================================================ 光伏 pv
def pv(s):
    """倾斜光伏阵列（朝观察者倾斜）3x2 深蓝板 + 铝框 + 支柱"""
    w, d = 78, 52
    tilt_deg = 36
    tilt = math.radians(tilt_deg)
    cols, rows = 3, 2
    gap_x, gap_z = w * 0.05, d * 0.08
    panel_w = (w - gap_x * (cols - 1)) / cols
    panel_d = (d - gap_z * (rows - 1)) / rows
    frame_h = 2.2

    def tilt_pt(x, y, z):
        # 阵列组绕 X 轴倾斜（顶端向 -Z 抬起，正面朝观察者压低）
        yy = y * math.cos(tilt) - z * math.sin(tilt)
        zz = y * math.sin(tilt) + z * math.cos(tilt)
        return x, yy, zz

    lift = (d / 2) * math.sin(tilt)
    leg_h = max(7, d * 0.2)

    def P(x, y, z):
        return iso(*tilt_pt(x, y, z))

    # 支柱（4 根，画在板下面先渲染）
    for sx in (-1, 1):
        for sz in (-1, 1):
            lx = sx * (w/2 - w * 0.1)
            lz = sz * (d/2 - d * 0.12)
            p0 = iso(lx, 0, lz)
            top_pt = P(lx, leg_h - lift * sz, lz)
            s.line(p0, top_pt, "#9aa3ae", sw=3.0)

    # 光伏板（每块：铝框顶面 + 深蓝电池面 + 栅线）
    for r in range(rows):
        for c in range(cols):
            px = -w/2 + panel_w/2 + c * (panel_w + gap_x)
            pz = -d/2 + panel_d/2 + r * (panel_d + gap_z)
            hz = panel_w / 2
            # 电池面（倾斜平板的上表面）
            pts = [P(px - hz, leg_h - lift + frame_h, pz - panel_d/2),
                   P(px + hz, leg_h - lift + frame_h, pz - panel_d/2),
                   P(px + hz, leg_h - lift + frame_h, pz + panel_d/2),
                   P(px - hz, leg_h - lift + frame_h, pz + panel_d/2)]
            s.poly(pts, C["pv_f"], sw=1.2)
            # 栅线（3 条横向分割）
            for k in (1, 2):
                t = k / 3
                z1 = pz - panel_d/2 + panel_d * (t - 1/6)
                z2 = pz - panel_d/2 + panel_d * (t + 1/6)
                s.line(P(px - hz * 0.92, leg_h - lift + frame_h + 0.1, z1),
                       P(px + hz * 0.92, leg_h - lift + frame_h + 0.1, z1), C["pv_t"], sw=1.0)
                s.line(P(px - hz * 0.92, leg_h - lift + frame_h + 0.1, z2),
                       P(px + hz * 0.92, leg_h - lift + frame_h + 0.1, z2), C["pv_s"], sw=1.0)

    # 汇流箱（左后角小白盒）
    s.box(-w/2 + 2, 2, -d/2 + 1, w * 0.16, w * 0.11, d * 0.14, C["white_t"], C["white_f"], C["white_s"], sw=1.0)


# ================================================================ 断路器 breaker
def breaker(s):
    """绝缘底座 + 灰色开关本体 + 绿色合闸手柄（后仰）+ 两端铜端子 + 指示灯"""
    w, d = 52, 28
    base_h = 6
    body_h = 20
    body_d = max(13, d * 0.6)
    zF = body_d / 2

    s.box(-w/2 - 1, 0, -body_d/2 - 2, w + 2, base_h, body_d + 4, C["plinth_t"], C["plinth_f"], C["plinth_s"])
    s.box(-w/2, base_h, -body_d/2, w, body_h, body_d, C["gray_t"], C["gray_f"], C["gray_s"])
    s.box(-w * 0.46, base_h + body_h * 0.5, -body_d * 0.46, w * 0.92, body_h * 0.5, body_d * 0.92, C["white_t"], C["white_f"], C["white_s"])

    # 两端铜端子
    for side in (-1, 1):
        s.box(side * w * 0.44 - w * 0.07, base_h * 0.4, -body_d * 0.25, w * 0.14, base_h * 0.55, body_d * 0.5,
              C["cu_t"], C["cu_f"], C["cu_s"], outline=None, sw=0.8)

    # 合闸手柄（绿色，向后上方仰起）
    lever_h = 15
    px, py, pz = 0, base_h + body_h * 0.3, body_d / 2 - 1.5
    ang = math.radians(36)
    bx, by = iso(px, py, pz)
    tx_, ty_ = iso(px + 0, py + lever_h * math.cos(ang), pz - lever_h * math.sin(ang))
    t2 = iso(px + 5, py + lever_h * math.cos(ang), pz - lever_h * math.sin(ang))
    b2 = iso(px + 5, py, pz)
    s.poly([ (bx, by), (b2[0], b2[1]), (t2[0], t2[1]), (tx_, ty_) ], C["ok"], sw=1.1)
    # 顶端握把
    gx1 = iso(px - 2.5, py + lever_h * math.cos(ang), pz - lever_h * math.sin(ang))
    gx2 = iso(px + 7.5, py + lever_h * math.cos(ang), pz - lever_h * math.sin(ang))
    gy1 = iso(px - 2.5, py + lever_h * math.cos(ang) + 3.4, pz - lever_h * math.sin(ang))
    gy2 = iso(px + 7.5, py + lever_h * math.cos(ang) + 3.4, pz - lever_h * math.sin(ang))
    s.poly([gx1, gx2, gy2, gy1], C["ok_glow"], sw=1.0)

    # 指示灯（合闸绿）
    icx, icy = iso(-w * 0.3, base_h + body_h * 0.92, body_d / 2 - 1)
    s.circle(icx, icy, 2.0, C["ok_glow"], stroke="#0f7a42", sw=0.8)

    # 铭牌
    s.box(w * 0.12, base_h + body_h * 0.42, body_d / 2 - 1.6, w * 0.3, body_h * 0.2, 1, C["dk_t"], C["dk_f"], C["dk_s"], outline=None, sw=0.7)


# ================================================================ 变压器 transformer
def transformer(s):
    """深色台座 + 灰油箱 + 两侧片式散热器 + 顶部储油柜 + 三只瓷套管"""
    w, d = 60, 40
    base_h = 6
    tank_h = 34
    tank_w = w * 0.6
    tank_d = d * 0.66
    bushing_h = 20
    zF = tank_d / 2

    s.box(-w/2, 0, -d * 0.43, w, base_h, d * 0.86, C["plinth_t"], C["plinth_f"], C["plinth_s"])
    s.box(-tank_w/2, base_h, -tank_d/2, tank_w, tank_h, tank_d, C["gray_t"], C["gray_f"], C["gray_s"])
    s.box(-tank_w/2 * 1.1, base_h + tank_h, -tank_d/2 * 1.1, tank_w * 1.1, 2.6, tank_d * 1.1, C["dark_t"], C["dark_f"], C["dark_s"], sw=1.1)

    # 两侧片式散热器（左右各 4 片薄板）
    for side in (-1, 1):
        for i in range(4):
            fx = side * (tank_w/2 + 2.5)
            fz = -tank_d * 0.34 + i * (tank_d * 0.68 / 3)
            fin_h = tank_h * 0.62
            p = [iso(fx - 1.6, base_h + 2, fz), iso(fx + 1.6, base_h + 2, fz),
                 iso(fx + 1.6, base_h + 2 + fin_h, fz), iso(fx - 1.6, base_h + 2 + fin_h, fz)]
            s.poly(p, C["alu_f"], sw=0.9)

    # +Z 面铭牌 + 铜端子（层级高于油箱）
    zF = tank_d / 2
    face_z = 1.0
    s.box(-tank_w * 0.34, base_h + tank_h * 0.45, zF - 1.2, tank_w * 0.34, tank_h * 0.26, 1.2, C["dk_t"], C["dk_f"], C["dk_s"], outline=None, sw=0.8, zmin=face_z)
    s.box(tank_w * 0.1, base_h + tank_h * 0.28, zF - 2, tank_w * 0.24, tank_h * 0.1, 2, C["cu_t"], C["cu_f"], C["cu_s"], outline=None, sw=0.8, zmin=face_z)

    # 顶部储油柜（横置圆柱：矩形身 + 两端椭圆盖）
    drum_y = base_h + tank_h + 8
    drum_r = 6.5
    drum_len = tank_w * 0.8
    d0 = iso(-drum_len/2, drum_y, -tank_d * 0.3)
    d1 = iso(drum_len/2, drum_y, -tank_d * 0.3)
    d2 = iso(drum_len/2, drum_y + drum_r * 2, -tank_d * 0.3)
    d3 = iso(-drum_len/2, drum_y + drum_r * 2, -tank_d * 0.3)
    s.poly([d0, d1, d2, d3], C["gray_f"], sw=1.1)
    e1 = iso(drum_len/2, drum_y + drum_r, -tank_d * 0.3)
    s.circle(e1[0], e1[1], drum_r, C["gray_s"], stroke=OUTLINE, sw=1.0)

    # 三只高压套管（瓷瓶 + 两层伞裙 + 顶帽）
    for i in range(3):
        bx = -tank_w * 0.3 + i * (tank_w * 0.6 / 2)
        bz = zF * 0.4
        y0 = base_h + tank_h + 3
        # 瓷瓶身
        p0 = iso(bx, y0, bz)
        p1 = iso(bx, y0 + bushing_h * 0.6, bz)
        s.line(p0, p1, C["por_f"], sw=5.0)
        # 伞裙两片
        for k, t in enumerate((0.3, 0.62)):
            yy = y0 + bushing_h * 0.6 * t
            c = iso(bx, yy, bz)
            s.line(iso(bx, yy - 2, bz), iso(bx, yy + 1, bz), C["por_s"], sw=8.5)
        # 顶帽金属
        p2 = iso(bx, y0 + bushing_h * 0.6, bz)
        p3 = iso(bx, y0 + bushing_h * 0.78, bz)
        s.line(p2, p3, C["alu_t"], sw=4.0)
        cap = iso(bx, y0 + bushing_h * 0.82, bz)
        s.circle(cap[0], cap[1], 2.2, C["alu_t"], stroke=OUTLINE, sw=0.8)


# ================================================================ 电网 grid
def grid(s):
    """输电铁塔：四腿收分塔身 + 三层横担 + 绝缘子串 + 塔顶地线羊角"""
    size = 60
    height = size * 2.1

    def hw(y):
        # 收分：底部宽 -> 塔颈窄
        t = y / height
        if t < 0.55:
            return size * (0.42 - 0.30 * (t / 0.55))
        return size * (0.12 - 0.03 * ((t - 0.55) / 0.45))

    def L(x, y, z):
        return iso(x, y, z)

    # 四条塔腿（分段收分）
    segs = 6
    for sx in (-1, 1):
        for sz in (-1, 1):
            for i in range(segs):
                y1 = height * i / segs
                y2 = height * (i + 1) / segs
                w1, w2 = hw(y1), hw(y2)
                s.line(L(sx * w1, y1, sz * w1), L(sx * w2, y2, sz * w2), C["steel"], sw=2.4)

    # 水平横隔 + 交叉斜材（正面与侧面）
    levels = [0.0, 0.18, 0.36, 0.55, 0.72, 0.88]
    for i in range(len(levels) - 1):
        y1, y2 = height * levels[i], height * levels[i + 1]
        h1, h2 = hw(y1), hw(y2)
        # 正面 X 斜材
        s.line(L(-h1, y1, h1), L(h2, y2, h2), C["steel_d"], sw=1.4)
        s.line(L(h1, y1, h1), L(-h2, y2, h2), C["steel_d"], sw=1.4)
        # 侧面 X 斜材（右）
        s.line(L(h1, y1, -h1), L(h2, y2, h2), C["steel_d"], sw=1.2)
        s.line(L(h1, y1, h1), L(h2, y2, -h2), C["steel_d"], sw=1.2)
        # 水平环（正面 + 右侧两条）
        s.line(L(-h2, y2, h2), L(h2, y2, h2), C["steel"], sw=1.4)
        s.line(L(h2, y2, -h2), L(h2, y2, h2), C["steel"], sw=1.4)

    # 三层横担（每层左右横梁微翘 + 绝缘子串）
    arm_levels = [(0.60, 0.95), (0.70, 0.78), (0.80, 0.6)]
    for t, ln in arm_levels:
        y = height * t
        shaft = hw(y)
        for side in (-1, 1):
            tip = side * size * ln / 2
            s.line(L(side * shaft, y, 0), L(tip, y + size * 0.05, 0), C["steel"], sw=2.2)
            s.line(L(side * shaft, y - size * 0.09, 0), L(tip * 0.96, y + size * 0.04, 0), C["steel_d"], sw=1.2)
            # 绝缘子串（3 小节）+ 挂点
            for k in range(3):
                yy = y - size * 0.05 - k * 3.2
                c = iso(tip, yy, 0)
                s.circle(c[0], c[1], 1.9, C["por_f"], stroke=C["por_s"], sw=0.9)
            drop = y - size * 0.05 - 3 * 3.2
            s.line(iso(tip, drop - 1, 0), iso(tip, drop - 4, 0), C["rubber"], sw=1.6)

    # 塔顶地线羊角 + 避雷针
    top_y = height * 0.92
    th = hw(top_y)
    for side in (-1, 1):
        s.line(L(side * th, top_y, 0), L(side * size * 0.3, height, 0), C["steel"], sw=1.8)
    s.line(L(0, height * 0.9, 0), L(0, height * 1.03, 0), C["steel"], sw=1.8)
    c = iso(0, height * 1.03, 0)
    s.circle(c[0], c[1], 1.8, C["alu_t"], stroke=OUTLINE, sw=0.8)


# ================================================================ 输出
import sys

# 用法: python3 gen-device-icons.py [输出目录]（缺省输出到脚本所在目录）
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/gen_icons"

def save(name, svg):
    with open(f"{OUT}/{name}", "w") as f:
        f.write(svg)
    print("wrote", name)


battery = Svg(); battery_cabinet(battery, True)
save("battery.svg", battery.fit_render("电池堆", "v2 iso: 白柜+蓝模组+SOC条"))
cluster = Svg(); battery_cabinet(cluster, False)
save("battery_cluster.svg", cluster.fit_render("电池簇", "v2 iso: 电池簇柜 4 层模组"))
pcs_s = Svg(); pcs(pcs_s)
save("PCS.svg", pcs_s.fit_render("PCS 储能变流器", "v2 iso: 双开门立柜+液晶屏"))
pinvt_s = Svg(); pinvt(pinvt_s)
save("pinvt.svg", pinvt_s.fit_render("光伏逆变器", "v2 iso: 壁挂箱+顶部鳍片+大屏"))
meter_s = Svg(); meter(meter_s)
save("meter.svg", meter_s.fit_render("双向电表", "v2 iso: 圆顶表计+液晶屏"))
charger_s = Svg(); charger(charger_s)
save("charger.svg", charger_s.fit_render("充电桩", "v2 iso: 立式桩+侧挂充电枪"))
pv_s = Svg(); pv(pv_s)
save("pv.svg", pv_s.fit_render("光伏", "v2 iso: 倾斜光伏阵列"))
breaker_s = Svg(); breaker(breaker_s)
save("breaker.svg", breaker_s.fit_render("断路器", "v2 iso: 开关本体+绿色合闸手柄"))
trans_s = Svg(); transformer(trans_s)
save("transformer.svg", trans_s.fit_render("变压器", "v2 iso: 油箱+散热片+瓷套管"))
grid_s = Svg(); grid(grid_s)
save("grid.svg", grid_s.fit_render("电网", "v2 iso: 输电铁塔"))
print("ALL DONE")
