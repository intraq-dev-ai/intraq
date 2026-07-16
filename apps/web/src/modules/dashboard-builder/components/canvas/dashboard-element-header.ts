import type { DashboardElement } from '../../types';
import { isTwoRowCardConfig } from '../../card-layout-config';

export function shouldShowDashboardElementHeader(element: DashboardElement): boolean {
  if (element.type === 'filter' || element.type === 'export' || element.type === 'container' || element.type === 'filter-container' || element.type === 'text') return false;
  const config = element.config ?? {};
  if (readConfigBoolean(config.hideTitle) === true) return false;
  if (readConfigBoolean(config.showTitle) === false) return false;
  if (element.type !== 'card') return true;

  const explicitWrapperTitle = readConfigBoolean(config.showWrapperTitle);
  if (explicitWrapperTitle !== null) return explicitWrapperTitle;
  return !isTwoRowCardConfig(config);
}

function readConfigBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}
