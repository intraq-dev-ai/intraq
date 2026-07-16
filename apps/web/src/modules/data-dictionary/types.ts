export interface DataDictionaryField {
  name: string;
  type: string;
  description: string;
  dictionaryDescription: string;
}

export interface DataDictionaryTable {
  id: string;
  name: string;
  description: string;
  fields: DataDictionaryField[];
  isSelected: boolean;
  isDataModel: boolean;
  businessName?: string;
  dictionaryDescription?: string;
}

export interface DataDictionarySource {
  id: string;
  name: string;
  isSample: boolean;
  type?: string;
  status?: string;
  dictionarySummary?: string;
  tables: DataDictionaryTable[];
}

export interface TableDictionaryDetails {
  tableId: string;
  tableName: string;
  businessName: string;
  description: string;
  fields: DataDictionaryField[];
}
