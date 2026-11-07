import {TestBed} from '@angular/core/testing';
import {NEVER} from 'rxjs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {MessagingService} from './messaging.service';
import {ThemeService} from './theme.service';

const storage = vi.hoisted(() => ({get: vi.fn(), addListener: vi.fn(), removeListener: vi.fn()}));
vi.mock('webextension-polyfill', () => ({default: {storage: {
  local: {get: storage.get}, onChanged: {addListener: storage.addListener, removeListener: storage.removeListener},
}}}));

describe('theme synchronization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.documentElement.setAttribute('data-theme', 'light');
    TestBed.configureTestingModule({providers: [ThemeService, {provide: MessagingService, useValue: {onThemeChanged: () => NEVER}}]});
  });
  afterEach(() => { TestBed.resetTestingModule(); document.documentElement.removeAttribute('data-theme'); });

  it('applies local storage changes immediately and unregisters its listener', async () => {
    let resolveLoad!: (value: Record<string, unknown>) => void;
    storage.get.mockImplementation(() => new Promise(resolve => { resolveLoad = resolve; }));
    const service = TestBed.inject(ThemeService);
    const listener = storage.addListener.mock.calls[0][0] as (changes: Record<string, unknown>, area: string) => void;
    listener({'ai-summarizer-theme': {newValue: 'dark'}}, 'local');
    expect(service.getTheme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    resolveLoad({'ai-summarizer-theme': 'light'});
    await Promise.resolve(); await Promise.resolve();
    expect(service.getTheme()).toBe('dark');
    listener({'ai-summarizer-theme': {newValue: 'light'}}, 'sync');
    expect(service.getTheme()).toBe('dark');
    await TestBed.resetTestingModule();
    expect(storage.removeListener).toHaveBeenCalledWith(listener);
  });
});
