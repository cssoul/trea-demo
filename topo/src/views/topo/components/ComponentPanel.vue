<template>
  <div class="component-panel">
    <div class="panel-header">
      <span class="panel-title">组件库</span>
      <span class="panel-subtitle mono">{{ totalItems }} ITEMS</span>
    </div>
    <div class="panel-body">
      <div v-for="group in groups" :key="group.title" class="comp-group">
        <div class="group-title">
          <span class="group-dot"></span>
          {{ group.title }}
        </div>
        <div class="group-grid">
          <div
            v-for="key in group.items"
            :key="key"
            class="comp-item"
            draggable="true"
            @dragstart="onDragStart($event, key)"
            @dblclick="$emit('add', key)"
          >
            <div class="comp-icon">
              <img v-if="config[key].icon" :src="config[key].icon" :alt="config[key].label" />
              <span v-else class="comp-placeholder" :style="placeholderStyle(key)"></span>
            </div>
            <div class="comp-label">{{ config[key].label }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { COMPONENT_GROUPS, NODE_TYPES } from '../config/nodeConfig'

const props = defineProps({})
const emit = defineEmits(['add'])

const groups = COMPONENT_GROUPS
const config = NODE_TYPES

const totalItems = computed(() => COMPONENT_GROUPS.reduce((s, g) => s + g.items.length, 0))

function onDragStart(event, key) {
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData('topo/node-type', key)
}

function placeholderStyle(key) {
  const c = config[key]
  if (key === 'line') return { width: '28px', height: '1.5px', background: c.strokeColor, borderRadius: '1px' }
  if (key === 'text') return { width: '28px', height: '14px', background: 'transparent', border: '1px dashed var(--border-strong)', borderRadius: '2px' }
  return { width: '24px', height: '24px', background: c.strokeColor || 'var(--border-strong)', borderRadius: '2px' }
}
</script>

<style scoped>
.component-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-panel);
  border-right: 1px solid var(--border-line);
}

.panel-header {
  padding: 14px 16px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-line);
}

.panel-subtitle {
  font-size: 10px;
  color: var(--text-dim);
  letter-spacing: 0.1em;
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.comp-group {
  margin-bottom: 4px;
}

.group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px 6px;
  font-family: var(--font-display);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--text-tertiary);
}

.group-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--accent-cyan);
  box-shadow: 0 0 6px var(--accent-cyan-glow);
}

.group-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 0 12px 8px;
}

.comp-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 4px;
  background: var(--bg-surface);
  border: 1px solid var(--border-line);
  border-radius: var(--radius-md);
  cursor: grab;
  transition: all 0.2s ease;
  user-select: none;
}

.comp-item:hover {
  background: var(--bg-elevated);
  border-color: var(--accent-cyan-dim);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(1, 239, 182, 0.15);
}

.comp-item:active {
  cursor: grabbing;
  transform: translateY(0);
}

.comp-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.comp-icon img {
  max-width: 100%;
  max-height: 100%;
  filter: drop-shadow(0 0 4px rgba(1, 239, 182, 0.2));
}

.comp-placeholder {
  display: block;
}

.comp-label {
  font-size: 11px;
  color: var(--text-secondary);
  font-family: var(--font-display);
  letter-spacing: 0.02em;
  text-align: center;
}

.comp-item:hover .comp-label {
  color: var(--accent-cyan);
}
</style>
