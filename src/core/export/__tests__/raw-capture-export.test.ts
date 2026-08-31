import { describe, expect, it } from 'vitest';
import type { Guide, Screenshot, Step } from '@/core/guides/types';
import { exportGuideAsRawCapture, RAW_CAPTURE_FORMAT } from '../raw-capture-export';

const guide: Guide = {
  id: 'guide-1',
  title: 'Create an application',
  description: 'Onboarding path',
  createdAt: 1_756_000_000_000,
  updatedAt: 1_756_000_060_000,
  stepIds: ['step-1', 'step-2'],
  starred: false,
  deletedAt: null,
};

function step(overrides: Partial<Step> = {}): Step {
  return {
    id: 'step-1',
    guideId: 'guide-1',
    index: 0,
    description: 'Click Create',
    action: 'click',
    url: 'https://acme.invalid/apps',
    timestamp: 1_756_000_010_000,
    ...overrides,
  };
}

const noScreenshots = new Map<string, Screenshot>();

async function exportOf(steps: Step[], screenshots = noScreenshots, options = {}) {
  return JSON.parse(await exportGuideAsRawCapture(guide, steps, screenshots, options));
}

describe('raw capture export', () => {
  it('identifies its format and version so a consumer can dispatch on it', async () => {
    const payload = await exportOf([step()]);
    expect(payload.format).toBe(RAW_CAPTURE_FORMAT);
    expect(payload.formatVersion).toBe('1.0.0');
    expect(payload.recorder.name).toBe('mimik');
  });

  it('exports the recording rather than rendered prose', async () => {
    const payload = await exportOf([step({ browserContext: { tabId: 7, eventUrl: 'https://acme.invalid/apps' } })]);
    expect(payload.guide.id).toBe('guide-1');
    expect(payload.steps[0].action).toBe('click');
    expect(payload.steps[0].browserContext.tabId).toBe(7);
  });

  it('keeps an ordinary recorded value', async () => {
    const payload = await exportOf([
      step({ action: 'input', inputValue: 'ada@example.com', inputClassification: 'public' }),
    ]);
    expect(payload.steps[0].inputValue).toBe('ada@example.com');
  });

  it('drops a stored value on a field classified secret', async () => {
    const payload = await exportOf([step({ action: 'input', inputValue: 'hunter2', inputClassification: 'secret' })]);
    expect(payload.steps[0].inputValue).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain('hunter2');
    expect(payload.exportNotes.join(' ')).toContain('classified secret');
  });

  it('drops an unclassified value, since it predates secret protection', async () => {
    const payload = await exportOf([step({ action: 'input', inputValue: 'hunter2' })]);
    expect(payload.steps[0].inputValue).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain('hunter2');
    expect(payload.exportNotes.join(' ')).toContain('may be a credential');
  });

  it('exports screenshot metadata without image data by default', async () => {
    // getGuide keys this map by stepId, not by screenshot id — keying it the other way was a
    // real bug that silently dropped every screenshot from the export.
    const screenshots = new Map<string, Screenshot>([
      [
        'step-1',
        {
          id: 'shot-1',
          stepId: 'step-1',
          blob: new Blob(['x']),
          mimeType: 'image/jpeg',
          width: 1280,
          height: 800,
        } as Screenshot,
      ],
    ]);
    const payload = await exportOf([step({ screenshotId: 'shot-1' })], screenshots);

    expect(payload.screenshots[0]).toMatchObject({ id: 'shot-1', width: 1280 });
    expect(payload.screenshots[0].dataUrl).toBeUndefined();
    expect(payload.exportNotes.join(' ')).toContain('only metadata');
  });

  it('still exports an evidence reference when screenshot metadata cannot be loaded', async () => {
    const payload = await exportOf([step({ screenshotId: 'shot-1' })], new Map());

    expect(payload.screenshots).toEqual([{ id: 'shot-1', stepId: 'step-1' }]);
    expect(payload.exportNotes.join(' ')).toContain('metadata could not be loaded');
  });

  it('exports one screenshot per step that has one', async () => {
    const screenshots = new Map<string, Screenshot>([
      ['step-1', { id: 'shot-1', stepId: 'step-1', mimeType: 'image/jpeg' } as Screenshot],
      ['step-2', { id: 'shot-2', stepId: 'step-2', mimeType: 'image/jpeg' } as Screenshot],
    ]);
    const payload = await exportOf(
      [step({ screenshotId: 'shot-1' }), step({ id: 'step-2', index: 1, screenshotId: 'shot-2' })],
      screenshots,
    );
    expect(payload.screenshots.map((s: { id: string }) => s.id)).toEqual(['shot-1', 'shot-2']);
  });

  it('says nothing about screenshots when there are none', async () => {
    const payload = await exportOf([step()]);
    expect(payload.screenshots).toEqual([]);
    expect(payload.exportNotes.join(' ')).not.toContain('metadata');
  });

  it('produces the shape the capture model importer consumes', async () => {
    const payload = await exportOf([step(), step({ id: 'step-2', index: 1 })]);
    // MimikCaptureInput requires exactly these three collections.
    expect(payload).toHaveProperty('guide.stepIds');
    expect(Array.isArray(payload.steps)).toBe(true);
    expect(Array.isArray(payload.screenshots)).toBe(true);
  });
});

describe('narration and evidence timing', () => {
  it('exports the trainer words apart from the step description they informed', async () => {
    const payload = JSON.parse(
      await exportGuideAsRawCapture(
        guide,
        [step({ description: 'Clone the production application to test an upgrade.' })],
        noScreenshots,
        {},
        [
          {
            id: 'n1',
            guideId: 'guide-1',
            stepId: 'step-1',
            rawText: "Here I'm cloning prod because I want somewhere safe to test this upgrade.",
            startMs: 12400,
            endMs: 17900,
            createdAt: 0,
          },
        ],
      ),
    );

    expect(payload.narration[0].rawText).toContain("I'm cloning prod");
    expect(payload.steps[0].description).toBe('Clone the production application to test an upgrade.');
    expect(payload.narration[0].stepId).toBe('step-1');
    expect(payload.narration[0].startMs).toBe(12400);
  });

  it('exports an empty narration list rather than omitting the field', async () => {
    const payload = JSON.parse(await exportGuideAsRawCapture(guide, [step()], noScreenshots));
    expect(payload.narration).toEqual([]);
  });

  it('carries the capture timing so evidence can be given a truthful role', async () => {
    const payload = await exportOf([
      step({ captureTiming: 'before-action' }),
      step({ id: 'step-2', index: 1, captureTiming: 'after-action' }),
    ]);
    expect(payload.steps[0].captureTiming).toBe('before-action');
    expect(payload.steps[1].captureTiming).toBe('after-action');
  });
});
