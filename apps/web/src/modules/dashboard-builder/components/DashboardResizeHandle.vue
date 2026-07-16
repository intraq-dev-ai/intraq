<template>
  <div
    :class="['resize-handle', `resize-handle--${position}`]"
    @mousedown="onMouseDown"
    @touchstart="onTouchStart"
    :data-position="position"
    :title="`Drag to resize (${position})`"
  />
</template>

<script setup lang="ts">
import { defineProps, defineEmits } from 'vue';

interface Props {
  position: 'se';
}

const props = defineProps<Props>();
const emit = defineEmits<{
  resize: [event: MouseEvent | TouchEvent];
}>();

function onMouseDown(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
  emit('resize', event);
}

function onTouchStart(event: TouchEvent) {
  event.preventDefault();
  event.stopPropagation();
  emit('resize', event);
}
</script>

<style scoped>
.resize-handle {
  position: absolute;
  background: transparent;
  cursor: nwse-resize;
  z-index: 10;
  opacity: 0.45;
  touch-action: none;
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.resize-handle--se {
  width: 10px;
  height: 10px;
  border: 1px solid var(--ai-primary-500);
  background: white;
  border-radius: 2px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  bottom: -4px;
  right: -4px;
  cursor: nwse-resize;
}
</style>
