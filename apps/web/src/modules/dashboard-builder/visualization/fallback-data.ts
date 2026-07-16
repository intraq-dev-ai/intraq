import type { VisualizationData, VisualizationSpec } from '../types';
import { measureEncodings } from './spec';

export function fallbackVisualizationData(spec: VisualizationSpec): VisualizationData {
  if (spec.kind === 'bar' || spec.kind === 'line' || spec.kind === 'pie') {
    return {
      labels: ['', '', '', '', ''],
      datasets: [{
        label: '',
        data: [8, 10, 9, 11, 10],
        placeholder: true
      }]
    };
  }

  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const metric = measureEncodings(spec)[0]?.field;
  if (!metric) return unconfiguredComponentHusk(spec);
  return {
    labels,
    datasets: [{
      label: metric,
      data: [42, 58, 51, 73, 65]
    }]
  };
}

function unconfiguredComponentHusk(spec: VisualizationSpec): VisualizationData {
  if (spec.kind === 'card') {
    return {
      labels: [''],
      datasets: [{ label: '', data: [0], placeholder: true }]
    };
  }
  if (spec.kind === 'table') {
    return {
      labels: ['', '', '', ''],
      datasets: [{ label: '', data: [0, 0, 0, 0], placeholder: true }]
    };
  }
  if (spec.kind === 'matrix') {
    return {
      labels: ['', '', ''],
      datasets: [{ label: '', data: [0, 0, 0], placeholder: true }]
    };
  }
  return { labels: [], datasets: [] };
}
