import {Component, computed, DestroyRef, HostListener, inject, OnInit, signal} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators} from '@angular/forms';
import * as browser from 'webextension-polyfill';
import {
  ClassificationResult,
  ClassificationService,
  ExtensionSettings,
  MessagingService,
  ModelDownloadProgress,
  ProviderType,
  SettingsService,
  ThemeService,
  HeaderComponent
} from '@shared/public-api';
import {takeUntilDestroyed, toSignal} from "@angular/core/rxjs-interop";
import {distinctUntilChanged} from "rxjs";
import {map} from "rxjs/operators";

@Component({
  selector: 'options-root',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, HeaderComponent],
  templateUrl: 'app.component.html',
  styleUrl: 'app.component.scss',
})
export class AppComponent implements OnInit {
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
  /*mlEnabled = signal<boolean>(false);
  mlModelHub = signal<'mozilla' | 'huggingface'>('mozilla');
  mlModelId = signal<string>('');
  mlPermissionStatus = signal<'granted' | 'not_granted' | 'checking'>('checking');*/
  isRequestingPermission = signal<boolean>(false);
  permissionRequestError = signal<string | undefined>(undefined);
  isTestingClassification = signal<boolean>(false);
  classificationTestResult = signal<ClassificationResult | undefined>(undefined);
  mlModelDownloadProgress = signal<number>(0);
  mlDownloadStatus = signal<string | undefined>(undefined);
  mlAvailabilityChecked = signal<boolean>(false);
  apiKeyError = computed(() => {
    const form = this.formValueSignal();
    if (!form) return undefined;

    const apiKey: string = form?.apiKey;
    const currentProvider: string = form?.provider;

    // Firefox ML doesn't require an API key
    if (currentProvider === 'firefox-ml') {
      return undefined;
    }

    if (!apiKey || apiKey.trim() === '') {
      return 'API key is required';
    }

    return undefined;
  });
  isFirefoxMLProvider = signal(false);
  private fb = inject(FormBuilder);
  private settingsService = inject(SettingsService);
  // State
  settings = signal<Partial<ExtensionSettings>>(
    this.settingsService.getSetting('provider') != null ? {
      provider: this.settingsService.getSetting('provider')
    } : {}
  );
  // Computed properties for ML
  mlModelHubs = computed(() => this.settingsService.getMLModelHubs());
  providerTypes = computed(() => this.settingsService.getProviderTypes());
  availableModels = computed(() => {
    const provider = this.settingsForm?.get('provider')?.value || 'mistral';
    return this.settingsService.getAvailableModelsForProvider(provider);
  });
  private classificationService = inject(ClassificationService);
  private messagingService = inject(MessagingService);
  public themeService = inject(ThemeService);
  private formValueSignal;
  private destroyRef = inject(DestroyRef);

  constructor() {
    // Apply theme to document on initialization
    this.themeService.applyThemeToDocument();
    
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

    this.settingsForm.get('provider')?.valueChanges?.pipe(
      distinctUntilChanged(),
      map(provider => provider === 'firefox-ml'),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(value => this.isFirefoxMLProvider.set(value));
    this.formValueSignal = toSignal(this.settingsForm.valueChanges, {initialValue: this.settingsForm.value});
  }

  ngOnInit(): void {
    this.loadSettings();
    // this.loadMLSettings();
    // this.checkMLPermissionStatus();
    // this.setupMLProgressListener();
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
        this.error.set('Failed to load settings: ' + (error.message ?? 'Unknown error'));
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
      const provider = this.settingsForm?.get('provider')?.value ?? 'mistral';

      // Firefox ML doesn't require an API key
      if (provider === 'firefox-ml') {
        return null; // No validation required
      }

      // All other providers require API key
      if (!control.value || control.value.trim() === '') {
        return {required: true};
      }

      return null;
    };
  }

