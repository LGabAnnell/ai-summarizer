import {Component, input, output} from '@angular/core';
import {CommonModule} from '@angular/common';

/**
 * Reusable sticky save bar component
 * Displays save and reset buttons with loading state
 */
@Component({
  selector: 'shared-save-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="save-bar" [class.save-bar--compact]="isScrolled()">
      <div class="save-bar-buttons">
        <button
                type="submit"
                class="btn btn--primary"
                [disabled]="isLoading() || formInvalid()"
                (click)="save.emit()">
          @if (isScrolled()) {
            <span>Save</span>
          } @else {
            @if (isLoading()) {
              <span class="spinner"></span>
              Saving...
            } @else {
              Save Settings
            }
          }
        </button>
        @if (!isScrolled()) {
          <button
                  type="button"
                  class="btn btn--secondary"
                  (click)="reset.emit()"
                  [disabled]="isLoading()">
            Reset to Defaults
          </button>
        }
      </div>
    </div>
  `,
  styles: [`
    :host {
      position: sticky;
      top: 0;
      z-index: 100;
    }

    .save-bar {
      background: var(--bg-primary, #f8f9fa);
      border-bottom: 1px solid var(--border-color, #e0e0e0);
      padding-top: 16px;
      padding-bottom: 16px;
      padding-left: 12px;
      transition: all 0.2s ease;
      margin-bottom: 16px;
    }

    .save-bar--compact {
      padding-top: 8px;
      padding-bottom: 8px;
      padding-left: 6px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      background: var(--bg-primary, #f8f9fa);
      border-bottom: 1px solid var(--border-color, #e0e0e0);
    }

    .save-bar--compact .btn {
      padding: 6px 12px;
      font-size: 13px;
    }

    .save-bar-buttons {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }

    .save-bar-buttons .btn {
      min-width: 120px;
    }

    .save-bar--compact .save-bar-buttons .btn:not(:first-child) {
      display: none;
    }

    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      border-top-color: #fff;
      animation: spin 1s ease-in-out infinite;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    .btn {
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      border: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;

      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    }

    .btn--primary {
      background: var(--primary-color, #007bff);
      color: white;

      &:hover:not(:disabled) {
        background: var(--primary-hover, #0056b3);
      }
    }

    .btn--secondary {
      background: transparent;
      color: var(--primary-color, #007bff);
      border: 1px solid var(--primary-color, #007bff);

      &:hover:not(:disabled) {
        background: rgba(0, 123, 255, 0.1);
      }
    }
  `]
})
export class SaveBarComponent {
  isLoading = input<boolean>(false);
  isScrolled = input<boolean>(false);
  formInvalid = input<boolean>(false);

  save = output<void>();
  reset = output<void>();
}
