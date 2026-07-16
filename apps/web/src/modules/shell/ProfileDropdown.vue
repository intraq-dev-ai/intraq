<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { resolvedTheme, subscribeTheme, toggleResolvedTheme } from '../theme/theme';
import { adminPanelRouteForRole, clearBaseAuthSessionCaches, isAdminRole } from './role-context';
import { logoutSession } from './session';
import { customerMainLinksForRole } from './shell-navigation';

const props = defineProps<{
  userName: string;
  userEmail?: string;
  userRole: string;
  roleKey: string;
  variant?: 'light' | 'dark';
}>();

const router = useRouter();
const showMenu = ref(false);
const isDarkTheme = ref(resolvedTheme() === 'dark');
const rootElement = ref<HTMLElement | null>(null);
const menuButton = ref<HTMLButtonElement | null>(null);
let unsubscribeTheme: (() => void) | null = null;

const isAdminUser = computed(() => isAdminRole(props.roleKey));
const adminPanelRoute = computed(() => adminPanelRouteForRole(props.roleKey));
const mainLinks = computed(() => customerMainLinksForRole(props.roleKey));
const accountLinks = computed(() => [{ label: 'Home', path: '/home' }]);

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown);
  document.addEventListener('keydown', handleDocumentKeydown);
  unsubscribeTheme = subscribeTheme(theme => {
    isDarkTheme.value = theme === 'dark';
  });
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown);
  document.removeEventListener('keydown', handleDocumentKeydown);
  unsubscribeTheme?.();
});

function closeMenu(): void {
  showMenu.value = false;
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!showMenu.value) return;
  const target = event.target;
  if (target instanceof Node && rootElement.value?.contains(target)) return;
  closeMenu();
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (!showMenu.value || event.key !== 'Escape') return;
  closeMenu();
  menuButton.value?.focus();
}

function toggleTheme(): void {
  isDarkTheme.value = toggleResolvedTheme() === 'dark';
}

async function handleLogout(): Promise<void> {
  closeMenu();
  await logoutSession();
  clearBaseAuthSessionCaches();
  await router.push('/login');
}
</script>

<template>
  <div ref="rootElement" class="shared-profile-dropdown" :class="`shared-profile-dropdown--${variant ?? 'light'}`">
    <button
      ref="menuButton"
      class="profile-button"
      type="button"
      aria-haspopup="menu"
      :aria-expanded="showMenu"
      :aria-label="`${userName} profile menu`"
      @click="showMenu = !showMenu"
    >
      <span class="profile-avatar" aria-hidden="true">
        <svg class="profile-trigger-icon" viewBox="0 0 24 24" focusable="false">
          <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z" />
        </svg>
      </span>
      <span class="profile-identity">
        <span class="profile-name">{{ userName }}</span>
        <span class="profile-role">{{ userRole }}</span>
      </span>
      <span class="profile-caret" aria-hidden="true">⌄</span>
    </button>

    <div v-if="showMenu" class="profile-menu" role="menu" aria-label="Profile menu">
      <div class="profile-menu-header">
        <strong>{{ userName }}</strong>
        <span v-if="userEmail" class="profile-menu-email" :title="userEmail">{{ userEmail }}</span>
        <span>{{ userRole }}</span>
      </div>

      <RouterLink v-for="link in mainLinks" :key="link.path" :to="link.path" class="profile-menu-item" role="menuitem" @click="closeMenu">
        {{ link.label }}
      </RouterLink>

      <div class="profile-menu-divider" role="presentation"></div>

      <RouterLink v-for="link in accountLinks" :key="link.path" :to="link.path" class="profile-menu-item" role="menuitem" @click="closeMenu">
        {{ link.label }}
      </RouterLink>

      <RouterLink v-if="isAdminUser" :to="adminPanelRoute" class="profile-menu-item" role="menuitem" @click="closeMenu">
        Admin Panel
      </RouterLink>

      <div class="profile-menu-divider" role="presentation"></div>

      <button class="profile-menu-item" type="button" role="menuitem" @click="toggleTheme">
        {{ isDarkTheme ? 'Switch to Light Mode' : 'Switch to Dark Mode' }}
      </button>

      <button class="profile-menu-item logout-item" type="button" role="menuitem" @click="handleLogout">
        Logout
      </button>
    </div>
  </div>
</template>
