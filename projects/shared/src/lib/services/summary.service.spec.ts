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
});
