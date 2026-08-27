/**
 * Sensitive input classification.
 *
 * Capture must never persist, export, or transmit a literal secret. This module is the single
 * decision point for "is this field's value safe to record?", so every capture path (step
 * descriptions, inputValue persistence, DOM context sent to a model) reaches the same verdict.
 *
 * Classification is deliberately deterministic — it inspects the element, never a model.
 */

import { getFieldLabel, getFieldValue } from './element-utils';

export type InputClassification = 'public' | 'secret';

export interface ClassifiedField {
  classification: InputClassification;
  /** The literal value, or null whenever the field is classified secret. */
  value: string | null;
  /** Stand-in shown wherever a secret value would otherwise appear, e.g. `<ADMIN_PASSWORD>`. */
  displayToken: string | null;
}

/** Opt-in marker a host application can put on any element to force secret handling. */
export const SENSITIVE_ATTR = 'data-mimik-sensitive';

/** Generic stand-in used when a field has no usable label. */
export const GENERIC_SECRET_TOKEN = '<SECRET>';

/** Redaction marker used in DOM context handed to a model. */
export const REDACTED_VALUE = '***';

/**
 * Label/name/id/placeholder wording that implies a credential. Bounded on both sides so
 * "pin" does not match "pinned" and "secret" does not match "secretary".
 */
const SECRET_NAME_PATTERN =
  /(?:^|[^a-z])(?:pass(?:word|wd|phrase)?|pwd|secret|token|api[\s._-]*key|apikey|access[\s._-]*key|private[\s._-]*key|client[\s._-]*secret|credential|bearer|otp|mfa|2fa|totp|cvv|cvc|ssn|pin)(?:[^a-z]|$)/i;

/** autocomplete values the HTML spec reserves for credentials. */
const SECRET_AUTOCOMPLETE = new Set(['current-password', 'new-password', 'one-time-code', 'cc-number', 'cc-csc']);

/**
 * High-precision credential shapes. Deliberately narrow: a false positive only costs one
 * unrecorded value, but these must not fire on ordinary prose.
 */
const SECRET_VALUE_PATTERNS: readonly RegExp[] = [
  /^gh[pousr]_[A-Za-z0-9]{16,}$/, // GitHub token
  /^github_pat_[A-Za-z0-9_]{20,}$/, // GitHub fine-grained PAT
  /^sk-[A-Za-z0-9-]{16,}$/, // OpenAI / Anthropic style key
  /^glpat-[A-Za-z0-9_-]{16,}$/, // GitLab PAT
  /^xox[baprs]-[A-Za-z0-9-]{10,}$/, // Slack token
  /^(?:AKIA|ASIA)[A-Z0-9]{16}$/, // AWS access key id
  /^AIza[A-Za-z0-9_-]{30,}$/, // Google API key
  /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/, // JWT
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, // PEM private key
];

function matchesSecretWording(...values: readonly (string | null | undefined)[]): boolean {
  return values.some((value) => !!value && SECRET_NAME_PATTERN.test(value));
}

function hasSecretShape(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * True when the element's value must never be recorded.
 *
 * Checked in order of confidence: explicit host opt-in, input type, autocomplete contract,
 * surrounding wording, then the shape of the value itself.
 */
export function isSensitiveField(el: Element): boolean {
  if (el.closest(`[${SENSITIVE_ATTR}]`)) return true;

  if (el instanceof HTMLInputElement && el.type === 'password') return true;

  const autocomplete = el.getAttribute('autocomplete');
  if (autocomplete) {
    // autocomplete can carry section/billing prefixes: "section-a billing cc-number".
    const tokens = autocomplete.toLowerCase().split(/\s+/);
    if (tokens.some((token) => SECRET_AUTOCOMPLETE.has(token))) return true;
  }

  if (
    matchesSecretWording(
      el.getAttribute('name'),
      el.getAttribute('id'),
      el.getAttribute('placeholder'),
      el.getAttribute('aria-label'),
      el.getAttribute('data-testid'),
    )
  ) {
    return true;
  }

  if (el instanceof HTMLElement && matchesSecretWording(getFieldLabel(el))) return true;

  if (el instanceof HTMLElement && hasSecretShape(getFieldValue(el))) return true;

  return false;
}

/**
 * Turn a field label into a stable placeholder, e.g. "Admin Password" -> `<ADMIN_PASSWORD>`.
 * Falls back to a generic token when the label carries no usable characters.
 */
export function buildDisplayToken(label: string | null | undefined): string {
  const slug = (label ?? '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
    .slice(0, 40)
    .replace(/_+$/, '');
  return slug ? `<${slug}>` : GENERIC_SECRET_TOKEN;
}

/**
 * Classify a field and return only what is safe to keep.
 *
 * A secret field yields `value: null` — there is no code path that hands back the literal.
 */
export function classifyField(el: HTMLElement): ClassifiedField {
  if (isSensitiveField(el)) {
    return {
      classification: 'secret',
      value: null,
      displayToken: buildDisplayToken(getFieldLabel(el)),
    };
  }
  return { classification: 'public', value: getFieldValue(el), displayToken: null };
}

/**
 * Value to show for an element inside DOM context handed to a model.
 * Returns null when the element holds nothing worth reporting.
 */
export function safeContextValue(el: Element): string | null {
  if (!(el instanceof HTMLElement)) return null;
  if (isSensitiveField(el)) return REDACTED_VALUE;
  return null;
}
