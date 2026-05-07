/**
 * CORTEX V3 — Feature Engineering Module (PostgreSQL Version)
 * Reads game data from database and builds statistical feature vectors.
 */
const { pool } = require("./db");

function getColor(n) {
  if (n === 0) return "RED_VIOLET";
  if (n === 5) return "GREEN_VIOLET";
  if ([1, 3, 7, 9].includes(n)) return "GREEN";
  return "RED";
}

async function buildFeatures(gameType) {
  // Get last 500 rows for this game type (ALL algorithms, not filtered)
  const [rowsRes, countRes] = await Promise.all([
    pool.query(
      `SELECT actual_num, actual_size, actual_color, period_id
       FROM predictions WHERE game_type = $1
       ORDER BY id DESC LIMIT 500`,
      [gameType]
    ),
    pool.query(
      `SELECT COUNT(DISTINCT period_id) as cnt FROM predictions WHERE game_type = $1`,
      [gameType]
    ),
  ]);

  const totalRows = parseInt(countRes.rows[0].cnt) || 0;

  const history = rowsRes.rows.map((r) => ({
    number: r.actual_num,
    size: r.actual_num >= 5 ? "BIG" : "SMALL",
    color: r.actual_color,
    periodId: r.period_id,
  }));

  if (history.length === 0) return { features: emptyFeatures(totalRows), history };

  const nums = history.map((h) => h.number);
  const sizes = history.map((h) => h.size);
  const colors = history.map((h) => h.color);

  // Frequency counts
  const freq20 = {}, freq50 = {};
  for (let i = 0; i <= 9; i++) { freq20[i] = 0; freq50[i] = 0; }
  nums.slice(0, 20).forEach((n) => { freq20[n] = (freq20[n] || 0) + 1; });
  nums.slice(0, 50).forEach((n) => { freq50[n] = (freq50[n] || 0) + 1; });

  // BIG/SMALL ratios
  const countBig = (a) => a.filter((s) => s === "BIG").length;
  const bigSmallRatio10 = Math.min(10, sizes.length) > 0 ? countBig(sizes.slice(0, 10)) / Math.min(10, sizes.length) : 0.5;
  const bigSmallRatio20 = Math.min(20, sizes.length) > 0 ? countBig(sizes.slice(0, 20)) / Math.min(20, sizes.length) : 0.5;
  const bigSmallRatio50 = Math.min(50, sizes.length) > 0 ? countBig(sizes.slice(0, 50)) / Math.min(50, sizes.length) : 0.5;

  // RED/GREEN ratios
  const isRed = (c) => c && c.includes("RED");
  const redGreenRatio10 = Math.min(10, colors.length) > 0 ? colors.slice(0, 10).filter(isRed).length / Math.min(10, colors.length) : 0.5;
  const redGreenRatio20 = Math.min(20, colors.length) > 0 ? colors.slice(0, 20).filter(isRed).length / Math.min(20, colors.length) : 0.5;
  const redGreenRatio50 = Math.min(50, colors.length) > 0 ? colors.slice(0, 50).filter(isRed).length / Math.min(50, colors.length) : 0.5;

  // Streak detection
  let currentStreakLen = 1;
  const firstSize = sizes[0];
  while (currentStreakLen < sizes.length && sizes[currentStreakLen] === firstSize) currentStreakLen++;
  const currentStreakDir = firstSize || "NONE";

  // Gap analysis
  const gapAnalysis = {};
  for (let n = 0; n <= 9; n++) { const idx = nums.indexOf(n); gapAnalysis[n] = idx === -1 ? 50 : idx; }

  // IST time
  const istStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
  const ist = new Date(istStr);

  // Moving averages
  const avg = (a) => a.length > 0 ? a.reduce((x, y) => x + y, 0) / a.length : 4.5;
  const movingAvg5 = avg(nums.slice(0, 5));
  const movingAvg10 = avg(nums.slice(0, 10));
  const movingAvg20 = avg(nums.slice(0, 20));

  // Volatility
  const n10 = nums.slice(0, 10);
  const mean10 = avg(n10);
  const volatility = Math.sqrt(n10.reduce((s, n) => s + (n - mean10) ** 2, 0) / Math.max(1, n10.length));

  // Hot/Cold numbers
  const freq30 = {};
  for (let i = 0; i <= 9; i++) freq30[i] = 0;
  nums.slice(0, 30).forEach((n) => { freq30[n] = (freq30[n] || 0) + 1; });
  const sorted = Object.entries(freq30).sort(([, a], [, b]) => b - a);
  const hotNumbers = sorted.slice(0, 3).map(([n]) => parseInt(n));
  const coldNumbers = sorted.slice(-3).map(([n]) => parseInt(n));

  // Parity
  const last10nums = nums.slice(0, 10);
  const parityRatio = last10nums.length > 0 ? last10nums.filter((n) => n % 2 !== 0).length / last10nums.length : 0.5;

  return {
    features: {
      last10nums, freq20, freq50, bigSmallRatio10, bigSmallRatio20, bigSmallRatio50,
      redGreenRatio10, redGreenRatio20, redGreenRatio50, currentStreakLen, currentStreakDir,
      gapAnalysis, hourOfDay: ist.getHours(), dayOfWeek: ist.getDay(),
      movingAvg5, movingAvg10, movingAvg20, volatility, hotNumbers, coldNumbers, parityRatio, totalRows,
    },
    history,
  };
}

function emptyFeatures(totalRows = 0) {
  const freq = {};
  for (let i = 0; i <= 9; i++) freq[i] = 0;
  return {
    last10nums: [], freq20: { ...freq }, freq50: { ...freq },
    bigSmallRatio10: 0.5, bigSmallRatio20: 0.5, bigSmallRatio50: 0.5,
    redGreenRatio10: 0.5, redGreenRatio20: 0.5, redGreenRatio50: 0.5,
    currentStreakLen: 0, currentStreakDir: "NONE", gapAnalysis: { ...freq },
    hourOfDay: new Date().getHours(), dayOfWeek: new Date().getDay(),
    movingAvg5: 4.5, movingAvg10: 4.5, movingAvg20: 4.5, volatility: 3,
    hotNumbers: [0, 1, 2], coldNumbers: [7, 8, 9], parityRatio: 0.5, totalRows,
  };
}

module.exports = { buildFeatures, getColor };
