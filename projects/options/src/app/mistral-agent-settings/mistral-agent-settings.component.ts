import {Component, inject, input, output, signal} from '@angular/core';
import {CommonModule} from '@angular/common';
import {ControlContainer, FormGroupDirective, ReactiveFormsModule} from '@angular/forms';
import {ProviderType, SettingsService} from '@shared/public-api';

/**
 * Mistral agent configuration section component
 * Handles Mistral agent ID and version settings for classification
 */
@Component({
  selector: 'options-mistral-agent-settings',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: 'mistral-agent-settings.component.html',
  styleUrl: 'mistral-agent-settings.component.scss',
  viewProviders: [{provide: ControlContainer, useExisting: FormGroupDirective}],
})
export class MistralAgentSettingsComponent {
  // Inputs
  currentProvider = input<string>('mistral');

  // Outputs
  agentSettingsChange = output<void>();

  // Local state
  showAgentInfo = signal<boolean>(false);

  private settingsService = inject(SettingsService);
  private formDirective = inject(FormGroupDirective);

  get isMistralProvider() {
    return this.currentProvider() === 'mistral';
  }

  get agentId() {
    return this.formDirective.control.get('mistralAgentId')?.value || '';
  }

  get agentVersion() {
    return this.formDirective.control.get('mistralAgentVersion')?.value || '';
  }

  get agentIdErrors() {
    return this.formDirective.control.get('mistralAgentId')?.errors;
  }

  get agentVersionErrors() {
    return this.formDirective.control.get('mistralAgentVersion')?.errors;
  }

  get isAgentConfigured() {
    return this.agentId && this.agentVersion;
  }

  onToggleAgentInfo(): void {
    this.showAgentInfo.update(v => !v);
  }

  getProviderDisplayName(provider: string): string {
    return this.settingsService.getProviderDisplayName(provider as ProviderType);
  }
}
