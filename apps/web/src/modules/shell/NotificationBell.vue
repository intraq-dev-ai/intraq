<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import {
  fetchShellNotifications,
  readNotificationIds,
  unreadNotificationCount,
  writeNotificationIds,
  type ShellNotification
} from './notifications';
import './shell-notifications.css';

const props = withDefaults(defineProps<{
  placement?: 'bottom' | 'top';
  variant?: 'dark' | 'light';
}>(), {
  placement: 'bottom',
  variant: 'light'
});

const rootElement = ref<HTMLElement | null>(null);
const popoverEl = ref<HTMLElement | null>(null);
const isOpen = ref(false);
const isLoading = ref(false);
const error = ref('');
const notifications = ref<ShellNotification[]>([]);
const readIds = ref<Set<string>>(new Set());

const unreadCount = computed(() => unreadNotificationCount(notifications.value, readIds.value));
const unreadLabel = computed(() => unreadCount.value > 9 ? '9+' : String(unreadCount.value));
const buttonLabel = computed(() =>
  unreadCount.value > 0 ? `Notifications, ${unreadCount.value} unread` : 'Notifications'
);
const visibleNotifications = computed(() => notifications.value.slice(0, 8));
const statusText = computed(() => {
  if (isLoading.value) return 'Loading notifications';
  if (error.value) return error.value;
  if (notifications.value.length === 0) return 'No notifications yet';
  return unreadCount.value > 0 ? `${unreadCount.value} unread notification${unreadCount.value === 1 ? '' : 's'}` : 'All notifications read';
});

onMounted(() => {
  if (typeof window !== 'undefined') {
    readIds.value = readNotificationIds(window.localStorage);
    document.addEventListener('click', handleDocumentClick);
  }
  void loadNotifications();
});

onBeforeUnmount(() => {
  if (typeof document !== 'undefined') document.removeEventListener('click', handleDocumentClick);
});

async function loadNotifications(): Promise<void> {
  isLoading.value = true;
  error.value = '';
  try {
    notifications.value = await fetchShellNotifications();
  } catch (caught) {
    error.value = caught instanceof Error && caught.message ? caught.message : 'Notifications could not be loaded.';
    notifications.value = [];
  } finally {
    isLoading.value = false;
  }
}

function toggleOpen(): void {
  isOpen.value = !isOpen.value;
  if (isOpen.value && notifications.value.length === 0 && !isLoading.value) void loadNotifications();
}

function markAllRead(): void {
  const next = new Set(readIds.value);
  notifications.value.forEach(notification => next.add(notification.id));
  readIds.value = next;
  if (typeof window !== 'undefined') writeNotificationIds(window.localStorage, next);
}

function handleDocumentClick(event: MouseEvent): void {
  const target = event.target;
  if (!isOpen.value || !(target instanceof Node)) return;
  if (rootElement.value?.contains(target)) return;
  isOpen.value = false;
}

function notificationMeta(notification: ShellNotification): string {
  return [
    notification.status,
    notification.channel,
    formatDate(notification.sentAt || notification.createdAt)
  ].filter(Boolean).join(' / ');
}

function formatDate(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}
</script>

<template>
  <div
    ref="rootElement"
    class="shell-notifications"
    :class="[`shell-notifications--${variant}`, `shell-notifications--${placement}`]"
  >
    <button
      class="shell-notification-button"
      type="button"
      :aria-expanded="isOpen"
      :aria-label="buttonLabel"
      @click.stop="toggleOpen"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
        <path d="M12 22a2.6 2.6 0 0 0 2.45-1.75h-4.9A2.6 2.6 0 0 0 12 22Zm7-5-1.7-2.05V10a5.3 5.3 0 0 0-4.15-5.2V3a1.15 1.15 0 0 0-2.3 0v1.8A5.3 5.3 0 0 0 6.7 10v4.95L5 17v1.1h14V17Z" fill="currentColor" />
      </svg>
      <span v-if="unreadCount > 0" class="shell-notification-badge">{{ unreadLabel }}</span>
    </button>

    <section v-if="isOpen" ref="popoverEl" class="shell-notification-popover" role="dialog" aria-modal="true" aria-label="Notifications" tabindex="-1" @keydown.esc="isOpen = false" @vue:mounted="vnode => (vnode.el as HTMLElement)?.focus()">
      <header>
        <div>
          <h2>Notifications</h2>
          <p role="status" aria-live="polite">{{ statusText }}</p>
        </div>
        <button type="button" class="shell-notification-text-btn" @click="loadNotifications">Refresh</button>
      </header>

      <div v-if="visibleNotifications.length > 0" class="shell-notification-list" role="list">
        <article
          v-for="notification in visibleNotifications"
          :key="notification.id"
          class="shell-notification-item"
          :class="{ 'is-unread': !readIds.has(notification.id) }"
          role="listitem"
        >
          <strong>{{ notification.title }}</strong>
          <p v-if="notification.body">{{ notification.body }}</p>
          <small>{{ notificationMeta(notification) }}</small>
        </article>
      </div>
      <p v-else class="shell-notification-empty">{{ isLoading ? 'Loading...' : 'No notifications to show.' }}</p>

      <footer>
        <RouterLink to="/admin/notifications" class="shell-notification-link" @click="isOpen = false">Manage notifications</RouterLink>
        <button type="button" class="shell-notification-text-btn" :disabled="notifications.length === 0" @click="markAllRead">Mark all read</button>
        <button type="button" class="shell-notification-text-btn" aria-label="Close notifications" @click="isOpen = false">Close</button>
      </footer>
    </section>
  </div>
</template>
