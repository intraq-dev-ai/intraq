import type { ComputedRef } from 'vue';
import { isRecord } from './embed-dashboard-utils';

interface EmbedFrameBridgeOptions {
  dashboardId: ComputedRef<string>;
  handshakeRequired: ComputedRef<boolean>;
  handshakeTimeoutMs: ComputedRef<number>;
}

export function useEmbedFrameBridge(options: EmbedFrameBridgeOptions) {
  let embedHeightObserver: ResizeObserver | null = null;
  let embedHeightMutationObserver: MutationObserver | null = null;
  let pendingHeightFrame = 0;
  let lastPostedHeight = 0;

  function start(): void {
    window.addEventListener('message', handleParentMessage);
    startEmbedHeightObserver();
  }

  function stop(): void {
    window.removeEventListener('message', handleParentMessage);
    embedHeightObserver?.disconnect();
    embedHeightObserver = null;
    embedHeightMutationObserver?.disconnect();
    embedHeightMutationObserver = null;
    if (pendingHeightFrame) {
      window.cancelAnimationFrame(pendingHeightFrame);
      pendingHeightFrame = 0;
    }
  }

  function handleParentMessage(event: MessageEvent<unknown>): void {
    if (!isRecord(event.data) || event.data.type !== 'resize' || !event.source) return;
    (event.source as Window).postMessage({ type: 'height', height: readEmbedHeight() }, event.origin);
  }

  function resolveEmbedOrigin(dashboardIdValue: string, accessToken: string): Promise<string> {
    if (!options.handshakeRequired.value) return Promise.resolve(window.location.hostname);
    if (window.parent === window) {
      return Promise.reject(new Error('Parent origin is required for this embed session.'));
    }
    return waitForParentEmbedHandshake(dashboardIdValue, accessToken);
  }

  function waitForParentEmbedHandshake(dashboardIdValue: string, accessToken: string): Promise<string> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const readyMessage = {
        type: 'ui-report:embed-ready',
        dashboardId: dashboardIdValue,
        token: accessToken
      };
      const postReady = (): void => {
        if (settled) return;
        window.parent.postMessage(readyMessage, '*');
      };
      const timeout = window.setTimeout(() => {
        settled = true;
        window.clearInterval(retry);
        window.removeEventListener('message', onMessage);
        reject(new Error('Approved portal handshake timed out.'));
      }, options.handshakeTimeoutMs.value);
      const retry = window.setInterval(postReady, 400);

      function onMessage(event: MessageEvent<unknown>): void {
        if (event.source !== window.parent) return;
        if (!isRecord(event.data) || event.data.type !== 'ui-report:embed-init') return;
        settled = true;
        window.clearTimeout(timeout);
        window.clearInterval(retry);
        window.removeEventListener('message', onMessage);
        resolve(event.origin);
      }

      window.addEventListener('message', onMessage);
      postReady();
    });
  }

  function postEmbedHeight(): void {
    if (window.parent === window) return;
    if (pendingHeightFrame) return;
    pendingHeightFrame = window.requestAnimationFrame(() => {
      pendingHeightFrame = 0;
      const height = readEmbedHeight();
      if (height === lastPostedHeight) return;
      lastPostedHeight = height;
      window.parent.postMessage({ type: 'height', height }, '*');
    });
  }

  function notifyParentOfEmbedLoaded(name: string): void {
    if (window.parent === window) return;
    window.parent.postMessage({
      type: 'ui-report:embed-loaded',
      dashboardId: options.dashboardId.value,
      name
    }, '*');
  }

  function notifyParentOfEmbedTokenExpiry(message: string): void {
    if (window.parent === window) return;
    window.parent.postMessage({
      type: 'ui-report:embed-token-expired',
      dashboardId: options.dashboardId.value,
      message
    }, '*');
  }

  function readEmbedHeight(): number {
    return Math.max(600, embeddedContentHeight());
  }

  function embeddedContentHeight(): number {
    const roots = [
      document.querySelector<HTMLElement>('.embed-page'),
      document.querySelector<HTMLElement>('.embed-shell'),
      document.querySelector<HTMLElement>('.embed-dashboard-content'),
      document.querySelector<HTMLElement>('.embed-dashboard-canvas-area')
    ].filter((element): element is HTMLElement => Boolean(element));
    const measuredRoots = roots.length > 0 ? roots : [document.body];
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    const rootHeights = measuredRoots.map(element => {
      const rect = element.getBoundingClientRect();
      return Math.ceil(Math.max(
        element.scrollHeight,
        element.offsetHeight,
        rect.height,
        rect.bottom + scrollY
      ));
    });
    const childBottoms = Array.from(document.body.children).map(child => {
      const rect = child.getBoundingClientRect();
      return Math.ceil(rect.bottom + scrollY);
    });
    return Math.max(0, ...rootHeights, ...childBottoms);
  }

  function startEmbedHeightObserver(): void {
    embedHeightMutationObserver?.disconnect();
    embedHeightMutationObserver = new MutationObserver(() => postEmbedHeight());
    embedHeightMutationObserver.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true
    });

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('load', postEmbedHeight, { once: true });
      return;
    }
    embedHeightObserver?.disconnect();
    embedHeightObserver = new ResizeObserver(() => postEmbedHeight());
    embedHeightObserver.observe(document.documentElement);
    embedHeightObserver.observe(document.body);
  }

  return {
    notifyParentOfEmbedLoaded,
    notifyParentOfEmbedTokenExpiry,
    postEmbedHeight,
    resolveEmbedOrigin,
    start,
    stop
  };
}
