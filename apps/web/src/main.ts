import { createApp } from 'vue';
import App from './App.vue';
import { installAuthenticatedFetch } from './modules/auth/authenticated-fetch';
import { bootstrapBranding } from './modules/shell/branding-bootstrap';
import { installDocumentBranding } from './modules/shell/document-branding';
import { initializeTheme } from './modules/theme/theme';
import { router } from './router.js';
import './styles.css';

async function startApp(): Promise<void> {
  installAuthenticatedFetch();
  initializeTheme();
  await bootstrapBranding();
  installDocumentBranding(router);
  createApp(App).use(router).mount('#app');
}

void startApp();
