/**
 * Model Service for managing dynamic model lists from provider APIs
 */

import {Service, signal} from '@angular/core';
import {Observable, of, throwError} from 'rxjs';
import {catchError, map, switchMap} from 'rxjs/operators';
import browser from 'webextension-polyfill';
import {ProviderType} from '../models/settings.model';

// Interface for AI provider instances that can fetch models
export interface ModelProvider {
  fetchModels(apiKey: string): Promise<string[]>;
}

// Cache for fetched models
interface ModelCacheEntry {
  models: string[];
  timestamp: number;
  loading: boolean;
  error?: string;
}

/**
 * Storage key for persisted model lists, differentiated by provider.
 */
const MODELS_STORAGE_KEY = 'ai-summarizer-models';

/**
 * Shape of the persisted model cache: a map of provider -> cache entry.
 */
type PersistedModelCache = Record<string, ModelCacheEntry>;

@Service()
export class ModelService {
  // Cache TTL in milliseconds (5 minutes)
  private readonly CACHE_TTL = 5 * 60 * 1000;

  // State signals per provider
  private _modelsCache = signal<Record<ProviderType, ModelCacheEntry>>({
    mistral: {models: [], timestamp: 0, loading: false},
    openai: {models: [], timestamp: 0, loading: false},
    anthropic: {models: [], timestamp: 0, loading: false},
    qwen: {models: [], timestamp: 0, loading: false},
    deepseek: {models: [], timestamp: 0, loading: false},
    custom: {models: [], timestamp: 0, loading: false},
    'firefox-ml': {models: [], timestamp: 0, loading: false},
  });

  constructor() {
    this.loadFromStorage();
  }

  /**
   * Get the loading state for a specific provider
   */
  isLoading(provider: ProviderType): boolean {
    return this._modelsCache()[provider]?.loading || false;
  }

  /**
   * Get the error state for a specific provider
   */
  getError(provider: ProviderType): string | undefined {
    return this._modelsCache()[provider]?.error;
  }

  /**
   * Get cached models for a specific provider
   */
  getCachedModels(provider: ProviderType): string[] {
    const entry = this._modelsCache()[provider];
    if (!entry) return [];

    // Return cached models if still valid
    if (entry.models.length > 0 &&
      (Date.now() - entry.timestamp) < this.CACHE_TTL &&
      !entry.error) {
      return entry.models;
    }

    return [];
  }

  /**
   * Check if models are cached and valid for a specific provider
   */
  hasValidCache(provider: ProviderType): boolean {
    const entry = this._modelsCache()[provider];
    if (!entry || entry.error) return false;

    return entry.models.length > 0 &&
      (Date.now() - entry.timestamp) < this.CACHE_TTL;
  }

  /**
   * Clear cache for a specific provider
   */
  clearCache(provider: ProviderType): void {
    this._modelsCache.update(cache => ({
      ...cache,
      [provider]: {models: [], timestamp: 0, loading: false, error: undefined}
    }));
    this.saveToStorage();
  }

  /**
   * Update cached models for a provider
   */
  updateCachedModels(provider: ProviderType, models: string[], error?: string): void {
    this._modelsCache.update(cache => ({
      ...cache,
      [provider]: {
        models,
        timestamp: Date.now(),
        loading: false,
        error
      }
    }));
    this.saveToStorage();
  }

  /**
   * Fetch models from a provider API using the provider's fetchModels method
   * This is a proxy method that will be used by the settings service
   */
  async fetchModelsFromProvider(
    provider: ProviderType,
    apiKey: string,
    providerInstance: ModelProvider
  ): Promise<string[]> {
    // Set loading state
    this.setLoading(provider, true);

    try {
      // Call the provider's fetchModels method
      const models = await providerInstance.fetchModels(apiKey);

      // Update cache
      this.updateCachedModels(provider, models);

      return models;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch models';
      this.updateCachedModels(provider, [], errorMessage);
      throw error;
    }
  }

  /**
   * Refresh models for a specific provider
   * This creates an observable for Angular integration
   */
  refreshModels(
    provider: ProviderType,
    apiKey: string,
    providerInstance: ModelProvider
  ): Observable<string[]> {
    return of([]).pipe(
      map(() => {
        // Clear previous cache
        this.clearCache(provider);
        this.setLoading(provider, true);
        return [];
      }),
      switchMap(() => {
        return new Observable<string[]>(subscriber => {
          this.fetchModelsFromProvider(provider, apiKey, providerInstance)
            .then(models => {
              subscriber.next(models);
              subscriber.complete();
            })
            .catch(error => {
              subscriber.error(error);
            });
        });
      }),
      catchError((error) => {
        this.setLoading(provider, false, error.message);
        return throwError(() => error);
      })
    );
  }

  /**
   * Hydrate the in-memory cache from browser.storage.local so previously
   * fetched models remain available across sessions. The timestamp is
   * refreshed to now so the in-memory TTL treats persisted entries as fresh.
   */
  private async loadFromStorage(): Promise<void> {
    try {
      if (typeof browser === 'undefined' || !browser.storage) return;
      const result = await browser.storage.local.get(MODELS_STORAGE_KEY) as Record<string, PersistedModelCache>;
      const persisted = result[MODELS_STORAGE_KEY];
      if (!persisted) return;

      const now = Date.now();
      this._modelsCache.update(cache => {
        const next = {...cache};
        for (const [provider, entry] of Object.entries(persisted)) {
          if (entry && Array.isArray(entry.models) && entry.models.length > 0) {
            next[provider as ProviderType] = {
              models: entry.models,
              timestamp: now,
              loading: false,
              error: undefined,
            };
          }
        }
        return next;
      });
    } catch (error) {
      console.error('Failed to load cached models from storage:', error);
    }
  }

  /**
   * Persist the current cache to browser.storage.local, differentiated by provider.
   */
  private async saveToStorage(): Promise<void> {
    try {
      if (typeof browser === 'undefined' || !browser.storage) return;
      const cache = this._modelsCache();
      const persisted: PersistedModelCache = {};
      for (const [provider, entry] of Object.entries(cache)) {
        if (entry.models.length > 0 && !entry.error) {
          persisted[provider] = {
            models: entry.models,
            timestamp: entry.timestamp,
            loading: false,
          };
        }
      }
      await browser.storage.local.set({[MODELS_STORAGE_KEY]: persisted});
    } catch (error) {
      console.error('Failed to persist cached models to storage:', error);
    }
  }

  /**
   * Set loading state for a provider
   */
  private setLoading(provider: ProviderType, loading: boolean, error?: string): void {
    this._modelsCache.update(cache => ({
      ...cache,
      [provider]: {
        ...cache[provider],
        loading,
        error: error || undefined
      }
    }));
  }
}