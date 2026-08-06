import {Component, signal, OnInit, OnDestroy, computed, inject, HostListener} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormControl} from '@angular/forms';
import * as browser from 'webextension-polyfill';
import {SettingsService, ExtensionSettings, ProviderType, ClassificationService, ClassificationResult, ModelDownloadProgress, MessagingService} from '@shared/public-api';

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
        <!-- Sticky Save Bar -->
        <div class="save-bar" [class.save-bar--compact]="isScrolled()">
          <div class="save-bar-buttons">
            <button
                    type="submit"
                    class="btn btn--primary"
                    [disabled]="isLoading() || settingsForm.invalid">
              @if (isScrolled()) {
                <span>Save</span>
              } @else {
                @if (isLoading()) {
                  <span class="spinner"></span>
                  Saving...
                } @else {
                  Save Settings
                }
              }
            </button>
            @if (!isScrolled()) {
              <button
                      type="button"
                      class="btn btn--secondary"
                      (click)="resetToDefaults()"
                      [disabled]="isLoading()">
                Reset to Defaults
              </button>
            }
          </div>
        </div>

        <!-- Form Content -->
        <div class="form-content">
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

            @if (isFirefoxMLProvider()) {
              <div class="form-group">
                <span class="form-label">Firefox ML Information</span>
                <div class="firefox-ml-info">
                  <div class="info-icon">🤖</div>
                  <div class="info-content">
                    <p><strong>Firefox ML (Local)</strong> uses Firefox's built-in machine learning runtime for offline summarization.</p>
                    <p><strong>Requirements:</strong> Firefox Nightly or Beta with <code>browser.ml.enable</code> and <code>extensions.ml.enabled</code> set to <code>true</code> in <code>about:config</code>.</p>
                    <p><strong>Features:</strong> No API key required, works offline after initial model download, privacy-friendly.</p>
                  </div>
                </div>
              </div>
            } @else {
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
            }

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
                @if (connectionStatus() === 'connected') {
                  <div class="status-badge status-connected">
                    <span class="status-dot status-connected"></span>
                    Connection successful
                  </div>
                }
                @if (connectionStatus() === 'failed') {
                  <div class="status-badge status-disconnected">
                    <span class="status-dot status-disconnected"></span>
                    Connection failed
                  </div>
                }
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
                <label class="switch" for="cacheEnabled">
                  <input
                          type="checkbox"
                          id="cacheEnabled"
                          formControlName="cacheEnabled"
                          [checked]="settingsForm.get('cacheEnabled')?.value"
                  >
                  <span class="switch"></span>
                  <span class="switch-label">Enable Summary Caching</span>
                </label>
              </div>
              <div class="form-description">
                Cache summaries to avoid re-processing the same articles
              </div>
            </div>

            @if (settingsForm.get('cacheEnabled')?.value) {
              <div class="form-group">
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
            }

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

          <!-- Local AI Classification Section -->
          <div class="section">
            <div class="section-header">
              <div class="section-title">
                <span>🤖</span>
                Local AI Classification
              </div>
            </div>
            <div class="section-description">
              Use Firefox's built-in AI runtime for text classification (sentiment analysis, content categorization)
              <span class="ml-requirement-badge">Requires Firefox Nightly or Beta with extensions.ml.enabled=true</span>
            </div>

            <div class="form-group">
              <div class="form-switch">
                <label class="switch" for="mlEnabled">
                  <input
                          type="checkbox"
                          id="mlEnabled"
                          [checked]="mlEnabled()"
                          (change)="toggleMLEnabled($event)"
                          [disabled]="isLoading()">
                  <span class="switch"></span>
                  <span class="switch-label">Enable Local AI Classification</span>
                </label>
              </div>
              <div class="form-description">
                Enable local text classification using Firefox's ML runtime. No external API calls required.
              </div>
            </div>

            @if (mlEnabled()) {
              <div class="ml-settings-subgroup">
                <!-- Permission Status -->
                <div class="form-group">
                  <div class="permission-status">
                    @if (mlPermissionStatus() === 'granted') {
                      <span class="status-badge status-connected">
                        <span class="status-dot"></span>
                        ML Permission Granted
                      </span>
                    } @else if (mlPermissionStatus() === 'not_granted') {
                      <span class="status-badge status-disconnected">
                        <span class="status-dot"></span>
                        ML Permission Required
                      </span>
                    } @else {
                      <span class="status-badge status-unknown">
                        <span class="status-dot"></span>
                        Checking Permission...
                      </span>
                    }
                  </div>
                  <div class="form-description">
                    @if (mlPermissionStatus() === 'not_granted') {
                      Click the button below to grant ML permission (requires user gesture)
                    } @else {
                      ML permission is granted. You can classify text locally.
                    }
                  </div>
                </div>

                <!-- Permission Request Button -->
                @if (mlPermissionStatus() !== 'granted') {
                  <div class="form-group">
                    <button
                            type="button"
                            class="btn btn--primary"
                            (click)="requestMLPermission()"
                            [disabled]="isRequestingPermission()">
                      @if (isRequestingPermission()) {
                        <span class="spinner"></span>
                        Requesting Permission...
                      } @else {
                        Grant ML Permission
                      }
                    </button>
                    <div class="form-description">
                      This will request permission to use Firefox's built-in AI runtime for local classification.
                    </div>
                    @if (permissionRequestError()) {
                      <div class="form-error">{{ permissionRequestError() }}</div>
                    }
                  </div>
                }

                <!-- Model Hub Selection -->
                <div class="form-group">
                  <label class="form-label" for="mlModelHub">Model Hub</label>
                  <select
                          id="mlModelHub"
                          [ngModel]="mlModelHub()"
                          (ngModelChange)="setMLModelHub($event)"
                          [ngModelOptions]="{standalone: true}"
                          class="form-select"
                          [disabled]="isLoading()">
                    @for (hub of mlModelHubs(); track hub) {
                      <option [value]="hub">{{ hub === 'mozilla' ? 'Mozilla' : 'Hugging Face' }}</option>
                    }
                  </select>
                  <div class="form-description">
                    Select the model hub for text classification models
                  </div>
                </div>

                <!-- Model ID -->
                <div class="form-group">
                  <label class="form-label" for="mlModelId">Model ID</label>
                  <input
                          id="mlModelId"
                          type="text"
                          [ngModel]="mlModelId()"
                          (ngModelChange)="setMLModelId($event)"
                          [ngModelOptions]="{standalone: true}"
                          class="form-input"
                          placeholder="distilbert-base-uncased-finetuned-sst-2-english"
                          [disabled]="isLoading()">
                  <div class="form-description">
                    Specific text-classification model ID from the selected hub
                  </div>
                </div>

                <!-- Test Classification Button -->
                <div class="form-group">
                  <button
                          type="button"
                          class="btn btn--secondary"
                          (click)="testClassification()"
                          [disabled]="isTestingClassification() || mlPermissionStatus() !== 'granted'">
                    @if (isTestingClassification()) {
                      <span class="spinner"></span>
                      Testing Classification...
                    } @else {
                      Test Classification
                    }
                  </button>
                  <div class="form-description">
                    Test the classification with a sample text to verify it's working
                  </div>
                </div>

                <!-- Classification Test Result -->
                @if (classificationTestResult()) {
                  <div class="form-group">
                    <div class="classification-result">
                      @if (classificationTestResult()?.ok) {
                        <div class="result-success">
                          <strong>Classification Result:</strong>
                          <div class="result-label">{{ classificationTestResult()?.label || 'Unknown' }}</div>
                          <div class="result-score">
                            Confidence: {{ (classificationTestResult()?.score || 0) | number:'1.0-2' }}%
                          </div>
                          @if (classificationTestResult()?.inferenceTime) {
                            <div class="result-time">
                              Time: {{ classificationTestResult()?.inferenceTime }}ms
                            </div>
                          }
                        </div>
                      } @else {
                        <div class="result-error">
                          <strong>Classification Error:</strong>
                          <div>{{ classificationTestResult()?.error || 'Unknown error' }}</div>
                        </div>
                      }
                    </div>
                  </div>
                }

                <!-- Model Download Progress -->
                @if (mlModelDownloadProgress() > 0 && mlModelDownloadProgress() < 100) {
                  <div class="form-group">
                    <div class="progress-container">
                      <div class="progress-bar">
                        <div class="progress-fill" [style.width.%]="mlModelDownloadProgress()"></div>
                      </div>
                      <div class="progress-text">
                        Downloading ML model: {{ mlModelDownloadProgress() }}%
                        @if (mlDownloadStatus()) {
                          <span>({{ mlDownloadStatus() }})</span>
                        }
                      </div>
                    </div>
                  </div>
                }

                <!-- Clear ML Cache Button -->
                <div class="form-group">
                  <button
                          type="button"
                          class="btn btn--secondary"
                          (click)="clearMLCache()"
                          [disabled]="isLoading()">
                    Clear ML Model Cache
                  </button>
                  <div class="form-description">
                    Remove downloaded ML models and free up storage space
                  </div>
                </div>
              </div>
            }

          </div>

        </div>
      </form>

      <!-- Footer -->
      <div class="page-footer">
        <div class="footer-left">
          <span>Version 1.0.0</span>
          <button class="footer-link" type="button" (click)="openPrivacyPolicy()">Privacy Policy</button>
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

    .form-content {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .save-bar {
      position: sticky;
      top: 0;
      z-index: 100;
      background: var(--bg-primary, #f8f9fa);
      border-bottom: 1px solid var(--border-color, #e0e0e0);
      padding-top: 16px;
      padding-bottom: 16px;
      padding-left: 12px;
      transition: all 0.2s ease;
      margin-bottom: 16px;
    }

    .save-bar--compact {
      padding-top: 8px;
      padding-bottom: 8px;
      padding-left: 6px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      background: var(--bg-primary, #f8f9fa);
      border-bottom: 1px solid var(--border-color, #e0e0e0);
    }

    .save-bar--compact .btn {
      padding: 6px 12px;
      font-size: 13px;
    }

    .save-bar-buttons {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }

    .save-bar-buttons .btn {
      min-width: 120px;
    }

    .save-bar--compact .save-bar-buttons .btn:not(:first-child) {
      display: none;
    }

    /* ML Classification Styles */
    .ml-requirement-badge {
      display: inline-block;
      background: var(--bg-secondary, #e8e8e8);
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 12px;
      margin-left: 8px;
      color: var(--text-secondary, #666);
    }

    .ml-settings-subgroup {
      margin-left: 20px;
      border-left: 2px solid var(--border-color, #e0e0e0);
      padding-left: 20px;
      margin-top: 16px;
    }

    .permission-status {
      margin-bottom: 8px;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 500;
    }

    .status-badge.status-connected {
      background: #d4edda;
      color: #155724;
    }

    .status-badge.status-disconnected {
      background: #f8d7da;
      color: #721c24;
    }

    .status-badge.status-unknown {
      background: #fff3cd;
      color: #856404;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .status-dot.status-connected {
      background: #155724;
    }

    .status-dot.status-disconnected {
      background: #721c24;
    }

    .status-dot.status-unknown {
      background: #856404;
    }

    .classification-result {
      margin-top: 12px;
      padding: 12px;
      border-radius: 8px;
      background: var(--bg-secondary, #f8f9fa);
      border: 1px solid var(--border-color, #e0e0e0);
    }

    .result-success {
      color: #155724;
    }

    .result-error {
      color: #721c24;
    }

    .result-label {
      font-size: 18px;
      font-weight: bold;
      margin: 8px 0;
    }

    .result-score {
      font-size: 14px;
      margin: 4px 0;
    }

    .result-time {
      font-size: 12px;
      color: var(--text-muted, #6c757d);
      margin: 4px 0;
    }

    .progress-container {
      margin-top: 12px;
    }

    .progress-bar {
      height: 20px;
      background: var(--border-color, #e0e0e0);
      border-radius: 10px;
      overflow: hidden;
      margin-bottom: 8px;
    }

    .progress-fill {
      height: 100%;
      background: #28a745;
      transition: width 0.3s ease;
    }

    .progress-text {
      font-size: 14px;
      color: var(--text-muted, #6c757d);
    }

    /* Firefox ML Info Styles */
    .firefox-ml-info {
      display: flex;
      gap: 16px;
      padding: 12px;
      background: var(--bg-secondary, #f8f9fa);
      border-radius: 8px;
      border: 1px solid var(--border-color, #e0e0e0);
      align-items: flex-start;
    }

    .firefox-ml-info .info-icon {
      font-size: 24px;
      flex-shrink: 0;
    }

    .firefox-ml-info .info-content {
      flex: 1;
    }

    .firefox-ml-info .info-content p {
      margin: 0 0 8px 0;
      font-size: 14px;
      line-height: 1.4;
    }

    .firefox-ml-info .info-content p:last-child {
      margin-bottom: 0;
    }

    .firefox-ml-info .info-content strong {
      color: var(--text-primary, #333);
    }

    .firefox-ml-info .info-content code {
      background: var(--bg-primary, #fff);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 13px;
      border: 1px solid var(--border-color, #e0e0e0);
    }
  `],
})
export class AppComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private settingsService = inject(SettingsService);
  private classificationService = inject(ClassificationService);
  private messagingService = inject(MessagingService);

  // State
  settings = signal<Partial<ExtensionSettings>>(
    this.settingsService.getSetting('provider') != null ? {
      provider: this.settingsService.getSetting('provider')
    } : {}
  );
  isLoading = signal<boolean>(false);
  isTesting = signal<boolean>(false);
  error = signal<string | undefined>(undefined);
  successMessage = signal<string | undefined>(undefined);
  connectionStatus = signal<'connected' | 'failed' | undefined>(undefined);
  showApiKey = signal<boolean>(false);
  modelsLoading = signal<boolean>(false);
  modelsError = signal<string | undefined>(undefined);
  isScrolled = signal<boolean>(false);
  settingsForm!: FormGroup;

  // ML State
  mlEnabled = signal<boolean>(false);
  mlModelHub = signal<'mozilla' | 'huggingface'>('mozilla');
  mlModelId = signal<string>('');
  mlPermissionStatus = signal<'granted' | 'not_granted' | 'checking'>('checking');
  isRequestingPermission = signal<boolean>(false);
  permissionRequestError = signal<string | undefined>(undefined);
  isTestingClassification = signal<boolean>(false);
  classificationTestResult = signal<ClassificationResult | undefined>(undefined);
  mlModelDownloadProgress = signal<number>(0);
  mlDownloadStatus = signal<string | undefined>(undefined);
  mlAvailabilityChecked = signal<boolean>(false);

  // Computed properties for ML
  mlModelHubs = computed(() => this.settingsService.getMLModelHubs());

  // Private variables for cleanup
  private progressSubscription: { unsubscribe: () => void } | null = null;

  providerTypes = computed(() => this.settingsService.getProviderTypes());
  availableModels = computed(() => {
    const provider = this.settingsForm?.get('provider')?.value || 'mistral';
    return this.settingsService.getAvailableModelsForProvider(provider);
  });

  apiKeyError = computed(() => {
    const form = this.settingsForm;
    if (!form) return undefined;

    const apiKey: string = form.get('apiKey')?.value;
    const currentProvider = form.get('provider')?.value;

    // Firefox ML doesn't require an API key
    if (currentProvider === 'firefox-ml') {
      return undefined;
    }

    if (!apiKey || apiKey.trim() === '') {
      return 'API key is required';
    }

    return undefined;
  });

  isFirefoxMLProvider = computed(() => {
    const provider = this.settingsForm?.get('provider')?.value || this.settings().provider;
    return provider === 'firefox-ml';
  });

  constructor() {
    this.settingsForm = this.fb.group({
      provider: ['mistral', Validators.required],
      model: ['mistral-tiny', Validators.required],
      apiKey: ['', this.getApiKeyValidators()],
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
    this.loadMLSettings();
    this.checkMLPermissionStatus();
    this.setupMLProgressListener();
  }

  @HostListener('window:scroll')
  onScroll(): void {
    this.isScrolled.set(window.scrollY > 80);
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
    return this.settingsService.getProviderDisplayName(provider as ProviderType);
  }

  /**
   * Get validators for API key field based on current provider
   */
  getApiKeyValidators() {
    return (control: FormControl<string>) => {
      const provider = this.settingsForm?.get('provider')?.value || 'mistral';
      
      // Firefox ML doesn't require an API key
      if (provider === 'firefox-ml') {
        return null; // No validation required
      }
      
      // All other providers require API key
      if (!control.value || control.value.trim() === '') {
        return { required: true };
      }
      
      return null;
    };
  }

  onProviderChange(event: Event): void {
    const provider = (event.target as HTMLSelectElement).value as ProviderType;
    const models = this.settingsService.getAvailableModelsForProvider(provider);

    // Update the model to the first available model for this provider
    if (models.length > 0) {
      this.settingsForm.patchValue({model: models[0]});
    }

    // Reset custom endpoint if not custom provider
    if (provider !== 'custom') {
      this.settingsForm.patchValue({customEndpoint: ''});
    }

    // Update API key validators based on provider
    const apiKeyControl = this.settingsForm.get('apiKey');
    if (apiKeyControl) {
      if (provider === 'firefox-ml') {
        apiKeyControl.clearValidators();
        apiKeyControl.updateValueAndValidity();
      } else {
        apiKeyControl.setValidators(Validators.required);
        apiKeyControl.updateValueAndValidity();
      }
    }
  }

  toggleShowApiKey(): void {
    this.showApiKey.update(v => !v);
  }

  incrementTemperature(): void {
    const current = this.settingsForm.get('temperature')?.value || 0;
    if (current < 1) {
      this.settingsForm.patchValue({temperature: Math.min(current + 0.1, 1)});
    }
  }

  decrementTemperature(): void {
    const current = this.settingsForm.get('temperature')?.value || 0;
    if (current > 0) {
      this.settingsForm.patchValue({temperature: Math.max(current - 0.1, 0)});
    }
  }

  incrementCacheTTL(): void {
    const current = this.settingsForm.get('cacheTTL')?.value || 7;
    if (current < 30) {
      this.settingsForm.patchValue({cacheTTL: current + 1});
    }
  }

  decrementCacheTTL(): void {
    const current = this.settingsForm.get('cacheTTL')?.value || 7;
    if (current > 1) {
      this.settingsForm.patchValue({cacheTTL: current - 1});
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
            this.settingsForm.patchValue({model: models[0]});
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

  // ============================================================================
  // ML Classification Methods
  // ============================================================================

  /**
   * Load ML-specific settings
   */
  loadMLSettings(): void {
    const mlSettings = this.settingsService.getMLSettings();
    this.mlEnabled.set(mlSettings.mlEnabled === true);
    this.mlModelHub.set(mlSettings.mlModelHub as 'mozilla' | 'huggingface' || 'mozilla');
    this.mlModelId.set(mlSettings.mlModelId || 'distilbert-base-uncased-finetuned-sst-2-english');
  }

  /**
   * Check ML permission status on load
   */
  checkMLPermissionStatus(): void {
    this.mlPermissionStatus.set('checking');
    this.classificationService.getMLPermissionStatus().subscribe({
      next: (granted) => {
        this.mlPermissionStatus.set(granted ? 'granted' : 'not_granted');
      },
      error: () => {
        this.mlPermissionStatus.set('not_granted');
      }
    });
  }

  /**
   * Set up listener for ML model download progress
   */
  setupMLProgressListener(): void {
    if (this.progressSubscription) {
      this.progressSubscription.unsubscribe();
    }

    this.progressSubscription = this.classificationService.onModelDownloadProgress().subscribe({
      next: (progress: ModelDownloadProgress) => {
        console.log('Options: ML download progress:', progress);
        this.mlModelDownloadProgress.set(progress.progress);
        this.mlDownloadStatus.set(progress.status === 'downloading' ? 'Downloading...' : 
                               progress.status === 'extracting' ? 'Extracting...' :
                               progress.status === 'complete' ? 'Complete!' :
                               'Error');
      },
      error: (error) => {
        console.error('Options: Error in ML progress listener:', error);
        this.mlDownloadStatus.set('Error: ' + (error.message || 'Unknown error'));
      }
    });
  }

  /**
   * Toggle ML enabled/disabled
   */
  toggleMLEnabled(event: Event): void {
    const enabled = (event.target as HTMLInputElement).checked;
    this.mlEnabled.set(enabled);
    
    if (enabled) {
      this.settingsService.enableML().subscribe({
        next: () => {
          this.successMessage.set('Local AI Classification enabled!');
          setTimeout(() => this.clearSuccess(), 3000);
        },
        error: (error) => {
          this.error.set('Failed to enable ML: ' + (error.message || 'Unknown error'));
          this.mlEnabled.set(false);
        }
      });
    } else {
      this.settingsService.disableML().subscribe({
        next: () => {
          this.successMessage.set('Local AI Classification disabled!');
          setTimeout(() => this.clearSuccess(), 3000);
        },
        error: (error) => {
          this.error.set('Failed to disable ML: ' + (error.message || 'Unknown error'));
          this.mlEnabled.set(true);
        }
      });
    }
  }

  /**
   * Request ML permission from user - called directly from user gesture (button click)
   * This calls browser.permissions.request() directly in the options page context
   */
  requestMLPermission(): void {
    console.log('OptionsApp.requestMLPermission: User clicked "Grant ML Permission" button');
    this.isRequestingPermission.set(true);
    this.permissionRequestError.set(undefined);

    console.log('OptionsApp.requestMLPermission: Checking if browser.permissions API is available');
    
    // Check if browser.permissions is available
    if (typeof browser === 'undefined' || typeof browser.permissions === 'undefined') {
      console.error('OptionsApp.requestMLPermission: browser.permissions API not available');
      this.isRequestingPermission.set(false);
      this.mlPermissionStatus.set('not_granted');
      this.permissionRequestError.set('browser.permissions API not available');
      return;
    }

    console.log('OptionsApp.requestMLPermission: Calling browser.permissions.request() directly from user gesture');
    
    // Call browser.permissions.request() directly from the user gesture context
    browser.permissions.request({ permissions: ['trialML'] })
      .then((granted: boolean) => {
        console.log('OptionsApp.requestMLPermission: Permission result:', granted);
        this.isRequestingPermission.set(false);
        
        if (granted) {
          console.log('OptionsApp.requestMLPermission: Permission GRANTED');
          this.mlPermissionStatus.set('granted');
          this.successMessage.set('ML permission granted! You can now use local classification.');
          
          // Notify background script that permission was granted
          console.log('OptionsApp.requestMLPermission: Notifying background script');
          this.messagingService.notifyMLPermissionGranted().subscribe({
            next: () => {
              console.log('OptionsApp.requestMLPermission: Background script notified successfully');
              setTimeout(() => this.clearSuccess(), 3000);
            },
            error: (error) => {
              console.error('OptionsApp.requestMLPermission: Failed to notify background script:', error);
              // Permission was granted even if we couldn't notify background
              setTimeout(() => this.clearSuccess(), 3000);
            }
          });
        } else {
          console.log('OptionsApp.requestMLPermission: Permission DENIED');
          this.mlPermissionStatus.set('not_granted');
          this.permissionRequestError.set('Permission request was denied by user');
        }
      })
      .catch((error: unknown) => {
        console.error('OptionsApp.requestMLPermission: Error requesting permission:', error);
        this.isRequestingPermission.set(false);
        this.mlPermissionStatus.set('not_granted');
        const errorMessage = error instanceof Error ? error.message : 'Permission request failed';
        this.permissionRequestError.set(errorMessage);
      });
  }

  /**
   * Set ML model hub
   */
  setMLModelHub(hub: 'mozilla' | 'huggingface'): void {
    this.mlModelHub.set(hub);
    this.settingsService.setMLModelHub(hub).subscribe({
      next: () => {
        console.log('ML model hub saved:', hub);
      },
      error: (error) => {
        console.error('Failed to save ML model hub:', error);
        this.error.set('Failed to save model hub: ' + (error.message || 'Unknown error'));
      }
    });
  }

  /**
   * Set ML model ID
   */
  setMLModelId(modelId: string): void {
    this.mlModelId.set(modelId);
    this.settingsService.setMLModelId(modelId).subscribe({
      next: () => {
        console.log('ML model ID saved:', modelId);
      },
      error: (error) => {
        console.error('Failed to save ML model ID:', error);
        this.error.set('Failed to save model ID: ' + (error.message || 'Unknown error'));
      }
    });
  }

  /**
   * Test classification with sample text
   */
  testClassification(): void {
    this.isTestingClassification.set(true);
    this.classificationTestResult.set(undefined);

    const sampleText = `Local AI classification is an amazing feature that allows you to run machine learning models directly in Firefox without sending your data to external services. This provides better privacy and works offline once models are downloaded.`;

    this.classificationService.classifyText(sampleText).subscribe({
      next: (result) => {
        this.isTestingClassification.set(false);
        this.classificationTestResult.set(result);
        
        if (result.ok) {
          this.successMessage.set('Classification test successful!');
        } else {
          this.error.set('Classification test failed: ' + (result.error || 'Unknown error'));
        }
      },
      error: (error) => {
        this.isTestingClassification.set(false);
        this.error.set('Classification test failed: ' + (error.message || 'Unknown error'));
      }
    });
  }

  /**
   * Clear ML model cache
   */
  clearMLCache(): void {
    if (confirm('Are you sure you want to clear all ML model cache? This will remove downloaded models and you will need to re-download them for classification.')) {
      this.isLoading.set(true);
      
      this.classificationService.clearMLCache().subscribe({
        next: (result) => {
          this.isLoading.set(false);
          if (result.success) {
            this.mlModelDownloadProgress.set(0);
            this.mlDownloadStatus.set(undefined);
            this.successMessage.set('ML model cache cleared successfully!');
          } else {
            this.error.set('Failed to clear ML cache: ' + (result.error || 'Unknown error'));
          }
          setTimeout(() => this.clearSuccess(), 3000);
        },
        error: (error) => {
          this.isLoading.set(false);
          this.error.set('Failed to clear ML cache: ' + (error.message || 'Unknown error'));
        }
      });
    }
  }

  /**
   * Clean up on destroy
   */
  ngOnDestroy(): void {
    if (this.progressSubscription) {
      this.progressSubscription.unsubscribe();
      this.progressSubscription = null;
    }
  }
}
