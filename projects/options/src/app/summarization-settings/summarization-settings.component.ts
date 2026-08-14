import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';

/**
 * Summarization settings section component
 * Handles summary style, temperature, custom prompt, and max tokens controls
 */
@Component({
  selector: 'options-summarization-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: 'summarization-settings.component.html',
  styleUrl: 'summarization-settings.component.scss'
})
export class SummarizationSettingsComponent {
  parentForm = input.required<FormGroup>();
}
