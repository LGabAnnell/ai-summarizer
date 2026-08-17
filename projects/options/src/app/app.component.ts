import {Component, computed, DestroyRef, HostListener, inject, OnInit, signal} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators} from '@angular/forms';
import {
  ClassificationResult,
  ClassificationService,
  ExtensionSettings,
  MessagingService,
  ProviderType,
  SettingsService,
  ThemeService,
  HeaderComponent,
  ToastContainerComponent,
  SaveBarComponent
} from '@shared/public-api';
import {ProviderConfigComponent} from './provider-config/provider-config.component';
import {SummarizationSettingsComponent} from './summarization-settings/summarization-settings.component';
import {CacheSettingsComponent} from './cache-settings/cache-settings.component';
import {takeUntilDestroyed, toSignal} from "@angular/core/rxjs-interop";
import {distinctUntilChanged} from "rxjs";
import {map} from "rxjs/operators";

@Component({
  selector: 'options-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    HeaderComponent,
    ToastContainerComponent,
    SaveBarComponent,
    ProviderConfigComponent,
    SummarizationSettingsComponent,
    CacheSettingsComponent
  ],
  templateUrl: 'app.component.html',
  styleUrl: 'app.component.scss',
})
export class AppComponent implements OnInit {
  // State signals
  isLoading = signal<boolean>(false);
  isTesting = signal<boolean>(false);
  error = signal<string | undefined>(undefined);
  successMessage = signal<string | undefined>(undefined);
  connectionStatus = signal<'connected' | 'failed' | undefined>(undefined);
  modelsLoading = signal<boolean>(false);
  modelsError = signal<string | undefined>(undefined);
  isScrolled = signal<boolean>(false);
  settingsForm!: FormGroup;
  
  // Computed
  isFirefoxMLProvider = signal(false);
  providerTypes = computed(() => this.settingsService.getProviderTypes());
  availableModels = computed(() => {
    const provider = this.settingsForm?.get('provider')?.value || 'mistral';
    return this.settingsService.getAvailableModelsForProvider(provider);
  });

  // Injected services
  private fb = inject(FormBuilder);
  private settingsService = inject(SettingsService);
  public themeService = inject(ThemeService);
  private classificationService = inject(ClassificationService);
  private formValueSignal;
  private destroyRef = inject(DestroyRef);

  settings = signal<Partial<ExtensionSettings>>(
    this.settingsService.getSetting('provider') != null ? {
      provider: this.settingsService.getSetting('provider')
    } : {}
  );

  // ML State (commented out as per user decision)
  isRequestingPermission = signal<boolean>(false);
  permissionRequestError = signal<string | undefined>(undefined);
  isTestingClassification = signal<boolean>(false);
  classificationTestResult = signal<ClassificationResult | undefined>(undefined);
  mlModelDownloadProgress = signal<number>(0);
  mlDownloadStatus = signal<string | undefined>(undefined);
  mlAvailabilityChecked = signal<boolean>(false);

