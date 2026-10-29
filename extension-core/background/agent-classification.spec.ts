import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({getSettings: vi.fn(), fetch: vi.fn()}));
vi.mock('./settings', async importOriginal => ({
  ...await importOriginal<typeof import('./settings')>(),
  getSettings: mocks.getSettings,
}));
vi.mock('webextension-polyfill', () => ({default: {}}));
vi.stubGlobal('fetch', mocks.fetch);
import {handleClassifyWithAgent} from './agent-classification';
import {DEFAULT_SETTINGS} from './settings';

const labels = ['one', 'two', 'three', 'four', 'five'];
const request = {type: 'CLASSIFY_WITH_AGENT' as const, summary: 'Summary', agentId: '', agentVersion: ''};
function response(content: unknown, outputs: unknown[] = [{content}]) {
  return {ok: true, json: vi.fn().mockResolvedValue({outputs}), text: vi.fn()};
}

describe('Mistral agent classification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mocks.fetch);
    mocks.getSettings.mockResolvedValue({...DEFAULT_SETTINGS, provider: 'mistral', apiKey: 'secret', mistralAgentId: 'configured-id', mistralAgentVersion: 'configured-version'});
    mocks.fetch.mockResolvedValue(response(JSON.stringify(labels)));
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('gates non-Mistral or unconfigured settings without fetching', async () => {
    mocks.getSettings.mockResolvedValueOnce({...DEFAULT_SETTINGS, provider: 'openai'});
    await expect(handleClassifyWithAgent(request)).resolves.toMatchObject({success: false, error: expect.stringContaining('requires Mistral')});
    expect(mocks.fetch).not.toHaveBeenCalled();
    mocks.getSettings.mockResolvedValueOnce({...DEFAULT_SETTINGS, provider: 'mistral', apiKey: 'key', mistralAgentId: '', mistralAgentVersion: ''});
    await expect(handleClassifyWithAgent({...request, agentId: 'override-id', agentVersion: 'override-version'})).resolves.toMatchObject({success: false});
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('uses request overrides and sends the conversation request with a 30 second timeout', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    await expect(handleClassifyWithAgent({...request, agentId: 'override-id', agentVersion: 'override-version'})).resolves.toMatchObject({success: true, labels});
    expect(timeout).toHaveBeenCalledWith(30000);
    expect(mocks.fetch).toHaveBeenCalledWith('https://api.mistral.ai/v1/conversations', expect.objectContaining({
      method: 'POST',
      headers: {'Content-Type': 'application/json', Authorization: 'Bearer secret'},
      body: JSON.stringify({agent_id: 'override-id', agent_version: 'override-version', inputs: [{role: 'user', content: 'Summary'}], store: false}),
    }));
  });

  it('accepts a direct array and validates count, blanks, types, and missing output content', async () => {
    mocks.fetch.mockResolvedValueOnce(response(labels));
    await expect(handleClassifyWithAgent(request)).resolves.toMatchObject({success: true, labels});
    for (const bad of [
      {content: JSON.stringify(['one'])},
      {content: JSON.stringify(['one', 'two', 'three', 'four', ''])},
      {content: JSON.stringify(['one', 'two', 'three', 'four', 5])},
      {outputs: []},
      {outputs: [{content: null}]},
      {content: JSON.stringify({labels})},
    ]) {
      const body = 'outputs' in bad ? bad : {outputs: [bad]};
      mocks.fetch.mockResolvedValueOnce({ok: true, json: vi.fn().mockResolvedValue(body)});
      await expect(handleClassifyWithAgent(request)).resolves.toMatchObject({success: false});
    }
  });

  it('uses only the final output from the agent and surfaces HTTP errors', async () => {
    mocks.fetch.mockResolvedValueOnce(response(labels[0], [{content: 12}, {content: JSON.stringify(labels)}]));
    await expect(handleClassifyWithAgent(request)).resolves.toMatchObject({success: true, labels});
    mocks.fetch.mockResolvedValueOnce({ok: false, status: 403, text: vi.fn().mockResolvedValue('{"message":"denied"}')});
    await expect(handleClassifyWithAgent(request)).resolves.toMatchObject({success: false, error: 'Agent classification error: HTTP 403: {"message":"denied"}'});
  });

  it('reports missing API keys and fetch/timeout failures', async () => {
    mocks.getSettings.mockResolvedValueOnce({...DEFAULT_SETTINGS, provider: 'mistral', mistralAgentId: 'id', mistralAgentVersion: 'v'});
    await expect(handleClassifyWithAgent(request)).resolves.toMatchObject({success: false, error: 'API key is required for Mistral agent classification'});
    mocks.fetch.mockRejectedValueOnce(new Error('timeout'));
    await expect(handleClassifyWithAgent(request)).resolves.toMatchObject({success: false, error: 'Agent classification error: timeout'});
  });
});
