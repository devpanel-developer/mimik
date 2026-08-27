// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { extractDOMContext } from '../context';
import { extractElementMeta } from '../element-meta';
import { buildDisplayToken, classifyField, isSensitiveField, REDACTED_VALUE } from '../sensitive';

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  const el = document.body.querySelector('[data-subject]');
  if (!(el instanceof HTMLElement)) throw new Error('fixture must mark one [data-subject] element');
  return el;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('isSensitiveField', () => {
  it('classifies a password input as secret', () => {
    expect(isSensitiveField(mount('<input data-subject type="password" value="hunter2">'))).toBe(true);
  });

  it('classifies an API key field as secret even when it is a plain text input', () => {
    expect(isSensitiveField(mount('<input data-subject type="text" name="api_key" value="abc123">'))).toBe(true);
  });

  it.each([
    ['name', '<input data-subject type="text" name="access-key" value="v">'],
    ['id', '<input data-subject type="text" id="clientSecret" value="v">'],
    ['placeholder', '<input data-subject type="text" placeholder="Auth token" value="v">'],
    ['aria-label', '<input data-subject type="text" aria-label="Private key" value="v">'],
    ['autocomplete', '<input data-subject type="text" autocomplete="one-time-code" value="v">'],
    ['prefixed autocomplete', '<input data-subject type="text" autocomplete="billing cc-number" value="v">'],
  ])('classifies a field as secret from its %s', (_signal, html) => {
    expect(isSensitiveField(mount(html))).toBe(true);
  });

  it('classifies a field wrapped in a label mentioning a credential as secret', () => {
    expect(isSensitiveField(mount('<label>Admin Password<input data-subject type="text" value="v"></label>'))).toBe(
      true,
    );
  });

  it('honours an explicit data-mimik-sensitive opt-in', () => {
    expect(isSensitiveField(mount('<div data-mimik-sensitive><input data-subject value="v"></div>'))).toBe(true);
  });

  it.each([
    ['GitHub token', 'ghp_abcdefghijklmnopqrstuvwxyz0123456789'],
    ['OpenAI-style key', 'sk-abcdefghijklmnopqrstuvwxyz'],
    ['AWS access key id', 'AKIAIOSFODNN7EXAMPLE'],
    ['JWT', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc'],
  ])('classifies a value shaped like a %s as secret', (_kind, value) => {
    const el = mount('<input data-subject type="text" name="notes">');
    (el as HTMLInputElement).value = value;
    expect(isSensitiveField(el)).toBe(true);
  });

  it.each([
    ['email', '<input data-subject type="email" name="email" value="a@b.com">'],
    ['full name', '<input data-subject type="text" name="full_name" value="Ada">'],
    ['search', '<input data-subject type="search" name="q" value="clone">'],
    ['textarea', '<textarea data-subject name="notes">some notes</textarea>'],
  ])('leaves an ordinary %s field public', (_kind, html) => {
    expect(isSensitiveField(mount(html))).toBe(false);
  });

  it('does not treat lookalike wording as a credential', () => {
    expect(isSensitiveField(mount('<input data-subject type="text" name="pinned_items" value="v">'))).toBe(false);
    expect(isSensitiveField(mount('<input data-subject type="text" name="secretary" value="v">'))).toBe(false);
  });
});

describe('classifyField', () => {
  it('never returns the literal value of a secret field', () => {
    const field = classifyField(
      mount('<input data-subject type="password" aria-label="Admin Password" value="s3cr3t">'),
    );
    expect(field.classification).toBe('secret');
    expect(field.value).toBeNull();
    expect(field.displayToken).toBe('<ADMIN_PASSWORD>');
    expect(JSON.stringify(field)).not.toContain('s3cr3t');
  });

  it('returns the literal value of a public field', () => {
    const field = classifyField(mount('<input data-subject type="email" aria-label="Email" value="a@b.com">'));
    expect(field).toEqual({ classification: 'public', value: 'a@b.com', displayToken: null });
  });

  it('redacts a secret contenteditable', () => {
    const el = mount('<div data-subject contenteditable="true" aria-label="API Key">ghp_live</div>');
    const field = classifyField(el);
    expect(field.classification).toBe('secret');
    expect(field.value).toBeNull();
  });
});

describe('buildDisplayToken', () => {
  it.each([
    ['Admin Password', '<ADMIN_PASSWORD>'],
    ['API Key', '<API_KEY>'],
    ['  spaced  out  ', '<SPACED_OUT>'],
    ['', '<SECRET>'],
    [null, '<SECRET>'],
    ['!!!', '<SECRET>'],
  ])('turns %s into %s', (label, expected) => {
    expect(buildDisplayToken(label)).toBe(expected);
  });
});

describe('extractDOMContext', () => {
  it('redacts a secret sibling value instead of sending it to a model', () => {
    document.body.innerHTML = `
      <form>
        <input type="email" name="email" value="a@b.com">
        <input id="subject" type="password" name="password" value="hunter2">
      </form>`;
    const target = document.getElementById('subject') as HTMLElement;
    const context = JSON.stringify(extractDOMContext(target, 'input'));
    expect(context).not.toContain('hunter2');
    expect(context).toContain(REDACTED_VALUE);
  });

  it('redacts an API-key text field, which the old password-only check missed', () => {
    document.body.innerHTML = `
      <form>
        <input id="subject" type="text" name="api_key" value="ghp_shouldnotleak">
      </form>`;
    const target = document.getElementById('subject') as HTMLElement;
    const context = JSON.stringify(extractDOMContext(target, 'input'));
    expect(context).not.toContain('ghp_shouldnotleak');
    expect(context).toContain(REDACTED_VALUE);
  });

  it('still reports ordinary values', () => {
    document.body.innerHTML = `<form><input id="subject" type="email" name="email" value="a@b.com"></form>`;
    const target = document.getElementById('subject') as HTMLElement;
    expect(JSON.stringify(extractDOMContext(target, 'input'))).toContain('a@b.com');
  });
});

describe('contenteditable secrets do not leak through metadata', () => {
  it('keeps a secret out of element metadata textContent', () => {
    const el = mount('<div data-subject contenteditable="true" aria-label="Client Secret">cs_live_leak</div>');
    const meta = extractElementMeta(el);
    expect(meta.textContent).toBeNull();
    expect(JSON.stringify(meta)).not.toContain('cs_live_leak');
  });

  it('keeps a secret out of the accessible name sent to a model', () => {
    document.body.innerHTML =
      '<form><div id="subject" contenteditable="true" aria-label="API Key">ghp_leakvalue</div></form>';
    const target = document.getElementById('subject') as HTMLElement;
    expect(JSON.stringify(extractDOMContext(target, 'input'))).not.toContain('ghp_leakvalue');
  });

  it('still records the text of an ordinary contenteditable', () => {
    const el = mount('<div data-subject contenteditable="true" aria-label="Bio">writes software</div>');
    expect(extractElementMeta(el).textContent).toContain('writes software');
  });
});
