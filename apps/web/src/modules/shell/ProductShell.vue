<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { createDashboard } from '../dashboard-builder/api';
import { adminSections, customerMainLinksForRole, customerSections, fullBleedPrefixes, sharedSidebarPrefixes, visibleSections } from './shell-navigation';
import ProfileDropdown from './ProfileDropdown.vue';
import ShellNavIcon from './ShellNavIcon.vue';
import { clearBaseAuthSessionCaches, readEffectiveRole, roleLabel } from './role-context';
import { logoutSession } from './session';
import type { ShellNavLink } from './shell-navigation';
import { useTenantBranding } from './useTenantBranding';
import './product-shell.css';
import './product-shell-admin.css';
import './product-shell-navbar.css';
import './product-shell-mobile.css';
import './shell-profile.css';

const route = useRoute();
const router = useRouter();
const isAdminRoute = computed(() => route.path.startsWith('/admin'));
const isMobile = ref(false);
const showMobileMenu = ref(false);
const analyzerSubtitle = ref('Querying data source');
const currentUserName = ref('intraQ User');
const currentUserEmail = ref('Signed in user');
const currentRoleKey = ref(readEffectiveRole());
const currentUserRole = ref(roleLabel(currentRoleKey.value));
const { tenantBranding } = useTenantBranding();
const dashboardNameDialogOpen = ref(false);
const dashboardNameDraft = ref('New Dashboard');
const dashboardNameError = ref('');
const isCreatingDashboard = ref(false);
const dashboardNameDialogEl = ref<HTMLElement | null>(null);

const isAnalyzerRoute = computed(() => route.path.startsWith('/ai-analyzer'));
const isDashboardRoute = computed(() => route.path === '/dashboard' || route.path.startsWith('/dashboard/'));
const isSqlEditorRoute = computed(() => route.path === '/sql-editor' || route.path.startsWith('/sql-editor/'));
const usesSharedSidebar = computed(() => sharedSidebarPrefixes.some(path => route.path === path || route.path.startsWith(`${path}/`)));
const usesFullBleedStandalone = computed(() => fullBleedPrefixes.some(path => route.path === path || route.path.startsWith(`${path}/`)));
const usesAppNavbar = computed(() => !isAdminRoute.value && !usesSharedSidebar.value && !usesFullBleedStandalone.value);
const showsFloatingProfileMenu = computed(() =>
  usesFullBleedStandalone.value && !isDashboardRoute.value && !isSqlEditorRoute.value
);
const mobileTopbarTitle = computed(() => route.path.startsWith('/ai-analyzer') ? 'AI Data Analyzer' : '');
const visibleCustomerSections = computed(() => visibleSections(customerSections, currentRoleKey.value));
const visibleAdminSections = computed(() => visibleSections(adminSections, currentRoleKey.value));
const appNavbarLinks = computed(() => customerMainLinksForRole(currentRoleKey.value).filter(link => link.path !== '/home'));

function isCurrent(path: string): boolean {
  return route.path === path || route.path.startsWith(`${path}/`);
}

function adminNavIcon(item: ShellNavLink): string {
  if (item.path.includes('ai-')) return 'chat';
  if (item.path.includes('sql-query-editor')) return 'terminal';
  if (item.path.includes('dashboard-categories')) return 'folder';
  if (item.path.includes('data-dictionary')) return 'book';
  if (item.path.includes('view-data-sources')) return 'eye';
  if (item.path.includes('data-sources')) return item.path.includes('custom-data-sources') ? 'document' : 'database';
  if (item.path.includes('api-key') || item.path.includes('mcp-access')) return 'key';
  if (item.path.includes('smtp')) return 'envelope';
  return item.label.includes('Dashboard') || item.label === 'Overview' ? 'chart' : 'document';
}

function handleAdminLinkClick(): void {
  closeMobileMenu();
}

