import {Component, DestroyRef, inject, input, OnInit, output, signal} from '@angular/core';
import {CommonModule} from '@angular/common';
import {ControlContainer, FormGroupDirective, ReactiveFormsModule} from '@angular/forms';
import {ProviderType, SettingsService} from '@shared/public-api';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';

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
export class MistralAgentSettingsComponent implements OnInit {
  // Inputs
  currentProvider = input<string>('mistral');

  // Outputs
  agentSettingsChange = output<void>();

  // Local state
  showAgentInfo = signal<boolean>(false);

  private settingsService = inject(SettingsService);
  private formDirective = inject(FormGroupDirective);
  private destroyRef = inject(DestroyRef);
  private formValue = signal<{mistralAgentEnabled?: boolean; mistralAgentId?: string; mistralAgentVersion?: string}>({});

  ngOnInit(): void {
    this.formValue.set(this.formDirective.control.value);
    this.formDirective.control.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.formValue.set(value));
  }

  get isMistralProvider() {
    return this.currentProvider() === 'mistral';
  }

  get agentId() {
    return this.formValue().mistralAgentId || '';
  }

  get agentVersion() {
    return this.formValue().mistralAgentVersion || '';
  }

  get agentIdErrors() {
    return this.formDirective.control.get('mistralAgentId')?.errors;
  }

  get agentVersionErrors() {
    return this.formDirective.control.get('mistralAgentVersion')?.errors;
  }

  get isAgentEnabled(): boolean {
    return this.formValue().mistralAgentEnabled === true;
  }

  get isAgentConfigured(): boolean {
    return Boolean(this.agentId && this.agentVersion);
  }

  onToggleAgentInfo(): void {
    this.showAgentInfo.update(v => !v);
  }

  getProviderDisplayName(provider: string): string {
    return this.settingsService.getProviderDisplayName(provider as ProviderType);
  }
}
