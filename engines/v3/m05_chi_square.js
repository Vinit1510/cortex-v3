/**
 * Method 5: Chi-Square Hot Zone
 * Identifies numbers appearing SIGNIFICANTLY more than random chance (momentum play).
 */
function predict(features, history) {
  const { freq50, hotNumbers } = features;
  const total = Object.values(freq50).reduce((a, b) => a + b, 0);
  if (total < 10) {
    const n = (hotNumbers && hotNumbers[0]) || 5;
    return { number: n, size: n >= 5 ? "BIG" : "SMALL", color: "GREEN", confidence: 20, method: "CHI_SQUARE" };
  }

  const expected = total / 10;
  let maxDev = 0, hotNum = 0;
  for (const [numStr, observed] of Object.entries(freq50)) {
    const chiSq = ((observed - expected) ** 2) / expected;
    if (chiSq > maxDev && observed > expected) { maxDev = chiSq; hotNum = parseInt(numStr); }
  }

  const confidence = maxDev > 3.84 ? Math.min(80, Math.round(35 + (maxDev / 3.84) * 20)) : 20;
  const n = maxDev > 1 ? hotNum : ((hotNumbers && hotNumbers[0]) || 5);
  const size = n >= 5 ? "BIG" : "SMALL";
  let color = "GREEN";
  if (n === 0) color = "RED_VIOLET"; else if (n === 5) color = "GREEN_VIOLET"; else if ([2,4,6,8].includes(n)) color = "RED";

  return { number: n, size, color, confidence, method: "CHI_SQUARE" };
}
module.exports = { predict };
