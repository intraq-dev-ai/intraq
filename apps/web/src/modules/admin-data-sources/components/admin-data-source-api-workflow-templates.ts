import type { AdminDataSourceFormState } from '../types';

export interface AdminDataSourceApiWorkflowTemplate {
  description: string;
  label: string;
  patch: Partial<AdminDataSourceFormState>;
}

export const API_WORKFLOW_TEMPLATES: AdminDataSourceApiWorkflowTemplate[] = [
  {
    label: 'Filtered GET rows',
    description: 'Simple endpoint with query params and a nested row array.',
    patch: {
      apiAuthType: 'bearer',
      apiDataPath: 'data.rows',
      apiEndpoint: '/reports/sales',
      apiMethod: 'GET',
      apiQueryParams: JSON.stringify({ companyId: '{{companyId}}', fromDate: '{{fromDate}}', toDate: '{{toDate}}' }, null, 2),
      apiResponseShape: 'rows',
      requestTimeoutMs: '30000'
    }
  },
  {
    label: 'Filtered POST report',
    description: 'Dashboard filters are sent as a JSON body.',
    patch: {
      apiAuthType: 'bearer',
      apiBody: JSON.stringify({ companyId: '{{companyId}}', fromDate: '{{fromDate}}', toDate: '{{toDate}}', rangeType: '{{rangeType}}' }, null, 2),
      apiDataPath: 'data',
      apiEndpoint: '/reports/summary',
      apiMethod: 'POST',
      apiResponseShape: 'rows',
      requestTimeoutMs: '60000'
    }
  },
  {
    label: 'OAuth report API',
    description: 'Client credentials token request followed by a POST report call.',
    patch: {
      apiAuthType: 'token_request',
      apiBody: JSON.stringify({ from: '{{fromDate}}', to: '{{toDate}}', companyId: '{{companyId}}' }, null, 2),
      apiClientId: '',
      apiClientSecret: '',
      apiDataPath: 'data.rows',
      apiEndpoint: '/reports/sales',
      apiMethod: 'POST',
      apiResponseShape: 'rows',
      apiTokenApplyAs: 'bearer',
      apiTokenBody: JSON.stringify({ grant_type: 'client_credentials', client_id: '{{clientId}}', client_secret: '{{clientSecret}}' }, null, 2),
      apiTokenBodyFormat: 'form',
      apiTokenCacheTtlSeconds: '900',
      apiTokenEndpoint: '/oauth/token',
      apiTokenMethod: 'POST',
      apiTokenPath: 'access_token',
      requestTimeoutMs: '60000'
    }
  },
  {
    label: 'Matrix chart response',
    description: 'Turns label and series arrays into rows for charts and pivot-style tables.',
    patch: {
      apiBody: JSON.stringify({ fromDate: '{{fromDate}}', toDate: '{{toDate}}', companyId: '{{companyId}}' }, null, 2),
      apiDataPath: '',
      apiEndpoint: '/reports/sales-activity',
      apiMethod: 'POST',
      apiResponseMapping: JSON.stringify({
        type: 'matrix',
        rootPath: 'Data',
        labelPath: 'Xlabel',
        labelColumn: 'business_date',
        labelDateMode: 'fill_from_first_label',
        seriesPath: 'Name',
        seriesColumn: 'series',
        valueColumns: {
          sales: 'Data',
          orders: 'Count'
        }
      }, null, 2),
      apiResponseShape: 'matrix',
      requestTimeoutMs: '120000'
    }
  }
];
