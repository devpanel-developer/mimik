import { browser } from '#imports';
import type { Guide, NarrationSegment, Screenshot, Step } from '@/core/guides/types';
import { blobToBase64 } from './utils';

/**
 * Raw capture export.
 *
 * Every other exporter renders a guide for a human to read. This one emits the recording
 * itself, so a downstream system can compile it into structured workflow knowledge instead of
 * parsing prose back out of Markdown.
 *
 * The shape is deliberately close to the recorder's own records rather than an interpretation
 * of them: the point is to hand over evidence, and let the consumer decide what it means.
 */

export const RAW_CAPTURE_FORMAT = 'documentation-plus/raw-capture';
export const RAW_CAPTURE_FORMAT_VERSION = '1.0.0';

export interface RawCaptureScreenshot {
  id: string;
  stepId: string;
  mimeType?: string;
  width?: number;
  height?: number;
  bounds?: { x: number; y: number; width: number; height: number };
  pixelRatio?: number;
  clickPoint?: { x: number; y: number };
  /** Base64 data URL, present only when the caller opts in. */
  dataUrl?: string;
}

export interface RawCaptureExport {
  format: typeof RAW_CAPTURE_FORMAT;
  formatVersion: string;
  exportedAt: string;
  recorder: { name: string; version: string };
  guide: Guide;
  steps: Step[];
  screenshots: RawCaptureScreenshot[];
  /** The trainer's own words, exported apart from the step descriptions they informed. */
  narration: NarrationSegment[];
  /** Anything the exporter changed on the way out, so the consumer is not misled. */
  exportNotes: string[];
}

export interface RawCaptureExportOptions {
  /**
   * Embed screenshot image data as base64.
   *
   * Off by default: screenshots of a real application are the most sensitive thing a
   * recording holds, and an export is the moment data leaves the browser.
   */
  includeScreenshotData?: boolean;
}

/**
 * Strip anything that must not leave the browser.
 *
 * Capture already refuses to store secret values, so this is defence in depth for recordings
 * made before that protection existed — an export is exactly where such a value would escape.
 */
function sanitizeStep(step: Step, notes: string[]): Step {
  if (step.inputClassification === 'secret' && step.inputValue !== undefined) {
    notes.push(`step ${step.id}: dropped a stored value on a field classified secret`);
    const { inputValue: _dropped, ...rest } = step;
    return rest;
  }
  if (step.inputValue !== undefined && step.inputClassification === undefined) {
    notes.push(
      `step ${step.id}: value recorded before sensitive-input classification existed; dropped because it may be a credential`,
    );
    const { inputValue: _dropped, ...rest } = step;
    return rest;
  }
  return step;
}

export async function exportGuideAsRawCapture(
  guide: Guide,
  steps: Step[],
  screenshots: Map<string, Screenshot>,
  options: RawCaptureExportOptions = {},
  narration: readonly NarrationSegment[] = [],
): Promise<string> {
  const exportNotes: string[] = [];
  const sanitizedSteps = steps.map((step) => sanitizeStep(step, exportNotes));

  const exported: RawCaptureScreenshot[] = [];
  for (const step of sanitizedSteps) {
    if (!step.screenshotId) continue;
    const shot = screenshots.get(step.screenshotId);
    if (!shot) continue;

    const entry: RawCaptureScreenshot = {
      id: shot.id,
      stepId: shot.stepId,
      mimeType: shot.mimeType,
      width: shot.width,
      height: shot.height,
      bounds: shot.bounds,
      pixelRatio: shot.pixelRatio,
      clickPoint: shot.clickPoint,
    };
    if (options.includeScreenshotData && shot.blob) {
      entry.dataUrl = await blobToBase64(shot.blob);
    }
    exported.push(entry);
  }

  if (!options.includeScreenshotData && exported.length > 0) {
    exportNotes.push('screenshot image data was not included; only metadata was exported');
  }

  const payload: RawCaptureExport = {
    format: RAW_CAPTURE_FORMAT,
    formatVersion: RAW_CAPTURE_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    recorder: { name: 'mimik', version: browser.runtime.getManifest().version },
    guide,
    steps: sanitizedSteps,
    screenshots: exported,
    narration: [...narration],
    exportNotes,
  };

  return JSON.stringify(payload, null, 2);
}
