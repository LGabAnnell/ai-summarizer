import {afterEach, describe, expect, it, vi} from 'vitest';
import {AppComponent} from './app.component';

const browserMock = vi.hoisted(() => ({
  runtime: {sendMessage: vi.fn()},
  permissions: {request: vi.fn()},
}));

vi.mock('webextension-polyfill', () => ({default: browserMock}));

describe('Popup website access recovery', () => {
  afterEach(() => vi.clearAllMocks());

  it('requests permission directly from retry and retries the captured tab', async () => {
    browserMock.runtime.sendMessage.mockResolvedValueOnce({
      success: false,
      error: 'Firefox has not granted website access.',
      permissionRequired: true,
      tabId: 19,
    });
    const component = new AppComponent();
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
    browserMock.runtime.sendMessage.mockResolvedValueOnce({
      success: false,
      error: 'Firefox has not granted website access.',
      permissionRequired: true,
      tabId: 21,
    });
    const component = new AppComponent();
    await component.summarize();
    browserMock.permissions.request.mockResolvedValueOnce(false);

    component.retry();
    await Promise.resolve();

    expect(browserMock.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });
});
