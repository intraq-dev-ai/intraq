<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { AdminDataSource, AdminDataSourceTable } from '../types';
import { tableDisplayName } from '../view-model';
import AdminDataSourceCompositeWorkflowInspector from './AdminDataSourceCompositeWorkflowInspector.vue';
import type { CompositeSegmentDraft, WorkflowNode } from './admin-data-source-composite-workflow-types';

const props = defineProps<{
  dataSources: AdminDataSource[];
  open: boolean;
  source: AdminDataSource | null;
  table: AdminDataSourceTable | null;
  workflowJson: string;
}>();

const emit = defineEmits<{
  close: [];
  save: [workflow: Record<string, unknown>];
}>();

const selectedNodeId = ref('trigger-runtime');
const segments = ref<CompositeSegmentDraft[]>([]);
const dedupeBy = ref('');
const sortBy = ref('');
const sortDirection = ref('asc');
const continueOnError = ref(false);
const workflowError = ref('');
const draggedSegmentId = ref('');

const selectedSegment = computed(() => segments.value.find(segment => segment.id === selectedNodeId.value) ?? null);
const workflowNodes = computed<WorkflowNode[]>(() => {
  const sourceNodes = segments.value.map((segment, index) => ({
    id: segment.id,
    label: segment.name || `Source ${index + 1}`,
    meta: segment.condition
      ? `Conditional: ${segment.condition}`
      : segment.when === 'history'
        ? 'Historical segment'
        : segment.when === 'current'
          ? 'Current segment'
          : 'Source segment',
    type: 'source' as const,
    x: 250,
    y: 54 + index * 138
  }));
  const mergeY = Math.max(72, 54 + Math.max(0, sourceNodes.length - 1) * 69);
  return [
    { id: 'trigger-runtime', label: 'Runtime Parameters', meta: 'Filters, tenant scope, date range', type: 'trigger', x: 24, y: mergeY },
    ...sourceNodes,
    { id: 'merge-output', label: 'Merge Rows', meta: 'Parallel fetch, map, dedupe, sort', type: 'merge', x: 520, y: mergeY },
    { id: 'output-table', label: 'API Data Model', meta: props.table ? tableDisplayName(props.table) : 'Selected table', type: 'output', x: 786, y: mergeY }
  ];
});
const workflowConnections = computed(() => {
  const trigger = workflowNodes.value.find(node => node.id === 'trigger-runtime');
  const merge = workflowNodes.value.find(node => node.id === 'merge-output');
  const output = workflowNodes.value.find(node => node.id === 'output-table');
  const connections: Array<{ id: string; from: WorkflowNode; to: WorkflowNode }> = [];
  if (trigger) {
    for (const segment of segments.value) {
      const sourceNode = workflowNodes.value.find(node => node.id === segment.id);
      if (sourceNode) connections.push({ id: `runtime-${segment.id}`, from: trigger, to: sourceNode });
    }
  }
  if (merge) {
    for (const segment of segments.value) {
      const sourceNode = workflowNodes.value.find(node => node.id === segment.id);
      if (sourceNode) connections.push({ id: `${segment.id}-merge`, from: sourceNode, to: merge });
    }
    if (output) connections.push({ id: 'merge-output-table', from: merge, to: output });
  }
  return connections;
});
const rawPreview = computed(() => {
  const workflow = buildWorkflow({ validateJson: false });
  return JSON.stringify(workflow.workflow, null, 2);
});

watch(
  () => [props.open, props.workflowJson, props.table?.id] as const,
  ([open]) => {
    if (!open) return;
    loadWorkflowDraft();
  },
  { immediate: true }
);

