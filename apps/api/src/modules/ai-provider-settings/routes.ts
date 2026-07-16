import type { IncomingMessage, ServerResponse } from 'node:http';
import type { IntraQPrismaClient } from '@intraq/db';
import { readJsonBody, sendBadRequest, sendJson, sendOk } from '../../http.js';
import { fail } from '@intraq/contracts';
import {
  deleteProviderConfig,
  normalizeProvider,
  readPublicAiProviderSettings,
  saveAiProviderSetting,
  saveGeminiProviderConfig,
  saveOpenAIProviderConfig,
  type SelfHostedAiProvider
} from './settings.js';

export class AiProviderSettingsRoutes {
  constructor(private readonly client: IntraQPrismaClient | null = null) {}

  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method === 'GET' && url.pathname === '/api/ai-provider-settings') {
      sendOk(res, await readPublicAiProviderSettings(this.client));
      return true;
    }

    if (req.method === 'PUT' && url.pathname === '/api/ai-provider-settings/provider') {
      await this.updateProvider(req, res);
      return true;
    }

    if (req.method === 'PUT' && url.pathname === '/api/ai-provider-settings/openai') {
      await this.updateOpenAI(req, res);
      return true;
    }

    if (req.method === 'PUT' && url.pathname === '/api/ai-provider-settings/gemini') {
      await this.updateGemini(req, res);
      return true;
    }

    if (req.method === 'DELETE' && url.pathname === '/api/ai-provider-settings/openai') {
      await deleteProviderConfig(this.client, 'openai');
      sendOk(res, { deleted: true, provider: 'openai' });
      return true;
    }

    if (req.method === 'DELETE' && url.pathname === '/api/ai-provider-settings/gemini') {
      await deleteProviderConfig(this.client, 'gemini');
      sendOk(res, { deleted: true, provider: 'gemini' });
      return true;
    }

    const testMatch = /^\/api\/ai-provider-settings\/(openai|gemini)\/test$/.exec(url.pathname);
    if (req.method === 'POST' && testMatch?.[1]) {
      await this.testProvider(res, testMatch[1] as 'gemini' | 'openai');
      return true;
    }

    return false;
  }

  private async updateProvider(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody(req);
    const provider = normalizeProvider(isRecord(body) ? body.provider : null);
    if (!isSelfHostedProvider(provider)) {
      sendBadRequest(res, 'Provider must be codex, openai, or gemini.');
      return;
    }
    sendOk(res, { provider: await saveAiProviderSetting(this.client, provider) });
  }

  private async updateOpenAI(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody(req);
    if (!isRecord(body)) {
      sendBadRequest(res, 'Request body must be a JSON object.');
      return;
    }
    sendOk(res, await saveOpenAIProviderConfig(this.client, {
      apiKey: stringValue(body.apiKey),
      baseUrl: stringValue(body.baseUrl),
      model: stringValue(body.model)
    }));
  }

  private async updateGemini(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody(req);
    if (!isRecord(body)) {
      sendBadRequest(res, 'Request body must be a JSON object.');
      return;
    }
    sendOk(res, await saveGeminiProviderConfig(this.client, {
      apiKey: stringValue(body.apiKey),
      baseUrl: stringValue(body.baseUrl),
      model: stringValue(body.model)
    }));
  }

  private async testProvider(res: ServerResponse, provider: 'gemini' | 'openai'): Promise<void> {
    const settings = await readPublicAiProviderSettings(this.client);
    const config = provider === 'openai' ? settings.openai : settings.gemini;
    if (!config.apiKeyConfigured) {
      sendJson(res, 400, fail(`${provider === 'openai' ? 'OpenAI' : 'Gemini'} API key is not configured.`));
      return;
    }
    if (!config.model.trim()) {
      sendJson(res, 400, fail(`${provider === 'openai' ? 'OpenAI' : 'Gemini'} model is not configured.`));
      return;
    }
    sendOk(res, {
      ok: true,
      provider,
      model: config.model,
      message: 'Configuration is present. Live provider calls are made by Analyzer, Dashboard Builder, and SQL Assistant.'
    });
  }
}

export function createAiProviderSettingsRoutes(client: IntraQPrismaClient | null = null): AiProviderSettingsRoutes {
  return new AiProviderSettingsRoutes(client);
}

function isSelfHostedProvider(value: unknown): value is SelfHostedAiProvider {
  return value === 'codex' || value === 'gemini' || value === 'openai';
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
