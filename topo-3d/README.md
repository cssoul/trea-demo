# 储能立体接线图 · TOPO 3D（第二版）

基于 **Vue 3 + Vite + Three.js + Ant Design Vue** 构建的储能系统**立体接线图**编辑与监控应用。

第二版把第一版的 2D（SVG/D3）拓扑画布整体升级为 **等轴测（Isometric）三维微缩沙盘**：设备用低多边形几何体拼装成微缩实物模型，连线渲染为半空中拱起的立体电缆管道，实时数据驱动流光、SOC 电量条、指示灯与断路器分合闸。

> **数据结构完全兼容第一版**：第一版导出的 JSON 无需任何修改即可在第二版加载渲染，编辑器交互（拖拽 / 缩放 / 旋转 / 连线 / 属性 / 撤销重做 / 保存加载）全部保留。

---

## 技术栈

| 类别 | 技术 | 说明 |
| ---- | ---- | ---- |
| 框架 | Vue 3（`<script setup>`） | 渐进式前端框架 |
| 构建 | Vite | 开发服务器与打包 |
| 路由 | Vue Router 4 | Hash 模式路由 |
| 三维渲染 | Three.js | 等轴测正交相机、PBR 材质、阴影、着色器流光 |
| UI | Ant Design Vue 4 | 表单、弹窗、按钮等组件 |
| 状态 | Vue 响应式 + localStorage | 拓扑数据持久化（`topo_data`） |

---

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器（默认 http://localhost:5173）
npm run dev

# 生产构建
npm run build

# 预览生产构建
npm run preview
```

默认路由会跳转到查看模式（`/#/topo/viewer`），点击右上角「编辑」进入编辑模式（`/#/topo/editor`）。

---

## 项目结构

```
topo-v2/
├── index.html                      # HTML 入口，加载 Google Fonts 与图标
├── vite.config.js                  # Vite 配置，含 @ 别名与端口设置
├── package.json                    # 依赖与脚本（three / vue / ant-design-vue）
├── public/imgs/                    # 设备 SVG 图标（组件库面板、详情弹窗使用）
└── src/
    ├── main.js                     # 应用入口，注册 Antd 与路由
    ├── App.vue                     # 根组件
    ├── router/index.js             # 路由配置（/topo/editor、/topo/viewer）
    ├── styles/global.css           # 全局主题变量（深色 UI + 浅色三维场景）、动画
    └── views/topo/
        ├── index.vue               # 顶层布局，子路由过渡
        ├── Editor.vue              # 编辑模式页面
        ├── Viewer.vue              # 查看模式页面（实时监控）
        ├── components/             # UI 组件（工具栏 / 组件库 / 属性面板 / 右键菜单）
        ├── config/nodeConfig.js    # 节点与连线类型配置、节点/连线工厂
        ├── data/                   # 默认拓扑数据、设备列表、实时数据模拟器
        └── core/
            ├── DataBinder.js           # 设备绑定与级联校验
            ├── AnimationManager.js     # 实时数据动画管理（驱动三维状态渲染）
            └── three/                  # === 第二版三维渲染层 ===
                ├── TopoScene.js        # 立体拓扑画布门面（数据模型 / 事件总线 / 状态渲染）
                ├── SceneManager.js     # 渲染器、等轴测相机、光照、沙盘地面、渲染循环
                ├── DeviceFactory.js    # 设备模型统一入口（分发 + 标签/告警/拾取体 + 状态渲染）
                ├── ModelBuilder.js     # 模型拼装工具（体素盒体、实例化、格栅、屏幕）
                ├── devices/            # 各类设备模型
                │   ├── batteryDevices.js     # 电池堆 / 电池簇（立式电池柜）
                │   ├── inverterDevices.js    # PCS 双开门立柜 / 壁挂逆变器
                │   ├── meteringDevices.js    # 双向电表 / 断路器（含可动手柄）
                │   ├── transformerDevice.js  # 变压器（散热片 + 高压套管）
                │   ├── chargerDevice.js      # 充电桩（含充电枪与线缆）
                │   ├── gridDevice.js         # 电网输电铁塔
                │   ├── pvDevice.js           # 光伏阵列
                │   └── basicDevices.js       # 母线 / 直线 / 文字 / 矩形框
                ├── CableFactory.js     # 立体电缆管道（TubeGeometry + 贝塞尔曲线）
                ├── FlowAnimator.js     # 能量流光着色器与统一时间驱动
                ├── materialLibrary.js  # 共享材质与几何体缓存（PBR 材质库）
                ├── textureFactory.js   # CanvasTexture（液晶屏 / 名称标签 / 徽章 / 文字）
                ├── SelectionHelper.js  # 选中轮廓、缩放手柄、旋转手柄
                └── interactions.js     # 指针交互控制器（拾取 / 拖拽 / 缩放 / 旋转 / 连线）
```

