export interface SourcePreferenceCandidate {
  id: string;
  name: string;
  isSample?: boolean;
  status?: string;
  tableCount?: number;
  tables?: readonly unknown[];
  type?: string;
}

const GENERATED_SOURCE_PATTERNS = [
  /^admin route model metadata source\b/i,
  /^admin sql editor source\b/i,
  /^analyzer\b/i,
  /^blocked model metadata source\b/i,
  /^builder demo source\b/i,
  /^dashboard builder\b/i,
  /^dashboard import source\b/i,
  /^dashboard runtime source\b/i,
  /^dashboard sidebar ai source\b/i,
  /^embedded demo source\b/i,
  /^home analyzer source\b/i,
  /^route guard model metadata source\b/i,
  /^route model metadata source\b/i,
  /^sql editor\b/i,
  /^model metadata kb source\b/i,
  /^workflow model metadata source\b/i
];

export function isPrimaryDemoSource(source: SourcePreferenceCandidate): boolean {
  const name = normalizedName(source);
  return name === 'operations demo warehouse'
    || name === 'demo warehouse'
    || name.includes('demo warehouse');
}

export function preferredSourceId<TSource extends SourcePreferenceCandidate>(
  sources: readonly TSource[],
  options: { currentSourceId?: string; requestedSourceId?: string } = {}
): string {
  const requested = findSource(sources, options.requestedSourceId);
  if (requested) return requested.id;

  const current = findSource(sources, options.currentSourceId);
  if (current) return current.id;

  return sortSourcesByPreference(sources)[0]?.id ?? '';
}

export function sortSourcesByPreference<TSource extends SourcePreferenceCandidate>(
  sources: readonly TSource[]
): TSource[] {
  return [...sources].sort((left, right) => {
    const scoreDelta = sourcePreferenceScore(right) - sourcePreferenceScore(left);
    if (scoreDelta !== 0) return scoreDelta;
    return left.name.localeCompare(right.name);
  });
}

function findSource<TSource extends SourcePreferenceCandidate>(
  sources: readonly TSource[],
  sourceId: string | undefined
): TSource | undefined {
  if (!sourceId) return undefined;
  return sources.find(source => source.id === sourceId);
}

function sourcePreferenceScore(source: SourcePreferenceCandidate): number {
  const name = normalizedName(source);
  let score = 0;

  if (isPrimaryDemoSource(source)) score += 1000;
  else if (name.includes('pos')) score += 360;
  else if (name.includes('operations demo')) score += 220;

  if (source.status === 'connected' || source.status === 'active') score += 30;
  if ((source.tableCount ?? source.tables?.length ?? 0) > 0) score += 20;
  if (source.isSample === true && !isPrimaryDemoSource(source)) score -= 80;
  if (GENERATED_SOURCE_PATTERNS.some(pattern => pattern.test(source.name))) score -= 240;

  return score;
}

function normalizedName(source: SourcePreferenceCandidate): string {
  return source.name.trim().toLowerCase().replace(/\s+/g, ' ');
}
