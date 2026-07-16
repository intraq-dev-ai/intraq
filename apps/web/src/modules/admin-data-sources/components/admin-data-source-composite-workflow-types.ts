export interface CompositeSegmentDraft {
  condition: string;
  dataSourceId: string;
  fieldMap: string;
  id: string;
  name: string;
  parameterValues: string;
  query: string;
  sourceLabelField: string;
  tableName: string;
  timeoutMs: string;
  when: string;
}

export interface WorkflowNode {
  id: string;
  label: string;
  meta: string;
  type: 'trigger' | 'source' | 'merge' | 'output';
  x: number;
  y: number;
}
