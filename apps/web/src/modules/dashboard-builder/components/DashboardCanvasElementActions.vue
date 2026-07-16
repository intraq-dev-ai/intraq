<script setup lang="ts">
import type { DashboardElement } from '../types';
import type { DashboardCanvasIndicatorSummary, DashboardCanvasInfoTab } from './canvas/dashboard-canvas-indicators';
import type { ComponentRunState } from './dashboard-canvas-types';

defineProps<{
  canDownloadElement: (element: DashboardElement) => boolean;
  canEditDashboard: boolean;
  canExpandElement: (element: DashboardElement) => boolean;
  canViewElementData: (element: DashboardElement) => boolean;
  editActionLabel: (element: DashboardElement) => string;
  editActionTitle: (element: DashboardElement) => string;
  element: DashboardElement;
  fieldsActionName: (element: DashboardElement) => string;
  fieldsActionTitle: (element: DashboardElement) => string;
  indicatorSummary: (element: DashboardElement) => DashboardCanvasIndicatorSummary;
  isFocusedElement: (element: DashboardElement) => boolean;
  runLabel: (element: DashboardElement) => string;
  runState: (elementId: string) => ComponentRunState;
  settingsMenuStyle: (elementId: string) => Record<string, string>;
  showComponentActions: (element: DashboardElement) => boolean;
  showFieldsAction: (element: DashboardElement) => boolean;
  showInlineComponentIndicators: (element: DashboardElement) => boolean;
  showRunAction: (element: DashboardElement) => boolean;
  useCompactComponentActions: (element: DashboardElement) => boolean;
}>();

const emit = defineEmits<{
  clone: [elementId: string];
  editFromMenu: [elementId: string];
  expand: [element: DashboardElement];
  openDownload: [element: DashboardElement];
  openInfo: [element: DashboardElement, tab: DashboardCanvasInfoTab];
  openInfoFromMenu: [element: DashboardElement, tab: DashboardCanvasInfoTab];
  openViewData: [element: DashboardElement];
  removeFromMenu: [elementId: string];
  setSettingsButtonRef: [elementId: string, element: unknown];
  setSettingsMenuRef: [elementId: string, element: unknown];
  toggleEdit: [element: DashboardElement];
  toggleRun: [elementId: string];
  toggleSettings: [elementId: string];
}>();
</script>

