import type { InputClassification } from '@/core/capture/dom/sensitive';

import type { VoiceProvider } from '@/core/capture/voice/transcribe';
import type { ScreenshotEdits } from '@/core/screenshot/types';

export interface Guide {
  id: string;
  title: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  stepIds: string[];
  starred: boolean;
  deletedAt: number | null;
  staging?: boolean;
}

/**
 * When a step's screenshot was taken relative to the action.
 *
 * The recorder knows this: an intercepted click is captured before the page reacts, while an
 * unintercepted one is captured after it already has. Recording the fact means evidence can
 * be given a truthful before/after role later, instead of one being guessed.
 */
export type CaptureTiming = 'before-action' | 'after-action';

export type DescriptionSource = 'narration' | 'ai' | 'heuristic';

export type BlockType = 'heading' | 'callout';

export type CalloutVariant = 'info' | 'warning' | 'error' | 'success' | 'custom';

export interface StepBrowserContext {
  tabId?: number;
  frameId?: number;
  windowId?: number;
  /** URL of the frame the event happened in. */
  eventUrl?: string;
  /** URL of the top-level document, when the event came from a subframe. */
  topLevelUrl?: string;
  /** Ordering counter for navigations observed in this tab during the recording. */
  navigationSequence?: number;
}

export interface Step {
  id: string;
  guideId: string;
  index: number;
  description: string;
  action: string;
  url: string;
  timestamp: number;
  screenshotId?: string;
  elementMeta?: ElementMeta;
  inputValue?: string;
  /** When the screenshot was taken relative to the action. */
  captureTiming?: CaptureTiming;
  /** Authoritative per-event browser context; absent on recordings made before WP-03. */
  browserContext?: StepBrowserContext;
  /** How the captured field was classified. Secret fields never carry an inputValue. */
  inputClassification?: InputClassification;
  /** Stand-in for a secret value, e.g. `<ADMIN_PASSWORD>`. Never the value itself. */
  inputDisplayToken?: string;
  descriptionSource?: DescriptionSource;
  aiPending?: boolean;
  blockType?: BlockType;
  calloutVariant?: CalloutVariant;
  calloutColor?: string;
}

export interface ScreenshotBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Screenshot {
  id: string;
  stepId: string;
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  bounds?: ScreenshotBounds;
  pixelRatio?: number;
  clickPoint?: { x: number; y: number };
  edits?: ScreenshotEdits;
}

export interface Settings {
  aiApiKey: string;
  aiProvider: 'openai' | 'anthropic';
  aiModel: string;
  voiceEnabled: boolean;
  voiceProvider: VoiceProvider;
  voiceApiKey: string;
  voiceMicrophoneId: string;
}

export interface ElementMeta {
  tag: string;
  cssSelector: string;
  textContent: string | null;
  ariaLabel: string | null;
  placeholder: string | null;
  altText: string | null;
  name: string | null;
  role: string | null;
  href: string | null;
  inputType: string | null;
  dataTestId: string | null;
  rect: { x: number; y: number; width: number; height: number };
  devicePixelRatio: number;
  clickPoint?: { x: number; y: number };
}

/**
 * What the trainer actually said, kept as evidence in its own right.
 *
 * A step's `description` may be rewritten by AI or by a human editor. This record is not:
 * it is the utterance, with the timing and provider that produced it. Compiled explanation and
 * original narration must both survive, or provenance is lost the first time prose is polished.
 */
export interface NarrationSegment {
  id: string;
  guideId: string;
  /** The step this utterance was attributed to, or null when it could not be placed. */
  stepId: string | null;
  rawText: string;
  startMs: number | null;
  endMs: number | null;
  transcriptionProvider?: string;
  transcriptionModel?: string;
  language?: string;
  createdAt: number;
}

export interface Snapshot {
  id: string;
  guideId: string;
  createdAt: number;
  contentHash: string;
  name?: string;
  title: string;
  stepIds: string[];
  steps: Step[];
  screenshots: Omit<Screenshot, 'blob'>[];
}
