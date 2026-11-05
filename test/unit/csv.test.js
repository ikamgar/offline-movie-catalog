'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

describe('js/utils/csv.js — F42 CSV formula neutralization', () => {
  let csv;

  before(async () => {
    csv = await import('../../js/utils/csv.js');
  });

  it('BOM is present at the start of output', () => {
    const out = csv.buildOrdersCsv([]);
    assert.equal(out.charCodeAt(0), 0xFEFF, 'first char must be UTF-8 BOM (U+FEFF)');
    assert.ok(out.includes(csv.CSV_HEADER));
  });

  it('neutralizes each formula trigger character (=, +, -, @, \\t, \\r)', () => {
    const triggers = ['=', '+', '-', '@', '\t', '\r'];
    for (const char of triggers) {
      const cell = csv.csvCell(`${char}cmd|'calc'!A0`);
      assert.ok(
        cell.startsWith(`'${char}`) || cell.startsWith(`"'\r`) || cell.startsWith(`"'${char}`),
        `trigger ${JSON.stringify(char)} must have leading single quote, got: ${JSON.stringify(cell)}`
      );
    }
  });

  it('preserves existing quoting and escaping on top of formula neutralization', () => {
    // Comma inside formula string
    const cellWithComma = csv.csvCell('-Special, Discount');
    assert.equal(cellWithComma, '"\'-Special, Discount"', 'must quote and have single quote prefix');

    // Quote inside formula string
    const cellWithQuote = csv.csvCell('=cmd|"calc"');
    assert.equal(cellWithQuote, '"\'=cmd|""calc"""');

    // Carriage return trigger
    const cellWithCr = csv.csvCell('\rcalc');
    assert.equal(cellWithCr, '"\'\rcalc"');
  });

  it('leaves normal fields and numbers unchanged', () => {
    assert.equal(csv.csvCell('Heat'), 'Heat');
    assert.equal(csv.csvCell('1234'), '1234');
    assert.equal(csv.csvCell(2022), '2022');
    assert.equal(csv.csvCell('Movie'), 'Movie');
    assert.equal(csv.csvCell(''), '');
    assert.equal(csv.csvCell(null), '');
    assert.equal(csv.csvCell(undefined), '');
  });

  it('leaves Persian text completely unaffected', () => {
    assert.equal(csv.csvCell('علی'), 'علی');
    assert.equal(csv.csvCell('فیلم اکشن'), 'فیلم اکشن');
    assert.equal(csv.csvCell('سفارش جدید'), 'سفارش جدید');
  });

  it('applies formula neutralization to every exported field in buildOrdersCsv', () => {
    const orders = [
      {
        number: 1,
        createdAt: '2026-11-05',
        status: '=done',
        customerName: '+Ali',
        movies: [
          {
            id: '-0001',
            title: '@Inception',
            year: 2010,
            type: '\tMovie'
          }
        ]
      }
    ];

    const out = csv.buildOrdersCsv(orders);
    const body = out.slice(1); // skip BOM
    const lines = body.trim().split('\r\n');
    assert.equal(lines.length, 2);
    const dataRow = lines[1];

    assert.ok(dataRow.includes("'=done"), 'status neutralized');
    assert.ok(dataRow.includes("'+Ali"), 'customerName neutralized');
    assert.ok(dataRow.includes("'-0001"), 'id neutralized');
    assert.ok(dataRow.includes("'@Inception"), 'title neutralized');
    assert.ok(dataRow.includes("'\tMovie"), 'type neutralized');
  });
});
