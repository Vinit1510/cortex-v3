/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║          CORTEX V3 — Neural Engine Server                   ║
 * ║     24/7 Autonomous Data Mining & Prediction System         ║
 * ║                                                             ║
 * ║  10-Method Ensemble AI | CSV Storage | IST Timezone         ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

const express = require("express");
const fs = require("fs");
const path = require("path");
const { buildFeatures, parseCSV, ensureCSV, getColor, CSV_PATH, CSV_HEADERS } = require("./core/features");
const { runAllMethods } = require("./core/engine_loader");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── State ────────────────────────────────────────────────────
const state = {
  "1M": { lastPred: null, lastId: null, lastFetchedAt: null },
  "30S": { lastPred: null, lastId: null, lastFetchedAt: null },
};

// ─── Method Weights (persisted to JSON) ───────────────────────
const WEIGHTS_PATH = path.join(__dirname, "method_weights.json");
let methodWeights = new Map();

function loadWeights() {
  try {
    if (fs.existsSync(WEIGHTS_PATH)) {
      const data = JSON.parse(fs.readFileSync(WEIGHTS_PATH, "utf-8"));
      methodWeights = new Map(Object.entries(data));
      console.log("[WEIGHTS] Loaded saved weights:", methodWeights.size, "methods");
    }
  } catch { console.log("[WEIGHTS] No saved weights found, starting fresh"); }
}

function saveWeights() {
  try {
    const obj = Object.fromEntries(methodWeights);
    fs.writeFileSync(WEIGHTS_PATH, JSON.stringify(obj, null, 2));
  } catch (err) { console.error("[WEIGHTS] Save error:", err.message); }
}

function getWeightMap() {
  const m = new Map();
  for (const [method, stats] of methodWeights.entries()) {
    const acc = stats.total > 0 ? stats.wins / stats.total : 0.5;
    m.set(method, Math.max(0.1, acc));
  }
  return m;
}

function updateWeights(allResults, actualSize, actualNum) {
  for (const r of allResults) {
    if (!methodWeights.has(r.method)) methodWeights.set(r.method, { wins: 0, total: 0 });
    const stats = methodWeights.get(r.method);
    stats.total++;
    if (r.size === actualSize) stats.wins++;
  }
  saveWeights();
}

function getMethodAccuracies() {
  return Array.from(methodWeights.entries()).map(([method, stats]) => ({
    method,
    wins: stats.wins,
    total: stats.total,
    accuracy: stats.total > 0 ? Math.round((stats.wins / stats.total) * 100) : 0,
  }));
}

// ─── IST Helpers ──────────────────────────────────────────────
function nowIST() {
  const now = new Date();
  const istStr = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
  const ist = new Date(istStr);
  const date = `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, "0")}-${String(ist.getDate()).padStart(2, "0")}`;
  const time = `${String(ist.getHours()).padStart(2, "0")}:${String(ist.getMinutes()).padStart(2, "0")}:${String(ist.getSeconds()).padStart(2, "0")}`;
  const hour = String(ist.getHours());
  return { date, time, hour };
}

// ─── Game API Fetch ───────────────────────────────────────────
const ENDPOINTS = {
  "1M": "https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json",
  "30S": "https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json",
};
const FETCH_HEADERS = {
  accept: "application/json",
  referer: "https://jalwaapp2.com/",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
};

