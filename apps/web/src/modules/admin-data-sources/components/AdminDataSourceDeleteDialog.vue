<script setup lang="ts">
defineProps<{
  isDeleting: boolean;
  name: string;
  open: boolean;
  title: string;
}>();

defineEmits<{
  close: [];
  confirm: [];
}>();
</script>

<template>
  <div v-if="open" class="admin-modal-overlay" role="presentation" @click.self="$emit('close')">
    <section class="admin-modal admin-data-source-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-data-source-delete-title" tabindex="-1" @keydown.esc="$emit('close')" @vue:mounted="vnode => (vnode.el as HTMLElement)?.focus()">
      <header class="admin-modal-header">
        <div>
          <p class="admin-modal-eyebrow">Confirm delete</p>
          <h2 id="admin-data-source-delete-title">{{ title }}</h2>
        </div>
        <button class="admin-icon-button" type="button" aria-label="Close delete confirmation" @click="$emit('close')">x</button>
      </header>

      <p>
        Delete <strong>{{ name }}</strong>? This action cannot be undone.
      </p>

      <footer class="admin-modal-footer">
        <button class="admin-secondary-button" type="button" :disabled="isDeleting" @click="$emit('close')">Cancel</button>
        <button class="admin-danger-button" type="button" :disabled="isDeleting" @click="$emit('confirm')">
          {{ isDeleting ? 'Deleting' : 'Confirm delete' }}
        </button>
      </footer>
    </section>
  </div>
</template>
