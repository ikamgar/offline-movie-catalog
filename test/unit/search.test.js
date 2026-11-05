'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('js/utils/search.js', () => {
  let search;

  it('loads ES module via dynamic import', async () => {
    search = await import('../../js/utils/search.js');
  });

  it('applies a config fixture so type labels resolve (ARCH-03 via /api/config)', async () => {
    const { applyConfig } = await import('../../js/config.js');
    applyConfig({
      typeLabels: {
        Movie: 'فیلم',
        Series: 'سریال',
        Animation: 'انیمیشن',
        Iranian: 'ایرانی',
        Game: 'بازی'
      }
    });
  });

  const movies = [
    { uid: '0001', id: '0001', title: 'کمدی', year: 2020, genres: ['کمدی'], type: 'Movie' },
    { uid: '0002', id: '0002', title: 'كمدي بزرگ', year: 2019, genres: ['کمدی'], type: 'Movie' },
    { uid: '0003', id: '0003', title: 'The Dark Knight', year: 2008, genres: ['اکشن'], type: 'Movie' },
    { uid: '0004', id: '0004', title: 'سینما', year: 2021, genres: ['درام'], type: 'Movie' },
    { uid: 'series:bb', id: null, title: 'Breaking Bad', year: null, genres: [], type: 'Series' },
    { uid: 'series:mikh', id: null, title: 'میخواهم', year: null, genres: [], type: 'Series' },
    { uid: '0010', id: '0010', title: 'Movie 5', year: 2020, genres: ['اکشن'], type: 'Movie' }
  ];
  const titles = items => items.map(m => m.title);

  describe('buildSearchEntry / buildSearchIndex', () => {
    it('precomputes a normalised haystack containing title, id, year, genres, type labels', () => {
      const idx = search.buildSearchIndex(movies);
      const e = idx[0];
      assert.equal(e.item, movies[0]);
      assert.ok(e.hay.includes('کمدی'), e.hay);
      assert.ok(e.hay.includes('0001'), e.hay);
      assert.ok(e.hay.includes('2020'), e.hay);
      assert.ok(e.hay.includes('فیلم'), 'Persian type label missing: ' + e.hay);
      assert.ok(e.hay.includes('movie'), 'English type missing: ' + e.hay);
    });

    it('never stringifies null/undefined (Series hay must not contain "null"/"undefined")', () => {
      const idx = search.buildSearchIndex(movies);
      for (const e of idx) {
        assert.ok(!e.hay.includes('null'), `hay contains "null": ${e.hay}`);
        assert.ok(!e.hay.includes('undefined'), `hay contains "undefined": ${e.hay}`);
      }
      const series = idx.find(e => e.item.type === 'Series');
      assert.equal(series.id, '', 'Series id must be empty string, not "null"');
    });

    it('builds entries for games with platform labels', () => {
      const games = [{ uid: 'game:fifa', title: 'FIFA 24', platforms: ['PS4', 'PS5'], type: 'Game' }];
      const idx = search.buildSearchIndex(games);
      assert.ok(idx[0].hay.includes('ps4'), idx[0].hay);
      assert.ok(idx[0].hay.includes('بازی'), 'Persian Game label: ' + idx[0].hay);
      assert.ok(idx[0].hay.includes('game'), idx[0].hay);
    });
  });

  describe('searchItems — normalisation both directions (FE-07)', () => {
    it('query with Arabic letters finds titles stored with Persian letters (and vice versa)', () => {
      const idx = search.buildSearchIndex(movies);
      const ar = search.searchItems(movies, idx, 'كمدي'); // Arabic kaf + yeh
      assert.deepEqual(titles(ar), ['کمدی', 'كمدي بزرگ']);
      const fa = search.searchItems(movies, idx, 'کمدی'); // Persian
      assert.deepEqual(titles(fa), ['کمدی', 'كمدي بزرگ']);
    });

    it('Persian-digit query ۲۰۲۰ finds ASCII year 2020', () => {
      const idx = search.buildSearchIndex(movies);
      const r = search.searchItems(movies, idx, '۲۰۲۰');
      assert.deepEqual(titles(r).sort(), ['Movie 5', 'کمدی']);
    });

    it('ASCII query 2020 finds the same items', () => {
      const idx = search.buildSearchIndex(movies);
      const r = search.searchItems(movies, idx, '2020');
      assert.deepEqual(titles(r).sort(), ['Movie 5', 'کمدی']);
    });

    it('ZWNJ query finds no-ZWNJ title and vice versa', () => {
      const idx = search.buildSearchIndex(movies);
      assert.deepEqual(titles(search.searchItems(movies, idx, 'می‌خواهم')), ['میخواهم']);
      assert.deepEqual(titles(search.searchItems(movies, idx, 'میخواهم')), ['میخواهم']);
    });

    it('Persian type label سریال finds Series', () => {
      const idx = search.buildSearchIndex(movies);
      assert.deepEqual(titles(search.searchItems(movies, idx, 'سریال')).sort(),
        ['Breaking Bad', 'میخواهم']);
    });

    it('English type label Series finds the same items', () => {
      const idx = search.buildSearchIndex(movies);
      assert.deepEqual(titles(search.searchItems(movies, idx, 'Series')).sort(),
        ['Breaking Bad', 'میخواهم']);
    });

    it('typing "null" finds nothing (FE-07)', () => {
      const idx = search.buildSearchIndex(movies);
      assert.deepEqual(search.searchItems(movies, idx, 'null'), []);
    });

    it('typing "undefined" finds nothing', () => {
      const idx = search.buildSearchIndex(movies);
      assert.deepEqual(search.searchItems(movies, idx, 'undefined'), []);
    });
  });

  describe('searchItems — tokenise on spaces, AND the tokens', () => {
    it('multi-token AND matches across the haystack', () => {
      const idx = search.buildSearchIndex(movies);
      assert.deepEqual(titles(search.searchItems(movies, idx, 'dark knight')), ['The Dark Knight']);
      assert.deepEqual(titles(search.searchItems(movies, idx, 'کمدی 2020')), ['کمدی']);
    });

    it('a token matching nothing yields no results', () => {
      const idx = search.buildSearchIndex(movies);
      assert.deepEqual(search.searchItems(movies, idx, 'dark xyz'), []);
    });

    it('tokens may match different fields (genre + year)', () => {
      const idx = search.buildSearchIndex(movies);
      const r = search.searchItems(movies, idx, 'اکشن 2008');
      assert.deepEqual(titles(r), ['The Dark Knight']);
    });
  });

  describe('searchItems — ranking: exact ID > title prefix > contains', () => {
    const rankMovies = [
      { uid: 'a', id: '12', title: 'چیز دیگر', year: 2000, genres: [], type: 'Movie' },
      { uid: 'b', id: '77', title: '12 مرد', year: 2001, genres: [], type: 'Movie' },
      { uid: 'c', id: '88', title: 'مرد شماره 12', year: 2002, genres: [], type: 'Movie' }
    ];

    it('exact-ID match ranks first, then title-prefix, then contains', () => {
      const idx = search.buildSearchIndex(rankMovies);
      const r = search.searchItems(rankMovies, idx, '12');
      assert.deepEqual(r.map(m => m.uid), ['a', 'b', 'c']);
    });

    it('prefix beats contains for Latin titles', () => {
      const heat = [
        { uid: 'c', id: '02', title: 'The Heat', year: 2013, genres: [], type: 'Movie' },
        { uid: 'p', id: '01', title: 'Heat', year: 1995, genres: [], type: 'Movie' }
      ];
      const idx = search.buildSearchIndex(heat);
      const r = search.searchItems(heat, idx, 'heat');
      assert.deepEqual(r.map(m => m.uid), ['p', 'c']);
    });

    it('word-start match outranks a plain substring match (SEARCH-PREFIX-BOOST)', () => {
      const candidates = [
        { uid: 'sub', id: '10', title: 'Superbad', year: 2007, genres: [], type: 'Movie' },
        { uid: 'pre', id: '20', title: 'Bad Boys', year: 1995, genres: [], type: 'Movie' }
      ];
      const idx = search.buildSearchIndex(candidates);
      const r = search.searchItems(candidates, idx, 'bad');
      assert.deepEqual(r.map(m => m.uid), ['pre', 'sub'], 'word-start prefix match must outrank substring match');
    });

    it('equal ranks keep the input (type-rule) order — stable', () => {
      const same = [
        { uid: 'x', id: '31', title: 'الف', year: 2020, genres: [], type: 'Movie' },
        { uid: 'y', id: '32', title: 'ب', year: 2020, genres: [], type: 'Movie' }
      ];
      const idx = search.buildSearchIndex(same);
      const r = search.searchItems(same, idx, '2020');
      assert.deepEqual(r.map(m => m.uid), ['x', 'y']);
    });
  });

  describe('searchItems — edge cases', () => {
    it('empty query returns the input list unchanged', () => {
      const idx = search.buildSearchIndex(movies);
      assert.equal(search.searchItems(movies, idx, ''), movies);
      assert.equal(search.searchItems(movies, idx, '   '), movies);
    });

    it('restricts to the provided subset (category filter)', () => {
      const idx = search.buildSearchIndex(movies);
      const subset = [movies[2], movies[6]]; // both اکشن
      const r = search.searchItems(subset, idx, 'اکشن');
      assert.deepEqual(titles(r).sort(), ['Movie 5', 'The Dark Knight']);
    });

    it('games: platform query finds games', () => {
      const games = [
        { uid: 'game:fifa', title: 'FIFA 24', platforms: ['PS4'], type: 'Game' },
        { uid: 'game:tlou', title: 'The Last of Us', platforms: ['PS5'], type: 'Game' }
      ];
      const idx = search.buildSearchIndex(games);
      assert.deepEqual(titles(search.searchItems(games, idx, 'ps4')), ['FIFA 24']);
      assert.deepEqual(titles(search.searchItems(games, idx, 'بازی')).length, 2);
    });

    it('tieBreak comparator orders equal ranks (I11 as tie-break)', () => {
      const two = [
        { uid: 'y', id: '41', title: 'ب', year: 2020, genres: [], type: 'Movie' },
        { uid: 'x', id: '42', title: 'الف', year: 2020, genres: [], type: 'Movie' }
      ];
      const idx = search.buildSearchIndex(two);
      const cmp = (a, b) => (a.uid === b.uid ? 0 : (a.uid < b.uid ? -1 : 1));
      const r = search.searchItems(two, idx, '2020', cmp);
      assert.deepEqual(r.map(m => m.uid), ['x', 'y'],
        'tieBreak must reorder equal-rank matches');
      // without tieBreak the input order survives (stability)
      assert.deepEqual(search.searchItems(two, idx, '2020').map(m => m.uid), ['y', 'x']);
    });
  });

  describe('20k fixture — main-thread search measurement (worker decision)', () => {
    const makeMany = (count) => Array.from({ length: count }, (_, i) => {
      const id = String(i + 1).padStart(4, '0');
      const isSeries = i % 7 === 0;
      return {
        uid: isSeries ? `series:t${i}` : id,
        id: isSeries ? null : id,
        title: (i % 3 === 0 ? 'فیلم ' : 'Movie ') + (i + 1),
        year: isSeries ? null : 1980 + (i % 40),
        genres: [['اکشن'], ['درام'], ['کمدی']][i % 3],
        type: ['Movie', 'Series', 'Animation', 'Iranian'][i % 4]
      };
    });

    it('build + 12 queries: worst query ≤ 30 ms on 20,000 items', () => {
      const items = makeMany(20000);
      const t0 = performance.now();
      const idx = search.buildSearchIndex(items);
      const buildMs = performance.now() - t0;
      assert.equal(idx.length, 20000);

      const queries = ['کمدی', '2020', 'the dark', 'a', 'سریال', '0001',
        '۱۴۰۲', 'movie', 'فیلم 1999', 'xyz-none', 'e', 'درام'];
      let worst = 0, total = 0;
      for (const q of queries) {
        const t = performance.now();
        search.searchItems(items, idx, q);
        const ms = performance.now() - t;
        worst = Math.max(worst, ms);
        total += ms;
      }
      const avg = total / queries.length;
      console.log(`  [P5a] 20k search: build=${buildMs.toFixed(1)}ms avg=${avg.toFixed(2)}ms worst=${worst.toFixed(2)}ms`);
      assert.ok(worst <= 30,
        `main-thread search must be ≤30ms/query on 20k (worker decision), worst=${worst.toFixed(2)}ms avg=${avg.toFixed(2)}ms`);
    });

    it('subset (category-filtered) worst query ≤ 30 ms', () => {
      const items = makeMany(20000);
      const idx = search.buildSearchIndex(items);
      const subset = items.slice(0, 5000);
      let worst = 0;
      for (const q of ['a', 'movie', 'اکشن', 'e']) {
        const t = performance.now();
        search.searchItems(subset, idx, q);
        worst = Math.max(worst, performance.now() - t);
      }
      console.log(`  [P5a] 5k-subset search: worst=${worst.toFixed(2)}ms`);
      assert.ok(worst <= 30, `subset search ≤30ms, worst=${worst.toFixed(2)}ms`);
    });
  });
});
