/**
 * CORTEX V3 — Engine Loader (Plugin Architecture)
 * Auto-detects and loads ALL .js method files from the engines/v3/ folder.
 * No filenames are hardcoded — just drop a new file in and it auto-loads.
 */

const fs = require("fs");
const path = require("path");

const V3_DIR = path.join(__dirname, "..", "engines", "v3");

function loadAllMethods() {
  const files = fs.readdirSync(V3_DIR)
    .filter((f) => f.endsWith(".js") && !f.startsWith("_"))
    .sort();

  const methods = [];
  const ensembleMethod = { fn: null };

  for (const file of files) {
    try {
      const mod = require(path.join(V3_DIR, file));
      if (typeof mod.predict === "function") {
        methods.push({ predict: mod.predict, file });
      }
      if (typeof mod.ensemble === "function") {
        ensembleMethod.fn = mod.ensemble;
      }
    } catch (err) {
      console.error(`[ENGINE_LOADER] Failed to load ${file}:`, err.message);
    }
  }

  return { methods, ensembleMethod: ensembleMethod.fn };
}

function runAllMethods(features, history, weights) {
  const { methods, ensembleMethod } = loadAllMethods();

  // Run all regular methods (exclude ensemble)
  const allResults = [];
  for (const m of methods) {
    try {
      const result = m.predict(features, history);
      if (result && typeof result.confidence === "number") {
        allResults.push(result);
      }
    } catch (err) {
      console.error(`[ENGINE] Method error:`, err.message);
    }
  }

  // Get the final prediction from ensemble (or fallback to weighted vote)
  let final;
  if (ensembleMethod) {
    try {
      final = ensembleMethod(allResults, features, history, weights);
    } catch {
      final = weightedVote(allResults, weights);
    }
  } else {
    final = weightedVote(allResults, weights);
  }

  return { allResults, final };
}

function weightedVote(results, weights) {
  // FILTER OUT dead methods (confidence = 0)
  const active = results.filter((r) => r.confidence > 0);

  if (active.length === 0) {
    return { number: 5, size: "BIG", color: "GREEN_VIOLET", confidence: 0, method: "DEFAULT" };
  }

  const sizeVotes = { BIG: 0, SMALL: 0 };
  const numVotes = {};
  let totalWeight = 0;
  let totalConf = 0;

  for (const r of active) {
    const w = (weights.get(r.method) || 1) * (r.confidence / 100);
    sizeVotes[r.size] = (sizeVotes[r.size] || 0) + w;
    numVotes[r.number] = (numVotes[r.number] || 0) + w;
    totalWeight += w;
    totalConf += r.confidence;
  }

  const numEntries = Object.entries(numVotes).sort(([, a], [, b]) => b - a);
  const finalNum = numEntries.length > 0 ? parseInt(numEntries[0][0]) : 5;
  const finalSize = finalNum >= 5 ? "BIG" : "SMALL";
  const avgConf = Math.round(totalConf / active.length);
  const bestMethod = active.reduce((a, b) => (a.confidence >= b.confidence ? a : b));

  let color = "GREEN";
  if (finalNum === 0) color = "RED_VIOLET";
  else if (finalNum === 5) color = "GREEN_VIOLET";
  else if ([2, 4, 6, 8].includes(finalNum)) color = "RED";

  return { number: finalNum, size: finalSize, color, confidence: avgConf, method: `ENSEMBLE(${bestMethod.method})` };
}

module.exports = { runAllMethods, loadAllMethods };
