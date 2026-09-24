/**
 * Models for Mistral agent classification functionality
 */

/**
 * Request for Mistral agent classification
 */
export interface ClassifyWithAgentRequest {
  type: 'CLASSIFY_WITH_AGENT';
  summary: string;
  agentId: string;
  agentVersion: string;
}

/**
 * Response from Mistral agent classification
 */
export interface ClassifyWithAgentResponse {
  type: 'CLASSIFY_WITH_AGENT_RESPONSE';
  success: boolean;
  labels?: string[];
  error?: string;
}

/**
 * Mistral agent classification result stored with summary cache
 */
export interface AgentClassificationResult {
  labels: string[];
  agentId: string;
  agentVersion: string;
  timestamp: number;
}

/**
 * Mistral agent classification state for UI
 */
export interface AgentClassificationState {
  state: 'idle' | 'loading' | 'success' | 'error';
  labels?: string[];
  error?: string;
}
