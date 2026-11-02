import type {ClassifyWithAgentRequest, ClassifyWithAgentResponse} from '@shared/lib/models/agent-classification.model';
import {getSettings, type ResolvedSettings} from './settings';

interface MistralAgentOutput {
  type?: string;
  content?: unknown;
}

interface MistralAgentResponse {
  outputs?: unknown;
}

interface MistralAgentClassificationResult {
  labels?: string[];
  error?: string;
}

type MistralAgentRecord = Record<string, unknown> & {
  labels?: unknown;
  tags?: unknown;
  text?: unknown;
  type?: unknown;
};

function isRecord(value: unknown): value is MistralAgentRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripJsonFence(value: string): string {
  const match = value.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1] : value.trim();
}

function parseLabels(content: unknown): MistralAgentClassificationResult {
  let parsed: unknown = content;

  if (typeof parsed === 'string') {
    const text = stripJsonFence(parsed);
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = text;
    }
  }

  if (isRecord(parsed)) {
    if ('labels' in parsed) {
      parsed = parsed.labels;
    } else if ('tags' in parsed) {
      parsed = parsed.tags;
    }
  }

  if (typeof parsed === 'string') {
    return {error: 'Invalid label format: expected array of 5 strings, got 1 items'};
  }
  if (!Array.isArray(parsed)) {
    return {error: 'Invalid content format in agent response: expected a label array'};
  }
  if (parsed.length !== 5) {
    return {error: `Invalid label format: expected array of 5 strings, got ${parsed.length} items`};
  }
  if (!parsed.every((label): label is string => typeof label === 'string' && label.trim() !== '')) {
    return {error: 'Invalid label format: expected 5 nonempty strings'};
  }
  return {labels: parsed};
}

function normalizeContent(content: unknown): unknown {
  if (!Array.isArray(content) || content.every(item => typeof item === 'string')) return content;

  const textChunks: string[] = [];
  for (const chunk of content) {
    if (typeof chunk === 'string') {
      textChunks.push(chunk);
    } else if (isRecord(chunk) && typeof chunk.text === 'string') {
      textChunks.push(chunk.text);
    } else {
      return content;
    }
  }
  return textChunks.join('');
}

/**
 * Call Mistral agent for classification
 * Uses the Conversations API with the configured agent
 */
async function callMistralAgentClassification(
  summary: string,
  agentId: string,
  agentVersion: string,
  apiKey: string,
): Promise<MistralAgentClassificationResult> {
  try {
    // Check that we have valid agent configuration
    if (!agentId || !agentVersion) {
      return { error: 'Agent ID and version are required for classification' };
    }

    if (!apiKey) {
      return { error: 'API key is required for Mistral agent classification' };
    }

    // Build the request for Mistral Conversations API
    // Send inputs as a user message with role and content
    const requestBody = {
      agent_id: agentId,
      agent_version: agentVersion,
      inputs: [
        {
          role: 'user',
          content: summary,
        },
      ],
      store: false,
    };

    // Call Mistral Conversations API
    const response = await fetch('https://api.mistral.ai/v1/conversations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      // 30-second timeout as per requirements
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.error?.message ?? errorJson.message ?? `HTTP ${response.status}`);
      } catch (parseError) {
        throw new Error(`HTTP ${response.status}: ${errorText}`, { cause: parseError });
      }
    }

    const responseData = await response.json() as MistralAgentResponse;

    // Parse the response to extract the final message output
    // Mistral returns outputs through the `outputs` field
    // Each output has a `content` field directly (not message.content)
    if (!Array.isArray(responseData.outputs) || responseData.outputs.length === 0) {
      return {error: 'No outputs in agent response'};
    }

    const messageOutputs = responseData.outputs.filter((output): output is MistralAgentOutput =>
      isRecord(output) && (output.type === undefined || output.type === 'message.output'),
    );
    const finalOutput = messageOutputs[messageOutputs.length - 1];
    if (!finalOutput) return {error: 'No message output in agent response'};
    if (finalOutput.content === undefined || finalOutput.content === null) {
      return {error: 'No content in final agent output'};
    }
    return parseLabels(normalizeContent(finalOutput.content));
  } catch (error) {
    return {
      error: `Agent classification error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** Classify a summary with already-resolved settings for the summarize flow. */
export async function classifySummaryWithMistralAgent(
  summary: string,
  settings: ResolvedSettings,
): Promise<{labels?: string[]; error?: string}> {
  if (settings.provider !== 'mistral' || !settings.mistralAgentId || !settings.mistralAgentVersion) {
    return {};
  }
  if (!settings.apiKey) return {error: 'Mistral API key is required for agent classification'};
  return callMistralAgentClassification(
    summary,
    settings.mistralAgentId,
    settings.mistralAgentVersion,
    settings.apiKey,
  );
}

/**
 * Handle CLASSIFY_WITH_AGENT request
 */
export async function handleClassifyWithAgent(request: ClassifyWithAgentRequest): Promise<ClassifyWithAgentResponse> {
  try {
    const settings = await getSettings();

    // Only proceed if Mistral is the provider and agent is configured
    if (settings.provider !== 'mistral' || !settings.mistralAgentId || !settings.mistralAgentVersion) {
      return {
        type: 'CLASSIFY_WITH_AGENT_RESPONSE',
        success: false,
        error: 'Mistral agent classification requires Mistral provider with valid agent ID and version',
      };
    }

    const result = await callMistralAgentClassification(
      request.summary,
      request.agentId || settings.mistralAgentId,
      request.agentVersion || settings.mistralAgentVersion,
      settings.apiKey,
    );

    if (result.labels) {
      return {
        type: 'CLASSIFY_WITH_AGENT_RESPONSE',
        success: true,
        labels: result.labels,
      };
    } else {
      return {
        type: 'CLASSIFY_WITH_AGENT_RESPONSE',
        success: false,
        error: result.error ?? 'Agent classification failed',
      };
    }
  } catch (error) {
    console.error('Background: Error in handleClassifyWithAgent:', error);
    return {
      type: 'CLASSIFY_WITH_AGENT_RESPONSE',
      success: false,
      error: error instanceof Error ? error.message : 'Agent classification error',
    };
  }
}
