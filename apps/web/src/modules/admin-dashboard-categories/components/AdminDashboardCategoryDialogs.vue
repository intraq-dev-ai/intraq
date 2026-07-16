<script setup lang="ts">
import type {
  DashboardCategory,
  DashboardCategoryDialogName,
  DashboardCategoryForm
} from '../types';

const props = defineProps<{
  activeDialog: DashboardCategoryDialogName;
  canSubmitCategory: boolean;
  categoryForm: DashboardCategoryForm;
  isSaving: boolean;
  selectedCategory: DashboardCategory | null;
}>();

const emit = defineEmits<{
  close: [];
  submitCategory: [];
  submitDelete: [];
  'update:categoryForm': [value: DashboardCategoryForm];
}>();

function updateTextField(key: keyof Pick<DashboardCategoryForm, 'color' | 'description' | 'icon' | 'name'>, event: Event): void {
  emit('update:categoryForm', {
    ...props.categoryForm,
    [key]: inputValue(event)
  });
}

function updateSortOrder(event: Event): void {
  const value = Number(inputValue(event));
  emit('update:categoryForm', {
    ...props.categoryForm,
    sortOrder: Number.isFinite(value) ? value : 0
  });
}

function updateActive(event: Event): void {
  emit('update:categoryForm', {
    ...props.categoryForm,
    isActive: event.target instanceof HTMLInputElement ? event.target.checked : false
  });
}

function inputValue(event: Event): string {
  return event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement
    ? event.target.value
    : '';
}
</script>

<template>
  <div
    v-if="activeDialog === 'create' || activeDialog === 'edit'"
    class="admin-modal-overlay"
    role="presentation"
    @click.self="emit('close')"
  >
    <section class="admin-modal admin-dashboard-category-dialog" role="dialog" aria-modal="true" aria-labelledby="category-dialog-title" tabindex="-1" @keydown.esc="emit('close')" @vue:mounted="vnode => (vnode.el as HTMLElement)?.focus()">
      <header class="admin-modal-header">
        <div>
          <p class="admin-modal-eyebrow">Dashboard Categories</p>
          <h2 id="category-dialog-title">{{ activeDialog === 'create' ? 'Add New Category' : 'Edit Category' }}</h2>
        </div>
        <button class="admin-icon-button" type="button" aria-label="Close category dialog" @click="emit('close')">x</button>
      </header>

      <form class="admin-form admin-dashboard-category-form" aria-label="Dashboard category form" @submit.prevent="emit('submitCategory')">
        <label>
          Category Name *
          <input :value="categoryForm.name" required placeholder="Sales Reports" @input="updateTextField('name', $event)" />
        </label>

        <label>
          Description
          <textarea
            :value="categoryForm.description"
            placeholder="Brief description of dashboards in this category"
            @input="updateTextField('description', $event)"
          ></textarea>
        </label>

        <div class="admin-dashboard-category-form-grid">
          <label>
            Color
            <span class="admin-dashboard-category-color-field">
              <input :value="categoryForm.color" type="color" aria-label="Category color" @input="updateTextField('color', $event)" />
              <span>{{ categoryForm.color }}</span>
            </span>
          </label>

          <label>
            Icon
            <input :value="categoryForm.icon" maxlength="40" placeholder="LayoutDashboard" @input="updateTextField('icon', $event)" />
          </label>
        </div>

        <div class="admin-dashboard-category-form-grid">
          <label>
            Sort Order
            <input :value="categoryForm.sortOrder" min="0" type="number" @input="updateSortOrder" />
            <span class="admin-dashboard-category-hint">Lower numbers appear first</span>
          </label>

          <label class="admin-check-row admin-dashboard-category-active-field">
            <input :checked="categoryForm.isActive" type="checkbox" @change="updateActive" />
            Active Category
          </label>
        </div>

        <footer class="admin-modal-footer">
          <button class="admin-secondary-button" type="button" :disabled="isSaving" @click="emit('close')">Cancel</button>
          <button class="button" type="submit" :disabled="isSaving || !canSubmitCategory">
            {{ isSaving ? 'Saving...' : activeDialog === 'create' ? 'Create Category' : 'Update Category' }}
          </button>
        </footer>
      </form>
    </section>
  </div>

  <div
    v-if="selectedCategory && activeDialog === 'delete'"
    class="admin-modal-overlay"
    role="presentation"
    @click.self="emit('close')"
  >
    <section class="admin-modal admin-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-category-dialog-title" tabindex="-1" @keydown.esc="emit('close')" @vue:mounted="vnode => (vnode.el as HTMLElement)?.focus()">
      <header class="admin-modal-header">
        <div>
          <p class="admin-modal-eyebrow">Dashboard Categories</p>
          <h2 id="delete-category-dialog-title">Delete Category</h2>
        </div>
        <button class="admin-icon-button" type="button" aria-label="Close delete category dialog" @click="emit('close')">x</button>
      </header>

      <div class="admin-form">
        <p>Delete "{{ selectedCategory.name }}"? This action cannot be undone.</p>
        <p class="admin-dashboard-category-warning">Categories with dashboards must be emptied before deletion.</p>
        <footer class="admin-modal-footer">
          <button class="admin-secondary-button" type="button" :disabled="isSaving" @click="emit('close')">Cancel</button>
          <button class="admin-danger-button" type="button" :disabled="isSaving" @click="emit('submitDelete')">
            {{ isSaving ? 'Deleting...' : 'Delete Category' }}
          </button>
        </footer>
      </div>
    </section>
  </div>
</template>
