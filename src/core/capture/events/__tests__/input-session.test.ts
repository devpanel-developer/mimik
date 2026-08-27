// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMessage = vi.fn();
vi.mock('@/lib/messaging', () => ({ sendMessage: (...args: unknown[]) => sendMessage(...args) }));

import { InputSession } from '../input-session';

interface UpdatePayload {
  stepId: string;
  description: string;
  inputValue?: string;
  inputClassification?: string;
}

/** Drive a real InputSession over a field and return the persisted update payload. */
async function captureUpdate(html: string, value: string): Promise<UpdatePayload> {
  document.body.innerHTML = html;
  const target = document.body.querySelector('[data-subject]') as HTMLElement;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) target.value = value;
  else target.textContent = value;

  const session = new InputSession('guide-1');
  await session.start(target);
  session.update(target);

  const call = sendMessage.mock.calls.find(([name]) => name === 'updateInputStep');
  if (!call) throw new Error('no updateInputStep message was sent');
  return call[1] as UpdatePayload;
}

beforeEach(() => {
  sendMessage.mockReset();
  sendMessage.mockResolvedValue({ stepId: 'step-1' });
  document.body.innerHTML = '';
});

describe('InputSession secret handling', () => {
  it.each([
    ['password input', '<input data-subject type="password" aria-label="Password">', 'hunter2'],
    ['API key field', '<input data-subject type="text" name="api_key" aria-label="API Key">', 'ghp_realtoken'],
    ['token field', '<input data-subject type="text" name="access_token" aria-label="Access Token">', 'tok_abc123'],
    [
      'secret textarea',
      '<textarea data-subject name="private_key" aria-label="Private Key"></textarea>',
      '-----BEGIN RSA PRIVATE KEY-----abc',
    ],
    [
      'secret contenteditable',
      '<div data-subject contenteditable="true" aria-label="Client Secret"></div>',
      'cs_livesecret',
    ],
  ])('never persists the value of a %s', async (_kind, html, secret) => {
    const payload = await captureUpdate(html, secret);

    expect(payload.inputValue).toBeUndefined();
    expect(payload.inputClassification).toBe('secret');
    expect(payload.description).not.toContain(secret);
    expect(JSON.stringify(payload)).not.toContain(secret);
  });

  it('describes a secret with a placeholder token instead of the value', async () => {
    const payload = await captureUpdate('<input data-subject type="password" aria-label="Admin Password">', 's3cr3t');
    expect(payload.description).toBe('Type <ADMIN_PASSWORD> in Admin Password');
  });

  it('sends no secret anywhere in the whole message stream', async () => {
    await captureUpdate('<input data-subject type="password" aria-label="Password">', 'hunter2');
    expect(JSON.stringify(sendMessage.mock.calls)).not.toContain('hunter2');
  });

  it.each([
    ['email', '<input data-subject type="email" aria-label="Email">', 'ada@example.com'],
    ['name', '<input data-subject type="text" name="full_name" aria-label="Full name">', 'Ada Lovelace'],
    ['notes textarea', '<textarea data-subject name="notes" aria-label="Notes"></textarea>', 'some notes'],
    ['contenteditable bio', '<div data-subject contenteditable="true" aria-label="Bio"></div>', 'writes software'],
  ])('still records an ordinary %s field', async (_kind, html, value) => {
    const payload = await captureUpdate(html, value);

    expect(payload.inputValue).toBe(value);
    expect(payload.inputClassification).toBe('public');
    expect(payload.description).toContain(value);
  });

  it('reports a cleared public field without inventing a value', async () => {
    const payload = await captureUpdate('<input data-subject type="email" aria-label="Email">', '');
    expect(payload.inputValue).toBeUndefined();
    expect(payload.description).toBe('Clear Email');
  });
});
