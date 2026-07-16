<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  createDashboardCategory,
  deleteDashboardCategory,
  fetchDashboardCategories,
  updateDashboardCategory
} from './api';
import AdminDashboardCategoryDialogs from './components/AdminDashboardCategoryDialogs.vue';
import {
  categoryIconText,
  categoryStatusLabel,
  categoryToForm,
  dashboardCountLabel,
  emptyCategoryForm,
  filterCategories,
  hasDashboardAssignments
} from './helpers';
import type { DashboardCategory, DashboardCategoryDialogName, DashboardCategoryForm } from './types';
import '../admin/admin-base-product.css';
import './admin-dashboard-categories.css';

const categories = ref<DashboardCategory[]>([]);
const isLoading = ref(false);
const isSaving = ref(false);
const status = ref('Loading dashboard categories');
const error = ref('');
const searchQuery = ref('');
const activeDialog = ref<DashboardCategoryDialogName>('');
const selectedCategory = ref<DashboardCategory | null>(null);
const categoryForm = ref<DashboardCategoryForm>(emptyCategoryForm());

const filteredCategories = computed(() => filterCategories(categories.value, searchQuery.value));
const canSubmitCategory = computed(() => categoryForm.value.name.trim().length > 0);

void loadCategories();

async function loadCategories(): Promise<void> {
  isLoading.value = true;
  error.value = '';
  status.value = 'Loading dashboard categories';
  try {
    categories.value = await fetchDashboardCategories();
    status.value = `${categories.value.length} ${pluralize('category', categories.value.length)} loaded`;
  } catch (caught) {
    categories.value = [];
    error.value = readError(caught, 'Dashboard categories failed to load.');
    status.value = 'Dashboard categories failed to load';
  } finally {
    isLoading.value = false;
  }
}

function openCreateDialog(): void {
  selectedCategory.value = null;
  categoryForm.value = nextCategoryForm();
  activeDialog.value = 'create';
}

function openEditDialog(category: DashboardCategory): void {
  selectedCategory.value = category;
  categoryForm.value = categoryToForm(category);
  activeDialog.value = 'edit';
}

function openDeleteDialog(category: DashboardCategory): void {
  if (hasDashboardAssignments(category)) {
    error.value = `Cannot delete ${category.name} while it contains dashboards.`;
    status.value = 'Dashboard category delete blocked';
    return;
  }
  selectedCategory.value = category;
  activeDialog.value = 'delete';
}

function closeDialog(): void {
  activeDialog.value = '';
  selectedCategory.value = null;
  categoryForm.value = emptyCategoryForm();
}

async function submitCategory(): Promise<void> {
  if (!canSubmitCategory.value) return;
  if (activeDialog.value === 'create') {
    await runSaving('Category created', async () => {
      const created = await createDashboardCategory(categoryForm.value);
      categories.value = sortCategories([...categories.value, { ...created, dashboards: [] }]);
      closeDialog();
    });
    return;
  }

  const category = selectedCategory.value;
  if (!category) return;
  await runSaving('Category updated', async () => {
    const updated = await updateDashboardCategory(category, categoryForm.value);
    replaceCategory({ ...updated, dashboards: category.dashboards });
    closeDialog();
  });
}

async function toggleCategoryStatus(category: DashboardCategory): Promise<void> {
  const nextForm = { ...categoryToForm(category), isActive: !category.isActive };
  await runSaving(nextForm.isActive ? 'Category activated' : 'Category deactivated', async () => {
    const updated = await updateDashboardCategory(category, nextForm);
    replaceCategory({ ...updated, dashboards: category.dashboards });
  });
}

async function submitDelete(): Promise<void> {
  const category = selectedCategory.value;
  if (!category || hasDashboardAssignments(category)) return;
  await runSaving('Category deleted', async () => {
    await deleteDashboardCategory(category);
    categories.value = categories.value.filter(item => item.id !== category.id);
    closeDialog();
  });
}

async function runSaving(successMessage: string, action: () => Promise<void>): Promise<void> {
  isSaving.value = true;
  error.value = '';
  try {
    await action();
    status.value = successMessage;
  } catch (caught) {
    error.value = readError(caught, 'Dashboard category action failed.');
    status.value = 'Dashboard category action failed';
  } finally {
    isSaving.value = false;
  }
}

function replaceCategory(category: DashboardCategory): void {
  categories.value = sortCategories(categories.value.map(item => item.id === category.id ? category : item));
}

function nextCategoryForm(): DashboardCategoryForm {
  return {
    ...emptyCategoryForm(),
    sortOrder: categories.value.length ? Math.max(...categories.value.map(category => category.sortOrder)) + 1 : 0
  };
}

function deleteTitle(category: DashboardCategory): string {
  return hasDashboardAssignments(category) ? 'Cannot delete category with dashboards' : `Delete ${category.name}`;
}

function categorySwatchStyle(category: DashboardCategory): Record<string, string> {
  return { backgroundColor: category.color };
}

