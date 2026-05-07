/**
 * Method 8: Bayesian Probability Engine
 * Calculates posterior probability for each number using Bayes' theorem.
 * Activates after 100+ rows.
 */
function predict(features, history) {
  if (features.totalRows < 100 || history.length < 10) {
    return { number: 5, size: "BIG", color: "GREEN_VIOLET", confidence: 0, method: "BAYESIAN" };
  }

  const { freq50 } = features;
  const last3 = history.slice(0, 3).map((h) => h.number);
  const total50 = Object.values(freq50).reduce((a, b) => a + b, 0);

  const posterior = {};
  let totalPosterior = 0;

  for (let n = 0; n <= 9; n++) {
    // Prior: overall frequency with Laplace smoothing
    const prior = total50 > 0 ? (freq50[n] + 1) / (total50 + 10) : 0.1;

    // Likelihood: how often n appeared after the last 2 numbers in sequence
    let seqCount = 0;
    for (let i = 0; i < history.length - 2; i++) {
      if (history[i + 1].number === last3[0] && history[i + 2].number === last3[1]) {
        if (history[i].number === n) seqCount++;
      }
    }
    const seqLikelihood = (seqCount + 1) / (history.length + 10);

    // Removed gap likelihood entirely to stop the AI from betting on "Dead Numbers" (Gambler's Fallacy)
    posterior[n] = prior * seqLikelihood;
    totalPosterior += posterior[n];
  }

  let bestNum = 5, bestProb = 0;
  for (let n = 0; n <= 9; n++) {
    const p = totalPosterior > 0 ? posterior[n] / totalPosterior : 0.1;
    if (p > bestProb) { bestProb = p; bestNum = n; }
  }

  // Confidence scaling: 10% probability (random guess) = 0% confidence. 35% probability = 85% confidence.
  const confidence = Math.max(0, Math.min(85, Math.round((bestProb - 0.10) * 340)));
  const size = bestNum >= 5 ? "BIG" : "SMALL";
  let color = "GREEN";
  if (bestNum === 0) color = "RED_VIOLET"; else if (bestNum === 5) color = "GREEN_VIOLET"; else if ([2,4,6,8].includes(bestNum)) color = "RED";

  return { number: bestNum, size, color, confidence, method: "BAYESIAN" };
}
module.exports = { predict };
