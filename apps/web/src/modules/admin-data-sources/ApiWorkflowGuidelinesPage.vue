<script setup lang="ts">
import { RouterLink } from 'vue-router';
import '../admin/admin.css';
import '../admin/admin-base-product.css';
import './api-workflow-guidelines.css';

const quickStartSteps = [
  'Open Admin > Data Source Management.',
  'Select REST API from Connection Types.',
  'Click Add New.',
  'Enter Connection Name, Description, Base URL, Authentication, Request, Response Mapping, and Workflow Access.',
  'Save the workflow.',
  'Open Details on the saved API source.',
  'Click Add Endpoint to create endpoint models.',
  'Preview the endpoint, then save it.',
  'Use Manage Endpoints and Manage Data Models to select what dashboards and AI can use.',
  'Open Train to add business descriptions for the selected endpoint models.'
];

const featureGuides = [
  {
    title: 'Create a REST API workflow',
    purpose: 'Use this when the source system exposes HTTP endpoints instead of database tables.',
    where: 'Admin > Data Source Management > REST API > Add New',
    steps: [
      'Set Connection Name to a business name, for example Sales API or Customer Billing API.',
      'Set Type to REST API.',
      'Keep Source Type as Source (Read Data) unless the workflow is specifically writing data.',
      'Add a Description that explains what business questions this API answers.',
      'Fill Base URL with the common host, for example https://api.vendor.com.',
      'Use Default Endpoint only when most endpoint models share the same path.'
    ],
    result: 'The saved API source appears under REST API connections.'
  },
  {
    title: 'Configure authentication',
    purpose: 'Use this to tell the workflow how to authenticate with the upstream API.',
    where: 'Create or edit API source > Authentication panel',
    steps: [
      'Choose None only for public or internal test APIs.',
      'Choose Bearer Token when the vendor gives a fixed access token.',
      'Choose Basic Auth when the vendor expects username and password.',
      'Choose API Key when the vendor expects a header value.',
      'Choose API Key Query Param when the key must be sent in the URL query string.',
      'Choose Token Request when the workflow must call a login/token endpoint before calling the report endpoint.',
      'Use Auth Variables JSON for reusable values such as tenantId, accountKey, companyId, or apiKey.'
    ],
    result: 'The workflow can authenticate before dashboards or external clients request data.'
  },
  {
    title: 'Use token request',
    purpose: 'Use this for OAuth-style APIs and vendor APIs that issue short-lived access tokens.',
    where: 'Authentication = Token Request > Token Request panel',
    steps: [
      'Enter Token Endpoint, for example /oauth/token.',
      'Select Token Method, usually POST.',
      'Enter Client ID and Client Secret when required.',
      'Set Body Format to Form URL Encoded or JSON based on the vendor API.',
      'Set Token Path to the response field containing the token, for example access_token or Data.AccessToken.',
      'Set Expires In Path when the response includes token lifetime.',
      'Choose Apply Token As Bearer Authorization, Custom Header, or Query Parameter.',
      'Use Cache TTL Seconds so the workflow reuses valid tokens instead of logging in for every chart.'
    ],
    result: 'The workflow fetches and caches an access token before running endpoint requests.'
  },
  {
    title: 'Configure request parameters',
    purpose: 'Use this to pass dashboard filters, tenant context, and dates into the API request.',
    where: 'Create or edit API source > Request panel, or Details > Add Endpoint',
    steps: [
      'Use Query Params JSON for URL parameters such as companyId, locationId, page, fromDate, or toDate.',
      'Use Body JSON for POST payloads such as date ranges, grouping mode, or report options.',
      'Use Headers JSON for vendor-specific headers such as x-tenant or account key.',
      'Use placeholders such as {{companyId}}, {{locationId}}, {{fromDate}}, and {{toDate}} when values come from dashboard filters.',
      'Set Pagination JSON when the vendor returns pages and the workflow must fetch multiple pages.',
      'Avoid unbounded requests. Always include date, company, tenant, or location filters for large APIs.'
    ],
    result: 'Dashboard filters and AI-created queries can request the right subset of API data.'
  },
  {
    title: 'Configure pagination',
    purpose: 'Use this to keep API workflow responses small and predictable for dashboards and external clients.',
    where: 'Request panel > Pagination JSON, and public/private endpoint request parameters',
    steps: [
      'Use Pagination JSON when the upstream vendor API returns multiple pages that intraQ must fetch.',
      'For external API clients, use limit with offset for offset pagination.',
      'Use page with pageSize when the client prefers page-number pagination.',
      'Use lowercase skip and take for Kendo-compatible clients.',
      'Keep legacy business parameters such as Take in parameters or parameterValues when they are part of endpoint SQL.',
      'Check the endpoint response for page, pageSize, offset, and hasMore before wiring it into a client application.'
    ],
    result: 'The workflow can fetch upstream data safely and expose a clean paginated API contract.'
  },
  {
    title: 'Create endpoint models',
    purpose: 'Use endpoint models to make one API source behave like clean business tables.',
    where: 'REST API connection card > Details > Add Endpoint',
    steps: [
      'Click Details on the API source.',
      'Click Add Endpoint.',
      'Set Endpoint Name to a business name, for example Sales by Day or Invoice Discounts.',
      'Leave Internal Key empty unless you need a stable backward-compatible key. Users and docs see the Endpoint Name, while public docs use a clean dashed URL slug.',
      'Enter Endpoint Path and Method.',
      'Add endpoint-specific Query Params, Body, Headers, Response Mapping, and Additional Row Fields when this endpoint differs from the default source setup.',
      'Click Preview Request and confirm the returned columns and rows.',
      'Click Save Endpoint.'
    ],
    result: 'The endpoint becomes a selectable table-like model for dashboards, Analyzer, SQL Editor, and public API docs.'
  },
  {
    title: 'Map rows, matrix responses, and merged fields',
    purpose: 'Use this when the upstream response is nested, pivoted, or returns metadata separately from row values.',
    where: 'Response Mapping panel or Details > selected endpoint > Endpoint Behavior',
    steps: [
      'Set Data Path when rows are nested, for example data.results, Data.Rows, or response.items.',
      'Use Response Shape = Rows / JSON for normal arrays of row objects.',
      'Use Response Shape = Matrix Mapping when the API returns labels and series instead of direct rows.',
      'Use Response Mapping JSON to convert labels, series, and values into columns.',
      'To merge root metadata into every row, open Details, select the endpoint, paste the mapping into Additional Row Fields JSON, then click Save API Request.',
      'To merge sidecar arrays by row position, set mode to byIndex in Additional Row Fields JSON and point path to the sidecar array.',
      'Preview the endpoint and check that dates, amounts, counts, company, location, and grouping fields are all visible as columns.'
    ],
    result: 'The dashboard builder receives normal rows even when the vendor API response is nested or pivoted.'
  },
  {
    title: 'Preview and test',
    purpose: 'Use preview to prove the workflow works before dashboards rely on it.',
    where: 'Create or edit API source > Preview Data, or Details > Preview Request',
    steps: [
      'Use Preview Data in the source dialog for a quick default request check.',
      'Use Details > selected endpoint > Preview Request for endpoint-specific checks.',
      'Fill Preview parameters with the same values dashboard filters will send.',
      'Confirm that row count is realistic and the columns are business-friendly.',
      'Fix authentication, date filters, data path, or response mapping before saving if preview output is not clean.'
    ],
    result: 'The endpoint is safe to use in dashboards and AI tools.'
  },
  {
    title: 'Select endpoints and train data models',
    purpose: 'Use this so the API source is understandable to dashboard users and AI.',
    where: 'API connection card > Manage Endpoints, Manage Data Models, Train',
    steps: [
      'Click Manage Endpoints and select only endpoints that should be available.',
      'Click Manage Data Models and select endpoints that should be used by Dashboard Builder, Analyzer, and SQL Editor.',
      'Click Train.',
      'Add a plain-language source description.',
      'For each endpoint model, describe the business purpose, grain, primary date field, dimensions, measures, and common questions.',
      'Hide technical fields that users should not ask about.'
    ],
    result: 'Users can ask business questions without knowing vendor API field names.'
  },
  {
    title: 'Publish private or public access',
    purpose: 'Use private mode for internal dashboards and public mode when external systems need a documented API.',
    where: 'Create or edit API source > Publish panel',
    steps: [
      'Choose Private - dashboards only when the workflow is only for dashboards, Analyzer, SQL Editor, or internal product calls.',
      'Choose Public - client credentials when external systems should call the workflow directly.',
      'For public workflows, configure external auth clients in admin settings and restrict allowed data sources.',
      'Use the OpenAPI JSON route for documentation after the workflow is public.',
      'Keep public endpoints small and filtered. Do not expose broad raw system access.'
    ],
    result: 'The same endpoint model can power internal analytics or a token-protected external API.'
  },
  {
    title: 'Create workflows through MCP',
    purpose: 'Use this when an agent should create or maintain API workflow configuration.',
    where: 'Admin > MCP Access, then call the MCP endpoint',
    steps: [
      'Create an MCP token with product-api:write to allow workflow creation.',
      'Use create_api_workflow for first-time API workflow creation.',
      'Use call_product_write_api for advanced updates through product API routes.',
      'Use call_product_read_api to inspect sources, endpoint models, and OpenAPI specs.',
      'Use model metadata import after creation to add aliases, value wording, and field descriptions.'
    ],
    result: 'API workflows can be created repeatably by an agent instead of manually rebuilding JSON every time.'
  }
];

