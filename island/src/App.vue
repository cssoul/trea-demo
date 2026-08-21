<script setup lang="ts">
import IslandScene from './components/IslandScene.vue'
</script>

<template>
  <IslandScene />
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

body {
  font-family: system-ui, 'Segoe UI', Roboto, sans-serif;
}
</style>
