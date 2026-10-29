import {Component, inject, provideZonelessChangeDetection} from '@angular/core';
import {FormControl, FormGroup, ReactiveFormsModule} from '@angular/forms';
import {TestBed} from '@angular/core/testing';
import {of} from 'rxjs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {SUMMARY_PROMPTS} from '@shared/lib/models/summary-prompts.model';
import {SettingsService} from '@shared/lib/services/settings.service';
import {MessagingService} from '@shared/lib/services/messaging.service';
import {ModelService} from '@shared/lib/services/model.service';
import {SummarizationSettingsComponent} from './summarization-settings.component';

vi.mock('webextension-polyfill', () => ({default: {}}));

@Component({
  imports: [ReactiveFormsModule, SummarizationSettingsComponent],
  template: `
    <form [formGroup]="form">
      <options-summarization-settings />
    </form>
  `,
})
class TestHostComponent {
  private settingsService = inject(SettingsService);
  form = new FormGroup({
    summaryStyle: new FormControl('concise', {nonNullable: true}),
    customPrompt: new FormControl('', {nonNullable: true}),
    temperature: new FormControl(0.7, {nonNullable: true}),
    maxTokens: new FormControl(500, {nonNullable: true}),
  });

  hydrateSettings(): Promise<void> {
    return new Promise(resolve => this.settingsService.loadSettings().subscribe(settings => {
      this.form.patchValue({
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        summaryStyle: settings.summaryStyle,
      }, {emitEvent: false});
      this.form.get('summaryStyle')?.setValue(settings.summaryStyle);
      resolve();
    }));
  }
}

describe('SummarizationSettingsComponent prompt field', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<TestHostComponent>>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
      providers: [
        provideZonelessChangeDetection(),
        {provide: MessagingService, useValue: {getSettings: () => of({success: true, data: {temperature: null, maxTokens: null}})}},
        {provide: ModelService, useValue: {}},
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  it('renders the built-in prompt on the initial view', () => {
    const prompt = fixture.nativeElement.querySelector('#customPrompt') as HTMLTextAreaElement;

    expect(prompt.readOnly).toBe(true);
    expect(prompt.value).toBe(SUMMARY_PROMPTS.concise);
  });

  it('renders numeric settings before and after silent settings hydration', async () => {
    const temperature = fixture.nativeElement.querySelector('#temperature') as HTMLInputElement;
    const maxTokens = fixture.nativeElement.querySelector('#maxTokens') as HTMLInputElement;
    expect(temperature.value).toBe('0.7');
    expect(maxTokens.value).toBe('500');

    fixture.componentInstance.form.patchValue({temperature: 0.9, maxTokens: 4444}, {emitEvent: false});
    fixture.componentInstance.form.get('summaryStyle')?.setValue('detailed');
    await fixture.whenStable();

    expect(temperature.value).toBe('0.9');
    expect(maxTokens.value).toBe('4444');
  });

  it('renders default numeric values when saved settings contain nulls', async () => {
    await fixture.componentInstance.hydrateSettings();
    await fixture.whenStable();

    const temperature = fixture.nativeElement.querySelector('#temperature') as HTMLInputElement;
    const maxTokens = fixture.nativeElement.querySelector('#maxTokens') as HTMLInputElement;
    expect(temperature.value).toBe('0.7');
    expect(maxTokens.value).toBe('500');
  });

  it('shows a saved custom prompt after delayed settings load in zoneless mode', async () => {
    await new Promise(resolve => setTimeout(resolve, 0));

    fixture.componentInstance.form.patchValue({
      summaryStyle: 'custom',
      customPrompt: 'Summarize the article for a specialist audience.',
    }, {emitEvent: false});
    fixture.componentInstance.form.get('summaryStyle')?.setValue('custom');
    await fixture.whenStable();

    const prompt = fixture.nativeElement.querySelector('#customPrompt') as HTMLTextAreaElement;
    expect(prompt.readOnly).toBe(false);
    expect(prompt.value).toBe('Summarize the article for a specialist audience.');
  });

  it('preserves custom text when switching between built-in and custom styles', async () => {
    const form = fixture.componentInstance.form;
    form.get('customPrompt')?.setValue('Keep this custom instruction.');

    const styleSelect = fixture.nativeElement.querySelector('#summaryStyle') as HTMLSelectElement;
    styleSelect.value = 'detailed';
    styleSelect.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    let prompt = fixture.nativeElement.querySelector('#customPrompt') as HTMLTextAreaElement;
    expect(prompt.readOnly).toBe(true);
    expect(prompt.value).toBe(SUMMARY_PROMPTS.detailed);

    styleSelect.value = 'custom';
    styleSelect.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    prompt = fixture.nativeElement.querySelector('#customPrompt') as HTMLTextAreaElement;
    expect(prompt.readOnly).toBe(false);
    expect(prompt.value).toBe('Keep this custom instruction.');
  });
});
