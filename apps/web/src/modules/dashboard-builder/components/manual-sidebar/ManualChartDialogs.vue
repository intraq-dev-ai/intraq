<script setup lang="ts">
import ManualCalculatedFieldsDialog from '../editor/ManualCalculatedFieldsDialog.vue';
import ManualChartAxesDialog from './ManualChartAxesDialog.vue';
import ManualChartCrossFilterDialog from './ManualChartCrossFilterDialog.vue';
import ManualChartDataConfigDialog from './ManualChartDataConfigDialog.vue';
import ManualChartSeriesDialog from './ManualChartSeriesDialog.vue';
import ManualChartStylingDialog from './ManualChartStylingDialog.vue';
import ManualChartXAxisDialog from './ManualChartXAxisDialog.vue';
import { useManualSidebarContext } from './manualSidebarContext';

const ctx = useManualSidebarContext();
</script>

<template>
  <!-- ================================================================
       CHART DIALOGS
  ================================================================ -->

  <ManualChartXAxisDialog />
  <ManualChartSeriesDialog />
  <ManualChartStylingDialog />
  <ManualChartDataConfigDialog />
  <ManualChartAxesDialog />
  <ManualChartCrossFilterDialog />

  <ManualCalculatedFieldsDialog
    v-model:open="ctx.showChartCalcDialog"
    v-model:fields-text="ctx.calculatedFieldsText"
    :available-fields="ctx.currentTableFields"
    :enable-format-option="true"
    :show-analytics-templates="true"
    :show-date-templates="true"
    title="Manage Calculated Fields"
    @apply="ctx.applyChartCalcDialog"
  />
</template>

<style scoped src="./manual-sidebar-controls.css"></style>
<style scoped src="./manual-sidebar-field-controls.css"></style>
<style scoped src="./manual-sidebar-dialogs.css"></style>
