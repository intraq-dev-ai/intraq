import type { AnalyzerPlanRequest } from '../../validation.js';

export const DEFAULT_COMPARABLE_PERIOD_INSTRUCTION =
  'Compare against the previous comparable period when the question includes a date range.';

export function normalizeAnalyzerInstruction(question: string): string {
  return normalizeInstructionPunctuation(question.trim()) || DEFAULT_COMPARABLE_PERIOD_INSTRUCTION;
}

export function analyzerInstructionAnswer(instruction: string): string {
  if (instruction === DEFAULT_COMPARABLE_PERIOD_INSTRUCTION) {
    return 'Got it. For date-range questions, Analyzer will compare against the previous comparable period when the data is available.';
  }
  return `Got it. I will apply this Analyzer preference in this conversation: ${instruction}`;
}

export function analyzerInstructionFollowUps(): string[] {
  return [
    'Compare total sales from 1-31 March 2025 against the previous comparable period.',
    'Show net sales by location from 2025-03-01 to 2025-03-31.',
    'Which products changed most from 1-31 March 2025?'
  ];
}

export function appendAnalyzerInstructionsToQuestion(
  request: AnalyzerPlanRequest,
  instructions: string[]
): AnalyzerPlanRequest {
  const usableInstructions = instructions.map(item => item.trim()).filter(Boolean);
  if (usableInstructions.length === 0) return request;
  return {
    ...request,
    question: [
      request.question.trim(),
      `Use standing Analyzer instruction: ${usableInstructions.join(' ')}`
    ].join(' ')
  };
}

function normalizeInstructionPunctuation(value: string): string {
  if (!value) return '';
  let end = value.length;
  while (end > 0 && (value[end - 1] === '.' || value[end - 1] === '。')) {
    end -= 1;
  }
  return `${value.slice(0, end)}.`;
}
