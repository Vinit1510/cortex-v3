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

  const sizeVotes = { BIG: 0, SMALL: 0 };
  let maxConfMethod = active[0];

  for (const r of active) {
    sizeVotes[r.size]++;
    if (r.confidence > maxConfMethod.confidence) maxConfMethod = r;
  }

  const totalActive = active.length;
  const bigVotes = sizeVotes.BIG;
  const smallVotes = sizeVotes.SMALL;
  
  // STRICT DEMOCRATIC CONSENSUS: At least 60% of active models MUST agree on Size.
  const requiredVotes = Math.ceil(totalActive * 0.60); 
  const majoritySize = bigVotes >= requiredVotes ? "BIG" : (smallVotes >= requiredVotes ? "SMALL" : null);

  if (!majoritySize) {
    return { number: 5, size: "BIG", color: "GREEN_VIOLET", confidence: 0, method: "ENSEMBLE(CONTRADICTION)" };
  }

  // Now that we have a valid mathematical majority, weight the numbers WITHIN that majority size
  const numWeights = {};
  for (const r of active) {
    if (r.size !== majoritySize) continue; // Ignore dissenting votes when picking the specific number
    const baseWeight = weights.get(r.method) || 1.0;
    const confWeight = r.confidence / 100;
    const w = baseWeight * confWeight;
    numWeights[r.number] = (numWeights[r.number] || 0) + w;
  }

  const numEntries = Object.entries(numWeights).sort(([, a], [, b]) => b - a);
  const finalNum = numEntries.length > 0 ? parseInt(numEntries[0][0]) : (majoritySize === "BIG" ? 7 : 2);
  const finalSize = finalNum >= 5 ? "BIG" : "SMALL";

  // Confidence calculation
  const voteStrength = Math.max(bigVotes, smallVotes) / totalActive;
  const weightedConf = active.reduce((sum, r) => sum + r.confidence * (weights.get(r.method) || 1), 0)
    / active.reduce((sum, r) => sum + (weights.get(r.method) || 1), 0);
    
  // Base confidence is the weighted confidence. Boosted slightly by vote strength.
  const confidence = Math.min(92, Math.round(weightedConf * 0.7 + voteStrength * 30));

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
