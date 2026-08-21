<script setup lang="ts">
import { computed } from 'vue'
import type { Section } from '../data'

const props = defineProps<{
    section: Section
    isActive: boolean
}>()

const layout = computed(() => `layout-${props.section.layout}`)
const dark = computed(() => props.section.dark)
</script>

<template>
    <section
        class="page"
        :class="[layout, { active: isActive, dark: dark }]"
        :style="{
            '--accent': section.accent,
        }"
    >
        <div class="page-inner">
            <!-- 文字浮层 -->
            <div class="text-block">
                <div class="meta">
                    <span class="meta-dot"></span>
                    <span class="meta-label">{{ section.eyebrow }}</span>
                </div>

                <h1 class="title">
                    <span class="title-line">{{ section.title }}</span>
                </h1>

                <div class="title-cn-wrap">
                    <span class="title-cn">{{ section.titleCN }}</span>
                    <span class="title-cn-line"></span>
                </div>

                <p class="description">{{ section.description }}</p>

                <div class="actions">
                    <button class="cta">
                        <span class="cta-dot"></span>
                        <span class="cta-label">{{ section.buttonText }}</span>
                        <span class="cta-arrow">→</span>
                    </button>
                    <button class="cta-secondary" aria-label="次级操作">
                        <span class="play-icon">▶</span>
                        <span>WATCH REEL</span>
                    </button>
                </div>
            </div>

            <!-- 仅 layout-overlay 模式下，在文字之上再增加一个底部装饰（比如右下角小图标） -->
            <div v-if="section.layout === 'overlay'" class="overlay-corner">
                <span class="overlay-corner-num">/ 0{{ section.id + 1 }}</span>
                <span class="overlay-corner-label">{{ section.tag }}</span>
            </div>
        </div>
    </section>
</template>

<style scoped>
/* ===== 页面：normal flow 占满一屏 ===== */
.page {
    position: relative;
    width: 100%;
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    /* 内容文字的颜色由 dark 切换 */
    color: #fff;
}

.page-inner {
    position: relative;
    z-index: 2;
    width: 100%;
    height: 100%;
    min-height: 100vh;
    min-height: 100dvh;
    display: grid;
    align-items: center;
    padding: 120px var(--pad-x) 60px;
}

/* 不再用 image-block 卡片 */

/* ======= 共同元素 ======= */
.meta {
    display: flex;
    align-items: center;
    gap: 10px;
}

.meta-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 12px var(--accent);
}

.meta-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.32em;
    text-transform: uppercase;
    opacity: 0.85;
}

.title {
    margin-top: 24px;
    font-size: clamp(56px, 11vw, 180px);
    line-height: 0.92;
    font-weight: 800;
    letter-spacing: -0.04em;
    text-transform: uppercase;
}

.title-line {
    display: inline-block;
    background: linear-gradient(
        180deg,
        #ffffff 0%,
        rgba(255, 255, 255, 0.75) 100%
    );
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
}

.title-cn-wrap {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-top: 14px;
}

.title-cn {
    font-size: clamp(18px, 2.2vw, 28px);
    font-weight: 500;
    letter-spacing: 0.32em;
    color: #fff;
    opacity: 0.9;
}

.title-cn-line {
    flex: 0 0 80px;
    height: 1px;
    background: #fff;
    opacity: 0.5;
}

.description {
    margin-top: 24px;
    font-size: clamp(14px, 1.05vw, 16px);
    line-height: 1.85;
    max-width: 480px;
    color: rgba(255, 255, 255, 0.85);
}

/* ======= CTA ======= */
.actions {
    margin-top: 40px;
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
}

.cta {
    display: inline-flex;
    align-items: center;
    gap: 14px;
    padding: 16px 26px;
    border-radius: 999px;
    background: rgba(10, 10, 15, 0.55);
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.16em;
    position: relative;
    overflow: hidden;
    isolation: isolate;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.18);
    transition: transform 320ms var(--ease-out-quart),
        box-shadow 320ms var(--ease-out-quart),
        background 320ms var(--ease-out-quart);
}

