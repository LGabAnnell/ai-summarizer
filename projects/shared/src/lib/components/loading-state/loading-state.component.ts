import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Reusable loading state component
 * Displays a spinner with a customizable loading message
 */
@Component({
  selector: 'shared-loading-state',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <div class="loading-text">{{ message() }}</div>
    </div>
  `,
  styles: [
    `
    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 16px;
      text-align: center;
      color: var(--text-secondary);
    }

    .loading-spinner {
      width: 50px;
      height: 50px;
      border: 4px solid var(--primary-light);
      border-radius: 50%;
      border-top-color: var(--primary-color);
      animation: spin 1s ease-in-out infinite;
      margin-bottom: 16px;
    }

    .loading-text {
      font-size: 15px;
      color: var(--text-secondary);
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    `
  ]
})
export class LoadingStateComponent {
  message = input<string>('Processing...');
}