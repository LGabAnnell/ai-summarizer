import {describe, expect, it, vi} from 'vitest';
import {firstValueFrom} from 'rxjs';
import * as browser from 'webextension-polyfill';
import {MessagingService} from './messaging.service';

const browserMock = vi.hoisted(() => ({runtime: {sendMessage: vi.fn()}}));
vi.mock('webextension-polyfill', () => ({default: browserMock, runtime: browserMock.runtime}));

describe('MessagingService shortcut extraction', () => {
  it('forwards the captured tab ID with EXTRACT_AND_SUMMARIZE', () => {
    const service = new MessagingService();
    const sendMessage = vi.spyOn(service, 'sendMessage').mockReturnValue({} as never);

    service.extractAndSummarize(42);

    expect(sendMessage).toHaveBeenCalledWith({type: 'EXTRACT_AND_SUMMARIZE', tabId: 42});
  });

  it('preserves active-tab behavior when no tab ID is supplied', () => {
    const service = new MessagingService();
    const sendMessage = vi.spyOn(service, 'sendMessage').mockReturnValue({} as never);

    service.extractAndSummarize();

    expect(sendMessage).toHaveBeenCalledWith({type: 'EXTRACT_AND_SUMMARIZE', tabId: undefined});
  });

  it('preserves website permission recovery metadata from the background response', async () => {
    vi.mocked(browser.runtime.sendMessage).mockResolvedValueOnce({
      type: 'SUMMARIZE_RESPONSE',
      success: false,
      error: 'Grant website access.',
      permissionRequired: true,
      tabId: 42,
    } as never);

    const response = await firstValueFrom(new MessagingService().extractAndSummarize(42));

    expect(response).toMatchObject({permissionRequired: true, tabId: 42, success: false});
  });
});
