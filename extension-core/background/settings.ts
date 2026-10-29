import browser from 'webextension-polyfill';
import {DEFAULT_SETTINGS as SHARED_DEFAULT_SETTINGS, ExtensionSettings} from '@shared/lib/models/settings.model';
export interface ResolvedSettings extends ExtensionSettings {
  mlTimeout: number;
}

interface StoredSettings {
  extension_settings?: Partial<ResolvedSettings>;
}

interface GetSettingsResponse {
  type: 'GET_SETTINGS_RESPONSE';
  success: boolean;
  data: ResolvedSettings;
}

interface SaveSettingsResponse {
  type: 'SAVE_SETTINGS_RESPONSE';
  success: boolean;
  error?: string;
}

export const DEFAULT_SETTINGS: ResolvedSettings = {
  ...SHARED_DEFAULT_SETTINGS,
  customPrompt: '',
  mlTimeout: 720000,
};

export async function getSettings(): Promise<ResolvedSettings> {
  const result = await browser.storage.local.get('extension_settings') as StoredSettings;
  return {...DEFAULT_SETTINGS, ...result.extension_settings};
}

export async function saveSettings(settings: Partial<ResolvedSettings>): Promise<void> {
  await browser.storage.local.set({extension_settings: settings});
}

export async function handleGetSettings(): Promise<GetSettingsResponse> {
  const settings = await getSettings();
  return {type: 'GET_SETTINGS_RESPONSE', success: true, data: settings};
}

export async function handleSaveSettings(
  settings: Partial<ResolvedSettings>,
): Promise<SaveSettingsResponse> {
  try {
    if (settings.apiKey && typeof settings.apiKey !== 'string') {
      return {type: 'SAVE_SETTINGS_RESPONSE', success: false, error: 'Invalid API key format'};
    }
    await saveSettings(settings);
    return {type: 'SAVE_SETTINGS_RESPONSE', success: true};
  } catch (error) {
    return {
      type: 'SAVE_SETTINGS_RESPONSE',
      success: false,
      error: `Failed to save settings: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
