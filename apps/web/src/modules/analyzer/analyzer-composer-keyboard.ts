export interface AnalyzerComposerKeydownState {
  isAsking: boolean;
  isComposing?: boolean;
  isSubmitDisabled?: boolean;
  key: string;
  question: string;
  shiftKey?: boolean;
}

export function shouldSubmitAnalyzerComposerKeydown(state: AnalyzerComposerKeydownState): boolean {
  return state.key === 'Enter'
    && state.shiftKey !== true
    && state.isComposing !== true
    && state.isAsking !== true
    && state.isSubmitDisabled !== true
    && state.question.trim().length > 0;
}
