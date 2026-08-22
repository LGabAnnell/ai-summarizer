import {ComponentFixture, TestBed} from '@angular/core/testing';
import {EmptyStateComponent} from './empty-state.component';
import {By} from '@angular/platform-browser';
import {beforeEach, describe, expect, it} from "vitest";

describe('EmptyStateComponent', () => {
  let component: EmptyStateComponent;
  let fixture: ComponentFixture<EmptyStateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmptyStateComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(EmptyStateComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // ==================== Component Creation Tests ====================

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have default values for all input signals', () => {
    expect(component.icon()).toBe('📰');
    expect(component.title()).toBe('Ready to summarize');
    expect(component.message()).toBe('Click the button below to summarize the current article');
  });

  // ==================== Input Binding Tests ====================

  describe('Input Bindings', () => {
    it('should display custom icon when icon input is set', () => {
      fixture.componentRef.setInput('icon', '🔍');
      fixture.detectChanges();

      const iconElement = fixture.debugElement.query(By.css('.empty-icon')).nativeElement;
      expect(iconElement.textContent).toBe('🔍');
    });

    it('should display custom title when title input is set', () => {
      fixture.componentRef.setInput('title', 'No articles found');
      fixture.detectChanges();

      const titleElement = fixture.debugElement.query(By.css('.empty-title')).nativeElement;
      expect(titleElement.textContent).toBe('No articles found');
    });

    it('should display custom message when message input is set', () => {
      fixture.componentRef.setInput('message', 'Try searching for something else');
      fixture.detectChanges();

      const messageElement = fixture.debugElement.query(By.css('.empty-message')).nativeElement;
      expect(messageElement.textContent).toBe('Try searching for something else');
    });
  });

  // ==================== Template Rendering Tests ====================

  describe('Template Rendering', () => {
    it('should show default icon in default state', () => {
      const iconElement = fixture.debugElement.query(By.css('.empty-icon')).nativeElement;
      expect(iconElement.textContent).toBe('📰');
    });

    it('should show default title in default state', () => {
      const titleElement = fixture.debugElement.query(By.css('.empty-title')).nativeElement;
      expect(titleElement.textContent).toBe('Ready to summarize');
    });

    it('should show default message in default state', () => {
      const messageElement = fixture.debugElement.query(By.css('.empty-message')).nativeElement;
      expect(messageElement.textContent).toBe('Click the button below to summarize the current article');
    });

    it('should render all three elements (icon, title, message)', () => {
      const iconElement = fixture.debugElement.query(By.css('.empty-icon'));
      const titleElement = fixture.debugElement.query(By.css('.empty-title'));
      const messageElement = fixture.debugElement.query(By.css('.empty-message'));

      expect(iconElement).toBeTruthy();
      expect(titleElement).toBeTruthy();
      expect(messageElement).toBeTruthy();
    });

    it('should update all elements when all inputs are changed', () => {
      fixture.componentRef.setInput('icon', '📭');
      fixture.componentRef.setInput('title', 'Empty inbox');
      fixture.componentRef.setInput('message', 'No messages to display');
      fixture.detectChanges();

      const iconElement = fixture.debugElement.query(By.css('.empty-icon')).nativeElement;
      const titleElement = fixture.debugElement.query(By.css('.empty-title')).nativeElement;
      const messageElement = fixture.debugElement.query(By.css('.empty-message')).nativeElement;

      expect(iconElement.textContent).toBe('📭');
      expect(titleElement.textContent).toBe('Empty inbox');
      expect(messageElement.textContent).toBe('No messages to display');
    });
  });

  // ==================== Class Binding Tests ====================

  describe('Class Bindings', () => {
    it('should have empty-state class on container', () => {
      const container = fixture.debugElement.query(By.css('.empty-state')).nativeElement;
      expect(container.classList.contains('empty-state')).toBeTruthy();
    });

    it('should have empty-icon class on icon container', () => {
      const iconContainer = fixture.debugElement.query(By.css('.empty-icon')).nativeElement;
      expect(iconContainer.classList.contains('empty-icon')).toBeTruthy();
    });

    it('should have empty-title class on title element', () => {
      const titleElement = fixture.debugElement.query(By.css('.empty-title')).nativeElement;
      expect(titleElement.classList.contains('empty-title')).toBeTruthy();
    });

    it('should have empty-message class on message element', () => {
      const messageElement = fixture.debugElement.query(By.css('.empty-message')).nativeElement;
      expect(messageElement.classList.contains('empty-message')).toBeTruthy();
    });
  });
});
