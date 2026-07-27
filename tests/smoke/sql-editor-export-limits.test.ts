import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeDataSourceSqlQuery } from '../../apps/api/src/modules/data-source/sql-query-engine.js';
import {
  executeSqlEditorQuery,
  SQL_EDITOR_EXPORT_ROW_LIMIT,
  SQL_EDITOR_PREVIEW_ROW_LIMIT
} from '../../apps/web/src/modules/sql-editor/api.js';

describe('SQL Editor row limits', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses explicit preview and export limits in SQL Editor API requests', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      return new Response(JSON.stringify({
        success: true,
        data: {
          columns: ['id'],
          rows: [{ id: 1 }],
          rowCount: 1,
          executionTime: 1,
          dataSource: { id: body.dataSourceId, name: 'Sample', type: 'sample' },
          columnTypes: [{ name: 'id', type: 'number' }],
          query: body.query,
          requestBody: body
        }
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    await executeSqlEditorQuery('source-1', 'select * from sample_sales_model', {}, {
      defaultLimit: SQL_EDITOR_PREVIEW_ROW_LIMIT,
      maxLimit: SQL_EDITOR_PREVIEW_ROW_LIMIT
    });
    await executeSqlEditorQuery('source-1', 'select * from sample_sales_model', {}, {
      defaultLimit: SQL_EDITOR_EXPORT_ROW_LIMIT,
      maxLimit: SQL_EDITOR_EXPORT_ROW_LIMIT
    });

    const previewBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? '{}')) as Record<string, unknown>;
    const exportBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body ?? '{}')) as Record<string, unknown>;

    expect(previewBody.defaultLimit).toBe(1_000);
    expect(previewBody.maxLimit).toBe(1_000);
    expect(exportBody.defaultLimit).toBe(100_000);
    expect(exportBody.maxLimit).toBe(100_000);
  });

  it('allows SQL Editor export-sized limits above the preview cap for sample data', () => {
    const rows = Array.from({ length: 1_250 }, (_value, index) => ({
      id: index + 1,
      revenue: index * 10
    }));

    const result = executeDataSourceSqlQuery({
      query: 'select * from sample_sales_model',
      tempDataSource: {
        id: 'source-1',
        name: 'Sample Sales',
        type: 'sample',
        sourceType: 'source',
        status: 'connected',
        isSample: true,
        config: {},
        settings: {},
        dictionary: {},
        tables: [{
          id: 'sample_sales_model',
          name: 'sample_sales_model',
          description: 'Sample sales model',
          fields: [
            { name: 'id', type: 'number', description: 'ID', dictionaryDescription: 'ID' },
            { name: 'revenue', type: 'number', description: 'Revenue', dictionaryDescription: 'Revenue' }
          ],
          dictionary: {},
          isSelected: true,
          sampleRows: rows
        }]
      },
      defaultLimit: 1_250,
      maxLimit: SQL_EDITOR_EXPORT_ROW_LIMIT
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rowCount).toBe(1_250);
    expect(result.data.rows).toHaveLength(1_250);
  });
});
