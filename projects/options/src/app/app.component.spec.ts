import {provideZonelessChangeDetection, signal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {Subject} from 'rxjs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {DEFAULT_SETTINGS, ExtensionSettings} from '@shared/public-api';
import {SettingsService} from '@shared/public-api';
import {ThemeService} from '@shared/public-api';
import {AppComponent} from './app.component';

vi.mock('webextension-polyfill', () => ({default: {}}));

describe('Options settings page rendering', () => {
  let savedSettings: Subject<ExtensionSettings>;
  let fixture: ReturnType<typeof TestBed.createComponent<AppComponent>>;

  beforeEach(async () => {
    savedSettings = new Subject<ExtensionSettings>();
    const settingsService = {
      getSetting: vi.fn(() => undefined),
      getProviderTypes: vi.fn(() => ['mistral', 'openai', 'anthropic', 'qwen', 'deepseek', 'custom']),
      isModelsLoading: vi.fn(() => false),
      getModelsErrorSignal: vi.fn(() => signal(undefined)),
      getAvailableModelsForProvider: vi.fn(() => ['mistral-tiny']),
      getProviderDisplayName: vi.fn((provider: string) => provider),
      loadSettings: vi.fn(() => savedSettings.asObservable()),
    };

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideZonelessChangeDetection(),
        {provide: SettingsService, useValue: settingsService},
        {provide: ThemeService, useValue: {isDarkTheme: () => false}},
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  it('renders the complete settings form before and after delayed settings load', async () => {
    const temperature = fixture.nativeElement.querySelector('#temperature') as HTMLInputElement;
    const maxTokens = fixture.nativeElement.querySelector('#maxTokens') as HTMLInputElement;

    expect(temperature.value).toBe('0.7');
    expect(maxTokens.value).toBe('500');
    expect(fixture.nativeElement.querySelector('options-mistral-agent-settings')).not.toBeNull();

    savedSettings.next({...DEFAULT_SETTINGS, temperature: 0.9, maxTokens: 4444});
    await fixture.whenStable();

    expect(temperature.value).toBe('0.9');
    expect(maxTokens.value).toBe('4444');

    const tokenPreset = fixture.nativeElement.querySelector('.token-preset:last-child') as HTMLButtonElement;
    tokenPreset.click();
    fixture.detectChanges();
    expect(maxTokens.value).toBe('10000');
  });
});
