// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/messaging', () => ({ sendMessage: vi.fn().mockResolvedValue(undefined) }));

import type { Step } from '@/core/guides/types';
import { GuideMeController } from '../content';

function makeStep(overrides: Partial<Step>): Step {
  return {
    id: 'step-1',
    guideId: 'guide-1',
    index: 0,
    description: 'Type <PASSWORD> in Password',
    action: 'input',
    url: 'https://example.invalid/login',
    timestamp: 0,
    ...overrides,
  } as Step;
}

/** setupActionDetection is private; the replay behaviour it guards is what matters here. */
function setupActionDetection(controller: GuideMeController, step: Step, target: HTMLElement) {
  (controller as unknown as { setupActionDetection: (s: Step, t: HTMLElement) => void }).setupActionDetection(
    step,
    target,
  );
}

let controller: GuideMeController;

beforeEach(() => {
  document.body.innerHTML = '';
  controller = new GuideMeController();
});

describe('Guide Me secret handling', () => {
  it('does not fill a field for a step classified secret', () => {
    document.body.innerHTML = '<input id="pw" type="password">';
    const target = document.getElementById('pw') as HTMLInputElement;

    setupActionDetection(controller, makeStep({ inputClassification: 'secret' }), target);

    expect(target.value).toBe('');
  });

  it('does not fill a field even if a stale inputValue somehow survived on a secret step', () => {
    document.body.innerHTML = '<input id="pw" type="password">';
    const target = document.getElementById('pw') as HTMLInputElement;

    setupActionDetection(controller, makeStep({ inputClassification: 'secret', inputValue: 'leaked-secret' }), target);

    expect(target.value).toBe('');
    expect(document.body.innerHTML).not.toContain('leaked-secret');
  });

  it('waits for the reader to type their own value before advancing', async () => {
    const { sendMessage } = await import('@/lib/messaging');
    document.body.innerHTML = '<input id="pw" type="password">';
    const target = document.getElementById('pw') as HTMLInputElement;

    setupActionDetection(controller, makeStep({ inputClassification: 'secret' }), target);
    expect(sendMessage).not.toHaveBeenCalledWith('guideMeStepCompleted', expect.anything());

    target.value = 'my-own-password';
    target.dispatchEvent(new Event('input', { bubbles: true }));

    expect(sendMessage).toHaveBeenCalledWith('guideMeStepCompleted', { stepIndex: -1 });
  });

  it('still replays an ordinary recorded value', () => {
    document.body.innerHTML = '<input id="email" type="email">';
    const target = document.getElementById('email') as HTMLInputElement;

    setupActionDetection(
      controller,
      makeStep({ inputClassification: 'public', inputValue: 'ada@example.com' }),
      target,
    );

    expect(target.value).toBe('ada@example.com');
  });
});
