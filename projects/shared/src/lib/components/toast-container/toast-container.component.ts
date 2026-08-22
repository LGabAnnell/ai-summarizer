import {Component, input, output} from '@angular/core';
import {CommonModule} from '@angular/common';

/**
 * Reusable toast notification container component
 * Displays error and success toast messages with dismiss buttons
 */
@Component({
  selector: 'shared-toast-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container">
      <!-- Error Toast -->
      @if (error()) {
        <div class="toast toast--error">
          <span class="toast-icon">⚠️</span>
          <div class="toast-content">
            <div class="toast-message">{{ error() }}</div>
          </div>
          <button class="toast-close" (click)="clearError.emit()">×</button>
        </div>
      }

      <!-- Success Toast -->
      @if (successMessage()) {
        <div class="toast toast--success">
          <span class="toast-icon">✓</span>
          <div class="toast-content">
            <div class="toast-message">{{ successMessage() }}</div>
          </div>
          <button class="toast-close" (click)="clearSuccess.emit()">×</button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .toast-container {
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 10000;
        display: flex;
        flex-direction: column;
        gap: 12px;
        pointer-events: none;
      }

      .toast {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 12px 16px;
        border-radius: 8px;
        background: var(--bg-primary, #fff);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        border: 1px solid var(--border-color, #e0e0e0);
        pointer-events: auto;
        min-width: 280px;
        max-width: 400px;
        animation: slideIn 0.3s ease;
      }

      @keyframes slideIn {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }

      .toast-icon {
        font-size: 18px;
        flex-shrink: 0;
        line-height: 1;
      }

      .toast-content {
        flex: 1;
      }

      .toast-message {
        font-size: 14px;
        line-height: 1.4;
        color: var(--text-primary, #333);
      }

      .toast-close {
        background: none;
        border: none;
        cursor: pointer;
        font-size: 20px;
        line-height: 1;
        color: var(--text-muted, #666);
        opacity: 0.6;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        flex-shrink: 0;

        &:hover {
          opacity: 1;
          background: var(--hover-bg, #f0f0f0);
        }
      }

      .toast--error {
        border-left: 4px solid #721c24;
        background: #f8d7da;
        color: #721c24;

        .toast-icon {
          color: #721c24;
        }

        .toast-message {
          color: #721c24;
        }

        .toast-close {
          color: #721c24;
        }
      }

      .toast--success {
        border-left: 4px solid #155724;
        background: #d4edda;
        color: #155724;

        .toast-icon {
          color: #155724;
        }

        .toast-message {
          color: #155724;
        }

        .toast-close {
          color: #155724;
        }
      }
    `
  ]
})
export class ToastContainerComponent {
  error = input<string | undefined>(undefined);
  successMessage = input<string | undefined>(undefined);

  clearError = output<void>();
  clearSuccess = output<void>();
}