function closeMobileMenu(): void {
  if (isMobile.value) showMobileMenu.value = false;
}

function syncMobileState(): void {
  isMobile.value = window.innerWidth <= 768;
  if (!isMobile.value) showMobileMenu.value = false;
}

function syncUserProfile(): void {
  currentUserName.value = storedValue(['userName', 'name', 'displayName']) ?? 'intraQ User';
  currentUserEmail.value = storedValue(['userEmail', 'email', 'username']) ?? 'Signed in user';
  currentRoleKey.value = readEffectiveRole();
  currentUserRole.value = roleLabel(currentRoleKey.value);
}

function storedValue(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = localStorage.getItem(key)?.trim();
    if (value) return value;
  }
  return undefined;
}

function openAnalyzerConfig(): void {
  window.dispatchEvent(new CustomEvent('ai-analyzer-open-config'));
}

function triggerAddDashboardDialog(): void {
  closeMobileMenu();
  dashboardNameDraft.value = 'New Dashboard';
  dashboardNameError.value = '';
  dashboardNameDialogOpen.value = true;
}

function closeDashboardNameDialog(): void {
  if (isCreatingDashboard.value) return;
  dashboardNameDialogOpen.value = false;
}

async function continueDashboardNameDialog(): Promise<void> {
  const name = dashboardNameDraft.value.trim() || 'New Dashboard';
  isCreatingDashboard.value = true;
  dashboardNameError.value = '';
  try {
    const dashboard = await createDashboard(name);
    dashboardNameDialogOpen.value = false;
    await router.push(`/dashboard/${encodeURIComponent(dashboard.id)}/edit`);
  } catch (caught) {
    dashboardNameError.value = caught instanceof Error && caught.message
      ? caught.message
      : 'Dashboard could not be created.';
  } finally {
    isCreatingDashboard.value = false;
  }
}

async function handleLogout(): Promise<void> {
  await logoutSession();
  clearBaseAuthSessionCaches();
  await router.push('/login');
}

function handleAnalyzerSubtitle(event: Event): void {
  const next = String((event as CustomEvent<string>).detail || '').trim();
  analyzerSubtitle.value = next || 'Querying data source';
}

onMounted(() => {
  syncMobileState();
  syncUserProfile();
  window.addEventListener('resize', syncMobileState);
  window.addEventListener('ai-analyzer-subtitle', handleAnalyzerSubtitle);
  window.addEventListener('intraq-session-updated', syncUserProfile);
  window.addEventListener('storage', syncUserProfile);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncMobileState);
  window.removeEventListener('ai-analyzer-subtitle', handleAnalyzerSubtitle);
  window.removeEventListener('intraq-session-updated', syncUserProfile);
  window.removeEventListener('storage', syncUserProfile);
});

watch(() => route.fullPath, () => {
  closeMobileMenu();
});
</script>