  onProviderChange(event: Event): void {
    const provider = (event.target as HTMLSelectElement).value as ProviderType;
    const models = this.settingsService.getAvailableModelsForProvider(provider);

    // Update the model to the first available model for this provider
    // Skip for firefox-ml as it uses a text input
    if (models.length > 0 && provider !== 'firefox-ml') {
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

  showError(message: string, autoDismiss: boolean = true): void {
    this.error.set(message);
    if (autoDismiss) {
      setTimeout(() => this.clearError(), 5000);
    }
  }

  showSuccess(message: string, autoDismiss: boolean = true): void {
    this.successMessage.set(message);
    if (autoDismiss) {
      setTimeout(() => this.clearSuccess(), 5000);
    }
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

  /**
   * Toggle theme between light and dark
   */
  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  // ============================================================================
  // ML Classification Methods
  // ============================================================================

  /**
   * Load ML-specific settings
   */
  loadMLSettings(): void {
    const mlSettings = this.settingsService.getMLSettings();
    /*this.mlEnabled.set(mlSettings.mlEnabled === true);
    this.mlModelHub.set(mlSettings.mlModelHub as 'mozilla' | 'huggingface' || 'mozilla');
    this.mlModelId.set(mlSettings.mlModelId || 'distilbert-base-uncased-finetuned-sst-2-english');*/
  }

  /**
   * Check ML permission status on load
   */
  checkMLPermissionStatus(): void {
    /*this.mlPermissionStatus.set('checking');
    this.classificationService.getMLPermissionStatus().subscribe({
      next: (granted) => {
        this.mlPermissionStatus.set(granted ? 'granted' : 'not_granted');
      },
      error: () => {
        this.mlPermissionStatus.set('not_granted');
      }
    });*/
  }

  /**
   * Set up listener for ML model download progress
   */
  setupMLProgressListener(): void {
    this.classificationService.onModelDownloadProgress()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (progress: ModelDownloadProgress) => {
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
    /*const enabled = (event.target as HTMLInputElement).checked;
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
    }*/
  }

  /**
   * Request ML permission from user - called directly from user gesture (button click)
   * This calls browser.permissions.request() directly in the options page context
   */
  requestMLPermission(): void {
    this.isRequestingPermission.set(true);
    this.permissionRequestError.set(undefined);


    // Check if browser.permissions is available
    if (typeof browser === 'undefined' || typeof browser.permissions === 'undefined') {
      console.error('OptionsApp.requestMLPermission: browser.permissions API not available');
      this.isRequestingPermission.set(false);
      // this.mlPermissionStatus.set('not_granted');
      this.permissionRequestError.set('browser.permissions API not available');
      return;
    }


    // Call browser.permissions.request() directly from the user gesture context
    browser.permissions.request({permissions: ['trialML']})
      .then((granted: boolean) => {
        this.isRequestingPermission.set(false);

        if (granted) {
          // this.mlPermissionStatus.set('granted');
          this.successMessage.set('ML permission granted! You can now use local classification.');

          // Notify background script that permission was granted
          this.messagingService.notifyMLPermissionGranted().subscribe({
            next: () => {
              setTimeout(() => this.clearSuccess(), 3000);
            },
            error: (error) => {
              console.error('OptionsApp.requestMLPermission: Failed to notify background script:', error);
              // Permission was granted even if we couldn't notify background
              setTimeout(() => this.clearSuccess(), 3000);
            }
          });
        } else {
          // this.mlPermissionStatus.set('not_granted');
          this.permissionRequestError.set('Permission request was denied by user');
        }
      })
      .catch((error: unknown) => {
        console.error('OptionsApp.requestMLPermission: Error requesting permission:', error);
        this.isRequestingPermission.set(false);
        // this.mlPermissionStatus.set('not_granted');
        const errorMessage = error instanceof Error ? error.message : 'Permission request failed';
        this.permissionRequestError.set(errorMessage);
      });
  }

  /**
   * Set ML model hub
   */
  setMLModelHub(hub: 'mozilla' | 'huggingface'): void {
    // this.mlModelHub.set(hub);
    this.settingsService.setMLModelHub(hub).subscribe({
      next: () => {
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
    // this.mlModelId.set(modelId);
    this.settingsService.setMLModelId(modelId).subscribe({
      next: () => {
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
}
