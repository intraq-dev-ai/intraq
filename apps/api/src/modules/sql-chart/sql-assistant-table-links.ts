import type { DataSourceRecord } from '../data-source/foundation-store.js';

export interface LinkedTable {
  direction: 'inbound' | 'outbound';
  name: string;
  via: string;
}

export function rawTableLinkMap(source: DataSourceRecord | undefined): Map<string, LinkedTable[]> {
  const links = new Map<string, LinkedTable[]>();
  const tables = (source?.tables ?? []).filter(table => table.settings?.isDataModel !== true);
  const tableByNormalizedName = new Map(tables.map(table => [normalizeIdentifier(table.name), table]));

  for (const table of tables) {
    for (const field of table.fields) {
      const target = tableByNormalizedName.get(normalizeForeignKey(field.name));
      if (!target || target.name === table.name) continue;
      addLink(links, table.name, {
        direction: 'outbound',
        name: target.name,
        via: field.name
      });
      addLink(links, target.name, {
        direction: 'inbound',
        name: table.name,
        via: `${table.name}.${field.name}`
      });
    }
  }

  return links;
}

export function linkedTablesFor(tableName: string, links: Map<string, LinkedTable[]>, limit: number): LinkedTable[] {
  return (links.get(tableName) ?? []).slice(0, limit);
}

function addLink(links: Map<string, LinkedTable[]>, tableName: string, link: LinkedTable): void {
  const existing = links.get(tableName) ?? [];
  if (existing.some(item => item.name === link.name && item.via === link.via)) return;
  links.set(tableName, [...existing, link].sort(compareLinks));
}

function compareLinks(left: LinkedTable, right: LinkedTable): number {
  const direction = directionRank(left.direction) - directionRank(right.direction);
  return direction || left.name.localeCompare(right.name) || left.via.localeCompare(right.via);
}

function directionRank(value: LinkedTable['direction']): number {
  return value === 'inbound' ? 0 : 1;
}

function normalizeForeignKey(value: string): string {
  return normalizeIdentifier(value).replace(/id$/, '');
}

function normalizeIdentifier(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}
