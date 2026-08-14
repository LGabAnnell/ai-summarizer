import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';

/**
 * Cache settings section component
 * Handles cache enable/disable, TTL setting, and clear cache button
 */
@Component({
  selector: 'options-cache-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: 'cache-settings.component.html',
  styleUrl: 'cache-settings.component.scss'
})
export class CacheSettingsComponent {
  parentForm = input.required<FormGroup>();
  isLoading = input<boolean>(false);

  clearCache = output<void>();

  incrementCacheTTL(): void {
    const current = this.parentForm().get('cacheTTL')?.value || 7;
    if (current < 30) {
      this.parentForm().patchValue({cacheTTL: current + 1});
    }
  }

  decrementCacheTTL(): void {
    const current = this.parentForm().get('cacheTTL')?.value || 7;
    if (current > 1) {
      this.parentForm().patchValue({cacheTTL: current - 1});
    }
  }

  onClearCache(): void {
    this.clearCache.emit();
  }
}
