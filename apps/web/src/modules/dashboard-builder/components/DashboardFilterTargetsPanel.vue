<script setup lang="ts">
import type { BuilderDataField, DashboardElement } from '../types';
import type {
  FilterFormState,
  TargetDataSource,
  TargetScope
} from './dashboard-filter-editor-model';

defineProps<{
  autoSelectMatchingField: (targetId: string, targetType: TargetScope) => void;
  compatibleComponents: DashboardElement[];
  dashboardDataModels: TargetDataSource[];
  fieldLabel: (field: BuilderDataField) => string;
  form: FilterFormState;
  getElementDataSourceName: (element: DashboardElement) => string;
  getTargetFieldsForComponent: (componentId: string) => BuilderDataField[];
  getTargetFieldsForDataModel: (dataModelId: string) => BuilderDataField[];
}>();

const emit = defineEmits<{
  targetFieldTypeChange: [targetId: string, targetType: TargetScope];
}>();

function rangeMapping(form: FilterFormState, targetId: string): { start: string; end: string } {
  form.parameterRangeMappings[targetId] ??= { start: '', end: '' };
  return form.parameterRangeMappings[targetId];
}

function updateRangeMapping(form: FilterFormState, targetId: string, side: 'end' | 'start', event: Event): void {
  const current = rangeMapping(form, targetId);
  form.parameterRangeMappings[targetId] = { ...current, [side]: inputValue(event) };
}

function inputValue(event: Event): string {
  return event.target instanceof HTMLSelectElement ? event.target.value : '';
}
</script>