// ─── Mining Loop ──────────────────────────────────────────────
async function mineLoop(gameType) {
  try {
    const url = `${ENDPOINTS[gameType]}?ts=${Date.now()}`;
    const res = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return;
    const json = await res.json();
    const history = json.data.list;
    if (!history || history.length < 3) return;

    const gs = state[gameType];
    gs.lastFetchedAt = new Date().toISOString();
    const latest = history[0];

    // Skip if same round
    if (gs.lastId === latest.issueNumber) return;

    // Evaluate previous prediction
    if (gs.lastPred && gs.lastPred.targetId === latest.issueNumber) {
      gs.lastId = latest.issueNumber;
      const actualNum = parseInt(latest.number);
      const actualSize = actualNum >= 5 ? "BIG" : "SMALL";
      const actualColor = getColor(actualNum);

      const numWin = actualNum === gs.lastPred.n ? "WIN" : "LOSS";
      const sizeWin = actualSize === gs.lastPred.sz ? "WIN" : "LOSS";
      const colorWin =
        actualColor === gs.lastPred.col ||
        (actualColor.includes("RED") && gs.lastPred.col.includes("RED")) ||
        (actualColor.includes("GREEN") && gs.lastPred.col.includes("GREEN"))
          ? "WIN" : "LOSS";

      // Update method weights
      if (gs.lastPred.allMethods) {
        updateWeights(gs.lastPred.allMethods, actualSize, actualNum);
      }

      // Write to CSV
      const { date, time, hour } = nowIST();
      const row = [gameType, date, time, hour, latest.issueNumber,
        actualNum, actualSize, actualColor,
        gs.lastPred.n, gs.lastPred.sz, gs.lastPred.col,
        gs.lastPred.method, numWin, sizeWin, colorWin,
        gs.lastPred.confidence, gs.lastPred.source
      ].join(",");

      ensureCSV();
      fs.appendFileSync(CSV_PATH, row + "\n");
      console.log(`[${gameType}] ${latest.issueNumber} | Size:${sizeWin} Num:${numWin} Color:${colorWin} | ${gs.lastPred.method}`);
    }

    // Generate new prediction
    const { features, history: csvHistory } = buildFeatures(gameType);
    const weights = getWeightMap();
    const { allResults, final } = runAllMethods(features, csvHistory, weights);

    const source = features.totalRows >= 100 ? "NEURAL" : "STATISTICAL";
    const nextId = String(BigInt(latest.issueNumber) + 1n);

    gs.lastPred = {
      n: final.number, sz: final.size, col: final.color,
      method: final.method, confidence: final.confidence, source,
      targetId: nextId,
      allMethods: allResults.map((r) => ({ method: r.method, number: r.number, size: r.size, color: r.color, confidence: r.confidence })),
    };

  } catch (err) {
    console.error(`[${gameType}] Error:`, err.message);
  }
}

// ─── API Routes ───────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// Stats endpoint
app.get("/api/stats", (req, res) => {
  const game = req.query.game === "30S" ? "30S" : "1M";
  const dateFilter = req.query.date || null;
  const gs = state[game];
  const allRows = parseCSV().filter((r) => r.gameType === game);

  // Current prediction
  const prediction = gs.lastPred ? {
    number: gs.lastPred.n, size: gs.lastPred.sz, color: gs.lastPred.col,
    method: gs.lastPred.method, confidence: gs.lastPred.confidence,
    source: gs.lastPred.source, targetId: gs.lastPred.targetId,
    allMethods: gs.lastPred.allMethods || [],
  } : null;

  // Recent results (last 15)
  const recent = allRows.slice(-15).reverse().map((r) => ({
    periodId: r.periodId, actualNum: r.actualNum, actualSize: r.actualSize, actualColor: r.actualColor,
    predNum: r.predNum, predSize: r.predSize, predColor: r.predColor,
    pattern: r.pattern, numWin: r.numWin, sizeWin: r.sizeWin, colorWin: r.colorWin,
    time: r.time, confidence: r.confidence, source: r.source,
  }));

  // Rolling pulse — last 10 and 20 minutes
  const nowMs = Date.now();
  const rolling10 = computeRolling(allRows, 10, nowMs);
  const rolling20 = computeRolling(allRows, 20, nowMs);

  // Hourly analytics
  const hourlyFilter = dateFilter ? allRows.filter((r) => r.date === dateFilter) : allRows;
  const hourly = computeHourly(hourlyFilter);

  // Method leaderboard
  const methods = getMethodAccuracies();

  // Engine status
  const engineStatus = {
    totalRows: allRows.length,
    source: allRows.length >= 100 ? "NEURAL" : "STATISTICAL",
    lastFetchedAt: gs.lastFetchedAt,
  };

  res.json({ prediction, recent, rolling10, rolling20, hourly, methods, engineStatus });
});

