/**
 * Method 10: Ensemble Voting Engine
 * Combines ALL other methods using weighted voting.
 * Filters out dead methods (confidence=0). Dynamically weights by accuracy.
 */
function predict(features, history) {
  // Fallback — this only runs if ensemble() is not called
  const size = features.bigSmallRatio10 < 0.5 ? "BIG" : "SMALL";
  const pool = size === "BIG" ? [5, 6, 7, 8, 9] : [0, 1, 2, 3, 4];
  return { number: pool[2], size, color: "GREEN", confidence: 30, method: "ENSEMBLE" };
}

function ensemble(allResults, features, history, weights) {
  // CRITICAL FIX: Filter out dead methods (confidence === 0)
  const active = allResults.filter((r) => r.confidence > 0 && r.method !== "ENSEMBLE");

  if (active.length === 0) {
    return { number: 5, size: "BIG", color: "GREEN_VIOLET", confidence: 0, method: "ENSEMBLE" };
  }

  const sizeWeights = { BIG: 0, SMALL: 0 };
  const numWeights = {};
  let totalWeight = 0;
  let maxConfMethod = active[0];

  for (const r of active) {
    const baseWeight = weights.get(r.method) || 1.0;
    const confWeight = r.confidence / 100;
    const w = baseWeight * confWeight;
    if (w <= 0) continue;

    sizeWeights[r.size] = (sizeWeights[r.size] || 0) + w;
    numWeights[r.number] = (numWeights[r.number] || 0) + w;
    totalWeight += w;
    if (r.confidence > maxConfMethod.confidence) maxConfMethod = r;
  }

  if (totalWeight === 0) {
    return { number: 5, size: "BIG", color: "GREEN_VIOLET", confidence: 0, method: "ENSEMBLE" };
  }

  const finalSize = (sizeWeights.BIG || 0) >= (sizeWeights.SMALL || 0) ? "BIG" : "SMALL";
  const numEntries = Object.entries(numWeights).sort(([, a], [, b]) => b - a);
  const finalNum = numEntries.length > 0 ? parseInt(numEntries[0][0]) : 5;

  // Confidence = agreement strength × weighted average confidence
  const sizeAgreement = Math.max(sizeWeights.BIG || 0, sizeWeights.SMALL || 0) / totalWeight;
  const weightedConf = active.reduce((sum, r) => sum + r.confidence * (weights.get(r.method) || 1), 0)
    / active.reduce((sum, r) => sum + (weights.get(r.method) || 1), 0);
  const confidence = Math.min(92, Math.round(sizeAgreement * 50 + weightedConf * 0.5));

  let color = "GREEN";
  if (finalNum === 0) color = "RED_VIOLET";
  else if (finalNum === 5) color = "GREEN_VIOLET";
  else if ([2, 4, 6, 8].includes(finalNum)) color = "RED";

  return {
    number: finalNum, size: finalSize, color, confidence,
    method: `ENSEMBLE(${maxConfMethod.method})`,
  };
}

module.exports = { predict, ensemble };
