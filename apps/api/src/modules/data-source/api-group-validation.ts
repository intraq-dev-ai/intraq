import {
  findDataSource,
  findTableInDataSource,
  type DataSourceRecord,
  type TableDefinition
} from './foundation-store.js';
import { canReadDataSourceTable, type DataSourceAccessPolicy } from './source-access.js';
import { validateApiWorkflowReadOnlySql } from './api-workflow-sql-safety.js';
import type {
  ApiEndpointRecord,
  ApiGroupRecord,
  ApiGroupValidationIssue
} from './api-group-types.js';

export interface ApiGroupValidationOptions {
  access: DataSourceAccessPolicy;
  ensureDataSourcesLoaded: (options?: { dataSourceId?: string }) => Promise<void>;
}

export async function validateApiGroupDefinition(
  group: ApiGroupRecord,
  options: ApiGroupValidationOptions
): Promise<{ errors: ApiGroupValidationIssue[]; valid: boolean; warnings: ApiGroupValidationIssue[] }> {
  const errors: ApiGroupValidationIssue[] = [];
  const warnings: ApiGroupValidationIssue[] = [];
  if (!group.name.trim()) errors.push(issue('group_name_required', 'API group name is required.', 'group.name'));
  if (!group.slug.trim()) errors.push(issue('group_slug_required', 'API group slug is required.', 'group.slug'));

  const seenEndpoints = new Map<string, number>();
  for (let index = 0; index < group.endpoints.length; index += 1) {
    const endpoint = group.endpoints[index]!;
    const path = `endpoints[${index}]`;
    validateEndpointIdentity(endpoint, path, seenEndpoints, errors);
    await validateEndpointTarget(endpoint, path, options, errors, warnings);
  }
  return { valid: errors.length === 0, errors, warnings };
}

function validateEndpointIdentity(
  endpoint: ApiEndpointRecord,
  path: string,
  seenEndpoints: Map<string, number>,
  errors: ApiGroupValidationIssue[]
): void {
  if (!endpoint.name.trim()) errors.push(issue('endpoint_name_required', 'Endpoint name is required.', `${path}.name`));
  if (!endpoint.slug.trim()) errors.push(issue('endpoint_slug_required', 'Endpoint slug is required.', `${path}.slug`));
  if (!endpoint.method.trim()) errors.push(issue('endpoint_method_required', 'Endpoint method is required.', `${path}.method`));
  if (endpoint.status === 'archived') return;
  const key = `${endpoint.method.toUpperCase()} ${endpoint.slug}`;
  const previous = seenEndpoints.get(key);
  if (previous === undefined) {
    seenEndpoints.set(key, Number(path.match(/\d+/)?.[0] ?? 0));
    return;
  }
  const message = `Endpoint ${endpoint.method.toUpperCase()} ${endpoint.slug} is duplicated.`;
  errors.push(issue('duplicate_endpoint', message, `${path}.slug`));
  errors.push(issue('duplicate_endpoint', message, `endpoints[${previous}].slug`));
}

async function validateEndpointTarget(
  endpoint: ApiEndpointRecord,
  path: string,
  options: ApiGroupValidationOptions,
  errors: ApiGroupValidationIssue[],
  warnings: ApiGroupValidationIssue[]
): Promise<void> {
  const executionType = endpoint.executionType.toLowerCase();
  if (!['data_model', 'data-source-table', 'table'].includes(executionType)) {
    errors.push(issue('unsupported_execution_type', `Execution type ${endpoint.executionType} is not supported.`, `${path}.executionType`));
    return;
  }
  const dataSourceId = endpoint.dataSourceId?.trim();
  if (!dataSourceId) {
    errors.push(issue('endpoint_data_source_required', 'Endpoint data source is required.', `${path}.dataSourceId`));
    return;
  }
  await options.ensureDataSourcesLoaded({ dataSourceId });
  const source = findDataSource(dataSourceId);
  if (!source) {
    errors.push(issue('endpoint_data_source_missing', 'Endpoint data source was not found.', `${path}.dataSourceId`));
    return;
  }
  const tableIdentifier = endpoint.dataSourceTableId
    ?? readString(endpoint.settings.tableName)
    ?? readString(endpoint.settings.table)
    ?? endpoint.slug;
  const lookup = findTableInDataSource(source.id, tableIdentifier);
  if (!lookup?.table || lookup.table.isSelected === false) {
    errors.push(issue('endpoint_data_model_missing', 'Endpoint data model was not found or is not selected.', `${path}.dataSourceTableId`));
    return;
  }
  if (!canReadDataSourceTable(source, lookup.table, options.access)) {
    errors.push(issue('endpoint_data_model_denied', 'Endpoint data model is not accessible in this scope.', `${path}.dataSourceTableId`));
    return;
  }
  validateCompositeWorkflow(source, lookup.table, `${path}.settings`, errors, warnings);
  warnUnknownResponseContract(endpoint, path, warnings);
}

function validateCompositeWorkflow(
  source: DataSourceRecord,
  table: TableDefinition,
  path: string,
  errors: ApiGroupValidationIssue[],
  warnings: ApiGroupValidationIssue[]
): void {
  const composite = readCompositeWorkflowConfig(source, table);
  if (!composite) return;
  const segments = readArray(composite.segments ?? composite.sources ?? composite.inputs ?? composite.children);
  if (segments.length === 0) {
    errors.push(issue('composite_segments_required', 'Composite API workflow requires at least one segment.', `${path}.composite.segments`));
    return;
  }
  segments.forEach((segmentValue, index) => {
    validateCompositeSegment(readRecord(segmentValue), `${path}.composite.segments[${index}]`, errors, warnings);
  });
  readArray(composite.steps ?? composite.transforms ?? composite.workflowSteps)
    .forEach((stepValue, index) => validateCompositeStep(readRecord(stepValue), `${path}.composite.steps[${index}]`, errors, warnings));
}

