import {Component, inject} from '@angular/core';
import {CommonModule} from '@angular/common';
import {ControlContainer, FormGroupDirective, ReactiveFormsModule} from '@angular/forms';
import {SUMMARY_PROMPTS, SummaryStyle} from '@shared/public-api';

/**
 * Summarization settings section component
 * Handles summary style, temperature, custom prompt, and max tokens controls
 */
@Component({
  selector: 'options-summarization-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: 'summarization-settings.component.html',
  styleUrl: 'summarization-settings.component.scss',
  viewProviders: [{provide: ControlContainer, useExisting: FormGroupDirective}],
})
export class SummarizationSettingsComponent {
  private formDirective = inject(FormGroupDirective);

  get isCustomStyle() {
    return this.currentStyle === 'custom';
  }

  get currentStyle(): SummaryStyle {
    return (this.formDirective.control.get('summaryStyle')?.value ?? 'concise') as SummaryStyle;
  }

  get predefinedPrompt(): string {
    return SUMMARY_PROMPTS[this.currentStyle] ?? '';
  }
}
