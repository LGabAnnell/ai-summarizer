import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SummaryMetaComponent } from './summary-meta.component';
import { By } from '@angular/platform-browser';
import { describe, it, beforeEach, expect } from "vitest";

describe('SummaryMetaComponent', () => {
  let component: SummaryMetaComponent;
  let fixture: ComponentFixture<SummaryMetaComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SummaryMetaComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(SummaryMetaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // ==================== Component Creation Tests ====================

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have default values for all input signals', () => {
    expect(component.characterCount()).toBe(0);
    expect(component.cached()).toBe(false);
    expect(component.provider()).toBe('');
    expect(component.model()).toBe('');
  });

  // ==================== Input Binding Tests ====================

  describe('Input Bindings', () => {
    it('should display character count when set', () => {
      fixture.componentRef.setInput('characterCount', 150);
      fixture.detectChanges();

      const metaElement = fixture.debugElement.query(By.css('.summary-meta'));
      expect(metaElement.nativeElement.textContent).toContain('150 characters');
    });

    it('should display cached badge when cached is true', () => {
      fixture.componentRef.setInput('cached', true);
      fixture.detectChanges();

      const cachedBadge = fixture.debugElement.query(By.css('.cached-badge'));
      expect(cachedBadge).toBeTruthy();
      expect(cachedBadge.nativeElement.textContent).toBe('Cached');
    });

    it('should not display cached badge when cached is false', () => {
      fixture.componentRef.setInput('cached', false);
      fixture.detectChanges();

      const cachedBadge = fixture.debugElement.query(By.css('.cached-badge'));
      expect(cachedBadge).toBeNull();
    });

    it('should display provider and model when both are set', () => {
      fixture.componentRef.setInput('provider', 'Mistral');
      fixture.componentRef.setInput('model', 'mistral-tiny');
      fixture.detectChanges();

      const metaElement = fixture.debugElement.query(By.css('.summary-meta'));
      expect(metaElement.nativeElement.textContent).toContain('Mistral / mistral-tiny');
    });

    it('should not display provider and model when not set', () => {
      fixture.componentRef.setInput('provider', '');
      fixture.componentRef.setInput('model', '');
      fixture.detectChanges();

      const providerModelSpan = fixture.debugElement.query(By.css('.text-muted'));
      expect(providerModelSpan).toBeNull();
    });

    it('should not display provider and model when only provider is set', () => {
      fixture.componentRef.setInput('provider', 'Mistral');
      fixture.componentRef.setInput('model', '');
      fixture.detectChanges();

      const providerModelSpan = fixture.debugElement.query(By.css('.text-muted'));
      expect(providerModelSpan).toBeNull();
    });

    it('should not display provider and model when only model is set', () => {
      fixture.componentRef.setInput('provider', '');
      fixture.componentRef.setInput('model', 'mistral-tiny');
      fixture.detectChanges();

      const providerModelSpan = fixture.debugElement.query(By.css('.text-muted'));
      expect(providerModelSpan).toBeNull();
    });
  });

  // ==================== Template Rendering Tests ====================

  describe('Template Rendering', () => {
    it('should display default character count (0 characters) with no other info', () => {
      const metaElement = fixture.debugElement.query(By.css('.summary-meta'));
      expect(metaElement.nativeElement.textContent).toContain('0 characters');
    });

    it('should display all elements when all inputs are set', () => {
      fixture.componentRef.setInput('characterCount', 500);
      fixture.componentRef.setInput('cached', true);
      fixture.componentRef.setInput('provider', 'OpenAI');
      fixture.componentRef.setInput('model', 'gpt-4o-mini');
      fixture.detectChanges();

      const metaElement = fixture.debugElement.query(By.css('.summary-meta'));
      const textContent = metaElement.nativeElement.textContent;
      
      expect(textContent).toContain('500 characters');
      expect(textContent).toContain('Cached');
      expect(textContent).toContain('OpenAI / gpt-4o-mini');
    });

    it('should have summary-meta class on container', () => {
      const container = fixture.debugElement.query(By.css('.summary-meta'));
      expect(container).toBeTruthy();
    });

    it('should have cached-badge class on cached indicator', () => {
      fixture.componentRef.setInput('cached', true);
      fixture.detectChanges();

      const cachedBadge = fixture.debugElement.query(By.css('.cached-badge'));
      expect(cachedBadge).toBeTruthy();
    });

    it('should have text-muted class on provider/model span', () => {
      fixture.componentRef.setInput('provider', 'Anthropic');
      fixture.componentRef.setInput('model', 'claude-3-haiku');
      fixture.detectChanges();

      const providerModelSpan = fixture.debugElement.query(By.css('.text-muted'));
      expect(providerModelSpan).toBeTruthy();
    });
  });

  // ==================== Style Binding Tests ====================

  describe('Style Bindings', () => {
    it('should apply correct CSS variables in styles', () => {
      const metaElement = fixture.debugElement.query(By.css('.summary-meta')).nativeElement;
      
      // Check that the element has the expected computed styles
      expect(getComputedStyle(metaElement).display).toBe('flex');
      expect(getComputedStyle(metaElement).flexWrap).toBe('wrap');
      expect(getComputedStyle(metaElement).alignItems).toBe('center');
    });
  });
});
