import {
  parseFilterValue,
  setStringConfig
} from './dashboardElementEditorConfig';
import type { DashboardElementEditorState } from './dashboardElementEditorState';
import { clearConfigKeys } from './dashboardElementEditorUtils';

export function applyFilterConfig(config: Record<string, unknown>, state: DashboardElementEditorState): void {
  const {
    filterChrome, filterContainerId, filterDatePickerDisplayMode, filterDateRangeDisplayMode,
    filterField, filterInputType, filterOperator, filterPeriodActiveColor, filterPeriodBackgroundColor,
    filterPeriodDatePickerTheme, filterPeriodNavigationStyle, filterShowPeriodBottomDivider,
    filterTarget, filterValue
  } = state;
  const parsedValue = parseFilterValue(filterValue.value, filterOperator.value);
  setStringConfig(config, 'field', filterField.value);
  setStringConfig(config, 'xField', filterField.value);
  setStringConfig(config, 'inputType', filterInputType.value);
  setStringConfig(config, 'filterType', filterInputType.value);
  setStringConfig(config, 'operator', filterOperator.value);
  setStringConfig(config, 'targetType', filterTarget.value);
  setStringConfig(config, 'datePickerDisplayMode', filterDatePickerDisplayMode.value === 'native' ? '' : filterDatePickerDisplayMode.value);
  setStringConfig(config, 'dateRangeDisplayMode', filterDateRangeDisplayMode.value === 'button' ? '' : filterDateRangeDisplayMode.value);
  setStringConfig(config, 'periodActiveColor', filterPeriodActiveColor.value);
  setStringConfig(config, 'periodBackgroundColor', filterPeriodBackgroundColor.value);
  setStringConfig(config, 'periodDatePickerTheme', filterPeriodDatePickerTheme.value === 'default' ? '' : filterPeriodDatePickerTheme.value);
  setStringConfig(config, 'periodNavigationStyle', filterPeriodNavigationStyle.value === 'icons' ? 'icons' : '');
  setStringConfig(config, 'filterChrome', filterChrome.value === 'card' ? '' : filterChrome.value);
  setStringConfig(config, 'containerId', filterContainerId.value);
  if (filterShowPeriodBottomDivider.value === false) config.showPeriodBottomDivider = false;
  else delete config.showPeriodBottomDivider;
  if (parsedValue === undefined) {
    delete config.defaultValue;
    delete config.value;
    delete config.filterValue;
  } else {
    config.defaultValue = parsedValue;
    config.value = parsedValue;
    config.filterValue = parsedValue;
  }
}

export function applyContainerConfig(config: Record<string, unknown>, state: DashboardElementEditorState): void {
  const {
    containerBackgroundColor, containerBorderColor, containerBorderRadius, containerBorderWidth,
    containerColumns, containerGap, containerPadding, containerShowTitle
  } = state;
  clearConfigKeys(config, ['calculatedFields', 'dataModelName', 'dataSource', 'dataSourceId', 'dataSourceTableId', 'fields', 'seriesBy', 'tableName', 'valueField', 'visualization', 'xField', 'ySeries']);
  setStringConfig(config, 'backgroundColor', containerBackgroundColor.value);
  setStringConfig(config, 'background', containerBackgroundColor.value);
  setStringConfig(config, 'borderColor', containerBorderColor.value);
  setStringConfig(config, 'borderRadius', containerBorderRadius.value);
  setStringConfig(config, 'borderWidth', containerBorderWidth.value);
  setStringConfig(config, 'gap', containerGap.value);
  setStringConfig(config, 'padding', containerPadding.value);
  config.columns = Math.min(Math.max(Math.floor(containerColumns.value || 1), 1), 8);
  config.showTitle = containerShowTitle.value;
}
