export type AdminDictionaryReadinessFilter = 'all' | 'configured' | 'missing';

export interface AdminDictionaryField {
  description: string;
  dictionaryDescription: string;
  label?: string;
  name: string;
  type: string;
}

export interface AdminDictionaryTable {
  businessName?: string;
  category?: string;
  description: string;
  dictionaryDescription?: string;
  fields: AdminDictionaryField[];
  id: string;
  isDataModel: boolean;
  isSelected: boolean;
  issues?: string[];
  lastUpdated?: string;
  name: string;
  recordCount?: number;
}

export interface AdminDictionarySource {
  description: string;
  dictionary: Record<string, unknown>;
  id: string;
  name: string;
  status: string;
  tableCount: number;
  tables: AdminDictionaryTable[];
  type: string;
}

export interface AdminDictionaryTableDetails {
  businessName: string;
  description: string;
  fields: AdminDictionaryField[];
  tableId: string;
  tableName: string;
}

export interface AdminDictionaryMetadataSummary {
  dataSourceId: string;
  dataSourceName: string;
  documentedFields: number;
  fieldCount: number;
  readyTables: number;
  overallCoverage: number;
  recommendations: string[];
  status: string;
  tableCount: number;
  valueAliasCount: number;
}

export interface AdminDictionaryMetric {
  detail: string;
  label: string;
  value: string;
}
