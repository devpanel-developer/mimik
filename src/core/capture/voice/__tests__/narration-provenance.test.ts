import { describe, expect, it } from 'vitest';
import { assignSegments } from '../attribute';
import type { Batch, StepWindow, TranscriptionResponse } from '../types';

const batch: Batch = { segments: [{ start: 0, end: 20 }] } as Batch;

const steps: StepWindow[] = [
  { stepId: 'step-1', from: 0, to: 10 } as StepWindow,
  { stepId: 'step-2', from: 10, to: 20 } as StepWindow,
];

/** Scoring fields are required, or `rejectReason` discards the segment as unscored. */
const scored = { no_speech_prob: 0.01, avg_logprob: -0.2, compression_ratio: 1.4 };

function response(overrides: Partial<TranscriptionResponse> = {}): TranscriptionResponse {
  return {
    segments: [{ start: 1, end: 4, text: " Here I'm cloning prod to test an upgrade. ", ...scored }],
    words: [],
    ...overrides,
  } as TranscriptionResponse;
}

describe('narration keeps its timing', () => {
  it('returns the utterance with the span it occupied', () => {
    const result = assignSegments(response(), batch, steps);

    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).toMatchObject({
      stepId: 'step-1',
      rawText: "Here I'm cloning prod to test an upgrade.",
    });
    expect(result.segments[0]?.startSec).toBeCloseTo(1);
    expect(result.segments[0]?.endSec).toBeCloseTo(4);
  });

  it('still produces the joined text the description path uses', () => {
    const result = assignSegments(response(), batch, steps);
    expect(result.byStep.get('step-1')).toEqual(["Here I'm cloning prod to test an upgrade."]);
  });

  it('gives each part of a split utterance the span of its own words', () => {
    const result = assignSegments(
      response({
        segments: [{ start: 8, end: 14, text: 'first part second part', ...scored }],
        words: [
          { word: 'first', start: 8, end: 8.5 },
          { word: 'part', start: 8.5, end: 9 },
          { word: 'second', start: 12, end: 12.5 },
          { word: 'part', start: 12.5, end: 13 },
        ],
      } as Partial<TranscriptionResponse>),
      batch,
      steps,
    );

    const byStep = new Map(result.segments.map((s) => [s.stepId, s]));
    expect(byStep.get('step-1')?.rawText).toBe('first part');
    expect(byStep.get('step-2')?.rawText).toBe('second part');
    // Each part reports its own words' span, not the whole segment's 8..14.
    expect(byStep.get('step-1')?.endSec).toBeLessThan(10);
    expect(byStep.get('step-2')?.startSec).toBeGreaterThan(10);
  });

  it('records nothing for a rejected segment', () => {
    const result = assignSegments(response({ segments: [] } as Partial<TranscriptionResponse>), batch, steps);
    expect(result.segments).toEqual([]);
  });
});
