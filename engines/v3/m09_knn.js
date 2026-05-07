/**
 * Method 9: K-Nearest Sequence Match (KNN)
 * Finds the 5 most similar historical 5-number sequences and predicts what came next.
 * Activates after 100+ rows.
 */
function predict(features, history) {
  if (features.totalRows < 100 || history.length < 10) {
    return { number: 5, size: "BIG", color: "GREEN_VIOLET", confidence: 0, method: "KNN" };
  }

  const K = 5, SEQ_LEN = 5;
  const query = history.slice(0, SEQ_LEN).map((h) => h.number);
  if (query.length < SEQ_LEN) {
    return { number: 5, size: "BIG", color: "GREEN_VIOLET", confidence: 20, method: "KNN" };
  }

  const candidates = [];
  const searchLen = Math.min(history.length - 1, 400);
  for (let i = SEQ_LEN; i < searchLen; i++) {
    const seq = history.slice(i, i + SEQ_LEN).map((h) => h.number);
    if (seq.length < SEQ_LEN) continue;
    const dist = Math.sqrt(seq.reduce((sum, n, j) => sum + (n - query[j]) ** 2, 0));
    candidates.push({ dist, nextNum: history[i - 1].number });
  }

  candidates.sort((a, b) => a.dist - b.dist);
  const kNearest = candidates.slice(0, K);
  if (kNearest.length === 0) {
    return { number: 5, size: "BIG", color: "GREEN_VIOLET", confidence: 20, method: "KNN" };
  }

  const votes = {};
  for (const { nextNum } of kNearest) { votes[nextNum] = (votes[nextNum] || 0) + 1; }
  const best = Object.entries(votes).sort(([, a], [, b]) => b - a)[0];
  const bestNum = parseInt(best[0]);
  const agreement = parseInt(best[1]) / K;
  const confidence = Math.min(85, Math.round(agreement * 80 + 10));

  const size = bestNum >= 5 ? "BIG" : "SMALL";
  let color = "GREEN";
  if (bestNum === 0) color = "RED_VIOLET"; else if (bestNum === 5) color = "GREEN_VIOLET"; else if ([2,4,6,8].includes(bestNum)) color = "RED";

  return { number: bestNum, size, color, confidence, method: "KNN" };
}
module.exports = { predict };
