import type { AgentDataField, FieldEncoding } from '@intraq/contracts';

export type FieldRole = FieldEncoding['role'] | 'identifier';

export interface ModelField {
  field: AgentDataField;
  hasModelContext: boolean;
  metadata: Record<string, unknown>;
  role: FieldRole;
}
