<template>
  <transition name="ctx-fade">
    <div
      v-if="visible"
      class="context-menu"
      :style="{ left: x + 'px', top: y + 'px' }"
      @click.stop
    >
      <div class="ctx-header">
        <span class="ctx-title mono">{{ node ? node.type.toUpperCase() : '' }}</span>
        <span class="ctx-name">{{ node ? node.text : '' }}</span>
      </div>
      <div class="ctx-divider"></div>
      <button class="ctx-item" @click="action('copy')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        <span>复制</span>
        <span class="ctx-key mono">Ctrl+C</span>
      </button>
      <button class="ctx-item" @click="action('paste')" :disabled="!hasClipboard">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>
        <span>粘贴</span>
        <span class="ctx-key mono">Ctrl+V</span>
      </button>
      <button class="ctx-item" @click="action('duplicate')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2"/></svg>
        <span>克隆</span>
      </button>
      <button class="ctx-item" @click="action('bring-front')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/></svg>
        <span>置于顶层</span>
      </button>
      <button class="ctx-item" @click="action('send-back')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="7 13 12 18 17 13"/><polyline points="7 6 12 11 17 6"/></svg>
        <span>置于底层</span>
      </button>
      <div class="ctx-divider"></div>
      <button class="ctx-item danger" @click="action('delete')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
        <span>删除</span>
        <span class="ctx-key mono">Del</span>
      </button>
    </div>
  </transition>
</template>

<script setup>
defineProps({
  visible: Boolean,
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  node: { type: Object, default: null },
  hasClipboard: { type: Boolean, default: false }
})
const emit = defineEmits(['action', 'close'])

function action(type) {
  emit('action', type)
  emit('close')
}
</script>

<style scoped>
.context-menu {
  position: fixed;
  z-index: 1000;
  min-width: 200px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-panel), 0 0 1px rgba(0, 217, 255, 0.3);
  padding: 6px;
  backdrop-filter: blur(8px);
  animation: ctx-pop 0.12s ease-out;
}

@keyframes ctx-pop {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-4px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.ctx-fade-enter-active,
.ctx-fade-leave-active {
  transition: opacity 0.12s, transform 0.12s;
}
.ctx-fade-enter-from,
.ctx-fade-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

.ctx-header {
  padding: 6px 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ctx-title {
  font-size: 9px;
  color: var(--accent-cyan);
  letter-spacing: 0.15em;
  font-weight: 600;
}

.ctx-name {
  font-size: 12px;
  color: var(--text-primary);
}

.ctx-divider {
  height: 1px;
  background: var(--border-line);
  margin: 4px 0;
}

.ctx-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  font-family: var(--font-body);
  text-align: left;
  transition: all 0.12s;
}

.ctx-item:hover:not(:disabled) {
  background: var(--bg-surface);
  color: var(--accent-cyan);
}

.ctx-item:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.ctx-item span {
  flex: 1;
}

.ctx-key {
  flex: none !important;
  font-size: 10px;
  color: var(--text-dim);
  padding: 1px 5px;
  background: var(--bg-deep);
  border: 1px solid var(--border-line);
  border-radius: 3px;
}

.ctx-item.danger:hover:not(:disabled) {
  color: var(--accent-danger);
  background: rgba(255, 56, 96, 0.08);
}

.ctx-item.danger .ctx-key {
  border-color: var(--accent-danger);
  color: var(--accent-danger);
}
</style>
