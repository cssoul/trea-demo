<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import TopNav from './components/TopNav.vue'
import PageSection from './components/PageSection.vue'
import { sections, navItems } from './data'

/* ========== Config ========== */
/**
 * 检测当前浏览器是否为真正的 Safari（Chrome UA 里也含 "Safari/537.36"，故需结合 vendor）。
 */
const IS_SAFARI =
    typeof navigator !== 'undefined' &&
    navigator.vendor === 'Apple Computer, Inc.' &&
    !/Chrome/.test(navigator.userAgent) &&
    /Safari/.test(navigator.userAgent)

/**
 * 当前是否使用 WebM（Chrome/Edge/Firefox 支持，Safari 不支持）。
 * 用 canPlayType 能力检测，比猜 UA 更可靠。
 */
const USE_WEBM =
    typeof document !== 'undefined' &&
    document.createElement('video').canPlayType('video/webm; codecs="vp8, vorbis"') !== ''

/** 返回某个序号视频（1-based）的 src，根据浏览器选 webm 或 mp4 */
function videoSrc(index: number): string {
    return USE_WEBM ? `/webM/${index}.webm` : `/video/${index}.mp4`
}

/**
 * 每帧 seek 阈值（秒）。
 * 滚动时只对视频帧做"大步跳跃"，避免每帧微小 seek 造成卡顿。
 * 值越大越流畅但跟手性下降；值越小越跟手但易卡。
 */
const SEEK_THRESHOLD = 0.12

/* ========== State ========== */
/** 当前激活的 section index（导航高亮等） */
const currentSection = ref(0)

/** 当前视频段索引 0~2；segIndex=i 对应视频 (i+1)，夹在 section[i] 和 section[i+1] 之间 */
const activeVideoIndex = ref(-1)
/** 视频在该段内的播放进度 0~1 */
const videoProgress = ref(0)
/** 当前段对应的视频 DOM 节点（用来手动 seek） */
const videoEls = ref<Record<number, HTMLVideoElement | null>>({})

/** 当前总滚动百分比 0~100，由 scroll 事件驱动 */
const scrollProgress = ref(0)

/** 滚动事件节流 rAF id */
let scrollRaf = 0

/**
 * 菜单"瞬移"跳转标志。
 * 为真时屏蔽滚动驱动的逐帧视频 seek，避免点击菜单跨越多个屏幕时
 * 中间视频被快速扫过造成卡顿/闪烁，实现"直接跳到目标屏"。
 */
let isJumping = false

/* ========== Computed ========== */
const progressPercent = computed(() => scrollProgress.value)

/* ========== 获取激活的视频 DOM ========== */
function activeVideoEl(): HTMLVideoElement | null {
    return activeVideoIndex.value >= 0 ? videoEls.value[activeVideoIndex.value] : null
}

/* ========== Scroll driven video ========== */
function updateScroll() {
    scrollRaf = 0
    const vh = window.innerHeight || 1
    const scrollY = window.scrollY || window.pageYOffset || 0
    const totalSegments = Math.max(1, sections.length - 1)

    // 1) 计算当前视频段与段内进度
    const clamped = Math.max(0, Math.min(totalSegments, scrollY / vh))
    const segIndex = Math.min(totalSegments - 1, Math.floor(clamped))
    const offsetInSegment = clamped - segIndex

    activeVideoIndex.value = segIndex
    videoProgress.value = offsetInSegment
    scrollProgress.value = (clamped / totalSegments) * 100

    // 2) 高亮当前 section：段内过半则高亮下一屏
    const highlightIdx =
        offsetInSegment < 0.5
            ? segIndex
            : Math.min(sections.length - 1, segIndex + 1)
    if (highlightIdx !== currentSection.value) {
        currentSection.value = highlightIdx
    }

    // 3) 菜单瞬移跳转期间：不执行逐帧 seek，避免扫过中间视频
    if (isJumping) return

    // 4) 阈值过滤 seek：滚动期间只在差值较大时才真正 seek，避免每帧跳动
    const v = activeVideoEl()
    if (!v || !v.duration || !Number.isFinite(v.duration)) return
    const target = offsetInSegment * v.duration
    if (Math.abs((v.currentTime || 0) - target) > SEEK_THRESHOLD) {
        try {
            v.currentTime = target
        } catch {
            /* 静默 */
        }
    }
}

function onScroll() {
    if (scrollRaf) return
    scrollRaf = requestAnimationFrame(updateScroll)
}

/* ========== Navigation ========== */
/**
 * 跳转到指定屏。
 * 使用 instant（直接定位）而非 smooth，避免滚动经过中间所有屏幕，
 * 从而实现点击菜单"直接跳过去"的效果；跳转期间屏蔽逐帧视频 seek。
 */
