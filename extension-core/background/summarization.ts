import {ArticleData} from '@shared/lib/models/article.model';
import {SummarizeResponse} from '@shared/lib/models/summary.model';
import {ProviderType} from '@shared/lib/models/settings.model';
import {ClassificationResult, textClassifierService} from '../ml/text-classifier.service';
import {getSettings, ResolvedSettings} from './settings';
import {cacheSummary, getCachedSummary} from './summary-cache';
import {callProviderAPI} from './provider-client';

type ClassificationProjection = Pick<ClassificationResult, 'label' | 'score' | 'modelId' | 'inferenceTime' | 'ok'>;

async function classifySummary(
  text: string,
  settings: ResolvedSettings,
  context: 'cached' | 'fresh',
): Promise<ClassificationProjection | undefined> {
  if (!settings.mlEnabled) return undefined;

  try {
    console.log(`Background: Running ML classification on ${context === 'cached' ? 'cached ' : ''}summary...`);
    const classification = await textClassifierService.classifyText(text, {
      timeout: settings.mlTimeout,
      modelHub: settings.mlModelHub,
      // NOTE: NOT passing modelId - using task-based approach
    });

    if (!classification.ok) {
      console.warn(`Background: ML classification failed${context === 'cached' ? ' for cached summary' : ''}:`, classification.error);
      return undefined;
    }

    console.log(`Background: ML classification completed${context === 'cached' ? ' for cached summary' : ''}:`, classification);
    return {
      label: classification.label,
      score: classification.score,
      modelId: classification.modelId,
      inferenceTime: classification.inferenceTime,
      ok: classification.ok,
    };
  } catch (classificationError) {
    console.error(`Background: ML classification error${context === 'cached' ? ' for cached summary' : ''}:`, classificationError);
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
        const classification = await classifySummary(cachedSummary.summary, settings, 'cached');

        return {
          type: 'SUMMARIZE_RESPONSE',
          summary: cachedSummary.summary,
          success: true,
          cached: true,
          // Include cached agent labels if present
          agentLabels: cachedSummary.agentLabels,
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

    // Cache the result (without agent labels initially)
    if (settings.cacheEnabled) {
      await cacheSummary(article, settings, result.summary ?? '');
    }

    const classification = await classifySummary(result.summary || '', settings, 'fresh');

    return {
      type: 'SUMMARIZE_RESPONSE',
      summary: result.summary,
      success: true,
      cached: false,
      tokenCount: result.tokenCount,
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
