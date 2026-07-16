<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { BuilderDataField } from '../../types';
import './manual-legacy-dialogs.css';

type CalcField = Record<string, any>;

const props = withDefaults(defineProps<{
  availableFields: BuilderDataField[];
  enableBackgroundName?: boolean;
  enableBetweenOperator?: boolean;
  enableClone?: boolean;
  enableDateGrouping?: boolean;
  enableFilterType?: boolean;
  enableFormatOption?: boolean;
  enableOverwriteFlag?: boolean;
  fieldsText: string;
  open: boolean;
  showAnalyticsTemplates?: boolean;
  showDateTemplates?: boolean;
  title?: string;
}>(), {
  enableBackgroundName: true,
  enableBetweenOperator: true,
  enableClone: true,
  enableDateGrouping: true,
  enableFilterType: true,
  enableFormatOption: true,
  enableOverwriteFlag: true,
  showAnalyticsTemplates: true,
  showDateTemplates: true,
  title: 'Manage Calculated Fields'
});

const emit = defineEmits<{
  apply: [];
  'update:fieldsText': [value: string];
  'update:open': [value: boolean];
}>();

const dialogEl = ref<HTMLElement | null>(null);
const fields = ref<CalcField[]>([]);
const expanded = ref<Record<number, boolean>>({});
const parseError = ref('');
const templateMenuOpen = ref(false);
const dateTemplateMenuOpen = ref(false);

onMounted(() => { dialogEl.value?.focus(); });

const fieldOptions = computed(() => props.availableFields.map(field => ({
  label: field.label ?? field.description ?? field.name,
  value: field.name
})));

const analyticsOptions = [
  ['percent_of_total', 'Percent of Total'],
  ['percent_of_column', 'Percent of Column'],
  ['percent_of_previous_row', 'Percent of Previous Row'],
  ['percent_change_from_previous_row', 'Percent Change from Previous Row'],
  ['percent_of_max', 'Percent of Maximum'],
  ['running_total', 'Running Total'],
  ['running_column_total', 'Running Column Total'],
  ['running_average', 'Running Average'],
  ['rank_of_column', 'Rank of Column'],
  ['difference_from_previous_row', 'Difference from Previous Row'],
  ['year_over_year', 'Year-over-Year Growth'],
  ['moving_average', 'Moving Average'],
  ['percent_change', 'Percent Change'],
  ['rank', 'Rank'],
  ['lag', 'Previous Value (Lag)'],
  ['lead', 'Next Value (Lead)']
] as const;

const dateGroupingOptions = [
  ['timeOfDay', 'Time of Day'],
  ['mealPeriod', 'Meal Period'],
  ['dayOfWeek', 'Day of Week'],
  ['weekdayWeekend', 'Weekday/Weekend'],
  ['dayOfWeekNumber', 'Day of Week Number'],
  ['month', 'Month Name'],
  ['custom', 'Custom Buckets']
] as const;

const dateTimeFormatOptions = [
  ['time_bucket_15m_with_date', '15-min Split (Date + Time)'],
  ['time_bucket_15m_time', '15-min Split (Time Only)'],
  ['time_bucket_30m_with_date', '30-min Split (Date + Time)'],
  ['time_bucket_30m_time', '30-min Split (Time Only)'],
  ['time_bucket_1h_with_date', '1-hour Split (Date + Time)'],
  ['time_bucket_1h_time', '1-hour Split (Time Only)'],
  ['HH:MM', 'HH:MM'],
  ['HH:MM:SS', 'HH:MM:SS'],
  ['hh:MM AM/PM', 'hh:MM AM/PM'],
  ['YYYY-MM-DD HH:00', 'YYYY-MM-DD HH:00 (Date + Hour)'],
  ['YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DD HH:mm:ss'],
  ['YYYY-MM-DD', 'YYYY-MM-DD'],
  ['MM/DD/YYYY', 'MM/DD/YYYY'],
  ['DD/MM/YYYY', 'DD/MM/YYYY'],
  ['MMMM DD, YYYY', 'MMMM DD, YYYY'],
  ['MMM DD', 'MMM DD'],
  ['Day of Week', 'Day of Week'],
  ['Month Name', 'Month Name'],
  ['Quarter', 'Quarter'],
  ['YYYY', 'Year'],
  ['Week Number', 'Week Number'],
  ['Relative', 'Relative'],
  ['Custom', 'Custom Format']
] as const;

