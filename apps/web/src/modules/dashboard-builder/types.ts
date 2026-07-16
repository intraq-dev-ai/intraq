import type {
  VisualizationKind,
  VisualizationSpec
} from '@intraq/contracts';
import type { DashboardDataCachePolicy } from './dashboard-data-cache-policy';

export type {
  VisualizationKind,
  VisualizationSpec
} from '@intraq/contracts';

export type VisualizationFilterIntent = NonNullable<VisualizationSpec['filters']>[number];

export interface DashboardElement {
  id: string;
  dashboardId: string;
  name: string;
  type: string;
  chartType?: string;
  config?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  dataSourceId?: string | null;
  order: number;
  isVisible: boolean;
}

export interface VisualizationDataset {
  label: string;
  data: number[];
  aggregatedData?: boolean;
  placeholder?: boolean;
}

export interface VisualizationData {
  labels: string[];
  datasets: VisualizationDataset[];
  rawData?: Array<Record<string, unknown>>;
  runtimeContext?: {
    parameterValues?: Record<string, unknown>;
  };
}

export interface DashboardFilter {
  id: string;
  dashboardId: string;
  name: string;
  field: string;
  operator: string;
  value?: unknown;
  placement?: 'bar' | 'canvas';
  type: string;
  applyTo?: string;
  config?: Record<string, unknown>;
  disabled?: boolean;
  enabled?: boolean;
  isActive?: boolean;
  isDisabled?: boolean;
  order?: number;
  priority?: number;
  priorityEnabled?: boolean;
  priorityMode?: string;
  target?: unknown;
  targetComponents?: unknown[];
  targetDataSources?: unknown[];
  targetElementIds?: unknown[];
  targetDataSourceId?: string;
  targetType?: string;
}

export interface DashboardFilterPatch {
  config?: Record<string, unknown>;
  field?: string;
  isActive?: boolean;
  name?: string;
  operator?: string;
  order?: number;
  placement?: 'bar' | 'canvas';
  type?: string;
  value?: unknown;
}

export type DashboardFilterCreatePatch = Required<Pick<DashboardFilterPatch, 'field' | 'name' | 'operator' | 'type'>> & DashboardFilterPatch;

export interface DashboardRuntimeFilterState {
  field?: string;
  name?: string;
  operator?: string;
  type?: string;
  value: unknown;
}

export interface DashboardRunConfiguration {
  editModeRowLimit?: number;
  runtime: string;
  scheduled: boolean;
  viewModeRowLimit?: number;
}

export interface DashboardRuntimeState {
  dashboardId: string;
  filters: Record<string, DashboardRuntimeFilterState>;
  runConfiguration?: DashboardRunConfiguration;
  runtimeParameterValues?: Record<string, unknown>;
  version: 2;
}

export interface DashboardBuilderDebugPayload {
  actionPlan: BuilderActionPlan | null;
  dashboardFilters: DashboardFilter[];
  dataModelRecommendation: DataModelRecommendation | null;
  dataRequest: unknown;
  prompt: string;
  rawComponentState: DashboardElement | null;
  rawFilterState: DashboardFilter[];
  selectedDataModel: {
    id: string;
    name: string;
    fields: string[];
  } | null;
  selectedDataSource: {
    id: string;
    name: string;
  } | null;
  selectedElement: {
    id: string;
    name: string;
    type: string;
    chartType?: string;
  } | null;
  runtimeState: DashboardRuntimeState | null;
  visualizationSpec: VisualizationSpec | null;
}

export type DashboardBuilderDebugTab = 'actions' | 'config' | 'elements' | 'runtime';

export interface DashboardAgentMessageAction {
  id: string;
  label: string;
}

export interface DashboardAgentMessage {
  id: string;
  actions?: DashboardAgentMessageAction[];
  role: 'assistant' | 'user';
  body: string;
  details?: string[];
  kind: 'error' | 'loading' | 'plan' | 'prompt' | 'status' | 'model_context' | 'welcome';
  title?: string;
}

export interface BuilderConversationMessage {
  id: string;
  conversationId: string;
  role: 'assistant' | 'status' | 'user';
  content: string;
  createdAt: string;
}

export interface BuilderConversationSnapshot {
  conversation: {
    id: string;
    dashboardId: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    metadata: Record<string, unknown>;
  };
  messages: BuilderConversationMessage[];
}

export interface DashboardSettings {
  currencySymbol?: string;
  dataCachePolicy?: DashboardDataCachePolicy;
  closeDropdownOnSelect?: boolean;
  hideMultiSelectSummary?: boolean;
  isFavorite?: boolean;
}

