import {describe, expect, it, vi} from 'vitest';
import type browser from 'webextension-polyfill';
import {setupSidebarShortcut} from './sidebar-shortcut';

describe('sidebar shortcut', () => {
  it('toggles the sidebar for the existing shortcut and ignores other commands', () => {
    let listener: (command: string) => void = () => undefined;
    const toggle = vi.fn().mockResolvedValue(undefined);
    const api = {commands: {onCommand: {addListener: (callback: (command: string) => void) => { listener = callback; }}},
      sidebarAction: {toggle}} as unknown as Pick<typeof browser, 'commands' | 'sidebarAction'>;
    setupSidebarShortcut(api);
    listener('open-sidebar-and-summarize');
    expect(toggle).not.toHaveBeenCalled();
    listener('toggle-sidebar');
    expect(toggle).toHaveBeenCalledOnce();
  });
});
