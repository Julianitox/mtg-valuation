#!/usr/bin/env node

/**
 * Remove set JSON files older than N years based on SetList.json.
 *
 * This is a maintenance script: run it manually when you want
 * to prune the local repository. It does NOT run automatically
 * on builds.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const YEARS_BACK = Number.parseInt(process.env.MTG_YEARS_BACK ?? '3', 10) || 3;

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function main() {
  const rootDir = path.resolve(__dirname, '..');
  const mtgDir = path.join(rootDir, 'public', 'mtgjson');
  const setsDir = path.join(mtgDir, 'sets');
  const setListPath = path.join(mtgDir, 'SetList.json');

  if (!fs.existsSync(setListPath)) {
    console.error('Missing SetList.json at', setListPath);
    process.exit(1);
  }

  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setFullYear(cutoff.getFullYear() - YEARS_BACK);

  const setListRaw = readJson(setListPath);
  const setList = Array.isArray(setListRaw) ? setListRaw : setListRaw.data ?? [];

  let removed = 0;
  let kept = 0;

  for (const set of setList) {
    if (!set.releaseDate) continue;
    const rd = new Date(set.releaseDate);
    if (Number.isNaN(rd.getTime())) continue;

    const code = String(set.code).toUpperCase();
    const setPath = path.join(setsDir, `${code}.json`);

    if (rd < cutoff) {
      if (fs.existsSync(setPath)) {
        fs.unlinkSync(setPath);
        removed += 1;
        console.log(`Removed old set: ${code} (${set.releaseDate})`);
      }
    } else {
      if (fs.existsSync(setPath)) {
        kept += 1;
      }
    }
  }

  console.log(
    `Prune complete. Removed ${removed} set files; kept ${kept} sets from the last ${YEARS_BACK} years.`,
  );
}

main();


