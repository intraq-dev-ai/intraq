export interface LearnCard {
  title: string;
  body?: string;
  items?: string[];
}

export interface LearnSection {
  id: string;
  title: string;
  summary: string;
  cards: LearnCard[];
}

export const learnSections: LearnSection[] = [
  {
    id: 'overview',
    title: 'Documentation & Learning Center',
    summary: 'Learn the dashboard, Analyzer, MCP, and SQL workflow.',
    cards: [
      { title: 'Dashboards', body: 'Build and publish dashboards from connected data.' },
      { title: 'Analyzer', body: 'Ask natural-language questions over your data models.' },
      { title: 'MCP', body: 'Use MCP tools to inspect and update dashboard resources.' }
    ]
  },
  {
    id: 'getting-started',
    title: 'Getting Started',
    summary: 'Get up and running with local data and dashboard AI.',
    cards: [
      {
        title: '1. Connect Your Data',
        body: 'Open Admin - Data Source Management and add a database, file, cloud storage, or custom SQL source.'
      },
      {
        title: '2. Build Your Dashboard',
        body: 'Use AI Builder with natural language or the manual builder with charts, tables, KPI cards, filters, and parameters.'
      },
      {
        title: '3. Use MCP',
        body: 'Create an MCP token and use the dashboard and Analyzer tools from your local AI client.'
      }
    ]
  },
  {
    id: 'best-practices',
    title: 'Tips & Best Practices',
    summary: 'Improve dashboard quality and AI answers.',
    cards: [
      { title: 'Data Dictionary', items: ['Add business descriptions', 'Mark useful measures and dimensions', 'Keep table names readable'] },
      { title: 'Dashboard Design', items: ['Place important KPIs at the top', 'Use consistent colors', 'Limit each view to the most important visuals'] },
      { title: 'AI Prompts', items: ['Use specific business terms', 'Include time ranges', 'Review generated SQL before publishing'] }
    ]
  }
];
