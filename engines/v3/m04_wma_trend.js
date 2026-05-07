/**
 * Method 4: WMA Trend
 * Uses Weighted Moving Average as a TREND indicator, not a direct predictor.
 * Rising trend → BIG, Falling trend → SMALL. Picks most overdue number from pool.
 */
function predict(features, history) {
  const { movingAvg5, movingAvg10, volatility, gapAnalysis, last10nums } = features;
  if (!last10nums || last10nums.length < 3) {
    return { number: 5, size: "BIG", color: "GREEN_VIOLET", confidence: 20, method: "WMA_TREND" };
  }

  const trendUp = movingAvg5 > movingAvg10;
  const trendStrength = Math.abs(movingAvg5 - movingAvg10) / 4.5;
  const targetSize = trendUp ? "BIG" : "SMALL";
  const pool = targetSize === "BIG" ? [5, 6, 7, 8, 9] : [0, 1, 2, 3, 4];

  let bestNum = pool[2], bestGap = -1;
  for (const num of pool) {
    if ((gapAnalysis[num] || 0) > bestGap) { bestGap = gapAnalysis[num]; bestNum = num; }
  }

  const maxVol = 4.5;
  const volFactor = (maxVol - Math.min(volatility, maxVol)) / maxVol;
  const confidence = Math.min(80, Math.round(25 + trendStrength * 30 + volFactor * 25));
  let color = "GREEN";
  if (bestNum === 0) color = "RED_VIOLET"; else if (bestNum === 5) color = "GREEN_VIOLET"; else if ([2,4,6,8].includes(bestNum)) color = "RED";

  return { number: bestNum, size: targetSize, color, confidence, method: "WMA_TREND" };
}
module.exports = { predict };
