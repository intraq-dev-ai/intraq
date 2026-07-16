import type { Chart, ChartConfiguration } from 'chart.js';
import type { VisualizationData, VisualizationSpec } from '../types';
import { applySortingAndTopN, normalizeData } from './chart/data';
import { tooltipLabel } from './chart/formatting';
import { readBaseOptions } from './chart/options';
import {
  buildPieLegendItems,
  pieLegendItemsForPage,
  pieShowsChartValues
} from './chart/pie-legend';
import { scalesConfig } from './chart/scales';
import { axisForDataset, buildDataset, chartBarSizing, chartJsType } from './chart/series';
import { SCROLLABLE_BAR_CATEGORY_COUNT } from './chart/viewport';
import { chartVisualTheme, type ChartVisualTheme } from './chart/theme';
import { autoAxisScaleHints, dualAxisScaleHints } from './chartjs-axis-hints';
import { formatXAxisLabels } from './chartjs-date-labels';
import { chartLayoutPadding } from './chartjs-layout';
import {
  compactPieLegendText,
  dashboardLegendLineMarkerPlugin,
  legendItemPadding,
  legendLabelColor,
  legendMarkerBoxHeight,
  legendMarkerBoxWidth,
  lineMarkerLegendLabels,
  pieLegendBounds
} from './chartjs-legend';
import {
  dashboardChartAreaBackgroundPlugin,
  dashboardDataLabelsPlugin,
  hidePlaceholderChartChrome
} from './chartjs-plugins';

export { autoAxisScaleHints, dualAxisScaleHints } from './chartjs-axis-hints';
export { autoLabelPlacementMode } from './chartjs-plugins';

interface ChartJsRenderOptions {
  pieLegendPage?: number;
}

