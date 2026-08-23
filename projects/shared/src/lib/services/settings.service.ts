/**
 * Settings Service for managing extension settings
 */

import {inject, Injectable, Signal, signal} from '@angular/core';
import {Observable, of, throwError} from 'rxjs';
import {catchError, map, switchMap} from 'rxjs/operators';
import {MessagingService} from './messaging.service';
import {ModelService} from './model.service';
import {
  DEFAULT_SETTINGS,
  ExtensionSettings,
  PROVIDER_CONFIGS,
  PROVIDER_MODELS,
  ProviderType
} from '../models/settings.model';

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  // State
  private _settings = signal<ExtensionSettings>(DEFAULT_SETTINGS);
  readonly settings = this._settings.asReadonly();
  private _isLoading = signal<boolean>(false);
  private _error = signal<string | undefined>(undefined);
  readonly error = this._error.asReadonly();

  private messaging = inject(MessagingService);
  private modelService = inject(ModelService);

  constructor() {
  }

  /**
   * Load settings from storage
   */
  loadSettings(): Observable<ExtensionSettings> {
    this._isLoading.set(true);
    this._error.set(undefined);

    return this.messaging.getSettings().pipe(
      map((response) => {
        if (response.success && response.data) {
          // Merge with defaults
          const loadedSettings: ExtensionSettings = {
            ...DEFAULT_SETTINGS,
            ...response.data,
          };
          this._settings.set(loadedSettings);
          this._isLoading.set(false);
          return loadedSettings;
        } else {
          // Use defaults if no settings are saved
          this._isLoading.set(false);
          return DEFAULT_SETTINGS;
        }
      }),
      catchError((error) => {
        this._isLoading.set(false);
        this._error.set(error.message || 'Failed to load settings');
        // Return defaults
        return of(DEFAULT_SETTINGS);
      })
    );
  }

  /**
   * Save settings to storage
   */
  saveSettings(settings: Partial<ExtensionSettings>): Observable<ExtensionSettings> {
    this._isLoading.set(true);
    this._error.set(undefined);

    return this.messaging.saveSettings(settings).pipe(
      switchMap((response) => {
        if (response.success) {
          // Update local state
          this._settings.update(current => ({
            ...current,
            ...settings,
          }));
          this._isLoading.set(false);
          return of(this._settings());
        } else {
          this._isLoading.set(false);
          this._error.set(response.error || 'Failed to save settings');
          return throwError(() => new Error(response.error || 'Failed to save settings'));
        }
      }),
      catchError((error) => {
        this._isLoading.set(false);
        this._error.set(error.message || 'Failed to save settings');
        return throwError(() => error);
      })
    );
  }

  /**
   * Get a specific setting
   */
  getSetting<K extends keyof ExtensionSettings>(key: K): ExtensionSettings[K] {
    return this._settings()[key];
  }

  /**
   * Get available models for a specific provider
   * Checks cached dynamic models first, then falls back to hardcoded list
   */
  getAvailableModelsForProvider(provider: ProviderType): string[] {
    // First check if we have cached dynamic models
    const cachedModels = this.modelService.getCachedModels(provider);
    if (cachedModels.length > 0) {
      return cachedModels;
    }

    // Fall back to hardcoded models
    return PROVIDER_MODELS[provider] || [];
  }

  /**
   * Get the display name for a provider
   */
  getProviderDisplayName(provider: ProviderType): string {
    return PROVIDER_CONFIGS[provider]?.displayName || provider;
  }

  /**
   * Get all provider types
   */
  getProviderTypes(): ProviderType[] {
    return ['mistral', 'openai', 'anthropic', 'qwen', 'deepseek', 'custom'/*, 'firefox-ml'*/];
  }

  /**
   * Test a provider connection
   */
  testCurrentProvider(provider: ProviderType, apiKey: string): Observable<{ valid: boolean; error?: string }> {
    return this.messaging.testProvider(provider, apiKey).pipe(
      map((response) => {
        if (response.success && response.data) {
          return {valid: response.data.valid};
        } else {
          return {valid: false, error: response.error || 'Connection test failed'};
        }
      }),
      catchError((error) => {
        return of({valid: false, error: error.message || 'Connection test failed'});
      })
    );
  }

  /**
   * Refresh models for a specific provider from the API
   */
  refreshModels(provider: ProviderType, apiKey: string): Observable<string[]> {
    // Clear cache to start fresh and set loading state
    this.modelService.clearCache(provider);
    this.modelService.setLoading(provider, true);
    
    return this.messaging.refreshModels(provider, apiKey).pipe(
      map((response) => {
        if (response.success && response.data && response.data.models) {
          this.modelService.updateCachedModels(provider, response.data.models);
          return response.data.models;
        } else {
          // Store error in ModelService
          const errorMsg = response.error || 'Failed to refresh models';
          this.modelService.updateCachedModels(provider, [], errorMsg);
          throw new Error(errorMsg);
        }
      }),
      catchError((error) => {
        // Handle network/other errors
        const errorMessage = error.message || 'Failed to refresh models';
        this.modelService.updateCachedModels(provider, [], errorMessage);
        return throwError(() => error);
      })
    );
  }

  /**
   * Get model loading state for a provider
   */
  isModelsLoading(provider: ProviderType): boolean {
    return this.modelService.isLoading(provider);
  }

  /**
   * Get model error state for a provider
   */
  getModelsError(provider: ProviderType): string | undefined {
    return this.modelService.getError(provider);
  }

  /**
   * Get model error state for a provider as a signal
   * This allows proper signal dependency tracking in computed signals
   */
  getModelsErrorSignal(provider: ProviderType): Signal<string | undefined> {
    return this.modelService.getErrorSignal(provider);
  }

  /**
   * Clear the error state
   */
  clearError(): void {
    this._error.set(undefined);
  }

  /**
   * Reset settings to defaults
   */
  resetToDefaults(): Observable<ExtensionSettings> {
    return this.saveSettings(DEFAULT_SETTINGS);
  }

  // ============================================================================
  // ML Classification Settings Methods
  // ============================================================================

  /**
   * Get ML-specific settings
   */
  getMLSettings() {
    const settings = this._settings();
    return {
      mlEnabled: settings.mlEnabled,
      mlModelHub: settings.mlModelHub,
      mlModelId: settings.mlModelId,
    };
  }

  /**
   * Check if ML is enabled
   */
  isMLEnabled(): boolean {
    return this._settings().mlEnabled === true;
  }

  /**
   * Enable ML classification
   */
  enableML(): Observable<ExtensionSettings> {
    return this.saveSettings({mlEnabled: true});
  }

  /**
   * Disable ML classification
   */
  disableML(): Observable<ExtensionSettings> {
    return this.saveSettings({mlEnabled: false});
  }

  /**
   * Set ML model hub
   */
  setMLModelHub(hub: 'mozilla' | 'huggingface'): Observable<ExtensionSettings> {
    return this.saveSettings({mlModelHub: hub});
  }

  /**
   * Set ML model ID
   */
  setMLModelId(modelId: string): Observable<ExtensionSettings> {
    return this.saveSettings({mlModelId: modelId});
  }

  /**
   * Get available model hubs for ML
   */
  getMLModelHubs(): ('mozilla' | 'huggingface')[] {
    return ['mozilla', 'huggingface'];
  }

  /**
   * Get default ML model ID for a hub
   */
  getDefaultMLModelId(hub: 'mozilla' | 'huggingface'): string {
    const models = {
      mozilla: 'distilbert-base-uncased-finetuned-sst-2-english',
      huggingface: 'distilbert-base-uncased-finetuned-sst-2-english',
    };
    return models[hub] || models.mozilla;
  }

  /**
   * Validate ML settings
   */
  validateMLSettings(settings: Partial<ExtensionSettings>): { valid: boolean; errors: Record<string, string> } {
    const errors: Record<string, string> = {};

    if (settings.mlModelHub && !['mozilla', 'huggingface'].includes(settings.mlModelHub)) {
      errors['mlModelHub'] = 'Invalid model hub. Must be "mozilla" or "huggingface"';
    }

    if (settings.mlModelId && settings.mlModelId.trim() === '') {
      errors['mlModelId'] = 'Model ID cannot be empty';
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
    };
  }
}
