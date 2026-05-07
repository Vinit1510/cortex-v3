/**
 * Method 1: Frequency Equilibrium
 * Predicts the COLDEST number (appeared LEAST in last 50 rounds).
 * Logic: RNG will eventually balance, so underrepresented numbers are "due."
 */
function predict(features, history) {
  const { freq50, totalRows } = features;
  const total = Object.values(freq50).reduce((a, b) => a + b, 0);

  // Need at least 30 rows for frequency analysis to be meaningful
  if (total < 30) {
    const pool = [0,1,2,3,4,5,6,7,8,9];
    const n = pool[Math.floor(Math.random() * 10)];
    const size = n >= 5 ? "BIG" : "SMALL";
    return { number: n, size, color: "GREEN", confidence: 15, method: "FREQ_EQUILIBRIUM" };
  }

  const avgFreq = total / 10;
  let bestNum = 0;
  let highestMomentumScore = -Infinity;

  // We want a number that hasn't shown up in the very short term (e.g. last 10)
  // BUT still has a strong baseline frequency (not a "dead" number).
  const last10 = history.slice(0, 10).map(h => h.number);
  
  for (let n = 0; n <= 9; n++) {
    const isRecentlyDead = last10.includes(n);
    // Score = Baseline Frequency (freq50). But penalty if it just hit recently.
    let score = freq50[n];
    if (isRecentlyDead) score -= 100; // We want something that is due

    if (score > highestMomentumScore) {
      highestMomentumScore = score;
      bestNum = n;
    }
  }

  // Confidence is based on how strong its baseline freq is
  const deviation = avgFreq > 0 ? (highestMomentumScore - avgFreq) / avgFreq : 0;
  const confidence = Math.min(85, Math.max(0, Math.round(50 + deviation * 30)));
  const size = bestNum >= 5 ? "BIG" : "SMALL";
  let color = "GREEN";
  if (bestNum === 0) color = "RED_VIOLET";
  else if (bestNum === 5) color = "GREEN_VIOLET";
  else if ([2, 4, 6, 8].includes(bestNum)) color = "RED";

  return { number: bestNum, size, color, confidence, method: "FREQ_EQUILIBRIUM" };
}
module.exports = { predict };
