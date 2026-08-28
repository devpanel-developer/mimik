import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  globalThis.BroadcastChannel = class {
    postMessage() {}
    addEventListener() {}
    removeEventListener() {}
    close() {}
    onmessage = null;
    onmessageerror = null;
    dispatchEvent() {
      return true;
    }
  } as unknown as typeof BroadcastChannel;
});

import { db } from '@/core/guides/db';
import { handleUpdateInputStep } from '../step-pipeline';

const SECRET = 'hunter2-do-not-store';

async function seedStep(overrides: Record<string, unknown> = {}) {
  await db.steps.put({
    id: 'step-1',
    guideId: 'guide-1',
    index: 0,
    description: 'placeholder',
    action: 'input',
    url: 'https://example.invalid/login',
    timestamp: Date.now(),
    ...overrides,
  } as never);
}

beforeEach(async () => {
  await db.steps.clear();
});

describe('handleUpdateInputStep', () => {
  it('stores no inputValue for a secret field', async () => {
    await seedStep();
    await handleUpdateInputStep('step-1', 'Type <PASSWORD> in Password', undefined, 'secret');

    const step = await db.steps.get('step-1');
    expect(step?.inputValue).toBeUndefined();
    expect(step?.inputClassification).toBe('secret');
    expect(step?.description).toBe('Type <PASSWORD> in Password');
  });

  it('clears a value already stored on the step when the field turns out to be secret', async () => {
    // A reveal-password toggle can reclassify a field mid-entry; the earlier value must not survive.
    await seedStep({ inputValue: SECRET, inputClassification: 'public' });
    await handleUpdateInputStep('step-1', 'Type <PASSWORD> in Password', undefined, 'secret');

    const step = await db.steps.get('step-1');
    expect(step?.inputValue).toBeUndefined();
    expect(JSON.stringify(step)).not.toContain(SECRET);
  });

  it('refuses to store a literal even if one is passed alongside a secret classification', async () => {
    await seedStep();
    await handleUpdateInputStep('step-1', 'Type <PASSWORD> in Password', SECRET, 'secret');

    const step = await db.steps.get('step-1');
    expect(step?.inputValue).toBeUndefined();
    expect(JSON.stringify(step)).not.toContain(SECRET);
  });

  it('leaves no secret anywhere in the steps table', async () => {
    await seedStep({ inputValue: SECRET });
    await handleUpdateInputStep('step-1', 'Type <PASSWORD> in Password', SECRET, 'secret');

    expect(JSON.stringify(await db.steps.toArray())).not.toContain(SECRET);
  });

  it('stores the display token so the placeholder survives beyond the description', async () => {
    await seedStep();
    await handleUpdateInputStep(
      'step-1',
      'Type <ADMIN_PASSWORD> in Admin Password',
      undefined,
      'secret',
      '<ADMIN_PASSWORD>',
    );

    const step = await db.steps.get('step-1');
    expect(step?.inputDisplayToken).toBe('<ADMIN_PASSWORD>');
    expect(step?.inputValue).toBeUndefined();
  });

  it('still stores an ordinary value', async () => {
    await seedStep();
    await handleUpdateInputStep('step-1', 'Type "ada@example.com" in Email', 'ada@example.com', 'public');

    const step = await db.steps.get('step-1');
    expect(step?.inputValue).toBe('ada@example.com');
    expect(step?.inputClassification).toBe('public');
  });
});
