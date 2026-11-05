'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseFilename,
  parseFilenameEx,
  cleanTitle,
  classifyFromPath,
  TYPE_MAP,
  IMAGE_EXTENSIONS
} = require('../../backend/parser');

describe('parseFilename — table-driven (≥40 filenames)', () => {
  const cases = [
    // Documented header formats
    ['5273-Shelter 2026.jpg', 'Movie', { id: '5273', title: 'Shelter', year: 2026 }],
    ['5273-Shelter (2026).jpg', 'Movie', { id: '5273', title: 'Shelter', year: 2026 }],
    ['5273-Shelter-2026.jpg', 'Movie', { id: '5273', title: 'Shelter', year: 2026 }],
    ['5273-Shelter.2026.jpg', 'Movie', { id: '5273', title: 'Shelter', year: 2026 }],
    ['5273 Shelter 2026.jpg', 'Movie', { id: '5273', title: 'Shelter', year: 2026 }],
    ['5273 - Shelter (2026).jpg', 'Movie', { id: '5273', title: 'Shelter', year: 2026 }],
    ['5273_Shelter_2026.jpg', 'Movie', { id: '5273', title: 'Shelter', year: 2026 }],
    ['5273 The Dark Knight 2008 WEB-DL x265.jpg', 'Movie', { id: '5273', title: 'The Dark Knight', year: 2008 }],
    ['5273 - The Dark Knight (2008) [1080p] [BluRay].jpg', 'Movie', { id: '5273', title: 'The Dark Knight', year: 2008 }],

    // Common Movie patterns
    ['0001- Heat 1995.jpg', 'Movie', { id: '0001', title: 'Heat', year: 1995 }],
    ['0099- Inception 2010.jpg', 'Movie', { id: '0099', title: 'Inception', year: 2010 }],
    ['123- The Godfather 1972.jpg', 'Movie', { id: '123', title: 'The Godfather', year: 1972 }],
    ['0001- The Matrix 1999.jpg', 'Movie', { id: '0001', title: 'The Matrix', year: 1999 }],
    ['1234-Iron Man 3.2013.jpg', 'Movie', { id: '1234', title: 'Iron Man 3', year: 2013 }],

    // Year edge cases (DATA-17)
    ['0001- 1917 2019.jpg', 'Movie', { id: '0001', title: '1917', year: 2019 }],
    ['0001- Blade Runner 2049 2017.jpg', 'Movie', { id: '0001', title: 'Blade Runner 2049', year: 2017 }],
    ['0001- 2012 2009.jpg', 'Movie', { id: '0001', title: '2012', year: 2009 }],

    // Ambiguous words kept (DATA-12)
    ["0001- Charlotte's Web 2006.jpg", 'Movie', { id: '0001', title: "Charlotte's Web", year: 2006 }],
    ['0001- The Amazon 2019.jpg', 'Movie', { id: '0001', title: 'The Amazon', year: 2019 }],
    ['0001- Dark Web 2021.jpg', 'Movie', { id: '0001', title: 'Dark Web', year: 2021 }],
    ['0001- Extended Family 2018.jpg', 'Movie', { id: '0001', title: 'Extended Family', year: 2018 }],
    ['0001- Apple 2020.jpg', 'Movie', { id: '0001', title: 'Apple', year: 2020 }],
    ['0001- Netflix Special 2021.jpg', 'Movie', { id: '0001', title: 'Netflix Special', year: 2021 }],
    ['0001- HBO Story 2015.jpg', 'Movie', { id: '0001', title: "HBO Story", year: 2015 }],
    ['0001- Limited Edition 2017.jpg', 'Movie', { id: '0001', title: 'Limited Edition', year: 2017 }],
    ['0001- Multi Player 2016.jpg', 'Movie', { id: '0001', title: 'Multi Player', year: 2016 }],
    ['0001- Final Cut 2014.jpg', 'Movie', { id: '0001', title: 'Final Cut', year: 2014 }],
    ['0001- Uncut Gem 2019.jpg', 'Movie', { id: '0001', title: 'Uncut Gem', year: 2019 }],
    ['0001- Disney Dream 2013.jpg', 'Movie', { id: '0001', title: 'Disney Dream', year: 2013 }],
    ['0001- Hulu House 2020.jpg', 'Movie', { id: '0001', title: 'Hulu House', year: 2020 }],

    // Special characters
    ["0001- Grey's Anatomy 2005.jpg", 'Movie', { id: '0001', title: "Grey's Anatomy", year: 2005 }],
    ['0001- 100% Wolf 2020.jpg', 'Movie', { id: '0001', title: '100% Wolf', year: 2020 }],
    ['0001- Tom & Jerry 2021.jpg', 'Movie', { id: '0001', title: 'Tom & Jerry', year: 2021 }],
    ['0001- C# Lover 2018.jpg', 'Movie', { id: '0001', title: 'C# Lover', year: 2018 }],

    // Persian titles
    ['1234- سلام 2020.jpg', 'Movie', { id: '1234', title: 'سلام', year: 2020 }],
    ['0001- فیلم ایرانی 2015.jpg', 'Movie', { id: '0001', title: 'فیلم ایرانی', year: 2015 }],

    // Animation (year optional, kept when present — D3/DATA-11)
    ['00012-Cars 2006.jpg', 'Animation', { id: '00012', title: 'Cars', year: 2006 }],
    ['00012-Cars.jpg', 'Animation', { id: '00012', title: 'Cars', year: null }],
    ['00001-Up.jpg', 'Animation', { id: '00001', title: 'Up', year: null }],
    ['00001-Up 2009.jpg', 'Animation', { id: '00001', title: 'Up', year: 2009 }],

    // Iranian (year optional, kept when present — D3/DATA-11)
    ['0001-Gav 1969.jpg', 'Iranian', { id: '0001', title: 'Gav', year: 1969 }],
    ['0001-Gav.jpg', 'Iranian', { id: '0001', title: 'Gav', year: null }],

    // Series (title only)
    ['Breaking Bad.jpg', 'Series', { id: null, title: 'Breaking Bad', year: null }],
    ['Game of Thrones.jpg', 'Series', { id: null, title: 'Game of Thrones', year: null }],
    ['100% Wolf.jpg', 'Series', { id: null, title: '100% Wolf', year: null }],
    ["Charlotte's Web.jpg", 'Series', { id: null, title: "Charlotte's Web", year: null }],

    // Technical tag stripping kept
    ['0001- Heat 1995 [BluRay].jpg', 'Movie', { id: '0001', title: 'Heat', year: 1995 }],
    ['0001- Heat 1995 (1080p).jpg', 'Movie', { id: '0001', title: 'Heat', year: 1995 }],
    ['0001- Heat 1995 x265 HDRip.jpg', 'Movie', { id: '0001', title: 'Heat', year: 1995 }],
  ];

  assert.ok(cases.length >= 40, `table must have ≥40 cases, has ${cases.length}`);

  for (const [filename, type, expected] of cases) {
    it(`parses "${filename}" as ${type}`, () => {
      const result = parseFilename(filename, type);
      assert.ok(result, `Expected parse to succeed for "${filename}"`);
      assert.equal(result.id, expected.id, 'id');
      assert.equal(result.title, expected.title, 'title');
      assert.equal(result.year, expected.year, 'year');
    });
  }
});

