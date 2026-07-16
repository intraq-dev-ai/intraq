import type { AdminDataSourceTable } from './types';

export function readError(caught: unknown, fallback: string): string {
  return caught instanceof Error && caught.message ? caught.message : fallback;
}

export function sortTablesBySourceOrder(
  nextTables: AdminDataSourceTable[],
  sourceTables: AdminDataSourceTable[]
): AdminDataSourceTable[] {
  if (sourceTables.length === 0) return nextTables;
  const order = new Map(sourceTables.map((table, index) => [table.id, index]));
  for (const [index, table] of sourceTables.entries()) {
    if (!order.has(table.name)) order.set(table.name, index);
  }
  return [...nextTables].sort((left, right) =>
    (order.get(left.id) ?? order.get(left.name) ?? Number.MAX_SAFE_INTEGER) -
    (order.get(right.id) ?? order.get(right.name) ?? Number.MAX_SAFE_INTEGER)
  );
}
