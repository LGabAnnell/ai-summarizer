import {Component, inject, input, output, signal} from '@angular/core';
import {CommonModule} from '@angular/common';
import {ControlContainer, FormGroupDirective, ReactiveFormsModule} from '@angular/forms';
import {ProviderType, SettingsService} from '@shared/public-api';

/**
 * Provider configuration section component
 * Handles AI provider selection, model selection, API key input, and custom endpoint
 */
@Component({
  selector: 'options-provider-config',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: 'provider-config.component.html',
  styleUrl: 'provider-config.component.scss',
  viewProviders: [{provide: ControlContainer, useExisting: FormGroupDirective}],
})
export class ProviderConfigComponent {
  // Inputs
  providerTypes = input.required<ProviderType[]>();
  availableModels = input.required<string[]>();
  isTesting = input<boolean>(false);
  connectionStatus = input<'connected' | 'failed' | undefined>(undefined);
  modelsLoading = input<boolean>(false);
  modelsError = input<string | undefined>(undefined);
  isFirefoxMLProvider = input<boolean>(false);

  // Outputs
  providerChange = output<ProviderType>();
  testConnection = output<void>();
  refreshModels = output<void>();
  toggleShowApiKey = output<void>();

  // Local state
  showApiKey = signal<boolean>(false);

  private settingsService = inject(SettingsService);
  private formDirective = inject(FormGroupDirective);

  get apiKeyErrors() {
    return this.formDirective.control.get('apiKey')?.errors;
  }

  get isCustomProvider() {
    return this.formDirective.control.get('provider')?.value === 'custom';
  }

  getProviderDisplayName(provider: string): string {
    return this.settingsService.getProviderDisplayName(provider as ProviderType);
  }

  onProviderChange(event: Event): void {
    const provider = (event.target as HTMLSelectElement).value as ProviderType;
    this.providerChange.emit(provider);
  }

  onToggleShowApiKey(): void {
    this.showApiKey.update(v => !v);
    this.toggleShowApiKey.emit();
  }

  onTestConnection(): void {
    this.testConnection.emit();
  }

  onRefreshModels(): void {
    this.refreshModels.emit();
  }
}
