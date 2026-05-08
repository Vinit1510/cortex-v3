/**
 * Method 7: Markov Chain Transition Matrix
 * Builds a 10x10 probability matrix. Given the last number, predicts the most likely next.
 * Activates after 100+ rows.
 */
function predict(features, history) {
  if (features.totalRows < 100 || history.length < 5) {
    return { number: 5, size: "BIG", color: "GREEN_VIOLET", confidence: 0, method: "MARKOV" };
  }

  const matrix2 = {}; // 2-step transition map: "N2-N1" -> count array
  const matrix1 = Array.from({ length: 10 }, () => Array(10).fill(0));
  const counts1 = Array(10).fill(0);
  const len = Math.min(history.length, 500);

  for (let i = 1; i < len - 1; i++) {
    const from1 = history[i].number;
    const from2 = history[i + 1].number;
    const to = history[i - 1].number;
    
    if (from1 >= 0 && from1 <= 9 && to >= 0 && to <= 9) { 
      matrix1[from1][to]++; 
      counts1[from1]++; 
      
      const key2 = `${from2}-${from1}`;
      if (!matrix2[key2]) matrix2[key2] = { counts: Array(10).fill(0), total: 0 };
      matrix2[key2].counts[to]++;
      matrix2[key2].total++;
    }
  }

  const lastNum = history[0].number;
  const prevNum = history[1].number;
  const keyToFind = `${prevNum}-${lastNum}`;
  
  let bestNum = 0, bestProb = 0;
  
  if (matrix2[keyToFind] && matrix2[keyToFind].total > 0) {
    // Use deep memory (2-step)
    const total = matrix2[keyToFind].total;
    for (let n = 0; n <= 9; n++) {
      const prob = matrix2[keyToFind].counts[n] / total;
      if (prob > bestProb) { bestProb = prob; bestNum = n; }
    }
  } else if (counts1[lastNum] > 0) {
    // Fallback to 1-step
    const total = counts1[lastNum];
    for (let n = 0; n <= 9; n++) {
      const prob = matrix1[lastNum][n] / total;
      if (prob > bestProb) { bestProb = prob; bestNum = n; }
    }
  } else {
    return { number: 5, size: "BIG", color: "GREEN_VIOLET", confidence: 20, method: "MARKOV" };
  }


  const confidence = Math.min(85, Math.round(bestProb * 100 + 10));
  const size = bestNum >= 5 ? "BIG" : "SMALL";
  let color = "GREEN";
  if (bestNum === 0) color = "RED_VIOLET"; else if (bestNum === 5) color = "GREEN_VIOLET"; else if ([2,4,6,8].includes(bestNum)) color = "RED";

  return { number: bestNum, size, color, confidence, method: "MARKOV" };
}
module.exports = { predict };