function goToSection(idx: number) {
    const target = Math.max(0, Math.min(sections.length - 1, idx))
    const vh = window.innerHeight || 1

    // 进入跳转态：屏蔽滚动驱动的逐帧 seek，防止中间屏视频被扫过
    isJumping = true

    // 直接定位到目标屏，不经过中间过渡
    window.scrollTo({ top: target * vh, behavior: 'auto' })

    // 立即同步 UI 状态，无需等待 scroll 事件
    const totalSegments = Math.max(1, sections.length - 1)
    const clamped = Math.min(totalSegments, target)
    const segIndex = Math.min(totalSegments - 1, Math.floor(clamped))
    activeVideoIndex.value = segIndex
    videoProgress.value = clamped - segIndex
    scrollProgress.value = (clamped / totalSegments) * 100
    currentSection.value = target

    // 校准目标屏对应的视频到当前进度（0），并暂停/重置其它视频
    nextTick(() => {
        for (const key in videoEls.value) {
            const v = videoEls.value[key]
            if (!v) continue
            const k = Number(key)
            if (k === activeVideoIndex.value) {
                const t = videoProgress.value * (v.duration || 5)
                try {
                    v.currentTime = t
                } catch {
                    /* 静默 */
                }
            } else if (!v.paused) {
                v.pause()
            }
        }
        // 一帧后解除跳转态，恢复正常滚动驱动
        requestAnimationFrame(() => {
            isJumping = false
        })
    })
}

function onNavClick(idx: number) {
    goToSection(idx)
}

/* ========== Keyboard ========== */
function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault()
        goToSection(Math.min(sections.length - 1, currentSection.value + 1))
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault()
        goToSection(Math.max(0, currentSection.value - 1))
    } else if (e.key === 'Home') {
        e.preventDefault()
        goToSection(0)
    } else if (e.key === 'End') {
        e.preventDefault()
        goToSection(sections.length - 1)
    } else if (/^[1-4]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1
        if (idx >= 0 && idx < sections.length) {
            e.preventDefault()
            goToSection(idx)
        }
    }
}

/* ========== Helpers ========== */
function registerVideoEl(idx: number, el: Element | null) {
    const v = (el as HTMLVideoElement) || null
    videoEls.value[idx] = v
    if (!v) return
    // metadata 加载完毕后校准一次当前时间
    const seekNow = () => {
        if (v.duration && Number.isFinite(v.duration)) {
            const t = videoProgress.value * v.duration
            try {
                v.currentTime = t
            } catch {
                /* 静默 */
            }
        }
    }
    if (v.readyState >= 1) {
        seekNow()
    } else {
        v.addEventListener('loadedmetadata', seekNow, { once: true })
    }
}

// 当激活视频段变化时：把新视频校准到当前进度
watch(activeVideoIndex, async (idx, prevIdx) => {
    // 暂停上一个视频，避免之前段视频在后台播放
    if (prevIdx != null && prevIdx >= 0 && prevIdx !== idx) {
        const old = videoEls.value[prevIdx]
        if (old && !old.paused) old.pause()
    }
    if (idx < 0) return
    await nextTick()
    const v = videoEls.value[idx]
    if (!v) return
    const t = videoProgress.value * (v.duration || 5)
    try {
        v.currentTime = t
    } catch {
        /* 静默 */
    }
})

/* ========== Lifecycle ========== */
onMounted(() => {
    // 预热图片
    sections.forEach((s) => {
        const img = new Image()
        img.src = s.image
    })
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onScroll)

    // 初始化一次
    void nextTick(() => updateScroll())
})

onBeforeUnmount(() => {
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('resize', onScroll)
    if (scrollRaf) cancelAnimationFrame(scrollRaf)
})
</script>

<template>
    <div class="app">
        <!-- 顶部导航 -->
        <TopNav
            :items="navItems"
            :current-index="currentSection"
            @nav="onNavClick"
        />

        <!-- 背景图层：4 张图，fixed 全屏，根据 currentSection 透明度切换 -->
        <div class="bg-stack" aria-hidden="true">
            <div
                v-for="(s, i) in sections"
                :key="`bg-${s.id}`"
                class="bg-layer"
                :class="{ active: i === currentSection }"
                :style="{ backgroundImage: `url(${s.image})` }"
            ></div>
        </div>

        <!-- 视频过渡层：3 个 video 叠加在同一 fixed 容器内，根据 activeVideoIndex 切换可见 -->
        <div class="video-stack" aria-hidden="true">
            <video
                v-for="i in 3"
                :key="`v-${i}`"
                :ref="(el) => registerVideoEl(i - 1, el as Element | null)"
                :src="videoSrc(i)"
                class="video-layer"
                :class="{ active: activeVideoIndex === i - 1 }"
                muted
                playsinline
                preload="auto"
            ></video>
        </div>

        <!-- 主体：4 个 section 堆叠在正常文档流中 -->
        <main class="stage" aria-label="土豆运动乐园">
            <PageSection
                v-for="(section, i) in sections"
                :key="section.id"
                :section="section"
                :is-active="i === currentSection"
            />
        </main>

        <!-- 滚动提示 -->
        <div
            class="scroll-hint"
            :class="{ visible: currentSection === 0 }"
        >
            <div class="hint-text">SCROLL · 探索四态</div>
            <div class="hint-line">
                <span class="hint-dot"></span>
            </div>
        </div>

        <!-- 右侧进度 + 序号 -->
        <aside class="rail">
            <div class="rail-progress">
                <div
                    class="rail-progress-fill"
                    :style="{ height: progressPercent + '%' }"
                ></div>
            </div>
            <div class="rail-counter">
                <span class="rail-current">0{{ currentSection + 1 }}</span>
                <span class="rail-divider"></span>
                <span class="rail-total">0{{ sections.length }}</span>
            </div>
            <div class="rail-text">
                <span class="rail-text-zh">{{ sections[currentSection].tag }}</span>
                <span class="rail-text-en">{{ sections[currentSection].eyebrow }}</span>
            </div>
        </aside>

        <!-- 底部小标记 -->
        <footer class="footer-meta">
            <span>© 2026 POTATO ALL-STAR</span>
            <span class="footer-sep">·</span>
            <span>v 0.1.0</span>
        </footer>
    </div>
