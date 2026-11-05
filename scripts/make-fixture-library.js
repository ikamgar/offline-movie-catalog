#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
function getArg(name, def) {
  const idx = args.indexOf('--' + name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : def;
}

const outDir = getArg('out', './fixture-library');
const numMovies = parseInt(getArg('movies', '15000'), 10);
const numAnimation = parseInt(getArg('animation', '2000'), 10);
const numIranian = parseInt(getArg('iranian', '1500'), 10);
const numSeries = parseInt(getArg('series', '800'), 10);
const numGames = parseInt(getArg('games', '300'), 10);

let seed = 42;
function rand() {
  seed = (seed * 16807 + 0) % 2147483647;
  return (seed - 1) / 2147483646;
}

const JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9
]);

const GENRES = ['Action', 'Drama', 'Comedy', 'Thriller', 'Horror', 'Sci-Fi', 'Romance', 'Crime', 'Adventure'];
const PERSIAN_TITLES = [
  '\u062c\u0647\u0627\u0646 \u0633\u0648\u0645', '\u0634\u0628\u0647\u0627\u06cc \u0631\u0648\u0634\u0646',
  '\u062f\u0631\u0628\u0627\u0631\u0647 \u0627\u0644\u06cc', '\u0634\u0647\u0631 \u0632\u06cc\u0628\u0627',
  '\u0642\u0647\u0648\u0647 \u062a\u0644\u062e', '\u0628\u0686\u0647\u200c\u0647\u0627\u06cc \u0622\u0633\u0645\u0627\u0646',
  '\u0627\u0628\u062f \u0648 \u06cc\u06a9 \u0631\u0648\u0632', '\u0641\u0631\u0648\u0634\u0646\u0647',
  '\u0645\u062a\u0631\u06cc \u0634\u06cc\u0634 \u0648 \u0646\u06cc\u0645', '\u06af\u0627\u0648',
  '\u0633\u0641\u0631 \u0642\u0646\u062f\u0647\u0627\u0631', '\u0644\u0627\u0646\u062a\u0648\u0631\u06cc',
  '\u0627\u0632 \u062f\u0631 \u0645\u0648\u0646\u062a\u0627\u0632\u0647\u0627 \u0628\u0642\u0644\u0628', '\u0633\u0644\u0627\u0645 \u062a\u0646\u06b5', '\u06a9\u0645\u0627\u0644\u200c\u0627\u0644\u0645\u0644\u06a9'
];
const ENGLISH_TITLES = [
  'The Dark Knight', 'Inception', 'Interstellar', 'The Matrix', 'Pulp Fiction',
  'Forrest Gump', 'The Shawshank Redemption', 'Fight Club', 'Gladiator', 'Titanic',
  'The Godfather', 'Casablanca', 'Schindlers List', 'The Silence of the Lambs',
  'Saving Private Ryan', 'Braveheart', 'The Usual Suspects', 'Se7en', 'The Prestige',
  'Memento', 'Goodfellas', 'The Departed', 'Whiplash', 'Parasite', 'Joker'
];
const SERIES_TITLES = [
  'Breaking Bad', 'Game of Thrones', 'The Wire', 'The Sopranos', 'Friends',
  'Seinfeld', 'The X-Files', 'Stranger Things', 'The Crown', 'Chernobyl',
  'The Mandalorian', 'Peaky Blinders', 'True Detective', 'Black Mirror',
  'The Office', 'Sherlock', 'Lost', 'Dexter', 'House', 'Fargo'
];
const GAME_TITLES = [
  'FIFA 24', 'GTA V', 'Call of Duty', 'God of War', 'Spider-Man',
  'The Last of Us', 'Red Dead Redemption', 'Horizon', 'Uncharted', 'Madden 24'
];

function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }

function padId(n, width) { return String(n).padStart(width, '0'); }

function writeFile(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JPEG);
}

let count = 0;

console.log(`Generating fixture library in ${outDir}...`);

for (let i = 0; i < numMovies; i++) {
  const id = padId(i + 1, 4);
  const title = rand() < 0.2 ? pick(PERSIAN_TITLES) : pick(ENGLISH_TITLES);
  const year = 1970 + Math.floor(rand() * 56);
  const genre = pick(GENRES);
  const fname = `${id}- ${title} ${year}.jpg`;
  writeFile(path.join(outDir, 'Movies', genre, fname));
  count++;
}

for (let i = 0; i < numAnimation; i++) {
  const id = padId(i + 1, 5);
  const title = pick(ENGLISH_TITLES);
  const fname = `${id}-${title}.jpg`;
  writeFile(path.join(outDir, 'Animation', fname));
  count++;
}

for (let i = 0; i < numIranian; i++) {
  const id = padId(i + 1, 4);
  const title = pick(PERSIAN_TITLES);
  const fname = `${id}-${title}.jpg`;
  writeFile(path.join(outDir, 'Iranian', fname));
  count++;
}

for (let i = 0; i < numSeries; i++) {
  const baseTitle = SERIES_TITLES[i % SERIES_TITLES.length];
  const cycle = Math.floor(i / SERIES_TITLES.length);
  const title = cycle === 0 ? baseTitle : `${baseTitle} ${cycle + 1}`;
  const fname = `${title}.jpg`;
  writeFile(path.join(outDir, 'Series', fname));
  count++;
}

const platforms = ['PS4', 'PS5'];
for (let i = 0; i < numGames; i++) {
  const baseTitle = GAME_TITLES[i % GAME_TITLES.length];
  const cycle = Math.floor(i / GAME_TITLES.length);
  const title = cycle === 0 ? baseTitle : `${baseTitle} ${cycle + 1}`;
  const platform = pick(platforms);
  const fname = `${title}.jpg`;
  writeFile(path.join(outDir, 'Games', platform, fname));
  count++;
}

console.log(`Done: ${count} files created in ${outDir}`);
