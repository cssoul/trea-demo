# 土豆运动乐园 · Potato All-Star Park

一个整屏滚动 + 滚动驱动视频过渡的创意型网页项目，使用 **Vue 3 + TypeScript + Vite** 构建。

主题角色：一颗爱运动的土豆 —— 网球 / 游泳 / 篮球 / 滑雪 四态挑战。

## ✨ 核心特性

- **整屏滚动**：每屏 100vh，宽度自适应；鼠标滚轮 / 触屏滑动 / 键盘均可切换，支持上下双向。
- **滚动驱动视频过渡**：视频进度与页面滚动高度一一映射（滚一屏正好播完一个过渡视频），下滚正播、上滚反播，丝滑不卡顿。
- **多格式视频**：Chrome / Edge / Firefox 自动加载 `WebM`，Safari 自动加载 `MP4`（用 `canPlayType` 能力检测，非 UA 猜测）。
- **每屏独立布局**：4 屏用了 4 种不同版式，各有超大标题 + 视频主视觉 + 按钮。
- **顶部导航**：4 个菜单（网球 / 游泳 / 篮球 / 滑雪），点击**直接瞬移定位**到目标屏，不经过中间过渡屏。
- **响应式**：桌面、平板、手机自适应，触屏滑动顺畅。
- **键盘快捷键**：`↓` `↑` `Space` `1/2/3/4` `Home` `End`。

## 🚀 启动

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器（默认 http://localhost:5173）
npm run dev

# 3. 生产构建
npm run build

# 4. 预览构建结果
npm run preview
```

## 📁 项目结构

```
tudou/
├── index.html              # 入口
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── public/                 # 静态资源
│   ├── pic/                # 4 张主视觉
│   │   ├── 1.png           # 网球
│   │   ├── 2.png           # 游泳
│   │   ├── 3.png           # 篮球
│   │   └── 4.png           # 滑雪
│   ├── video/              # 3 个过渡视频（MP4，Safari）
│   │   ├── 1.mp4           # 网球 → 游泳
│   │   ├── 2.mp4           # 游泳 → 篮球
│   │   └── 3.mp4           # 篮球 → 滑雪
│   └── webM/               # 3 个过渡视频（WebM，非 Safari）
│       ├── 1.webm
│       ├── 2.webm
│       └── 3.webm
└── src/
    ├── main.ts             # 应用入口
    ├── App.vue             # 主组件：滚动驱动逻辑 + 页面编排
    ├── style.css           # 全局样式
    ├── env.d.ts            # 类型声明
    ├── data.ts             # 各屏数据 + 类型
    └── components/
        ├── TopNav.vue      # 顶部胶囊导航（菜单）
        └── PageSection.vue # 单屏内容（4 套版式）
```

## 🧠 关键实现

### 滚动驱动的视频映射

`App.vue` 采用"滚动位置 → 视频进度"的**一一映射**方案，而非定时播放：

```ts
const activeVideoIndex = ref(-1)   // 当前视频段索引 0..2，夹在相邻两屏之间
const videoProgress   = ref(0)     // 当前段内播放进度 0..1
const videoEls        = ref<Record<number, HTMLVideoElement | null>>({})
const SEEK_THRESHOLD  = 0.12       // 每帧 seek 阈值（秒）
```

`updateScroll()` 流程（用 `requestAnimationFrame` 节流）：

1. `clamped = scrollY / innerHeight`，限定在 `[0, 屏数-1]`；
2. `segIndex = floor(clamped)`，`offsetInSegment = clamped - segIndex`；
3. `videoProgress = offsetInSegment`（滚一屏 → 进度 0→1，正好播完该过渡视频）；
4. 只有当前帧与目标帧差值 > `SEEK_THRESHOLD` 才真正 `currentTime = offsetInSegment * duration`，避免每帧微小 seek 造成卡顿；
5. 视频段过半时把导航高亮切换到下一屏。

> 下滚时 `clamped` 增大 → 视频正播；上滚时 `clamped` 减小 → 视频倒播。两个方向都丝滑。

### 视频格式自适应

`App.vue` 通过能力检测决定加载格式（避免 Chrome UA 含 `Safari/537.36` 导致的误判）：

```ts
const USE_WEBM =
    document.createElement('video').canPlayType('video/webm; codecs="vp8, vorbis"') !== ''