function loadWorkflowDraft(): void {
  workflowError.value = '';
  const parsed = parseWorkflowJson(props.workflowJson);
  const sourceSegments = Array.isArray(parsed.segments) ? parsed.segments.filter(isRecord) : [];
  segments.value = sourceSegments.length > 0
    ? sourceSegments.map((segment, index) => segmentFromConfig(segment, index))
    : [emptySegment(0, 'Historical source', 'history'), emptySegment(1, 'Current source', 'current')];
  sortBy.value = readString(parsed.sortBy);
  sortDirection.value = readString(parsed.sortDirection) === 'desc' ? 'desc' : 'asc';
  continueOnError.value = parsed.continueOnError === true;
  dedupeBy.value = Array.isArray(parsed.dedupeBy) ? parsed.dedupeBy.filter(isString).join(', ') : '';
  selectedNodeId.value = segments.value[0]?.id ?? 'trigger-runtime';
}

function addSegment(): void {
  const segment = emptySegment(segments.value.length, `Source ${segments.value.length + 1}`, 'always');
  segments.value = [...segments.value, segment];
  selectedNodeId.value = segment.id;
}

function duplicateSelectedSegment(): void {
  if (!selectedSegment.value) return;
  const copy = {
    ...selectedSegment.value,
    id: nextSegmentId(),
    name: `${selectedSegment.value.name || 'Source'} Copy`
  };
  segments.value = [...segments.value, copy];
  selectedNodeId.value = copy.id;
}

function removeSelectedSegment(): void {
  if (!selectedSegment.value) return;
  const segmentId = selectedSegment.value.id;
  segments.value = segments.value.filter(segment => segment.id !== segmentId);
  selectedNodeId.value = segments.value[0]?.id ?? 'merge-output';
}

function updateSelectedSegment(patch: Partial<CompositeSegmentDraft>): void {
  if (!selectedSegment.value) return;
  const segmentId = selectedSegment.value.id;
  segments.value = segments.value.map(segment => segment.id === segmentId ? { ...segment, ...patch } : segment);
  if (patch.id && selectedNodeId.value === segmentId) selectedNodeId.value = patch.id;
}

function startNodeDrag(node: WorkflowNode, event: DragEvent): void {
  if (node.type !== 'source') return;
  draggedSegmentId.value = node.id;
  event.dataTransfer?.setData('text/plain', node.id);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}

function allowNodeDrop(node: WorkflowNode, event: DragEvent): void {
  if (node.type !== 'source') return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
}

function dropOnNode(node: WorkflowNode, event: DragEvent): void {
  if (node.type !== 'source') return;
  event.preventDefault();
  const sourceId = event.dataTransfer?.getData('text/plain') || draggedSegmentId.value;
  draggedSegmentId.value = '';
  if (!sourceId || sourceId === node.id) return;
  const fromIndex = segments.value.findIndex(segment => segment.id === sourceId);
  const toIndex = segments.value.findIndex(segment => segment.id === node.id);
  if (fromIndex < 0 || toIndex < 0) return;
  const nextSegments = [...segments.value];
  const [moved] = nextSegments.splice(fromIndex, 1);
  if (!moved) return;
  nextSegments.splice(toIndex, 0, moved);
  segments.value = nextSegments;
  selectedNodeId.value = moved.id;
}

function saveWorkflow(): void {
  const result = buildWorkflow({ validateJson: true });
  if (!result.ok) {
    workflowError.value = result.error;
    return;
  }
  workflowError.value = '';
  emit('save', result.workflow);
}

