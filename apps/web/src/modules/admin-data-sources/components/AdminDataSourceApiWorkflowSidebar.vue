<script setup lang="ts">
interface ApiWorkflowRunStep {
  detail: string;
  label: string;
  state: string;
}

interface ApiWorkflowStep extends ApiWorkflowRunStep {
  id: string;
}

defineProps<{
  methodSummary: string;
  runSteps: ApiWorkflowRunStep[];
  steps: ApiWorkflowStep[];
}>();
</script>

<template>
  <aside class="api-workflow-map" aria-label="API workflow steps">
    <ol class="api-workflow-step-list">
      <li v-for="(step, index) in steps" :key="step.id" class="api-workflow-step">
        <span class="api-workflow-step-index">{{ index + 1 }}</span>
        <div>
          <strong>{{ step.label }}</strong>
          <span>{{ step.detail }}</span>
        </div>
        <small>{{ step.state }}</small>
      </li>
    </ol>

    <section class="api-workflow-run-log" aria-label="API workflow run evidence">
      <header>
        <span>Run evidence</span>
        <strong>{{ methodSummary }}</strong>
      </header>
      <ol>
        <li v-for="entry in runSteps" :key="entry.label">
          <span class="api-workflow-log-state">{{ entry.state }}</span>
          <div>
            <strong>{{ entry.label }}</strong>
            <span>{{ entry.detail }}</span>
          </div>
        </li>
      </ol>
    </section>

    <section class="api-workflow-mcp-contract" aria-label="MCP API workflow contract">
      <h4>MCP contract</h4>
      <dl>
        <div>
          <dt>Create</dt>
          <dd>create_api_workflow</dd>
        </div>
        <div>
          <dt>Advanced</dt>
          <dd>call_product_read_api</dd>
        </div>
        <div>
          <dt>Path</dt>
          <dd>/api/data-sources</dd>
        </div>
      </dl>
    </section>
  </aside>
</template>
