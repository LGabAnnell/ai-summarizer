import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {setupSidebarShortcut} from './sidebar-shortcut';

vi.mock('webextension-polyfill', () => ({default: {}}));

type Event<T extends (...args: never[]) => void> = {addListener: (listener: T) => void; fire: (...args: Parameters<T>) => void};
function makeEvent<T extends (...args: never[]) => void>(): Event<T> {
  let listener: T | undefined;
  return {
    addListener: callback => { listener = callback; },
    fire: (...args) => listener?.(...args),
  };
}

function harness() {
  const commands = makeEvent<(command: string, tab?: {id?: number; windowId?: number}) => void>();
  const connects = makeEvent<(port: FakePort) => void>();
  const api = {
    commands: {onCommand: commands},
    sidebarAction: {open: vi.fn(() => Promise.resolve()), toggle: vi.fn()},
    tabs: {query: vi.fn(() => Promise.resolve([{id: 10, windowId: 1}]))},
    runtime: {onConnect: connects},
  };
  setupSidebarShortcut(api as never);
  return {api, commands, connects};
}

class FakePort {
  name = 'summarizer-sidebar';
  onMessage = makeEvent<(message: unknown) => void>();
  onDisconnect = makeEvent<() => void>();
  postMessage = vi.fn();
  ready(windowId: number): void { this.onMessage.fire({type: 'SIDEBAR_READY', windowId}); }
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('sidebar shortcut coordinator', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('opens immediately and delivers a cold-start action when the sidebar registers', async () => {
    const {api, commands, connects} = harness();
    commands.fire('open-sidebar-and-summarize', {id: 24, windowId: 4});
    expect(api.sidebarAction.open).toHaveBeenCalledOnce();
    await settle();
    const port = new FakePort();
    connects.fire(port);
    expect(port.postMessage).not.toHaveBeenCalled();
    port.ready(4);
    expect(port.postMessage).toHaveBeenCalledWith({type: 'SUMMARIZE_ACTIVE_TAB', tabId: 24});
  });

  it('delivers to a warm sidebar and isolates pending actions by window', async () => {
    const {commands, connects} = harness();
    const firstWindow = new FakePort();
    connects.fire(firstWindow);
    firstWindow.ready(1);

    commands.fire('open-sidebar-and-summarize', {id: 11, windowId: 1});
    await settle();
    expect(firstWindow.postMessage).toHaveBeenCalledWith({type: 'SUMMARIZE_ACTIVE_TAB', tabId: 11});

    commands.fire('open-sidebar-and-summarize', {id: 22, windowId: 2});
    await settle();
    expect(firstWindow.postMessage).toHaveBeenCalledTimes(1);
    const otherWindow = new FakePort();
    connects.fire(otherWindow);
    otherWindow.ready(2);
    expect(otherWindow.postMessage).toHaveBeenCalledWith({type: 'SUMMARIZE_ACTIVE_TAB', tabId: 22});
  });

  it('coalesces repeated queued shortcuts to the latest active tab', async () => {
    const {commands, connects} = harness();
    commands.fire('open-sidebar-and-summarize', {id: 40, windowId: 4});
    await settle();
    commands.fire('open-sidebar-and-summarize', {id: 41, windowId: 4});
    await settle();
    const port = new FakePort();
    connects.fire(port);
    port.ready(4);
    expect(port.postMessage).toHaveBeenCalledTimes(1);
    expect(port.postMessage).toHaveBeenCalledWith({type: 'SUMMARIZE_ACTIVE_TAB', tabId: 41});
  });

  it('requeues when a warm port has disconnected and ignores unknown commands', async () => {
    const {commands, connects, api} = harness();
    const stalePort = new FakePort();
    stalePort.postMessage.mockImplementation(() => { throw new Error('disconnected'); });
    connects.fire(stalePort);
    stalePort.ready(6);
    commands.fire('unknown-command');
    expect(api.sidebarAction.open).not.toHaveBeenCalled();
    commands.fire('open-sidebar-and-summarize', {id: 60, windowId: 6});
    await settle();
    const replacement = new FakePort();
    connects.fire(replacement);
    replacement.ready(6);
    expect(replacement.postMessage).toHaveBeenCalledWith({type: 'SUMMARIZE_ACTIVE_TAB', tabId: 60});
  });

  it('preserves the existing sidebar toggle command', () => {
    const {commands, api} = harness();
    commands.fire('toggle-sidebar');
    expect(api.sidebarAction.toggle).toHaveBeenCalledOnce();
    expect(api.sidebarAction.open).not.toHaveBeenCalled();
  });

  it('uses the tab active at command time when no tab argument is provided', async () => {
    const {api, commands, connects} = harness();
    commands.fire('open-sidebar-and-summarize');
    const port = new FakePort();
    connects.fire(port);
    port.ready(1);
    await settle();
    expect(api.tabs.query).toHaveBeenCalledWith({active: true, currentWindow: true});
    expect(port.postMessage).toHaveBeenCalledWith({type: 'SUMMARIZE_ACTIVE_TAB', tabId: 10});
  });

  it('expires undelivered actions and drops actions when sidebar opening fails', async () => {
    const {api, commands, connects} = harness();
    commands.fire('open-sidebar-and-summarize', {id: 30, windowId: 3});
    await settle();
    await vi.advanceTimersByTimeAsync(10000);
    const latePort = new FakePort();
    connects.fire(latePort);
    latePort.ready(3);
    expect(latePort.postMessage).not.toHaveBeenCalled();

    api.sidebarAction.open.mockRejectedValueOnce(new Error('cannot open'));
    commands.fire('open-sidebar-and-summarize', {id: 31, windowId: 3});
    await settle();
    const failedPort = new FakePort();
    connects.fire(failedPort);
    failedPort.ready(3);
    expect(failedPort.postMessage).not.toHaveBeenCalled();
  });
});
