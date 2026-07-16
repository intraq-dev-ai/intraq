import type { readTableConditionalRules } from './table-conditional-formatting';

export interface TableRuntimeContext {
  locationOrigin?: string;
  parameterValues?: Record<string, unknown>;
  parentOrigin?: string;
}

export type ConditionalRule = ReturnType<typeof readTableConditionalRules>[number];
