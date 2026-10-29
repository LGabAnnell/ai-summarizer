import browser from 'webextension-polyfill';
import {createProvider} from '../providers';
import type {ArticleData} from '@shared/lib/models/article.model';
import type {ProviderType} from '@shared/lib/models/settings.model';
import type {ResolvedSettings} from './settings';
import {callFirefoxMLProvider} from './firefox-ml';

/**
 * Call the AI provider API to get a summary
 */
export async function callProviderAPI(
  article: ArticleData,
  settings: ResolvedSettings,
): Promise<{ summary: string; tokenCount?: number; error?: string }> {
  try {
    // Special handling for Firefox ML provider
    if (settings.provider === 'firefox-ml') {
      return await callFirefoxMLProvider(article, settings);
    }

    const provider = createProvider(
      settings.provider,
      settings.apiKey,
      {endpoint: settings.customEndpoint},
    );

    // Build the request
    const request = provider.buildRequest(
      article.textContent,
      article.title,
      {
        model: settings.model,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        summaryStyle: settings.summaryStyle,
        customPrompt: settings.customPrompt,
      },
    );

    // Make the API call
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify(request.body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.error?.message ?? errorJson.message ?? `HTTP ${response.status}`);
      } catch (parseError) {
        throw new Error(`HTTP ${response.status}: ${errorText}`, {cause: parseError});
      }
    }

    const responseData = await response.json();

    // Parse the response
    const providerResponse = provider.parseResponse(responseData);

    if (providerResponse.summary) {
      return {
        summary: providerResponse.summary,
        tokenCount: providerResponse.tokenCount,
      };
    } else {
      throw new Error('No summary returned from provider');
    }
  } catch (error) {
    return {
      summary: '',
      error: `Provider error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}


/**
 * Handle REFRESH_MODELS request
 */
export async function handleRefreshModels(providerType: ProviderType, apiKey: string): Promise<{
  success: boolean;
  data?: { models: string[] };
  error?: string
}> {
  try {
    // Firefox ML doesn't need API key and has fixed models
    if (providerType === 'firefox-ml') {
      // Return the fixed list of Firefox ML summarization models
      return {
        success: true,
        data: {
          models: [
            'Xenova/distilbart-cnn-6-6',
            'Xenova/distilbart-cnn-12-6',
          ],
        },
      };
    }

    if (!apiKey || apiKey.trim() === '') {
      return {success: false, error: 'API key is required'};
    }

    // Create provider instance
    const provider = createProvider(providerType, apiKey);

    // Call the provider's fetchModels method
    const models = (await provider.fetchModels(apiKey)).sort((a, b) => a.localeCompare(b));

    return {
      success: true,
      data: {models},
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to refresh models: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Test a provider connection
 */
export async function testProviderConnection(providerType: ProviderType, apiKey: string): Promise<{
  type: string;
  success: boolean;
  data?: { valid: boolean };
  error?: string
}> {
  try {
    // Firefox ML doesn't require an API key
    if (providerType === 'firefox-ml') {
      // Check permission
      const hasPermission = await browser.permissions.contains({permissions: ['trialML']});
      if (!hasPermission) {
        return {
          type: 'TEST_PROVIDER_RESPONSE',
          success: false,
          error: 'trialML permission is required for Firefox ML. Please grant permission in extension settings.',
        };
      }

      return {type: 'TEST_PROVIDER_RESPONSE', success: true, data: {valid: true}};
    }

    const result = await handleRefreshModels(providerType, apiKey);
    console.log('Background: Provider test result:', result);
    return {
      type: 'TEST_PROVIDER_RESPONSE',
      success: true,
      data: {valid: result.success},
      error: result.error,
    };
  } catch (error) {
    return {
      type: 'TEST_PROVIDER_RESPONSE',
      success: false,
      error: `Connection test failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
