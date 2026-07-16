<script setup lang="ts">
import { computed, ref } from 'vue';
import { copyTextWithFallback } from '../../shared/clipboard';

const props = withDefaults(defineProps<{
  disabled: boolean;
  sql: string;
  messageContent?: string;
}>(), { messageContent: '' });

const emit = defineEmits<{
  apply: [content: string];
  replace: [sql: string];
}>();

const copyStatus = ref('');
// Partial replacements carry OLD_CODE markers; route those through the partial-aware apply path.
const isPartial = computed(() => /<!--\s*OLD_CODE\s*-->/i.test(props.messageContent));

function applyToTab(): void {
  if (isPartial.value) emit('apply', props.messageContent);
  else emit('replace', props.sql);
}

async function copySql(sql: string): Promise<void> {
  copyStatus.value = '';
  try {
    const copied = await copyTextWithFallback(sql);
    if (!copied) throw new Error('Clipboard copy failed.');
    copyStatus.value = 'SQL copied.';
  } catch {
    copyStatus.value = 'SQL copy failed.';
  }
}
</script>

<template>
  <article class="sql-editor-assistant-sql-block">
    <div class="sql-editor-assistant-sql-heading">
      <span>SQL</span>
      <div class="sql-editor-assistant-sql-actions">
        <button type="button" class="sql-editor-inline-button" @click="copySql(sql)">Copy SQL</button>
        <button
          type="button"
          class="sql-editor-inline-button"
          :disabled="disabled"
          @click="applyToTab"
        >
          Apply to Query Tab
        </button>
      </div>
    </div>
    <pre class="sql-editor-assistant-output"><code>{{ sql }}</code></pre>
    <p v-if="copyStatus" class="sql-editor-assistant-status" role="status" aria-label="SQL assistant clipboard status" aria-live="polite">
      {{ copyStatus }}
    </p>
  </article>
</template>
