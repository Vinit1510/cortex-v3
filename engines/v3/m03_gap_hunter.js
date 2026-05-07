/**
 * Method 3: Gap Hunter
 * Predicts the number with the LONGEST gap since last appearance.
 */
function predict(features, history) {
  const { gapAnalysis } = features;
  let longestNum = 0, longestGap = -1;
  for (let n = 0; n <= 9; n++) {
    if ((gapAnalysis[n] || 0) > longestGap) { longestGap = gapAnalysis[n]; longestNum = n; }
  }

  const confidence = Math.min(85, Math.round(20 + (longestGap / 10) * 20));
  const size = longestNum >= 5 ? "BIG" : "SMALL";
  let color = "GREEN";
  if (longestNum === 0) color = "RED_VIOLET"; else if (longestNum === 5) color = "GREEN_VIOLET"; else if ([2,4,6,8].includes(longestNum)) color = "RED";

  return { number: longestNum, size, color, confidence, method: "GAP_HUNTER" };
}
module.exports = { predict };
