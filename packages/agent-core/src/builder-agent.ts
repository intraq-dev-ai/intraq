import type {
  BuilderAgentRequest,
  BuilderAgentResult,
  DataModelRecommendation,
  DataModelRecommendationRequest
} from '@intraq/contracts';
import { planDashboardElement } from './builder-agent-dashboard-planner.js';
import { recommendDataModelForRequest } from './builder-agent-recommendation.js';

export class DashboardBuilderAgent {
  planDashboardElement(request: BuilderAgentRequest): BuilderAgentResult {
    return planDashboardElement(request);
  }

  recommendDataModel(request: DataModelRecommendationRequest): DataModelRecommendation {
    return recommendDataModelForRequest(request);
  }
}
