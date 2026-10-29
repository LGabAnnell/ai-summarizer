import browser from 'webextension-polyfill';
import type {ArticleData} from '@shared/lib/models/article.model';
import type {SummaryStyle} from '@shared/lib/models/summary-prompts.model';
import type {ResolvedSettings} from './settings';
import {MLEngineConfig, mlEngineManager} from '../ml/ml-engine-manager';

/**
 * Call Firefox ML API for local summarization
 * Uses mlEngineManager abstraction instead of direct browser.trial.ml API calls
 */
export async function callFirefoxMLProvider(
  article: ArticleData,
  settings: ResolvedSettings,
): Promise<{ summary: string; tokenCount?: number; error?: string }> {
  try {
    // Check if we have the trialML permission
    const hasPermission = await browser.permissions.contains({permissions: ['trialML']});
    if (!hasPermission) {
      throw new Error('trialML permission is required for Firefox ML. Please grant the permission in the extension options or settings.');
    }

    // Get the model to use
    const model = settings.model ?? 'Xenova/distilbart-cnn-6-6';
    const temperature = settings.temperature ?? 0.7;
    const maxTokens = settings.maxTokens ?? 500;

    // Create summarization prompt with system prompt
    const systemPrompt = getSystemPrompt(settings.summaryStyle, settings.customPrompt);

    // Build the prompt for summarization
    // Firefox ML summarization models typically expect a direct instruction
    const prompt = `${systemPrompt}\n\nArticle: ${article.title || 'Untitled'}\n\n${article.textContent}`;

    console.log('Firefox ML: Creating summarization engine with model:', model);

    try {
      // Configure the summarization engine with task-specific options
      const engineConfig: Partial<MLEngineConfig> = {
        taskName: 'summarization',
        modelHub: 'mozilla',
        modelId: model,
        taskOptions: {
          max_length: maxTokens,
          min_length: 30,
          do_sample: temperature > 0,
          temperature: temperature,
          num_return_sequences: 1,
        },
      };

      // Get or create the engine using mlEngineManager
      const timeout = settings.mlTimeout ?? 720000;
      const result = await mlEngineManager.runEngine(prompt, timeout, engineConfig);

      console.log('Firefox ML: Engine execution completed, result:', result);

      // Handle the result
      // For summarization, the result is typically an array with summary_text in the first element
      if (Array.isArray(result) && result.length > 0) {
        const firstResult = result[0];
        let summary: string = firstResult?.summary_text ?? '';

        if (summary?.trim()) {
          // Clean up the summary by removing any trailing special tokens
          // Firefox ML models may add their own stop tokens
          summary = summary.trim();

          console.log('Firefox ML: Successfully generated summary:', `${summary.substring(0, 200)}...`);

          return {
            summary: summary,
            tokenCount: estimateTokenCount(summary),
          };
        } else {
          throw new Error('Firefox ML returned empty summary');
        }
      } else {
        throw new Error('Firefox ML returned no results');
      }
    } catch (mlError) {
      console.error('Firefox ML: Error during model execution:', mlError);

      // Enhanced error messages for Firefox ML
      const errorMessage = mlError instanceof Error ? mlError.message : String(mlError);

      if (errorMessage.includes('permission') || errorMessage.includes('Permission')) {
        throw new Error(
          'ML permission denied. Please grant trialML permission in extension settings and ensure Firefox ML is enabled in about:config (browser.ml.enable and extensions.ml.enabled must be true).',
          {cause: mlError},
        );
      }

      if (errorMessage.includes('model') || errorMessage.includes('Model')) {
        throw new Error(
          `Model ${model} not available. Firefox ML models need to be downloaded on first use. Check that you have internet connectivity for the initial model download.`,
          {cause: mlError},
        );
      }

      if (errorMessage.includes('unavailable') || errorMessage.includes('not available')) {
        throw new Error(
          'Firefox ML API is not available in this Firefox version. Requires Firefox Nightly or Beta with ML enabled in about:config.',
          {cause: mlError},
        );
      }

      throw new Error(`Firefox ML error: ${errorMessage}`, {cause: mlError});
    }
  } catch (error) {
    return {
      summary: '',
      error: `Firefox ML error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Estimate token count for text (used by Firefox ML)
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}



/**
 * Get system prompt for summarization (moved here to avoid circular dependency)
 */
export function getSystemPrompt(style?: SummaryStyle, customPrompt?: string): string {
  const SUMMARY_PROMPTS: Record<string & SummaryStyle, string> = {
    concise: 'You are a helpful assistant that summarizes articles. Please provide a concise summary in 2-3 sentences.',
    detailed: 'You are a helpful assistant that summarizes articles. Please provide a detailed summary covering all the main points.',
    bullet_points: 'You are a helpful assistant that summarizes articles. Please provide a bullet-point summary of the key points.',
    custom: '',
  };

  // Use custom prompt if provided
  if (customPrompt && customPrompt.trim() !== '') {
    return customPrompt;
  }

  return SUMMARY_PROMPTS[style ?? 'concise'];
}