</template>

<style scoped>
.app {
    position: relative;
    width: 100%;
    min-height: 100vh;
    background: #000;
}

/* ===== 背景图层 ===== */
.bg-stack {
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    overflow: hidden;
}

.bg-layer {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    opacity: 0;
    transform: scale(1.08);
    transition: opacity 700ms var(--ease-out-quart),
        transform 700ms var(--ease-out-quart);
    will-change: opacity, transform;
}

.bg-layer.active {
    opacity: 1;
    transform: scale(1);
}

/* ===== 视频层 ===== */
.video-stack {
    position: fixed;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    overflow: hidden;
    background: transparent;
}

.video-layer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0;
    transform: scale(1.04);
    transition: opacity 80ms linear;
    will-change: opacity, transform;
}

.video-layer.active {
    opacity: 1;
}

/* ===== stage：让 4 个 section 自然占满滚动高度 ===== */
.stage {
    position: relative;
    z-index: 2;
    width: 100%;
}

/* ===== Scroll hint ===== */
.scroll-hint {
    position: fixed;
    left: 50%;
    bottom: 28px;
    transform: translate(-50%, 20px);
    z-index: 40;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    opacity: 0;
    pointer-events: none;
    transition: opacity 600ms var(--ease-out-quart),
        transform 600ms var(--ease-out-quart);
    color: #fff;
    mix-blend-mode: difference;
}

.scroll-hint.visible {
    opacity: 0.95;
    transform: translate(-50%, 0);
}

.hint-text {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.32em;
}

.hint-line {
    position: relative;
    width: 1px;
    height: 56px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.4);
}

.hint-dot {
    position: absolute;
    top: 0;
    left: 0;
    width: 1px;
    height: 14px;
    background: #fff;
    animation: scrollHint 1800ms var(--ease-out-quart) infinite;
}

@keyframes scrollHint {
    0% {
        top: -14px;
        opacity: 0;
    }
    30% {
        opacity: 1;
    }
    100% {
        top: 56px;
        opacity: 0;
    }
}

/* ===== Rail (右侧序号 + 进度) ===== */
.rail {
    position: fixed;
    right: clamp(16px, 3vw, 38px);
    top: 50%;
    transform: translateY(-50%);
    z-index: 45;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 14px;
    color: #fff;
    mix-blend-mode: difference;
    pointer-events: none;
}

.rail-progress {
    position: relative;
    width: 2px;
    height: clamp(140px, 30vh, 280px);
    background: rgba(255, 255, 255, 0.18);
    border-radius: 999px;
    overflow: hidden;
}

.rail-progress-fill {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    background: #fff;
    border-radius: 999px;
    transition: height 120ms linear;
}

.rail-counter {
    display: flex;
    align-items: center;
    gap: 6px;
    font-feature-settings: 'tnum';
}

.rail-current {
    font-size: 26px;
    font-weight: 700;
    letter-spacing: 0.02em;
}

.rail-divider {
    width: 20px;
    height: 1px;
    background: currentColor;
    opacity: 0.6;
    margin: 0 4px;
}

.rail-total {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.18em;
    opacity: 0.55;
}

.rail-text {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    margin-top: 4px;
}

.rail-text-zh {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.16em;
}

.rail-text-en {
    font-size: 9px;
    letter-spacing: 0.22em;
    opacity: 0.55;
    text-transform: uppercase;
}

@media (max-width: 720px) {
    .rail {
        right: 10px;
        gap: 10px;
    }
    .rail-progress {
        height: 100px;
    }
    .rail-current {
        font-size: 20px;
    }
    .rail-text {
        display: none;
    }
}

/* ===== Footer ===== */
.footer-meta {
    position: fixed;
    left: var(--pad-x);
    bottom: 22px;
    z-index: 40;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.22em;
    color: #fff;
    mix-blend-mode: difference;
    display: flex;
    align-items: center;
    gap: 8px;
    opacity: 0.7;
}

.footer-sep {
    opacity: 0.5;
}

@media (max-width: 560px) {
    .footer-meta {
        display: none;
    }
}
</style>