describe('parseFilename — rejects invalid filenames', () => {
  const rejects = [
    ['0001- Heat 1995.mp4', 'Movie', 'unsupported-ext'],
    ['Heat 1995.jpg', 'Movie', 'no-id'],
    ['0001- Heat.jpg', 'Movie', 'no-year'],
    ['0001- Heat 1800.jpg', 'Movie', 'no-year'],
    ['.jpg', 'Movie', 'unsupported-ext'],
    ['1234567- Inception 2010.jpg', 'Movie', 'id-too-long'],
    ['12345678- Foo 2020.jpg', 'Movie', 'id-too-long'],
    ['0001- .jpg', 'Movie', 'empty-title'],
    ['0001- 2019.jpg', 'Movie', 'no-year'],
    ['', 'Movie', 'unsupported-ext'],
    ['noext', 'Movie', 'unsupported-ext'],
  ];

  for (const [filename, type, reason] of rejects) {
    it(`returns null for "${filename}" (${reason})`, () => {
      assert.equal(parseFilename(filename, type), null);
      const ex = parseFilenameEx(filename, type);
      assert.equal(ex.ok, false, 'ex.ok false');
      assert.equal(ex.reason, reason, `reason for "${filename}"`);
    });
  }
});

describe('parseFilenameEx — success shape', () => {
  it('returns {ok:true, entry} for a valid Movie', () => {
    const r = parseFilenameEx('0001- Heat 1995.jpg', 'Movie');
    assert.equal(r.ok, true);
    assert.deepEqual(r.entry, { id: '0001', title: 'Heat', year: 1995, extension: 'jpg' });
  });

  it('returns {ok:true, entry} for a valid Series', () => {
    const r = parseFilenameEx('Breaking Bad.jpg', 'Series');
    assert.equal(r.ok, true);
    assert.equal(r.entry.id, null);
    assert.equal(r.entry.title, 'Breaking Bad');
    assert.equal(r.entry.year, null);
  });

  it('lowercases extension', () => {
    const r = parseFilenameEx('0001- Heat 1995.PNG', 'Movie');
    assert.equal(r.ok, true);
    assert.equal(r.entry.extension, 'png');
  });
});

describe('parseFilename — characterization edge cases', () => {
  it('parses "0001- Heat 1800.jpg" as null (year out of 19xx/20xx range)', () => {
    assert.equal(parseFilename('0001- Heat 1800.jpg', 'Movie'), null);
  });

  it('does not treat 7-digit run as split ID (DATA-18)', () => {
    const r = parseFilename('1234567- Inception 2010.jpg', 'Movie');
    assert.equal(r, null);
    if (r) assert.notEqual(r.id, '123456');
  });

  it('Animation keeps year when present (DATA-11)', () => {
    const r = parseFilename('00012-Cars 2006.jpg', 'Animation');
    assert.ok(r);
    assert.equal(r.year, 2006);
  });
});

