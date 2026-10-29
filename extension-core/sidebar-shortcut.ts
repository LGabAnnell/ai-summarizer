import browser from 'webextension-polyfill';

type SidebarAction = {type: 'SUMMARIZE_ACTIVE_TAB'; tabId: number};
type PendingAction = {action: SidebarAction; timeout: ReturnType<typeof setTimeout>};

/** Connect the sidebar keyboard shortcuts and route summarize actions by window. */
export function setupSidebarShortcut(api: Pick<typeof browser, 'commands' | 'sidebarAction' | 'tabs' | 'runtime'>): void {
  const sidebarPorts = new Map<number, browser.Runtime.Port>();
  const pendingSidebarActions = new Map<number, PendingAction>();

  const queueSidebarAction = (windowId: number, action: SidebarAction): void => {
    const previous = pendingSidebarActions.get(windowId);
    if (previous) clearTimeout(previous.timeout);
    const timeout = setTimeout(() => pendingSidebarActions.delete(windowId), 10000);
    pendingSidebarActions.set(windowId, {action, timeout});
  };

  api.commands.onCommand.addListener((command, tab) => {
    if (command === 'toggle-sidebar') {
      void api.sidebarAction.toggle();
      return;
    }
    if (command !== 'open-sidebar-and-summarize') return;

    const activeTab = tab?.id !== undefined
      ? Promise.resolve(tab)
      : api.tabs.query({active: true, currentWindow: true}).then(tabs => tabs[0]);
    const windowId = tab?.windowId;
    // Firefox requires sidebarAction.open() to run inside the user action handler.
    const openPromise = api.sidebarAction.open();
    void Promise.all([openPromise, activeTab]).then(([, sourceTab]) => {
      if (sourceTab?.id === undefined) return;
      const targetWindowId = windowId ?? sourceTab.windowId;
      if (targetWindowId === undefined) return;
      const action: SidebarAction = {type: 'SUMMARIZE_ACTIVE_TAB', tabId: sourceTab.id};
      const connected = sidebarPorts.get(targetWindowId);
      if (connected) {
        try {
          connected.postMessage(action);
          return;
        } catch {
          sidebarPorts.delete(targetWindowId);
        }
      }
      queueSidebarAction(targetWindowId, action);
    }).catch(error => {
      if (windowId !== undefined) {
        const pending = pendingSidebarActions.get(windowId);
        if (pending) clearTimeout(pending.timeout);
        pendingSidebarActions.delete(windowId);
      }
      console.error('Could not open sidebar for summarization:', error);
    });
  });

  api.runtime.onConnect.addListener(port => {
    if (port.name !== 'summarizer-sidebar') return;
    let windowId: number | undefined;
    port.onMessage.addListener(message => {
      if (!message || typeof message !== 'object') return;
      const readyMessage = message as {type?: unknown; windowId?: unknown};
      if (readyMessage.type !== 'SIDEBAR_READY' || typeof readyMessage.windowId !== 'number') return;
      const readyWindowId = readyMessage.windowId;
      windowId = readyWindowId;
      sidebarPorts.set(readyWindowId, port);
      const pending = pendingSidebarActions.get(readyWindowId);
      if (!pending) return;
      try {
        port.postMessage(pending.action);
        clearTimeout(pending.timeout);
        pendingSidebarActions.delete(readyWindowId);
      } catch (error) {
        sidebarPorts.delete(readyWindowId);
        console.error('Could not deliver pending sidebar action:', error);
      }
    });
    port.onDisconnect.addListener(() => {
      if (windowId !== undefined && sidebarPorts.get(windowId) === port) sidebarPorts.delete(windowId);
    });
  });
}
