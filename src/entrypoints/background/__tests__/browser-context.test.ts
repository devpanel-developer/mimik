import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildStepBrowserContext,
  forgetTab,
  getNavigationSequence,
  recordNavigation,
  resetNavigationRegistry,
  resolveEventUrl,
} from '../browser-context';

const FOREGROUND_TAB = 7;
const BACKGROUND_TAB = 9;

function sender(tabId: number, frameId = 0, tabUrl?: string) {
  return { tab: { id: tabId, windowId: 1, url: tabUrl }, frameId };
}

beforeEach(() => {
  resetNavigationRegistry();
});

describe('navigation sequence', () => {
  it('counts navigations per tab, not globally', () => {
    recordNavigation(FOREGROUND_TAB);
    recordNavigation(FOREGROUND_TAB);
    recordNavigation(BACKGROUND_TAB);

    expect(getNavigationSequence(FOREGROUND_TAB)).toBe(2);
    expect(getNavigationSequence(BACKGROUND_TAB)).toBe(1);
  });

  it('counts an SPA pushState the same as a full navigation', () => {
    recordNavigation(FOREGROUND_TAB); // full load
    recordNavigation(FOREGROUND_TAB); // pushState
    expect(getNavigationSequence(FOREGROUND_TAB)).toBe(2);
  });

  it('ignores a navigation with no tab id', () => {
    expect(recordNavigation(undefined)).toBeUndefined();
    expect(getNavigationSequence(undefined)).toBeUndefined();
  });

  it('forgets a closed tab', () => {
    recordNavigation(FOREGROUND_TAB);
    forgetTab(FOREGROUND_TAB);
    expect(getNavigationSequence(FOREGROUND_TAB)).toBeUndefined();
  });
});

describe('buildStepBrowserContext', () => {
  it('takes tab identity from the sender', () => {
    const context = buildStepBrowserContext(sender(FOREGROUND_TAB), 'https://acme.invalid/apps/1');
    expect(context).toMatchObject({ tabId: FOREGROUND_TAB, frameId: 0, windowId: 1 });
  });

  it('records the frame URL the content script reported', () => {
    const context = buildStepBrowserContext(sender(FOREGROUND_TAB), 'https://acme.invalid/apps/1');
    expect(context.eventUrl).toBe('https://acme.invalid/apps/1');
  });

  it('adds the top-level URL only for a subframe event', () => {
    const inFrame = buildStepBrowserContext(
      sender(FOREGROUND_TAB, 3, 'https://acme.invalid/host'),
      'https://embed.invalid/widget',
    );
    expect(inFrame.topLevelUrl).toBe('https://acme.invalid/host');

    const topLevel = buildStepBrowserContext(
      sender(FOREGROUND_TAB, 0, 'https://acme.invalid/host'),
      'https://acme.invalid/host',
    );
    expect(topLevel.topLevelUrl).toBeUndefined();
  });

  it('stamps the navigation sequence of the event tab', () => {
    recordNavigation(FOREGROUND_TAB);
    recordNavigation(FOREGROUND_TAB);
    expect(buildStepBrowserContext(sender(FOREGROUND_TAB), 'https://acme.invalid/x').navigationSequence).toBe(2);
  });

  it('omits what it does not know rather than guessing', () => {
    expect(buildStepBrowserContext(undefined, undefined)).toEqual({});
  });
});

describe('multi-tab attribution', () => {
  it('does not let a background tab navigation change the URL recorded in the foreground tab', () => {
    // The recorder's global currentUrl follows any top-level navigation in any tab, so a
    // background tab loading a page moves it. The event must not follow.
    const globalUrlAfterBackgroundNavigation = 'https://unrelated.invalid/background-page';
    const foregroundEventUrl = 'https://acme.invalid/applications/456';

    expect(resolveEventUrl(foregroundEventUrl, globalUrlAfterBackgroundNavigation)).toBe(foregroundEventUrl);
  });

  it('keeps two tabs on their own navigation sequences while both are recording', () => {
    recordNavigation(FOREGROUND_TAB);
    recordNavigation(BACKGROUND_TAB);
    recordNavigation(BACKGROUND_TAB);

    const foreground = buildStepBrowserContext(sender(FOREGROUND_TAB), 'https://acme.invalid/a');
    const background = buildStepBrowserContext(sender(BACKGROUND_TAB), 'https://acme.invalid/b');

    expect(foreground).toMatchObject({ tabId: FOREGROUND_TAB, navigationSequence: 1 });
    expect(background).toMatchObject({ tabId: BACKGROUND_TAB, navigationSequence: 2 });
  });

  it('attributes events correctly when the user switches tabs mid-recording', () => {
    const first = buildStepBrowserContext(sender(FOREGROUND_TAB), 'https://acme.invalid/apps');
    const afterSwitch = buildStepBrowserContext(sender(BACKGROUND_TAB), 'https://other.invalid/dashboard');

    expect(first.eventUrl).toBe('https://acme.invalid/apps');
    expect(afterSwitch.eventUrl).toBe('https://other.invalid/dashboard');
    expect(first.tabId).not.toBe(afterSwitch.tabId);
  });
});

describe('resolveEventUrl', () => {
  it('prefers the event URL', () => {
    expect(resolveEventUrl('https://acme.invalid/event', 'https://acme.invalid/global')).toBe(
      'https://acme.invalid/event',
    );
  });

  it('falls back to the recorder URL when the content script supplied none', () => {
    expect(resolveEventUrl(undefined, 'https://acme.invalid/global')).toBe('https://acme.invalid/global');
    expect(resolveEventUrl('', 'https://acme.invalid/global')).toBe('https://acme.invalid/global');
  });
});
