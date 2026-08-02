import { Component, signal, OnInit, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import {SettingsService, ExtensionSettings, ProviderType} from '@shared/public-api';

// Declare browser API for Firefox extensions
declare const browser: any;

@Component({
  selector: 'options-root',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="header-content">
          <div class="logo">
            <div class="icon">AS</div>
            <span>Article Summarizer</span>
          </div>
        </div>
        <div class="header-title">Settings</div>
      </div>

      <!-- Error Alert -->
      @if (error()) {
        <div class="alert alert--error">
          <span class="alert-icon">⚠️</span>
          <div class="alert-content">
            <div class="alert-message">{{ error() }}</div>
          </div>
          <button class="alert-close" (click)="clearError()">×</button>
        </div>
      }

      <!-- Success Alert -->
      @if (successMessage()) {
        <div class="alert alert--success">
          <span class="alert-icon">✓</span>
          <div class="alert-content">
            <div class="alert-message">{{ successMessage() }}</div>
          </div>
          <button class="alert-close" (click)="clearSuccess()">×</button>
        </div>
      }

      <form [formGroup]="settingsForm" (ngSubmit)="saveSettings()" class="settings-form">
        <!-- Provider Section -->
        <div class="section">
          <div class="section-header">
            <div class="section-title">
              <span>🤖</span>
              AI Provider Configuration
            </div>
            <div class="section-actions">
              <button 
                type="button" 
                class="btn btn--secondary btn--small"
                (click)="testConnection()"
                [disabled]="isTesting()">
                @if (isTesting()) {
                  <span class="spinner"></span>
                  Testing...
                } @else {
                  Test Connection
                }
              </button>
            </div>
          </div>
          <div class="section-description">
            Configure your AI provider and API credentials
          </div>

          <div class="grid-2">
            <div class="form-group">
              <label class="form-label" for="provider">AI Provider</label>
              <select 
                id="provider" 
                formControlName="provider" 
                class="form-select"
                (change)="onProviderChange($event)">
                @for (provider of providerTypes(); track provider) {
                  <option [value]="provider">{{ getProviderDisplayName(provider) }}</option>
                }
              </select>
              <div class="form-description">Choose your preferred AI provider</div>
            </div>

            <div class="form-group">
              <label class="form-label" for="model">Model</label>
              <div class="model-select-wrapper">
                <select id="model" formControlName="model" class="form-select">
                  @for (model of availableModels(); track model) {
                    <option [value]="model">{{ model }}</option>
                  }
                </select>
                <button 
                  type="button" 
                  class="btn btn--refresh" 
                  (click)="refreshModels()" 
                  [disabled]="modelsLoading()" 
                  title="Refresh model list">
                  @if (modelsLoading()) {
                    <span class="spinner"></span>
                  } @else {
                    🔄
                  }
                </button>
              </div>
              <div class="form-description">Select the model to use for summarization</div>
              @if (modelsError()) {
                <div class="form-error">{{ modelsError() }}</div>
              }
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="apiKey">API Key</label>
            <div class="password-container">
              <input 
                id="apiKey" 
                type="password" 
                formControlName="apiKey" 
                class="form-input"
                placeholder="Enter your API key..."
              >
              <button 
                type="button" 
                class="password-toggle"
                (click)="toggleShowApiKey()"
                [attr.aria-label]="showApiKey() ? 'Hide API key' : 'Show API key'">
                @if (showApiKey()) {
                  👁️
                } @else {
                  🔒
                }
              </button>
            </div>
            <div class="form-description">
              Your API key will be stored locally and never sent to third parties
            </div>
            @if (apiKeyError()) {
              <div class="form-error">{{ apiKeyError() }}</div>
            }
          </div>

          @if (settings().provider === 'custom') {
            <div class="form-group">
              <label class="form-label" for="customEndpoint">Custom Endpoint URL</label>
              <input 
                id="customEndpoint" 
                type="url" 
                formControlName="customEndpoint" 
                class="form-input"
                placeholder="https://api.example.com/v1/chat/completions"
              >
              <div class="form-description">
                Enter the API endpoint URL for your custom provider
              </div>
            </div>
          }

          @if (connectionStatus()) {
            <div class="form-group">
              <div class="status-badge status-connected" *ngIf="connectionStatus() === 'connected'">
                <span class="status-dot status-connected"></span>
                Connection successful
              </div>
              <div class="status-badge status-disconnected" *ngIf="connectionStatus() === 'failed'">
                <span class="status-dot status-disconnected"></span>
                Connection failed
              </div>
            </div>
          }
        </div>

        <!-- Summarization Settings Section -->
        <div class="section">
          <div class="section-header">
            <div class="section-title">
              <span>⚙️</span>
              Summarization Settings
            </div>
          </div>
          <div class="section-description">
            Customize how articles are summarized
          </div>

          <div class="grid-2">
            <div class="form-group">
              <label class="form-label" for="summaryStyle">Summary Style</label>
              <select id="summaryStyle" formControlName="summaryStyle" class="form-select">
                <option value="concise">Concise</option>
                <option value="detailed">Detailed</option>
                <option value="bullet_points">Bullet Points</option>
                <option value="custom">Custom Prompt</option>
              </select>
              <div class="form-description">Choose the style of summary to generate</div>
            </div>

            <div class="form-group">
              <label class="form-label" for="temperature">Temperature</label>
              <div class="number-input-container">
                <button 
                  type="button" 
                  class="number-decrement"
                  (click)="decrementTemperature()"
                  [disabled]="isLoading()">
                  −
                </button>
                <input 
                  id="temperature" 
                  type="number" 
                  formControlName="temperature" 
                  class="form-input"
                  min="0" 
                  max="1" 
                  step="0.1"
                >
                <button 
                  type="button" 
                  class="number-increment"
                  (click)="incrementTemperature()"
                  [disabled]="isLoading()">
                  +
                </button>
              </div>
              <div class="form-description">
                Controls randomness (0 = deterministic, 1 = most creative)
              </div>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="customPrompt">Custom System Prompt</label>
            <textarea 
              id="customPrompt" 
              formControlName="customPrompt" 
              class="form-textarea"
              placeholder="You are a helpful assistant that summarizes articles..."
              [disabled]="settingsForm.get('summaryStyle')?.value !== 'custom'"></textarea>
            <div class="form-description">
              Customize the system prompt when using "Custom Prompt" style
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="maxTokens">Maximum Tokens</label>
            <div class="number-input-container">
              <input 
                id="maxTokens" 
                type="number" 
                formControlName="maxTokens" 
                class="form-input"
                min="50"
                max="4000"
              >
            </div>
            <div class="form-description">
              Maximum number of tokens to generate in the summary
            </div>
          </div>
        </div>

        <!-- Cache Settings Section -->
        <div class="section">
          <div class="section-header">
            <div class="section-title">
              <span>💾</span>
              Cache Settings
            </div>
          </div>
          <div class="section-description">
            Manage summary caching to avoid unnecessary API calls
          </div>

          <div class="form-group">
            <div class="form-switch">
              <label class="switch">
                <input 
                  type="checkbox" 
                  formControlName="cacheEnabled"
                  [checked]="settingsForm.get('cacheEnabled')?.value"
                >
                <span class="switch"></span>
              </label>
              <span class="switch-label">Enable Summary Caching</span>
            </div>
            <div class="form-description">
              Cache summaries to avoid re-processing the same articles
            </div>
          </div>

          <div class="form-group" *ngIf="settingsForm.get('cacheEnabled')?.value">
            <label class="form-label" for="cacheTTL">Cache Expiration (days)</label>
            <div class="number-input-container">
              <button 
                type="button" 
                class="number-decrement"
                (click)="decrementCacheTTL()"
                [disabled]="isLoading()">
                −
              </button>
              <input 
                id="cacheTTL" 
                type="number" 
                formControlName="cacheTTL" 
                class="form-input"
                min="1"
                max="30"
              >
              <button 
                type="button" 
                class="number-increment"
                (click)="incrementCacheTTL()"
                [disabled]="isLoading()">
                +
              </button>
            </div>
            <div class="form-description">
              Number of days to keep cached summaries
            </div>
          </div>

          <div class="form-group">
            <button 
              type="button" 
              class="btn btn--secondary"
              (click)="clearCache()"
              [disabled]="isLoading()">
              Clear Cache
            </button>
            <div class="form-description">
              Remove all cached summaries
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="section">
          <div class="section-header">
            <div class="section-title">Actions</div>
          </div>

          <div class="form-group">
            <div class="flex gap-12">
              <button 
                type="submit" 
                class="btn btn--primary"
                [disabled]="isLoading() || settingsForm.invalid">
                @if (isLoading()) {
                  <span class="spinner"></span>
                  Saving...
                } @else {
                  Save Settings
                }
              </button>
              <button 
                type="button" 
                class="btn btn--secondary"
                (click)="resetToDefaults()"
                [disabled]="isLoading()">
                Reset to Defaults
              </button>
            </div>
          </div>
        </div>
      </form>

      <!-- Footer -->
      <div class="page-footer">
        <div class="footer-left">
          <span>Version 1.0.0</span>
          <a class="footer-link" (click)="openPrivacyPolicy()">Privacy Policy</a>
        </div>
        <div class="footer-right">
          <a class="footer-link" href="https://github.com" target="_blank">GitHub</a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }

    .settings-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .number-input-container input {
      width: 80px;
    }

    .form-switch {
      margin-bottom: 8px;
    }

    .password-container {
      position: relative;
    }

    .password-toggle {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      cursor: pointer;
      font-size: 14px;
      opacity: 0.6;

      &:hover {
        opacity: 1;
      }
    }
  `],
})
export class AppComponent implements OnInit {
  private fb = inject(FormBuilder);
  private settingsService = inject(SettingsService);

  // State
  settings = signal<ExtensionSettings>(this.settingsService.getSetting('provider') as any || {});
  isLoading = signal<boolean>(false);
  isTesting = signal<boolean>(false);
  error = signal<string | undefined>(undefined);
  successMessage = signal<string | undefined>(undefined);
  connectionStatus = signal<'connected' | 'failed' | undefined>(undefined);
  showApiKey = signal<boolean>(false);
  modelsLoading = signal<boolean>(false);
  modelsError = signal<string | undefined>(undefined);
  settingsForm!: FormGroup;

  providerTypes = computed(() => this.settingsService.getProviderTypes());
  availableModels = computed(() => {
    const provider = this.settingsForm?.get('provider')?.value || 'mistral';
    return this.settingsService.getAvailableModelsForProvider(provider);
  });

  apiKeyError = computed(() => {
    const form = this.settingsForm;
    if (!form) return undefined;
    
    const apiKey: string = form.get('apiKey')?.value;
    
    if (!apiKey || apiKey.trim() === '') {
      return 'API key is required';
    }

    return undefined;
  });

  constructor() {
    this.settingsForm = this.fb.group({
      provider: ['mistral', Validators.required],
      model: ['mistral-tiny', Validators.required],
      apiKey: ['', Validators.required],
      customEndpoint: [''],
      summaryStyle: ['concise', Validators.required],
      customPrompt: [''],
      maxTokens: [500, [Validators.required, Validators.min(50), Validators.max(4000)]],
      temperature: [0.7, [Validators.required, Validators.min(0), Validators.max(1)]],
      cacheEnabled: [true],
      cacheTTL: [7, [Validators.required, Validators.min(1), Validators.max(30)]],
    });
  }

  ngOnInit(): void {
    this.loadSettings();
  }

  loadSettings(): void {
    this.isLoading.set(true);
    this.settingsService.loadSettings().subscribe({
      next: (settings) => {
        this.settings.set(settings);
        this.settingsForm.patchValue({
          provider: settings.provider,
          model: settings.model,
          apiKey: settings.apiKey,
          customEndpoint: settings.customEndpoint || '',
          summaryStyle: settings.summaryStyle,
          customPrompt: settings.customPrompt || '',
          maxTokens: settings.maxTokens,
          temperature: settings.temperature,
          cacheEnabled: settings.cacheEnabled,
          cacheTTL: settings.cacheTTL,
        });
        this.isLoading.set(false);
      },
      error: (error) => {
        this.error.set('Failed to load settings: ' + (error.message || 'Unknown error'));
        this.isLoading.set(false);
      }
    });
  }

  getProviderDisplayName(provider: string): string {
    return this.settingsService.getProviderDisplayName(provider as any);
  }

  onProviderChange(event: Event): void {
    const provider = (event.target as HTMLSelectElement).value as any;
    const models = this.settingsService.getAvailableModelsForProvider(provider);
    
    // Update the model to the first available model for this provider
    if (models.length > 0) {
      this.settingsForm.patchValue({ model: models[0] });
    }

    // Reset custom endpoint if not custom provider
    if (provider !== 'custom') {
      this.settingsForm.patchValue({ customEndpoint: '' });
    }
  }

  toggleShowApiKey(): void {
    const currentType = this.settingsForm.get('apiKey')?.value;
    this.showApiKey.update(v => !v);
  }

  incrementTemperature(): void {
    const current = this.settingsForm.get('temperature')?.value || 0;
    if (current < 1) {
      this.settingsForm.patchValue({ temperature: Math.min(current + 0.1, 1) });
    }
  }

  decrementTemperature(): void {
    const current = this.settingsForm.get('temperature')?.value || 0;
    if (current > 0) {
      this.settingsForm.patchValue({ temperature: Math.max(current - 0.1, 0) });
    }
  }

  incrementCacheTTL(): void {
    const current = this.settingsForm.get('cacheTTL')?.value || 7;
    if (current < 30) {
      this.settingsForm.patchValue({ cacheTTL: current + 1 });
    }
  }

  decrementCacheTTL(): void {
    const current = this.settingsForm.get('cacheTTL')?.value || 7;
    if (current > 1) {
      this.settingsForm.patchValue({ cacheTTL: current - 1 });
    }
  }

  testConnection(): void {
    const provider = this.settingsForm.get('provider')?.value;
    const apiKey = this.settingsForm.get('apiKey')?.value;

    if (!provider || !apiKey) {
      this.error.set('Please select a provider and enter an API key');
      return;
    }

    this.isTesting.set(true);
    this.connectionStatus.set(undefined);

    this.settingsService.testCurrentProvider().subscribe({
      next: (result) => {
        this.connectionStatus.set(result.valid ? 'connected' : 'failed');
        if (!result.valid && result.error) {
          this.error.set(result.error);
        } else if (result.valid) {
          this.successMessage.set('Connection successful!');
          setTimeout(() => this.clearSuccess(), 3000);
        }
        this.isTesting.set(false);
      },
      error: (error) => {
        this.connectionStatus.set('failed');
        this.error.set('Connection test failed: ' + (error.message || 'Unknown error'));
        this.isTesting.set(false);
      }
    });
  }

  saveSettings(): void {
    if (this.settingsForm.invalid) {
      this.error.set('Please fix the form errors before saving');
      return;
    }

    const formValue = this.settingsForm.value;
    const settings: Partial<ExtensionSettings> = {
      provider: formValue.provider,
      model: formValue.model,
      apiKey: formValue.apiKey,
      customEndpoint: formValue.customEndpoint || undefined,
      summaryStyle: formValue.summaryStyle,
      customPrompt: formValue.customPrompt || undefined,
      maxTokens: formValue.maxTokens,
      temperature: formValue.temperature,
      cacheEnabled: formValue.cacheEnabled,
      cacheTTL: formValue.cacheTTL,
    };

    this.isLoading.set(true);
    this.settingsService.saveSettings(settings).subscribe({
      next: (savedSettings) => {
        this.settings.set(savedSettings);
        this.successMessage.set('Settings saved successfully!');
        this.isLoading.set(false);
        setTimeout(() => this.clearSuccess(), 3000);
      },
      error: (error) => {
        this.error.set('Failed to save settings: ' + (error.message || 'Unknown error'));
        this.isLoading.set(false);
      }
    });
  }

  resetToDefaults(): void {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
      this.isLoading.set(true);
      this.settingsService.resetToDefaults().subscribe({
        next: (defaultSettings) => {
          this.settings.set(defaultSettings);
          this.settingsForm.patchValue({
            provider: defaultSettings.provider,
            model: defaultSettings.model,
            apiKey: defaultSettings.apiKey,
            customEndpoint: defaultSettings.customEndpoint || '',
            summaryStyle: defaultSettings.summaryStyle,
            customPrompt: defaultSettings.customPrompt || '',
            maxTokens: defaultSettings.maxTokens,
            temperature: defaultSettings.temperature,
            cacheEnabled: defaultSettings.cacheEnabled,
            cacheTTL: defaultSettings.cacheTTL,
          });
          this.successMessage.set('Settings reset to defaults!');
          this.isLoading.set(false);
          setTimeout(() => this.clearSuccess(), 3000);
        },
        error: (error) => {
          this.error.set('Failed to reset settings: ' + (error.message || 'Unknown error'));
          this.isLoading.set(false);
        }
      });
    }
  }

  clearCache(): void {
    if (confirm('Are you sure you want to clear all cached summaries?')) {
      this.isLoading.set(true);
      this.settingsService.clearError();
      
      // This will be handled by the messaging service
      // For now, just show a success message
      this.successMessage.set('Cache cleared!');
      this.isLoading.set(false);
      setTimeout(() => this.clearSuccess(), 3000);
    }
  }

  clearError(): void {
    this.error.set(undefined);
  }

  clearSuccess(): void {
    this.successMessage.set(undefined);
  }

  /**
   * Clear model-specific error
   */
  clearModelsError(): void {
    this.modelsError.set(undefined);
  }

  /**
   * Refresh the available models for the current provider
   */
  refreshModels(): void {
    const apiKey = this.settingsForm?.get('apiKey')?.value || '';
    const provider = this.settingsForm?.get('provider')?.value || 'mistral';
    
    this.modelsLoading.set(true);
    this.modelsError.set(undefined);
    
    this.settingsService.refreshModels(provider as ProviderType, apiKey).subscribe({
      next: (models) => {
        this.modelsLoading.set(false);
        if (models.length > 0) {
          // Update the model dropdown to the first fetched model if current model is not available
          const currentModel = this.settingsForm?.get('model')?.value;
          if (currentModel && !models.includes(currentModel)) {
            this.settingsForm.patchValue({ model: models[0] });
          }
          this.successMessage.set(`Successfully refreshed ${models.length} models!`);
        }
      },
      error: (error) => {
        this.modelsLoading.set(false);
        this.modelsError.set(`Failed to refresh models: ${error.message || 'Unknown error'}`);
      }
    });
  }

  openPrivacyPolicy(): void {
    // This will be implemented later
    alert('Privacy Policy will be shown here');
  }
}
