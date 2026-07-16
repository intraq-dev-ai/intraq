import type { DashboardBuilderAgent } from '@intraq/agent-core';
import type {
  BuilderAgentRequest,
  BuilderAgentResponse,
  DashboardComponentType,
  VisualizationKind
} from '@intraq/contracts';

export function localDashboardBuilderFallback(
  request: BuilderAgentRequest,
  builderAgent: DashboardBuilderAgent
): BuilderAgentResponse | null {
  if (request.mode === 'update') return null;
  const selected = requestForLocalFallback(request);
  if (!selected) return null;
  try {
    return builderAgent.planDashboardElement(selected);
  } catch {
    return null;
  }
}

function requestForLocalFallback(request: BuilderAgentRequest): BuilderAgentRequest | null {
  const prompt = normalize(request.prompt);
  const componentType = request.componentType ?? componentTypeFromPrompt(prompt);
  const visualizationKind = request.visualizationKind ?? visualizationKindFromPrompt(prompt, componentType);
  const isDataBacked = componentType !== 'text' && visualizationKind !== 'text';

  if (!componentType && !visualizationKind) return null;
  if (isDataBacked && !request.dataModel) return null;
  if (!isExplicitDashboardAction(prompt, componentType, visualizationKind)) return null;

  const selected: BuilderAgentRequest = {
    ...request,
    mode: request.mode ?? 'create'
  };
  const selectedComponentType = componentType ?? inferComponentTypeFromKind(visualizationKind);
  const selectedVisualizationKind = visualizationKind ?? inferVisualizationKindFromComponent(componentType);
  if (selectedComponentType) selected.componentType = selectedComponentType;
  if (selectedVisualizationKind) selected.visualizationKind = selectedVisualizationKind;
  return selected;
}

function isExplicitDashboardAction(
  prompt: string,
  componentType: DashboardComponentType | undefined,
  visualizationKind: VisualizationKind | undefined
): boolean {
  if (componentType || visualizationKind) return true;
  return /\b(create|add|build|make|show|plot|chart|graph|visuali[sz]e|compare|breakdown|summari[sz]e)\b/.test(prompt);
}

function componentTypeFromPrompt(prompt: string): DashboardComponentType | undefined {
  if (/\b(table|list)\b/.test(prompt)) return 'table';
  if (/\b(matrix|heatmap|pivot)\b/.test(prompt)) return 'matrix';
  if (/\b(kpi|card|metric|number|total)\b/.test(prompt)) return 'card';
  if (/\b(pie|donut)\b/.test(prompt)) return 'pie';
  if (/\b(filter|slicer)\b/.test(prompt)) return 'filter';
  if (/\b(text|insight|note|section|heading)\b/.test(prompt)) return 'text';
  if (/\b(chart|graph|plot|bar|line|trend|compare|breakdown|by)\b/.test(prompt)) return 'chart';
  return undefined;
}

function visualizationKindFromPrompt(
  prompt: string,
  componentType: DashboardComponentType | undefined
): VisualizationKind | undefined {
  if (/\b(line|trend|over time|time series)\b/.test(prompt)) return 'line';
  if (/\b(pie|donut)\b/.test(prompt)) return 'pie';
  if (/\b(table|list)\b/.test(prompt)) return 'table';
  if (/\b(matrix|heatmap|pivot)\b/.test(prompt)) return 'matrix';
  if (/\b(kpi|card|metric|number|total)\b/.test(prompt)) return 'card';
  if (/\b(filter|slicer)\b/.test(prompt)) return 'filter';
  if (/\b(text|insight|note|section|heading)\b/.test(prompt)) return 'text';
  if (/\b(bar|compare|breakdown|by|chart|graph|plot)\b/.test(prompt)) return 'bar';
  return inferVisualizationKindFromComponent(componentType);
}

function inferComponentTypeFromKind(kind: VisualizationKind | undefined): DashboardComponentType | undefined {
  if (!kind) return undefined;
  if (kind === 'table') return 'table';
  if (kind === 'card') return 'card';
  if (kind === 'pie') return 'pie';
  if (kind === 'matrix') return 'matrix';
  if (kind === 'filter') return 'filter';
  if (kind === 'text') return 'text';
  return 'chart';
}

function inferVisualizationKindFromComponent(componentType: DashboardComponentType | undefined): VisualizationKind | undefined {
  if (!componentType) return undefined;
  if (componentType === 'chart') return 'bar';
  return componentType;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
