'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('js/utils/sort.js', () => {
  let sort;

  it('loads ES module via dynamic import', async () => {
    sort = await import('../../js/utils/sort.js');
  });

  describe('compareMovie — Year DESC then ID DESC', () => {
    it('sorts by year descending', () => {
      const a = { type: 'Movie', id: '0001', year: 2020 };
      const b = { type: 'Movie', id: '0002', year: 2010 };
      assert.ok(sort.compareMovie(a, b) < 0);
    });

    it('sorts by ID descending when years are equal', () => {
      const a = { type: 'Movie', id: '0001', year: 2020 };
      const b = { type: 'Movie', id: '0005', year: 2020 };
      assert.ok(sort.compareMovie(a, b) > 0);
    });

    it('treats missing year as 0', () => {
      const a = { type: 'Movie', id: '0001', year: null };
      const b = { type: 'Movie', id: '0002', year: 2020 };
      assert.ok(sort.compareMovie(a, b) > 0);
    });
  });

  describe('compareIranian — ID DESC (year ignored)', () => {
    it('sorts by ID descending', () => {
      const a = { type: 'Iranian', id: '0001', year: 2020 };
      const b = { type: 'Iranian', id: '0005', year: 2010 };
      assert.ok(sort.compareIranian(a, b) > 0);
    });

    it('ignores year differences', () => {
      const a = { type: 'Iranian', id: '0001', year: 2020 };
      const b = { type: 'Iranian', id: '0001', year: 2010 };
      assert.equal(sort.compareIranian(a, b), 0);
    });
  });

  describe('compareSeries — alphabetical, ignoring articles', () => {
    it('sorts alphabetically by title', () => {
      const a = { type: 'Series', title: 'Breaking Bad' };
      const b = { type: 'Series', title: 'Dexter' };
      assert.ok(sort.compareSeries(a, b) < 0);
      assert.ok(sort.compareSeries(b, a) > 0);
    });

    it('ignores "The" at the start in both directions', () => {
      const a = { type: 'Series', title: 'The Boys' };
      const b = { type: 'Series', title: 'Better Call Saul' };
      // "boys" vs "better call saul" → boys > better
      assert.ok(sort.compareSeries(a, b) > 0);
      assert.ok(sort.compareSeries(b, a) < 0);
    });

    it('ignores "A" and "An" at the start in both directions', () => {
      const quiet = { type: 'Series', title: 'A Quiet Place' };
      const breaking = { type: 'Series', title: 'Breaking Bad' };
      // "quiet place" vs "breaking bad" → quiet > breaking
      assert.ok(sort.compareSeries(quiet, breaking) > 0);
      assert.ok(sort.compareSeries(breaking, quiet) < 0);

      const edu = { type: 'Series', title: 'An Education' };
      const dark = { type: 'Series', title: 'Dark' };
      // "education" vs "dark" → education > dark
      assert.ok(sort.compareSeries(edu, dark) > 0);
      assert.ok(sort.compareSeries(dark, edu) < 0);
    });

    it('ignores Persian "یک " at the start in both directions (sorts by remainder)', () => {
      // In Persian, 'ر' (rooz) < 'ش' (shab), but unstripped 'ی' (yek) > 'ش'
      const yekRooz = { type: 'Series', title: 'یک روز' };
      const shab = { type: 'Series', title: 'شب' };
      assert.ok(sort.compareSeries(yekRooz, shab) < 0, 'یک روز sorts by روز, which precedes شب');
      assert.ok(sort.compareSeries(shab, yekRooz) > 0, 'reverse direction: شب succeeds یک روز');
    });

    it('ignores Persian "آن " at the start in both directions (sorts by remainder)', () => {
      // In Persian, 'ش' (shab) > 'ب' (baran), but unstripped 'آن' < 'ب'
      const anShab = { type: 'Series', title: 'آن شب' };
      const baran = { type: 'Series', title: 'باران' };
      assert.ok(sort.compareSeries(anShab, baran) > 0, 'آن شب sorts by شب, which succeeds باران');
      assert.ok(sort.compareSeries(baran, anShab) < 0, 'reverse direction: باران precedes آن شب');
    });
  });

  describe('compareMovies — dispatches by type', () => {
    it('uses compareMovie for Movie type', () => {
      const a = { type: 'Movie', id: '0001', year: 2020 };
      const b = { type: 'Movie', id: '0002', year: 2010 };
      assert.ok(sort.compareMovies(a, b) < 0);
    });

    it('uses compareSeries for Series type', () => {
      const a = { type: 'Series', title: 'Alpha' };
      const b = { type: 'Series', title: 'Beta' };
      assert.ok(sort.compareMovies(a, b) < 0);
    });
  });

  describe('compareAllMovies — groups by type priority: Movie → Iranian → Animation → Series', () => {
    it('Movie sorts before Iranian', () => {
      const a = { type: 'Movie', id: '0001', year: 2020 };
      const b = { type: 'Iranian', id: '0005', year: 2020 };
      assert.ok(sort.compareAllMovies(a, b) < 0);
    });

    it('Iranian sorts before Animation', () => {
      const a = { type: 'Iranian', id: '0001', year: 2020 };
      const b = { type: 'Animation', id: '0001', year: 2020 };
      assert.ok(sort.compareAllMovies(a, b) < 0);
    });

    it('Animation sorts before Series', () => {
      const a = { type: 'Animation', id: '0001', year: 2020 };
      const b = { type: 'Series', title: 'Alpha' };
      assert.ok(sort.compareAllMovies(a, b) < 0);
    });
  });

  describe('sortMovies', () => {
    it('sorts an array in-place', () => {
      const arr = [
        { type: 'Series', title: 'Dexter' },
        { type: 'Movie', id: '0001', year: 2020 },
        { type: 'Movie', id: '0002', year: 2010 },
        { type: 'Series', title: 'Alpha' },
      ];
      sort.sortMovies(arr);
      assert.equal(arr[0].type, 'Movie');
      assert.equal(arr[0].year, 2020);
      assert.equal(arr[1].type, 'Movie');
      assert.equal(arr[1].year, 2010);
      assert.equal(arr[2].type, 'Series');
      assert.equal(arr[2].title, 'Alpha');
      assert.equal(arr[3].type, 'Series');
      assert.equal(arr[3].title, 'Dexter');
    });
  });

  describe('numericId', () => {
    it('parses "00452" to 452', () => assert.equal(sort.numericId('00452'), 452));
    it('parses "9821" to 9821', () => assert.equal(sort.numericId('9821'), 9821));
    it('returns -1 for null', () => assert.equal(sort.numericId(null), -1));
    it('returns -1 for undefined', () => assert.equal(sort.numericId(undefined), -1));
    it('returns -1 for non-numeric', () => assert.equal(sort.numericId('abc'), -1));
  });

  describe('normalizedSeriesTitle', () => {
    it('lowercases', () => assert.equal(sort.normalizedSeriesTitle('Breaking Bad'), 'breaking bad'));
    it('strips "The"', () => assert.equal(sort.normalizedSeriesTitle('The Boys'), 'boys'));
    it('strips "A"', () => assert.equal(sort.normalizedSeriesTitle('A Quiet Place'), 'quiet place'));
    it('strips "An"', () => assert.equal(sort.normalizedSeriesTitle('An Education'), 'education'));
    it('strips Persian "یک "', () => assert.equal(sort.normalizedSeriesTitle('یک روز خوب'), 'روز خوب'));
    it('strips Persian "آن "', () => assert.equal(sort.normalizedSeriesTitle('آن مرد آمد'), 'مرد آمد'));
    it('returns empty string for null', () => assert.equal(sort.normalizedSeriesTitle(null), ''));
  });

  describe('D3 — shared fa collator', () => {
    it('faCollator is Intl.Collator("fa", {numeric:true, sensitivity:"base"})', () => {
      assert.ok(sort.faCollator instanceof Intl.Collator);
      const o = sort.faCollator.resolvedOptions();
      assert.equal(o.locale, 'fa');
      assert.equal(o.numeric, true);
      assert.equal(o.sensitivity, 'base');
    });

    it('numeric option: "Movie 2" < "Movie 10"', () => {
      assert.ok(sort.faCollator.compare('Movie 2', 'Movie 10') < 0);
    });

    it('case-insensitive (base sensitivity): breaking ≡ Breaking', () => {
      assert.equal(sort.faCollator.compare('breaking', 'Breaking'), 0);
    });

    it('Persian titles compare in Persian alphabetical order (الفبا)', () => {
      const sorted = ['پدر', 'برادر', 'آسمان', 'اسب', 'یک']
        .sort((a, b) => sort.faCollator.compare(a, b));
      assert.deepEqual(sorted, ['آسمان', 'اسب', 'برادر', 'پدر', 'یک']);
    });

    it('mixed Persian/Latin: Persian titles order before Latin under fa', () => {
      const sorted = ['Zebra', 'کمدی', 'abc', 'اسب']
        .sort((a, b) => sort.faCollator.compare(a, b));
      assert.deepEqual(sorted, ['اسب', 'کمدی', 'abc', 'Zebra']);
    });

    it('ZWNJ title equals its no-ZWNJ variant (compare === 0)', () => {
      assert.equal(sort.faCollator.compare('می‌خواهم', 'میخواهم'), 0);
    });
  });

  describe('D3 — compareSeries uses the fa collator (I11 rule unchanged)', () => {
    it('Persian Series titles sort alphabetically', () => {
      const a = { type: 'Series', title: 'برادر' };
      const b = { type: 'Series', title: 'پدر' };
      assert.ok(sort.compareSeries(a, b) < 0); // ب before پ
    });

    it('mixed Persian/Latin Series: Persian before Latin', () => {
      const a = { type: 'Series', title: 'کلاه‌قرمزی' };
      const b = { type: 'Series', title: 'Zebra' };
      assert.ok(sort.compareSeries(a, b) < 0);
    });

    it('ZWNJ variants of the same Series title compare equal', () => {
      const a = { type: 'Series', title: 'می‌خواهم' };
      const b = { type: 'Series', title: 'میخواهم' };
      assert.equal(sort.compareSeries(a, b), 0);
    });

    it('article stripping still applies (I11 unchanged)', () => {
      const a = { type: 'Series', title: 'The Boys' };
      const b = { type: 'Series', title: 'Better Call Saul' };
      assert.ok(sort.compareSeries(a, b) > 0); // "boys" > "better"
    });

    it('Latin ordering unchanged vs the old en comparator', () => {
      assert.ok(sort.compareSeries({ type: 'Series', title: 'Breaking Bad' },
        { type: 'Series', title: 'Dexter' }) < 0);
    });
  });

  describe('D3 — fallback comparator uses the fa collator', () => {
    it('unknown type: equal years fall back to fa title order', () => {
      const a = { type: 'Game', year: 2020, title: 'اسب' };
      const b = { type: 'Game', year: 2020, title: 'Zebra' };
      assert.ok(sort.compareMovies(a, b) < 0); // Persian before Latin under fa
    });
  });
});
