import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SummarizeButtonComponent } from './summarize-button.component';
import { By } from '@angular/platform-browser';
import { describe, it, beforeEach, expect, vi } from "vitest";
import {provideZonelessChangeDetection} from "@angular/core";

describe('SummarizeButtonComponent', () => {
  let component: SummarizeButtonComponent;
  let fixture: ComponentFixture<SummarizeButtonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SummarizeButtonComponent],
      providers: [provideZonelessChangeDetection()]
    }).compileComponents();

    fixture = TestBed.createComponent(SummarizeButtonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // ==================== Component Creation Tests ====================

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have default values for all input signals', () => {
    expect(component.loading()).toBeFalsy();
    expect(component.disabled()).toBe(false);
    expect(component.text()).toBe('Summarize Article');
    expect(component.loadingText()).toBe('Summarizing...');
  });

  // ==================== Input Binding Tests ====================

  describe('Input Bindings', () => {
    it('should display loading state with spinner when loading is true', () => {
      fixture.componentRef.setInput('loading', true);
      fixture.detectChanges();

      const spinner = fixture.debugElement.query(By.css('.spinner'));
      expect(spinner).toBeTruthy();

      const buttonText = fixture.debugElement.query(By.css('button')).nativeElement.textContent;
      expect(buttonText).toContain(component.loadingText());
    });

    it('should display default text when loading is false', () => {
      fixture.componentRef.setInput('loading', false);
      fixture.detectChanges();

      const buttonText = fixture.debugElement.query(By.css('button')).nativeElement.textContent;
      expect(buttonText).toContain(component.text());
    });

    it('should disable button when disabled is true', () => {
      fixture.componentRef.setInput('disabled', true);
      fixture.detectChanges();

      const button = fixture.debugElement.query(By.css('button')).nativeElement;
      expect(button.disabled).toBeTruthy();
    });

    it('should disable button when loading is true', () => {
      fixture.componentRef.setInput('loading', true);
      fixture.detectChanges();

      const button = fixture.debugElement.query(By.css('button')).nativeElement;
      expect(button.disabled).toBeTruthy();
    });

    it('should display custom text when text input is set', () => {
      fixture.componentRef.setInput('text', 'Generate Summary');
      fixture.detectChanges();

      const buttonText = fixture.debugElement.query(By.css('button')).nativeElement.textContent;
      expect(buttonText).toContain('Generate Summary');
    });

    it('should display custom loading text when loadingText input is set', () => {
      fixture.componentRef.setInput('loadingText', 'Please wait...');
      fixture.componentRef.setInput('loading', true);
      fixture.detectChanges();

      const buttonText = fixture.debugElement.query(By.css('button')).nativeElement.textContent;
      expect(buttonText).toContain('Please wait...');
    });
  });

  // ==================== Output Event Tests ====================

  describe('Output Events', () => {
    it('should emit buttonClick event when button is clicked', () => {
      vi.spyOn(component.buttonClick, 'emit');

      const button = fixture.debugElement.query(By.css('button'));
      button.triggerEventHandler('click', null);

      expect(component.buttonClick.emit).toHaveBeenCalled();
    });

    it('should not emit buttonClick event when button is disabled', () => {
      fixture.componentRef.setInput('disabled', true);
      fixture.detectChanges();

      vi.spyOn(component.buttonClick, 'emit');

      const button = fixture.debugElement.query(By.css('button')).nativeElement;
      button.click();

      expect(component.buttonClick.emit).not.toHaveBeenCalled();
    });

    it('should not emit buttonClick event when loading is true', () => {
      fixture.componentRef.setInput('loading', true);
      fixture.detectChanges();

      vi.spyOn(component.buttonClick, 'emit');

      const button = fixture.debugElement.query(By.css('button')).nativeElement;
      button.click();

      expect(component.buttonClick.emit).not.toHaveBeenCalled();
    });
  });

  // ==================== Template Rendering Tests ====================

  describe('Template Rendering', () => {
    it('should show default text in default state', () => {
      const buttonText = fixture.debugElement.query(By.css('button')).nativeElement.textContent;
      expect(buttonText.trim()).toBe('Summarize Article');
    });

    it('should show spinner and loading text in loading state', () => {
      fixture.componentRef.setInput('loading', true);
      fixture.detectChanges();

      const spinner = fixture.debugElement.query(By.css('.spinner'));
      expect(spinner).toBeTruthy();

      const buttonText = fixture.debugElement.query(By.css('button')).nativeElement.textContent;
      expect(buttonText.trim()).toContain('Summarizing...');
    });

    it('should show custom text in non-loading state', () => {
      fixture.componentRef.setInput('text', 'Get Summary');
      fixture.detectChanges();

      const buttonText = fixture.debugElement.query(By.css('button')).nativeElement.textContent;
      expect(buttonText.trim()).toBe('Get Summary');
    });

    it('should have disabled attribute when disabled', () => {
      fixture.componentRef.setInput('disabled', true);
      fixture.detectChanges();

      const button = fixture.debugElement.query(By.css('button')).nativeElement;
      expect(button.hasAttribute('disabled')).toBe(true);
      expect(button.disabled).toBe(true);
    });

    it('should have disabled attribute when loading', () => {
      fixture.componentRef.setInput('loading', true);
      fixture.detectChanges();

      const button = fixture.debugElement.query(By.css('button')).nativeElement;
      expect(button.hasAttribute('disabled')).toBe(true);
      expect(button.disabled).toBe(true);
    });
  });

  // ==================== Class Binding Tests ====================

  describe('Class Bindings', () => {
    it('should apply btn class', () => {
      const button = fixture.debugElement.query(By.css('button')).nativeElement;
      expect(button.classList.contains('btn')).toBeTruthy();
    });

    it('should apply btn--primary class', () => {
      const button = fixture.debugElement.query(By.css('button')).nativeElement;
      expect(button.classList.contains('btn--primary')).toBeTruthy();
    });

    it('should apply btn--full-width class', () => {
      const button = fixture.debugElement.query(By.css('button')).nativeElement;
      expect(button.classList.contains('btn--full-width')).toBeTruthy();
    });
  });
});
