import type {
  DataModelRecommendation,
  DataModelRecommendationRequest
} from '@intraq/contracts';
import { readBoolean, readString, toLabel } from './builder-agent-text.js';
import { selectDataModel, modelFields } from './builder-agent-model.js';

export function recommendDataModelForRequest(request: DataModelRecommendationRequest): DataModelRecommendation {
  const model = selectDataModel(request.prompt, request.dataModels ?? []);
  if (!model) return clarificationRecommendation();
  const fields = modelFields(model).filter(field => field.hasModelContext);
  if (!fields.some(field => field.role === 'measure')) return clarificationRecommendation();

  return {
    subjectArea: model.businessName ?? readString(model.dictionary?.businessName) ?? toLabel(model.name),
    dimensions: fields.filter(field => field.role === 'time' || field.role === 'dimension').map(field => field.field.name),
    measures: fields.filter(field => field.role === 'measure').map(field => field.field.name),
    filters: fields
      .filter(field => field.role === 'time' || field.role === 'dimension' || readBoolean(field.metadata.filterable))
      .map(field => field.field.name),
    knowledgeReferences: []
  };
}

function clarificationRecommendation(): DataModelRecommendation {
  return {
    subjectArea: 'Clarification needed',
    dimensions: [],
    measures: [],
    filters: [],
    knowledgeReferences: []
  };
}
