import {Component, inject, input, output} from '@angular/core';
import {CommonModule} from '@angular/common';
import {ControlContainer, FormGroupDirective, ReactiveFormsModule} from '@angular/forms';

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
  viewProviders: [{provide: ControlContainer, useExisting: FormGroupDirective}],
})
export class CacheSettingsComponent {
  isLoading = input<boolean>(false);

  clearCache = output<void>();

  private formDirective = inject(FormGroupDirective);

  get cacheEnabledValue() {
    return this.formDirective.control.get('cacheEnabled')?.value;
  }

  onClearCache(): void {
    this.clearCache.emit();
  }
}
