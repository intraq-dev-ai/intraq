export type DashboardSortField =
  | 'category'
  | 'charts'
  | 'createdBy'
  | 'name'
  | 'status'
  | 'updatedAt'
  | 'views';

export type DashboardSortDirection = 'asc' | 'desc';
export type DashboardType = 'global' | 'sample' | 'tenant';
export type DashboardDialogName = '' | 'clone' | 'delete' | 'edit' | 'view' | 'visibility';

export interface DashboardCreator {
  email?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
}

export interface AdminDashboard {
  id: string;
  name: string;
  description: string;
  category: string;
  status: string;
  type: DashboardType;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  creator?: DashboardCreator;
  tenantName: string;
  views: number;
  charts: number;
  elements: unknown[];
  isGlobal: boolean;
  isGloballyVisible: boolean;
  isPublic: boolean;
  isSample: boolean;
  isShared: boolean;
  settings?: Record<string, unknown>;
}

export interface DashboardFilterState {
  category: string;
  searchQuery: string;
  status: string;
  type: string;
}

export interface DashboardStats {
  activeThisWeek: number;
  categories: number;
  sharedDashboards: number;
  totalDashboards: number;
  totalViews: number;
}

export interface DashboardEditForm {
  category: string;
  description: string;
  name: string;
  status: 'active' | 'draft';
}

export interface DashboardVisibilitySettings {
  isGloballyVisible: boolean;
}
