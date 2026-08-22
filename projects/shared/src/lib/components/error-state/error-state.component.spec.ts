import {ComponentFixture, TestBed} from '@angular/core/testing';
import {ErrorStateComponent} from './error-state.component';
import {By} from '@angular/platform-browser';
import {beforeEach, describe, expect, it, vi} from "vitest";

describe('ErrorStateComponent', () => {
  let component: ErrorStateComponent;
  let fixture: ComponentFixture<ErrorStateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ErrorStateComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(ErrorStateComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // ==================== Component Creation Tests ====================

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have default values for all input signals', () => {
    expect(component.error()).toBe('Failed to summarize article');
    expect(component.showRetry()).toBe(true);
    expect(component.retryText()).toBe('Retry');
  });

  // ==================== Input Binding Tests ====================

  describe('Input Bindings', () => {
    it('should display custom error message when error input is set', () => {
      fixture.componentRef.setInput('error', 'Custom error message');
      fixture.detectChanges();

      const errorMessage = fixture.debugElement.query(By.css('.error-message')).nativeElement.textContent;
      expect(errorMessage).toBe('Custom error message');
    });

    it('should hide retry button when showRetry is false', () => {
      fixture.componentRef.setInput('showRetry', false);
      fixture.detectChanges();

      const retryButton = fixture.debugElement.query(By.css('.retry-btn'));
      expect(retryButton).toBeNull();
    });

    it('should show retry button when showRetry is true', () => {
      fixture.componentRef.setInput('showRetry', true);
      fixture.detectChanges();

      const retryButton = fixture.debugElement.query(By.css('.retry-btn'));
      expect(retryButton).toBeTruthy();
    });

    it('should display custom retry text when retryText input is set', () => {
      fixture.componentRef.setInput('retryText', 'Try Again');
      fixture.detectChanges();

      const retryButton = fixture.debugElement.query(By.css('.retry-btn')).nativeElement.textContent;
      expect(retryButton).toBe('Try Again');
    });
  });

  // ==================== Output Event Tests ====================

  describe('Output Events', () => {
    it('should emit retry event when retry button is clicked', () => {
      vi.spyOn(component.retry, 'emit');

      const retryButton = fixture.debugElement.query(By.css('.retry-btn'));
      retryButton.triggerEventHandler('click', null);

      expect(component.retry.emit).toHaveBeenCalled();
    });

    it('should not emit retry event when showRetry is false', () => {
      fixture.componentRef.setInput('showRetry', false);
      fixture.detectChanges();

      vi.spyOn(component.retry, 'emit');

      // Try to find and click button - should not exist
      const retryButton = fixture.debugElement.query(By.css('.retry-btn'));
      expect(retryButton).toBeNull();
      expect(component.retry.emit).not.toHaveBeenCalled();
    });
  });

  // ==================== Template Rendering Tests ====================

  describe('Template Rendering', () => {
    it('should display error icon', () => {
      const errorIcon = fixture.debugElement.query(By.css('.error-icon'));
      expect(errorIcon).toBeTruthy();
      expect(errorIcon.nativeElement.textContent).toBe('⚠️');
    });

    it('should display error title', () => {
      const errorTitle = fixture.debugElement.query(By.css('.error-title'));
      expect(errorTitle).toBeTruthy();
      expect(errorTitle.nativeElement.textContent).toBe('Error');
    });

    it('should display default error message', () => {
      const errorMessage = fixture.debugElement.query(By.css('.error-message')).nativeElement.textContent;
      expect(errorMessage).toBe('Failed to summarize article');
    });

    it('should display retry button with default text', () => {
      const retryButton = fixture.debugElement.query(By.css('.retry-btn'));
      expect(retryButton).toBeTruthy();
      expect(retryButton.nativeElement.textContent).toBe('Retry');
    });

    it('should have error-state container class', () => {
      const container = fixture.debugElement.query(By.css('.error-state'));
      expect(container).toBeTruthy();
    });
  });

  // ==================== Conditional Rendering Tests ====================

  describe('Conditional Rendering', () => {
    it('should show retry button by default (showRetry defaults to true)', () => {
      const retryButton = fixture.debugElement.query(By.css('.retry-btn'));
      expect(retryButton).toBeTruthy();
    });

    it('should not show retry button when showRetry is false', () => {
      fixture.componentRef.setInput('showRetry', false);
      fixture.detectChanges();

      const retryButton = fixture.debugElement.query(By.css('.retry-btn'));
      expect(retryButton).toBeNull();
    });

    it('should show retry button when showRetry is true', () => {
      fixture.componentRef.setInput('showRetry', true);
      fixture.detectChanges();

      const retryButton = fixture.debugElement.query(By.css('.retry-btn'));
      expect(retryButton).toBeTruthy();
    });
  });
});
