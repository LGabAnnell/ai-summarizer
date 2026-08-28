import {ComponentFixture, TestBed} from '@angular/core/testing';
import {CopyButtonComponent} from './copy-button.component';
import {By} from '@angular/platform-browser';
import {beforeEach, describe, expect, it, vi} from "vitest";

describe('CopyButtonComponent', () => {
  let component: CopyButtonComponent;
  let fixture: ComponentFixture<CopyButtonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CopyButtonComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(CopyButtonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // ==================== Component Creation Tests ====================

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have default values for all input signals', () => {
    expect(component.copying()).toBeFalsy();
    expect(component.copied()).toBe(false);
    expect(component.disabled()).toBe(false);
    expect(component.text()).toBe('Copy');
    expect(component.successText()).toBe('\u2713 Copied!');
    expect(component.loadingText()).toBe('Copying...');
    expect(component.darkSpinner()).toBe(false);
  });

  // ==================== Input Binding Tests ====================

  describe('Input Bindings', () => {
    it('should display loading state with spinner when copying is true', () => {
      fixture.componentRef.setInput('copying', true);
      fixture.detectChanges();

      const spinner = fixture.debugElement.query(By.css('.spinner'));
      expect(spinner).toBeTruthy();

      const buttonText = fixture.debugElement.query(By.css('button')).nativeElement.textContent;
      expect(buttonText).toContain(component.loadingText());
    });

    it('should display success text when copied is true', () => {
      fixture.componentRef.setInput('copied', true);
      fixture.detectChanges();

      const buttonText = fixture.debugElement.query(By.css('button')).nativeElement.textContent;
      expect(buttonText).toContain(component.successText());
    });

    it('should display default text when text input is set', () => {
      fixture.componentRef.setInput('text', 'Custom Copy');
      fixture.detectChanges();

      const buttonText = fixture.debugElement.query(By.css('button')).nativeElement.textContent;
      expect(buttonText).toContain('Custom Copy');
    });

    it('should display custom success text when successText input is set', () => {
      fixture.componentRef.setInput('successText', 'Copied successfully!');
      fixture.componentRef.setInput('copied', true);
      fixture.detectChanges();

      const buttonText = fixture.debugElement.query(By.css('button')).nativeElement.textContent;
      expect(buttonText).toContain('Copied successfully!');
    });

    it('should display custom loading text when loadingText input is set', () => {
      fixture.componentRef.setInput('loadingText', 'Please wait...');
      fixture.componentRef.setInput('copying', true);
      fixture.detectChanges();

      const buttonText = fixture.debugElement.query(By.css('button')).nativeElement.textContent;
      expect(buttonText).toContain('Please wait...');
    });

    it('should apply dark spinner class when darkSpinner is true', () => {
      fixture.componentRef.setInput('darkSpinner', true);
      fixture.componentRef.setInput('copying', true);
      fixture.detectChanges();

      const spinner = fixture.debugElement.query(By.css('.spinner'));
      expect(spinner.nativeElement.textContent).toContain('spinner-dark');
    });
  });

  // ==================== Output Event Tests ====================

  describe('Output Events', () => {
    it('should emit copyClick event when button is clicked', () => {
      vi.spyOn(component.copyClick, 'emit');

      const button = fixture.debugElement.query(By.css('button'));
      button.triggerEventHandler('click', null);

      expect(component.copyClick.emit).toHaveBeenCalled();
    });

    it('should not emit copyClick event when button is disabled', () => {
      fixture.componentRef.setInput('disabled', true);
      fixture.detectChanges();

      vi.spyOn(component.copyClick, 'emit');

      const button = fixture.debugElement.query(By.css('button')).nativeElement;
      button.click();

      expect(component.copyClick.emit).not.toHaveBeenCalled();
    });
  });

  // ==================== Template Rendering Tests ====================

  describe('Template Rendering', () => {
    it('should show default text in default state', () => {
      fixture.componentRef.setInput('text', 'Copy Text');
      fixture.detectChanges();

      const buttonText = fixture.debugElement.query(By.css('button')).nativeElement.textContent;
      expect(buttonText.trim()).toBe('Copy Text');
    });

    it('should show spinner and loading text in loading state', () => {
      fixture.componentRef.setInput('copying', true);
      fixture.detectChanges();

      const spinner = fixture.debugElement.query(By.css('.spinner'));
      expect(spinner).toBeTruthy();

      const buttonText = fixture.debugElement.query(By.css('button')).nativeElement.textContent;
      expect(buttonText.trim()).toContain('Copying...');
    });

    it('should show success text in success state', () => {
      fixture.componentRef.setInput('copied', true);
      fixture.detectChanges();

      const buttonText = fixture.debugElement.query(By.css('button')).nativeElement.textContent;
      expect(buttonText.trim()).toBe('\u2713 Copied!');
    });

    it('should have disabled attribute when disabled', () => {
      fixture.componentRef.setInput('disabled', true);
      fixture.detectChanges();

      const button = fixture.debugElement.query(By.css('button')).nativeElement;
      expect(button.hasAttribute('disabled')).toBe(true);
      expect(button.disabled).toBe(true);
    });
  });

  // ==================== Class Binding Tests ====================

  describe('Class Bindings', () => {
    it('should apply copy-btn--success class when copied is true', () => {
      fixture.componentRef.setInput('copied', true);
      fixture.detectChanges();

      const button = fixture.debugElement.query(By.css('button')).nativeElement;
      expect(button.classList.contains('copy-btn--success')).toBeTruthy();
    });

    it('should not apply copy-btn--success class when copied is false', () => {
      fixture.componentRef.setInput('copied', false);
      fixture.detectChanges();

      const button = fixture.debugElement.query(By.css('button')).nativeElement;
      expect(button.classList.contains('copy-btn--success')).toBeFalsy();
    });
  });
});