// Clear data
app.delete("/api/clear/:mode", (req, res) => {
  const mode = req.params.mode === "30S" ? "30S" : "1M";
  const allRows = parseCSV();
  const kept = allRows.filter((r) => r.gameType !== mode);
  const lines = [CSV_HEADERS, ...kept.map((r) =>
    [r.gameType, r.date, r.time, r.hour, r.periodId, r.actualNum, r.actualSize, r.actualColor,
     r.predNum, r.predSize, r.predColor, r.pattern, r.numWin, r.sizeWin, r.colorWin, r.confidence, r.source].join(",")
  )];
  fs.writeFileSync(CSV_PATH, lines.join("\n") + "\n");
  state[mode].lastPred = null;
  state[mode].lastId = null;
  res.json({ ok: true, message: `Cleared ${mode} data` });
});

// Download CSV
app.get("/data", (req, res) => {
  ensureCSV();
  res.download(CSV_PATH, "intel.csv");
});

// Health check (for UptimeRobot)
app.get("/health", (req, res) => res.json({ status: "alive", uptime: process.uptime() }));

// ─── Helpers ──────────────────────────────────────────────────
function computeRolling(rows, minutes, nowMs) {
  const cutoff = nowMs - minutes * 60 * 1000;
  const recent = rows.filter((r) => {
    const dt = new Date(`${r.date}T${r.time}+05:30`);
    return dt.getTime() >= cutoff;
  });

  const total = recent.length;
  if (total === 0) return { rounds: 0, sizeWin: 0, numWin: 0, colorWin: 0 };

  const sizeWins = recent.filter((r) => r.sizeWin === "WIN").length;
  const numWins = recent.filter((r) => r.numWin === "WIN").length;
  const colorWins = recent.filter((r) => r.colorWin === "WIN").length;

  return {
    rounds: total,
    sizeWin: Math.round((sizeWins / total) * 100),
    numWin: Math.round((numWins / total) * 100),
    colorWin: Math.round((colorWins / total) * 100),
  };
}

function computeHourly(rows) {
  const groups = {};
  for (const r of rows) {
    const key = `${r.date}|${r.hour}`;
    if (!groups[key]) groups[key] = { date: r.date, hour: r.hour, total: 0, sizeW: 0, numW: 0, colorW: 0 };
    groups[key].total++;
    if (r.sizeWin === "WIN") groups[key].sizeW++;
    if (r.numWin === "WIN") groups[key].numW++;
    if (r.colorWin === "WIN") groups[key].colorW++;
  }

  return Object.values(groups)
    .map((g) => ({
      date: g.date,
      hour: `${g.hour}:00`,
      rounds: g.total,
      sizePercent: Math.round((g.sizeW / g.total) * 100),
      numPercent: Math.round((g.numW / g.total) * 100),
      colorPercent: Math.round((g.colorW / g.total) * 100),
    }))
    .sort((a, b) => `${b.date}${b.hour}`.localeCompare(`${a.date}${a.hour}`));
}

// ─── Start Server & Miners ────────────────────────────────────
loadWeights();
ensureCSV();

app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║   CORTEX V3 Neural Engine Active         ║`);
  console.log(`║   Dashboard: http://localhost:${PORT}        ║`);
  console.log(`║   Mining: WinGo 1M + 30S                 ║`);
  console.log(`║   Storage: intel.csv                     ║`);
  console.log(`╚══════════════════════════════════════════╝\n`);

  // Start mining loops
  mineLoop("1M");
  mineLoop("30S");
  setInterval(() => mineLoop("1M"), 9000);   // Every 9 seconds
  setInterval(() => mineLoop("30S"), 9000);  // Every 9 seconds
});
