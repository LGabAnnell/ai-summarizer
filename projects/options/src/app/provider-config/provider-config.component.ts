import { Component, computed, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ProviderType, SettingsService } from '@shared/public-api';

/**
 * Provider configuration section component
 * Handles AI provider selection, model selection, API key input, and custom endpoint
 */
@Component({
  selector: 'options-provider-config',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: 'provider-config.component.html',
  styleUrl: 'provider-config.component.scss'
})
export class ProviderConfigComponent {
  // Inputs
  parentForm = input.required<FormGroup>();
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

  // Injected service
  private settingsService = inject(SettingsService);

  // Computed
  apiKeyError = computed(() => {
    const form = this.parentForm().value;
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
