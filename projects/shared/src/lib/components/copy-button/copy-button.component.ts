import {Component, input, output} from '@angular/core';
import {CommonModule} from '@angular/common';

/**
 * Reusable copy button component with loading and success states
 * Used for copying summary text to clipboard
 */
@Component({
  selector: 'shared-copy-button',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
            class="copy-btn"
            [class.copy-btn--success]="copied()"
            [disabled]="disabled()"
            (click)="copyClick.emit()">
      @if (copying()) {
        <span class="spinner">{{ darkSpinner() ? 'spinner-dark' : 'spinner' }}</span>
        {{ loadingText() }}
      } @else if (copied()) {
        {{ successText() }}
      } @else {
        {{ text() }}
      }
    </button>
  `,
  styles: [
    `
      .copy-btn {
        padding: 6px 12px;
        font-size: 13px;
        background: transparent;
        border: 1px solid var(--border-color);
        border-radius: var(--border-radius);
        cursor: pointer;
        color: var(--text-secondary);
        display: inline-flex;
        align-items: center;
        gap: 6px;

        &:hover:not(:disabled) {
          background-color: var(--primary-light);
          border-color: var(--primary-color);
          color: var(--primary-color);
        }

        &:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        &.copy-btn--success {
          background-color: var(--success-color) !important;
          border-color: var(--success-color) !important;
          color: white !important;
        }
      }

      .spinner {
        display: inline-block;
        width: 12px;
        height: 12px;
        border: 2px solid rgba(0, 0, 0, 0.1);
        border-radius: 50%;
        border-top-color: #666;
        animation: spin 1s ease-in-out infinite;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
    `
  ]
})
export class CopyButtonComponent {
  // Inputs
  copying = input<boolean>(false);
  copied = input<boolean>(false);
  disabled = input<boolean>(false);
  text = input<string>('Copy');
  successText = input<string>('✓ Copied!');
  loadingText = input<string>('Copying...');
  darkSpinner = input<boolean>(false);

  // Output
  copyClick = output<void>();
}