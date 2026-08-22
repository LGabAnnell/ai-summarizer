import {Component, input} from '@angular/core';
import {CommonModule} from '@angular/common';

/**
 * Reusable summary metadata component
 * Displays character count, cached status, and provider/model information
 */
@Component({
  selector: 'shared-summary-meta',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="summary-meta">
      <span>{{ characterCount() }} characters</span>
      @if (cached()) {
        <span class="cached-badge">Cached</span>
      }
      @if (provider() && model()) {
        <span class="text-muted">{{ provider() }} / {{ model() }}</span>
      }
    </div>
  `,
  styles: [
    `
      .summary-meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 12px;
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid var(--border-color);
        font-size: 12px;
        color: var(--text-muted);
      }

      .cached-badge {
        background-color: var(--primary-light);
        color: var(--primary-color);
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 500;
      }

      .text-muted {
        color: var(--text-muted);
      }
    `
  ]
})
export class SummaryMetaComponent {
  characterCount = input<number>(0);
  cached = input<boolean>(false);
  provider = input<string>('');
  model = input<string>('');
}