const responseMappingExample = `{
  "type": "matrix",
  "rootPath": "Data",
  "labelPath": "Xlabel",
  "labelColumn": "business_date",
  "seriesPath": "Name",
  "seriesColumn": "store_name",
  "valueColumns": {
    "sales": "Data",
    "orders": "Count"
  }
}`;

const rowMergeExample = `[
  { "name": "company_id", "path": "meta.companyId" },
  { "name": "report_status", "path": "meta.status" },
  {
    "mode": "byIndex",
    "name": "budget_value",
    "path": "sidecar.budget",
    "valuePath": "amount"
  }
]`;
</script>

<template>
  <section class="admin-page api-workflow-guidelines-page" aria-labelledby="api-workflow-guide-title">
    <header class="api-guide-hero">
      <div>
        <p class="api-guide-kicker">API workflow guide</p>
        <h1 id="api-workflow-guide-title">How to create and use API workflows</h1>
        <p>
          API workflows turn upstream REST APIs into clean endpoint models that dashboards, Analyzer,
          SQL Editor, Dashboard Builder, MCP agents, and external clients can use.
        </p>
      </div>
      <div class="api-guide-hero-actions">
        <RouterLink class="admin-secondary-button" to="/admin/api-workflows/docs">Open API Docs</RouterLink>
        <RouterLink class="admin-primary-button" to="/admin/data-sources">Open Data Sources</RouterLink>
        <RouterLink class="admin-secondary-button" to="/admin/mcp-access">Open MCP Access</RouterLink>
      </div>
    </header>

    <section class="api-guide-quick-start" aria-labelledby="api-guide-quick-start-title">
      <div>
        <p class="api-guide-kicker">Start here</p>
        <h2 id="api-guide-quick-start-title">UI process from start to finish</h2>
        <p>Follow these steps when setting up a new API source from the admin UI.</p>
      </div>
      <ol>
        <li v-for="step in quickStartSteps" :key="step">{{ step }}</li>
      </ol>
    </section>

    <section class="api-guide-feature-list" aria-label="API workflow feature instructions">
      <article v-for="(guide, index) in featureGuides" :key="guide.title" class="api-guide-feature">
        <header>
          <span>{{ String(index + 1).padStart(2, '0') }}</span>
          <div>
            <h2>{{ guide.title }}</h2>
            <p>{{ guide.purpose }}</p>
          </div>
        </header>
        <div class="api-guide-feature-body">
          <div class="api-guide-where">
            <strong>Where in UI</strong>
            <span>{{ guide.where }}</span>
          </div>
          <ol>
            <li v-for="step in guide.steps" :key="step">{{ step }}</li>
          </ol>
          <p class="api-guide-result"><strong>Result:</strong> {{ guide.result }}</p>
        </div>
      </article>
    </section>

    <section class="api-guide-examples" aria-labelledby="api-guide-examples-title">
      <header>
        <p class="api-guide-kicker">Mapping examples</p>
        <h2 id="api-guide-examples-title">Use these when the API does not return simple rows</h2>
      </header>
      <div class="api-guide-example-grid">
        <article>
          <h3>Matrix response mapping</h3>
          <p>Use this when the response has date labels and series arrays that need to become rows.</p>
          <pre><code>{{ responseMappingExample }}</code></pre>
        </article>
        <article>
          <h3>Merge metadata into rows</h3>
          <p>Use Additional Row Fields JSON when root values or sidecar arrays need to be added to each row.</p>
          <pre><code>{{ rowMergeExample }}</code></pre>
        </article>
      </div>
    </section>
  </section>
</template>
