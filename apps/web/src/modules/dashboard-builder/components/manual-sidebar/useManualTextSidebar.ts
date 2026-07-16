import { ref, watch } from 'vue';
import type { ManualSidebarProps } from './manualSidebarTypes';

type TextTone = 'critical' | 'info' | 'neutral' | 'success' | 'warning';
type TextVariant = 'body' | 'insight' | 'section';

export function useManualTextSidebar(
  props: ManualSidebarProps,
  saveSelectedElementConfig: (configPatch: Record<string, unknown>) => void
) {
  const textBadge = ref('');
  const textAiCacheTtlMinutes = ref(15);
  const textAiGenerated = ref(false);
  const textContent = ref('');
  const textGenerationPrompt = ref('');
  const textShowIcon = ref(true);
  const textTone = ref<TextTone>('neutral');
  const textVariant = ref<TextVariant>('body');

  watch(() => props.selectedElement?.id ?? '', () => {
    hydrateTextElement(props.selectedElement?.config ?? {});
  }, { immediate: true });

  function saveTextElement(): void {
    if (props.selectedElement?.type !== 'text') return;
    saveSelectedElementConfig({
      aiCacheTtlMinutes: textAiCacheTtlMinutes.value,
      aiGenerated: textAiGenerated.value,
      badge: textBadge.value.trim(),
      contentSource: textAiGenerated.value ? 'dashboard-ai' : 'manual',
      generationPrompt: textGenerationPrompt.value.trim(),
      showIcon: textShowIcon.value,
      text: textContent.value,
      textVariant: textVariant.value,
      tone: textTone.value
    });
  }

  function hydrateTextElement(config: Record<string, unknown>): void {
    textAiGenerated.value = config.aiGenerated === true;
    textGenerationPrompt.value = readConfigString(config.generationPrompt) ?? '';
    textAiCacheTtlMinutes.value = readCacheTtlMinutes(config.aiCacheTtlMinutes);
    textContent.value = readConfigString(config.text ?? config.content ?? config.description) ?? '';
    textBadge.value = readConfigString(config.badge ?? config.statusLabel) ?? '';
    textShowIcon.value = config.showIcon !== false;
    const nextTone = readConfigString(config.tone ?? config.severity)?.toLowerCase();
    textTone.value = nextTone === 'critical' || nextTone === 'info' || nextTone === 'success' || nextTone === 'warning'
      ? nextTone
      : 'neutral';
    const nextVariant = readConfigString(config.textVariant ?? config.variant)?.toLowerCase();
    textVariant.value = nextVariant === 'insight' || nextVariant === 'section' ? nextVariant : 'body';
  }

  return {
    saveTextElement,
    textAiCacheTtlMinutes,
    textAiGenerated,
    textBadge,
    textContent,
    textGenerationPrompt,
    textShowIcon,
    textTone,
    textVariant
  };
}

function readConfigString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readCacheTtlMinutes(value: unknown): number {
  return value === 60 || value === 1_440 ? value : 15;
}