<template>
  <div
    v-if="showComponentActions(element)"
    class="card-wrapper-actions"
    :class="{ 'card-wrapper-actions--view': !canEditDashboard }"
    aria-label="Component actions"
  >
    <template v-if="canEditDashboard">
      <div v-if="showInlineComponentIndicators(element)" class="card-secondary-actions">
        <button
          v-if="indicatorSummary(element).filterCount > 0"
          class="wrapper-action-btn static-filter-indicator-btn"
          type="button"
          :aria-label="`${indicatorSummary(element).filterCount} filters applied to ${element.name}`"
          :title="`${indicatorSummary(element).filterCount} filter(s)`"
          @click="emit('openInfo', element, 'filters')"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h18l-7 8v6l-4 2v-8L3 4z" />
          </svg>
          <span class="static-filter-count">{{ indicatorSummary(element).filterCount }}</span>
        </button>
        <button
          v-if="showFieldsAction(element)"
          class="wrapper-action-btn table-fields-indicator-btn"
          type="button"
          :aria-label="`${indicatorSummary(element).fields.length} ${fieldsActionName(element)} configured for ${element.name}`"
          :title="fieldsActionTitle(element)"
          @click="emit('openInfo', element, 'fields')"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7h18M3 12h18M3 17h18" />
          </svg>
          <span class="static-filter-count">{{ indicatorSummary(element).fields.length }}</span>
        </button>
        <button
          v-if="indicatorSummary(element).conditionalFormattingCount > 0"
          class="wrapper-action-btn conditional-formatting-indicator-btn"
          type="button"
          :aria-label="`${indicatorSummary(element).conditionalFormattingCount} conditional formatting rules for ${element.name}`"
          :title="`${indicatorSummary(element).conditionalFormattingCount} conditional formatting rule(s)`"
          @click="emit('openInfo', element, 'formatting')"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 17l6-6 4 4 7-7M14 4h7v7" />
          </svg>
          <span class="static-filter-count">{{ indicatorSummary(element).conditionalFormattingCount }}</span>
        </button>
        <button
          v-if="indicatorSummary(element).sortingSettingsCount > 0"
          class="wrapper-action-btn sorting-indicator-btn"
          type="button"
          :aria-label="`${indicatorSummary(element).sortingSettingsCount} sorting settings for ${element.name}`"
          :title="`${indicatorSummary(element).sortingSettingsCount} sorting setting(s)`"
          @click="emit('openInfo', element, 'sorting')"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7l4-4 4 4M16 17l-4 4-4-4M12 3v18" />
          </svg>
          <span class="static-filter-count">{{ indicatorSummary(element).sortingSettingsCount }}</span>
        </button>
        <button
          v-if="indicatorSummary(element).layoutSettingsCount > 0"
          class="wrapper-action-btn layout-indicator-btn"
          type="button"
          :aria-label="`${indicatorSummary(element).layoutSettingsCount} layout settings for ${element.name}`"
          :title="`${indicatorSummary(element).layoutSettingsCount} layout setting(s)`"
          @click="emit('openInfo', element, 'layout')"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 3h7v4h-7v-4z" />
          </svg>
          <span class="static-filter-count">{{ indicatorSummary(element).layoutSettingsCount }}</span>
        </button>
        <button
          v-if="indicatorSummary(element).additionalSettingsCount > 0"
          class="wrapper-action-btn additional-settings-indicator-btn"
          type="button"
          :aria-label="`${indicatorSummary(element).additionalSettingsCount} additional settings for ${element.name}`"
          :title="`${indicatorSummary(element).additionalSettingsCount} additional setting(s)`"
          @click="emit('openInfo', element, 'additional')"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6l4 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z" />
          </svg>
          <span class="static-filter-count">{{ indicatorSummary(element).additionalSettingsCount }}</span>
        </button>
      </div>
      <button
        v-if="showRunAction(element)"
        class="wrapper-action-btn"
        :class="{
          'run-btn': !runState(element.id).isLoading,
          'run-btn-active': runState(element.id).hasRun && !runState(element.id).isLoading,
          'run-stop-btn': runState(element.id).isLoading
        }"
        type="button"
        :aria-label="runLabel(element)"
        :title="runLabel(element)"
        @click="emit('toggleRun', element.id)"
      >
        <svg v-if="!runState(element.id).isLoading" aria-hidden="true" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0 0 10 9.87v4.263a1 1 0 0 0 1.555.832l3.197-2.132a1 1 0 0 0 0-1.664z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
        </svg>
        <svg v-else aria-hidden="true" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 9h6v6H9z" />
        </svg>
      </button>
      <button
        class="wrapper-action-btn edit-btn"
        :class="isFocusedElement(element) ? 'edit-btn--cancel' : 'edit-btn--edit'"
        type="button"
        :aria-label="editActionLabel(element)"
        :title="editActionTitle(element)"
        @click="emit('toggleEdit', element)"
      >
        <svg v-if="!isFocusedElement(element)" aria-hidden="true" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 1 1 2.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        <svg v-else aria-hidden="true" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
      <button
        v-if="showInlineComponentIndicators(element)"
        class="wrapper-action-btn"
        type="button"
        :aria-label="`Clone ${element.name}`"
        title="Clone"
        @click="emit('clone', element.id)"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 8h10v10H8zM6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      </button>
      <div class="settings-dropdown-wrapper">
        <button
          :ref="elementRef => emit('setSettingsButtonRef', element.id, elementRef)"
          class="wrapper-action-btn settings-btn"
          type="button"
          :aria-expanded="runState(element.id).menuOpen"
          aria-haspopup="menu"
          :aria-label="`Settings for ${element.name}`"
          title="Settings"
          @click="emit('toggleSettings', element.id)"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
          </svg>
        </button>
        <Teleport to="body">
          <div
            v-if="runState(element.id).menuOpen"
            :ref="elementRef => emit('setSettingsMenuRef', element.id, elementRef)"
            class="settings-dropdown"
            role="menu"
            :aria-label="`Settings menu for ${element.name}`"
            :style="settingsMenuStyle(element.id)"
          >
            <button
              v-if="useCompactComponentActions(element) && indicatorSummary(element).filterCount > 0"
              type="button"
              role="menuitem"
              class="settings-menu-item"
              @click="emit('openInfoFromMenu', element, 'filters')"
            >
              Filters ({{ indicatorSummary(element).filterCount }})
            </button>
            <button
              v-if="useCompactComponentActions(element) && showFieldsAction(element)"
              type="button"
              role="menuitem"
              class="settings-menu-item"
              @click="emit('openInfoFromMenu', element, 'fields')"
            >
              {{ fieldsActionName(element) === 'columns' ? 'Columns' : 'Fields' }} ({{ indicatorSummary(element).fields.length }})
            </button>
            <button
              v-if="useCompactComponentActions(element) && indicatorSummary(element).conditionalFormattingCount > 0"
              type="button"
              role="menuitem"
              class="settings-menu-item"
              @click="emit('openInfoFromMenu', element, 'formatting')"
            >
              Format Rules ({{ indicatorSummary(element).conditionalFormattingCount }})
            </button>
            <button
              v-if="useCompactComponentActions(element) && indicatorSummary(element).sortingSettingsCount > 0"
              type="button"
              role="menuitem"
              class="settings-menu-item"
              @click="emit('openInfoFromMenu', element, 'sorting')"
            >
              Sorting ({{ indicatorSummary(element).sortingSettingsCount }})
            </button>
            <button
              v-if="useCompactComponentActions(element) && indicatorSummary(element).layoutSettingsCount > 0"
              type="button"
              role="menuitem"
              class="settings-menu-item"
              @click="emit('openInfoFromMenu', element, 'layout')"
            >
              Layout ({{ indicatorSummary(element).layoutSettingsCount }})
            </button>
            <button
              v-if="useCompactComponentActions(element) && indicatorSummary(element).additionalSettingsCount > 0"
              type="button"
              role="menuitem"
              class="settings-menu-item"
              @click="emit('openInfoFromMenu', element, 'additional')"
            >
              More Settings ({{ indicatorSummary(element).additionalSettingsCount }})
            </button>
            <button v-if="canViewElementData(element)" type="button" role="menuitem" class="settings-menu-item" @click="emit('openViewData', element)">View Data</button>
            <button type="button" role="menuitem" class="settings-menu-item" @click="emit('clone', element.id)">Clone</button>
            <button type="button" role="menuitem" class="settings-menu-item" @click="emit('editFromMenu', element.id)">Change Type</button>
            <button type="button" role="menuitem" class="settings-menu-item delete-item" @click="emit('removeFromMenu', element.id)">Delete</button>
          </div>
        </Teleport>
      </div>
    </template>
    <template v-else>
      <button
        v-if="canDownloadElement(element)"
        class="wrapper-action-btn download-btn"
        type="button"
        :aria-label="`Download data for ${element.name}`"
        title="Download data"
        @click="emit('openDownload', element)"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v9m0 0l-4-4m4 4 4-4m3 8H5a2 2 0 0 1-2-2v-1m18 1a2 2 0 0 1-2 2" />
        </svg>
      </button>
      <button
        v-if="canExpandElement(element)"
        class="wrapper-action-btn expand-btn"
        type="button"
        :aria-label="`Expand ${element.name}`"
        title="Expand"
        @click="emit('expand', element)"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M9 9 3.8 3.8M15 9l5.2-5.2M9 15l-5.2 5.2M15 15l5.2 5.2" />
        </svg>
      </button>
    </template>
  </div>
</template>

<style scoped>
.download-btn {
  color: color-mix(in srgb, var(--color-primary) 82%, var(--text-primary));
}
</style>
