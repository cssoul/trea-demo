<template>
  <router-view v-slot="{ Component }">
    <transition name="mode-switch" mode="out-in">
      <component :is="Component" />
    </transition>
  </router-view>
</template>

<script setup>
</script>

<style scoped>
.mode-switch-enter-active,
.mode-switch-leave-active {
  transition: opacity 0.2s ease;
}
.mode-switch-enter-from,
.mode-switch-leave-to {
  opacity: 0;
}
</style>
