const MAX_CANDIDATE_TEXT_LENGTH = 512;
const MAX_EVIDENCE_COUNT = 12;
const MAX_FACT_COUNT = 24;
const MAX_FACT_KEY_LENGTH = 128;
const MAX_TEXT_LENGTH = 2_000;

export const ANALYZER_SAFE_REFUSAL_REASON_CODES = [
  'access_policy_blocked',
  'agent_unavailable',
  'approved_hours_unavailable',
  'cross_company_unsupported',
  'duration_quality_unverified',
  'insufficient_source_evidence',
  'missing_context',
  'non_additive_period_ratio',
  'no_eligible_capability',
  'pay_rate_coverage_unverified',
  'unresolved_lookup',
  'validation_blocked'
] as const;

export const ANALYZER_SAFE_REFUSAL_EVIDENCE_CODES = [
  'approved_hours_mixed_with_elapsed',
  'coverage_insufficient',
  'cross_company_scope_unsupported',
  'data_source_unavailable',
  'duration_quality_unverified',
  'lookup_unresolved',
  'model_rejected',
  'pay_rate_coverage_unverified',
  'period_ratio_non_additive',
  'required_field_missing',
  'required_values_missing',
  'validation_failed'
] as const;

export const ANALYZER_SAFE_REFUSAL_NEXT_STEP_CODES = [
  'ask_supported_question',
  'connect_required_data',
  'correct_lookup_value',
  'provide_missing_context',
  'provide_scope',
  'review_source_data',
  'retry_later',
  'train_or_choose_supported_model'
] as const;

export type AnalyzerSafeRefusalReasonCode =
  typeof ANALYZER_SAFE_REFUSAL_REASON_CODES[number];

export type AnalyzerSafeRefusalEvidenceCode =
  typeof ANALYZER_SAFE_REFUSAL_EVIDENCE_CODES[number];

export type AnalyzerSafeRefusalNextStepCode =
  typeof ANALYZER_SAFE_REFUSAL_NEXT_STEP_CODES[number];

export type AnalyzerSafeRefusalFact = boolean | number | string | null;

export interface AnalyzerSafeRefusalCandidateModel {
  businessName?: string;
  id?: string;
  name?: string;
}

export interface AnalyzerSafeRefusalEvidence {
  code: AnalyzerSafeRefusalEvidenceCode;
  fact: string;
  facts?: Record<string, AnalyzerSafeRefusalFact>;
}

export interface AnalyzerSafeRefusalNextStep {
  code: AnalyzerSafeRefusalNextStepCode;
  instruction: string;
}

export interface AnalyzerSafeRefusalDetails {
  candidateModel?: AnalyzerSafeRefusalCandidateModel;
  evidence: AnalyzerSafeRefusalEvidence[];
  nextStep: AnalyzerSafeRefusalNextStep;
  reasonCode: AnalyzerSafeRefusalReasonCode;
}

export interface AnalyzerSafeRefusalInput {
  candidateModel?: Readonly<AnalyzerSafeRefusalCandidateModel>;
  evidence: ReadonlyArray<Readonly<AnalyzerSafeRefusalEvidence>>;
  nextStep: Readonly<AnalyzerSafeRefusalNextStep>;
  reasonCode: AnalyzerSafeRefusalReasonCode;
}

export function attachAnalyzerSafeRefusal(
  legacyParams: Readonly<Record<string, unknown>>,
  input?: AnalyzerSafeRefusalInput
): Record<string, unknown> {
  if (!input) return { ...legacyParams };
  const details = readAnalyzerSafeRefusal(input);
  return details ? { ...legacyParams, ...details } : { ...legacyParams };
}

export function readAnalyzerSafeRefusal(value: unknown): AnalyzerSafeRefusalDetails | null {
  if (!isRecord(value)) return null;
  const reasonCode = readCode(value.reasonCode, ANALYZER_SAFE_REFUSAL_REASON_CODES);
  const evidence = readEvidence(value.evidence);
  const nextStep = readNextStep(value.nextStep);
  if (!reasonCode || !evidence || !nextStep) return null;

  if (value.candidateModel === undefined) {
    return { evidence, nextStep, reasonCode };
  }
  const candidateModel = readCandidateModel(value.candidateModel);
  return candidateModel ? { candidateModel, evidence, nextStep, reasonCode } : null;
}

function readCandidateModel(value: unknown): AnalyzerSafeRefusalCandidateModel | null {
  if (!isRecord(value)) return null;
  const id = readOptionalText(value, 'id', MAX_CANDIDATE_TEXT_LENGTH);
  const name = readOptionalText(value, 'name', MAX_CANDIDATE_TEXT_LENGTH);
  const businessName = readOptionalText(value, 'businessName', MAX_CANDIDATE_TEXT_LENGTH);
  if (id === false || name === false || businessName === false) return null;
  if (!id && !name && !businessName) return null;
  return {
    ...(typeof businessName === 'string' ? { businessName } : {}),
    ...(typeof id === 'string' ? { id } : {}),
    ...(typeof name === 'string' ? { name } : {})
  };
}

function readEvidence(value: unknown): AnalyzerSafeRefusalEvidence[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_EVIDENCE_COUNT) return null;
  const evidence: AnalyzerSafeRefusalEvidence[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const code = readCode(item.code, ANALYZER_SAFE_REFUSAL_EVIDENCE_CODES);
    const fact = readText(item.fact, MAX_TEXT_LENGTH);
    if (!code || !fact) return null;
    if (item.facts === undefined) {
      evidence.push({ code, fact });
      continue;
    }
    const facts = readFacts(item.facts);
    if (!facts) return null;
    evidence.push(Object.keys(facts).length > 0 ? { code, fact, facts } : { code, fact });
  }
  return evidence;
}

function readFacts(value: unknown): Record<string, AnalyzerSafeRefusalFact> | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > MAX_FACT_COUNT) return null;
  const facts: Record<string, AnalyzerSafeRefusalFact> = {};
  for (const [key, fact] of entries.sort(([left], [right]) => left.localeCompare(right))) {
    if (!key || key !== key.trim() || key.length > MAX_FACT_KEY_LENGTH || !isFact(fact)) return null;
    if (typeof fact === 'string' && !readText(fact, MAX_TEXT_LENGTH)) return null;
    facts[key] = typeof fact === 'string' ? fact.trim() : fact;
  }
  return facts;
}

function readNextStep(value: unknown): AnalyzerSafeRefusalNextStep | null {
  if (!isRecord(value)) return null;
  const code = readCode(value.code, ANALYZER_SAFE_REFUSAL_NEXT_STEP_CODES);
  const instruction = readText(value.instruction, MAX_TEXT_LENGTH);
  return code && instruction ? { code, instruction } : null;
}

function readCode<const T extends readonly string[]>(value: unknown, values: T): T[number] | null {
  return typeof value === 'string' && values.some(candidate => candidate === value)
    ? value as T[number]
    : null;
}

function readOptionalText(
  value: Record<string, unknown>,
  key: string,
  maxLength: number
): string | undefined | false {
  if (value[key] === undefined) return undefined;
  return readText(value[key], maxLength) ?? false;
}

function readText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 && text.length <= maxLength ? text : null;
}

function isFact(value: unknown): value is AnalyzerSafeRefusalFact {
  return value === null
    || typeof value === 'boolean'
    || typeof value === 'string'
    || (typeof value === 'number' && Number.isFinite(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