function videoSrc(index: number): string {
    return USE_WEBM ? `/webM/${index}.webm` : `/video/${index}.mp4`
}
```

所有 `<video>` 均带 `muted playsinline preload="auto"`，保证浏览器自动播放策略不阻挡、无控制条、无声音。

### 菜单瞬移定位

顶部导航点击任意菜单，直接跳到目标屏（`behavior: 'auto'`），**不经过中间屏**：

```ts
function goToSection(idx: number) {
    // 1. 置 isJumping 屏蔽滚动驱动的逐帧 seek，防止扫过中间视频
    // 2. window.scrollTo({ top: target * vh, behavior: 'auto' }) 直接定位
    // 3. 立即同步 currentSection / activeVideoIndex / videoProgress
    // 4. nextTick 后校准目标视频到段首进度，暂停其它视频
    // 5. 下一帧解除 isJumping
}
```

### 视差入场 / 淡出

每个 section 内部元素的入场动画（`opacity / translateY`）通过 `.active` 选择器 + `transition-delay` 错峰触发；切换时自然淡出。背景图用 fixed 层按 `currentSection` 交叉淡入淡出，配合轻微 zoom-in 视差感。

## 📝 自定义内容

所有文案 / 主图 / 颜色 / 布局都在 `src/data.ts` 一个文件里：

```ts
{
  id: 0,
  tag: '网球',
  eyebrow: '01 / TENNIS COURT',
  title: 'SWING IT.',
  titleCN: '挥拍制胜',
  description: '阳光洒在红土场……',
  buttonText: 'START PLAYING',
  image: '/pic/1.png',
  transitionVideo: 1,   // 该屏与下一屏之间的过渡视频序号
  bgGradient: '…',
  accent: '#FF5C39',
  layout: 'left',       // 'left' | 'right' | 'top' | 'overlay'
}
```

> 注：当前滚动架构按"段索引"驱动视频，即 `segIndex = i` 对应 `public/video|webM/(i+1)`；`transitionVideo` 字段保留用于描述该屏与下一屏的过渡视频序号。

要新增一屏：往 `sections` 数组加一项 + 在 `public/pic/` / `public/video/` / `public/webM/` 放对应素材即可。

---

## 🤖 增强版实现提示词（Prompt）

> 以下提示词，可直接用于再次生成或复刻本项目。

```
请帮我打造一个完整可运行的创意型整屏滚动网页项目（创意开发），需要用到以下素材：
- 4 张背景图：pic/1.png、pic/2.png、pic/3.png、pic/4.png
- 3 个过渡视频：1.MP4（图1→图2）、2.MP4（图2→图3）、3.MP4（图3→图4）
  —— 每个视频同时提供 MP4 与 WebM 两种格式（分别放在 video/ 与 webM/ 目录）。

一、整体效果
1. 做成整屏滚动（Fullpage）网页，宽度自适应，每一屏高度为 100vh。
2. 参考"视差滚动 Parallax Scroll + 整屏吸附 Fullpage Scroll"的方向与质感。
3. 整体视觉高级、有趣、有科技感，但保持克制，不过度花哨。

二、核心交互：滚动驱动视频过渡
1. 鼠标滚动时，相邻两屏之间用对应过渡视频做自然、丝滑的过渡。
2. 必须支持上、下双向滚动都能丝滑切换：下滚正播、上滚反播。
3. 视频进度与页面滚动高度一一映射：滚一屏正好播完当前过渡视频，随即显示下一张图。
4. 视频随滚动自动播放、静音、无控制条、循环无缝衔接。
5. 建议用 currentTime seek + 阈值过滤（避免每帧高频 seek 造成卡顿），或 rAF 节流。

三、单屏布局
1. 每一屏的布局不要完全相同，要有变化（至少 4 种版式：左图右文 / 左文右图 / 居中上下 / 全屏覆盖）。
2. 每屏都要有：超大标题 + 视频/图片主视觉 + 按钮。
3. 滚动到对应屏时，当前屏的文案与主视觉做入场动画；离开时自然淡出。
4. 文案与按钮浮于背景图 / 视频之上，不要用遮挡图片的大卡片。

四、顶部导航
1. 页面顶部只有 4 个菜单项，分别对应 4 个内容屏。
2. 点击菜单可直接定位（瞬移跳转）到对应屏，不必按 1→2→3→4 逐屏经过中间过渡。

五、技术栈
1. 使用 Vue 3 + TypeScript + Vite，响应式布局，适配桌面 / 平板 / 手机。
2. 代码放在当前工作空间下，保证 npm install && npm run dev 即可运行。
3. 结构清晰、注释规范，关键逻辑（滚动映射、格式自适应、菜单跳转）单独说明。
```
