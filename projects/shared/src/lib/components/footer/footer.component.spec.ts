import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FooterComponent } from './footer.component';
import { By } from '@angular/platform-browser';
import { describe, it, beforeEach, expect, vi } from "vitest";

describe('FooterComponent', () => {
  let component: FooterComponent;
  let fixture: ComponentFixture<FooterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FooterComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(FooterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // ==================== Component Creation Tests ====================

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have default values for all input signals', () => {
    expect(component.showViewArticle()).toBeFalsy();
    expect(component.articleUrl()).toBe('');
    expect(component.showClearHistory()).toBeFalsy();
    expect(component.historyCount()).toBe(0);
  });

  // ==================== Input Binding Tests ====================

  describe('Input Bindings', () => {
    it('should display View article link when showViewArticle and articleUrl are set', () => {
      fixture.componentRef.setInput('showViewArticle', true);
      fixture.componentRef.setInput('articleUrl', 'https://example.com');
      fixture.detectChanges();

      const link = fixture.debugElement.query(By.css('.footer-left a'));
      expect(link).toBeTruthy();
      expect(link.nativeElement.href).toBe('https://example.com/');
      expect(link.nativeElement.textContent).toBe('View article');
    });

    it('should not display View article link when showViewArticle is false', () => {
      fixture.componentRef.setInput('showViewArticle', false);
      fixture.componentRef.setInput('articleUrl', 'https://example.com');
      fixture.detectChanges();

      const link = fixture.debugElement.query(By.css('.footer-left a'));
      expect(link).toBeNull();
    });

    it('should not display View article link when articleUrl is empty', () => {
      fixture.componentRef.setInput('showViewArticle', true);
      fixture.componentRef.setInput('articleUrl', '');
      fixture.detectChanges();

      const link = fixture.debugElement.query(By.css('.footer-left a'));
      expect(link).toBeNull();
    });

    it('should display Clear History button when showClearHistory is true and historyCount > 0', () => {
      fixture.componentRef.setInput('showClearHistory', true);
      fixture.componentRef.setInput('historyCount', 5);
      fixture.detectChanges();

      const buttons = fixture.debugElement.queryAll(By.css('.footer-right button'));
      const clearHistoryButton = buttons.find(btn => btn.nativeElement.textContent === 'Clear History');
      expect(clearHistoryButton).toBeTruthy();
    });

    it('should not display Clear History button when showClearHistory is false', () => {
      fixture.componentRef.setInput('showClearHistory', false);
      fixture.componentRef.setInput('historyCount', 5);
      fixture.detectChanges();

      const buttons = fixture.debugElement.queryAll(By.css('.footer-right button'));
      const clearHistoryButton = buttons.find(btn => btn.nativeElement.textContent === 'Clear History');
      expect(clearHistoryButton).toBeUndefined();
    });

    it('should not display Clear History button when historyCount is 0', () => {
      fixture.componentRef.setInput('showClearHistory', true);
      fixture.componentRef.setInput('historyCount', 0);
      fixture.detectChanges();

      const buttons = fixture.debugElement.queryAll(By.css('.footer-right button'));
      const clearHistoryButton = buttons.find(btn => btn.nativeElement.textContent === 'Clear History');
      expect(clearHistoryButton).toBeUndefined();
    });

    it('should always display Settings button', () => {
      const buttons = fixture.debugElement.queryAll(By.css('.footer-right button'));
      const settingsButton = buttons.find(btn => btn.nativeElement.textContent === 'Settings');
      expect(settingsButton).toBeTruthy();
    });
  });

  // ==================== Output Event Tests ====================

  describe('Output Events', () => {
    it('should emit viewArticle event when View article link is clicked', () => {
      fixture.componentRef.setInput('showViewArticle', true);
      fixture.componentRef.setInput('articleUrl', 'https://example.com');
      fixture.detectChanges();

      vi.spyOn(component.viewArticle, 'emit');

      const link = fixture.debugElement.query(By.css('.footer-left a'));
      link.triggerEventHandler('click', null);

      expect(component.viewArticle.emit).toHaveBeenCalled();
    });

    it('should emit clearHistory event when Clear History button is clicked', () => {
      fixture.componentRef.setInput('showClearHistory', true);
      fixture.componentRef.setInput('historyCount', 5);
      fixture.detectChanges();

      vi.spyOn(component.clearHistory, 'emit');

      const buttons = fixture.debugElement.queryAll(By.css('.footer-right button'));
      const clearHistoryButton = buttons.find(btn => btn.nativeElement.textContent === 'Clear History');
      clearHistoryButton?.triggerEventHandler('click', null);

      expect(component.clearHistory.emit).toHaveBeenCalled();
    });

    it('should emit openSettings event when Settings button is clicked', () => {
      vi.spyOn(component.openSettings, 'emit');

      const buttons = fixture.debugElement.queryAll(By.css('.footer-right button'));
      const settingsButton = buttons.find(btn => btn.nativeElement.textContent === 'Settings');
      settingsButton?.triggerEventHandler('click', null);

      expect(component.openSettings.emit).toHaveBeenCalled();
    });
  });

  // ==================== Template Rendering Tests ====================

  describe('Template Rendering', () => {
    it('should have footer container with correct classes', () => {
      const footer = fixture.debugElement.query(By.css('.footer'));
      expect(footer).toBeTruthy();
      expect(footer.nativeElement.classList.contains('footer')).toBeTruthy();
    });

    it('should have footer-left and footer-right sections', () => {
      const leftSection = fixture.debugElement.query(By.css('.footer-left'));
      const rightSection = fixture.debugElement.query(By.css('.footer-right'));
      
      expect(leftSection).toBeTruthy();
      expect(rightSection).toBeTruthy();
    });

    it('should apply settings-link class to all links and buttons', () => {
      fixture.componentRef.setInput('showViewArticle', true);
      fixture.componentRef.setInput('articleUrl', 'https://example.com');
      fixture.componentRef.setInput('showClearHistory', true);
      fixture.componentRef.setInput('historyCount', 5);
      fixture.detectChanges();

      const link = fixture.debugElement.query(By.css('.footer-left a'));
      const buttons = fixture.debugElement.queryAll(By.css('.footer-right button'));

      expect(link.nativeElement.classList.contains('settings-link')).toBeTruthy();
      buttons.forEach(button => {
        expect(button.nativeElement.classList.contains('settings-link')).toBeTruthy();
      });
    });
  });

  // ==================== NgContent Tests ====================

  describe('NgContent Projection', () => {
    it('should support footer-left content projection', () => {
      fixture.componentRef.setInput('showViewArticle', false);
      fixture.detectChanges();

      const footerLeftContent = fixture.debugElement.query(By.css('.footer-left'));
      expect(footerLeftContent).toBeTruthy();
    });

    it('should support footer-right content projection', () => {
      const footerRightContent = fixture.debugElement.query(By.css('.footer-right'));
      expect(footerRightContent).toBeTruthy();
    });
  });
});
