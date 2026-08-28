import { rejectReason } from './filter';
import {
  type AbsoluteSeconds,
  type AttributedSegment,
  absoluteSeconds,
  type Batch,
  type StepWindow,
  type TranscriptionResponse,
} from './types';

export function makeToAbsolute(batch: Batch): (batchTime: number) => AbsoluteSeconds {
  const bounds: { offset: number; start: number; length: number }[] = [];
  let elapsed = 0;
  for (const s of batch.segments) {
    bounds.push({ offset: elapsed, start: s.start, length: s.end - s.start });
    elapsed += s.end - s.start;
  }
  return (batchTime) => {
    for (const b of bounds) {
      if (batchTime <= b.offset + b.length) {
        return absoluteSeconds(b.start + (batchTime - b.offset));
      }
    }
    const last = bounds[bounds.length - 1];
    return absoluteSeconds(last ? last.start + last.length : batchTime);
  };
}

export interface AssignResult {
  byStep: Map<string, string[]>;
  /** The same text, kept per-utterance with its timing rather than joined per step. */
  segments: AttributedSegment[];
  verbatim: number;
  split: number;
  rejected: number;
}

export function assignSegments(response: TranscriptionResponse, batch: Batch, steps: StepWindow[]): AssignResult {
  const toAbsolute = makeToAbsolute(batch);
  const byStep = new Map<string, string[]>();
  const segments: AttributedSegment[] = [];
  const add = (stepId: string, text: string, startSec: number, endSec: number) => {
    if (!text) return;
    const existing = byStep.get(stepId);
    if (existing) existing.push(text);
    else byStep.set(stepId, [text]);
    segments.push({ stepId, rawText: text, startSec, endSec });
  };

  let verbatim = 0;
  let split = 0;
  let rejected = 0;

  for (const segment of response.segments ?? []) {
    if (rejectReason(segment)) {
      rejected += 1;
      continue;
    }
    const start = toAbsolute(segment.start);
    const end = toAbsolute(segment.end);
    const spanned = steps.filter((s) => start < s.to && end > s.from);

    if (spanned.length <= 1) {
      const step = spanned[0] ?? steps.find((s) => start >= s.from && start <= s.to);
      if (step) {
        add(step.stepId, segment.text.trim(), start, end);
        verbatim += 1;
      }
      continue;
    }

    split += 1;
    const grouped = new Map<string, { words: string[]; from: number; to: number }>();
    for (const word of response.words ?? []) {
      if (word.start < segment.start || word.start > segment.end) continue;
      const at = toAbsolute(word.start);
      const step = steps.find((s) => at >= s.from && at <= s.to) ?? spanned[spanned.length - 1];
      const existing = grouped.get(step.stepId);
      if (existing) {
        existing.words.push(word.word.trim());
        existing.to = Math.max(existing.to, at);
      } else {
        grouped.set(step.stepId, { words: [word.word.trim()], from: at, to: at });
      }
    }
    // A split segment's own bounds cover several steps, so each part reports the span of the
    // words that landed in it rather than borrowing the whole segment's timing.
    for (const [stepId, group] of grouped) add(stepId, group.words.join(' ').trim(), group.from, group.to);
  }

  return { byStep, segments, verbatim, split, rejected };
}
