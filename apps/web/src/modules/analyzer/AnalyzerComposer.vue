<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import {
  applyAnalyzerMention,
  filterAnalyzerMentionGroups,
  readAnalyzerMentionQuery,
  type AnalyzerMentionGroup,
  type AnalyzerMentionOption
} from './analyzer-mentions';
import { shouldSubmitAnalyzerComposerKeydown } from './analyzer-composer-keyboard';

const props = defineProps<{
  disabledReason?: string;
  isAsking: boolean;
  isSubmitDisabled?: boolean;
  mentionGroups: AnalyzerMentionGroup[];
  question: string;
}>();

const emit = defineEmits<{
  stop: [];
  submit: [];
  updateQuestion: [value: string];
}>();

const questionInput = ref<HTMLTextAreaElement | null>(null);
const activeMentionIndex = ref(0);
const mentionCursor = ref(0);

const mentionQuery = computed(() => readAnalyzerMentionQuery(props.question, mentionCursor.value));
const filteredMentionGroups = computed(() => (
  mentionQuery.value ? filterAnalyzerMentionGroups(props.mentionGroups, mentionQuery.value.query) : []
));
const mentionOptions = computed(() => filteredMentionGroups.value.flatMap(group => group.options));
const showMentionSuggestions = computed(() => mentionOptions.value.length > 0 && !props.isAsking);
const canSubmit = computed(() => props.question.trim().length > 0 && props.isSubmitDisabled !== true && !props.isAsking);
const isInputDisabled = computed(() => props.isAsking || Boolean(props.disabledReason));

function updateQuestion(event: Event): void {
  const input = event.target instanceof HTMLTextAreaElement ? event.target : null;
  const value = input?.value ?? '';
  emit('updateQuestion', value);
  mentionCursor.value = input?.selectionStart ?? value.length;
  activeMentionIndex.value = 0;
  resizeQuestionInput();
}

watch(() => props.question, () => {
  void nextTick(resizeQuestionInput);
});

watch(showMentionSuggestions, visible => {
  if (!visible) activeMentionIndex.value = 0;
});

onMounted(() => {
  mentionCursor.value = props.question.length;
  resizeQuestionInput();
});

function resizeQuestionInput(): void {
  const input = questionInput.value;
  if (!input) return;
  input.style.height = 'auto';
  input.style.height = `${Math.max(input.scrollHeight, 46)}px`;
}

function updateMentionCursor(): void {
  mentionCursor.value = questionInput.value?.selectionStart ?? props.question.length;
}

function handleKeydown(event: KeyboardEvent): void {
  if (showMentionSuggestions.value) {
    const activeMention = mentionOptions.value[activeMentionIndex.value];
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      activeMentionIndex.value = (activeMentionIndex.value + 1) % mentionOptions.value.length;
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      activeMentionIndex.value = (activeMentionIndex.value - 1 + mentionOptions.value.length) % mentionOptions.value.length;
      return;
    }
    if (event.key === 'Enter' && activeMention) {
      event.preventDefault();
      selectMention(activeMention);
      return;
    }
    if (event.key === 'Escape') {
      activeMentionIndex.value = 0;
    }
  }
  if (shouldSubmitAnalyzerComposerKeydown({
    isAsking: props.isAsking,
    isComposing: event.isComposing,
    isSubmitDisabled: props.isSubmitDisabled,
    key: event.key,
    question: props.question,
    shiftKey: event.shiftKey
  })) {
    event.preventDefault();
    emit('submit');
  }
}

function selectMention(option: AnalyzerMentionOption): void {
  const match = mentionQuery.value;
  if (!match) return;
  const next = applyAnalyzerMention(props.question, match, option);
  emit('updateQuestion', next.text);
  mentionCursor.value = next.cursor;
  activeMentionIndex.value = 0;
  void nextTick(() => {
    const input = questionInput.value;
    if (!input) return;
    input.focus();
    input.setSelectionRange(next.cursor, next.cursor);
    resizeQuestionInput();
  });
}
</script>

<template>
  <form class="ai-analyzer-input-bar" aria-label="Ask AI Analyzer" @submit.prevent="emit('submit')">
    <label class="analyzer-sr-only" for="analyzer-question">Question</label>
    <div class="analyzer-composer-input">
      <textarea
        id="analyzer-question"
        ref="questionInput"
        :value="question"
        rows="1"
        :placeholder="disabledReason || 'Ask a question about your data...'"
        :disabled="isInputDisabled"
        aria-autocomplete="list"
        :aria-expanded="showMentionSuggestions"
        aria-controls="analyzer-mention-list"
        @input="updateQuestion"
        @click="updateMentionCursor"
        @keyup="updateMentionCursor"
        @keydown="handleKeydown"
      ></textarea>
      <div
        v-if="showMentionSuggestions"
        id="analyzer-mention-list"
        class="analyzer-mention-list"
        role="listbox"
        aria-label="Analyzer dimension value suggestions"
      >
        <div
          v-for="group in filteredMentionGroups"
          :key="group.field"
          class="analyzer-mention-group"
        >
          <div class="analyzer-mention-group-label">{{ group.label }}</div>
          <button
            v-for="option in group.options"
            :key="`${option.field}:${option.value}`"
            type="button"
            class="analyzer-mention-option"
            role="option"
            :aria-selected="mentionOptions[activeMentionIndex]?.field === option.field && mentionOptions[activeMentionIndex]?.value === option.value"
            @mousedown.prevent="selectMention(option)"
          >
            <span class="analyzer-mention-option-prefix">@ {{ group.label }} =</span>
            <span>{{ option.value }}</span>
          </button>
        </div>
      </div>
    </div>
    <p v-if="disabledReason && !isAsking" class="analyzer-composer-disabled" role="status">{{ disabledReason }}</p>
    <button
      v-if="!isAsking"
      class="analyzer-send-button"
      type="submit"
      :disabled="!canSubmit"
      title="Send"
      aria-label="Ask Analyzer"
    >
      &gt;
    </button>
    <button
      v-else
      class="analyzer-stop-button"
      type="button"
      title="Stop"
      aria-label="Stop Analyzer"
      @click="emit('stop')"
    >
      Stop
    </button>
  </form>
</template>