watch(() => [props.open, props.fieldsText] as const, () => {
  if (!props.open) return;
  parseFieldsText();
}, { immediate: true });

function parseFieldsText(): void {
  parseError.value = '';
  const trimmed = props.fieldsText.trim();
  if (!trimmed) {
    fields.value = [];
    return;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    fields.value = Array.isArray(parsed)
      ? parsed.filter((item): item is CalcField => item !== null && typeof item === 'object' && !Array.isArray(item))
      : [];
  } catch {
    parseError.value = 'Calculated fields JSON could not be parsed. Fix the JSON before editing visually.';
    fields.value = [];
  }
}

watch(fields, () => emit('update:fieldsText', serializeFields()), { deep: true });

function closeDialog(): void {
  emit('update:fieldsText', serializeFields());
  emit('apply');
  emit('update:open', false);
}

function serializeFields(): string { return fields.value.length ? JSON.stringify(fields.value, null, 2) : ''; }

function addField(type = 'conditional'): void {
  const field: CalcField = { name: '', type, defaultValue: '' };
  initializeFieldType(field, type);
  fields.value.push(field);
  expanded.value[fields.value.length - 1] = true;
}

function cloneField(index: number): void {
  const source = fields.value[index];
  if (!source) return;
  const cloned = JSON.parse(JSON.stringify(source)) as CalcField;
  cloned.name = `${String(source.name ?? 'Field')} Copy`;
  if (props.enableBackgroundName) cloned.backgroundName = backgroundName(String(cloned.name ?? ''));
  fields.value.splice(index + 1, 0, cloned);
  expanded.value[index + 1] = true;
}

function removeField(index: number): void {
  fields.value.splice(index, 1);
}

function updateFieldName(field: CalcField): void {
  const name = String(field.name ?? '').trim();
  field.name = name;
  if (props.enableBackgroundName && name) field.backgroundName = backgroundName(name);
}

function backgroundName(name: string): string {
  return name.replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '_').toLowerCase();
}

function initializeFieldType(field: CalcField, nextType = String(field.type ?? 'conditional')): void {
  for (const key of [
    'conditions', 'expression', 'template', 'caseExpression', 'sourceField', 'analyticsFunction',
    'dateField', 'valueField', 'yearOffset', 'yearType', 'fiscalStartMonth', 'filterExpression',
    'grouping', 'buckets', 'format', 'windowSize', 'timePeriod', 'offset', 'orderField',
    'rankAscending', 'measure', 'periods', 'aggregation', 'startParameter', 'endParameter'
  ]) delete field[key];
  field.type = nextType;
  if (nextType === 'conditional') field.conditions = [];
  if (nextType === 'expression') field.expression = '';
  if (nextType === 'text') field.template = '';
  if (nextType === 'case_when') field.caseExpression = '';
  if (nextType === 'analytics') {
    field.sourceField = '';
    field.analyticsFunction = 'percent_of_total';
  }
  if (nextType === 'time_filter') {
    field.dateField = '';
    field.valueField = '';
    field.yearOffset = 0;
    field.yearType = 'calendar';
  }
  if (nextType === 'parameter_period_comparison') {
    field.measure = '';
    field.aggregation = 'sum';
    field.startParameter = 'from';
    field.endParameter = 'to';
    field.periods = [
      { label: 'This Month', period: 'this_month' },
      { label: 'Last Month', period: 'last_month' }
    ];
  }
  if (nextType === 'filter') field.filterExpression = '';
  if (nextType === 'dateGrouping') {
    field.sourceField = '';
    field.grouping = 'timeOfDay';
  }
  if (nextType === 'dateTimeFormat') {
    field.sourceField = '';
    field.format = 'HH:MM';
  }
}

