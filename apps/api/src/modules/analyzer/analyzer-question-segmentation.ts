export interface AnalyzerQuestionSegmentation {
  coveredQuestion: string;
  deferredQuestions: string[];
}

const FOLLOW_UP_CONNECTOR = /\s+(?:and then|and also|and|also|then)\s+/i;
const CLAUSE_START = /^(what|which|why|how|show|compare|list|tell|find|summarize|break down)\b/i;

export function segmentAnalyzerQuestion(question: string): AnalyzerQuestionSegmentation {
  const normalized = question.trim();
  if (!normalized) return { coveredQuestion: '', deferredQuestions: [] };

  const clauses = splitAnalyzerQuestion(normalized);
  return {
    coveredQuestion: clauses[0] ?? normalized,
    deferredQuestions: clauses.slice(1)
  };
}

function splitAnalyzerQuestion(question: string): string[] {
  const punctuated = question
    .split(/\?\s+|\n+/)
    .flatMap(part => splitByConnector(part))
    .map(cleanClause)
    .filter(Boolean);
  return punctuated.length ? punctuated : [question];
}

function splitByConnector(question: string): string[] {
  const trimmed = question.trim();
  if (!trimmed) return [];
  const match = trimmed.match(FOLLOW_UP_CONNECTOR);
  if (!match?.index) return [trimmed];
  const index = match.index;
  const connector = match[0];
  const left = trimmed.slice(0, index).trim();
  const right = trimmed.slice(index + connector.length).trim();
  if (!left || !right || !CLAUSE_START.test(right)) return [trimmed];
  return [left, ...splitByConnector(right)];
}

function cleanClause(value: string): string {
  return value.trim().replace(/[?]+$/g, '').trim();
}
