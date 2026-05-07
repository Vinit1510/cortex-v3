/**
 * Method 6: Neural Network (Custom Implementation)
 * Feed-forward neural net with backpropagation. Trains on historical data.
 * Activates after 100+ rows. Returns confidence=0 when insufficient data.
 */

const sigmoid = (x) => 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, x))));
const sigmoidDeriv = (x) => x * (1 - x);

let sizeNet = null, colorNet = null, trainedRows = 0;

function initNet(inputSize, hiddenSize, outputSize) {
  const rand = () => (Math.random() - 0.5) * 0.5;
  return {
    w1: Array.from({ length: inputSize }, () => Array.from({ length: hiddenSize }, rand)),
    w2: Array.from({ length: hiddenSize }, () => Array.from({ length: outputSize }, rand)),
    b1: Array.from({ length: hiddenSize }, rand),
    b2: Array.from({ length: outputSize }, rand),
  };
}

function forward(net, input) {
  const hidden = net.b1.map((b, j) =>
    sigmoid(b + input.reduce((sum, x, i) => sum + x * net.w1[i][j], 0))
  );
  const output = net.b2.map((b, j) =>
    sigmoid(b + hidden.reduce((sum, h, i) => sum + h * net.w2[i][j], 0))
  );
  return { hidden, output };
}

function train(net, input, target, lr = 0.05) {
  const { hidden, output } = forward(net, input);
  const outErr = output.map((o, i) => target[i] - o);
  const outDelta = output.map((o, i) => outErr[i] * sigmoidDeriv(o));
  const hidErr = hidden.map((_, i) => outDelta.reduce((s, d, j) => s + d * net.w2[i][j], 0));
  const hidDelta = hidden.map((h, i) => hidErr[i] * sigmoidDeriv(h));
  for (let i = 0; i < net.w2.length; i++)
    for (let j = 0; j < net.w2[i].length; j++) net.w2[i][j] += lr * hidden[i] * outDelta[j];
  for (let i = 0; i < net.w1.length; i++)
    for (let j = 0; j < net.w1[i].length; j++) net.w1[i][j] += lr * input[i] * hidDelta[j];
  net.b1 = net.b1.map((b, j) => b + lr * hidDelta[j]);
  net.b2 = net.b2.map((b, j) => b + lr * outDelta[j]);
}

function featuresToVec(f) {
  const nums = (f.last10nums || []).map((n) => n / 9);
  while (nums.length < 10) nums.push(0.5);
  return [
    ...nums, f.bigSmallRatio10, f.bigSmallRatio20, f.bigSmallRatio50,
    f.redGreenRatio10, f.redGreenRatio20, f.currentStreakLen / 10,
    f.movingAvg5 / 9, f.movingAvg10 / 9, f.movingAvg20 / 9,
    f.volatility / 4.5, f.hourOfDay / 23, f.dayOfWeek / 6, f.parityRatio,
  ];
}

function retrain(history) {
  if (history.length < 20) return;
  const INPUT = 23;
  const HIDDEN = 16;
  if (!sizeNet) sizeNet = initNet(INPUT, HIDDEN, 1);
  if (!colorNet) colorNet = initNet(INPUT, HIDDEN, 1);

  const window = history.slice(0, Math.min(1500, history.length));
  for (let epoch = 0; epoch < 3; epoch++) {
    for (let i = 10; i < window.length; i++) {
      const past = window.slice(i, i + 10).map((h) => h.number);
      if (past.length < 10) continue;
      const bigCount = past.filter((n) => n >= 5).length;
      const redCount = window.slice(i, i + 10).filter((h) => h.color && h.color.includes("RED")).length;
      const avg5 = past.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
      const avg10 = past.reduce((a, b) => a + b, 0) / 10;
      const mean = avg10;
      const vol = Math.sqrt(past.reduce((s, n) => s + (n - mean) ** 2, 0) / 10);

      const vec = [
        ...past.map((n) => n / 9),
        bigCount / 10, bigCount / 10, bigCount / 10,
        redCount / 10, redCount / 10, 0,
        avg5 / 9, avg10 / 9, avg10 / 9,
        vol / 4.5, 0, 0, 0.5,
      ];

      const actual = window[i - 1];
      train(sizeNet, vec, [actual.size === "BIG" ? 1 : 0]);
      train(colorNet, vec, [actual.color && actual.color.includes("RED") ? 1 : 0]);
    }
  }
  trainedRows = history.length;
  console.log(`[NEURAL] Trained on ${trainedRows} rows`);
}

function predict(features, history) {
  if (features.totalRows < 100) {
    return { number: 5, size: "BIG", color: "GREEN_VIOLET", confidence: 0, method: "NEURAL_NETWORK" };
  }

  if (!sizeNet || !colorNet || trainedRows < features.totalRows - 100) {
    retrain(history);
  }
  if (!sizeNet || !colorNet) {
    return { number: 5, size: "BIG", color: "GREEN_VIOLET", confidence: 0, method: "NEURAL_NETWORK" };
  }

  const vec = featuresToVec(features);
  const { output: sizeOut } = forward(sizeNet, vec);
  const { output: colorOut } = forward(colorNet, vec);

  const sizeBig = sizeOut[0] > 0.5;
  const targetSize = sizeBig ? "BIG" : "SMALL";
  const targetRed = colorOut[0] > 0.5;

  const pool = targetSize === "BIG" ? [5, 6, 7, 8, 9] : [0, 1, 2, 3, 4];
  const last3 = new Set((features.last10nums || []).slice(0, 3));
  const candidates = pool.filter((n) => !last3.has(n));
  const n = candidates.length > 0 ? candidates[Math.floor(candidates.length / 2)] : pool[2];

  const sizeConf = Math.abs(sizeOut[0] - 0.5) * 2;
  const colorConf = Math.abs(colorOut[0] - 0.5) * 2;
  const confidence = Math.min(90, Math.round((sizeConf + colorConf) / 2 * 70 + 20));

  let color = "GREEN";
  if (n === 0) color = "RED_VIOLET"; else if (n === 5) color = "GREEN_VIOLET";
  else if ([2, 4, 6, 8].includes(n)) color = targetRed ? "RED" : "GREEN";

  return { number: n, size: targetSize, color, confidence, method: "NEURAL_NETWORK" };
}

module.exports = { predict };
