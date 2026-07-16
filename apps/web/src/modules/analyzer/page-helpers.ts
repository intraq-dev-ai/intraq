export function readRouteString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function publishAnalyzerSubtitle(sourceName: string | undefined): void {
  window.dispatchEvent(new CustomEvent('ai-analyzer-subtitle', {
    detail: sourceName ? `Querying ${sourceName}` : 'Ask a question to get insights'
  }));
}

export function titleFromQuestion(value: string): string {
  return value.length > 70 ? `${value.slice(0, 67)}...` : value;
}

export function readError(caught: unknown, fallback: string): string {
  return caught instanceof Error && caught.message ? caught.message : fallback;
}