---

## 三维渲染层架构

```
Vue 页面（Editor / Viewer）
        │  on/off/emit 事件总线（与第一版一致）
        ▼
TopoScene ────────────── 数据模型（nodes / links）+ 设备与电缆映射 + 实时状态渲染
   ├── SceneManager       渲染器 / 等轴测正交相机 / 光照 / 沙盘底盘 / 渲染循环 / 屏幕⇄地面换算
   ├── DeviceFactory      节点 → 三维设备模型（含标签、告警标记、拾取包围盒、接线端子锚点）
   ├── CableFactory       连线 → 立体电缆管道（基管 + 流光管 + 两端护套）
   ├── FlowAnimator       流光着色器材质注册与统一 uTime 驱动
   ├── SelectionHelper    选中轮廓 + 4 角缩放手柄 + 顶部旋转手柄
   └── interactions       指针拾取与拖拽状态机
```

### 坐标映射

拓扑平面坐标 `(x, y)` 直接映射为三维世界地面坐标 `(x, 0, z)`：

- `node.x / node.y`（左上角）→ 设备中心世界坐标 `(x + w/2, 0, y + h/2)`
- `node.width / node.height` → 设备占地尺寸（X × Z），`y` 轴自动为 0
- `node.rotate`（角度）→ 绕竖轴旋转（`group.rotation.y = -rotate`，与第一版角度方向一致）

因此第一版数据无需任何转换即可直接使用。

### 视觉方案：等轴测微缩沙盘

- **相机**：`OrthographicCamera` + 真等轴测角度（方位角 45°、俯仰角 35.264°），支持受限角度环绕与以指针为锚点的缩放。
- **地面**：浅蓝灰圆角底盘（`ExtrudeGeometry`）+ 双层网格 + 柔和接触阴影（`PCFSoftShadowMap`），设备像摆放在微缩沙盘上。
- **光照**：左上主方向光（投射阴影）+ 半球环境光 + 右侧补光 + 程序化环境贴图（`RoomEnvironment`），保证白色机柜与金属铜排都有细腻明暗层次。
- **材质**：统一 PBR 材质库（机柜白、铝、铜排、深色件、光伏深蓝、状态色），按需克隆供单设备独立控制。

### 设备模型（体素 / 低多边形）

所有模型均由基础几何体（Box / Cylinder / Cone / Sphere / Torus）拼装，无外部模型文件，加载快、风格统一：

| 节点类型 | 模型要点 |
| -------- | -------- |
| 电池堆 stack / 电池簇 cluster | 立式白色机柜、深色底座、正面腔内层叠电池模组（`InstancedMesh`）、右侧 SOC 电量条、顶部格栅与指示灯 |
| PCS | 双开门立柜、门板通风格栅、顶部排风、正面液晶运行面板、侧向散热鳍片 |
| 逆变器 pinvt | 壁挂扁箱 + 顶部铝制散热鳍片 + 正面大屏 + 底部防水接头 |
| 双向电表 meter | 立体表计、液晶读数屏（CanvasTexture 实时刷新）、透明防护罩、按钮与脉冲灯 |
| 断路器 breaker | 小型开关本体、两端铜端子、**可动操作手柄**（合闸绿色上扬 / 分闸红色下压） |
| 变压器 transformer | 箱体 + 两侧片式散热器（`InstancedMesh`）+ 三只高压套管（瓷瓶/伞裙/均压帽）+ 储油柜 |
| 充电桩 charger | 立式桩体 + 计费屏 + 灯带 + 侧挂充电枪 + 自然垂坠的立体线缆（TubeGeometry） |
| 电网 grid | 输电铁塔（四腿收分 + 分层横撑与交叉斜撑 + 三层横担 + 悬垂绝缘子与导线） |
| 光伏 pv | 多排倾斜光伏板阵列（板框/电池片/栅线均为 `InstancedMesh`）+ 汇流箱 + 立柱横梁 |
| 母线 busbar | 立体铜排（架设于绝缘子之上、两端金属端帽、顶部高光） |
| 直线 line | 细长金属电缆槽 |
| 文字 text | 贴地文字贴图（CanvasTexture） |
| 矩形框 rect | 贴地描边区域框（与第一版一致，无填充） |

