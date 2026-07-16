import { computed, ref } from 'vue';
import { uuidv7 } from '@intraq/contracts';
import type { AnalyzerVisualizationType } from './result-data';
import type { AnalyzerExecution } from './types';

const queueStorageKey = 'intraq.analyzer.dashboard-queue.v1';

export interface AnalyzerDashboardQueueItem {
  conversationTitle?: string;
  createdAt: string;
  execution: AnalyzerExecution;
  id: string;
  latestPlanTitle: string;
  selectedDataSourceId: string;
  title: string;
  type: AnalyzerVisualizationType;
}

export function useAnalyzerDashboardQueue(storage: Storage = window.localStorage) {
  const items = ref<AnalyzerDashboardQueueItem[]>(readAnalyzerDashboardQueue(storage));
  const count = computed(() => items.value.length);

  function add(params: Omit<AnalyzerDashboardQueueItem, 'createdAt' | 'id' | 'title' | 'type'> & { title?: string; type?: AnalyzerVisualizationType }): AnalyzerDashboardQueueItem {
    const item: AnalyzerDashboardQueueItem = {
      ...params,
      id: uuidv7(),
      createdAt: new Date().toISOString(),
      title: params.title || params.execution.title || params.latestPlanTitle || 'Analyzer result',
      type: params.type ?? 'table'
    };
    items.value = [item, ...items.value.filter(existing => !sameExecution(existing.execution, item.execution))].slice(0, 12);
    writeAnalyzerDashboardQueue(storage, items.value);
    return item;
  }

  function clear(): void {
    items.value = [];
    writeAnalyzerDashboardQueue(storage, items.value);
  }

  function remove(id: string): void {
    items.value = items.value.filter(item => item.id !== id);
    writeAnalyzerDashboardQueue(storage, items.value);
  }

  return { add, clear, count, items, remove };
}

export function readAnalyzerDashboardQueue(storage: Storage): AnalyzerDashboardQueueItem[] {
  try {
    const parsed = JSON.parse(storage.getItem(queueStorageKey) ?? '[]') as unknown;
    return Array.isArray(parsed) ? parsed.map(normalizeQueueItem).filter(isPresent) : [];
  } catch {
    return [];
  }
}

function writeAnalyzerDashboardQueue(storage: Storage, items: AnalyzerDashboardQueueItem[]): void {
  storage.setItem(queueStorageKey, JSON.stringify(items.map(item => ({
    ...item,
    execution: executionForStorage(item.execution)
  }))));
}

function executionForStorage(execution: AnalyzerExecution): AnalyzerExecution {
  const { rows: _rows, relatedExecutions, ...safeExecution } = execution;
  return {
    ...safeExecution,
    ...(relatedExecutions?.length
      ? { relatedExecutions: relatedExecutions.map(executionForStorage) }
      : {})
  };
}

function normalizeQueueItem(value: unknown): AnalyzerDashboardQueueItem | null {
  if (!isRecord(value) || !isRecord(value.execution)) return null;
  const id = typeof value.id === 'string' && value.id.trim() ? value.id : uuidv7();
  const title = typeof value.title === 'string' && value.title.trim() ? value.title.trim() : 'Analyzer result';
  const latestPlanTitle = typeof value.latestPlanTitle === 'string' ? value.latestPlanTitle : title;
  return {
    id,
    title,
    latestPlanTitle,
    execution: value.execution as unknown as AnalyzerExecution,
    selectedDataSourceId: typeof value.selectedDataSourceId === 'string' ? value.selectedDataSourceId : '',
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
    type: readQueueVisualizationType(value.type),
    ...(typeof value.conversationTitle === 'string' ? { conversationTitle: value.conversationTitle } : {})
  };
}

function readQueueVisualizationType(value: unknown): AnalyzerVisualizationType {
  return value === 'table' || value === 'matrix' || value === 'bar' || value === 'column' || value === 'line' || value === 'area' || value === 'pie'
    ? value
    : 'table';
}

function sameExecution(left: AnalyzerExecution, right: AnalyzerExecution): boolean {
  const leftContract = left.executionContract;
  const rightContract = right.executionContract;
  if (leftContract && rightContract) {
    return leftContract.executionId === rightContract.executionId
      || (
        leftContract.requestFingerprint === rightContract.requestFingerprint
        && leftContract.resultFingerprint === rightContract.resultFingerprint
      );
  }
  return left.tableName === right.tableName && left.title === right.title && left.message === right.message;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPresent<TValue>(value: TValue | null): value is TValue {
  return value !== null;
}
