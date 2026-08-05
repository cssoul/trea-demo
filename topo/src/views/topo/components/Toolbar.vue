<template>
  <div class="toolbar">
    <div class="toolbar-section brand">
      <div class="brand-mark">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" stroke="var(--accent-cyan)" stroke-width="1.5" fill="rgba(0,217,255,0.08)"/>
          <path d="M12 2v20M3 7l9 5 9-5M3 17l9-5 9 5" stroke="var(--accent-cyan)" stroke-width="1" opacity="0.5"/>
        </svg>
      </div>
      <div class="brand-text">
        <div class="brand-name">TOPO</div>
        <div class="brand-sub mono">ENERGY GRID</div>
      </div>
    </div>

    <div class="toolbar-divider"></div>

    <div class="toolbar-section tools">
      <a-tooltip title="撤销 (Ctrl+Z)">
        <button class="tbtn" :disabled="!canUndo" @click="$emit('undo')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v6h6"/><path d="M3 13a9 9 0 1 0 3-7.7L3 8"/></svg>
        </button>
      </a-tooltip>
      <a-tooltip title="重做 (Ctrl+Y)">
        <button class="tbtn" :disabled="!canRedo" @click="$emit('redo')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 7v6h-6"/><path d="M21 13a9 9 0 1 1-3-7.7L21 8"/></svg>
        </button>
      </a-tooltip>
      <a-tooltip title="连线模式">
        <button class="tbtn" :class="{ active: linkMode }" @click="$emit('toggle-link')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        </button>
      </a-tooltip>
      <a-tooltip title="删除选中 (Delete)">
        <button class="tbtn danger" :disabled="!hasSelection" @click="$emit('delete')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
        </button>
      </a-tooltip>
    </div>

    <div class="toolbar-divider"></div>

    <div class="toolbar-section tools">
      <a-tooltip title="放大">
        <button class="tbtn" @click="$emit('zoom-in')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
        </button>
      </a-tooltip>
      <a-tooltip title="缩小">
        <button class="tbtn" @click="$emit('zoom-out')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
        </button>
      </a-tooltip>
      <a-tooltip title="自适应居中">
        <button class="tbtn" @click="$emit('fit')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7V3h4M21 7V3h-4M3 17v4h4M21 17v4h-4"/><rect x="8" y="8" width="8" height="8" rx="1"/></svg>
        </button>
      </a-tooltip>
      <span class="zoom-display mono">{{ zoomPct }}%</span>
    </div>

    <div class="toolbar-spacer"></div>

    <div class="toolbar-section actions">
      <a-button @click="$emit('preview')">预览</a-button>
      <a-button type="primary" @click="$emit('save')">
        <template #icon><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg></template>
        保存
      </a-button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  canUndo: Boolean,
  canRedo: Boolean,
  linkMode: Boolean,
  hasSelection: Boolean,
  zoom: { type: Number, default: 1 }
})
defineEmits(['undo', 'redo', 'toggle-link', 'delete', 'zoom-in', 'zoom-out', 'fit', 'save', 'preview'])

const zoomPct = computed(() => Math.round((props.zoom || 1) * 100))
</script>

<style scoped>
.toolbar {
  height: 52px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 14px;
  background: linear-gradient(180deg, var(--bg-surface) 0%, var(--bg-panel) 100%);
  border-bottom: 1px solid var(--border-line);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  position: relative;
  z-index: 10;
}

.toolbar::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--accent-cyan-dim), transparent);
}

.toolbar-section {
  display: flex;
  align-items: center;
  gap: 4px;
}

.toolbar-section.brand {
  gap: 10px;
  margin-right: 6px;
}

.brand-mark {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 217, 255, 0.08);
  border: 1px solid var(--accent-cyan-dim);
  border-radius: var(--radius-md);
  filter: drop-shadow(0 0 6px rgba(0, 217, 255, 0.3));
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1;
}

.brand-name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 15px;
  letter-spacing: 0.18em;
  color: var(--accent-cyan);
  text-shadow: 0 0 8px var(--accent-cyan-glow);
}

.brand-sub {
  font-size: 8px;
  color: var(--text-dim);
  letter-spacing: 0.2em;
  margin-top: 2px;
}

.toolbar-divider {
  width: 1px;
  height: 24px;
  background: var(--border-line);
  margin: 0 6px;
}

.tbtn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.tbtn:hover:not(:disabled) {
  background: var(--bg-elevated);
  border-color: var(--border-strong);
  color: var(--accent-cyan);
}

.tbtn.active {
  background: rgba(0, 217, 255, 0.15);
  border-color: var(--accent-cyan);
  color: var(--accent-cyan);
  box-shadow: 0 0 8px rgba(0, 217, 255, 0.3);
}

.tbtn.danger:hover:not(:disabled) {
  color: var(--accent-danger);
  border-color: var(--accent-danger);
  box-shadow: 0 0 8px rgba(255, 56, 96, 0.3);
}

.tbtn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.zoom-display {
  font-size: 11px;
  color: var(--text-tertiary);
  padding: 0 8px;
  min-width: 48px;
  text-align: center;
}

.toolbar-spacer {
  flex: 1;
}

.toolbar-section.actions {
  gap: 8px;
}
</style>
