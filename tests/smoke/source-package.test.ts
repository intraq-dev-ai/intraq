import { describe, expect, it } from 'vitest';
import { activeProductRoutes } from '../../packages/contracts/src/routes.js';
import {
  baselineDataSources,
  baselineTenants,
  baselineUsers
} from '../../packages/db/src/seed/baseline-data.js';

describe('source package', () => {
  it('ships generic sample data without client-specific names', () => {
    const serialized = JSON.stringify({
      baselineDataSources,
      baselineTenants,
      baselineUsers
    }).toLowerCase();

    expect(serialized).toContain('sample sales');
    expect(serialized).toContain('sample_sales_model');
    expect(serialized).not.toContain('customer-specific');
    expect(serialized).not.toContain('private deployment');
  });

  it('exposes the core product routes', () => {
    const paths = activeProductRoutes.map(route => route.path);

    expect(paths).toContain('/ai-analyzer');
    expect(paths).toContain('/dashboard/create');
    expect(paths).toContain('/sql-editor');
    expect(paths).toContain('/admin/mcp-access');
  });
});
