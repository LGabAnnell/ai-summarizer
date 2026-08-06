import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HeaderComponent } from './header.component';
import { By } from '@angular/platform-browser';
import { describe, it, beforeEach, expect, vi } from "vitest";
import { ThemeService } from '../..//services/theme.service';

describe('HeaderComponent', () => {
  let component: HeaderComponent;
  let fixture: ComponentFixture<HeaderComponent>;
  let mockThemeService: ThemeService;

  beforeEach(async () => {
    // Create a mock ThemeService
    mockThemeService = {
      isDarkTheme: vi.fn(() => false),
      theme: { asReadonly: () => ({}) } as any,
      systemTheme: { asReadonly: () => ({}) } as any,
      effectiveTheme: { asReadonly: () => ({}) } as any
    } as unknown as ThemeService;

    await TestBed.configureTestingModule({
      imports: [HeaderComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(HeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // ==================== Component Creation Tests ====================

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have default values for all input signals', () => {
    expect(component.showThemeToggle()).toBe(false);
    expect(component.themeService()).toBeNull();
  });

  // ==================== Input Binding Tests ====================

  describe('Input Bindings', () => {
    it('should render logo with correct text', () => {
      const logo = fixture.debugElement.query(By.css('.logo'));
      expect(logo).toBeTruthy();
      expect(logo.nativeElement.textContent).toContain('Article Summarizer');
    });

    it('should render icon with AS text', () => {
      const icon = fixture.debugElement.query(By.css('.icon'));
      expect(icon).toBeTruthy();
      expect(icon.nativeElement.textContent).toBe('AS');
    });

    it('should not show theme toggle by default', () => {
      const headerControls = fixture.debugElement.query(By.css('.header-controls'));
      expect(headerControls).toBeNull();
    });

    it('should show theme toggle when showThemeToggle is true and themeService is provided', () => {
      fixture.componentRef.setInput('showThemeToggle', true);
      fixture.componentRef.setInput('themeService', mockThemeService);
      fixture.detectChanges();

      const headerControls = fixture.debugElement.query(By.css('.header-controls'));
      expect(headerControls).toBeTruthy();

      const themeToggle = fixture.debugElement.query(By.css('.theme-toggle'));
      expect(themeToggle).toBeTruthy();
    });

    it('should not show theme toggle when showThemeToggle is false even with themeService', () => {
      fixture.componentRef.setInput('showThemeToggle', false);
      fixture.componentRef.setInput('themeService', mockThemeService);
      fixture.detectChanges();

      const headerControls = fixture.debugElement.query(By.css('.header-controls'));
      expect(headerControls).toBeNull();
    });

    it('should not show theme toggle when themeService is null even with showThemeToggle true', () => {
      fixture.componentRef.setInput('showThemeToggle', true);
      fixture.componentRef.setInput('themeService', null);
      fixture.detectChanges();

      const headerControls = fixture.debugElement.query(By.css('.header-controls'));
      expect(headerControls).toBeNull();
    });
  });

  // ==================== Theme Toggle Button Tests ====================

  describe('Theme Toggle Button', () => {
    it('should display moon emoji when theme is light', () => {
      const lightThemeService = {
        isDarkTheme: vi.fn(() => false),
        theme: { asReadonly: () => ({}) } as any,
        systemTheme: { asReadonly: () => ({}) } as any,
        effectiveTheme: { asReadonly: () => ({}) } as any
      } as unknown as ThemeService;

      fixture.componentRef.setInput('showThemeToggle', true);
      fixture.componentRef.setInput('themeService', lightThemeService);
      fixture.detectChanges();

      const button = fixture.debugElement.query(By.css('.theme-toggle'));
      expect(button.nativeElement.textContent).toContain('🌙');
    });

    it('should display sun emoji when theme is dark', () => {
      const darkThemeService = {
        isDarkTheme: vi.fn(() => true),
        theme: { asReadonly: () => ({}) } as any,
        systemTheme: { asReadonly: () => ({}) } as any,
        effectiveTheme: { asReadonly: () => ({}) } as any
      } as unknown as ThemeService;

      fixture.componentRef.setInput('showThemeToggle', true);
      fixture.componentRef.setInput('themeService', darkThemeService);
      fixture.detectChanges();

      const button = fixture.debugElement.query(By.css('.theme-toggle'));
      expect(button.nativeElement.textContent).toContain('☀️');
    });

    it('should have aria-label for light mode when theme is light', () => {
      const lightThemeService = {
        isDarkTheme: vi.fn(() => false),
        theme: { asReadonly: () => ({}) } as any,
        systemTheme: { asReadonly: () => ({}) } as any,
        effectiveTheme: { asReadonly: () => ({}) } as any
      } as unknown as ThemeService;

      fixture.componentRef.setInput('showThemeToggle', true);
      fixture.componentRef.setInput('themeService', lightThemeService);
      fixture.detectChanges();

      const button = fixture.debugElement.query(By.css('.theme-toggle'));
      expect(button.nativeElement.getAttribute('aria-label')).toBe('Switch to dark mode');
    });

    it('should have aria-label for dark mode when theme is dark', () => {
      const darkThemeService = {
        isDarkTheme: vi.fn(() => true),
        theme: { asReadonly: () => ({}) } as any,
        systemTheme: { asReadonly: () => ({}) } as any,
        effectiveTheme: { asReadonly: () => ({}) } as any
      } as unknown as ThemeService;

      fixture.componentRef.setInput('showThemeToggle', true);
      fixture.componentRef.setInput('themeService', darkThemeService);
      fixture.detectChanges();

      const button = fixture.debugElement.query(By.css('.theme-toggle'));
      expect(button.nativeElement.getAttribute('aria-label')).toBe('Switch to light mode');
    });

    it('should not have theme-toggle--active class when theme is light', () => {
      const lightThemeService = {
        isDarkTheme: vi.fn(() => false),
        theme: { asReadonly: () => ({}) } as any,
        systemTheme: { asReadonly: () => ({}) } as any,
        effectiveTheme: { asReadonly: () => ({}) } as any
      } as unknown as ThemeService;

      fixture.componentRef.setInput('showThemeToggle', true);
      fixture.componentRef.setInput('themeService', lightThemeService);
      fixture.detectChanges();

      const button = fixture.debugElement.query(By.css('.theme-toggle'));
      expect(button.nativeElement.classList.contains('theme-toggle--active')).toBe(false);
    });

    it('should have theme-toggle--active class when theme is dark', () => {
      const darkThemeService = {
        isDarkTheme: vi.fn(() => true),
        theme: { asReadonly: () => ({}) } as any,
        systemTheme: { asReadonly: () => ({}) } as any,
        effectiveTheme: { asReadonly: () => ({}) } as any
      } as unknown as ThemeService;

      fixture.componentRef.setInput('showThemeToggle', true);
      fixture.componentRef.setInput('themeService', darkThemeService);
      fixture.detectChanges();

      const button = fixture.debugElement.query(By.css('.theme-toggle'));
      expect(button.nativeElement.classList.contains('theme-toggle--active')).toBe(true);
    });

    it('should have correct title attribute', () => {
      fixture.componentRef.setInput('showThemeToggle', true);
      fixture.componentRef.setInput('themeService', mockThemeService);
      fixture.detectChanges();

      const button = fixture.debugElement.query(By.css('.theme-toggle'));
      expect(button.nativeElement.getAttribute('title')).toBe('Toggle theme');
    });
  });

  // ==================== Output Event Tests ====================

  describe('Output Events', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('showThemeToggle', true);
      fixture.componentRef.setInput('themeService', mockThemeService);
      fixture.detectChanges();
    });

    it('should emit themeToggle event when button is clicked', () => {
      vi.spyOn(component.themeToggle, 'emit');

      const button = fixture.debugElement.query(By.css('.theme-toggle'));
      button.triggerEventHandler('click', null);

      expect(component.themeToggle.emit).toHaveBeenCalled();
    });

    it('should emit themeToggle event with empty payload', () => {
      vi.spyOn(component.themeToggle, 'emit');

      const button = fixture.debugElement.query(By.css('.theme-toggle'));
      button.triggerEventHandler('click', null);

      expect(component.themeToggle.emit).toHaveBeenCalledWith();
    });
  });

  // ==================== Template Rendering Tests ====================

  describe('Template Rendering', () => {
    it('should have header container', () => {
      const header = fixture.debugElement.query(By.css('.header'));
      expect(header).toBeTruthy();
    });

    it('should have logo container', () => {
      const logo = fixture.debugElement.query(By.css('.logo'));
      expect(logo).toBeTruthy();
    });

    it('should have icon element', () => {
      const icon = fixture.debugElement.query(By.css('.icon'));
      expect(icon).toBeTruthy();
      expect(icon.nativeElement.textContent).toBe('AS');
    });

    it('should have header with padding bottom', () => {
      const header = fixture.debugElement.query(By.css('.header'));
      const computedStyle = window.getComputedStyle(header.nativeElement);
      expect(computedStyle.paddingBottom).toBe('12px');
    });
  });
});
