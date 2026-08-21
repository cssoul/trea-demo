<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, shallowRef } from 'vue'
import { SceneManager } from '../three/SceneManager'

const containerRef = ref<HTMLDivElement | null>(null)
const sceneManager = shallowRef<SceneManager | null>(null)

onMounted(() => {
  if (containerRef.value) {
    sceneManager.value = new SceneManager(containerRef.value)
  }
})

onBeforeUnmount(() => {
  if (sceneManager.value) {
    sceneManager.value.dispose()
    sceneManager.value = null
  }
})
</script>

<template>
  <div class="scene-container" ref="containerRef"></div>
</template>

<style scoped>
.scene-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: linear-gradient(180deg, #87ceeb 0%, #b0e0e6 50%, #48c9c9 100%);
}
</style>