function validateCompositeSegment(
  segment: Record<string, unknown>,
  path: string,
  errors: ApiGroupValidationIssue[],
  warnings: ApiGroupValidationIssue[]
): void {
  const dataSourceId = readString(segment.dataSourceId ?? segment.sourceId ?? segment.lookupDataSourceId);
  if (!dataSourceId) errors.push(issue('composite_segment_data_source_required', 'Composite segment data source is required.', `${path}.dataSourceId`));
  else if (!findDataSource(dataSourceId)) errors.push(issue('composite_segment_data_source_missing', 'Composite segment data source was not found.', `${path}.dataSourceId`));

  const query = readString(segment.query ?? segment.sqlQuery ?? segment.sql);
  const tableName = readString(segment.tableName ?? segment.table ?? segment.modelName);
  if (!query && !tableName) warnings.push(issue('composite_segment_implicit_table', 'Composite segment will use the source default table because no query or table is configured.', path));
  if (query) {
    const error = validateApiWorkflowReadOnlySql(query);
    if (error) errors.push(issue('read_only_sql', error, `${path}.query`));
  }
  readArray(segment.queryFragments ?? segment.sqlFragments ?? segment.fragments ?? segment.clauses)
    .forEach((fragmentValue, index) => validateCompositeFragment(readRecord(fragmentValue), `${path}.queryFragments[${index}]`, errors));
}

function validateCompositeStep(
  step: Record<string, unknown>,
  path: string,
  errors: ApiGroupValidationIssue[],
  warnings: ApiGroupValidationIssue[]
): void {
  const id = readString(step.id ?? step.nodeId ?? step.key);
  if (!id) {
    errors.push(issue('composite_step_id_required', 'Composite workflow step id is required.', `${path}.id`));
    return;
  }
  const type = readString(step.type ?? step.component)?.toLowerCase().replace(/[\s_-]+/g, '');
  const operation = readString(step.operation ?? step.action ?? step.mode)?.toLowerCase().replace(/[\s_-]+/g, '');
  if (type === 'merge' || type === 'mergerows' || type === 'join' || type === 'joinrecords' || type === 'joindimensions' || type === 'lookup') return;
  const transformOperation = operation ?? type;
  if (['transform', 'select', 'project', 'pickfields', 'filter', 'where', 'map', 'addfields', 'derive', 'sort', 'orderby', 'limit', 'take', 'top'].includes(transformOperation ?? '')) {
    warnForTransformStep(step, path, warnings);
    return;
  }
  errors.push(issue('composite_step_type_unsupported', 'Composite workflow step type is not supported.', `${path}.type`));
}

function warnForTransformStep(
  step: Record<string, unknown>,
  path: string,
  warnings: ApiGroupValidationIssue[]
): void {
  const type = readString(step.type ?? step.component)?.toLowerCase().replace(/[\s_-]+/g, '');
  const operation = readString(step.operation ?? step.action ?? step.mode)?.toLowerCase().replace(/[\s_-]+/g, '') ?? type;
  if ((operation === 'filter' || operation === 'where') && !readString(step.where ?? step.filter ?? step.rowCondition)) {
    warnings.push(issue('composite_filter_condition_missing', 'Filter transform has no row condition and will pass all rows.', path));
  }
  if ((operation === 'project' || operation === 'select' || operation === 'pickfields') && readArray(step.selectedFields ?? step.fields ?? step.columns).length === 0) {
    warnings.push(issue('composite_project_fields_missing', 'Project transform has no selected fields and will keep all fields.', path));
  }
}

function validateCompositeFragment(
  fragment: Record<string, unknown>,
  path: string,
  errors: ApiGroupValidationIssue[]
): void {
  const sql = readString(fragment.sql ?? fragment.query ?? fragment.clause ?? fragment.fragment);
  if (!sql) return;
  const error = validateApiWorkflowReadOnlySql(sql, { allowFragment: true });
  if (error) errors.push(issue('read_only_sql_fragment', error, `${path}.sql`));
}

function warnUnknownResponseContract(endpoint: ApiEndpointRecord, path: string, warnings: ApiGroupValidationIssue[]): void {
  const contract = readString(endpoint.responseContract.type ?? endpoint.responseContract.name ?? endpoint.responseContract.mode);
  if (contract && !['legacy-response', 'legacy-report', 'default', 'rows'].includes(contract.toLowerCase())) {
    warnings.push(issue('unknown_response_contract', `Response contract ${contract} is not recognized by the built-in validators.`, `${path}.responseContract`));
  }
}

function readCompositeWorkflowConfig(source: DataSourceRecord, table: TableDefinition): Record<string, unknown> | null {
  const settings = readRecord(table.settings);
  const api = readRecord(settings.api ?? settings.request);
  const raw = readRecord(settings.composite ?? settings.workflow ?? settings.dataWorkflow
    ?? api.composite ?? api.workflow ?? api.dataWorkflow
    ?? source.config.composite ?? source.config.workflow ?? source.config.dataWorkflow);
  return Object.keys(raw).length === 0 || raw.enabled === false || raw.disabled === true ? null : raw;
}

function issue(code: string, message: string, path: string): ApiGroupValidationIssue {
  return { code, message, path };
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
