<script setup lang="ts">
import DashboardFilterConfigurationPanel from './DashboardFilterConfigurationPanel.vue';
import DashboardFilterTargetsPanel from './DashboardFilterTargetsPanel.vue';
import type {
  DashboardFilterEditorEmits,
  DashboardFilterEditorProps
} from './dashboard-filter-editor-types';
import { useDashboardFilterEditor } from './useDashboardFilterEditor';

const props = defineProps<DashboardFilterEditorProps>();
const emit = defineEmits<DashboardFilterEditorEmits>();

const {
  allAvailableDataModels,
  autoSelectMatchingField,
  availableFields,
  availableTables,
  canOpenTargets,
  compatibleComponents,
  currentTab,
  dashboardDataModels,
  fieldLabel,
  form,
  getElementDataSourceName,
  getTargetFieldsForComponent,
  getTargetFieldsForDataModel,
  isEditing,
  isSelectedDataModelFromDashboard,
  modalContent,
  onFieldSelectionChange,
  onFilterTypeChange,
  onTargetFieldTypeChange,
  requiredParameterLabels,
  saveFilter,
  validationMessage
} = useDashboardFilterEditor(props, emit);
</script>

<template>
  <div class="filter-editor-modal">
    <div class="modal-backdrop" @click="emit('close')" />
    <form
      ref="modalContent"
      class="modal-content"
      role="dialog"
      aria-modal="true"
      :aria-label="isEditing ? 'Edit Filter' : 'Add Filter'"
      tabindex="-1"
      @submit.prevent="saveFilter"
      @keydown.esc="emit('close')"
    >
      <div class="modal-header">
        <h3 class="text-lg font-semibold">{{ isEditing ? 'Edit Filter' : 'Add Filter' }}</h3>
        <button type="button" class="close-btn" aria-label="Close filter editor" @click="emit('close')">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="modal-body">
        <div class="tab-navigation" role="tablist" aria-label="Filter editor steps">
          <button type="button" role="tab" :aria-selected="currentTab === 'filter'" :class="['tab-button', { active: currentTab === 'filter' }]" @click="currentTab = 'filter'">
            1. Filter Configuration
          </button>
          <button type="button" role="tab" :aria-selected="currentTab === 'targets'" :class="['tab-button', { active: currentTab === 'targets' }]" :disabled="!canOpenTargets" @click="currentTab = 'targets'">
            2. Target Components
          </button>
        </div>

        <p v-if="validationMessage" class="filter-validation-message" role="alert">{{ validationMessage }}</p>

        <div class="tab-content">
          <DashboardFilterConfigurationPanel
            v-if="currentTab === 'filter'"
            :all-available-data-models="allAvailableDataModels"
            :available-fields="availableFields"
            :available-tables="availableTables"
            :dashboard-data-models="dashboardDataModels"
            :field-label="fieldLabel"
            :form="form"
            :is-selected-data-model-from-dashboard="isSelectedDataModelFromDashboard"
            :required-parameter-labels="requiredParameterLabels"
            @field-selection-change="onFieldSelectionChange"
            @filter-type-change="onFilterTypeChange"
          />
          <DashboardFilterTargetsPanel
            v-if="currentTab === 'targets'"
            :auto-select-matching-field="autoSelectMatchingField"
            :compatible-components="compatibleComponents"
            :dashboard-data-models="dashboardDataModels"
            :field-label="fieldLabel"
            :form="form"
            :get-element-data-source-name="getElementDataSourceName"
            :get-target-fields-for-component="getTargetFieldsForComponent"
            :get-target-fields-for-data-model="getTargetFieldsForDataModel"
            @target-field-type-change="onTargetFieldTypeChange"
          />
        </div>
      </div>

      <div class="modal-footer">
        <button type="button" class="cancel-btn" @click="emit('close')">Cancel</button>
        <button type="submit" class="save-btn">Save Filter</button>
      </div>
    </form>
  </div>
</template>
