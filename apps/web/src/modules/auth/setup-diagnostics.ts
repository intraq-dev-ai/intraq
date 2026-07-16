import { fetchHealth, fetchSetupOptions, fetchSetupStatus } from './api';
import type { HealthStatus, SetupOptions, SetupStatus } from './types';
import type { SetupDiagnosticItem } from './setup-state';

export interface SetupDiagnosticsSnapshot {
  diagnostics: SetupDiagnosticItem[];
  health: HealthStatus | null;
  options: SetupOptions | null;
  status: SetupStatus | null;
}

export function diagnosticsFromSetupState(
  status: SetupStatus | null,
  options: SetupOptions | null,
  health: HealthStatus | null
): SetupDiagnosticItem[] {
  return [
    {
      details: health?.status ? 'The app service is reachable.' : 'Connection has not been checked yet.',
      name: 'App connection',
      status: health?.status ? 'success' : 'pending'
    },
    {
      details: status ? (status.setupRequired ? 'Setup is required before users can sign in.' : 'Setup is already complete.') : 'Setup readiness has not loaded.',
      name: 'Setup readiness',
      status: status ? 'success' : 'pending'
    },
    {
      details: options?.deploymentTypes.length ? options.deploymentTypes.join(', ') : 'Setup options have not loaded.',
      name: 'Install options',
      status: options?.deploymentTypes.length ? 'success' : 'pending'
    },
    {
      details: health?.deploymentType ?? status?.deploymentType ?? 'Deployment type unavailable.',
      name: 'Install type',
      status: health || status ? 'success' : 'pending'
    }
  ];
}

export async function runSetupDiagnosticsSnapshot(): Promise<SetupDiagnosticsSnapshot> {
  const [healthResult, statusResult, optionsResult] = await Promise.allSettled([
    fetchHealth(),
    fetchSetupStatus(),
    fetchSetupOptions()
  ]);
  const health = fulfilledValue(healthResult);
  const status = fulfilledValue(statusResult);
  const options = fulfilledValue(optionsResult);
  return {
    diagnostics: [
      resultDiagnostic('App connection', healthResult, health ? 'The app service is reachable.' : undefined),
      resultDiagnostic(
        'Setup readiness',
        statusResult,
        status ? (status.setupRequired ? 'Setup is required before users can sign in.' : 'Setup is already complete.') : undefined
      ),
      resultDiagnostic(
        'Install options',
        optionsResult,
        options?.deploymentTypes.length ? options.deploymentTypes.join(', ') : undefined
      ),
      resultDiagnostic(
        'Install type',
        healthResult,
        health?.deploymentType ?? status?.deploymentType ?? undefined
      )
    ],
    health,
    options,
    status
  };
}

function fulfilledValue<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === 'fulfilled' ? result.value : null;
}

function resultDiagnostic<T>(
  name: string,
  result: PromiseSettledResult<T>,
  details: string | undefined
): SetupDiagnosticItem {
  if (result.status === 'fulfilled') {
    return { details: details ?? 'Check completed.', name, status: 'success' };
  }
  return {
    details: result.reason instanceof Error ? result.reason.message : 'Check failed.',
    name,
    status: 'failed'
  };
}
