/**
 * Method 7: Markov Chain Transition Matrix
 * Builds a 10x10 probability matrix. Given the last number, predicts the most likely next.
 * Activates after 100+ rows.
 */
function predict(features, history) {
  if (features.totalRows < 100 || history.length < 5) {
    return { number: 5, size: "BIG", color: "GREEN_VIOLET", confidence: 0, method: "MARKOV" };
  }

  const matrix = Array.from({ length: 10 }, () => Array(10).fill(0));
  const counts = Array(10).fill(0);
  const len = Math.min(history.length, 300);

  for (let i = 1; i < len; i++) {
    const from = history[i].number;
    const to = history[i - 1].number;
    if (from >= 0 && from <= 9 && to >= 0 && to <= 9) { matrix[from][to]++; counts[from]++; }
  }

  const lastNum = history[0].number;
  const total = counts[lastNum];
  if (total === 0) {
    return { number: 5, size: "BIG", color: "GREEN_VIOLET", confidence: 20, method: "MARKOV" };
  }

  let bestNum = 0, bestProb = 0;
  for (let n = 0; n <= 9; n++) {
    const prob = matrix[lastNum][n] / total;
    if (prob > bestProb) { bestProb = prob; bestNum = n; }
  }

  const confidence = Math.min(85, Math.round(bestProb * 100 + 10));
  const size = bestNum >= 5 ? "BIG" : "SMALL";
  let color = "GREEN";
  if (bestNum === 0) color = "RED_VIOLET"; else if (bestNum === 5) color = "GREEN_VIOLET"; else if ([2,4,6,8].includes(bestNum)) color = "RED";

  return { number: bestNum, size, color, confidence, method: "MARKOV" };
}
module.exports = { predict };
