import {Component, computed, DestroyRef, inject, OnInit, signal} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {CommonModule} from '@angular/common';
import {ControlContainer, FormGroupDirective, ReactiveFormsModule} from '@angular/forms';
import {SUMMARY_PROMPTS, SummaryStyle} from '@shared/public-api';

/**
 * Summarization settings section component
 * Handles summary style, temperature, custom prompt, and max tokens controls
 */
@Component({
  selector: 'options-summarization-settings',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: 'summarization-settings.component.html',
  styleUrl: 'summarization-settings.component.scss',
  viewProviders: [{provide: ControlContainer, useExisting: FormGroupDirective}],
})
export class SummarizationSettingsComponent implements OnInit {
  private formDirective = inject(FormGroupDirective);
  private destroyRef = inject(DestroyRef);
  private summaryStyle = signal<SummaryStyle>('concise');

  ngOnInit(): void {
    const summaryStyleControl = this.formDirective.control.get('summaryStyle');
    if (!summaryStyleControl) return;

    this.summaryStyle.set((summaryStyleControl.value ?? 'concise') as SummaryStyle);
    summaryStyleControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.summaryStyle.set((value ?? 'concise') as SummaryStyle));
  }

  isCustomStyle = computed(() => this.currentStyle() === 'custom');

  currentStyle = computed(() => this.summaryStyle());

  predefinedPrompt = computed(() => SUMMARY_PROMPTS[this.currentStyle()] ?? '');

  setMaxTokens(value: number): void {
    this.formDirective.control.get('maxTokens')?.setValue(value);
  }
}
