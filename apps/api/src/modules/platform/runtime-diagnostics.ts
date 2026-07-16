import { performance } from 'node:perf_hooks';
import process from 'node:process';
import type { EventLoopUtilization } from 'node:perf_hooks';
import { isManagementRole } from '../../security/roles.js';
import type { RequestSecurityContext } from '../../security/request-context.js';

export interface RuntimeDiagnosticsSnapshot {
  cpu: {
    systemMicros: number;
    totalMicros: number;
    userMicros: number;
  };
  eventLoop: {
    active: number;
    idle: number;
    utilization: number;
  };
  memory: {
    arrayBuffersBytes: number;
    externalBytes: number;
    heapTotalBytes: number;
    heapUsedBytes: number;
    heapUsedPercent: number;
    rssBytes: number;
  };
  pid: number;
  resource: {
    maxRssKb: number;
  };
  sampledAt: string;
  uptimeSeconds: number;
}

export class PlatformRuntimeDiagnostics {
  private previousEventLoopSample: EventLoopUtilization | null = null;

  constructor(private readonly enabled = false) {}

  isEnabled(): boolean {
    return this.enabled;
  }

  canRead(context: RequestSecurityContext | undefined): boolean {
    return Boolean(context?.role && isManagementRole(context.role));
  }

  snapshot(): RuntimeDiagnosticsSnapshot {
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();
    const resource = process.resourceUsage();
    const currentEventLoop = performance.eventLoopUtilization();
    const eventLoop = this.previousEventLoopSample
      ? performance.eventLoopUtilization(currentEventLoop, this.previousEventLoopSample)
      : currentEventLoop;
    this.previousEventLoopSample = currentEventLoop;
    const heapUsedPercent = memory.heapTotal > 0
      ? round((memory.heapUsed / memory.heapTotal) * 100)
      : 0;

    return {
      cpu: {
        systemMicros: cpu.system,
        totalMicros: cpu.user + cpu.system,
        userMicros: cpu.user
      },
      eventLoop: {
        active: round(eventLoop.active),
        idle: round(eventLoop.idle),
        utilization: round(eventLoop.utilization)
      },
      memory: {
        arrayBuffersBytes: memory.arrayBuffers,
        externalBytes: memory.external,
        heapTotalBytes: memory.heapTotal,
        heapUsedBytes: memory.heapUsed,
        heapUsedPercent,
        rssBytes: typeof memory.rss === 'number' ? memory.rss : process.memoryUsage.rss()
      },
      pid: process.pid,
      resource: {
        maxRssKb: resource.maxRSS
      },
      sampledAt: new Date().toISOString(),
      uptimeSeconds: round(process.uptime())
    };
  }
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