function addCondition(field: CalcField): void {
  const conditions = Array.isArray(field.conditions) ? field.conditions as CalcField[] : [];
  conditions.push({ field: fieldOptions.value[0]?.value ?? '', operator: '==', value: '', result: '' });
  field.conditions = conditions;
}

function removeCondition(field: CalcField, index: number): void {
  if (Array.isArray(field.conditions)) field.conditions.splice(index, 1);
}

function addTemplate(kind: string): void {
  if (kind === 'year_over_year') addField('analytics');
  else if (kind === 'time_filter' || kind === 'last_year_sales') addField('time_filter');
  else addField('analytics');
  const field = fields.value.at(-1);
  if (!field) return;
  if (kind === 'running_total') Object.assign(field, { name: 'Running Total', analyticsFunction: 'running_total' });
  if (kind === 'moving_average') Object.assign(field, { name: 'Moving Average', analyticsFunction: 'moving_average', windowSize: 7 });
  if (kind === 'percent_of_total') Object.assign(field, { name: 'Percent of Total', analyticsFunction: 'percent_of_total' });
  if (kind === 'percent_change') Object.assign(field, { name: 'Percent Change', analyticsFunction: 'percent_change' });
  if (kind === 'year_over_year') Object.assign(field, { name: 'Year over Year Growth', analyticsFunction: 'year_over_year', timePeriod: 'yearly' });
  if (kind === 'time_filter') Object.assign(field, { name: 'This Year Sales', yearOffset: 0, yearType: 'calendar' });
  if (kind === 'last_year_sales') Object.assign(field, { name: 'Last Year Sales', yearOffset: 1, yearType: 'calendar' });
  updateFieldName(field);
}

function addDateTemplate(kind: string): void {
  addField(kind === 'dateTimeFormat' ? 'dateTimeFormat' : 'dateGrouping');
  const field = fields.value.at(-1);
  if (!field) return;
  if (kind === 'dateTimeFormat') Object.assign(field, { name: 'Formatted DateTime', format: 'HH:MM' });
  else if (kind === 'timeRange') Object.assign(field, { name: 'Time Range', grouping: 'custom', buckets: [{ start: '00:00', end: '00:30', label: '12:00 AM - 12:30 AM' }] });
  else Object.assign(field, { name: String(dateGroupingOptions.find(([value]) => value === kind)?.[1] ?? 'Date Group'), grouping: kind });
  updateFieldName(field);
}

function addPeriod(field: CalcField): void {
  const periods = Array.isArray(field.periods) ? field.periods as CalcField[] : [];
  periods.push({ label: '', period: 'this_month' });
  field.periods = periods;
}

function addBucket(field: CalcField): void {
  const buckets = Array.isArray(field.buckets) ? field.buckets as CalcField[] : [];
  buckets.push({ start: '', end: '', label: '' });
  field.buckets = buckets;
}
</script>