> **设备标签与数据徽章**：名称标签与功率徽章采用"恒定屏幕尺寸"机制（缩放变化时重算世界尺寸），当前基准为名称约 `24px`、徽章约 `21px` 屏幕高度、间距 `28px`；画布内文字密度已归一化（名称/徽章字号占画布高度比例一致），保证两者视觉等大、缩放时始终清晰。

### 立体电缆与能量流光

- **贴地直角走线（编辑 / 预览统一）**：电缆从设备**底部侧面**（`CABLE_EXIT_HEIGHT = 4`）水平引出，随后**贴地走线**（`RUN_Y = 2.2`，略高于地面以避免 z-fighting）；母线 / 直线类元素会把接线点在轴线上**就近投影**，形成自然的分支接线。
- **圆角倒角**：转角统一做圆角过渡（`CORNER_RADIUS = 34`，折线经 `roundedPolylineCurve` 转为带二次贝塞尔圆角的 `CurvePath`），避免生硬折角，整体观感贴近竞品"贴地走线"。
- **线条样式**（`link.type`，默认 `auto`）：
  - `auto` —— 按两端相对位置自动择优：轴向对齐走直线，斜向走直角折线（横行优先，段长更均衡时改纵行优先）；
  - `straight` —— 贴地直线直连；
  - `curve` —— 贴地平滑弧线（二次贝塞尔，控制点落在连线中垂线上）；
  - `orthogonal` —— 手工正交折线（水平段 + 90° 转角 + 水平段）。
  - 旧数据若无 `type` 字段，自动回退为 `auto`。
- 管道由 `TubeGeometry` 沿上述路径生成，质量分级：静止高分段（`tubular 36 / radial 8`）、拖拽低分段（`tubular 14 / radial 6`）；管道半径由 `strokeWidth` 映射（`RADIUS_MIN 1.8 ~ RADIUS_MAX 5`）。
- 流光使用自定义 `ShaderMaterial`：沿管道方向推进的周期性能量光团、两端渐隐、管壁明暗带，加法混合渲染。
- **流向与流速映射实际功率**：功率越大流速越快，方向由放电/充电状态决定（放电端 → 充电端）。
- **供电拓扑联动**：以电网 / 光伏为电源做广度优先遍历，断路器分闸时切断该支路 —— 下游电缆流光停止并置灰（`cableOff`），直观表达"分闸即断开"。

### 全局连线样式配置（linkStyleConfig）

编辑器与查看器共用同一套连线样式，通过 `src/views/topo/config/linkStyleConfig.js` 统一管理：

- **配置字段**：`strokeWidth`（线缆粗细，默认 `2`）、`color`（线缆默认色，默认 `#000000`）、`chargeColor`（充电流光色，默认 `#00c853`）、`dischargeColor`（放电流光色，默认 `#ffb020` 橙黄）。
- **持久化**：写入 `localStorage`（键 `topo_link_style`），刷新后自动恢复；构造场景时自动 `loadLinkStyleConfig`。
- **即时生效**：编辑器工具栏「连线配置」按钮打开弹窗（粗细 + 三色），`TopoScene.setLinkStyleConfig` 即时重建全部电缆与流光；编辑 / 预览两侧表现完全一致。
- **兼容性迁移**：旧版默认放电色为蓝色（`#2f6bff`），未自定义过的用户读取到该值时自动升级为橙黄（`#ffb020`）。
- **颜色哨兵**：连线 `style.stroke` 为 `#666` 视为"未显式设色"，渲染时回退到全局 `color`。

### 性能设计