function buildWorkflow(options: { validateJson: boolean }): { ok: true; workflow: Record<string, unknown> } | { ok: false; error: string; workflow: Record<string, unknown> } {
  const workflowSegments: Record<string, unknown>[] = [];
  const usedIds = new Set<string>();
  for (const [index, segment] of segments.value.entries()) {
    const segmentId = segment.id.trim();
    if (!segmentId) return { ok: false, error: `Source ${index + 1} needs a component ID.`, workflow: {} };
    if (usedIds.has(segmentId)) return { ok: false, error: `Component ID "${segmentId}" is used more than once.`, workflow: {} };
    usedIds.add(segmentId);
    const fieldMap = parseObjectText(segment.fieldMap, `Source ${index + 1} field map`, options.validateJson);
    if (!fieldMap.ok) return { ok: false, error: fieldMap.error, workflow: {} };
    const parameterValues = parseObjectText(segment.parameterValues, `Source ${index + 1} parameters`, options.validateJson);
    if (!parameterValues.ok) return { ok: false, error: parameterValues.error, workflow: {} };
    const timeout = Number.parseInt(segment.timeoutMs, 10);
    const sourceSegment = compactRecord({
      dataSourceId: segment.dataSourceId,
      fieldMap: fieldMap.value,
      id: segmentId,
      condition: segment.condition.trim() || undefined,
      name: segment.name,
      parameterValues: parameterValues.value,
      query: segment.query,
      sourceLabelField: segment.sourceLabelField,
      tableName: segment.tableName,
      timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : undefined,
      when: segment.when === 'always' ? undefined : segment.when
    });
    workflowSegments.push(sourceSegment);
  }
  const workflow = compactRecord({
    continueOnError: continueOnError.value ? true : undefined,
    dedupeBy: splitList(dedupeBy.value),
    segments: workflowSegments,
    sortBy: sortBy.value.trim() || undefined,
    sortDirection: sortDirection.value === 'desc' ? 'desc' : undefined
  });
  return { ok: true, workflow };
}

function segmentFromConfig(value: Record<string, unknown>, index: number): CompositeSegmentDraft {
  return {
    condition: readString(value.condition ?? value.if ?? value.whenExpression ?? value.expression),
    dataSourceId: readString(value.dataSourceId),
    fieldMap: jsonText(value.fieldMap),
    id: readString(value.id ?? value.nodeId ?? value.key) || `segment-${index + 1}`,
    name: readString(value.name) || `Source ${index + 1}`,
    parameterValues: jsonText(value.parameterValues),
    query: readString(value.query ?? value.sqlQuery ?? value.sql),
    sourceLabelField: readString(value.sourceLabelField),
    tableName: readString(value.tableName),
    timeoutMs: readString(value.timeoutMs),
    when: readString(value.when) || 'always'
  };
}

function emptySegment(index: number, name: string, when: string): CompositeSegmentDraft {
  return {
    condition: '',
    dataSourceId: defaultSourceId(),
    fieldMap: '',
    id: `segment-${Date.now()}-${index}`,
    name,
    parameterValues: '',
    query: '',
    sourceLabelField: '',
    tableName: '',
    timeoutMs: '',
    when
  };
}

function defaultSourceId(): string {
  return props.dataSources.find(source => source.type !== 'api')?.id ?? props.dataSources[0]?.id ?? '';
}

function nextSegmentId(): string {
  return `segment-${Date.now()}-${segments.value.length + 1}`;
}

function connectionPath(from: WorkflowNode, to: WorkflowNode): string {
  const startX = from.x + 190;
  const startY = from.y + 43;
  const endX = to.x;
  const endY = to.y + 43;
  const distance = Math.max(80, endX - startX);
  const offset = Math.min(110, distance * 0.5);
  return `M ${startX} ${startY} C ${startX + offset} ${startY}, ${endX - offset} ${endY}, ${endX} ${endY}`;
}

function parseWorkflowJson(value: string): Record<string, unknown> {
  if (!value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    workflowError.value = 'Existing workflow JSON could not be parsed.';
    return {};
  }
}

function parseObjectText(
  value: string,
  label: string,
  validate: boolean
): { ok: true; value?: Record<string, unknown> } | { ok: false; error: string } {
  if (!value.trim()) return { ok: true };
  try {
    const parsed = JSON.parse(value) as unknown;
    if (isRecord(parsed)) return { ok: true, value: parsed };
    return validate ? { ok: false, error: `${label} must be a JSON object.` } : { ok: true };
  } catch {
    return validate ? { ok: false, error: `${label} is not valid JSON.` } : { ok: true };
  }
}

function compactRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => {
      if (item === undefined || item === null || item === '') return false;
      if (Array.isArray(item)) return item.length > 0;
      if (isRecord(item)) return Object.keys(item).length > 0;
      return true;
    })
  );
}

