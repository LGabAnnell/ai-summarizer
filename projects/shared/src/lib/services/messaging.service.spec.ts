import {describe, expect, it, vi} from 'vitest';
import {MessagingService} from './messaging.service';

vi.mock('webextension-polyfill', () => ({default: {runtime: {sendMessage: vi.fn()}}}));

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
});
