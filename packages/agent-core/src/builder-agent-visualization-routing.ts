import type {
  DashboardComponentType,
  VisualizationKind,
  VisualizationSpec
} from '@intraq/contracts';

export function visualizationKindFromRouting(
  routing: Record<string, unknown>,
  requestedComponentType?: DashboardComponentType,
  requestedVisualizationKind?: VisualizationKind
): VisualizationSpec['kind'] | null {
  if (requestedVisualizationKind) return requestedVisualizationKind;
  const requested = visualizationKindFromComponentType(requestedComponentType);
  if (requested) return requested;
  const recommended = readStringArray(routing.recommendedVisualizations)
    .find(kind => isVisualizationKind(kind));
  if (recommended) return recommended;
  return null;
}

function visualizationKindFromComponentType(componentType: DashboardComponentType | undefined): VisualizationSpec['kind'] | null {
  if (!componentType || componentType === 'chart') return null;
  return componentType;
}

function isVisualizationKind(value: string): value is VisualizationSpec['kind'] {
  return value === 'bar' || value === 'line' || value === 'pie' || value === 'table' || value === 'card' || value === 'matrix' || value === 'filter' || value === 'text';
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}
