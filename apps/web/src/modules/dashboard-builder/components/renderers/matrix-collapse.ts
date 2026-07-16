export function visibleMatrixColumnIndexes(
  columnGroupIds: string[][],
  collapsedGroupIds: ReadonlySet<string>
): number[] {
  if (collapsedGroupIds.size === 0) return columnGroupIds.map((_, index) => index);
  const firstIndexByGroupId = buildFirstIndexByGroupId(columnGroupIds);
  return columnGroupIds.flatMap((groupIds, index) => {
    const collapsedAncestor = collapsedAncestorGroupId(groupIds, collapsedGroupIds);
    if (!collapsedAncestor) return [index];
    return firstIndexByGroupId.get(collapsedAncestor) === index ? [index] : [];
  });
}

export function collapsedAncestorGroupId(
  groupIds: string[],
  collapsedGroupIds: ReadonlySet<string>
): string | undefined {
  return groupIds.find(groupId => collapsedGroupIds.has(groupId));
}

function buildFirstIndexByGroupId(columnGroupIds: string[][]): Map<string, number> {
  const firstIndexByGroupId = new Map<string, number>();
  columnGroupIds.forEach((groupIds, index) => {
    groupIds.forEach(groupId => {
      if (!firstIndexByGroupId.has(groupId)) firstIndexByGroupId.set(groupId, index);
    });
  });
  return firstIndexByGroupId;
}
