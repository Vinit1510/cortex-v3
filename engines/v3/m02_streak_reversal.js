/**
 * Method 2: Streak Reversal (Mean Reversion)
 * If 3+ consecutive same Size results, predict the OPPOSITE.
 */
function predict(features, history) {
  const { currentStreakLen, currentStreakDir, bigSmallRatio10, last10nums, gapAnalysis } = features;
  let targetSize, confidence;

  if (currentStreakLen >= 3 && currentStreakDir !== "NONE") {
    targetSize = currentStreakDir === "BIG" ? "SMALL" : "BIG";
    confidence = Math.min(85, 40 + currentStreakLen * 8);
  } else {
    targetSize = bigSmallRatio10 > 0.5 ? "SMALL" : "BIG";
    confidence = Math.round(25 + Math.abs(bigSmallRatio10 - 0.5) * 60);
  }

  const pool = targetSize === "BIG" ? [5, 6, 7, 8, 9] : [0, 1, 2, 3, 4];
  const last3 = new Set((last10nums || []).slice(0, 3));
  const candidates = pool.filter((n) => !last3.has(n));
  const n = candidates.length > 0 ? candidates[Math.floor(candidates.length / 2)] : pool[2];
  let color = "GREEN";
  if (n === 0) color = "RED_VIOLET"; else if (n === 5) color = "GREEN_VIOLET"; else if ([2,4,6,8].includes(n)) color = "RED";

  return { number: n, size: targetSize, color, confidence, method: "STREAK_REVERSAL" };
}
module.exports = { predict };
