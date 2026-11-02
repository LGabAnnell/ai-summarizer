import {TestBed} from '@angular/core/testing';
import {of} from 'rxjs';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {MessagingService} from './messaging.service';
import {SettingsService} from './settings.service';
import {SummaryService} from './summary.service';

vi.mock('webextension-polyfill', () => ({default: {runtime: {sendMessage: vi.fn()}}}));

describe('SummaryService shortcut extraction', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('passes the captured tab ID through to MessagingService', () => {
    const messaging = {extractAndSummarize: vi.fn(() => of({success: false, error: 'test'}))};
    TestBed.configureTestingModule({
      providers: [
        SummaryService,
        {provide: MessagingService, useValue: messaging},
        {provide: SettingsService, useValue: {}},
      ],
    });
    const service = TestBed.inject(SummaryService);
    service.extractAndSummarize(72).subscribe({error: () => undefined});
    expect(messaging.extractAndSummarize).toHaveBeenCalledWith(72);
  });

  it('maps agent labels and classifier errors from an extracted summary response', () => {
    const messaging = {extractAndSummarize: vi.fn(() => of({
      success: true,
      summary: 'Article summary',
      title: 'Article title',
      articleUrl: 'https://example.com/article',
      agentLabels: ['one', 'two', 'three', 'four', 'five'],
      agentClassificationError: 'Agent timed out',
    }))};
    TestBed.configureTestingModule({providers: [SummaryService, {provide: MessagingService, useValue: messaging}, {provide: SettingsService, useValue: {}}]});
    const service = TestBed.inject(SummaryService);
    service.extractAndSummarize().subscribe();
    expect(service.state().summary).toMatchObject({
      title: 'Article title', articleUrl: 'https://example.com/article',
      agentLabels: ['one', 'two', 'three', 'four', 'five'],
      agentClassificationError: 'Agent timed out',
    });
  });

  it('maps agent labels and article metadata from a wrapped SUMMARIZE response', () => {
    const article = {url: 'https://example.com/article', title: 'Article', textContent: 'Body', byline: '', length: 4};
    const messaging = {summarizeArticle: vi.fn(() => of({success: true, data: {
      summary: 'Article summary', cached: true, tokenCount: 12,
      agentLabels: ['one', 'two', 'three', 'four', 'five'], agentClassificationError: undefined,
    }}))};
    TestBed.configureTestingModule({
      providers: [
        SummaryService,
        {provide: MessagingService, useValue: messaging},
        {provide: SettingsService, useValue: {settings: () => ({provider: 'mistral', model: 'mistral-small'})}},
      ],
    });
    const service = TestBed.inject(SummaryService);
    service.summarize(article).subscribe();
    expect(messaging.summarizeArticle).toHaveBeenCalledWith(article, 'mistral');
    expect(service.state().summary).toMatchObject({
      summary: 'Article summary', title: 'Article', articleUrl: article.url, cached: true,
      agentLabels: ['one', 'two', 'three', 'four', 'five'],
    });
  });

  it('preserves host permission recovery details in the error state', () => {
    const messaging = {
      extractAndSummarize: vi.fn(() => of({
        success: false,
        error: 'Firefox has not granted access to this website.',
        permissionRequired: true,
        tabId: 72,
      })),
    };
    TestBed.configureTestingModule({
      providers: [
        SummaryService,
        {provide: MessagingService, useValue: messaging},
        {provide: SettingsService, useValue: {}},
      ],
    });
    const service = TestBed.inject(SummaryService);
    service.extractAndSummarize(72).subscribe({error: () => undefined});

    expect(service.state()).toMatchObject({
      state: 'error',
      permissionRequired: true,
      tabId: 72,
    });
  });

  it('updates permission request errors while preserving recovery metadata and ignores other states', () => {
    const messaging = {extractAndSummarize: vi.fn(() => of({success: false, error: 'old', permissionRequired: true, tabId: 88}))};
    TestBed.configureTestingModule({providers: [SummaryService, {provide: MessagingService, useValue: messaging}, {provide: SettingsService, useValue: {}}]});
    const service = TestBed.inject(SummaryService);
    service.extractAndSummarize(88).subscribe({error: () => undefined});
    service.setPermissionRequestError('denied');
    expect(service.state()).toMatchObject({state: 'error', error: 'denied', permissionRequired: true, tabId: 88});
  });

  it('ignores permission request errors outside a permission-required error state', () => {
    TestBed.configureTestingModule({providers: [SummaryService, {provide: MessagingService, useValue: {}}, {provide: SettingsService, useValue: {}}]});
    const service = TestBed.inject(SummaryService);
    service.setPermissionRequestError('should not replace idle state');
    expect(service.state()).toEqual({state: 'idle'});
  });

});
