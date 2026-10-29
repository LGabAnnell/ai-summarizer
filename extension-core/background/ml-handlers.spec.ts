import {beforeEach, describe, expect, it, vi} from 'vitest';

const deps = vi.hoisted(() => ({
  classify: vi.fn(), clearCache: vi.fn(), checkPermission: vi.fn(), notifyPermissionGranted: vi.fn(),
  isAPIAvailable: vi.fn(), getSettings: vi.fn(),
}));
vi.mock('../ml/text-classifier.service', () => ({textClassifierService: {classifyText: deps.classify, clearCache: deps.clearCache}}));
vi.mock('../ml/ml-permission.service', () => ({mlPermissionService: {
  checkPermission: deps.checkPermission, notifyPermissionGranted: deps.notifyPermissionGranted, isAPIAvailable: deps.isAPIAvailable,
}}));
vi.mock('./settings', () => ({getSettings: deps.getSettings}));

import {
  handleCheckMLAvailability, handleClassifyText, handleClearMLCache, handleGetMLPermissionStatus,
  handleNotifyMLPermissionGranted,
} from './ml-handlers';

describe('ML background handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deps.getSettings.mockResolvedValue({mlEnabled: true, mlModelHub: 'hub-a'});
    deps.classify.mockResolvedValue({ok: true, labels: ['positive']});
    deps.checkPermission.mockResolvedValue(true);
    deps.isAPIAvailable.mockReturnValue(true);
    deps.clearCache.mockResolvedValue({success: true});
  });

  it('returns a disabled classification result without calling the classifier', async () => {
    deps.getSettings.mockResolvedValue({mlEnabled: false, mlModelHub: 'unused'});
    await expect(handleClassifyText({type: 'CLASSIFY_TEXT', text: 'text'})).resolves.toEqual({
      type: 'CLASSIFY_RESULT', success: false,
      data: {ok: false, error: 'ML classification is disabled. Enable in Options page.'},
    });
    expect(deps.classify).not.toHaveBeenCalled();
  });

  it('forwards classification options and returns the classifier result', async () => {
    const request = {type: 'CLASSIFY_TEXT', text: 'text to classify', modelId: 'model-a', timeout: 321} as const;
    const result = {ok: true, labels: ['positive']};
    deps.classify.mockResolvedValue(result);
    await expect(handleClassifyText(request)).resolves.toEqual({type: 'CLASSIFY_RESULT', success: true, data: result});
    expect(deps.classify).toHaveBeenCalledWith('text to classify', {modelId: 'model-a', timeout: 321, modelHub: 'hub-a'});
  });

  it('encodes classifier failures in the classification result envelope', async () => {
    deps.classify.mockRejectedValue(new Error('model failed'));
    await expect(handleClassifyText({type: 'CLASSIFY_TEXT', text: 'text'})).resolves.toEqual({
      type: 'CLASSIFY_RESULT', success: false, data: {ok: false, error: 'Classification error: model failed'},
    });
  });

  it.each([true, false])('reports permission status when granted=%s', async granted => {
    deps.checkPermission.mockResolvedValue(granted);
    await expect(handleGetMLPermissionStatus()).resolves.toEqual({
      type: 'ML_PERMISSION_STATUS', success: true, data: {granted},
    });
  });

  it('reports permission check errors as denied', async () => {
    deps.checkPermission.mockRejectedValue(new Error('permission API unavailable'));
    await expect(handleGetMLPermissionStatus()).resolves.toEqual({
      type: 'ML_PERMISSION_STATUS', success: false, data: {granted: false}, error: 'permission API unavailable',
    });
  });

  it('notifies the permission service and returns success', async () => {
    await expect(handleNotifyMLPermissionGranted()).resolves.toEqual({type: 'NOTIFY_ML_PERMISSION_GRANTED_RESPONSE', success: true});
    expect(deps.notifyPermissionGranted).toHaveBeenCalledOnce();
  });

  it('converts permission notification errors to a response', async () => {
    deps.notifyPermissionGranted.mockImplementation(() => { throw new Error('state update failed'); });
    await expect(handleNotifyMLPermissionGranted()).resolves.toEqual({
      type: 'NOTIFY_ML_PERMISSION_GRANTED_RESPONSE', success: false,
      error: 'Notification processing failed: state update failed',
    });
  });

  it('returns successful and unsuccessful cache clear outcomes', async () => {
    await expect(handleClearMLCache()).resolves.toEqual({type: 'CLEAR_ML_CACHE_RESPONSE', success: true, data: {success: true}});
    deps.clearCache.mockResolvedValueOnce({success: false, error: 'cache locked'});
    await expect(handleClearMLCache()).resolves.toEqual({
      type: 'CLEAR_ML_CACHE_RESPONSE', success: false, data: {success: false, error: 'cache locked'},
    });
  });

  it('converts cache clearing exceptions into a failure response', async () => {
    deps.clearCache.mockRejectedValue(new Error('storage offline'));
    await expect(handleClearMLCache()).resolves.toEqual({
      type: 'CLEAR_ML_CACHE_RESPONSE', success: false,
      data: {success: false, error: 'Cache clear failed: storage offline'},
    });
  });

  it('derives availability from API support and permission', async () => {
    deps.isAPIAvailable.mockReturnValue(true);
    deps.checkPermission.mockResolvedValue(false);
    await expect(handleCheckMLAvailability()).resolves.toEqual({
      type: 'ML_AVAILABILITY_RESPONSE', success: true,
      data: {available: false, apiAvailable: true, permissionGranted: false},
    });
  });

  it('reports availability check errors with a fully unavailable state', async () => {
    deps.isAPIAvailable.mockReturnValue(true);
    deps.checkPermission.mockRejectedValue(new Error('permission query failed'));
    await expect(handleCheckMLAvailability()).resolves.toEqual({
      type: 'ML_AVAILABILITY_RESPONSE', success: false,
      data: {available: false, apiAvailable: false, permissionGranted: false}, error: 'permission query failed',
    });
  });
});
