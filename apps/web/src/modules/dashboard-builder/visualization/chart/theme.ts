export interface ChartVisualTheme {
  chartAreaBackgroundColor: string;
  dataLabelBackgroundColor: string;
  dataLabelBorderColor: string;
  gridColor: string;
  inverseTextColor: string;
  mutedColor: string;
  pieLabelColor: string;
  textColor: string;
  tooltipBackgroundColor: string;
  tooltipBorderColor: string;
  tooltipTextColor: string;
  uiMode?: 'dark' | 'light';
}

export const defaultChartVisualTheme: ChartVisualTheme = {
  chartAreaBackgroundColor: '#ffffff',
  dataLabelBackgroundColor: 'rgba(255, 255, 255, 0.72)',
  dataLabelBorderColor: 'rgba(148, 163, 184, 0.35)',
  gridColor: '#e2e8f0',
  inverseTextColor: '#ffffff',
  mutedColor: '#64748b',
  pieLabelColor: '#ffffff',
  textColor: '#334155',
  tooltipBackgroundColor: 'rgba(15, 23, 42, 0.94)',
  tooltipBorderColor: 'rgba(15, 23, 42, 0.12)',
  tooltipTextColor: '#f8fafc'
};

const chartThemePresets: Record<string, Partial<ChartVisualTheme>> = {
  colorful: {
    chartAreaBackgroundColor: '#fff7ed',
    dataLabelBackgroundColor: 'rgba(255, 247, 237, 0.84)',
    dataLabelBorderColor: 'rgba(249, 115, 22, 0.22)',
    gridColor: '#fed7aa',
    mutedColor: '#9a3412',
    textColor: '#7c2d12'
  },
  dark: {
    chartAreaBackgroundColor: '#0f172a',
    dataLabelBackgroundColor: 'rgba(15, 23, 42, 0.84)',
    dataLabelBorderColor: 'rgba(148, 163, 184, 0.3)',
    gridColor: '#334155',
    mutedColor: '#cbd5e1',
    pieLabelColor: '#f8fafc',
    textColor: '#f8fafc',
    tooltipBackgroundColor: '#020617',
    tooltipBorderColor: 'rgba(148, 163, 184, 0.24)',
    tooltipTextColor: '#f8fafc'
  },
  minimal: {
    chartAreaBackgroundColor: '#ffffff',
    dataLabelBackgroundColor: 'rgba(255, 255, 255, 0.92)',
    dataLabelBorderColor: 'rgba(203, 213, 225, 0.3)',
    gridColor: '#f1f5f9',
    mutedColor: '#94a3b8',
    textColor: '#475569'
  }
};

export function chartVisualTheme(theme: Partial<ChartVisualTheme> = {}, preset: string | undefined = undefined): ChartVisualTheme {
  const merged = {
    ...defaultChartVisualTheme,
    ...theme,
    ...(preset ? chartThemePresets[preset] ?? {} : {})
  };
  if (theme.uiMode === 'dark') {
    merged.textColor = theme.textColor ?? merged.textColor;
    merged.mutedColor = theme.mutedColor ?? merged.mutedColor;
    merged.pieLabelColor = theme.pieLabelColor ?? merged.pieLabelColor;
  }
  return merged;
}
