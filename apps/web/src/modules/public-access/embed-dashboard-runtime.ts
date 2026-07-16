export function embedRuntimeParameterValues(
  context: Record<string, unknown> | null,
  dashboardIdValue: string
): Record<string, unknown> {
  const safeContext = embedAccessContextWithCommonAliases(context);
  return {
    ...safeContext,
    embed: {
      accessContext: safeContext,
      context: safeContext,
      dashboardId: dashboardIdValue
    }
  };
}

export function embedAccessContextWithCommonAliases(context: Record<string, unknown> | null): Record<string, unknown> {
  const safeContext = context ? { ...context } : {};
  if (safeContext.locationList === undefined) {
    if (Array.isArray(safeContext.locationIds)) safeContext.locationList = safeContext.locationIds;
    else if (safeContext.locationId !== undefined && safeContext.locationId !== null && safeContext.locationId !== '') safeContext.locationList = [safeContext.locationId];
  }
  if (safeContext.companyIds === undefined && Array.isArray(safeContext.clientIds)) safeContext.companyIds = safeContext.clientIds;
  return safeContext;
}
