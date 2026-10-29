import type {ClassifyWithAgentRequest} from '@shared/lib/models/agent-classification.model';
import {getSettings} from './settings';

/**
 * Call Mistral agent for classification
 * Uses the Conversations API with the configured agent
 */
async function callMistralAgentClassification(
  summary: string,
  agentId: string,
  agentVersion: string,
  apiKey: string,
): Promise<{ labels?: string[]; error?: string }> {
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

    const responseData = await response.json();

    // Parse the response to extract the final message output
    // Mistral returns outputs through the `outputs` field
    // Each output has a `content` field directly (not message.content)
    if (responseData.outputs && Array.isArray(responseData.outputs) && responseData.outputs.length > 0) {
      // Get the final output
      const finalOutput = responseData.outputs[responseData.outputs.length - 1];

      // Check if it's a message output with content
      if (finalOutput.content) {
        try {
          // The content should be the JSON array of labels or a string
          let content = finalOutput.content;

          // Handle text chunks - content might be a string that needs parsing
          if (typeof content === 'string') {
            // Try to parse as JSON first
            try {
              content = JSON.parse(content);
            } catch {
              // Not JSON, use as-is
            }
          }

          // Now content should be the array of labels or still a string
          let labels: unknown[];
          if (Array.isArray(content)) {
            labels = content;
          } else if (typeof content === 'string') {
            // Try to parse the string as JSON
            try {
              const parsed = JSON.parse(content);
              labels = Array.isArray(parsed) ? parsed : [content];
            } catch {
              // Not JSON, treat as single label (but we need 5)
              labels = [content];
            }
          } else {
            return { error: 'Invalid content format in agent response' };
          }

          // Validate that we have exactly 5 nonempty strings
          if (labels.length === 5) {
            const validLabels = labels.filter((label: unknown) =>
              typeof label === 'string' && label.trim() !== '',
            );

            if (validLabels.length === 5) {
              return { labels: validLabels as string[] };
            } else {
              return { error: 'Invalid label format: expected 5 nonempty strings' };
            }
          } else {
            return { error: `Invalid label format: expected array of 5 strings, got ${labels.length} items` };
          }
        } catch (parseError) {
          console.error('Failed to parse agent response:', parseError);
          return { error: 'Failed to parse agent response as JSON array' };
        }
      } else {
        return { error: 'No content in final agent output' };
      }
    } else {
      return { error: 'No outputs in agent response' };
    }
  } catch (error) {
    return {
      error: `Agent classification error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Handle CLASSIFY_WITH_AGENT request
 */
export async function handleClassifyWithAgent(request: ClassifyWithAgentRequest): Promise<{
  type: string;
  success: boolean;
  labels?: string[];
  error?: string;
}> {
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
