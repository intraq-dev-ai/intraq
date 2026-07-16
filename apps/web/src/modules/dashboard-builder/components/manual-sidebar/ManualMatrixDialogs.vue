<script setup lang="ts">
import ManualCalculatedFieldsDialog from '../editor/ManualCalculatedFieldsDialog.vue';
import ManualConditionalFormattingDialog from '../editor/ManualConditionalFormattingDialog.vue';
import ManualMatrixColumnsDialog from './ManualMatrixColumnsDialog.vue';
import ManualMatrixDesignDialog from './ManualMatrixDesignDialog.vue';
import ManualMatrixFilterSortDialog from './ManualMatrixFilterSortDialog.vue';
import ManualMatrixRowsDialog from './ManualMatrixRowsDialog.vue';
import ManualMatrixValuesDialog from './ManualMatrixValuesDialog.vue';
import { useManualSidebarContext } from './manualSidebarContext';

const ctx = useManualSidebarContext();
</script>

<template>
  <!-- ================================================================
       MATRIX DIALOGS
  ================================================================ -->

  <ManualMatrixRowsDialog />
  <ManualMatrixColumnsDialog />
  <ManualMatrixValuesDialog />
  <ManualMatrixDesignDialog />
  <ManualMatrixFilterSortDialog />

  <ManualConditionalFormattingDialog
    v-model:open="ctx.showMatrixCondFmtDialog"
    v-model:rules-text="ctx.matrixConditionalFormattingText"
    :available-fields="ctx.currentTableFields"
    :matrix-column-fields-text="ctx.matrixColumnFieldsText"
    :matrix-row-fields-text="ctx.matrixRowFieldsText"
    :matrix-value-fields-text="ctx.matrixValueFieldsText"
    mode="matrix"
    @apply="ctx.applyMatrixCondFmtDialog"
  />

  <ManualCalculatedFieldsDialog
    v-model:open="ctx.showMatrixCalcDialog"
    v-model:fields-text="ctx.calculatedFieldsText"
    :available-fields="ctx.currentTableFields"
    :enable-date-grouping="true"
    :enable-format-option="true"
    :show-analytics-templates="true"
    :show-date-templates="true"
    title="Manage Calculated Fields"
    @apply="ctx.applyMatrixCalcDialog"
  />
</template>

<style scoped src="./manual-sidebar-controls.css"></style>
<style scoped src="./manual-sidebar-field-controls.css"></style>
<style scoped src="./manual-sidebar-dialogs.css"></style>
