import browser from 'webextension-polyfill';
import {ArticleData} from '@shared/lib/models/article.model';
import {CachedSummaryData} from '@shared/lib/models/summary.model';
import {ResolvedSettings} from './settings';

export const CACHE_PREFIX = 'summary_cache_';

function generateCacheKey(article: ArticleData, settings: Partial<ResolvedSettings>): string {
  const keyParts = [
    article.url,
    settings.provider ?? 'mistral',
    settings.model ?? 'mistral-tiny',
    settings.customPrompt ?? '',
    settings.summaryStyle ?? 'concise',
  ].join('|');
  return CACHE_PREFIX + btoa(encodeURIComponent(keyParts));
}

export async function getCachedSummary(
  article: ArticleData,
  settings: Partial<ResolvedSettings>,
): Promise<{summary: string; agentLabels?: string[]} | null> {
  const cacheKey = generateCacheKey(article, settings);
  const result = await browser.storage.local.get(cacheKey) as Record<string, CachedSummaryData>;
  if (result[cacheKey]) {
    const cached = result[cacheKey];
    if (cached.timestamp && Date.now() - cached.timestamp < (settings.cacheTTL ?? 7) * 24 * 60 * 60 * 1000) {
      return {summary: cached.summary, agentLabels: cached.agentLabels};
    }
    await browser.storage.local.remove(cacheKey);
  }
  return null;
}

export async function cacheSummary(
  article: ArticleData,
  settings: Partial<ResolvedSettings>,
  summary: string,
  agentLabels?: string[],
): Promise<void> {
  const cacheKey = generateCacheKey(article, settings);
  const cacheData: CachedSummaryData = {
    summary,
    timestamp: Date.now(),
    url: article.url,
    provider: settings.provider ?? 'mistral',
    model: settings.model ?? 'mistral-tiny',
  };
  if (agentLabels && agentLabels.length > 0) {
    cacheData.agentLabels = agentLabels;
    cacheData.agentId = settings.mistralAgentId;
    cacheData.agentVersion = settings.mistralAgentVersion;
  }
  await browser.storage.local.set({[cacheKey]: cacheData});
}

export async function handleClearCache(): Promise<{
  type: string;
  success: boolean;
  data?: {cleared: number};
  error?: string;
}> {
  try {
    const keys = await browser.storage.local.getKeys();
    const cacheKeys = keys.filter(key => key.startsWith(CACHE_PREFIX));
    await browser.storage.local.remove(cacheKeys);
    return {type: 'CLEAR_CACHE_RESPONSE', success: true, data: {cleared: cacheKeys.length}};
  } catch (error) {
    return {type: 'CLEAR_CACHE_RESPONSE', success: false, error: `Failed to clear cache: ${error}`};
  }
}
