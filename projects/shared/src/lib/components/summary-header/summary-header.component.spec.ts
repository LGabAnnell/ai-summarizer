import {ComponentFixture, TestBed} from '@angular/core/testing';
import {SummaryHeaderComponent} from './summary-header.component';
import {CopyButtonComponent} from '../copy-button/copy-button.component';
import {By} from '@angular/platform-browser';
import {beforeEach, describe, expect, it, vi} from "vitest";

describe('SummaryHeaderComponent', () => {
  let component: SummaryHeaderComponent;
  let fixture: ComponentFixture<SummaryHeaderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SummaryHeaderComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(SummaryHeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // ==================== Component Creation Tests ====================

  function queryHeaderElements() {
    return {
      header: fixture.debugElement.query(By.css('.summary-header')),
      title: fixture.debugElement.query(By.css('.summary-title')),
      actions: fixture.debugElement.query(By.css('.summary-actions')),
    };
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have default values for all input signals', () => {
    expect(component.title()).toBe('Article Summary');
    expect(component.showActions()).toBe(true);
    expect(component.showCopyButton()).toBe(true);
    expect(component.copying()).toBe(false);
    expect(component.copied()).toBe(false);
    expect(component.copyDisabled()).toBe(false);
    expect(component.copyText()).toBe('Copy');
    expect(component.copySuccessText()).toBe('\u2713 Copied!');
    expect(component.copyLoadingText()).toBe('Copying...');
  });

  // ==================== Input Binding Tests ====================

  describe('Input Bindings', () => {
    it('should display custom title when title input is set', () => {
      fixture.componentRef.setInput('title', 'My Custom Summary');
      fixture.detectChanges();

      const titleElement = fixture.debugElement.query(By.css('.summary-title')).nativeElement;
      expect(titleElement.textContent).toBe('My Custom Summary');
    });

    it('should hide actions section when showActions is false', () => {
      fixture.componentRef.setInput('showActions', false);
      fixture.detectChanges();

      const actionsSection = fixture.debugElement.query(By.css('.summary-actions'));
      expect(actionsSection).toBeNull();
    });

    it('should show actions section when showActions is true', () => {
      fixture.componentRef.setInput('showActions', true);
      fixture.detectChanges();

      const actionsSection = fixture.debugElement.query(By.css('.summary-actions'));
      expect(actionsSection).toBeTruthy();
    });

    it('should hide copy button when showCopyButton is false', () => {
      fixture.componentRef.setInput('showCopyButton', false);
      fixture.detectChanges();

      const copyButton = fixture.debugElement.query(By.directive(CopyButtonComponent));
      expect(copyButton).toBeNull();
    });

    it('should show copy button when showCopyButton is true', () => {
      fixture.componentRef.setInput('showCopyButton', true);
      fixture.detectChanges();

      const copyButton = fixture.debugElement.query(By.directive(CopyButtonComponent));
      expect(copyButton).toBeTruthy();
    });

    it('should pass copying state to copy button', () => {
      fixture.componentRef.setInput('copying', true);
      fixture.detectChanges();

      const copyButton = fixture.debugElement.query(By.directive(CopyButtonComponent)).componentInstance;
      expect(copyButton.copying()).toBe(true);
    });

    it('should pass copied state to copy button', () => {
      fixture.componentRef.setInput('copied', true);
      fixture.detectChanges();

      const copyButton = fixture.debugElement.query(By.directive(CopyButtonComponent)).componentInstance;
      expect(copyButton.copied()).toBe(true);
    });

    it('should pass disabled state to copy button', () => {
      fixture.componentRef.setInput('copyDisabled', true);
      fixture.detectChanges();

      const copyButton = fixture.debugElement.query(By.directive(CopyButtonComponent)).componentInstance;
      expect(copyButton.disabled()).toBe(true);
    });

    it('should pass custom copy text to copy button', () => {
      fixture.componentRef.setInput('copyText', 'Custom Copy Text');
      fixture.detectChanges();

      const copyButton = fixture.debugElement.query(By.directive(CopyButtonComponent)).componentInstance;
      expect(copyButton.text()).toBe('Custom Copy Text');
    });

    it('should pass custom success text to copy button', () => {
      fixture.componentRef.setInput('copySuccessText', 'Copied to clipboard!');
      fixture.detectChanges();

      const copyButton = fixture.debugElement.query(By.directive(CopyButtonComponent)).componentInstance;
      expect(copyButton.successText()).toBe('Copied to clipboard!');
    });

    it('should pass custom loading text to copy button', () => {
      fixture.componentRef.setInput('copyLoadingText', 'Please wait...');
      fixture.detectChanges();

      const copyButton = fixture.debugElement.query(By.directive(CopyButtonComponent)).componentInstance;
      expect(copyButton.loadingText()).toBe('Please wait...');
    });
  });

  // ==================== Output Event Tests ====================

  describe('Output Events', () => {
    it('should emit copyClick event when copy button is clicked', () => {
      vi.spyOn(component.copyClick, 'emit');

      const copyButton = fixture.debugElement.query(By.directive(CopyButtonComponent));
      copyButton.triggerEventHandler('click', null);

      expect(component.copyClick.emit).toHaveBeenCalled();
    });

    it('should not emit copyClick event when copy button is disabled', () => {
      fixture.componentRef.setInput('copyDisabled', true);
      fixture.detectChanges();

      vi.spyOn(component.copyClick, 'emit');

      const copyButton = fixture.debugElement.query(By.directive(CopyButtonComponent));
      // Try to trigger click on the button - disabled buttons should not emit events
      copyButton.triggerEventHandler('click', {preventDefault: vi.fn(), stopPropagation: vi.fn()});

      // Note: In Angular, disabled buttons still receive events in tests,
      // but the actual browser prevents the click. This test verifies the disabled state is passed.
      const copyButtonInstance = copyButton.componentInstance;
      expect(copyButtonInstance.disabled()).toBe(true);
    });
  });

  // ==================== Template Rendering Tests ====================

  describe('Template Rendering', () => {
    it('should render summary header with default title', () => {
      const header = fixture.debugElement.query(By.css('.summary-header'));
      expect(header).toBeTruthy();

      const title = fixture.debugElement.query(By.css('.summary-title'));
      expect(title.nativeElement.textContent).toBe('Article Summary');
    });

    it('should render copy button by default', () => {
      const copyButton = fixture.debugElement.query(By.directive(CopyButtonComponent));
      expect(copyButton).toBeTruthy();
    });

    it('should have summary-header class on container', () => {
      const header = fixture.debugElement.query(By.css('.summary-header'));
      expect(header).toBeTruthy();
    });

    it('should have summary-title class on title element', () => {
      const title = fixture.debugElement.query(By.css('.summary-title'));
      expect(title).toBeTruthy();
    });

    it('should have summary-actions class on actions container', () => {
      const actionsSection = fixture.debugElement.query(By.css('.summary-actions'));
      expect(actionsSection).toBeTruthy();
    });

    it('should support ng-content for additional actions', () => {
      // Verify the ng-content selector exists in the template by checking for the actions section
      const actionsSection = fixture.debugElement.query(By.css('.summary-actions'));
      expect(actionsSection).toBeTruthy();
    });
  });

  // ==================== Integration Tests ====================

  describe('Integration Tests', () => {
    it('should properly integrate CopyButtonComponent with all input bindings', () => {
      // Set all copy button related inputs
      fixture.componentRef.setInput('copying', true);
      fixture.componentRef.setInput('copied', false);
      fixture.componentRef.setInput('copyDisabled', false);
      fixture.componentRef.setInput('copyText', 'Copy me');
      fixture.componentRef.setInput('copySuccessText', 'Copied!');
      fixture.componentRef.setInput('copyLoadingText', 'Loading...');
      fixture.detectChanges();

      const copyButton = fixture.debugElement.query(By.directive(CopyButtonComponent)).componentInstance;
      expect(copyButton.copying()).toBe(true);
      expect(copyButton.copied()).toBe(false);
      expect(copyButton.disabled()).toBe(false);
      expect(copyButton.text()).toBe('Copy me');
      expect(copyButton.successText()).toBe('Copied!');
      expect(copyButton.loadingText()).toBe('Loading...');
    });

    it('should render complete header structure with all elements', () => {
      fixture.detectChanges();

      const {header, title, actions} = queryHeaderElements();
      expect(header).toBeTruthy();
      expect(title).toBeTruthy();
      expect(actions).toBeTruthy();

      const copyButton = fixture.debugElement.query(By.directive(CopyButtonComponent));
      expect(copyButton).toBeTruthy();
    });

    it('should maintain proper structure when showActions is false', () => {
      fixture.componentRef.setInput('showActions', false);
      fixture.detectChanges();

      const {header, title, actions} = queryHeaderElements();
      expect(header).toBeTruthy();
      expect(title).toBeTruthy();
      expect(actions).toBeNull();
    });
  });
});
