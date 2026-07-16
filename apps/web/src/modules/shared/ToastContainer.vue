<script setup lang="ts">
import { useToast, type AppToast } from './use-toast';

const { removeToast, toasts } = useToast();

function iconPath(toast: AppToast): string {
  if (toast.type === 'success') return 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z';
  if (toast.type === 'error') return 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
  if (toast.type === 'warning') return 'M12 9v2m0 4h.01m-6.9 4h13.8c1.5 0 2.5-1.7 1.7-2.5L13.7 4c-.8-.8-2-.8-2.7 0L3.7 16.5c-.7.8.2 2.5 1.7 2.5z';
  return 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
}
</script>

<template>
  <div class="app-toast-container" aria-label="Notifications">
    <TransitionGroup name="app-toast" tag="div">
      <article
        v-for="toast in toasts"
        :key="toast.id"
        class="app-toast"
        :class="`app-toast--${toast.type}`"
        :role="toast.type === 'error' || toast.type === 'warning' ? 'alert' : 'status'"
      >
        <div class="app-toast-content">
          <svg aria-hidden="true" class="app-toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" :d="iconPath(toast)" />
          </svg>
          <p>{{ toast.message }}</p>
          <button type="button" aria-label="Dismiss notification" @click="removeToast(toast.id)">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div
          v-if="toast.duration > 0"
          class="app-toast-progress"
          :style="{ animationDuration: `${toast.duration}ms` }"
        ></div>
      </article>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.app-toast-container {
  position: fixed;
  bottom: 24px;
  left: 50%;
  z-index: 1000;
  width: min(420px, calc(100vw - 32px));
  transform: translateX(-50%);
  pointer-events: none;
}

.app-toast-container > div {
  display: grid;
  gap: 8px;
  justify-items: stretch;
}

.app-toast {
  position: relative;
  overflow: hidden;
  width: 100%;
  min-width: 300px;
  border: 1px solid var(--border-primary);
  border-left: 4px solid var(--color-primary);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: var(--shadow-md);
  color: var(--text-primary);
  pointer-events: auto;
}

.app-toast-content {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px;
}

.app-toast-icon {
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  margin-top: 1px;
  color: var(--color-primary);
}

.app-toast p {
  flex: 1;
  margin: 0;
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.5;
}

.app-toast button {
  display: inline-flex;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
}

.app-toast button:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.app-toast button svg {
  width: 16px;
  height: 16px;
}

.app-toast-progress {
  height: 3px;
  background: currentColor;
  opacity: 0.32;
  animation: app-toast-progress linear forwards;
}

.app-toast--success {
  border-left-color: var(--ai-success-500);
}

.app-toast--success .app-toast-icon,
.app-toast--success .app-toast-progress {
  color: var(--ai-success-500);
}

.app-toast--error {
  border-left-color: #ef4444;
}

.app-toast--error .app-toast-icon,
.app-toast--error .app-toast-progress {
  color: #ef4444;
}

.app-toast--warning {
  border-left-color: var(--ai-primary-500);
}

.app-toast--warning .app-toast-icon,
.app-toast--warning .app-toast-progress {
  color: var(--ai-primary-500);
}

.app-toast-enter-active,
.app-toast-leave-active,
.app-toast-move {
  transition: opacity 180ms ease, transform 180ms ease;
}

.app-toast-enter-from,
.app-toast-leave-to {
  opacity: 0;
  transform: translateY(16px);
}

@keyframes app-toast-progress {
  from {
    width: 100%;
  }
  to {
    width: 0%;
  }
}

@media (max-width: 640px) {
  .app-toast-container {
    bottom: 16px;
    width: calc(100vw - 32px);
  }

  .app-toast {
    min-width: 0;
  }
}
</style>