export function toChartJsConfig(
  spec: VisualizationSpec,
  data: VisualizationData,
  themeOptions: Partial<ChartVisualTheme> = {},
  renderOptions: ChartJsRenderOptions = {}
): ChartConfiguration {
  const baseOptions = readBaseOptions(spec);
  const theme = chartVisualTheme(themeOptions, baseOptions.themePreset);
  const chartType = chartJsType(baseOptions.chartIntent);
  const visibleData = applySortingAndTopN(normalizeData(data), baseOptions);
  const isPlaceholderOnly = visibleData.datasets.length > 0
    && visibleData.datasets.every(dataset => dataset.placeholder === true);
  const isPieLike = chartType === 'pie' || chartType === 'doughnut';
  const isHorizontalBar = chartType === 'bar' && baseOptions.chartIntent === 'bar' && !hasExplicitColumnIntent(spec);
  const isStacked = baseOptions.stackBars && chartType === 'bar';
  const showPieChartLabels = isPieLike && baseOptions.showDataLabels && pieShowsChartValues(baseOptions);
  const hasY2 = baseOptions.enableY2 || visibleData.datasets.some(dataset => axisForDataset(dataset.label, baseOptions) === 'y2');
  const isScrollableBar = isHorizontalBar && visibleData.labels.length > SCROLLABLE_BAR_CATEGORY_COUNT;
  const barSizing = chartBarSizing(isHorizontalBar, isScrollableBar);
  const displayLabels = formatXAxisLabels(visibleData.labels, baseOptions, data.runtimeContext?.parameterValues);
  const useLineMarkerLegend = !isPieLike && baseOptions.legendMarkerStyle === 'line-marker';
  const usePointLegend = !isPieLike && baseOptions.legendMarkerStyle === 'point';
  const builtDatasets = visibleData.datasets.map((dataset, index) =>
    buildDataset(dataset, index, visibleData.labels, chartType, baseOptions, theme, isHorizontalBar)
  );
  const scaleHints = {
    ...dualAxisScaleHints(builtDatasets, chartType, baseOptions.mixedAxisPrimaryHeadroomRatio),
    ...autoAxisScaleHints(builtDatasets, baseOptions, chartType)
  };
  const chartConfig: ChartConfiguration = {
    type: chartType,
    data: {
      labels: displayLabels,
      datasets: builtDatasets as unknown as ChartConfiguration['data']['datasets']
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 180 },
      indexAxis: isHorizontalBar ? 'y' : 'x',
      interaction: { intersect: false, mode: isPieLike ? 'nearest' : 'index' },
      layout: { padding: chartLayoutPadding(baseOptions, isPieLike, isHorizontalBar, showPieChartLabels, displayLabels) },
      normalized: true,
      datasets: {
        bar: {
          barPercentage: barSizing.barPercentage,
          categoryPercentage: barSizing.categoryPercentage,
          ...(barSizing.barThickness === undefined ? {} : { barThickness: barSizing.barThickness }),
          ...(barSizing.maxBarThickness === undefined ? {} : { maxBarThickness: barSizing.maxBarThickness })
        }
      },
      plugins: {
        legend: {
          align: 'center',
          display: isPlaceholderOnly ? false : baseOptions.showLegend,
          position: baseOptions.legendPosition,
          ...(isPieLike ? pieLegendBounds(baseOptions) : {}),
          labels: {
            boxHeight: legendMarkerBoxHeight(baseOptions),
            boxWidth: legendMarkerBoxWidth(baseOptions),
            color: legendLabelColor(theme),
            font: { family: 'Inter, system-ui, sans-serif', size: 12, weight: baseOptions.legendMarkerStyle === 'line-marker' ? 700 : 500 },
            padding: legendItemPadding(baseOptions),
            usePointStyle: usePointLegend,
            ...(usePointLegend ? { pointStyle: 'circle' as const } : {}),
            ...(isPieLike
              ? {
                  generateLabels: (chart: Chart) => {
                    const dataset = chart.data.datasets[0];
                    if (!dataset) return [];
                    const labels = (chart.data.labels ?? []).map(label => String(label ?? ''));
                    const color = legendLabelColor(theme);
                    return pieLegendItemsForPage(
                      buildPieLegendItems(labels, dataset, spec, baseOptions).map(item => {
                        const visible = typeof chart.getDataVisibility === 'function' ? chart.getDataVisibility(item.index) : true;
                        return {
                          ...item,
                          fontColor: visible ? color : theme.mutedColor,
                          hidden: !visible,
                          text: compactPieLegendText(item.text, baseOptions),
                          textDecoration: visible ? undefined : 'line-through'
                        };
                      }),
                      baseOptions,
                      renderOptions.pieLegendPage ?? 0
                    );
                  }
                }
              : useLineMarkerLegend
                ? { generateLabels: (chart: Chart) => lineMarkerLegendLabels(chart, theme) }
                : {})
          }
        },
        title: {
          display: false,
          text: spec.title
        },
        tooltip: {
          enabled: isPlaceholderOnly ? false : baseOptions.showTooltip,
          backgroundColor: theme.tooltipBackgroundColor,
          bodyColor: theme.tooltipTextColor,
          bodyFont: { family: 'Inter, system-ui, sans-serif', size: 12, weight: 600 },
          borderColor: theme.tooltipBorderColor,
          borderWidth: 1,
          boxPadding: 5,
          caretPadding: 8,
          cornerRadius: 8,
          displayColors: true,
          padding: 10,
          titleColor: theme.tooltipTextColor,
          titleFont: { family: 'Inter, system-ui, sans-serif', size: 12, weight: 700 },
          callbacks: {
            title: items => items[0]?.label ?? '',
            label: item => tooltipLabel(item, spec, baseOptions)
          }
        },
        datalabels: {
          display: false
        }
      } as NonNullable<NonNullable<ChartConfiguration['options']>['plugins']>,
      ...(isPieLike ? {} : { scales: scalesConfig(spec, baseOptions, isStacked, hasY2, theme, isHorizontalBar, scaleHints, displayLabels) })
    }
  };

  chartConfig.plugins = [
    ...(!isPlaceholderOnly && baseOptions.showDataLabels && (!isPieLike || showPieChartLabels)
      ? [dashboardDataLabelsPlugin(displayLabels, baseOptions, spec, theme, isPieLike, isHorizontalBar)]
      : []),
    dashboardChartAreaBackgroundPlugin(theme),
    ...(useLineMarkerLegend && !isPlaceholderOnly ? [dashboardLegendLineMarkerPlugin()] : [])
  ];
  if (isPlaceholderOnly) hidePlaceholderChartChrome(chartConfig);
  return chartConfig;
}

function hasExplicitColumnIntent(spec: VisualizationSpec): boolean {
  const record = spec as VisualizationSpec & Record<string, unknown>;
  const value = typeof record.chartType === 'string' && record.chartType.trim()
    ? record.chartType
    : typeof record.type === 'string' ? record.type : '';
  return value.trim().toLowerCase() === 'column';
}
