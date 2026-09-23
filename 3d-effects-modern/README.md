# 生长 · 现代商业综合体营造

一座商业综合体从场地平整开始逐层长出来的可环视三维动画。体量与立面参照**杭州
大厦**的蓝调黄昏街景：白色石材裙房围合，中央 24 单位通高中庭透出暖光，背后是
深蓝绿镀膜玻璃塔楼，竖排汉字招牌、水平雨篷、LOUIS VUITTON 门面，前景是行道树
与车流。

核心张力是**冷调外立面 vs 暖调内透光**——白天是石头的体量，入夜是光的容器。

用 `threejs-modern-architecture` skill 的 `scaffold.mjs` 起手，自包含、无外部
资源、无 API key。

## 跑起来

```sh
npm ci
npm run dev          # 127.0.0.1:5173
npm run build        # tsc --noEmit && vite build
npm run preview      # 预览生产构建
```

需要 Node.js 22.13+。

## 它做了什么

| 机制 | 位置 |
| --- | --- |
| 按材质合批，每材质 1 个 draw call（1,209 块构件 → 32 个 draw call） | `src/structure/builder.ts` |
| 把建造时序烘进顶点属性的生长着色器（`aBuild` / `aOffset`），颜色与阴影共用同一段位移 | `builder.ts` `inject()` |
| 逐构件 emissive 爬升，「灯光依次点亮」由建成状态直接驱动 | `builder.ts` `rampedEmissive` + `complex.ts` `PHASE.lighting` |
| 程序化 equirect 天空 → PMREM，同时充当 `scene.background` 与玻璃的环境贴图 | `materials.ts` `createSkyEnvironment()` |
| 深蓝绿镀膜玻璃按方位角波次合拢、白色花岗岩干挂大板、铝型材竖梃、清玻橱窗 | `materials.ts` |
| 招牌用 alphaTest 抠字（`createSignTexture` 只画字符、留透明底） | `materials.ts` + `complex.ts` `buildSignage()` |
| InstancedMesh 植被 + 逐实例生长 + 顶点风摆 | `structure/vegetation.ts` |
| 需求渲染 + 30 Hz 阴影节流 | `TowerScene.tsx` |

## 结构

```
src/
  App.tsx                 播放控制、时间轴、阶段标签、视角按钮
  TowerScene.tsx          three.js 场景、黄昏布光、四个相机预设、渲染循环、性能出口
  style.css               展陈版式（与建筑外观无关）
  structure/
    builder.ts            合批 + 生长着色器 + emissive 爬升
    materials.ts          22 种程序化材质 + 蓝调黄昏天空环境贴图
    complex.ts            体量常量、PHASE 时序总谱、裙房 / 中庭 / 双塔 / 招牌
    site.ts               场地、道路、车流、路桩、台阶、绿池
    vegetation.ts         实例化植被 + 风摆
    rng.ts                确定性随机
preview/                  六个机位的验收截图
```

## 改哪里

- **改体量**（层数 / 层高 / 半宽）→ `complex.ts` 顶部的 `PLINTH` / `WING_*` /
  `ATRIUM` / `TOWER` / `GLASS_TOWER` / `DARK_BLOCK`，同时要更新 `TowerScene.tsx`
  的四个相机预设。
- **改时序** → `complex.ts` 的 `PHASE`（10 段），并同步 `App.tsx` 的 `STAGES`
  （后者只是显示）。
- **改配色与天空** → `materials.ts` 的 `PALETTE` 与 `createSkyEnvironment()`。
  ⚠️ 天空渐变的 stop 位置必须按**相机可见的 v 区间**来定，不要凭肉眼调，见下。
- **改暖光强度** → `materials.ts` 的 `EMISSIVE`。超过 1.5 会被 ACES 压成纯白，
  窗口就不再是窗口了。

## 已测指标

1440×900 / dpr 1 / Chrome，读 `.three-scene` 的 `data-render-stats` 实测：

| 场景 | draw calls | triangles | 说明 |
| --- | --- | --- | --- |
| 完工静止（全景） | 32 | 49,220 | `renderFps: 0` + `idle: true`，静止时彻底不再渲染 |
| 完工静止（塔顶） | 17 | 28,082 | 窄视锥，视锥剔除生效 |
| 施工中（播放） | 21 | 28,696 | 60 FPS，阴影 22 次/秒（上限 30） |
| 窄屏 420×820 | 32 | 49,220 | 与宽屏相同——该宽高比下视锥未收窄，裁剪量一致 |

构件 1,209 块、植被 114 实例、21 geometries / 35 textures、`postPasses: 0`。

`npx tsc --noEmit` 干净；`npm run build` 通过（812 kB / gzip 222 kB，主要是 three.js
本体）。干净 reload 后控制台零 error 零 warning。

> 换了体量或材质后这些数字都会变，**重新测一遍再写进文档**，不要沿用旧值。

## 两个必须记住的坑

**1. 天空渐变的 stop 位置由相机决定，不由审美决定。**

全景机位俯角约 4.5°、竖直 fov 34°、地面 240 单位见方，因此它**能看到的天空只有
equirect 的 v ∈ [0.43, 0.55]**，约地平线以上 12°。最初把暖色带铺在 0.44–0.56，
正好等于整个可见天空，于是幕墙从头到脚反射琥珀色，"深蓝绿玻璃"完全读不出来。
蓝色必须压到 v ≈ 0.49 才成立。

同理，城市光晕若用**圆形**径向渐变画在 1024×512 的 equirect 上，230 px 半径等于
垂直方向 45% 的画面高度（≈81° 仰角）。要做成压扁的（`ctx.scale(1, 0.22)`），
才是地平线上约 18° 的光穹。

**2. 幕墙挂板在下降就位时会露出真实空隙，这不是 bug。**

`lift` 让每层挂板从上方 2.2 单位落到位。某一瞬间总有约两层在空中，若正好是**最高
一层**，背后就是天空，静帧上看起来像悬空的板。做验收截图时换个进度即可；黑色塔楼
同区域会出现同样的间隙，可作为判断依据。

## 注意

- 场景单位是**米**（层高 3.6、行道树 6–10）。改构件尺寸时请顺手核对参照物，
  "建筑像玩具"几乎总是植被或道具缩小了。行道树曾按 1.5× 放，树冠达 14 单位，
  直接挡住了所有近景机位。
- 所有"随机"必须是索引的纯函数。**不要在几何代码里用 `Math.random()`**，否则回拖
  时间轴会得到另一栋楼。

细节见 skill 的 `references/`。
