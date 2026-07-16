import type { ComputedRef, Ref } from 'vue';
import type { Router } from 'vue-router';
import { useAnalyzerDashboardQueue, type AnalyzerDashboardQueueItem } from './dashboard-queue';
import { addAnalyzerQueueToDashboard, createDashboardFromAnalyzerQueue } from './dashboard-queue-api';
import { saveAnalyzerDashboardHandoff } from './dashboard-handoff';
import { readError } from './page-helpers';
import type { AnalyzerVisualizationType } from './result-data';
import type { AnalyzerConversation, AnalyzerExecution } from './types';
import { useToast } from '../shared/use-toast';

interface AnalyzerDashboardHandoffOptions {
  currentConversation: ComputedRef<AnalyzerConversation | null>;
  dashboardQueue?: ReturnType<typeof useAnalyzerDashboardQueue>;
  latestExecution: Ref<AnalyzerExecution | null>;
  latestPlanTitle: ComputedRef<string>;
  router: Router;
  selectedDataSourceId: Ref<string>;
}

export interface AnalyzerDashboardQueuePayload {
  execution: AnalyzerExecution;
  type?: AnalyzerVisualizationType;
}

export function useAnalyzerDashboardHandoff(options: AnalyzerDashboardHandoffOptions) {
  const dashboardQueue = options.dashboardQueue ?? useAnalyzerDashboardQueue();
  const dashboardQueueItems = dashboardQueue.items;
  const toast = useToast();

  async function sendToDashboardBuilder(execution = options.latestExecution.value): Promise<void> {
    if (!execution) return;
    try {
      const dashboard = await saveAnalyzerDashboardHandoff({
        conversationTitle: options.currentConversation.value?.title,
        execution,
        latestPlanTitle: options.latestPlanTitle.value,
        selectedDataSourceId: options.selectedDataSourceId.value
      });
      toast.success('Analyzer result sent to Dashboard Builder.');
      await options.router.push(`/dashboard/${dashboard.id}/edit`);
    } catch (caught) {
      toast.error(readError(caught, 'Analyzer handoff failed.'));
    }
  }

  function queueDashboardResult(input: AnalyzerDashboardQueuePayload | AnalyzerExecution | null = options.latestExecution.value): void {
    const payload = readQueuePayload(input);
    if (!payload) return;
    const queued = dashboardQueue.add({
      conversationTitle: options.currentConversation.value?.title,
      execution: payload.execution,
      latestPlanTitle: options.latestPlanTitle.value,
      selectedDataSourceId: options.selectedDataSourceId.value,
      type: payload.type ?? 'table'
    });
    toast.success(`Added "${queued.title}" to dashboard queue.`);
  }

  async function addQueueToExistingDashboard(dashboardId: string): Promise<void> {
    const items = [...dashboardQueue.items.value];
    if (!dashboardId || items.length === 0) return;
    try {
      await addAnalyzerQueueToDashboard({ dashboardId, items });
      dashboardQueue.clear();
      toast.success(`Added ${items.length} queued item${items.length === 1 ? '' : 's'} to dashboard.`);
    } catch (caught) {
      toast.error(readError(caught, 'Dashboard queue could not be added.'));
      throw caught;
    }
  }

  async function createDashboardFromQueue(name: string, description: string): Promise<void> {
    const items = [...dashboardQueue.items.value];
    if (!name.trim() || items.length === 0) return;
    try {
      const dashboard = await createDashboardFromAnalyzerQueue({
        description,
        items,
        name: name.trim()
      });
      dashboardQueue.clear();
      toast.success(`Created dashboard "${name.trim()}" from queue.`);
      await options.router.push(`/dashboard/${dashboard.id}/edit`);
    } catch (caught) {
      toast.error(readError(caught, 'Dashboard queue could not create a dashboard.'));
      throw caught;
    }
  }

  async function openQueuedDashboard(id: string): Promise<void> {
    const item = dashboardQueue.items.value.find(entry => entry.id === id);
    if (!item) return;
    await sendQueuedDashboardToBuilder(item);
  }

  async function sendQueuedDashboardToBuilder(item: AnalyzerDashboardQueueItem): Promise<void> {
    try {
      const dashboard = await saveAnalyzerDashboardHandoff({
        conversationTitle: item.conversationTitle,
        execution: item.execution,
        latestPlanTitle: item.latestPlanTitle,
        selectedDataSourceId: item.selectedDataSourceId || options.selectedDataSourceId.value
      });
      dashboardQueue.remove(item.id);
      toast.success(`Sent "${item.title}" to Dashboard Builder.`);
      await options.router.push(`/dashboard/${dashboard.id}/edit`);
    } catch (caught) {
      toast.error(readError(caught, 'Queued analyzer handoff failed.'));
    }
  }

  return {
    addQueueToExistingDashboard,
    clearDashboardQueue: dashboardQueue.clear,
    createDashboardFromQueue,
    notifyDashboardQueueCleared: () => toast.info('Dashboard queue cleared.'),
    dashboardQueueItems,
    openQueuedDashboard,
    queueDashboardResult,
    removeQueuedDashboard: dashboardQueue.remove,
    sendToDashboardBuilder
  };
}

function readQueuePayload(input: AnalyzerDashboardQueuePayload | AnalyzerExecution | null): AnalyzerDashboardQueuePayload | null {
  if (!input) return null;
  if ('execution' in input) return input;
  return { execution: input, type: 'table' };
}
