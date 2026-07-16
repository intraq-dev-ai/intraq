export interface DashboardDropGridRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

export interface DashboardDropGridInput {
  clientX: number;
  clientY: number;
  columns: number;
  marginY: number;
  rect: DashboardDropGridRect;
  rowHeight: number;
}

export interface DashboardDropGridPosition {
  gridX: number;
  gridY: number;
}

export function dashboardDropGridPosition(input: DashboardDropGridInput): DashboardDropGridPosition {
  const columns = Math.max(1, Math.floor(input.columns));
  const width = Math.max(1, input.rect.width);
  const rowPitch = Math.max(1, input.rowHeight + Math.max(0, input.marginY));
  const relX = clamp(input.clientX - input.rect.left, 0, Math.max(0, width - 1));
  const relY = Math.max(0, input.clientY - input.rect.top);
  return {
    gridX: clamp(Math.floor(relX / (width / columns)), 0, columns - 1),
    gridY: Math.floor(relY / rowPitch)
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
