import { ref } from 'vue';
import { fetchAnalyzerDashboards, type AnalyzerDashboardSummary } from './dashboard-queue-api';
import { readError } from './page-helpers';
import { useToast } from '../shared/use-toast';

interface AnalyzerDashboardQueueActionOptions {
  addQueueToExistingDashboard: (dashboardId: string) => Promise<void>;
  closeQueue: () => void;
  createDashboardFromQueue: (name: string, description: string) => Promise<void>;
}

export function useAnalyzerDashboardQueueActions(options: AnalyzerDashboardQueueActionOptions) {
  const toast = useToast();
  const showDashboardModal = ref(false);
  const dashboardModalMode = ref<'add' | 'create'>('add');
  const dashboardCatalog = ref<AnalyzerDashboardSummary[]>([]);
  const isDashboardCatalogLoading = ref(false);
  const isQueueActionRunning = ref(false);

  async function openAddToExistingDashboardModal(): Promise<void> {
    dashboardModalMode.value = 'add';
    showDashboardModal.value = true;
    await loadDashboardCatalog();
  }

  function openCreateDashboardModal(): void {
    dashboardModalMode.value = 'create';
    showDashboardModal.value = true;
  }

  function closeDashboardModal(): void {
    if (!isQueueActionRunning.value) showDashboardModal.value = false;
  }

  async function loadDashboardCatalog(): Promise<void> {
    isDashboardCatalogLoading.value = true;
    try {
      dashboardCatalog.value = await fetchAnalyzerDashboards();
    } catch (caught) {
      dashboardCatalog.value = [];
      toast.error(readError(caught, 'Dashboard list could not load.'));
    } finally {
      isDashboardCatalogLoading.value = false;
    }
  }

  async function handleExistingDashboardSelected(dashboard: AnalyzerDashboardSummary): Promise<void> {
    isQueueActionRunning.value = true;
    try {
      await options.addQueueToExistingDashboard(dashboard.id);
      showDashboardModal.value = false;
      options.closeQueue();
    } catch {
      // Handoff state already contains the user-facing error.
    } finally {
      isQueueActionRunning.value = false;
    }
  }

  async function handleQueuedDashboardCreate(name: string, description: string): Promise<void> {
    isQueueActionRunning.value = true;
    try {
      await options.createDashboardFromQueue(name, description);
      showDashboardModal.value = false;
      options.closeQueue();
    } catch {
      // Handoff state already contains the user-facing error.
    } finally {
      isQueueActionRunning.value = false;
    }
  }

  return {
    closeDashboardModal,
    dashboardCatalog,
    dashboardModalMode,
    handleExistingDashboardSelected,
    handleQueuedDashboardCreate,
    isDashboardCatalogLoading,
    isQueueActionRunning,
    openAddToExistingDashboardModal,
    openCreateDashboardModal,
    showDashboardModal
  };
}
