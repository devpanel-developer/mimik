import type { StepBrowserContext } from '@/core/guides/types';

/**
 * Per-event browser context.
 *
 * Mimik's capture machine keeps a single global `currentUrl`, updated by any top-level
 * navigation in any tab. That is not a safe source for an individual event's URL: a
 * background tab navigating between two foreground actions would stamp its URL onto the
 * next foreground step. Each event therefore resolves its own context from two authoritative
 * sources — the content script's own `location.href`, and the message sender's tab identity.
 */

/**
 * Navigation counter per tab.
 *
 * Best effort: the map lives in the service worker and resets if it is torn down, so a
 * sequence is only comparable within a run. It is used for ordering, never as an identity.
 */
const navigationSequences = new Map<number, number>();

/** Record a top-level navigation for a tab and return its new sequence number. */
export function recordNavigation(tabId: number | undefined): number | undefined {
  if (typeof tabId !== 'number') return undefined;
  const next = (navigationSequences.get(tabId) ?? 0) + 1;
  navigationSequences.set(tabId, next);
  return next;
}

export function getNavigationSequence(tabId: number | undefined): number | undefined {
  if (typeof tabId !== 'number') return undefined;
  return navigationSequences.get(tabId);
}

/** Drop a closed tab so sequences do not accumulate across a long recording. */
export function forgetTab(tabId: number | undefined): void {
  if (typeof tabId === 'number') navigationSequences.delete(tabId);
}

export function resetNavigationRegistry(): void {
  navigationSequences.clear();
}

/** The parts of a message sender this module needs, kept narrow for testability. */
export interface MessageSenderLike {
  tab?: { id?: number; windowId?: number; url?: string };
  frameId?: number;
}

/**
 * Build the context for one event.
 *
 * `eventUrl` comes from the content script and is authoritative for the frame the event
 * happened in. The sender supplies tab identity and, for subframe events, the top-level URL
 * — which the content script cannot read across origins.
 */
export function buildStepBrowserContext(
  sender: MessageSenderLike | undefined,
  eventUrl: string | undefined,
): StepBrowserContext {
  const tabId = sender?.tab?.id;
  const frameId = sender?.frameId;
  const topLevelUrl = sender?.tab?.url;

  const context: StepBrowserContext = {};
  if (typeof tabId === 'number') context.tabId = tabId;
  if (typeof frameId === 'number') context.frameId = frameId;
  if (typeof sender?.tab?.windowId === 'number') context.windowId = sender.tab.windowId;
  if (eventUrl) context.eventUrl = eventUrl;
  // Only meaningful when the event came from a subframe; otherwise it duplicates eventUrl.
  if (topLevelUrl && frameId !== 0 && topLevelUrl !== eventUrl) context.topLevelUrl = topLevelUrl;

  const sequence = getNavigationSequence(tabId);
  if (sequence !== undefined) context.navigationSequence = sequence;

  return context;
}

/**
 * URL to record for an event.
 *
 * Prefers the event-local URL and falls back to the recorder's global URL only when the
 * content script could not supply one.
 */
export function resolveEventUrl(eventUrl: string | undefined, fallbackUrl: string): string {
  return eventUrl || fallbackUrl;
}