<template>
  <div class="tab-panel" aria-label="Target Components">
    <div class="form-group">
      <label class="form-label">Filter Target Type</label>
      <div class="scope-selection-inline">
        <label class="radio-item-inline"><input v-model="form.scope" type="radio" value="dataModel" class="form-radio" /> <span>Filter by Data Model</span></label>
        <label class="radio-item-inline"><input v-model="form.scope" type="radio" value="component" class="form-radio" /> <span>Filter by Component</span></label>
      </div>
      <small class="form-help">Choose whether to filter components using the same data model, or individual components.</small>
    </div>

    <div v-if="form.scope" class="targets-table-container">
      <div v-if="form.scope === 'dataModel'" class="targets-table">
        <div class="table-header">
          <div class="header-cell name-column">Data Model</div>
          <div class="header-cell type-column">Source</div>
          <div class="header-cell field-type-column">Field Type</div>
          <div class="header-cell field-column">Available Fields</div>
          <div class="header-cell action-column">Select</div>
        </div>
        <div class="table-body">
          <div v-for="dataModel in dashboardDataModels" :key="dataModel.id" class="table-row" :class="{ selected: form.selectedDataModels.includes(dataModel.id) }">
            <div class="table-cell name-column"><div class="target-info"><span class="target-name">{{ dataModel.name }}</span></div></div>
            <div class="table-cell type-column"><span class="target-type">{{ dataModel.sourceName }}</span></div>
            <div class="table-cell field-type-column">
              <select
                v-model="form.targetFieldTypes[dataModel.id]"
                class="field-dropdown"
                :disabled="!form.selectedDataModels.includes(dataModel.id)"
                @change="emit('targetFieldTypeChange', dataModel.id, 'dataModel')"
              >
                <option value="column">Column</option>
                <option value="parameter">Parameter</option>
              </select>
            </div>
            <div class="table-cell field-column">
              <div v-if="form.targetFieldTypes[dataModel.id] === 'parameter' && (form.type === 'dateRange' || form.type === 'periodFilter')" class="target-parameter-range">
                <select
                  class="field-dropdown"
                  :disabled="!form.selectedDataModels.includes(dataModel.id)"
                  :value="rangeMapping(form, dataModel.id).start"
                  aria-label="Start parameter"
                  @change="updateRangeMapping(form, dataModel.id, 'start', $event)"
                >
                  <option value="">Start parameter...</option>
                  <option v-for="field in getTargetFieldsForDataModel(dataModel.id)" :key="`start-${field.name}`" :value="field.name">{{ fieldLabel(field) }}</option>
                </select>
                <select
                  class="field-dropdown"
                  :disabled="!form.selectedDataModels.includes(dataModel.id)"
                  :value="rangeMapping(form, dataModel.id).end"
                  aria-label="End parameter"
                  @change="updateRangeMapping(form, dataModel.id, 'end', $event)"
                >
                  <option value="">End parameter...</option>
                  <option v-for="field in getTargetFieldsForDataModel(dataModel.id)" :key="`end-${field.name}`" :value="field.name">{{ fieldLabel(field) }}</option>
                </select>
              </div>
              <select v-else v-model="form.dataSourceFieldMappings[dataModel.id]" class="field-dropdown" :disabled="!form.selectedDataModels.includes(dataModel.id)">
                <option value="">Select field...</option>
                <option v-for="field in getTargetFieldsForDataModel(dataModel.id)" :key="field.name" :value="field.name">{{ fieldLabel(field) }}</option>
              </select>
            </div>
            <div class="table-cell action-column">
              <label class="checkbox-wrapper"><input v-model="form.selectedDataModels" type="checkbox" :value="dataModel.id" class="target-checkbox" :aria-label="`Select ${dataModel.name}`" @change="autoSelectMatchingField(dataModel.id, 'dataModel')" /></label>
            </div>
          </div>
        </div>
      </div>

      <div v-if="form.scope === 'component'" class="targets-table component-targets-table">
        <div class="table-header">
          <div class="header-cell name-column">Component</div>
          <div class="header-cell type-column">Type</div>
          <div class="header-cell datasource-column">Data Source</div>
          <div class="header-cell field-type-column">Field Type</div>
          <div class="header-cell field-column">Available Fields</div>
          <div class="header-cell action-column">Select</div>
        </div>
        <div class="table-body">
          <div v-for="element in compatibleComponents" :key="element.id" class="table-row" :class="{ selected: form.selectedComponents.includes(element.id) }">
            <div class="table-cell name-column"><div class="target-info"><span class="target-name">{{ element.name || 'Untitled Component' }}</span></div></div>
            <div class="table-cell type-column"><span class="target-type">{{ element.chartType || element.type }}</span></div>
            <div class="table-cell datasource-column"><span class="datasource-name">{{ getElementDataSourceName(element) }}</span></div>
            <div class="table-cell field-type-column">
              <select
                v-model="form.componentFieldTypes[element.id]"
                class="field-dropdown"
                :disabled="!form.selectedComponents.includes(element.id)"
                @change="emit('targetFieldTypeChange', element.id, 'component')"
              >
                <option value="column">Column</option>
                <option value="parameter">Parameter</option>
              </select>
            </div>
            <div class="table-cell field-column">
              <div v-if="form.componentFieldTypes[element.id] === 'parameter' && (form.type === 'dateRange' || form.type === 'periodFilter')" class="target-parameter-range">
                <select
                  class="field-dropdown"
                  :disabled="!form.selectedComponents.includes(element.id)"
                  :value="rangeMapping(form, element.id).start"
                  aria-label="Start parameter"
                  @change="updateRangeMapping(form, element.id, 'start', $event)"
                >
                  <option value="">Start parameter...</option>
                  <option v-for="field in getTargetFieldsForComponent(element.id)" :key="`start-${field.name}`" :value="field.name">{{ fieldLabel(field) }}</option>
                </select>
                <select
                  class="field-dropdown"
                  :disabled="!form.selectedComponents.includes(element.id)"
                  :value="rangeMapping(form, element.id).end"
                  aria-label="End parameter"
                  @change="updateRangeMapping(form, element.id, 'end', $event)"
                >
                  <option value="">End parameter...</option>
                  <option v-for="field in getTargetFieldsForComponent(element.id)" :key="`end-${field.name}`" :value="field.name">{{ fieldLabel(field) }}</option>
                </select>
              </div>
              <select v-else v-model="form.componentFieldMappings[element.id]" class="field-dropdown" :disabled="!form.selectedComponents.includes(element.id)">
                <option value="">Select field...</option>
                <option v-for="field in getTargetFieldsForComponent(element.id)" :key="field.name" :value="field.name">{{ fieldLabel(field) }}</option>
              </select>
            </div>
            <div class="table-cell action-column">
              <label class="checkbox-wrapper"><input v-model="form.selectedComponents" type="checkbox" :value="element.id" class="target-checkbox" :aria-label="`Use ${element.name}`" @change="autoSelectMatchingField(element.id, 'component')" /><span class="checkbox-label">Use</span></label>
            </div>
          </div>
          <div v-if="compatibleComponents.length === 0" class="no-compatible-components"><p>No compatible components found for this field type.</p></div>
        </div>
      </div>
    </div>
  </div>
</template>
