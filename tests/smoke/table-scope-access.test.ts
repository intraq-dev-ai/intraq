import { afterEach, describe, expect, it } from 'vitest';
import {
  buildDataSource,
  dataSources,
  type DataSourceRecord
} from '../../apps/api/src/modules/data-source/foundation-store.js';
import { readDataSourceFieldOptions } from '../../apps/api/src/modules/data-source/data-source-field-options.js';
import { readDataSourceTableRows } from '../../apps/api/src/modules/data-source/source-table-rows.js';
import { getSqlEditorSchema } from '../../apps/api/src/modules/sql-chart/sql-editor-service.js';
import type { DataSourceAccessPolicy } from '../../apps/api/src/modules/data-source/source-access.js';

describe('table-scoped data source access', () => {
  afterEach(() => {
    const index = dataSources.findIndex(source => source.id === 'table-scope-source');
    if (index >= 0) dataSources.splice(index, 1);
  });

  it('filters SQL editor schema tables to allowedTableIds', () => {
    dataSources.push(tableScopedSource());

    const result = getSqlEditorSchema('table-scope-source', tableScopePolicy());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.tables.map(table => table.name)).toEqual(['allowed_table']);
  });

  it('blocks field option reads for tables outside allowedTableIds', async () => {
    dataSources.push(tableScopedSource());

    const result = await readDataSourceFieldOptions(
      'table-scope-source',
      { tableName: 'hidden_table', fieldName: 'secret', limit: 10 },
      null,
      tableScopePolicy()
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.statusCode).toBe(404);
  });

  it('blocks row reads for tables outside allowedTableIds', async () => {
    dataSources.push(tableScopedSource());

    const result = await readDataSourceTableRows('table-scope-source', 'hidden_table', {
      access: tableScopePolicy()
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.statusCode).toBe(403);
  });
});

function tableScopePolicy(): DataSourceAccessPolicy {
  return {
    allowUnscopedAccess: true,
    allowedTableIds: new Set(['allowed_table']),
    showSampleDataSources: true
  };
}

function tableScopedSource(): DataSourceRecord {
  return buildDataSource({
    id: 'table-scope-source',
    name: 'Table Scope Source',
    type: 'sample',
    sourceType: 'source',
    status: 'connected',
    isSample: true,
    isGloballyVisible: true,
    config: {},
    settings: {},
    dictionary: {},
    tables: [
      {
        id: 'allowed_table',
        name: 'allowed_table',
        fields: [{ name: 'id', type: 'number' }],
        sampleRows: [{ id: 1 }]
      },
      {
        id: 'hidden_table',
        name: 'hidden_table',
        fields: [{ name: 'secret', type: 'string' }],
        sampleRows: [{ secret: 'leaked' }]
      }
    ]
  });
}
