import { computed, nextTick, ref, watch } from 'vue';
import type { BuilderDataSource, BuilderDataTable, DashboardElement } from '../types';

type Trigger = '@' | '#' | '/';

export interface ChatMentionOption {
  group: string;
  icon: 'field' | 'table' | 'command' | 'element';
  label: string;
  value: string;
}

const SLASH_COMMANDS: ChatMentionOption[] = [
  { group: 'Commands', icon: 'command', label: 'Create new component', value: '/create' },
  { group: 'Commands', icon: 'command', label: 'Update selected component', value: '/update' },
  { group: 'Commands', icon: 'command', label: 'Clear chat', value: '/clear' },
  { group: 'Commands', icon: 'command', label: 'Suggest dashboard', value: '/suggest' }
];

export function useDashboardChatInput(ctx: {
  getPrompt: () => string;
  setPrompt: (v: string) => void;
  onSubmit: () => void;
  onCommand?: (command: string) => void;
  selectedTable: () => BuilderDataTable | null;
  dataSources: () => BuilderDataSource[];
  dashboardElements: () => DashboardElement[];
}) {
  const inputRef = ref<HTMLDivElement | null>(null);
  const mentionActive = ref(false);
  const mentionTrigger = ref<Trigger | null>(null);
  const mentionQuery = ref('');
  const mentionIndex = ref(0);
  let mentionStartOffset = 0;

  // --- all options per trigger ---

  const fieldOptions = computed((): ChatMentionOption[] => {
    const table = ctx.selectedTable();
    if (!table?.fields) return [];
    return table.fields.map(f => ({
      group: 'Fields',
      icon: 'field' as const,
      label: f.label ?? f.description ?? f.name,
      value: f.name
    }));
  });

  const tableOptions = computed((): ChatMentionOption[] => {
    const opts: ChatMentionOption[] = [];
    for (const ds of ctx.dataSources()) {
      for (const t of ds.tables ?? []) {
        opts.push({ group: ds.name, icon: 'table', label: t.name, value: `#${t.name}` });
      }
    }
    const elements = ctx.dashboardElements();
    for (const el of elements) {
      if (el.name) opts.push({ group: 'Components', icon: 'element', label: el.name, value: `#${el.name}` });
    }
    return opts;
  });

  const filteredOptions = computed((): ChatMentionOption[] => {
    const q = mentionQuery.value.toLowerCase();
    let pool: ChatMentionOption[] = [];
    if (mentionTrigger.value === '@') pool = fieldOptions.value;
    else if (mentionTrigger.value === '#') pool = tableOptions.value;
    else if (mentionTrigger.value === '/') pool = SLASH_COMMANDS;
    return q ? pool.filter(o => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)) : pool;
  });

  const groupedOptions = computed(() => {
    const map = new Map<string, ChatMentionOption[]>();
    for (const opt of filteredOptions.value) {
      const list = map.get(opt.group) ?? [];
      list.push(opt);
      map.set(opt.group, list);
    }
    return Array.from(map.entries()).map(([group, options]) => ({ group, options }));
  });

  // --- cursor helpers ---

  function getSelection(): Selection | null {
    return window.getSelection?.() ?? null;
  }

  function getCursorOffset(): number {
    const sel = getSelection();
    if (!sel || !sel.rangeCount || !inputRef.value) return 0;
    const range = sel.getRangeAt(0).cloneRange();
    range.selectNodeContents(inputRef.value);
    range.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
    return range.toString().length;
  }

  function getPlainText(): string {
    return (inputRef.value?.textContent ?? '').replace(/ /g, ' ');
  }

  function detectMention(): void {
    const text = getPlainText();
    const cursorPos = getCursorOffset();
    const before = text.slice(0, cursorPos);
    const match = before.match(/(?:^|[\s\n])([@#/])(\S*)$/);
    if (match) {
      const trigger = match[1] as Trigger;
      const query = match[2] ?? '';
      mentionTrigger.value = trigger;
      mentionQuery.value = query;
      mentionActive.value = true;
      mentionIndex.value = 0;
      mentionStartOffset = cursorPos - query.length - 1;
    } else {
      closeMention();
    }
  }

  function closeMention(): void {
    mentionActive.value = false;
    mentionTrigger.value = null;
    mentionQuery.value = '';
    mentionIndex.value = 0;
  }

  function insertMention(option: ChatMentionOption): void {
    // Slash commands execute immediately — don't insert into prompt
    if (option.icon === 'command') {
      closeMention();
      ctx.setPrompt('');
      if (inputRef.value) inputRef.value.textContent = '';
      ctx.onCommand?.(option.value);
      return;
    }

    const el = inputRef.value;
    if (!el) return;
    const text = getPlainText();
    const before = text.slice(0, mentionStartOffset);
    const after = text.slice(getCursorOffset());
    // For # (table/element), inject the name into the prompt so AI uses it as context
    // For @ (field), inject as @fieldName so the AI knows the specific field
    const insert = option.icon === 'table' || option.icon === 'element'
      ? option.value   // already has # prefix
      : `@${option.value}`;
    const newText = `${before}${insert} ${after}`;
    el.textContent = newText;
    ctx.setPrompt(newText.trim());
    void nextTick(() => {
      const sel = getSelection();
      if (!sel || !el.firstChild) return;
      const range = document.createRange();
      const pos = Math.min(mentionStartOffset + insert.length + 1, newText.length);
      const textNode = el.firstChild;
      if (textNode.nodeType === Node.TEXT_NODE) {
        range.setStart(textNode, pos);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });
    closeMention();
  }

  // --- event handlers ---

  function onInput(): void {
    ctx.setPrompt(getPlainText());
    detectMention();
  }

  function onKeydown(event: KeyboardEvent): void {
    // Mention navigation takes priority
    if (mentionActive.value && filteredOptions.value.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        mentionIndex.value = (mentionIndex.value + 1) % filteredOptions.value.length;
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        mentionIndex.value = (mentionIndex.value - 1 + filteredOptions.value.length) % filteredOptions.value.length;
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey || event.key === 'Tab') {
        const opt = filteredOptions.value[mentionIndex.value];
        if (opt) { event.preventDefault(); insertMention(opt); return; }
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMention();
        return;
      }
    }
    // Enter without Shift → submit
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const text = ctx.getPrompt().trim();
      if (text) ctx.onSubmit();
    }
  }

  // Sync contenteditable when prompt is set or cleared externally
  watch(ctx.getPrompt, (newVal) => {
    const el = inputRef.value;
    if (!el) return;
    if (newVal === getPlainText()) return;
    if (!newVal) {
      el.textContent = '';
      closeMention();
    } else {
      el.textContent = newVal;
    }
  });

  return {
    inputRef,
    mentionActive,
    mentionTrigger,
    mentionQuery,
    mentionIndex,
    filteredOptions,
    groupedOptions,
    onInput,
    onKeydown,
    insertMention,
    closeMention
  };
}
