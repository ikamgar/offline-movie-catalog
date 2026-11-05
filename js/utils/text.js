/**
 * Persian text utilities.
 *
 * normalizeFa(str) — pure normalisation used for SEARCH MATCHING ONLY.
 * Display strings are never modified (ZWNJ is kept everywhere except here).
 *
 * Rules (P5a / D1):
 *   1. NFKC compatibility normalisation
 *   2. Arabic Yeh (U+064A) / Alef Maksura (U+0649) → Persian Yeh (U+06CC)
 *   3. Arabic Kaf (U+0643) → Persian Keheh (U+06A9)
 *   4. Persian digits (U+06F0–06F9) and Arabic-Indic digits (U+0660–0669) → ASCII
 *   5. Remove tatweel (U+0640), Arabic diacritics (U+064B–U+065F, U+0670)
 *      and ZWNJ (U+200C — matching only; display keeps it)
 *   6. Lower-case Latin
 *   7. Collapse whitespace runs to single spaces and trim
 *
 * @param {string|null|undefined} str
 * @returns {string} normalised string; '' for null/undefined
 */
export function normalizeFa(str) {
  if (str === null || str === undefined) return '';
  let s = String(str);

  // 1. NFKC
  s = s.normalize('NFKC');

  // 2–3. Yeh / Kaf unification
  s = s.replace(/[\u064A\u0649]/g, '\u06CC'); // ي ى → ی
  s = s.replace(/\u0643/g, '\u06A9');         // ك  → ک

  // 4. Digits → ASCII
  s = s.replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0));
  s = s.replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660));

  // 5. Tatweel, diacritics, ZWNJ (matching only).
  //    Members are listed combining-marks-first purely so the pattern reads
  //    unambiguously (lint: no-misleading-character-class); [] member order
  //    never affects which characters match.
  s = s.replace(/[\u064B-\u065F\u0670\u0640\u200C]/g, '');

  // 6. Latin lower-case
  s = s.toLowerCase();

  // 7. Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}
