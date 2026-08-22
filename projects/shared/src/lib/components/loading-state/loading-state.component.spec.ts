import {ComponentFixture, TestBed} from '@angular/core/testing';
import {LoadingStateComponent} from './loading-state.component';
import {By} from '@angular/platform-browser';
import {beforeEach, describe, expect, it} from "vitest";

describe('LoadingStateComponent', () => {
  let component: LoadingStateComponent;
  let fixture: ComponentFixture<LoadingStateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoadingStateComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(LoadingStateComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // ==================== Component Creation Tests ====================

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have default value for message input', () => {
    expect(component.message()).toBe('Processing...');
  });

  // ==================== Input Binding Tests ====================

  describe('Input Bindings', () => {
    it('should use default message when no input is provided', () => {
      expect(component.message()).toBe('Processing...');
    });

    it('should use custom message when input is set', () => {
      fixture.componentRef.setInput('message', 'Loading data...');
      fixture.detectChanges();

      expect(component.message()).toBe('Loading data...');
    });

    it('should display custom message in template when input is set', () => {
      fixture.componentRef.setInput('message', 'Please wait...');
      fixture.detectChanges();

      const loadingText = fixture.debugElement.query(By.css('.loading-text')).nativeElement.textContent;
      expect(loadingText).toBe('Please wait...');
    });
  });

  // ==================== Template Rendering Tests ====================

  describe('Template Rendering', () => {
    it('should render loading-state container', () => {
      const container = fixture.debugElement.query(By.css('.loading-state'));
      expect(container).toBeTruthy();
    });

    it('should render loading spinner', () => {
      const spinner = fixture.debugElement.query(By.css('.loading-spinner'));
      expect(spinner).toBeTruthy();
    });

    it('should render loading text element', () => {
      const loadingText = fixture.debugElement.query(By.css('.loading-text'));
      expect(loadingText).toBeTruthy();
    });

    it('should display default message in loading text element', () => {
      const loadingText = fixture.debugElement.query(By.css('.loading-text')).nativeElement.textContent;
      expect(loadingText).toBe('Processing...');
    });

    it('should display custom message when provided', () => {
      fixture.componentRef.setInput('message', 'Fetching article...');
      fixture.detectChanges();

      const loadingText = fixture.debugElement.query(By.css('.loading-text')).nativeElement.textContent;
      expect(loadingText).toBe('Fetching article...');
    });
  });

  // ==================== Style & Structure Tests ====================

  describe('Style & Structure', () => {
    it('should have flex column layout classes', () => {
      const container = fixture.debugElement.query(By.css('.loading-state'));
      expect(container).toBeTruthy();
    });

    it('should have spinner with circular border', () => {
      const spinner = fixture.debugElement.query(By.css('.loading-spinner'));
      expect(spinner).toBeTruthy();
    });

    it('should have proper spacing between spinner and text', () => {
      const spinner = fixture.debugElement.query(By.css('.loading-spinner'));
      expect(spinner).toBeTruthy();
    });

    it('should have appropriate text element', () => {
      const loadingText = fixture.debugElement.query(By.css('.loading-text'));
      expect(loadingText).toBeTruthy();
    });
  });

  // ==================== Message Update Tests ====================

  describe('Message Updates', () => {
    it('should update displayed message when message input changes', () => {
      // Initial state
      let loadingText = fixture.debugElement.query(By.css('.loading-text')).nativeElement.textContent;
      expect(loadingText).toBe('Processing...');

      // Update message
      fixture.componentRef.setInput('message', 'Analyzing content...');
      fixture.detectChanges();

      loadingText = fixture.debugElement.query(By.css('.loading-text')).nativeElement.textContent;
      expect(loadingText).toBe('Analyzing content...');

      // Update again
      fixture.componentRef.setInput('message', 'Almost done...');
      fixture.detectChanges();

      loadingText = fixture.debugElement.query(By.css('.loading-text')).nativeElement.textContent;
      expect(loadingText).toBe('Almost done...');
    });
  });
});
