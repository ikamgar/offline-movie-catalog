'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('js/utils/text.js — normalizeFa', () => {
  let text;

  it('loads ES module via dynamic import', async () => {
    text = await import('../../js/utils/text.js');
  });

  const n = (...args) => text.normalizeFa(...args);

  describe('D1 — Yeh variants → Persian Yeh (U+06CC)', () => {
    it('Arabic Yeh ي (U+064A) → Persian Yeh', () => {
      assert.equal(n('علي'), 'علی');
    });
    it('Persian Yeh ی stays Persian Yeh', () => {
      assert.equal(n('علی'), 'علی');
    });
    it('Alef Maksura ى (U+0649) → Persian Yeh', () => {
      assert.equal(n('موسى'), 'موسی');
    });
    it('Alef Maksura at word end (على) → علی', () => {
      assert.equal(n('على'), 'علی');
    });
    it('both directions: Arabic-typed query equals Persian-stored title', () => {
      assert.equal(n('علي'), n('علی'));
      assert.equal(n('جمالى'), n('جمالی'));
    });
  });

  describe('D1 — Kaf variants → Persian Keheh (U+06A9)', () => {
    it('Arabic Kaf ك (U+0643) → Persian Keheh', () => {
      assert.equal(n('كتاب'), 'کتاب');
    });
    it('Persian Keheh ک stays', () => {
      assert.equal(n('کتاب'), 'کتاب');
    });
    it('both directions: Arabic-typed کمدی equals Persian-stored کمدی', () => {
      assert.equal(n('كمدي'), n('کمدی'));
    });
    it('mixed variant query still equals stored title', () => {
      // query: Persian Kaf + Arabic Yeh; stored: Arabic Kaf + Persian Yeh
      assert.equal(n('کمي'), n('كمی'));
    });
  });

  describe('D1 — digits → ASCII', () => {
    it('Persian digits ۰-۹ (U+06F0–06F9) → ASCII', () => {
      assert.equal(n('۲۰۲۰'), '2020');
      assert.equal(n('۰۱۲۳۴۵۶۷۸۹'), '0123456789');
    });
    it('Arabic-Indic digits ٠-٩ (U+0660–0669) → ASCII', () => {
      assert.equal(n('٢٠٢٠'), '2020');
      assert.equal(n('٠١٢٣٤٥٦٧٨٩'), '0123456789');
    });
    it('ASCII digits unchanged', () => {
      assert.equal(n('2020'), '2020');
    });
    it('۲۰۲۰ equals 2020 (Persian-digit query finds ASCII year)', () => {
      assert.equal(n('۲۰۲۰'), n('2020'));
      assert.equal(n('۱۴۰۲'), n('1402'));
    });
    it('mixed digits inside a word', () => {
      assert.equal(n('قسمت ۲'), 'قسمت 2');
      assert.equal(n('قسمت ٢'), 'قسمت 2');
    });
  });

  describe('D1 — tatweel and diacritics removed', () => {
    it('tatweel U+0640 removed', () => {
      assert.equal(n('کتـاب'), 'کتاب');
      assert.equal(n('ـ'), '');
    });
    it('fatha/shadda/kasra removed (U+064B–U+065F)', () => {
      assert.equal(n('مُحَمَّد'), 'محمد');
      assert.equal(n('سَلام'), 'سلام');
      assert.equal(n('بِ'), 'ب');
    });
    it('superscript alef U+0670 removed', () => {
      assert.equal(n('مٰد'), 'مد');
    });
    it('diacritics do not block matching', () => {
      assert.equal(n('مُحَمَّد'), n('محمد'));
    });
  });

  describe('D1 — ZWNJ removed for matching (display untouched elsewhere)', () => {
    it('ZWNJ U+200C removed', () => {
      assert.equal(n('می‌خواهم'), 'میخواهم');
    });
    it('ZWNJ variant equals no-ZWNJ form', () => {
      assert.equal(n('می‌خواهم'), n('میخواهم'));
    });
    it('ZWNJ in possessive خانه‌ی equals خانهی', () => {
      assert.equal(n('خانه‌ی'), n('خانهی'));
    });
  });

  describe('D1 — Latin lowercasing', () => {
    it('upper → lower', () => {
      assert.equal(n('Inception'), 'inception');
      assert.equal(n('HEAT'), 'heat');
    });
    it('mixed Persian/Latin', () => {
      assert.equal(n('Movie 5'), 'movie 5');
      assert.equal(n('سریال Breaking Bad'), 'سریال breaking bad');
    });
  });

  describe('D1 — whitespace collapse', () => {
    it('collapses runs and trims', () => {
      assert.equal(n('  dark   knight '), 'dark knight');
    });
    it('tabs and newlines count as whitespace', () => {
      assert.equal(n('a\t\nb'), 'a b');
    });
    it('empty string returns empty', () => {
      assert.equal(n(''), '');
    });
  });

  describe('D1 — null/undefined safety', () => {
    it('null → empty string (never "null")', () => {
      assert.equal(n(null), '');
    });
    it('undefined → empty string (never "undefined")', () => {
      assert.equal(n(undefined), '');
    });
    it('never produces the literal text "null"', () => {
      assert.equal(n(null).includes('null'), false);
    });
  });

  describe('D1 — NFKC compatibility normalisation', () => {
    it('ligature ﬁ → fi', () => {
      assert.equal(n('ﬁ'), 'fi');
    });
    it('fullwidth Latin Ａ → a', () => {
      assert.equal(n('Ａ'), 'a');
    });
    it('circled digit ① → 1', () => {
      assert.equal(n('①'), '1');
    });
  });

  describe('D1 — composition & idempotence', () => {
    it('all rules combined', () => {
      assert.equal(n('  علي ۲۰۲۰  مكتـبهٌ '), 'علی 2020 مکتبه');
      assert.equal(n('مكتـبه'), n('مکتبه'));
    });
    it('is idempotent: f(f(x)) === f(x)', () => {
      const samples = ['علي ۲۰۲۰ می‌خواهم', 'Inception  ﬁ', 'سَلامِ جهان'];
      for (const s of samples) {
        assert.equal(n(n(s)), n(s), `idempotence failed for: ${s}`);
      }
    });
    it('handles numeric input without throwing', () => {
      assert.equal(n(2020), '2020');
    });
  });

  describe('AC1 — end-to-end acceptance phrases', () => {
    it('query typed with Arabic letters finds title stored with Persian letters (and vice versa)', () => {
      const stored = n('کمدی');
      assert.equal(n('كمدي'), stored);
      const storedArabic = n('كمدي');
      assert.equal(n('کمدی'), storedArabic);
    });
    it('Persian digits match ASCII years', () => {
      assert.equal(n('۲۰۲۰'), n('2020'));
    });
    it('ZWNJ query matches no-ZWNJ title', () => {
      assert.equal(n('می‌خواهم'), n('میخواهم'));
    });
  });
});
