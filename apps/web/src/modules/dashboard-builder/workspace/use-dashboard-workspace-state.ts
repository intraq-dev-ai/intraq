import { computed, ref } from 'vue';
import type { RouteLocationNormalizedLoadedGeneric } from 'vue-router';
import { chooseDefaultDataSource, chooseDefaultTable, sampleQuestionsForTable } from '../agent-context/element-planner';
import { buildDashboardBuilderDebugPayload } from '../debug/debug-payload';
import type {
  DashboardAgentMessage,
  BuilderActionPlan,
  BuilderDataSource,
  DashboardBuilderDebugTab,
  Dashboard,
  DashboardSuggestion,
  DashboardRuntimeState,
  BuilderModelContextSummary,
  DashboardVersion,
  DataModelRecommendation
} from '../types';
import { useDashboardUtilityActions } from '../use-dashboard-utility-actions';
import { routeParam } from '../workspace-utils';
import { dashboardAgentWelcomeMessage } from './dashboard-agent-conversation-state';
import type { DashboardAiUndoState } from './dashboard-ai-undo';

export function useDashboardWorkspaceState(route: RouteLocationNormalizedLoadedGeneric) {
  const dashboards = ref<Dashboard[]>([]);
  const dataSources = ref<BuilderDataSource[]>([]);
  const selectedDashboardId = ref('');
  const selectedDataSourceId = ref('');
  const selectedTableId = ref('');
  const selectedTableUserSelected = ref(false);
  const prompt = ref('');
  const lastAgentPrompt = ref('');
  const lastAiUndo = ref<DashboardAiUndoState | null>(null);
  const agentMessages = ref<DashboardAgentMessage[]>([dashboardAgentWelcomeMessage]);
  const agentConversationId = ref('');
  const dashboardName = ref('New Dashboard');
  const status = ref('Ready');
  const error = ref('');
  const hasUnsavedChanges = ref(false);
  const isWorkspaceLoading = ref(true);
  const isSaving = ref(false);
  const actionPlan = ref<BuilderActionPlan | null>(null);
  const dataModelRecommendation = ref<DataModelRecommendation | null>(null);
  const suggestions = ref<DashboardSuggestion[]>([]);
  const modelContextSummary = ref<BuilderModelContextSummary | null>(null);
  const modelContextError = ref('');
  const versions = ref<DashboardVersion[]>([]);
  const selectedElementId = ref('');
  const editorFocusElementId = ref('');
  const debugMode = ref(false);
  const debugActiveTab = ref<DashboardBuilderDebugTab>('config');
  const dashboardRuntimeState = ref<DashboardRuntimeState | null>(null);
  const filterCreateRequestKey = ref(0);
  const selectedDashboard = computed(() => selectedDashboardId.value
    ? dashboards.value.find(dashboard => dashboard.id === selectedDashboardId.value) ?? null
    : null
  );
  const selectedDataSource = computed(() => chooseDefaultDataSource(dataSources.value, selectedDataSourceId.value));
  const selectedTable = computed(() => chooseDefaultTable(selectedDataSource.value, selectedTableId.value));
  const samplePrompts = computed(() => sampleQuestionsForTable(selectedTable.value));
  const selectedElement = computed(() => selectedDashboard.value?.elements.find(element => element.id === selectedElementId.value) ?? null);
  const debugPayload = computed(() => buildDashboardBuilderDebugPayload({
    actionPlan: actionPlan.value,
    dashboard: selectedDashboard.value,
    dataModelRecommendation: dataModelRecommendation.value,
    prompt: prompt.value,
    runtimeState: dashboardRuntimeState.value,
    selectedDataSource: selectedDataSource.value ?? null,
    selectedElement: selectedElement.value,
    selectedTable: selectedTable.value
  }));
  const routeDashboardId = computed(() => routeParam(route.params.id));
  const pageTitle = computed(() => {
    if (route.path.endsWith('/edit')) return 'Edit Dashboard';
    if (route.path.endsWith('/create')) return 'Create Dashboard';
    return routeDashboardId.value ? 'Dashboard' : 'Dashboards';
  });
  const canEditDashboard = computed(() => route.path.endsWith('/edit') && selectedDashboard.value !== null);
  const canUseDashboard = computed(() => canEditDashboard.value && selectedDashboard.value !== null && !isSaving.value);
  const utilityActions = useDashboardUtilityActions(selectedDashboard, status, dashboardRuntimeState);

  return {
    actionPlan,
    agentConversationId,
    agentMessages,
    canEditDashboard,
    canUseDashboard,
    dashboardName,
    dashboardRuntimeState,
    dashboards,
    dataModelRecommendation,
    dataSources,
    debugActiveTab,
    debugMode,
    debugPayload,
    error,
    editorFocusElementId,
    filterCreateRequestKey,
    hasUnsavedChanges,
    isSaving,
    isWorkspaceLoading,
    lastAiUndo,
    lastAgentPrompt,
    pageTitle,
    prompt,
    routeDashboardId,
    samplePrompts,
    selectedDashboard,
    selectedDashboardId,
    selectedDataSource,
    selectedDataSourceId,
    selectedElement,
    selectedElementId,
    selectedTable,
    selectedTableId,
    selectedTableUserSelected,
    status,
    suggestions,
    modelContextError,
    modelContextSummary,
    utilityActions,
    versions
  };
}

export type DashboardWorkspaceState = ReturnType<typeof useDashboardWorkspaceState>;
