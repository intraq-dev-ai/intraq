import type {
  DashboardCategory,
  DashboardCategoryForm,
  DashboardCategoryMetrics
} from './types';

export function emptyCategoryForm(): DashboardCategoryForm {
  return {
    color: '#3b82f6',
    description: '',
    icon: 'LayoutDashboard',
    isActive: true,
    name: '',
    sortOrder: 0
  };
}

export function categoryToForm(category: DashboardCategory): DashboardCategoryForm {
  return {
    color: category.color,
    description: category.description,
    icon: category.icon,
    isActive: category.isActive,
    name: category.name,
    sortOrder: category.sortOrder
  };
}

export function filterCategories(categories: DashboardCategory[], query: string): DashboardCategory[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return categories;
  return categories.filter(category => categorySearchText(category).includes(normalized));
}

export function categoryMetrics(categories: DashboardCategory[]): DashboardCategoryMetrics {
  return {
    activeCategories: categories.filter(category => category.isActive).length,
    assignedDashboards: categories.reduce((total, category) => total + category.dashboards.length, 0),
    inactiveCategories: categories.filter(category => !category.isActive).length,
    totalCategories: categories.length
  };
}

export function categoryStatusLabel(category: DashboardCategory): string {
  return category.isActive ? 'Active' : 'Inactive';
}

export function categoryStatusClass(category: DashboardCategory): string {
  return category.isActive ? 'active' : 'inactive';
}

export function dashboardCountLabel(category: DashboardCategory): string {
  const count = category.dashboards.length;
  return `${count.toLocaleString()} ${count === 1 ? 'dashboard' : 'dashboards'}`;
}

export function hasDashboardAssignments(category: DashboardCategory): boolean {
  return category.dashboards.length > 0;
}

export function categoryIconText(category: DashboardCategory): string {
  if (!category.icon.trim()) return category.name.slice(0, 1).toUpperCase() || 'C';
  if (category.icon.length <= 3) return category.icon;
  const initials = category.icon
    .split(/(?=[A-Z])/)
    .map(part => part.slice(0, 1))
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return initials || category.name.slice(0, 1).toUpperCase() || 'C';
}

function categorySearchText(category: DashboardCategory): string {
  return [
    category.name,
    category.description,
    category.color,
    category.icon,
    categoryStatusLabel(category),
    dashboardCountLabel(category),
    String(category.sortOrder)
  ].join(' ').toLowerCase();
}
