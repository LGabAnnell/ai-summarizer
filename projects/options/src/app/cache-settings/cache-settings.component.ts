import { Component, inject, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlContainer, FormGroupDirective, ReactiveFormsModule } from '@angular/forms';

/**
 * Cache settings section component
 * Handles cache enable/disable, TTL setting, and clear cache button
 */
@Component({
  selector: 'options-cache-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: 'cache-settings.component.html',
  styleUrl: 'cache-settings.component.scss',
  viewProviders: [{ provide: ControlContainer, useExisting: FormGroupDirective }],
})
export class CacheSettingsComponent {
  isLoading = input<boolean>(false);

  clearCache = output<void>();

  private formDirective = inject(FormGroupDirective);

  get cacheEnabledValue() {
    return this.formDirective.control.get('cacheEnabled')?.value;
  }

  incrementCacheTTL(): void {
    const current = this.formDirective.control.get('cacheTTL')?.value || 7;
    if (current < 30) {
      this.formDirective.control.patchValue({cacheTTL: current + 1});
    }
  }

  decrementCacheTTL(): void {
    const current = this.formDirective.control.get('cacheTTL')?.value || 7;
    if (current > 1) {
      this.formDirective.control.patchValue({cacheTTL: current - 1});
    }
  }

  onClearCache(): void {
    this.clearCache.emit();
  }
}
