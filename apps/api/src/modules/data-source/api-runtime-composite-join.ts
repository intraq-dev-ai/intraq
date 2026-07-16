import {
  type CompositeApiConfig,
  type CompositeApiJoinConditionConfig,
  type CompositeApiJoinStepConfig,
  type CompositeApiSegmentConfig,
  type CompositeApiTransformStepConfig
} from './api-runtime-types.js';
import { evaluateCompositeSegmentCondition } from './api-runtime-composite-sql.js';
import { applyValueTemplate, readPath } from './api-runtime-utils.js';

export function executeCompositeWorkflowSteps(
  config: CompositeApiConfig,
  rowsByNodeId: Map<string, Array<Record<string, unknown>>>,
  fallbackRows: Array<Record<string, unknown>>,
  templateValues: Record<string, unknown> = {}
): Array<Record<string, unknown>> {
  const stepResults = new Map(rowsByNodeId);
  for (const step of config.steps) {
    if (step.type === 'merge') {
      const inputRows = step.inputIds.flatMap(id => stepResults.get(id) ?? []);
      stepResults.set(step.id, sortCompositeRows(
        dedupeCompositeRows(inputRows, step.dedupeBy),
        step.sortBy,
        step.sortDirection
      ));
      continue;
    }
    if (step.type === 'join') {
      const leftRows = stepResults.get(step.leftNodeId ?? step.inputIds[0] ?? '') ?? [];
      const rightRows = stepResults.get(step.rightNodeId ?? step.inputIds[1] ?? '') ?? [];
      stepResults.set(step.id, joinCompositeRows(leftRows, rightRows, step));
      continue;
    }
    if (step.type === 'transform') {
      const rows = compositeTransformInputRows(step, stepResults, fallbackRows);
      stepResults.set(step.id, transformCompositeRows(rows, step, templateValues));
    }
  }
  const outputRows = config.outputNodeId ? stepResults.get(config.outputNodeId) : undefined;
  if (outputRows) return outputRows;
  const lastStep = config.steps[config.steps.length - 1];
  return lastStep ? stepResults.get(lastStep.id) ?? fallbackRows : fallbackRows;
}

function compositeTransformInputRows(
  step: CompositeApiTransformStepConfig,
  stepResults: Map<string, Array<Record<string, unknown>>>,
  fallbackRows: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  if (step.inputId) return stepResults.get(step.inputId) ?? [];
  if (step.inputIds.length > 0) return step.inputIds.flatMap(id => stepResults.get(id) ?? []);
  return fallbackRows;
}

function transformCompositeRows(
  rows: Array<Record<string, unknown>>,
  step: CompositeApiTransformStepConfig,
  templateValues: Record<string, unknown>
): Array<Record<string, unknown>> {
  if (step.condition && !evaluateCompositeSegmentCondition(step.condition, templateValues)) return rows;
  if (step.operation === 'filter') {
    return rows.filter(row => step.where ? evaluateCompositeSegmentCondition(step.where, { ...templateValues, ...row }) : true);
  }
  if (step.operation === 'project') return rows.map(row => projectCompositeRow(row, step));
  if (step.operation === 'map') return rows.map(row => mapCompositeRow(row, step, templateValues));
  if (step.operation === 'sort') return sortCompositeRows(rows, step.sortBy, step.sortDirection);
  if (step.operation === 'limit') return rows.slice(0, step.limit ?? rows.length);
  return rows;
}

function projectCompositeRow(row: Record<string, unknown>, step: CompositeApiTransformStepConfig): Record<string, unknown> {
  const fields = step.selectedFields.length > 0 ? step.selectedFields : Object.keys(row);
  return Object.fromEntries(fields.map(field => [step.fieldMap[field] ?? field, readPath(row, field)]));
}

function mapCompositeRow(
  row: Record<string, unknown>,
  step: CompositeApiTransformStepConfig,
  templateValues: Record<string, unknown>
): Record<string, unknown> {
  const output = { ...row };
  for (const [key, value] of Object.entries(step.addFields)) {
    const templated = applyValueTemplate(value, { ...templateValues, ...row });
    output[key] = templated.ok ? templated.data : null;
  }
  return output;
}

export function compositeSegmentKeys(segment: CompositeApiSegmentConfig): string[] {
  return [
    segment.id,
    segment.name,
    segment.dataSourceId,
    segment.tableName
  ].flatMap(value => value ? [value] : []);
}

