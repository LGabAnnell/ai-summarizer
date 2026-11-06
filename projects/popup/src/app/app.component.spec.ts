import {afterEach, describe, expect, it, vi} from 'vitest';
import {AppComponent} from './app.component';
import {TestBed} from '@angular/core/testing';
import {of} from 'rxjs';
import {HistoryItem, HistoryService} from '@shared/public-api';
import {MessagingService} from '@shared/lib/services/messaging.service';

const browserMock = vi.hoisted(() => ({
  runtime: {sendMessage: vi.fn()},
  permissions: {request: vi.fn()},
  storage: {local: {get: vi.fn(), set: vi.fn()}, onChanged: {addListener: vi.fn(), removeListener: vi.fn()}},
}));

vi.mock('webextension-polyfill', () => ({default: browserMock}));

describe('Popup website access recovery', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<AppComponent>>;
  let component: AppComponent;

  beforeEach(() => {
    vi.clearAllMocks();
    browserMock.storage.local.get.mockResolvedValue({});
    browserMock.storage.local.set.mockResolvedValue(undefined);
    browserMock.permissions.request.mockResolvedValue(true);
    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [HistoryService, {provide: MessagingService, useValue: {clearCache: () => of({success: true})}}],
    });
  });

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
    vi.clearAllMocks();
  });

  function createPopup(): void {
    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
  }

  it('requests permission directly from retry and retries the captured tab', async () => {
    createPopup();
    browserMock.runtime.sendMessage.mockResolvedValueOnce({
      success: false,
      error: 'Firefox has not granted website access.',
      permissionRequired: true,
      tabId: 19,
    });
    await component.summarize();

    browserMock.permissions.request.mockResolvedValueOnce(true);
    browserMock.runtime.sendMessage.mockResolvedValueOnce({success: true, summary: 'Done'});
    component.retry();

    expect(browserMock.permissions.request).toHaveBeenCalledWith({origins: ['<all_urls>']});
    expect(browserMock.runtime.sendMessage).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(browserMock.runtime.sendMessage).toHaveBeenLastCalledWith({type: 'EXTRACT_AND_SUMMARIZE', tabId: 19});
  });

  it('does not retry after website access is denied', async () => {
    createPopup();
    browserMock.runtime.sendMessage.mockResolvedValueOnce({
      success: false,
      error: 'Firefox has not granted website access.',
      permissionRequired: true,
      tabId: 21,
    });
    await component.summarize();
    browserMock.permissions.request.mockResolvedValueOnce(false);

    component.retry();
    await Promise.resolve();

    expect(browserMock.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('saves successful popup summaries with labels and preserves history loaded at startup', async () => {
    const existing: HistoryItem = {
      id: 'existing', summary: 'Existing summary', title: 'Existing', articleUrl: 'https://example.org',
      cached: true, timestamp: new Date('2026-10-30T10:00:00Z'), preview: 'Existing summary',
    };
    browserMock.storage.local.get.mockResolvedValue({
      'ai-summarizer-history': [existing],
      extension_settings: {cacheEnabled: false},
    });
    browserMock.runtime.sendMessage.mockResolvedValueOnce({
      success: true, summary: 'Popup summary', title: 'Popup article', articleUrl: 'https://example.com/article',
      cached: false, tokenCount: 42, agentLabels: ['one', 'two', 'three', 'four', 'five'], historyGeneration: 'generation',
    });

    browserMock.runtime.sendMessage.mockResolvedValueOnce({success: true, data: [existing]});
    createPopup();
    await component.summarize();

    expect(browserMock.runtime.sendMessage).toHaveBeenLastCalledWith({
      type: 'HISTORY_ADD', generation: 'generation', summary: expect.objectContaining({
        summary: 'Popup summary', title: 'Popup article', articleUrl: 'https://example.com/article',
        cached: false, tokenCount: 42, agentLabels: ['one', 'two', 'three', 'four', 'five'],
        timestamp: expect.any(Date),
      }),
    });
  });

  it('keeps the popup summary successful when history storage rejects', async () => {
    const addSummary = vi.fn().mockRejectedValue(new Error('history service failed'));
    TestBed.overrideProvider(HistoryService, {useValue: {addSummary}});
    createPopup();
    browserMock.runtime.sendMessage.mockResolvedValueOnce({success: true, summary: 'Still visible', title: 'Article'});

    await component.summarize();

    expect(component.state()).toBe('success');
    expect(component.summary()).toBe('Still visible');
    expect(addSummary).toHaveBeenCalledTimes(1);
  });

  it('does not save failed popup summaries to history', async () => {
    createPopup();
    browserMock.runtime.sendMessage.mockResolvedValueOnce({success: false, error: 'Provider failed'});

    await component.summarize();

    expect(component.state()).toBe('error');
    expect(browserMock.storage.local.set).not.toHaveBeenCalled();
  });
});