<template>
  <div
    class="product-shell"
    :class="{
      'admin-shell admin-layout': isAdminRoute,
      'home-shell': usesSharedSidebar,
      'home-shell--analyzer': usesSharedSidebar && isAnalyzerRoute,
      'standalone-shell': !isAdminRoute && !usesSharedSidebar,
      'standalone-shell--full': usesFullBleedStandalone
    }"
  >
    <template v-if="isAdminRoute">
      <div v-if="isMobile" class="mobile-admin-header">
        <button
          class="mobile-menu-toggle"
          type="button"
          :aria-label="showMobileMenu ? 'Close admin navigation' : 'Open admin navigation'"
          :aria-expanded="showMobileMenu"
          aria-controls="admin-navigation-menu"
          @click="showMobileMenu = !showMobileMenu"
        >
          <ShellNavIcon name="sidebar" />
        </button>
        <div class="mobile-admin-title">Admin Panel</div>
        <RouterLink to="/admin/dashboard" class="mobile-dashboard-btn" aria-label="Go to admin dashboard">⌂</RouterLink>
      </div>
      <div v-if="isMobile && showMobileMenu" class="mobile-sidebar-overlay" @click="showMobileMenu = false"></div>
      <aside id="admin-navigation-menu" class="admin-sidebar" :class="{ 'mobile-sidebar-open': isMobile && showMobileMenu }" aria-label="Admin navigation">
        <div class="admin-header">
          <div class="admin-brand">
            <span class="admin-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="currentColor" focusable="false">
                <path d="M12 2 2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </span>
            <div class="brand-info">
              <div class="admin-title">Admin Panel</div>
            </div>
          </div>
          <section class="user-info-section" aria-label="Admin user">
            <!-- Notification entry point is parked until the admin notifications UX is revisited. -->
            <ProfileDropdown :user-name="currentUserName" :user-email="currentUserEmail" :user-role="currentUserRole" :role-key="currentRoleKey" variant="dark" />
          </section>
        </div>
        <nav class="admin-links" aria-label="Admin sections">
          <section v-for="section in visibleAdminSections" :key="section.title" class="nav-section">
            <p class="nav-section-title">{{ section.title }}</p>
            <RouterLink
              v-for="item in section.links"
              :key="item.path"
              :to="item.path"
              class="nav-link admin-nav-link"
              :aria-current="isCurrent(item.path) ? 'page' : undefined"
              @click="handleAdminLinkClick"
            >
              <ShellNavIcon :name="adminNavIcon(item)" />
              {{ item.label }}
            </RouterLink>
          </section>
        </nav>
        <div class="admin-footer">
          <button class="logout-btn-admin" type="button" @click="handleLogout">Logout</button>
        </div>
      </aside>
      <main class="workspace admin-content" aria-label="intraQ workspace">
        <RouterView />
      </main>
    </template>

    <template v-else-if="usesSharedSidebar">
      <div v-if="isMobile" class="mobile-topbar-wrap">
        <div class="mobile-topbar">
          <button
            class="mobile-menu-btn"
            type="button"
            :aria-label="showMobileMenu ? 'Close workspace navigation' : 'Open workspace navigation'"
            :aria-expanded="showMobileMenu"
            aria-controls="workspace-navigation-menu"
            @click="showMobileMenu = !showMobileMenu"
          >
            <ShellNavIcon name="sidebar" />
          </button>
          <div v-if="mobileTopbarTitle" class="mobile-topbar-title">{{ mobileTopbarTitle }}</div>
          <button v-if="isAnalyzerRoute" class="mobile-config-btn" type="button" @click="openAnalyzerConfig">
            Configure
          </button>
        </div>
        <div v-if="isAnalyzerRoute" class="mobile-topbar-subtitle">
          {{ analyzerSubtitle }}
        </div>
      </div>

      <div v-if="isMobile && showMobileMenu" class="mobile-sidebar-overlay" @click="showMobileMenu = false"></div>

      <aside id="workspace-navigation-menu" class="customer-sidebar home-sidebar" :class="{ 'mobile-open': isMobile && showMobileMenu }" aria-label="Customer navigation">
        <div class="sidebar-header">
          <RouterLink to="/home" class="brand-block" :aria-label="tenantBranding.homeLabel">
            <span class="brand-text">
              <span class="brand-title">{{ tenantBranding.displayName }}</span>
              <span v-if="tenantBranding.subHeader" class="brand-subtitle">{{ tenantBranding.subHeader }}</span>
            </span>
          </RouterLink>
        </div>

        <nav class="customer-links sidebar-menu nav-tabs" aria-label="Workspace">
          <section v-for="section in visibleCustomerSections" :key="section.title" class="nav-section">
            <p class="menu-title nav-section-title">{{ section.title }}</p>
            <RouterLink
              v-for="item in section.links"
              :key="item.path"
              :to="item.path"
              class="menu-item nav-tab"
              :class="{ active: isCurrent(item.path) }"
              :aria-current="isCurrent(item.path) ? 'page' : undefined"
              @click="closeMobileMenu"
            >
              {{ item.label }}
            </RouterLink>
            <template v-if="section.title === 'Dashboards'">
              <button class="menu-item nav-tab" type="button" @click="triggerAddDashboardDialog">New Dashboard</button>
            </template>
          </section>
        </nav>

        <div class="customer-sidebar-footer sidebar-footer">
          <!-- Notification entry point is parked until the admin notifications UX is revisited. -->
          <ProfileDropdown :user-name="currentUserName" :user-email="currentUserEmail" :user-role="currentUserRole" :role-key="currentRoleKey" variant="dark" />
        </div>

        <div v-if="dashboardNameDialogOpen" class="shell-dashboard-dialog-backdrop" role="presentation" @click="closeDashboardNameDialog">
          <form
            ref="dashboardNameDialogEl"
            class="shell-dashboard-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shell-dashboard-dialog-title"
            tabindex="-1"
            @click.stop
            @keydown.esc="closeDashboardNameDialog"
            @submit.prevent="continueDashboardNameDialog"
            @vue:mounted="vnode => (vnode.el as HTMLElement)?.focus()"
          >
            <header>
              <h2 id="shell-dashboard-dialog-title">New dashboard</h2>
            </header>
            <label>
              Dashboard name
              <input v-model="dashboardNameDraft" :disabled="isCreatingDashboard" required>
            </label>
            <p v-if="dashboardNameError" class="shell-dashboard-dialog-error" role="alert">{{ dashboardNameError }}</p>
            <footer>
              <button type="button" class="shell-dialog-secondary" :disabled="isCreatingDashboard" @click="closeDashboardNameDialog">Cancel</button>
              <button type="submit" class="shell-dialog-primary" :disabled="isCreatingDashboard">
                {{ isCreatingDashboard ? 'Creating...' : 'Create dashboard' }}
              </button>
            </footer>
          </form>
        </div>
      </aside>
      <main class="home-main" :class="{ 'home-main--no-scroll': isAnalyzerRoute }" aria-label="intraQ workspace">
        <div class="home-content" :class="{ 'home-content--flush': isAnalyzerRoute }">
          <RouterView />
        </div>
      </main>
    </template>

    <template v-else>
      <div v-if="showsFloatingProfileMenu" class="floating-profile-menu">
        <ProfileDropdown :user-name="currentUserName" :user-email="currentUserEmail" :user-role="currentUserRole" :role-key="currentRoleKey" />
      </div>
      <nav v-if="usesAppNavbar" class="app-navbar" aria-label="Application navigation">
        <RouterLink to="/home" class="nav-brand" :aria-label="tenantBranding.homeLabel">
          <span class="brand-container">
            <span class="app-brand-text">
              <span class="app-brand-title">{{ tenantBranding.displayName }}</span>
              <span v-if="tenantBranding.subHeader" class="app-brand-subtitle">{{ tenantBranding.subHeader }}</span>
            </span>
          </span>
        </RouterLink>
        <div class="app-nav-tabs" aria-label="Primary workspace links">
          <RouterLink v-for="link in appNavbarLinks" :key="link.path" :to="link.path" class="app-nav-tab">
            {{ link.label }}
          </RouterLink>
        </div>
        <div class="app-navbar-actions">
          <!-- Notification entry point is parked until the admin notifications UX is revisited. -->
          <ProfileDropdown :user-name="currentUserName" :user-email="currentUserEmail" :user-role="currentUserRole" :role-key="currentRoleKey" />
        </div>
      </nav>
      <main
        class="standalone-content"
        :class="{
          'standalone-content--full': usesFullBleedStandalone,
          'standalone-content--with-navbar': usesAppNavbar
        }"
        aria-label="intraQ workspace"
      >
        <RouterView />
      </main>
    </template>
  </div>
</template>
