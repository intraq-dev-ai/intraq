export interface AdminDataSourceTypeOption {
  label: string;
  value: string;
}

export const ADMIN_DATA_SOURCE_TYPE_OPTIONS: AdminDataSourceTypeOption[] = [
  { label: 'Sample', value: 'sample' },
  { label: 'PostgreSQL', value: 'postgres' },
  { label: 'MySQL', value: 'mysql' },
  { label: 'SQL Server', value: 'sqlserver' },
  { label: 'Databricks', value: 'databricks' },
  { label: 'ClickHouse', value: 'clickhouse' },
  { label: 'MongoDB', value: 'mongodb' },
  { label: 'Amazon S3', value: 's3' },
  { label: 'REST API', value: 'api' },
  { label: 'File Upload', value: 'file' },
  { label: 'BigQuery', value: 'bigquery' },
  { label: 'Snowflake', value: 'snowflake' }
];
