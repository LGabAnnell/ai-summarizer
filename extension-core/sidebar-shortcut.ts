import browser from 'webextension-polyfill';

/** Keep the existing sidebar toggle shortcut available for history. */
export function setupSidebarShortcut(api: Pick<typeof browser, 'commands' | 'sidebarAction'>): void {
  api.commands.onCommand.addListener(command => {
    if (command === 'toggle-sidebar') void api.sidebarAction.toggle();
  });
}