function sortCategories(items: DashboardCategory[]): DashboardCategory[] {
  return [...items].sort((left, right) => {
    const order = left.sortOrder - right.sortOrder;
    return order === 0 ? left.name.localeCompare(right.name) : order;
  });
}

function readError(caught: unknown, fallback: string): string {
  return caught instanceof Error && caught.message ? caught.message : fallback;
}

function pluralize(word: string, count: number): string {
  return count === 1 ? word : `${word}s`;
}
</script>

<template>
  <section class="admin-page admin-dashboard-categories-page" aria-labelledby="dashboard-categories-title">
    <header class="admin-dashboard-categories-header">
      <div>
        <h1 id="dashboard-categories-title" class="admin-page-title">Dashboard Categories</h1>
        <p class="admin-page-subtitle">Organize dashboards into categories for better navigation</p>
      </div>
      <button class="admin-dashboard-categories-create button" type="button" @click="openCreateDialog">
        <span aria-hidden="true">+</span>
        Add Category
      </button>
    </header>

    <p class="sr-only" role="status" aria-label="Dashboard Categories status" aria-live="polite">{{ status }}</p>
    <p v-if="error" class="admin-error" role="alert">{{ error }}</p>

    <article class="admin-dashboard-categories-panel">
      <section class="admin-dashboard-categories-filters" aria-label="Dashboard category filters">
        <h2>Categories</h2>
        <label>
          <span class="sr-only">Search categories</span>
          <input v-model="searchQuery" type="search" placeholder="Search categories..." aria-label="Search categories" />
        </label>
      </section>

      <div v-if="isLoading" class="admin-dashboard-categories-state">Loading categories.</div>
      <div v-else-if="filteredCategories.length === 0" class="admin-dashboard-categories-state">
        <strong>No Categories Found</strong>
        <p>{{ searchQuery ? 'No categories match your search.' : 'No categories have been created yet.' }}</p>
        <button class="button" type="button" @click="openCreateDialog">Create First Category</button>
      </div>
      <div v-else class="admin-dashboard-categories-grid" role="list" aria-label="Dashboard Categories categories">
        <article
          v-for="category in filteredCategories"
          :key="category.id"
          class="admin-dashboard-categories-card"
          :class="{ inactive: !category.isActive }"
          role="listitem"
        >
          <header class="admin-dashboard-categories-card-header">
            <div class="admin-dashboard-categories-name-cell">
              <span class="category-icon" :style="categorySwatchStyle(category)" aria-hidden="true">
                {{ categoryIconText(category) }}
              </span>
              <div>
                <h3>{{ category.name }}</h3>
                <p v-if="category.description">{{ category.description }}</p>
                <div class="admin-dashboard-categories-meta">
                  <span>{{ dashboardCountLabel(category) }}</span>
                  <span v-if="!category.isActive" class="admin-dashboard-categories-status inactive">
                    {{ categoryStatusLabel(category) }}
                  </span>
                </div>
              </div>
            </div>

            <div class="admin-dashboard-categories-actions">
              <button class="admin-secondary-button" type="button" :disabled="isSaving" :aria-label="`Edit ${category.name}`" @click="openEditDialog(category)">
                Edit
              </button>
              <button class="admin-secondary-button" type="button" :disabled="isSaving" :aria-label="`${category.isActive ? 'Deactivate' : 'Activate'} ${category.name}`" @click="toggleCategoryStatus(category)">
                {{ category.isActive ? 'Deactivate' : 'Activate' }}
              </button>
              <button
                class="admin-danger-button"
                type="button"
                :aria-label="`Delete ${category.name}`"
                :disabled="isSaving || hasDashboardAssignments(category)"
                :title="deleteTitle(category)"
                @click="openDeleteDialog(category)"
              >
                Delete
              </button>
            </div>
          </header>

          <section
            v-if="category.dashboards.length > 0"
            class="admin-dashboard-categories-dashboard-list"
            :aria-label="`Dashboards in ${category.name}`"
          >
            <h4>Dashboards in this category:</h4>
            <ul aria-label="Category dashboard assignments">
              <li v-for="dashboard in category.dashboards.slice(0, 5)" :key="dashboard.id">
                <span>{{ dashboard.name }}</span>
                <strong>{{ dashboard.status }}</strong>
              </li>
            </ul>
            <p v-if="category.dashboards.length > 5" class="admin-dashboard-categories-more">
              +{{ category.dashboards.length - 5 }} more
            </p>
          </section>
        </article>
      </div>
    </article>

    <AdminDashboardCategoryDialogs
      v-model:category-form="categoryForm"
      :active-dialog="activeDialog"
      :can-submit-category="canSubmitCategory"
      :is-saving="isSaving"
      :selected-category="selectedCategory"
      @close="closeDialog"
      @submit-category="submitCategory"
      @submit-delete="submitDelete"
    />
  </section>
</template>
