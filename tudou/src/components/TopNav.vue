<script setup lang="ts">
import type { NavItem } from '../data'

defineProps<{
  items: NavItem[]
  currentIndex: number
}>()

const emit = defineEmits<{
  (e: 'nav', index: number): void
}>()

function handleClick(index: number) {
  emit('nav', index)
}
</script>

<template>
  <header class="top-nav" :class="{ 'is-dark': false }">
    <div class="nav-inner">
      <div class="brand">
        <div class="brand-mark">
          <span class="brand-mark-inner">P</span>
        </div>
        <div class="brand-text">
          <div class="brand-title">POTATO ALL-STAR</div>
          <div class="brand-sub">土豆全能乐园 · EST. 2026</div>
        </div>
      </div>

      <nav class="nav-menu" aria-label="主导航">
        <button
          v-for="item in items"
          :key="item.index"
          class="nav-item"
          :class="{ active: item.index === currentIndex }"
          @click="handleClick(item.index)"
        >
          <span class="nav-num">0{{ item.index + 1 }}</span>
          <span class="nav-label">{{ item.label }}</span>
          <span class="nav-en">{{ item.en }}</span>
        </button>
      </nav>

      <button class="nav-more" aria-label="更多">
        <span></span><span></span><span></span>
      </button>
    </div>
  </header>
</template>

<style scoped>
.top-nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 50;
  padding: 18px var(--pad-x);
  pointer-events: none;
  mix-blend-mode: difference;
  color: #fff;
  transition: opacity 320ms var(--ease-out-quart);
}

.top-nav.is-dark {
  mix-blend-mode: normal;
}

.nav-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 32px;
  pointer-events: auto;
}

/* Brand */
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}
.brand-mark {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: grid;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.28);
}
.brand-mark-inner {
  font-weight: 800;
  font-size: 18px;
  letter-spacing: 0.02em;
}
.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.05;
}
.brand-title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.14em;
}
.brand-sub {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.18em;
  opacity: 0.6;
  margin-top: 2px;
}

/* Menu */
.nav-menu {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px;
  border-radius: 999px;
  background: rgba(10, 10, 15, 0.45);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.18);
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 18px;
  border-radius: 999px;
  color: #fff;
  font-size: 13px;
  transition: all 320ms var(--ease-out-quart);
  opacity: 0.65;
}
.nav-item:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.08);
}
.nav-item.active {
  opacity: 1;
  background: rgba(255, 255, 255, 0.95);
  color: #0a0a0f;
}
.nav-num {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1em;
  opacity: 0.6;
}
.nav-item.active .nav-num {
  opacity: 0.6;
  color: #0a0a0f;
}
.nav-label {
  font-weight: 600;
  font-size: 14px;
  letter-spacing: 0.04em;
}
.nav-en {
  font-size: 10px;
  letter-spacing: 0.16em;
  opacity: 0.55;
  font-weight: 500;
  text-transform: uppercase;
}

/* More button */
.nav-more {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.18);
  display: none;
  flex-direction: column;
  gap: 3px;
  align-items: center;
  justify-content: center;
}
.nav-more span {
  width: 14px;
  height: 1.5px;
  background: #fff;
  border-radius: 1px;
  transition: all 220ms var(--ease-out-quart);
}

/* Responsive */
@media (max-width: 960px) {
  .brand-text,
  .nav-more,
  .nav-en {
    display: none;
  }
  .nav-menu {
    gap: 0;
    padding: 4px;
  }
  .nav-item {
    padding: 8px 12px;
    gap: 0;
  }
  .nav-item .nav-num {
    display: none;
  }
}

@media (max-width: 560px) {
  .top-nav {
    padding: 14px 16px;
  }
  .nav-item {
    padding: 8px 10px;
  }
  .nav-label {
    font-size: 12px;
  }
}
</style>
