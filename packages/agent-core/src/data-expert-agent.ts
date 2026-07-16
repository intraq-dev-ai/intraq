export interface MetadataGuideDocument {
  id: string;
  title: string;
  audience: 'builder-agent' | 'analyzer-agent' | 'external-automation';
  domain: 'generic';
  sections: string[];
}

export interface MetadataGuidance {
  message: string;
  response: string;
  suggestedPatch: Record<string, unknown>;
}

export interface MetadataGuidanceContext {
  clarificationPrompt?: string;
  conversationId?: string;
  selectedModelId?: string;
}

export interface MetadataSourceContext {
  id: string;
  name: string;
}

export class DataExpertAgent {
  createMetadataGuideDocument(topic: string): MetadataGuideDocument {
    const title = topic.trim() || 'Data model guide';
    return {
      id: `knowledge-${slugify(title)}`,
      title: `Data Model Guide: ${title}`,
      audience: 'builder-agent',
      domain: 'generic',
      sections: [
        'Table purpose',
        'Field labels and aliases',
        'Measures and dimensions',
        'Recommended dashboard patterns',
        'Analyzer evidence rules'
      ]
    };
  }

  createMetadataGuidance(
    source: MetadataSourceContext,
    message: string,
    _context: MetadataGuidanceContext = {}
  ): MetadataGuidance {
    const prompt = message.trim();
    return {
      message: 'Metadata guidance generated',
      response: `Use ${source.name} only when its table and field metadata support "${prompt}". Add business names, field roles, aliases, sample questions, and a primary date field where relevant.`,
      suggestedPatch: {
        dictionary: {
          aiPurpose: `Answer questions that match ${source.name} metadata.`,
          aiImportantNotes: 'Cite the selected data model and fields used. Do not infer missing fields, joins, metrics, or time grains.'
        }
      }
    };
  }
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'data-model-guide';
}
