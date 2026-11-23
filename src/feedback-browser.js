/**
 * Browser build of src/feedback.js — attaches window.GRADECRAFT_FEEDBACK.
 */
(function (global) {
  'use strict';

  function escapeCssIdent(value) {
    const s = String(value || '');
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(s);
    }
    return s.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
  }

  function cssPath(el, opts) {
    opts = opts || {};
    const maxDepth = Math.max(1, Number(opts.maxDepth) || 6);
    if (!el || el.nodeType !== 1) return '';

    const parts = [];
    let node = el;
    let depth = 0;
    while (node && node.nodeType === 1 && depth < maxDepth) {
      if (node.id) {
        parts.unshift('#' + escapeCssIdent(node.id));
        break;
      }
      const tag = String(node.tagName || '').toLowerCase() || 'node';
      let part = tag;
      const cls = typeof node.className === 'string'
        ? node.className.trim().split(/\s+/).filter(Boolean).slice(0, 2)
        : [];
      if (cls.length) {
        part += cls.map(function (c) { return '.' + escapeCssIdent(c); }).join('');
      }
      const parent = node.parentElement;
      if (parent) {
        const siblings = Array.prototype.filter.call(parent.children, function (c) {
          return c.tagName === node.tagName;
        });
        if (siblings.length > 1) {
          const idx = siblings.indexOf(node) + 1;
          part += ':nth-of-type(' + idx + ')';
        }
      }
      parts.unshift(part);
      node = parent;
      depth += 1;
    }
    return parts.join(' > ');
  }

  function describeElement(el) {
    if (!el || el.nodeType !== 1) {
      return { label: 'Nothing selected', path: '', tag: '', id: '', text: '' };
    }
    const tag = String(el.tagName || '').toLowerCase();
    const id = el.id ? '#' + el.id : '';
    const aria = (el.getAttribute && el.getAttribute('aria-label')) || '';
    const title = (el.getAttribute && el.getAttribute('title')) || '';
    const rawText = String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    const text = rawText.slice(0, 80);
    const label = aria || title || (text
      ? tag + id + ' — “' + text + (rawText.length > 80 ? '…' : '') + '”'
      : tag + (id || ''));
    return {
      label: label,
      path: cssPath(el),
      tag: tag,
      id: el.id || '',
      text: text
    };
  }

  function buildFeedbackPayload(input) {
    input = input || {};
    const message = String(input.message || '').trim().slice(0, 500);
    const element = input.element && typeof input.element === 'object'
      ? {
        label: String(input.element.label || ''),
        path: String(input.element.path || ''),
        tag: String(input.element.tag || ''),
        id: String(input.element.id || ''),
        text: String(input.element.text || '')
      }
      : null;

    return {
      type: 'gradecraft-feedback',
      version: 1,
      at: input.at || new Date().toISOString(),
      message: message,
      element: element,
      context: {
        pageUrl: String(input.pageUrl || ''),
        view: String(input.view || ''),
        theme: String(input.theme || ''),
        userAgent: String(input.userAgent || '')
      }
    };
  }

  function toFeedbackCloudDoc(payload, author) {
    const base = buildFeedbackPayload(payload || {});
    const uid = String((author && author.uid) || '');
    return {
      type: 'gradecraft-feedback',
      version: Number(base.version) || 1,
      at: base.at,
      createdAt: base.at,
      uid: uid,
      email: String((author && author.email) || ''),
      message: base.message,
      element: base.element
        ? {
          label: base.element.label,
          path: base.element.path,
          tag: base.element.tag,
          id: base.element.id,
          text: base.element.text
        }
        : null,
      context: {
        pageUrl: base.context.pageUrl,
        view: base.context.view,
        theme: base.context.theme,
        userAgent: base.context.userAgent
      }
    };
  }

  function formatFeedbackText(payload) {
    const lines = [
      'GradeCraft feedback',
      'When: ' + (payload && payload.at || ''),
      'View: ' + (payload && payload.context && payload.context.view || '—'),
      'Page: ' + (payload && payload.context && payload.context.pageUrl || '—'),
      'Theme: ' + (payload && payload.context && payload.context.theme || '—'),
      '',
      'Message: ' + (payload && payload.message || '(empty)'),
      ''
    ];
    if (payload && payload.element) {
      lines.push(
        'Element: ' + (payload.element.label || '—'),
        'Path: ' + (payload.element.path || '—'),
        'Tag: ' + (payload.element.tag || '—') + (payload.element.id ? ' #' + payload.element.id : '')
      );
    } else {
      lines.push('Element: (none selected)');
    }
    return lines.join('\n');
  }

  function isFeedbackUiElement(el) {
    if (!el || typeof el.closest !== 'function') return false;
    return !!(
      el.closest('#feedbackModalBackdrop')
      || el.closest('#feedbackPickBanner')
      || el.closest('#toastContainer')
      || el.closest('[data-feedback-ignore="true"]')
    );
  }

  global.GRADECRAFT_FEEDBACK = {
    cssPath: cssPath,
    describeElement: describeElement,
    buildFeedbackPayload: buildFeedbackPayload,
    toFeedbackCloudDoc: toFeedbackCloudDoc,
    formatFeedbackText: formatFeedbackText,
    isFeedbackUiElement: isFeedbackUiElement
  };
})(typeof window !== 'undefined' ? window : globalThis);
