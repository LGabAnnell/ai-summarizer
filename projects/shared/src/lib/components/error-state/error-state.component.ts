import {Component, input, output} from '@angular/core';
import {CommonModule} from '@angular/common';

/**
 * Reusable error state component
 * Displays error information with an optional retry button
 */
@Component({
  selector: 'shared-error-state',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="error-state">
      <div class="error-icon">⚠️</div>
      <div class="error-title">Error</div>
      <div class="error-message">{{ error() }}</div>
      @if (showRetry()) {
        <button class="retry-btn" (click)="retry.emit()">{{ retryText() }}</button>
      }
    </div>
  `,
  styles: [
    `
      .error-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 32px 16px;
        text-align: center;
        color: var(--text-secondary);
      }

      .error-icon {
        width: 64px;
        height: 64px;
        margin-bottom: 16px;
        background-color: rgba(239, 68, 68, 0.1);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 32px;
      }

      .error-title {
        font-size: 18px;
        font-weight: 600;
        color: var(--text-primary);
        margin-bottom: 8px;
      }

      .error-message {
        font-size: 14px;
        color: var(--text-secondary);
        margin-bottom: 16px;
      }

      .retry-btn {
        padding: 10px 20px;
        background-color: var(--primary-color);
        color: white;
        border: none;
        border-radius: var(--border-radius);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;

        &:hover {
          background-color: var(--primary-hover);
        }
      }
    `
  ]
})
export class ErrorStateComponent {
  error = input<string>('Failed to summarize article');
  showRetry = input<boolean>(true);
  retryText = input<string>('Retry');

  retry = output<void>();
}