.cta::before {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--accent);
    border-radius: inherit;
    transform: translateY(101%);
    transition: transform 600ms var(--ease-out-quart);
    z-index: -1;
}

.cta:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 32px -10px rgba(0, 0, 0, 0.4);
}

.cta:hover::before {
    transform: translateY(0);
}

.cta-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
    transition: background 320ms var(--ease-out-quart);
}

.cta:hover .cta-dot {
    background: #fff;
}

.cta-label {
    letter-spacing: 0.18em;
}

.cta-arrow {
    font-size: 16px;
    transition: transform 320ms var(--ease-out-quart);
}

.cta:hover .cta-arrow {
    transform: translateX(4px);
}

.cta-secondary {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 14px 22px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.18em;
    background: transparent;
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.45);
    transition: all 320ms var(--ease-out-quart);
}

.cta-secondary:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: #fff;
}

.play-icon {
    font-size: 9px;
}

/* ======= 各布局的文字对齐 ======= */
.layout-left .page-inner {
    justify-items: start;
}

.layout-left .text-block {
    text-align: left;
    align-items: flex-start;
}

.layout-right .page-inner {
    justify-items: end;
}

.layout-right .text-block {
    text-align: left;
    align-items: flex-start;
    max-width: 560px;
    margin-left: auto;
}

.layout-top .page-inner {
    grid-template-rows: 1fr auto;
    align-items: start;
    padding-top: 160px;
}

.layout-top .text-block {
    text-align: center;
    align-items: center;
    max-width: 760px;
    margin: 0 auto;
}

.layout-top .actions {
    justify-content: center;
}

.layout-top .title-cn-wrap {
    justify-content: center;
}

.layout-overlay .page-inner {
    align-items: flex-end;
    padding-bottom: clamp(40px, 8vh, 100px);
}

.layout-overlay .text-block {
    text-align: left;
    align-items: flex-start;
    max-width: 720px;
}

/* overlay 模式下的右下角小标签 */
.overlay-corner {
    position: absolute;
    right: var(--pad-x);
    bottom: clamp(40px, 8vh, 100px);
    z-index: 3;
    display: inline-flex;
    align-items: baseline;
    gap: 8px;
    padding: 10px 16px;
    border-radius: 999px;
    background: rgba(10, 10, 15, 0.6);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    color: #fff;
    font-size: 11px;
    letter-spacing: 0.18em;
    font-weight: 600;
}

.overlay-corner-num {
    opacity: 0.6;
}

/* ====== Entry animations (active 进入时) ====== */
.text-block {
    opacity: 0;
    transform: translateY(40px);
    transition: opacity 700ms var(--ease-out-quart),
        transform 700ms var(--ease-out-quart);
}

.page.active .text-block {
    opacity: 1;
    transform: translateY(0);
}

.overlay-corner {
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 700ms var(--ease-out-quart) 200ms,
        transform 700ms var(--ease-out-quart) 200ms;
}

.page.active .overlay-corner {
    opacity: 1;
    transform: translateY(0);
}

/* ====== Responsive ====== */
@media (max-width: 960px) {
    .page-inner {
        padding-top: 110px;
        padding-bottom: 24px;
    }
    .layout-right .text-block {
        margin-left: 0;
    }
    .layout-top .text-block,
    .layout-left .text-block,
    .layout-right .text-block {
        text-align: center;
        align-items: center;
        margin: 0 auto;
    }
    .layout-top .actions,
    .layout-left .actions,
    .layout-right .actions {
        justify-content: center;
    }
    .layout-top .title-cn-wrap,
    .layout-left .title-cn-wrap,
    .layout-right .title-cn-wrap {
        justify-content: center;
    }
    .description {
        margin-left: auto;
        margin-right: auto;
    }
}

@media (max-width: 560px) {
    .cta-secondary {
        display: none;
    }
    .layout-top .page-inner {
        padding-top: 130px;
    }
}
</style>