export interface Dashboard {
  id: string;
  name: string;
  description?: string;
  category: string;
  categoryId?: string | null;
  status: 'draft' | 'published';
  settings?: DashboardSettings;
  isGlobal?: boolean;
  isGloballyVisible?: boolean;
  isPublic?: boolean;
  isSample?: boolean;
  tenant?: {
    name?: string;
  } | null;
  elements: DashboardElement[];
  filters: DashboardFilter[];
  createdAt?: string;
  updatedAt: string;
}

export interface DashboardSuggestion {
  title: string;
  description: string;
}

export interface DashboardVersion {
  changes?: Array<Record<string, unknown>>;
  comment?: string;
  id: string;
  dashboardId: string;
  isAutoSave?: boolean;
  isPublished?: boolean;
  name: string;
  publishedAt?: string | null;
  snapshot?: Dashboard;
  status: Dashboard['status'];
  userName?: string;
  versionNumber?: number;
  createdAt: string;
}

export interface BuilderDataField {
  name: string;
  type: string;
  aliases?: string[];
  columnType?: string;
  dataType?: string;
  dateRole?: string;
  defaultValue?: unknown;
  description?: string;
  dictionaryDescription?: string;
  format?: string;
  isParameter?: boolean;
  label?: string;
  parameterConfig?: BuilderDataParameter;
  required?: boolean;
  role?: string;
  sampleValues?: unknown[];
  semanticRole?: string;
}

export interface BuilderDataParameter {
  name: string;
  aliases?: string[];
  dataType?: string;
  dateRole?: string;
  defaultValue?: unknown;
  description?: string;
  label?: string;
  required?: boolean;
  type?: string;
}

export interface BuilderDataTable {
  id: string;
  name: string;
  description?: string;
  fields: BuilderDataField[];
  isSelected?: boolean;
  parameters?: BuilderDataParameter[];
  settings?: {
    isDataModel?: boolean;
    parameters?: BuilderDataParameter[];
    targetType?: string;
  };
  dictionary?: {
    businessName?: string;
    parameters?: BuilderDataParameter[];
    sampleQuestions?: string[];
    targetType?: string;
    ai?: {
      columns?: unknown;
      fields?: unknown;
      sampleQuestions?: string[];
      routing?: {
        defaultFilters?: unknown[];
        filterFields?: string[];
        primaryTimeField?: string;
        triggerKeywords?: string[];
        useFor?: string[];
      };
    };
    columns?: unknown;
    fields?: unknown;
    routing?: {
      defaultFilters?: unknown[];
      filterFields?: string[];
      primaryTimeField?: string;
      triggerKeywords?: string[];
      useFor?: string[];
    };
  };
}

export interface BuilderDataSource {
  id: string;
  name: string;
  status?: string;
  tables: BuilderDataTable[];
  parameters?: BuilderDataParameter[];
  settings?: {
    dashboard?: {
      visible?: boolean;
      isDefault?: boolean;
    };
    parameters?: BuilderDataParameter[];
  };
}

export interface BuilderModelSummary {
  coverage: number;
  documentedColumns: number;
  id: string;
  isDataModel: boolean;
  kbStatus: string;
  name: string;
  syncedAt: string | null;
  totalColumns: number;
}

export interface BuilderModelContextSummary {
  columnCoverage: number;
  dataSourceCoverage: number;
  dataSourceId: string;
  dataSourceName: string;
  modelCoverage: number;
  models: BuilderModelSummary[];
  overallCoverage: number;
  recommendations: string[];
  status: string;
  tableCount: number;
  modelFields: number;
}

export interface BuilderActionPlan {
  conversationId?: string;
  type: string;
  workflow: string;
  mode: string;
  componentType: string;
  title: string;
  summary: string;
  message: string;
  actions?: Array<{
    action: string;
    params: Record<string, unknown>;
  }>;
  params?: Record<string, unknown> & {
    dataSourceId?: string;
    dataSourceTableId?: string;
    tableName?: string;
    visualizationKind?: string;
  };
  visualizations?: VisualizationSpec[];
  knowledgeReferences?: Array<{
    id: string;
    title: string;
    summary?: string;
  }>;
}

export interface BuilderConversationResponse {
  conversationId?: string;
  type: 'conversation';
  workflow: 'dashboard-builder';
  message: string;
  title: string;
  summary: string;
  suggestedActions: string[];
  knowledgeReferences: Array<{
    id: string;
    title: string;
    summary?: string;
  }>;
}

export type BuilderAgentResponse = BuilderActionPlan | BuilderConversationResponse;

export interface DataModelRecommendation {
  subjectArea: string;
  dimensions: string[];
  measures: string[];
  filters: string[];
  knowledgeReferences: Array<{
    id: string;
    title: string;
    summary?: string;
  }>;
}
