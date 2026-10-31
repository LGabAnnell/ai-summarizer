import {ArticleData} from '@shared/lib/models/article.model';
import {SummarizeResponse} from '@shared/lib/models/summary.model';
import {ProviderType} from '@shared/lib/models/settings.model';
import {ClassificationResult, textClassifierService} from '../ml/text-classifier.service';
import {getSettings, type ResolvedSettings} from './settings';
import {cacheSummary, getCachedSummary, updateCachedAgentLabels} from './summary-cache';
import {callProviderAPI} from './provider-client';
import {classifySummaryWithMistralAgent} from './agent-classification';

type ClassificationProjection = Pick<ClassificationResult, 'label' | 'score' | 'modelId' | 'inferenceTime' | 'ok'>;
type AgentClassificationProjection = {labels?: string[]; error?: string};

async function classifyAgentSummary(
  summary: string,
  provider: ProviderType,
  settings: ResolvedSettings,
  cached?: {agentLabels?: string[]; agentId?: string; agentVersion?: string},
): Promise<AgentClassificationProjection> {
  if (provider !== 'mistral' || settings.provider !== 'mistral' || !settings.mistralAgentId || !settings.mistralAgentVersion) {
    return {};
  }
  const sameAgent = cached?.agentId === settings.mistralAgentId
    && cached.agentVersion === settings.mistralAgentVersion;
  if (cached?.agentLabels?.length === 5 && sameAgent) {
    return {labels: cached.agentLabels};
  }
  try {
    const result = await classifySummaryWithMistralAgent(summary, settings);
    if (result.labels?.length === 5) return {labels: result.labels};
    return {error: result.error ?? 'Mistral agent returned invalid labels'};
  } catch (error) {
    return {error: error instanceof Error ? error.message : String(error)};
  }
}

async function classifySummary(
  text: string,
  settings: ResolvedSettings,
): Promise<ClassificationProjection | undefined> {
  if (!settings.mlEnabled) return undefined;

  try {
    const classification = await textClassifierService.classifyText(text, {
      timeout: settings.mlTimeout,
      modelHub: settings.mlModelHub,
      // NOTE: NOT passing modelId - using task-based approach
    });

    if (!classification.ok) {
      return undefined;
    }

    return {
      label: classification.label,
      score: classification.score,
      modelId: classification.modelId,
      inferenceTime: classification.inferenceTime,
      ok: classification.ok,
    };
  } catch {
    return undefined;
  }
}

/**
 * Handle summarization request
 */
export async function handleSummarize(
  article: ArticleData,
  providerOverride?: ProviderType,
): Promise<SummarizeResponse> {
  try {
    // Get settings
    const settings = await getSettings();

    // Use provider override if specified
    const provider: ProviderType = providerOverride ?? settings.provider;

    // Check cache first
    if (settings.cacheEnabled) {
      const cachedSummary = await getCachedSummary(article, {
        provider,
        model: settings.model,
        customPrompt: settings.customPrompt,
        summaryStyle: settings.summaryStyle,
      });

      if (cachedSummary) {
        const agentClassification = await classifyAgentSummary(
          cachedSummary.summary,
          provider,
          settings,
          cachedSummary,
        );
        if (agentClassification.labels && (
          cachedSummary.agentLabels?.join('\u0000') !== agentClassification.labels.join('\u0000')
          || cachedSummary.agentId !== settings.mistralAgentId
          || cachedSummary.agentVersion !== settings.mistralAgentVersion
        )) {
          try {
            await updateCachedAgentLabels(article, {...settings, provider}, agentClassification.labels);
          } catch (error) {
            console.warn('Failed to update cached agent labels; returning the classified summary:', error);
          }
        }
        const classification = await classifySummary(cachedSummary.summary, settings);

        return {
          type: 'SUMMARIZE_RESPONSE',
          summary: cachedSummary.summary,
          success: true,
          cached: true,
          agentLabels: agentClassification.labels,
          agentClassificationError: agentClassification.error,
          classification,
        };
      }
    }

    // Call the actual AI provider API
    const result = await callProviderAPI(article, settings);

    if (result.error) {
      return {
        type: 'SUMMARIZE_RESPONSE',
        error: result.error,
        success: false,
      };
    }

    const agentClassification = await classifyAgentSummary(result.summary || '', provider, settings);

    // Store summary and agent labels together to avoid a second write.
    if (settings.cacheEnabled) {
      await cacheSummary(article, settings, result.summary ?? '', agentClassification.labels);
    }

    const classification = await classifySummary(result.summary || '', settings);

    return {
      type: 'SUMMARIZE_RESPONSE',
      summary: result.summary,
      success: true,
      cached: false,
      tokenCount: result.tokenCount,
      agentLabels: agentClassification.labels,
      agentClassificationError: agentClassification.error,
      classification, // Only include if successful
    };
  } catch (error) {
    return {
      type: 'SUMMARIZE_RESPONSE',
      error: `Summarization error: ${error instanceof Error ? error.message : String(error)}`,
      success: false,
    };
  }
}
