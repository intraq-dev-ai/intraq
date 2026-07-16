import type { IncomingMessage, ServerResponse } from 'node:http';
import { readJsonBody, sendBadRequest, sendOk } from '../../http.js';
import {
  setupValidationMessage
} from './foundation-route-utils.js';

export async function handleSetupRoutes(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  if (req.method === 'GET' && url.pathname === '/api/setup/status') {
    sendOk(res, {
      configured: false,
      deploymentType: 'self-hosted',
      environment: 'development',
      setupCompleted: false,
      setupRequired: true
    });
    return true;
  }
  if (req.method === 'GET' && url.pathname === '/api/setup/options') {
    sendOk(res, { databaseTypes: ['postgres'], deploymentTypes: ['self-hosted'] });
    return true;
  }
  if (req.method === 'POST' && url.pathname === '/api/setup/run') {
    const body = await readJsonBody(req);
    const invalidSetupMessage = setupValidationMessage(body);
    if (invalidSetupMessage) {
      sendBadRequest(res, invalidSetupMessage);
      return true;
    }
    const setupBody = body as Record<string, string>;
    sendOk(res, {
      adminUser: {
        email: setupBody.adminEmail,
        firstName: setupBody.adminFirstName,
        lastName: setupBody.adminLastName
      },
      configured: true,
      deploymentType: 'self-hosted',
      message: 'Setup completed successfully',
      setupCompletedAt: '2026-05-04T00:00:00.000Z'
    });
    return true;
  }
  return false;
}
