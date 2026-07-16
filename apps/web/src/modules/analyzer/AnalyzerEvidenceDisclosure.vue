<script setup lang="ts">
import { computed, ref } from 'vue';
import { buildAnalyzerAnswerEvidence } from './analyzer-answer-evidence';
import type { AnalyzerExecution, AnalyzerPlan } from './types';

const props = defineProps<{
  execution: AnalyzerExecution;
  messageId: string;
  plan?: AnalyzerPlan | null;
  title: string;
}>();

const expanded = ref(false);
const evidence = computed(() => buildAnalyzerAnswerEvidence(props.execution, props.plan ?? null));
const panelId = computed(() => `analyzer-evidence-${safeDomId(props.messageId)}-${safeDomId(props.execution.tableName)}`);

function toggleEvidence(): void {
  expanded.value = !expanded.value;
}

function safeDomId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'result';
}
</script>

<template>
  <section class="analyzer-evidence" :aria-label="`Answer evidence for ${title}`">
    <div class="analyzer-evidence-summary">
      <div class="analyzer-evidence-scope">
        <strong>Applied scope</strong>
        <ul v-if="evidence.scope.length" aria-label="Applied query scope">
          <li v-for="item in evidence.scope" :key="item.text" :title="item.label">{{ item.text }}</li>
        </ul>
        <span v-else>No explicit filters or parameters were preserved.</span>
      </div>
      <div class="analyzer-evidence-actions">
        <span class="analyzer-evidence-status" :data-status="evidence.status">{{ evidence.statusLabel }}</span>
        <button
          type="button"
          :aria-controls="panelId"
          :aria-expanded="expanded"
          @click="toggleEvidence"
        >
          {{ expanded ? 'Hide evidence' : 'View evidence' }}
        </button>
      </div>
    </div>

    <section
      v-if="expanded"
      :id="panelId"
      class="analyzer-evidence-details"
      role="region"
      :aria-label="`Evidence used for ${title}`"
    >
      <p class="analyzer-evidence-description">{{ evidence.statusDescription }}</p>
      <dl class="analyzer-evidence-grid">
        <div>
          <dt>Model</dt>
          <dd>{{ evidence.modelName }}</dd>
        </div>
        <div>
          <dt>Table</dt>
          <dd><code>{{ evidence.tableName }}</code></dd>
        </div>
        <div v-if="evidence.modelVersion">
          <dt>Model version</dt>
          <dd>{{ evidence.modelVersion }}</dd>
        </div>
        <div v-if="evidence.domain">
          <dt>Domain</dt>
          <dd>{{ evidence.domain }}</dd>
        </div>
        <div v-if="evidence.grain">
          <dt>Grain</dt>
          <dd>{{ evidence.grain }}</dd>
        </div>
        <div v-if="evidence.primaryTimeField">
          <dt>Primary time field</dt>
          <dd>{{ evidence.primaryTimeField }}</dd>
        </div>
        <div v-if="evidence.matchingRows !== null">
          <dt>Matching rows</dt>
          <dd>{{ evidence.matchingRows }}</dd>
        </div>
        <div v-if="evidence.returnedRows !== null">
          <dt>Rows loaded</dt>
          <dd>{{ evidence.returnedRows }}</dd>
        </div>
        <div v-if="evidence.coverage">
          <dt>Result coverage</dt>
          <dd>{{ evidence.coverage }}</dd>
        </div>
        <div v-if="evidence.semanticAssurance">
          <dt>Semantic model</dt>
          <dd>{{ evidence.semanticAssurance }}</dd>
        </div>
      </dl>

      <div v-if="evidence.columns.length" class="analyzer-evidence-section">
        <h4>Fields used</h4>
        <ul class="analyzer-evidence-list" aria-label="Fields used to answer">
          <li v-for="column in evidence.columns" :key="column">{{ column }}</li>
        </ul>
      </div>

      <div v-if="evidence.knowledgeReferences.length" class="analyzer-evidence-section">
        <h4>Knowledge references</h4>
        <ul class="analyzer-evidence-list" aria-label="Knowledge references used to answer">
          <li v-for="reference in evidence.knowledgeReferences" :key="reference">{{ reference }}</li>
        </ul>
      </div>

      <div v-if="evidence.queryHash || evidence.resultHash" class="analyzer-evidence-section">
        <h4>Integrity fingerprints</h4>
        <p>{{ evidence.integrityNote }}</p>
        <dl class="analyzer-evidence-hashes">
          <div v-if="evidence.queryHash">
            <dt>Query hash</dt>
            <dd><code>{{ evidence.queryHash }}</code></dd>
          </div>
          <div v-if="evidence.resultHash">
            <dt>Result hash</dt>
            <dd><code>{{ evidence.resultHash }}</code></dd>
          </div>
        </dl>
      </div>

      <div v-if="evidence.sql" class="analyzer-evidence-section">
        <h4>SQL trace</h4>
        <p>Planner or loader-reported SQL preserved with the result. It is execution evidence, not independent proof of correctness.</p>
        <pre aria-label="SQL trace preserved with this result">{{ evidence.sql }}</pre>
      </div>
    </section>
  </section>
</template>
