<script setup lang="ts">
import ManualTextField from './ManualTextField.vue';
import { useManualSidebarContext } from './manualSidebarContext';
import { REPORT_TIME_ZONE_OPTIONS } from './manualTimeZoneOptions';

const ctx = useManualSidebarContext();
</script>

<template>
  <div v-if="ctx.showXAxisDialog" class="modal-overlay" @click.self="ctx.showXAxisDialog = false">
    <div class="modal-box">
      <div class="modal-header">
        <h4>Format X-Axis</h4>
        <button type="button" class="modal-close" @click="ctx.showXAxisDialog = false">&times;</button>
      </div>
      <div class="modal-body">
        <div class="dialog-field">
          <label class="editor-field-label">Format</label>
          <select v-model="ctx.chartXAxisFormat" class="editor-select">
            <option value="">Auto</option>
            <option value="date">Date</option>
            <option value="month">Month</option>
            <option value="year">Year</option>
            <option value="quarter">Quarter</option>
            <option value="number">Number</option>
          </select>
        </div>
        <div class="dialog-field">
          <label class="editor-field-label">Grouping</label>
          <select v-model="ctx.chartXAxisGrouping" class="editor-select">
            <option value="">None</option>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="quarter">Quarter</option>
            <option value="year">Year</option>
          </select>
        </div>
        <div class="dialog-field">
          <label class="editor-field-label">Sort Order</label>
          <select v-model="ctx.chartXAxisSortOrder" class="editor-select">
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>
        <div class="dialog-field">
          <label class="editor-field-label">Date Format</label>
          <input v-model="ctx.chartXAxisDateFormat" class="editor-input" placeholder="Auto" />
        </div>
        <div class="dialog-field">
          <label class="editor-field-label">Time Zone</label>
          <select v-model="ctx.chartTimeZone" class="editor-select">
            <option v-for="option in REPORT_TIME_ZONE_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </div>
        <div class="dialog-field">
          <label class="editor-field-label">Date Format Parameter</label>
          <input v-model="ctx.chartXAxisDateFormatParameter" class="editor-input" placeholder="rangeType" />
        </div>
        <div class="dialog-field">
          <label class="editor-field-label">Date Formats JSON</label>
          <textarea v-model="ctx.chartXAxisDateFormatsText" class="editor-input editor-textarea" rows="3" placeholder='{"0":"HH:mm","1":"dddd (DD/MM)","2":"D"}'></textarea>
        </div>
        <div class="dialog-field">
          <label class="editor-field-label">Midnight Date Format</label>
          <input v-model="ctx.chartXAxisDateMidnightFormat" class="editor-input" placeholder="Optional" />
        </div>
        <div class="dialog-field">
          <label class="editor-field-label">Midnight Formats JSON</label>
          <textarea v-model="ctx.chartXAxisDateMidnightFormatsText" class="editor-input editor-textarea" rows="2" placeholder='{"0":"YYYY-MM-DD HH:mm"}'></textarea>
        </div>
        <div class="dialog-field">
          <label class="editor-field-label">Label Display</label>
          <select v-model="ctx.chartXAxisLabelDisplay" class="editor-select">
            <option value="">Auto</option>
            <option value="original">Original field value</option>
            <option value="display">Display field</option>
            <option value="grouped">Grouped value</option>
          </select>
        </div>
        <div class="dialog-two-col">
          <div class="dialog-field">
            <label class="editor-field-label">Label Rotation</label>
            <select v-model="ctx.chartXAxisLabelRotation" class="editor-select">
              <option :value="null">Auto</option>
              <option :value="0">0°</option>
              <option :value="30">30°</option>
              <option :value="45">45°</option>
              <option :value="60">60°</option>
              <option :value="90">90°</option>
            </select>
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Label Alignment</label>
            <select v-model="ctx.chartXAxisLabelAlignment" class="editor-select">
              <option value="">Auto</option>
              <option value="start">Start</option>
              <option value="center">Center</option>
              <option value="end">End</option>
            </select>
          </div>
        </div>
        <div class="dialog-two-col">
          <div class="dialog-field">
            <label class="editor-field-label">Sort Field</label>
            <select v-model="ctx.chartXAxisSortField" class="editor-select">
              <option value="">Default</option>
              <option v-for="f in ctx.currentTableFields" :key="f.name" :value="f.name">{{ ctx.fieldLabel(f) }}</option>
            </select>
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Display Field</label>
            <select v-model="ctx.chartXAxisDisplayField" class="editor-select">
              <option value="">Default</option>
              <option v-for="f in ctx.currentTableFields" :key="f.name" :value="f.name">{{ ctx.fieldLabel(f) }}</option>
            </select>
          </div>
        </div>
        <div class="dialog-field">
          <label class="editor-field-label">Value Field</label>
          <select v-model="ctx.chartXAxisValueField" class="editor-select">
            <option value="">Default</option>
            <option v-for="f in ctx.currentTableFields" :key="f.name" :value="f.name">{{ ctx.fieldLabel(f) }}</option>
          </select>
        </div>
        <div class="dialog-two-col">
          <div class="dialog-field">
            <label class="editor-field-label">Week Start Day</label>
            <select v-model="ctx.chartWeekStartDay" class="editor-select">
              <option value="">Default</option>
              <option value="sunday">Sunday</option>
              <option value="monday">Monday</option>
              <option value="saturday">Saturday</option>
            </select>
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Week Numbering</label>
            <select v-model="ctx.chartWeekNumbering" class="editor-select">
              <option value="">Default</option>
              <option value="iso">ISO</option>
              <option value="us">US</option>
            </select>
          </div>
        </div>
        <div class="dialog-two-col">
          <div class="dialog-field">
            <label class="editor-field-label">Year Type</label>
            <select v-model="ctx.chartXAxisYearType" class="editor-select">
              <option value="">Calendar</option>
              <option value="calendar">Calendar</option>
              <option value="fiscal">Fiscal</option>
            </select>
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Fiscal Start Month</label>
            <input v-model.number="ctx.chartXAxisFiscalStart" type="number" min="1" max="12" class="editor-input" />
          </div>
        </div>
        <div class="dialog-two-col">
          <div class="dialog-field">
            <label class="editor-field-label">Range Size</label>
            <input v-model.number="ctx.chartRangeSize" type="number" min="1" class="editor-input" />
          </div>
          <div class="dialog-field">
            <label class="editor-field-label">Range Start</label>
            <input v-model.number="ctx.chartRangeStart" type="number" class="editor-input" />
          </div>
        </div>
        <div class="dialog-two-col">
          <div class="dialog-field">
            <ManualTextField
              v-model="ctx.chartBooleanTrueLabel"
              label="Boolean True Label"
              placeholder="True"
            />
          </div>
          <div class="dialog-field">
            <ManualTextField
              v-model="ctx.chartBooleanFalseLabel"
              label="Boolean False Label"
              placeholder="False"
            />
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="modal-cancel-btn" @click="ctx.showXAxisDialog = false; ctx.submitElement()">Close</button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./manual-sidebar-controls.css"></style>
<style scoped src="./manual-sidebar-field-controls.css"></style>
<style scoped src="./manual-sidebar-dialogs.css"></style>
