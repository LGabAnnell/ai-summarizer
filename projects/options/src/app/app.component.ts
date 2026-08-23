import {Component, computed, DestroyRef, HostListener, inject, OnInit, signal} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators} from '@angular/forms';
import {
  ClassificationResult,
  ClassificationService,
  ExtensionSettings,
  HeaderComponent,
  ModelService,
  ProviderType,
  SaveBarComponent,
  SettingsService,
  ThemeService,
  ToastContainerComponent
} from '@shared/public-api';
import {ProviderConfigComponent} from './provider-config/provider-config.component';
import {SummarizationSettingsComponent} from './summarization-settings/summarization-settings.component';
import {CacheSettingsComponent} from './cache-settings/cache-settings.component';
import {takeUntilDestroyed, toSignal} from "@angular/core/rxjs-interop";
import {combineLatest, distinctUntilChanged} from "rxjs";
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
  isScrolled = signal<boolean>(false);
  settingsForm!: FormGroup;

  // Computed
  public themeService = inject(ThemeService);
  // ML State (commented out as per user decision)
  isFirefoxMLProvider = signal(false);
  isRequestingPermission = signal<boolean>(false);
  permissionRequestError = signal<string | undefined>(undefined);
  isTestingClassification = signal<boolean>(false);
  classificationTestResult = signal<ClassificationResult | undefined>(undefined);
  mlModelDownloadProgress = signal<number>(0);
  mlDownloadStatus = signal<string | undefined>(undefined);
  mlAvailabilityChecked = signal<boolean>(false);
  // Get current provider from form
  currentProvider = computed(() => this.settingsForm.get('provider')?.value || 'mistral');
  // Injected services
  private fb = inject(FormBuilder);
  private settingsService = inject(SettingsService);
  providerTypes = computed(() => this.settingsService.getProviderTypes());
  // Get loading/error state from SettingsService (which delegates to ModelService)
  modelsLoading = computed(() => this.settingsService.isModelsLoading(this.currentProvider()));
  modelsError = computed(() => this.settingsService.getModelsErrorSignal(this.currentProvider())());
  availableModels = computed(() => {
    const provider = this.settingsForm?.get('provider')?.value || 'mistral';
    return this.settingsService.getAvailableModelsForProvider(provider);
  });
  settings = signal<Partial<ExtensionSettings>>(
    this.settingsService.getSetting('provider') != null ? {
      provider: this.settingsService.getSetting('provider')
    } : {}
  );
  private modelService = inject(ModelService);
  private classificationService = inject(ClassificationService);
  private formValueSignal;
  private destroyRef = inject(DestroyRef);

  constructor() {
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
    });

    combineLatest([
      this.settingsForm.get('provider')!.valueChanges,
      this.settingsForm.get('apiKey')!.valueChanges
    ]).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => {
      this.onRefreshModels();
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

  // ============================================================================
  // Provider Config Handlers
  // ============================================================================

  onProviderChange(provider: ProviderType): void {
    // Clear success message and form errors
    this.successMessage.set(undefined);
    this.settingsForm.get('model')?.setErrors(null);

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
    this.settingsService.testCurrentProvider(provider, apiKey).subscribe({
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
    this.successMessage.set(undefined);
    this.settingsForm.get('model')?.setErrors(null);
    this.settingsService.refreshModels(provider as ProviderType, apiKey).subscribe({
      next: (models) => {
        if (models.length > 0) {
          const currentModel = this.settingsForm?.get('model')?.value;
          if (currentModel && !models.includes(currentModel)) {
            this.settingsForm.patchValue({model: models[0]});
          }
          this.successMessage.set(`Successfully refreshed ${models.length} models!`);
          setTimeout(() => this.onClearSuccess(), 3000);
        }
      },
      error: (error) => {
        // Error is already stored in ModelService via SettingsService
        this.settingsForm.get('model')?.setErrors({refreshFailed: true});
      }
    });
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

  loadMLSettings(): void {
  }

  checkMLPermissionStatus(): void {
  }

  setupMLProgressListener(): void {
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  toggleMLEnabled(event: Event): void {
  }

  requestMLPermission(): void {
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setMLModelHub(hub: 'mozilla' | 'huggingface'): void {
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setMLModelId(modelId: string): void {
  }

  testClassification(): void {
  }

  clearMLCache(): void {
  }
}