- **共享资源**：所有材质与重复几何体（盒体 / 圆柱 / 球体 / 平面）集中缓存复用；每条电缆仅持有自己的管道几何体与着一个流材质。
- **实例化渲染**：电池模组、电芯装饰条、散热鳍片、格栅条、光伏板框与电池片均使用 `InstancedMesh`，大幅降低绘制调用。
- **拾取优化**：每个设备仅一个不可见包围盒参与射线检测（拾取目标数组恒定），手柄优先于设备、设备优先于电缆。
- **拖拽降级**：拖拽过程中降低电缆管道分段数，松手后恢复高精度；缩放拖动时限频重建模型（约 70ms 一次）。
- **帧率无关动画**：流光与告警呼吸均基于 `Clock` 的 delta 累加，切页/暂停后不会出现时间跳变。
- **资源释放**：设备、电缆、材质、贴图、几何体在删除节点或销毁画布时逐项释放，避免显存泄漏。

---

## 功能概览

### 双模式架构

| 路径 | 页面 | 说明 |
| ---- | ---- | ---- |
| `/` | - | 重定向到 `/topo/viewer` |
| `/topo/viewer` | 查看模式 | 实时监控视图（只读） |
| `/topo/editor` | 编辑模式 | 立体接线图编辑视图 |

### 编辑模式（Editor）

布局为「顶部工具栏 + 左侧组件库 + 中间三维沙盘 + 右侧属性面板」，右侧/左侧面板可折叠。

| 操作 | 行为 |
| ---- | ---- |
| 左键点击设备 | 选中设备（出现贴地高亮轮廓与手柄），右侧面板显示属性 |
| 左键拖拽设备 | 在地面平面内移动设备，实时同步相连电缆（拖拽中自动降级精度） |
| 拖拽 4 角球形手柄 | 调整设备占地尺寸（尊重 `nodeConfig.resizable` 的缩放方向约束），模型实时重建 |
| 拖拽设备上方球形手柄 | 绕竖轴旋转设备（围绕设备中心，角度连续无跳变） |
| 右键 / `Alt` + 左键拖拽 | 环绕视角（方位角与俯仰角限制在可读范围内） |
| 左键拖拽空白 | 平移画布 |
| 滚轮 | 以指针位置为锚点缩放 |
| 右键点击设备 | 打开右键菜单（复制 / 粘贴 / 克隆 / 置顶 / 置底 / 删除） |
| 连线模式 | 工具栏开启后：点击源设备 → 鼠标跟随临时引导管道 → 点击目标设备建立立体电缆；点击空白取消 |
| 点击电缆 | 选中连线，右侧面板可切换线条样式（`auto` / 直线 / 曲线 / 正交）与线宽 |
| 点击工具栏「连线配置」 | 打开全局连线配置弹窗，统一设置线缆粗细、默认色、充电 / 放电流光色（即时生效并持久化，编辑 / 预览两侧一致） |
| 双击组件库条目 / 拖拽到画布 | 新增设备节点 |

其它保留能力：

- **组件库**：基础元素（母线 / 直线 / 文字 / 矩形框）、储能设备（电池堆 / 电池簇 / PCS）、发电与计量（光伏 / 逆变器 / 双向电表 / 断路器 / 变压器 / 充电桩 / 电网）。
- **设备绑定**：节点可绑定真实设备，已绑定设备不可重复关联；电池簇需先选择所属电池堆（父子级联校验）。
- **快捷键**：`Ctrl+Z` 撤销、`Ctrl+Y` 重做、`Ctrl+S` 保存、`Ctrl+C` / `Ctrl+V` 复制粘贴、`Delete` 删除、`Esc` 取消。
- **撤销 / 重做**：历史快照栈，最多 50 步。
- **数据持久化**：保存到 `localStorage`（`topo_data`），刷新后自动恢复。

### 查看模式（Viewer）

- **顶部 KPI**：总功率、平均 SOC、在线设备数、告警数（每 2.5 秒刷新）。
- **实时状态渲染**（由 `AnimationManager` 驱动）：
  - 指示灯：充电 / 放电 / 待机 / 告警 / 离线分色，告警时高亮呼吸；
  - 电池堆 / 电池簇：SOC 电量条高度与分档颜色（红 < 20% / 橙 20%~60% / 绿 > 60%）；
  - 电表 / PCS 液晶屏：实时功率或累计电量读数（CanvasTexture 动态重绘）；
  - 断路器：手柄分合闸动作 + 颜色变化；
  - 离线设备整体暗化为半透明灰色；
  - 告警设备：设备上方红色标记上下浮动并旋转。