  constructor() {
    // Apply theme to document on initialization
    this.themeService.applyThemeToDocument();
    
    this.settingsForm = this.fb.group({
      provider: ['mistral', Validators.required],
      model: ['mistral-tiny', Validators.required],
      apiKey: [''],
      customEndpoint: [''],
      summaryStyle: ['concise', Validators.required],
      customPrompt: [''],
      maxTokens: [500, [Validators.required, Validators.min(50)]],
      temperature: [0.7, [Validators.required, Validators.min(0), Validators.max(1)]],
      cacheEnabled: [true],
      cacheTTL: [7, [Validators.required, Validators.min(1), Validators.max(30)]],
    });

    this.settingsForm.get('provider')?.valueChanges?.pipe(
      distinctUntilChanged(),
      map(provider => provider === 'firefox-ml'),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(value => {
      this.isFirefoxMLProvider.set(value);
      this.updateApiKeyValidators();
    });
    this.formValueSignal = toSignal(this.settingsForm.valueChanges, {initialValue: this.settingsForm.value});
  }

  ngOnInit(): void {
    this.loadSettings();
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

  /**
   * Update API key validators based on current provider
   */
  updateApiKeyValidators(): void {
    const apiKeyControl = this.settingsForm.get('apiKey');
    const providerValue = this.settingsForm.get('provider')?.value ?? 'mistral';
    const isFirefoxML = providerValue === 'firefox-ml';
    
    if (!apiKeyControl) return;
    
    // Clear existing validators
    apiKeyControl.clearValidators();
    apiKeyControl.setValidators([]);
    
    if (isFirefoxML) {
      // No validators for Firefox ML provider
      return;
    }
    
    // Add required validator for API key (non-Firefox ML providers)
    apiKeyControl.addValidators(Validators.required);
    apiKeyControl.updateValueAndValidity();
  }

  /**
   * Get validators for API key field based on current provider (legacy method kept for compatibility)
   */
  getApiKeyValidators() {
    return (control: FormControl<string>) => {
      const provider = this.settingsForm?.get('provider')?.value ?? 'mistral';
      if (provider === 'firefox-ml') return null;
      if (!control.value || control.value.trim() === '') return {required: true};
      return null;
    };
  }

  // ============================================================================
  // Provider Config Handlers
  // ============================================================================

  onProviderChange(provider: ProviderType): void {
    const models = this.settingsService.getAvailableModelsForProvider(provider);
    if (models.length > 0 && provider !== 'firefox-ml') {
      this.settingsForm.patchValue({model: models[0]});
    }
    if (provider !== 'custom') {
      this.settingsForm.patchValue({customEndpoint: ''});
    }
    // Validators are now updated reactively via provider valueChanges
    // No need to manually update validators here
  }

  // ============================================================================
  // Connection Testing
  // ============================================================================

  onTestConnection(): void {
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
          setTimeout(() => this.onClearSuccess(), 3000);
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

  // ============================================================================
  // Model Management
  // ============================================================================

  onRefreshModels(): void {
    const apiKey = this.settingsForm?.get('apiKey')?.value || '';
    const provider = this.settingsForm?.get('provider')?.value || 'mistral';
    this.modelsLoading.set(true);
    this.modelsError.set(undefined);
    this.settingsService.refreshModels(provider as ProviderType, apiKey).subscribe({
      next: (models) => {
        this.modelsLoading.set(false);
        if (models.length > 0) {
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

  onClearModelsError(): void {
    this.modelsError.set(undefined);
  }

  // ============================================================================
  // Cache Handlers
  // ============================================================================

  onClearCache(): void {
    if (confirm('Are you sure you want to clear all cached summaries?')) {
      this.isLoading.set(true);
      this.settingsService.clearError();
      this.successMessage.set('Cache cleared!');
      this.isLoading.set(false);
      setTimeout(() => this.onClearSuccess(), 3000);
    }
  }

  // ============================================================================
  // Save/Reset Handlers
  // ============================================================================

  onSaveSettings(): void {
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
        setTimeout(() => this.onClearSuccess(), 3000);
      },
      error: (error) => {
        this.error.set('Failed to save settings: ' + (error.message || 'Unknown error'));
        this.isLoading.set(false);
      }
    });
  }

  onResetToDefaults(): void {
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
          setTimeout(() => this.onClearSuccess(), 3000);
        },
        error: (error) => {
          this.error.set('Failed to reset settings: ' + (error.message || 'Unknown error'));
          this.isLoading.set(false);
        }
      });
    }
  }

  // ============================================================================
  // Toast Handlers
  // ============================================================================

  onClearError(): void {
    this.error.set(undefined);
  }

  onClearSuccess(): void {
    this.successMessage.set(undefined);
  }

  showError(message: string, autoDismiss: boolean = true): void {
    this.error.set(message);
    if (autoDismiss) setTimeout(() => this.onClearError(), 5000);
  }

  showSuccess(message: string, autoDismiss: boolean = true): void {
    this.successMessage.set(message);
    if (autoDismiss) setTimeout(() => this.onClearSuccess(), 5000);
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  openPrivacyPolicy(): void {
    alert('Privacy Policy will be shown here');
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  // ============================================================================
  // ML Classification Methods (Commented Out as per user decisions)
  // ============================================================================

  loadMLSettings(): void {}
  checkMLPermissionStatus(): void {}
  setupMLProgressListener(): void {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  toggleMLEnabled(event: Event): void {}
  requestMLPermission(): void {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setMLModelHub(hub: 'mozilla' | 'huggingface'): void {
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setMLModelId(modelId: string): void {
  }
  testClassification(): void {}
  clearMLCache(): void {}
}
