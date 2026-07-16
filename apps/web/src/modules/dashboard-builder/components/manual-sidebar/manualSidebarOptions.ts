export const manualComponents = [
  { type: 'chart', chartType: 'column', label: 'Column Chart', icon: 'M9 19V9m6 10V5M3 19h18' },
  { type: 'chart', chartType: 'bar', label: 'Bar Chart', icon: 'M4 19h16M7 15h13M10 11h10M13 7h7' },
  { type: 'chart', chartType: 'line', label: 'Line Chart', icon: 'M7 17l4-8 4 4 4-6M3 20h18' },
  { type: 'chart', chartType: 'pie', label: 'Pie Chart', icon: 'M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z' },
  { type: 'chart', chartType: 'doughnut', label: 'Doughnut Chart', icon: 'M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z' },
  { type: 'chart', chartType: 'area', label: 'Area Chart', icon: 'M3 17l4-8 4 4 4-6 4 4v6H3z' },
  { type: 'table', chartType: undefined, label: 'Table', icon: 'M3 10h18M3 14h18M10 4v16M4 4h16a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z' },
  { type: 'matrix', chartType: undefined, label: 'Matrix', icon: 'M4 4h4v4H4zm6 0h4v4h-4zm6 0h4v4h-4zM4 10h4v4H4zm6 0h4v4h-4zm6 0h4v4h-4zM4 16h4v4H4zm6 0h4v4h-4zm6 0h4v4h-4z' },
  { type: 'card', chartType: undefined, label: 'KPI Card', icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
  { type: 'container', chartType: undefined, label: 'Container', icon: 'M4 5h16v14H4V5zm3 4h4m2 0h4M7 13h4m2 0h4' },
  { type: 'filter', chartType: undefined, label: 'Filter', icon: 'M3 5h18l-7 8v5l-4 2v-7L3 5z' },
  { type: 'export', chartType: undefined, label: 'Export Button', icon: 'M12 5v9m0 0l-4-4m4 4 4-4M5 19h14' },
  { type: 'text', chartType: undefined, label: 'Text / Insight', icon: 'M4 6h16M4 12h10M4 18h14' }
] as const;
