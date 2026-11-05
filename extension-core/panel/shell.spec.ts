// @vitest-environment jsdom
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {installPanelShell} from './shell';

const mock = vi.hoisted(() => ({send: vi.fn(), get: vi.fn(), onChanged: vi.fn()}));
vi.mock('webextension-polyfill', () => ({default: {
  runtime: {getURL: (path: string) => `moz-extension://extension/${path}`, sendMessage: mock.send},
  storage: {local: {get: mock.get}, onChanged: {addListener: mock.onChanged}},
}}));

let shadow: ShadowRoot;
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('innerWidth', 1024); vi.stubGlobal('innerHeight', 768);
  mock.get.mockResolvedValue({});
  const original = Element.prototype.attachShadow;
  vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function(this: Element, init) {
    shadow = original.call(this, init);
    return shadow;
  });
  document.body.innerHTML = '<button id="article-button">Article</button>';
});
afterEach(() => {
  document.querySelectorAll('[data-ai-summarizer-panel]').forEach(host => host.remove());
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

describe('in-page panel shell', () => {
  it('positions, moves, resizes, and reopens one panel while restoring focus', () => {
    const article = document.querySelector<HTMLButtonElement>('#article-button')!;
    article.focus();
    const handle = installPanelShell();
    expect(handle({type: 'PANEL_SHOW', sessionId: 'session'})).toBe(true);
    const host = document.querySelector<HTMLElement>('[data-ai-summarizer-panel]')!;
    const panel = shadow.querySelector<HTMLDivElement>('.panel')!;
    const move = shadow.querySelector<HTMLButtonElement>('.drag')!;
    const resize = shadow.querySelector<HTMLButtonElement>('.resize')!;
    expect(panel.style.width).toBe('420px');
    expect(panel.style.height).toBe('560px');
    expect(panel.style.left).toBe('588px');
    expect(panel.style.top).toBe('16px');
    move.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true}));
    resize.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true}));
    expect(panel.style.left).toBe('578px');
    expect(panel.style.width).toBe('410px');
    handle({type: 'PANEL_SHOW', sessionId: 'session'});
    expect(document.querySelectorAll('[data-ai-summarizer-panel]')).toHaveLength(1);
    expect(shadow.querySelectorAll('iframe')).toHaveLength(1);
    shadow.querySelector<HTMLButtonElement>('.close')!.click();
    expect(host.style.display).toBe('none');
    expect(document.activeElement).toBe(article);
    handle({type: 'PANEL_SHOW', sessionId: 'session'});
    expect(panel.style.left).toBe('578px');
    expect(panel.style.width).toBe('410px');
    expect(shadow.querySelectorAll('iframe')).toHaveLength(1);
    vi.stubGlobal('innerWidth', 320);
    vi.stubGlobal('innerHeight', 260);
    window.dispatchEvent(new Event('resize'));
    expect(Number.parseFloat(panel.style.width)).toBeLessThanOrEqual(304);
    expect(Number.parseFloat(panel.style.height)).toBeLessThanOrEqual(244);
    handle({type: 'PANEL_DISMISS'});
    expect(document.querySelector('[data-ai-summarizer-panel]')).toBeNull();
  });

  it('offers retry and help if the embedded panel never becomes ready', () => {
    const handle = installPanelShell();
    handle({type: 'PANEL_SHOW', sessionId: 'session'});
    vi.advanceTimersByTime(5000);
    expect(shadow.querySelector('iframe')).toBeNull();
    expect(shadow.querySelector<HTMLElement>('.status')!.hidden).toBe(false);
    const buttons = shadow.querySelectorAll<HTMLButtonElement>('.status button');
    buttons[1].click();
    expect(mock.send).toHaveBeenCalledWith({type: 'PANEL_ERROR_TAB', sessionId: 'session'});
    buttons[0].click();
    expect(shadow.querySelector('iframe')).not.toBeNull();
    handle({type: 'PANEL_FRAME_READY', sessionId: 'session'});
    vi.advanceTimersByTime(5000);
    expect(shadow.querySelector('iframe')).not.toBeNull();
  });
});
