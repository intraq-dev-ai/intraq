import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BASE_PRODUCT_TABLES } from '../../apps/api/src/modules/database/schema.js';
import { activeProductRoutes } from '../../packages/contracts/src/routes.js';
import {
  baselineDataSources,
  baselineTenants,
  baselineUsers
} from '../../packages/db/src/seed/baseline-data.js';

describe('source package', () => {
  it('ships generic sample data without non-public names', () => {
    const serialized = JSON.stringify({
      baselineDataSources,
      baselineTenants,
      baselineUsers
    }).toLowerCase();

    expect(serialized).toContain('sample sales');
    expect(serialized).toContain('sample_sales_model');
    expect(serialized).not.toContain('non-public source name');
    expect(serialized).not.toContain('private source package');
  });

  it('exposes the core product routes', () => {
    const paths = activeProductRoutes.map(route => route.path);

    expect(paths).toContain('/ai-analyzer');
    expect(paths).toContain('/dashboard/create');
    expect(paths).toContain('/sql-editor');
    expect(paths).toContain('/admin/mcp-access');
  });

  it('keeps enterprise-only table names out of the public source schema', () => {
    const productTables = BASE_PRODUCT_TABLES.map(table => table.table);
    const schema = readFileSync('packages/db/prisma/schema.prisma', 'utf8');
    const migration = readFileSync('packages/db/prisma/migrations/20260715003402_init/migration.sql', 'utf8');
    const serialized = JSON.stringify({ productTables, schema, migration }).toLowerCase();

    expect(productTables).toContain('activity_logs');
    expect(productTables).not.toContain('audit_logs');
    expect(serialized).not.toContain('model auditlog');
    expect(serialized).not.toContain('create table "audit_logs"');
    expect(serialized).not.toContain('@@map("audit_logs")');
  });
});