- **电缆流光**：方向与速度映射功率大小与方向；断路器分闸后下游支路流光停止并置灰。
- **设备详情**：点击设备弹出详情弹窗（SOC、功率、电压、电流、温度、告警）。
- **图例与视角控制**：左上角图例（充电 / 放电色动态读取全局连线配置，与场景流光保持一致）、左下角放大 / 缩小 / 自适应按钮。

---

## 数据说明

拓扑数据默认来自 `src/views/topo/data/topoData.ts`，用户保存后优先读取 `localStorage` 的 `topo_data`。

节点与连线结构与第一版**完全一致**，例如：

```jsonc
{
  "nodes": [
    {
      "id": "node_stack001",
      "type": "stack",            // busbar | line | text | rect | stack | cluster | pcs | pinvt | meter | breaker | transformer | charger | grid | pv
      "x": 1480, "y": 110,        // 平面坐标（三维中映射为地面坐标）
      "width": 70, "height": 70,  // 占地尺寸
      "text": "电池堆-1",
      "data": { "deviceType": "stack", "bindable": true, "binding": { "deviceId": "stack001", "deviceType": "stack", "deviceName": "电池堆-1", "parentDeviceId": null } },
      "style": {}, "zIndex": 0, "rotate": 0
    }
  ],
  "links": [
    { "id": "link_a", "source": "node_stack001", "target": "node_line_dc", "type": "curve", "style": { "stroke": "#666", "strokeWidth": 3 }, "data": {} }
  ]
}
```

- 连线 `links` 字段说明：`type` 为线条样式（`auto` / `straight` / `curve` / `orthogonal`，缺省回退 `auto`）；`style.stroke` 为 `#666` 时视为"未显式设色"、回退全局 `color`；全局样式见 `linkStyleConfig.js`（粗细、默认色、充电 / 放电流光色，`localStorage` 键 `topo_link_style`）。
- 实时数据目前为前端模拟器（`data/realtimeData.ts`），接入真实设备时只需替换 `getRealtimeData` 数据源。
- 设备列表与绑定关系见 `data/deviceData.ts`。

---

## 第二版实现要点对照

| 阶段 | 内容 | 对应实现 |
| ---- | ---- | -------- |
| 一 | 搭建 Three.js 场景与相机 | `SceneManager.js`（正交等轴测相机、光照、沙盘地面、渲染循环、缩放平移环绕、自适应取景） |
| 二 | 设备模型工厂 | `DeviceFactory.js` + `devices/*.js` + `ModelBuilder.js` + `materialLibrary.js` |
| 三 | 立体母线 / 电缆与流光 | `CableFactory.js` + `FlowAnimator.js` |
| 四 | 交互迁移 | `interactions.js`（Raycaster 拾取 / 拖拽 / 缩放 / 旋转 / 连线 / 右键） |
| 五 | 实时数据与状态渲染 | `AnimationManager.js` + `TopoScene` 状态接口（指示灯 / SOC / 屏幕 / 手柄 / 告警 / 离线 / 流光联动） |
| 清理 | 移除 D3 渲染代码与依赖 | 删除 `core/TopoCanvas.js`、移除 `d3` 依赖、清理 `public/svg` 重复资源 |

---

## 主题与视觉

- **UI 外壳**：沿用第一版的深色「储能科技风」（工具栏 / 面板 / 弹窗），保证与第一版一致的品牌观感。
- **三维场景**：`--scene-*` 变量定义浅色纯净背景（径向渐变）与浅色沙盘底盘，形成"深色工作台 + 明亮产品渲染"的对比。
- **主色约定**：青绿 `#00e0a4`（能量正向流动）、琥珀 `#ffb020`（能量反向流动）、红 `#e0464c`（告警）、灰 `#8f97a3`（停运/离线）。

---

## 环境要求

- Node.js 18+（建议 LTS）
- 支持 WebGL 2 的现代浏览器（Chrome / Edge / Safari / Firefox）

---

## 常见问题

- **页面全黑或提示创建 WebGL 上下文失败**：浏览器未启用硬件加速，请在浏览器设置中开启 WebGL / 硬件加速后重试。
- **想恢复默认演示场景**：清除浏览器 `localStorage` 中的 `topo_data` 键后刷新。
- **开发环境调试**：`import.meta.env.DEV` 下会把画布实例挂到 `window.__topoScene`、动画管理器挂到 `window.__animationManager`，便于在控制台检查三维场景与实时渲染状态（生产构建自动剔除）。
