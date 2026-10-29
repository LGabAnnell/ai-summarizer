import {TestBed} from '@angular/core/testing';
import {of} from 'rxjs';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {DEFAULT_SETTINGS} from '../models/settings.model';
import {MessagingService} from './messaging.service';
import {ModelService} from './model.service';
import {SettingsService} from './settings.service';

vi.mock('webextension-polyfill', () => ({default: {}}));

describe('SettingsService numeric settings hydration', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('falls back to defaults for null or invalid persisted numeric values', () => {
    const messaging = {
      getSettings: vi.fn(() => of({
        success: true,
        data: {temperature: null, maxTokens: Number.NaN},
      })),
    };
    TestBed.configureTestingModule({
      providers: [
        SettingsService,
        {provide: MessagingService, useValue: messaging},
        {provide: ModelService, useValue: {}},
      ],
    });

    let result: unknown;
    TestBed.inject(SettingsService).loadSettings().subscribe(value => { result = value; });

    expect(result).toMatchObject({
      temperature: DEFAULT_SETTINGS.temperature,
      maxTokens: DEFAULT_SETTINGS.maxTokens,
    });
  });

  it('preserves valid numeric strings and zero temperature', () => {
    const messaging = {
      getSettings: vi.fn(() => of({success: true, data: {temperature: 0, maxTokens: '1250'}})),
    };
    TestBed.configureTestingModule({
      providers: [
        SettingsService,
        {provide: MessagingService, useValue: messaging},
        {provide: ModelService, useValue: {}},
      ],
    });

    let result: unknown;
    TestBed.inject(SettingsService).loadSettings().subscribe(value => { result = value; });

    expect(result).toMatchObject({temperature: 0, maxTokens: 1250});
  });
});
