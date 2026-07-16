import { createDashboardFromAnalyzer } from './api';
import type { AnalyzerExecution } from './types';

export async function saveAnalyzerDashboardHandoff(params: {
  conversationTitle: string | undefined;
  execution: AnalyzerExecution;
  latestPlanTitle: string;
  selectedDataSourceId: string;
}): Promise<{ id: string }> {
  const dataSourceId = params.execution.dataSourceId || params.selectedDataSourceId;
  if (!dataSourceId) throw new Error('Analyzer result is missing its data source.');
  const elementName = params.execution.title || params.latestPlanTitle || 'Analyzer Result';
  return createDashboardFromAnalyzer({
    name: `Analyzer - ${params.conversationTitle ?? elementName}`,
    elementName,
    dataSourceId,
    tableName: params.execution.tableName,
    execution: params.execution
  });
}
