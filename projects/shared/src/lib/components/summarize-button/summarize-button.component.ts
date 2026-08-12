import {Component, input, output} from '@angular/core';
import {CommonModule} from '@angular/common';

/**
 * Reusable summarize button component
 * Primary action button for triggering article summarization
 */
@Component({
  selector: 'shared-summarize-button',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
            class="btn btn--primary btn--full-width"
            (click)="buttonClick.emit()"
            [disabled]="loading() || disabled()">
      @if (loading()) {
        <span class="spinner"></span>
        {{ loadingText() }}
      } @else {
        {{ text() }}
      }
    </button>
  `,
  styles: [`
    :host {
      padding-bottom: 6px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 20px;
      border: none;
      border-radius: var(--border-radius);
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      transition: var(--transition);

      &:hover:not(:disabled) {
        opacity: 0.9;
      }

      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      &.btn--primary {
        background-color: var(--primary-color);
        color: white;

        &:hover:not(:disabled) {
          background-color: var(--primary-hover);
        }
      }

      &.btn--full-width {
        width: 100%;
      }
    }

    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      border-top-color: white;
      animation: spin 1s ease-in-out infinite;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
  `]
})
export class SummarizeButtonComponent {
  loading = input<boolean>(false);
  disabled = input<boolean>(false);
  text = input<string>('Summarize Article');
  loadingText = input<string>('Summarizing...');

  buttonClick = output<void>();
}