function joinCompositeRows(
  leftRows: Array<Record<string, unknown>>,
  rightRows: Array<Record<string, unknown>>,
  step: CompositeApiJoinStepConfig
): Array<Record<string, unknown>> {
  if (step.joinType === 'cross') {
    return leftRows.flatMap(left => rightRows.map(right => mergeCompositeJoinRows(left, right, step)));
  }
  if (step.conditions.length === 0) return leftRows.map(row => projectCompositeJoinLeftRow(row, step));

  const rightIndex = new Map<string, Array<Record<string, unknown>>>();
  for (const right of rightRows) {
    const key = compositeJoinRightKey(right, step.conditions);
    rightIndex.set(key, [...rightIndex.get(key) ?? [], right]);
  }

  const output: Array<Record<string, unknown>> = [];
  const matchedRightRows = new Set<Record<string, unknown>>();
  for (const left of leftRows) {
    const matches = rightIndex.get(compositeJoinLeftKey(left, step.conditions)) ?? [];
    if (matches.length === 0) {
      if (step.joinType === 'left' || step.joinType === 'full') output.push(projectCompositeJoinLeftRow(left, step));
      continue;
    }
    for (const right of matches) {
      if (!compositeJoinRowsMatch(left, right, step.conditions)) continue;
      matchedRightRows.add(right);
      output.push(mergeCompositeJoinRows(left, right, step));
    }
  }
  if (step.joinType === 'right' || step.joinType === 'full') {
    for (const right of rightRows) {
      if (!matchedRightRows.has(right)) output.push(mergeCompositeJoinRows({}, right, step));
    }
  }
  return output;
}

function compositeJoinLeftKey(row: Record<string, unknown>, conditions: CompositeApiJoinConditionConfig[]): string {
  return JSON.stringify(conditions.map(condition => normalizeCompositeJoinValue(readPath(row, condition.leftField))));
}

function compositeJoinRightKey(row: Record<string, unknown>, conditions: CompositeApiJoinConditionConfig[]): string {
  return JSON.stringify(conditions.map(condition => normalizeCompositeJoinValue(readPath(row, condition.rightField))));
}

function compositeJoinRowsMatch(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  conditions: CompositeApiJoinConditionConfig[]
): boolean {
  return conditions.every(condition => {
    const leftValue = readPath(left, condition.leftField);
    const rightValue = readPath(right, condition.rightField);
    const comparison = compareCompositeValue(leftValue, rightValue);
    const operator = condition.operator.toLowerCase();
    if (operator === '!=' || operator === '<>') return normalizeCompositeJoinValue(leftValue) !== normalizeCompositeJoinValue(rightValue);
    if (operator === '>') return comparison > 0;
    if (operator === '>=') return comparison >= 0;
    if (operator === '<') return comparison < 0;
    if (operator === '<=') return comparison <= 0;
    return normalizeCompositeJoinValue(leftValue) === normalizeCompositeJoinValue(rightValue);
  });
}

function projectCompositeJoinLeftRow(row: Record<string, unknown>, step: CompositeApiJoinStepConfig): Record<string, unknown> {
  const selected = step.selectedLeftFields.length > 0
    ? Object.fromEntries(step.selectedLeftFields.map(field => [field, readPath(row, field)]))
    : row;
  return step.leftPrefix ? prefixCompositeFields(selected, step.leftPrefix) : { ...selected };
}

function mergeCompositeJoinRows(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  step: CompositeApiJoinStepConfig
): Record<string, unknown> {
  const output = projectCompositeJoinLeftRow(left, step);
  const rightColumns = step.rightFields.length > 0
    ? Object.fromEntries(step.rightFields.map(field => [field, readPath(right, field)]))
    : right;
  for (const [sourceKey, value] of Object.entries(rightColumns)) {
    const mappedKey = step.rightFieldMap[sourceKey] ?? sourceKey;
    const key = step.rightPrefix
      ? `${step.rightPrefix}${mappedKey}`
      : output[mappedKey] === undefined
        ? mappedKey
        : `right.${mappedKey}`;
    output[key] = value;
  }
  return output;
}

function prefixCompositeFields(row: Record<string, unknown>, prefix: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [`${prefix}${key}`, value]));
}

function normalizeCompositeJoinValue(value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const number = Number(trimmed);
    return Number.isFinite(number) && trimmed !== '' ? number : trimmed.toLowerCase();
  }
  return value ?? null;
}

export function dedupeCompositeRows(rows: Array<Record<string, unknown>>, dedupeBy: string[]): Array<Record<string, unknown>> {
  if (dedupeBy.length === 0) return rows;
  const seen = new Set<string>();
  const output: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const key = JSON.stringify(dedupeBy.map(field => row[field] ?? null));
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(row);
  }
  return output;
}

export function sortCompositeRows(
  rows: Array<Record<string, unknown>>,
  sortBy: string | undefined,
  direction: 'asc' | 'desc'
): Array<Record<string, unknown>> {
  if (!sortBy) return rows;
  const multiplier = direction === 'desc' ? -1 : 1;
  return [...rows].sort((left, right) => compareCompositeValue(left[sortBy], right[sortBy]) * multiplier);
}

function compareCompositeValue(left: unknown, right: unknown): number {
  const leftTime = typeof left === 'string' ? Date.parse(left) : NaN;
  const rightTime = typeof right === 'string' ? Date.parse(right) : NaN;
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) return leftTime - rightTime;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left ?? '').localeCompare(String(right ?? ''), undefined, { numeric: true });
}
