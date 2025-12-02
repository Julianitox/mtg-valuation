const VENDOR_PRIORITY = ['cardmarket', 'tcgplayer', 'cardkingdom', 'manapool'];
const BASE_FINISH_PRIORITY = ['normal', 'nonfoil', 'etched', 'foil'];
const NON_FOIL_FINISHES = ['normal', 'nonfoil', 'etched']; // Finishes that are NOT foil

function findLatestValue(series) {
  if (!series) return null;
  let latestDate = '';
  let latestValue = null;
  for (const [date, value] of Object.entries(series)) {
    if (value == null) continue;
    if (date > latestDate) {
      latestDate = date;
      latestValue = value;
    }
  }
  return latestValue == null ? null : { date: latestDate, value: latestValue };
}

export function pickLatestPrice(priceEntry, { preferredFinish } = {}) {
  if (!priceEntry) return null;
  const mediums = ['paper', 'mtgo'];
  
  // Determine which finishes to try based on preference
  let finishesToTry;
  if (preferredFinish === 'foil') {
    // For foil sheets: ONLY try foil (strict)
    finishesToTry = ['foil'];
  } else if (preferredFinish === 'normal') {
    // For non-foil sheets: try normal/nonfoil/etched but NOT foil (flexible non-foil)
    finishesToTry = NON_FOIL_FINISHES;
  } else if (preferredFinish) {
    // For other specific finish: only that finish (strict)
    finishesToTry = [preferredFinish];
  } else {
    // No preference: try all in priority order
    finishesToTry = BASE_FINISH_PRIORITY;
  }
  
  for (const medium of mediums) {
    const mediumNode = priceEntry[medium];
    if (!mediumNode) continue;
    
    for (const vendor of VENDOR_PRIORITY) {
      const vendorNode = mediumNode[vendor];
      if (!vendorNode) continue;
      const pools = vendorNode.retail ?? vendorNode.buylist;
      if (!pools) continue;
      
      // Try finishes in order
      for (const finish of finishesToTry) {
        const latest = findLatestValue(pools[finish]);
        if (latest) {
          return {
            value: latest.value,
            date: latest.date,
            vendor,
            finish,
            source: vendorNode.retail ? 'retail' : 'buylist',
            currency: vendorNode.currency ?? 'USD',
            medium,
          };
        }
      }
    }
  }
  
  return null;
}

