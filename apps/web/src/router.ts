import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import ProductShell from './modules/shell/ProductShell.vue';
import AnalyzerPage from './modules/analyzer/AnalyzerPage.vue';
import AuthPage from './modules/auth/AuthPage.vue';
import DashboardBuilderPage from './modules/dashboard-builder/DashboardBuilderPage.vue';
import DataDictionaryPage from './modules/data-dictionary/DataDictionaryPage.vue';
import HomePage from './modules/home/HomePage.vue';
import AdminPage from './modules/admin/AdminPage.vue';
import { AdminDataDictionaryPage } from './modules/admin-data-dictionary';
import { AdminDataSourcesPage } from './modules/admin-data-sources';
import McpAccessPage from './modules/admin-mcp-access/McpAccessPage.vue';
import SqlEditorPage from './modules/sql-editor/SqlEditorPage.vue';
import TemplatesPage from './modules/templates/TemplatesPage.vue';
import LearnPage from './modules/learn/LearnPage.vue';
import EmbedDashboardPage from './modules/public-access/EmbedDashboardPage.vue';
import EmbedErrorPage from './modules/public-access/EmbedErrorPage.vue';
import { adminRouteGuard } from './modules/admin/access';
import { FEATURES, adminDefaultPath, installBaseProductRouteGuards, roleRedirectPath } from './router-guards';

const authMeta = { requiresAuth: true };
const dashboardViewMeta = { requiresAuth: true, requiresFeature: FEATURES.DASHBOARD_VIEW };
const dashboardBuilderMeta = { requiresAuth: true, requiresFeature: FEATURES.DASHBOARD_BUILDER };
const sqlEditorMeta = { requiresAuth: true, requiresFeature: FEATURES.DATA_ENGINEERING };
const adminDataSourcesMeta = { requiresAuth: true, requiresFeature: FEATURES.ADMIN_DATA_SOURCES };
const adminMeta = { requiresAuth: true, requiresAdmin: true };

const routes: RouteRecordRaw[] = [
  { path: '/login', name: 'login', component: AuthPage },
  { path: '/forgot-password', name: 'forgot-password', component: AuthPage },
  { path: '/reset-password', name: 'reset-password', component: AuthPage },
  { path: '/setup', name: 'setup', component: AuthPage },
  { path: '/backend-error', name: 'backend-error', component: AuthPage },
  {
    path: '/',
    redirect: () => roleRedirectPath()
  },
  {
    path: '/',
    component: ProductShell,
    children: [
      {
        path: 'home',
        component: HomePage,
        meta: dashboardViewMeta,
        beforeEnter: to => {
          if (typeof to.query.prompt === 'string' && to.query.prompt.trim()) {
            return { path: '/ai-analyzer', query: to.query };
          }
          if (to.query.ai === 'true' || typeof to.query.template === 'string') {
            return { path: '/dashboard/create', query: to.query };
          }
          return true;
        }
      },
      { path: 'ai-analyzer', component: AnalyzerPage, meta: dashboardViewMeta },
      { path: 'ai-analyzer/:conversationId', component: AnalyzerPage, meta: dashboardViewMeta },
      { path: 'dashboard', component: DashboardBuilderPage, meta: dashboardViewMeta },
      { path: 'dashboard/create', component: DashboardBuilderPage, meta: dashboardBuilderMeta },
      { path: 'dashboard/:id', component: DashboardBuilderPage, meta: dashboardViewMeta },
      { path: 'dashboard/:id/edit', component: DashboardBuilderPage, meta: dashboardBuilderMeta },
      { path: 'templates', name: 'templates', component: TemplatesPage, meta: authMeta },
      {
        path: 'data-dictionary',
        name: 'data-dictionary',
        component: DataDictionaryPage,
        meta: authMeta
      },
      { path: 'sql-editor', component: SqlEditorPage, meta: sqlEditorMeta },
      { path: 'learn', name: 'learn', component: LearnPage, meta: authMeta },
      { path: 'admin', redirect: () => adminDefaultPath(), meta: adminMeta },
      { path: 'admin/data-sources', name: 'admin-data-sources', component: AdminDataSourcesPage, props: { routeVariant: 'management' }, meta: { requiresAuth: true, requiresAdmin: true, requiresFeature: FEATURES.ADMIN_DATA_SOURCES }, beforeEnter: adminRouteGuard },
      { path: 'admin/view-data-sources', name: 'admin-view-data-sources', component: AdminDataSourcesPage, props: { routeVariant: 'viewer' }, meta: { requiresAuth: true, requiresAdmin: true, requiresFeature: FEATURES.ADMIN_DATA_SOURCES }, beforeEnter: adminRouteGuard },
      { path: 'admin/tenant-data-sources', redirect: '/admin/data-sources' },
      { path: 'admin/data-dictionary', name: 'admin-data-dictionary', component: AdminDataDictionaryPage, meta: { requiresAuth: true, requiresAdmin: true, requiresFeature: FEATURES.ADMIN_DATA_SOURCES }, beforeEnter: adminRouteGuard },
      { path: 'admin/mcp-access', name: 'admin-mcp-access', component: McpAccessPage, meta: adminMeta, beforeEnter: adminRouteGuard },
      { path: 'admin/sql-query-editor', name: 'admin-sql-query-editor', component: SqlEditorPage, meta: adminMeta, beforeEnter: adminRouteGuard },
      { path: 'admin/:section*', component: AdminPage, meta: adminMeta, beforeEnter: adminRouteGuard }
    ]
  },
  {
    path: '/embed/dashboard/:id',
    name: 'embed-dashboard',
    component: EmbedDashboardPage,
    meta: { embedded: true }
  },
  {
    path: '/embed/error',
    name: 'embed-error',
    component: EmbedErrorPage,
    meta: { embedded: true }
  }
];

export const router = createRouter({
  history: createWebHistory(),
  routes
});

installBaseProductRouteGuards(router);
