import type {SummaryResult} from './summary.model';

export interface PanelState {
  jobId: string;
  tabId: number;
  documentUrl: string;
  documentId: string;
  state: 'loading' | 'success' | 'error';
  summary?: SummaryResult;
  error?: string;
  permissionRequired?: boolean;
  historyError?: string;
}

export type PanelClientMessage =
  | {type: 'PANEL_READY'; sessionId: string}
  | {type: 'PANEL_RETRY'; sessionId: string}
  | {type: 'PANEL_OPEN_SETTINGS'; sessionId: string}
  | {type: 'PANEL_CLOSE'; sessionId: string};

export type PanelServerMessage =
  | {type: 'PANEL_STATE'; state: PanelState}
  | {type: 'PANEL_SETTINGS_ERROR'; error: string}
  | {type: 'PANEL_REJECTED'; error: string};

export type HistoryMutation =
  | {type: 'HISTORY_ADD'; summary: SummaryResult; id?: string}
  | {type: 'HISTORY_DELETE'; id: string}
  | {type: 'HISTORY_CLEAR'};