describe('cleanTitle (DATA-12)', () => {
  it('keeps Charlotte\'s Web', () => {
    assert.equal(cleanTitle("Charlotte's Web"), "Charlotte's Web");
  });
  it('keeps The Amazon', () => {
    assert.equal(cleanTitle('The Amazon'), 'The Amazon');
  });
  it('keeps Dark Web', () => {
    assert.equal(cleanTitle('Dark Web'), 'Dark Web');
  });
  it('keeps Extended Family', () => {
    assert.equal(cleanTitle('Extended Family'), 'Extended Family');
  });
  it('keeps Apple', () => {
    assert.equal(cleanTitle('Apple'), 'Apple');
  });
  it('strips technical bracket groups', () => {
    assert.equal(cleanTitle('Heat [1080p] [BluRay]'), 'Heat');
  });
  it('strips technical paren groups but keeps real parens', () => {
    assert.equal(cleanTitle('Heat (BluRay)'), 'Heat');
    assert.equal(cleanTitle('Birdman (or The Unexpected Virtue)'), 'Birdman (or The Unexpected Virtue)');
  });
  it('keeps non-technical bracket content', () => {
    assert.equal(cleanTitle('Movie [Rec] 2'), 'Movie [Rec] 2');
  });
  it('NFC-normalises and trims', () => {
    assert.equal(cleanTitle('  Café  '), 'Café');
  });
  it('keeps ZWNJ', () => {
    const zwnj = 'فیلم\u200Cها';
    assert.equal(cleanTitle(zwnj), zwnj);
  });
});

describe('classifyFromPath', () => {
  it('classifies Movies/Action as Movie with genre', () => {
    const r = classifyFromPath('Movies/Action/0001- Heat 1995.jpg');
    assert.equal(r.type, 'Movie');
    assert.deepEqual(r.genres, ['Action']);
  });

  it('classifies Animation/ as Animation', () => {
    const r = classifyFromPath('Animation/00012-Cars.jpg');
    assert.equal(r.type, 'Animation');
    assert.deepEqual(r.genres, []);
  });

  it('classifies Series/ as Series', () => {
    const r = classifyFromPath('Series/Breaking Bad.jpg');
    assert.equal(r.type, 'Series');
    assert.deepEqual(r.genres, []);
  });

  it('classifies Iranian/ as Iranian', () => {
    const r = classifyFromPath('Iranian/0001-Gav.jpg');
    assert.equal(r.type, 'Iranian');
    assert.deepEqual(r.genres, []);
  });

  it('classifies Serries/ as Series (alias)', () => {
    const r = classifyFromPath('Serries/Breaking Bad.jpg');
    assert.equal(r.type, 'Series');
    assert.deepEqual(r.genres, []);
  });

  it('classifies SERIES/ as Series (case-insensitive)', () => {
    const r = classifyFromPath('SERIES/Breaking Bad.jpg');
    assert.equal(r.type, 'Series');
  });

  it('classifies Games/PS4/ as Game', () => {
    const r = classifyFromPath('Games/PS4/Ghost Rider.jpg');
    assert.equal(r.type, 'Game');
    assert.deepEqual(r.genres, []);
  });

  it('classifies Movies/Drama/ correctly', () => {
    const r = classifyFromPath('Movies/Drama/0099- Inception 2010.jpg');
    assert.equal(r.type, 'Movie');
    assert.deepEqual(r.genres, ['Drama']);
  });

  it('classifies Movies/ with no subfolder — genre is filename (current behavior)', () => {
    const r = classifyFromPath('Movies/0001- Heat 1995.jpg');
    assert.equal(r.type, 'Movie');
    assert.deepEqual(r.genres, ['0001- Heat 1995.jpg']);
  });
});

describe('TYPE_MAP', () => {
  it('maps movies to Movie', () => assert.equal(TYPE_MAP['movies'], 'Movie'));
  it('maps animation to Animation', () => assert.equal(TYPE_MAP['animation'], 'Animation'));
  it('maps series to Series', () => assert.equal(TYPE_MAP['series'], 'Series'));
  it('maps serries to Series (alias)', () => assert.equal(TYPE_MAP['serries'], 'Series'));
  it('maps iranian to Iranian', () => assert.equal(TYPE_MAP['iranian'], 'Iranian'));
  it('maps games to Game', () => assert.equal(TYPE_MAP['games'], 'Game'));
});

describe('IMAGE_EXTENSIONS', () => {
  it('contains jpg', () => assert.ok(IMAGE_EXTENSIONS.has('jpg')));
  it('contains jpeg', () => assert.ok(IMAGE_EXTENSIONS.has('jpeg')));
  it('contains png', () => assert.ok(IMAGE_EXTENSIONS.has('png')));
  it('contains webp', () => assert.ok(IMAGE_EXTENSIONS.has('webp')));
  it('contains avif', () => assert.ok(IMAGE_EXTENSIONS.has('avif')));
  it('does not contain mp4', () => assert.ok(!IMAGE_EXTENSIONS.has('mp4')));
});
