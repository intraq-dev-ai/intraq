export type DashboardCategoryDialogName = '' | 'create' | 'delete' | 'edit';

export interface DashboardCategoryDashboard {
  id: string;
  name: string;
  status: string;
  category: string;
}

export interface DashboardCategory {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  sortOrder: number;
  isActive: boolean;
  dashboards: DashboardCategoryDashboard[];
  createdAt: string;
  updatedAt: string;
}

export interface DashboardCategoryForm {
  name: string;
  description: string;
  color: string;
  icon: string;
  sortOrder: number;
  isActive: boolean;
}

export interface DashboardCategoryMetrics {
  activeCategories: number;
  assignedDashboards: number;
  inactiveCategories: number;
  totalCategories: number;
}
