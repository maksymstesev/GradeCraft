import { describe, it, expect } from 'vitest';
import {
  cssPath,
  describeElement,
  buildFeedbackPayload,
  toFeedbackCloudDoc,
  formatFeedbackText,
  isFeedbackUiElement
} from '../../src/feedback.js';

function makeEl({ tag = 'div', id = '', className = '', text = '', parent = null, siblings = null } = {}) {
  const el = {
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    id,
    className,
    innerText: text,
    textContent: text,
    parentElement: parent,
    getAttribute(name) {
      if (name === 'aria-label') return this._aria || '';
      if (name === 'title') return this._title || '';
      return null;
    },
    closest() {
      return null;
    }
  };
  if (parent) {
    const kids = siblings || [el];
    parent.children = kids;
  }
  return el;
}

describe('cssPath / describeElement', () => {
  it('prefers id in the path', () => {
    const btn = makeEl({ tag: 'button', id: 'btnSave', text: 'Save' });
    expect(cssPath(btn)).toBe('#btnSave');
    expect(describeElement(btn).label).toContain('button#btnSave');
  });

  it('returns empty path for null', () => {
    expect(cssPath(null)).toBe('');
    expect(describeElement(null).label).toBe('Nothing selected');
  });

  it('builds a class + nth-of-type path without id', () => {
    const parent = makeEl({ tag: 'section' });
    const a = makeEl({ tag: 'button', className: 'theme-btn-secondary', parent, siblings: [] });
    const b = makeEl({ tag: 'button', className: 'theme-btn-secondary', parent, siblings: [] });
    parent.children = [a, b];
    a.parentElement = parent;
    b.parentElement = parent;
    expect(cssPath(b)).toContain('button.theme-btn-secondary:nth-of-type(2)');
  });
});

describe('buildFeedbackPayload / formatFeedbackText', () => {
  it('trims and caps the message', () => {
    const payload = buildFeedbackPayload({
      message: '  broken layout  ',
      element: { label: 'nav', path: 'header > nav', tag: 'nav', id: '', text: '' },
      pageUrl: 'https://example.test/#/gpa',
      view: 'gpa',
      theme: 'black',
      at: '2026-11-22T00:00:00.000Z'
    });
    expect(payload.type).toBe('gradecraft-feedback');
    expect(payload.message).toBe('broken layout');
    expect(payload.element.path).toBe('header > nav');
    const text = formatFeedbackText(payload);
    expect(text).toContain('Message: broken layout');
    expect(text).toContain('Path: header > nav');
  });

  it('allows feedback without an element', () => {
    const payload = buildFeedbackPayload({ message: 'general note' });
    expect(payload.element).toBeNull();
    expect(formatFeedbackText(payload)).toContain('Element: (none selected)');
  });

  it('builds a Firestore feedback doc separate from user sync', () => {
    const payload = buildFeedbackPayload({
      message: 'layout bug',
      element: { label: 'nav', path: 'header > nav', tag: 'nav', id: '', text: '' },
      at: '2026-11-22T00:00:00.000Z'
    });
    const doc = toFeedbackCloudDoc(payload, { uid: 'user_1', email: 'a@b.test' });
    expect(doc.type).toBe('gradecraft-feedback');
    expect(doc.uid).toBe('user_1');
    expect(doc.email).toBe('a@b.test');
    expect(doc.createdAt).toBe('2026-11-22T00:00:00.000Z');
    expect(doc.message).toBe('layout bug');
    expect(doc.element.path).toBe('header > nav');
  });
});

describe('isFeedbackUiElement', () => {
  it('detects feedback chrome via closest', () => {
    const btn = makeEl({ tag: 'button' });
    btn.closest = (sel) => (sel === '#feedbackModalBackdrop' ? btn : null);
    expect(isFeedbackUiElement(btn)).toBe(true);
    expect(isFeedbackUiElement(makeEl({ tag: 'div' }))).toBe(false);
  });
});
