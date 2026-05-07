/**
 * Method 1: Frequency Equilibrium
 * Predicts the COLDEST number (appeared LEAST in last 50 rounds).
 * Logic: RNG will eventually balance, so underrepresented numbers are "due."
 */
function predict(features, history) {
  const { freq50 } = features;
  const total = Object.values(freq50).reduce((a, b) => a + b, 0);
  const avgFreq = total / 10;

  let coldestNum = 0, coldestFreq = Infinity;
  for (let n = 0; n <= 9; n++) {
    if (freq50[n] < coldestFreq) { coldestFreq = freq50[n]; coldestNum = n; }
  }

  const deviation = avgFreq > 0 ? (avgFreq - coldestFreq) / avgFreq : 0;
  const confidence = Math.min(85, Math.round(30 + deviation * 55));
  const size = coldestNum >= 5 ? "BIG" : "SMALL";
  let color = "GREEN";
  if (coldestNum === 0) color = "RED_VIOLET";
  else if (coldestNum === 5) color = "GREEN_VIOLET";
  else if ([2, 4, 6, 8].includes(coldestNum)) color = "RED";

  return { number: coldestNum, size, color, confidence, method: "FREQ_EQUILIBRIUM" };
}
module.exports = { predict };