function splitList(value: string): string[] {
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

function jsonText(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

function readString(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' ? value : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
</script>

<template>
  <div v-if="open" class="admin-modal-overlay" role="presentation" @click.self="$emit('close')">
    <section
      class="admin-modal admin-ds-composite-workflow-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-ds-composite-title"
      tabindex="-1"
      @keydown.esc="$emit('close')"
    >
      <header class="admin-modal-header">
        <div>
          <p class="admin-modal-eyebrow">API data model workflow</p>
          <h2 id="admin-ds-composite-title">{{ table ? tableDisplayName(table) : 'Composite workflow' }}</h2>
          <p class="admin-muted">
            Connect multiple data sources, fetch them in parallel, then merge the rows into this API data model.
          </p>
        </div>
        <button class="admin-icon-button" type="button" aria-label="Close workflow builder" @click="$emit('close')">x</button>
      </header>

      <div class="admin-ds-composite-workflow-body">
        <aside class="admin-ds-composite-palette" aria-label="Workflow nodes">
          <button class="admin-ds-workflow-node-picker" type="button" @click="selectedNodeId = 'trigger-runtime'">
            <strong>Runtime Parameters</strong>
            <small>Date range, location ids, embed scope, and dashboard filters.</small>
          </button>
          <button class="admin-ds-workflow-node-picker" type="button" @click="addSegment">
            <strong>Add Source Segment</strong>
            <small>SQL, Databricks, API, file, or any configured source.</small>
          </button>
          <button class="admin-ds-workflow-node-picker" type="button" @click="selectedNodeId = 'merge-output'">
            <strong>Merge Rows</strong>
            <small>Dedupe, sort, and combine parallel outputs.</small>
          </button>
          <button class="admin-ds-workflow-node-picker" type="button" @click="selectedNodeId = 'output-table'">
            <strong>API Data Model</strong>
            <small>The selected dashboard data model output.</small>
          </button>
        </aside>

        <article class="admin-ds-composite-canvas" aria-label="Workflow canvas">
          <svg class="admin-ds-composite-lines" aria-hidden="true">
            <defs>
              <marker id="admin-ds-composite-arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="var(--admin-primary)" />
              </marker>
            </defs>
            <path
              v-for="connection in workflowConnections"
              :key="connection.id"
              :d="connectionPath(connection.from, connection.to)"
              marker-end="url(#admin-ds-composite-arrow)"
            />
          </svg>
          <button
            v-for="node in workflowNodes"
            :key="node.id"
            class="admin-ds-composite-node"
            :class="[node.type, { selected: selectedNodeId === node.id, dragging: draggedSegmentId === node.id }]"
            type="button"
            :draggable="node.type === 'source'"
            :style="{ left: `${node.x}px`, top: `${node.y}px` }"
            @dragstart="startNodeDrag(node, $event)"
            @dragend="draggedSegmentId = ''"
            @dragover="allowNodeDrop(node, $event)"
            @drop="dropOnNode(node, $event)"
            @click="selectedNodeId = node.id"
          >
            <span>{{ node.type }}</span>
            <strong>{{ node.label }}</strong>
            <small>{{ node.meta }}</small>
          </button>
        </article>

        <AdminDataSourceCompositeWorkflowInspector
          v-model:continue-on-error="continueOnError"
          v-model:dedupe-by="dedupeBy"
          v-model:sort-by="sortBy"
          v-model:sort-direction="sortDirection"
          :data-sources="dataSources"
          :raw-preview="rawPreview"
          :selected-node-id="selectedNodeId"
          :selected-segment="selectedSegment"
          :segment-count="segments.length"
          :source="source"
          :table="table"
          @duplicate-segment="duplicateSelectedSegment"
          @remove-segment="removeSelectedSegment"
          @update-segment="updateSelectedSegment"
        />
      </div>

      <p v-if="workflowError" class="admin-error" role="alert">{{ workflowError }}</p>

      <footer class="admin-modal-actions">
        <button class="admin-secondary-button" type="button" @click="$emit('close')">Cancel</button>
        <button class="admin-secondary-button" type="button" @click="addSegment">Add Source Segment</button>
        <button class="admin-primary-button" type="button" @click="saveWorkflow">Save Workflow</button>
      </footer>
    </section>
  </div>
</template>
