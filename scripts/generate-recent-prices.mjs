#!/usr/bin/env node

/**
 * Generate a trimmed price file based on the last N years of sets.
 *
 * - Reads SetList.json to find sets with releaseDate within the window
 * - Loads the corresponding set JSON files to collect their card UUIDs
 * - Filters AllPricesToday.json to keep only prices for those UUIDs
 * - Writes the result to AllPricesRecent.json
 *
 * This script is intended to run before the Vite build.
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

  const setListPath = path.join(mtgDir, 'SetList.json');
  const pricesPath = path.join(mtgDir, 'AllPricesToday.json');
  const setsDir = path.join(mtgDir, 'sets');
  const outputPath = path.join(mtgDir, 'AllPricesRecent.json');

  if (!fs.existsSync(setListPath)) {
    console.error('Missing SetList.json at', setListPath);
    process.exit(1);
  }
  if (!fs.existsSync(pricesPath)) {
    console.error('Missing AllPricesToday.json at', pricesPath);
    process.exit(1);
  }

  // On Vercel, AllPricesToday.json may be a Git LFS pointer instead of real JSON.
  // Detect this case and skip regeneration (we then rely on the committed AllPricesRecent.json).
  const rawPricesForCheck = fs.readFileSync(pricesPath, 'utf8').trim();
  if (rawPricesForCheck.startsWith('version https://git-lfs.github.com/spec/v1')) {
    console.warn(
      'AllPricesToday.json looks like a Git LFS pointer. Skipping generation of AllPricesRecent.json.',
    );
    console.warn(
      'Make sure public/mtgjson/AllPricesRecent.json is committed so the app can use it in production.',
    );
    return;
  }

  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setFullYear(cutoff.getFullYear() - YEARS_BACK);

  const setListRaw = readJson(setListPath);
  const setList = Array.isArray(setListRaw) ? setListRaw : setListRaw.data ?? [];

  const recentSetCodes = new Set(
    setList
      .filter((set) => {
        if (!set.releaseDate) return false;
        const rd = new Date(set.releaseDate);
        return !Number.isNaN(rd.getTime()) && rd >= cutoff;
      })
      .map((set) => String(set.code).toUpperCase()),
  );

  const allowedUuids = new Set();

  for (const code of recentSetCodes) {
    const setPath = path.join(setsDir, `${code}.json`);
    if (!fs.existsSync(setPath)) {
      // Some supplemental or promo sets might be missing locally; skip them.
      continue;
    }
    const setRaw = readJson(setPath);
    const cards = Array.isArray(setRaw.cards) ? setRaw.cards : setRaw.data?.cards ?? [];
    for (const card of cards) {
      if (card && card.uuid) {
        allowedUuids.add(card.uuid);
      }
    }
  }

  console.log(
    `Keeping prices for ${allowedUuids.size} cards across ${recentSetCodes.size} sets (last ${YEARS_BACK} years).`,
  );

  const pricesRaw = readJson(pricesPath);
  const pricesData = pricesRaw.data ?? pricesRaw;

  const filtered = {};
  let kept = 0;

  for (const [uuid, priceNode] of Object.entries(pricesData)) {
    if (allowedUuids.has(uuid)) {
      filtered[uuid] = priceNode;
      kept += 1;
    }
  }

  const output =
    pricesRaw && typeof pricesRaw === 'object' && pricesRaw.data
      ? { ...pricesRaw, data: filtered }
      : filtered;

  fs.writeFileSync(outputPath, JSON.stringify(output));

  const originalCount = Object.keys(pricesData).length;
  console.log(
    `Wrote AllPricesRecent.json with ${kept} entries (from ${originalCount}) at ${outputPath}`,
  );
}

main();


