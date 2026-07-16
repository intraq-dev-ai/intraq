<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps<{
  actionsLabel?: string | undefined;
  controlName: string;
  filterId: string;
}>();

const emit = defineEmits<{
  edit: [];
  remove: [];
}>();

const openFilterMenu = ref(false);
const menuTriggerRef = ref<HTMLElement | null>(null);
const menuStyle = ref<Record<string, string>>({});

function toggleFilterMenu(): void {
  openFilterMenu.value = !openFilterMenu.value;
  if (openFilterMenu.value) void nextTick(positionMenu);
}

function closeMenu(): void {
  openFilterMenu.value = false;
}

function editFilter(): void {
  closeMenu();
  emit('edit');
}

function removeFilter(): void {
  closeMenu();
  emit('remove');
}

function positionMenu(): void {
  if (!menuTriggerRef.value || typeof window === 'undefined') return;
  const triggerRect = menuTriggerRef.value.getBoundingClientRect();
  const componentRect = menuTriggerRef.value.closest<HTMLElement>(`[data-filter-id="${props.filterId}"]`)?.getBoundingClientRect();
  const rect = triggerRect.width > 0 && triggerRect.height > 0
    ? triggerRect
    : componentRect;
  if (!rect) return;
  const edgePadding = 8;
  const menuWidth = 128;
  const menuHeight = 76;
  const maxLeft = window.innerWidth - menuWidth - edgePadding;
  const left = Math.max(edgePadding, Math.min(rect.right - menuWidth, maxLeft));
  const belowTop = rect.bottom + 4;
  const top = belowTop + menuHeight > window.innerHeight - edgePadding
    ? Math.max(edgePadding, rect.top - menuHeight - 4)
    : belowTop;
  menuStyle.value = {
    left: `${left}px`,
    position: 'fixed',
    right: 'auto',
    top: `${top}px`,
    zIndex: '9999'
  };
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!(event.target instanceof Element)) return;
  if (
    !event.target.closest(`[data-filter-id="${props.filterId}"] .filter-controls`) &&
    !event.target.closest(`#filter-actions-${props.filterId}`)
  ) closeMenu();
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown, true);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
});
</script>

<template>
  <div class="filter-controls">
    <button
      ref="menuTriggerRef"
      class="filter-menu-trigger"
      type="button"
      :aria-expanded="openFilterMenu"
      :aria-label="actionsLabel || `Filter actions for ${controlName}`"
      :aria-controls="`filter-actions-${filterId}`"
      aria-haspopup="menu"
      @click="toggleFilterMenu"
    >
      <span aria-hidden="true">...</span>
    </button>
    <Teleport to="body">
      <div
        v-if="openFilterMenu"
        :id="`filter-actions-${filterId}`"
        class="filter-actions-menu"
        role="menu"
        :aria-label="`Actions for ${controlName} filter`"
        :style="menuStyle"
      >
        <button role="menuitem" type="button" :aria-label="`Edit ${controlName} filter`" @click="editFilter">
          Edit
        </button>
        <button role="menuitem" type="button" class="danger" :aria-label="`Delete ${controlName} filter`" @click="removeFilter">
          Delete
        </button>
      </div>
    </Teleport>
  </div>
</template>
