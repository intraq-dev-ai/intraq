import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

const DEFAULT_WEB_PORT = 5173;
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '');
  const webHost = env.INTRAQ_WEB_HOST?.trim() || '0.0.0.0';
  const webPort = readPort(env.INTRAQ_WEB_PORT);
  const apiPort = env.API_PORT?.trim() || '4100';

  return {
    envDir: repoRoot,
    plugins: [vue()],
    resolve: {
      alias: {
        '@intraq/contracts': fileURLToPath(new URL('../../packages/contracts/src/index.ts', import.meta.url))
      }
    },
    server: {
      host: webHost,
      port: webPort,
      strictPort: true,
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${apiPort}`,
          changeOrigin: true,
          timeout: 90000,
          proxyTimeout: 90000
        },
        '/mcp': {
          target: `http://127.0.0.1:${apiPort}`,
          changeOrigin: true,
          timeout: 90000,
          proxyTimeout: 90000
        }
      }
    },
    build: {
      target: 'es2022',
      cssCodeSplit: true
    }
  };
});

function readPort(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_WEB_PORT;
}
