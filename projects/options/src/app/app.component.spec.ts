import {provideZonelessChangeDetection, signal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {of, Subject} from 'rxjs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {DEFAULT_SETTINGS, ExtensionSettings} from '@shared/public-api';
import {SettingsService} from '@shared/public-api';
import {ThemeService} from '@shared/public-api';
import {AppComponent} from './app.component';

vi.mock('webextension-polyfill', () => ({default: {}}));

describe('Options settings page rendering', () => {
  let savedSettings: Subject<ExtensionSettings>;
  let saveSettings: ReturnType<typeof vi.fn>;
  let fixture: ReturnType<typeof TestBed.createComponent<AppComponent>>;

  beforeEach(async () => {
    savedSettings = new Subject<ExtensionSettings>();
    saveSettings = vi.fn((settings: Partial<ExtensionSettings>) => of({...DEFAULT_SETTINGS, ...settings}));
    const settingsService = {
      saveSettings,
      resetToDefaults: vi.fn(() => of(DEFAULT_SETTINGS)),
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

  it('saves the toggle and preserves agent details across toggles and reset', async () => {
    savedSettings.next({...DEFAULT_SETTINGS, mistralAgentEnabled: undefined, mistralAgentId: 'agent', mistralAgentVersion: '1'});
    await fixture.whenStable();
    const toggle = fixture.nativeElement.querySelector('#mistralAgentEnabled') as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Agent classification is disabled');
    toggle.click();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Agent classification is configured');
    fixture.componentInstance.onSaveSettings();
    expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({mistralAgentEnabled: true, mistralAgentId: 'agent', mistralAgentVersion: '1'}));
    toggle.click();
    await fixture.whenStable();
    fixture.componentInstance.onSaveSettings();
    expect(saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({mistralAgentEnabled: false, mistralAgentId: 'agent', mistralAgentVersion: '1'}));
    toggle.click();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Agent classification is configured');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fixture.componentInstance.onResetToDefaults();
    await fixture.whenStable();
    expect(toggle.checked).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Agent classification is disabled');
    vi.restoreAllMocks();
  });

  it('shows enabled status after delayed settings load', async () => {
    savedSettings.next({...DEFAULT_SETTINGS, mistralAgentEnabled: true, mistralAgentId: 'agent', mistralAgentVersion: '1'});
    await fixture.whenStable();
    expect((fixture.nativeElement.querySelector('#mistralAgentEnabled') as HTMLInputElement).checked).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Agent classification is configured');
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