<template>
  <div v-if="open" class="manual-modal-overlay" @click.self="closeDialog">
    <section ref="dialogEl" class="legacy-modal legacy-modal--large" role="dialog" aria-modal="true" :aria-label="title" tabindex="-1" @keydown.esc="closeDialog">
      <header class="legacy-modal-header">
        <h3>{{ title }}</h3>
        <button type="button" class="legacy-icon-btn" aria-label="Close calculated fields" @click="closeDialog">&times;</button>
      </header>

      <div class="legacy-modal-body">
        <div class="legacy-toolbar">
          <button type="button" class="legacy-btn legacy-btn--primary" @click="addField()">+ Add Field</button>
          <div v-if="showAnalyticsTemplates" class="legacy-menu">
            <button type="button" class="legacy-btn" @click="templateMenuOpen = !templateMenuOpen">Analytics Templates</button>
            <div v-if="templateMenuOpen" class="legacy-menu-list">
              <button type="button" @click="addTemplate('year_over_year'); templateMenuOpen = false">Year-over-Year Growth</button>
              <button type="button" @click="addTemplate('running_total'); templateMenuOpen = false">Running Total</button>
              <button type="button" @click="addTemplate('moving_average'); templateMenuOpen = false">Moving Average</button>
              <button type="button" @click="addTemplate('percent_of_total'); templateMenuOpen = false">Percent of Total</button>
              <button type="button" @click="addTemplate('percent_change'); templateMenuOpen = false">Percent Change</button>
              <button type="button" @click="addTemplate('time_filter'); templateMenuOpen = false">This Year Sales</button>
              <button type="button" @click="addTemplate('last_year_sales'); templateMenuOpen = false">Last Year Sales</button>
            </div>
          </div>
          <div v-if="showDateTemplates" class="legacy-menu">
            <button type="button" class="legacy-btn" @click="dateTemplateMenuOpen = !dateTemplateMenuOpen">Date Templates</button>
            <div v-if="dateTemplateMenuOpen" class="legacy-menu-list">
              <button type="button" @click="addDateTemplate('timeOfDay'); dateTemplateMenuOpen = false">Time Bracket</button>
              <button type="button" @click="addDateTemplate('timeRange'); dateTemplateMenuOpen = false">Time Range</button>
              <button type="button" @click="addDateTemplate('dateTimeFormat'); dateTemplateMenuOpen = false">DateTime Format</button>
              <button v-for="[value, label] in dateGroupingOptions" :key="value" type="button" @click="addDateTemplate(value); dateTemplateMenuOpen = false">{{ label }}</button>
            </div>
          </div>
        </div>

        <p v-if="parseError" class="legacy-error" role="alert">{{ parseError }}</p>
        <div v-if="fields.length === 0" class="legacy-empty">
          <strong>No calculated fields defined</strong>
          <span>Click "+ Add Field" to create computed fields and formulas.</span>
        </div>

        <article v-for="(field, index) in fields" :key="index" class="legacy-field-card">
          <div class="legacy-field-header">
            <button type="button" class="legacy-icon-btn" :aria-label="expanded[index] ? 'Collapse field' : 'Expand field'" @click="expanded[index] = !expanded[index]">{{ expanded[index] === false ? '+' : '-' }}</button>
            <input v-model="field.name" class="legacy-input legacy-field-name" placeholder="Field name" @blur="updateFieldName(field)" />
            <select v-model="field.type" class="legacy-select legacy-field-type" @change="initializeFieldType(field)">
              <option value="conditional">Conditional (If-Then-Else)</option>
              <option value="expression">Mathematical Expression</option>
              <option value="text">Text Template</option>
              <option value="case_when">Case/When Expression</option>
              <option value="analytics">Analytics Calculation</option>
              <option value="time_filter">Time Filter</option>
              <option value="parameter_period_comparison">Parameter Period Comparison</option>
              <option v-if="enableFilterType" value="filter">Filter</option>
              <option v-if="enableDateGrouping" value="dateGrouping">Date Grouping</option>
              <option v-if="enableDateGrouping" value="dateTimeFormat">Date/Time Format</option>
            </select>
            <button v-if="enableClone" type="button" class="legacy-icon-btn" aria-label="Clone field" @click="cloneField(index)">Copy</button>
            <button type="button" class="legacy-icon-btn legacy-danger" aria-label="Remove field" @click="removeField(index)">&times;</button>
          </div>

          <div v-show="expanded[index] !== false" class="legacy-field-body">
            <div class="legacy-grid legacy-grid--3" v-if="field.type !== 'dateTimeFormat'">
              <label>Default Value<input v-model="field.defaultValue" class="legacy-input" placeholder="Optional default" /></label>
              <label v-if="enableFormatOption">Format<select v-model="field.format" class="legacy-select"><option value="">Auto</option><option value="number">Number</option><option value="currency">Currency</option><option value="percent">Percentage</option><option value="date">Date</option><option value="text">Text</option></select></label>
              <label v-if="enableOverwriteFlag">Overwrite Existing<select v-model="field.overwrite" class="legacy-select"><option :value="false">No</option><option :value="true">Yes</option></select></label>
            </div>

            <div v-if="field.type === 'conditional'" class="legacy-subsection">
              <h4>Conditions</h4>
              <div v-for="(condition, cIndex) in (Array.isArray(field.conditions) ? field.conditions : [])" :key="cIndex" class="legacy-grid legacy-grid--4">
                <select v-model="condition.field" class="legacy-select"><option value="">Select field...</option><option v-for="opt in fieldOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option></select>
                <select v-model="condition.operator" class="legacy-select"><option value="==">=</option><option value="!=">Not equal</option><option value=">">Greater than</option><option value="<">Less than</option><option value=">=">Greater/equal</option><option value="<=">Less/equal</option><option value="contains">Contains</option><option v-if="enableBetweenOperator" value="between">Between</option></select>
                <input v-model="condition.value" class="legacy-input" placeholder="Value" />
                <div class="legacy-inline"><input v-model="condition.result" class="legacy-input" placeholder="Result" /><button type="button" class="legacy-icon-btn legacy-danger" @click="removeCondition(field, cIndex)">&times;</button></div>
              </div>
              <button type="button" class="legacy-btn" @click="addCondition(field)">+ Add Condition</button>
            </div>

            <label v-else-if="field.type === 'expression'">Expression<input v-model="field.expression" class="legacy-input" placeholder="[amount] - [cost]" /></label>
            <label v-else-if="field.type === 'text'">Text Template<input v-model="field.template" class="legacy-input" placeholder="Hello [name], sales [sales]" /></label>
            <label v-else-if="field.type === 'case_when'">Case Expression<textarea v-model="field.caseExpression" class="legacy-input legacy-textarea" rows="5" placeholder="case( when(${field} > 100, &quot;High&quot;), &quot;Low&quot; )"></textarea></label>

            <div v-else-if="field.type === 'analytics'" class="legacy-grid legacy-grid--2">
              <label>Source Field<select v-model="field.sourceField" class="legacy-select"><option value="">Select field...</option><option v-for="opt in fieldOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option></select></label>
              <label>Analytics Function<select v-model="field.analyticsFunction" class="legacy-select"><option v-for="[value, label] in analyticsOptions" :key="value" :value="value">{{ label }}</option></select></label>
              <label v-if="field.analyticsFunction === 'rank_of_column' || field.analyticsFunction === 'rank'">Rank Direction<select v-model="field.rankAscending" class="legacy-select"><option :value="false">Highest = 1</option><option :value="true">Lowest = 1</option></select></label>
              <label v-if="field.analyticsFunction === 'moving_average'">Window Size<input v-model.number="field.windowSize" type="number" min="2" max="30" class="legacy-input" /></label>
              <label v-if="field.analyticsFunction === 'year_over_year'">Date Field<select v-model="field.dateField" class="legacy-select"><option value="">Select date field...</option><option v-for="opt in fieldOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option></select></label>
              <label v-if="field.analyticsFunction === 'year_over_year'">Period<select v-model="field.timePeriod" class="legacy-select"><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option></select></label>
              <label v-if="field.analyticsFunction === 'lag' || field.analyticsFunction === 'lead'">Offset<input v-model.number="field.offset" type="number" min="1" max="12" class="legacy-input" /></label>
              <label v-if="field.analyticsFunction === 'lag' || field.analyticsFunction === 'lead'">Order By<select v-model="field.orderField" class="legacy-select"><option value="">Select field...</option><option v-for="opt in fieldOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option></select></label>
            </div>

            <div v-else-if="field.type === 'time_filter'" class="legacy-grid legacy-grid--2">
              <label>Date Field<select v-model="field.dateField" class="legacy-select"><option value="">Select date field...</option><option v-for="opt in fieldOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option></select></label>
              <label>Value Field<select v-model="field.valueField" class="legacy-select"><option value="">Select value field...</option><option v-for="opt in fieldOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option></select></label>
              <label>Year Offset<input v-model.number="field.yearOffset" type="number" class="legacy-input" /></label>
              <label>Year Type<select v-model="field.yearType" class="legacy-select"><option value="calendar">Calendar</option><option value="fiscal">Fiscal</option></select></label>
              <label v-if="field.yearType === 'fiscal'">Fiscal Start Month<input v-model.number="field.fiscalStartMonth" type="number" min="1" max="12" class="legacy-input" /></label>
            </div>

            <div v-else-if="field.type === 'parameter_period_comparison'" class="legacy-subsection">
              <div class="legacy-grid legacy-grid--2">
                <label>Measure Field<select v-model="field.measure" class="legacy-select"><option value="">Select field...</option><option v-for="opt in fieldOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option></select></label>
                <label>Aggregation<select v-model="field.aggregation" class="legacy-select"><option value="sum">Sum</option><option value="avg">Average</option><option value="count">Count</option><option value="min">Minimum</option><option value="max">Maximum</option></select></label>
                <label>Start Parameter<input v-model="field.startParameter" class="legacy-input" placeholder="from" /></label>
                <label>End Parameter<input v-model="field.endParameter" class="legacy-input" placeholder="to" /></label>
              </div>
              <div v-for="(period, pIndex) in (Array.isArray(field.periods) ? field.periods : [])" :key="pIndex" class="legacy-grid legacy-grid--2">
                <input v-model="period.label" class="legacy-input" placeholder="Label" />
                <select v-model="period.period" class="legacy-select"><option value="this_month">this_month</option><option value="last_month">last_month</option><option value="this_week">this_week</option><option value="last_week">last_week</option><option value="this_year">this_year</option><option value="last_year">last_year</option></select>
              </div>
              <button type="button" class="legacy-btn" @click="addPeriod(field)">+ Add Period</button>
            </div>

            <label v-else-if="field.type === 'filter'">Filter Expression<textarea v-model="field.filterExpression" class="legacy-input legacy-textarea" rows="4" placeholder="row => row.amount > 1000"></textarea></label>

            <div v-else-if="field.type === 'dateGrouping'" class="legacy-subsection">
              <div class="legacy-grid legacy-grid--2">
                <label>Source Field<select v-model="field.sourceField" class="legacy-select"><option value="">Select field...</option><option v-for="opt in fieldOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option></select></label>
                <label>Grouping<select v-model="field.grouping" class="legacy-select"><option v-for="[value, label] in dateGroupingOptions" :key="value" :value="value">{{ label }}</option></select></label>
              </div>
              <div v-if="field.grouping === 'custom'" class="legacy-subsection">
                <div v-for="(bucket, bIndex) in (Array.isArray(field.buckets) ? field.buckets : [])" :key="bIndex" class="legacy-grid legacy-grid--3">
                  <input v-model="bucket.start" class="legacy-input" placeholder="Start (HH:MM)" />
                  <input v-model="bucket.end" class="legacy-input" placeholder="End (HH:MM)" />
                  <input v-model="bucket.label" class="legacy-input" placeholder="Label" />
                </div>
                <button type="button" class="legacy-btn" @click="addBucket(field)">+ Add Bucket</button>
              </div>
            </div>

            <div v-else-if="field.type === 'dateTimeFormat'" class="legacy-grid legacy-grid--2">
              <label>Source Field<select v-model="field.sourceField" class="legacy-select"><option value="">Select field...</option><option v-for="opt in fieldOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option></select></label>
              <label>Format<select v-model="field.format" class="legacy-select"><option v-for="[value, label] in dateTimeFormatOptions" :key="value" :value="value">{{ label }}</option></select></label>
            </div>
          </div>
        </article>
      </div>

      <footer class="legacy-modal-footer">
        <button type="button" class="legacy-btn" @click="closeDialog">Close</button>
      </footer>
    </section>
  </div>
</template>
