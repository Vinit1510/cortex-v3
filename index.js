/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║          CORTEX V3 — Neural Engine Server                   ║
 * ║     24/7 Autonomous Data Mining & Prediction System         ║
 * ║                                                             ║
 * ║  10-Method Ensemble AI | PostgreSQL Storage | IST Timezone  ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

const express = require("express");
const { pool, initDB } = require("./core/db");
const { buildFeatures, getColor } = require("./core/features");
const { runAllMethods } = require("./core/engine_loader");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── State ────────────────────────────────────────────────────
const state = {
  "1M": { lastPred: null, lastId: null, lastFetchedAt: null, cooldown: 0 },
  "30S": { lastPred: null, lastId: null, lastFetchedAt: null, cooldown: 0 },
};

// ─── Method Weights (persisted in PostgreSQL) ─────────────────
let methodWeights = new Map();

async function loadWeights() {
  try {
    const res = await pool.query("SELECT method, wins, total FROM method_weights");
    methodWeights = new Map();
    for (const row of res.rows) {
      methodWeights.set(row.method, { wins: row.wins, total: row.total });
    }
    console.log("[WEIGHTS] Loaded", methodWeights.size, "methods from database");
  } catch (err) { console.log("[WEIGHTS] Starting fresh:", err.message); }
}

async function saveWeight(method, stats) {
  try {
    await pool.query(
      `INSERT INTO method_weights (method, wins, total, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (method) DO UPDATE SET wins = $2, total = $3, updated_at = NOW()`,
      [method, stats.wins, stats.total]
    );
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

async function updateWeights(allResults, actualSize, actualNum) {
  for (const r of allResults) {
    if (!methodWeights.has(r.method)) methodWeights.set(r.method, { wins: 0, total: 0 });
    const stats = methodWeights.get(r.method);
    stats.total++;
    if (r.size === actualSize) stats.wins++;
    await saveWeight(r.method, stats);
  }
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
    
    // Mark this round as processed immediately to prevent infinite duplicate loops
    gs.lastId = latest.issueNumber;

    // Evaluate previous prediction
    if (gs.lastPred && gs.lastPred.targetId === latest.issueNumber) {
      const actualNum = parseInt(latest.number);
      const actualSize = actualNum >= 5 ? "BIG" : "SMALL";
      const actualColor = getColor(actualNum);

      const isSkip = gs.lastPred.confidence === 0;
      const numWin = isSkip ? "SKIP" : (actualNum === gs.lastPred.n ? "WIN" : "LOSS");
      const sizeWin = isSkip ? "SKIP" : (actualSize === gs.lastPred.sz ? "WIN" : "LOSS");
      const colorWin = isSkip ? "SKIP" : (
        actualColor === gs.lastPred.col ||
        (actualColor.includes("RED") && gs.lastPred.col.includes("RED")) ||
        (actualColor.includes("GREEN") && gs.lastPred.col.includes("GREEN"))
          ? "WIN" : "LOSS"
      );

      // Update method weights in database
      if (gs.lastPred.allMethods) {
        await updateWeights(gs.lastPred.allMethods, actualSize, actualNum);
      }

      // COOLDOWN TRIGGER: If we just lost a HIGH confidence bet, pattern broke. Go to sleep for 3 rounds.
      if (gs.lastPred.confidence >= 65 && sizeWin === "LOSS") {
        gs.cooldown = 3;
        console.log(`[${gameType}] HIGH CONFIDENCE FAILURE DETECTED. Entering 3-round COOLDOWN.`);
      }

      // Insert into database
      const { date, time, hour } = nowIST();
      await pool.query(
        `INSERT INTO predictions
         (game_type, date_ist, time_ist, hour_ist, period_id, actual_num, actual_size, actual_color,
          pred_num, pred_size, pred_color, pattern_used, num_win, size_win, color_win, confidence, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [gameType, date, time, hour, latest.issueNumber,
         actualNum, actualSize, actualColor,
         gs.lastPred.n, gs.lastPred.sz, gs.lastPred.col,
         gs.lastPred.method, numWin, sizeWin, colorWin,
         gs.lastPred.confidence, gs.lastPred.source]
      );

      console.log(`[${gameType}] ${latest.issueNumber} | Size:${sizeWin} Num:${numWin} Color:${colorWin} | ${gs.lastPred.method}`);
    }

    // Generate new prediction
    const { features, history: dbHistory } = await buildFeatures(gameType);
    const source = features.totalRows >= 100 ? "NEURAL" : "STATISTICAL";
    const nextId = String(BigInt(latest.issueNumber) + 1n);

    let final, allResults = [];
    if (gs.cooldown > 0) {
      gs.cooldown--;
      final = { number: 5, size: "BIG", color: "GREEN_VIOLET", confidence: 0, method: "COOLDOWN_ACTIVE" };
      allResults = [final];
    } else {
      const weights = getWeightMap();
      const res = runAllMethods(features, dbHistory, weights);
      allResults = res.allResults;
      final = res.final;
    }

    gs.lastPred = {
      n: final.number, sz: final.size, col: final.color,
      method: final.method, confidence: final.confidence, source,
      targetId: nextId,
      allMethods: allResults.map((r) => ({ method: r.method, number: r.number, size: r.size, color: r.color, confidence: r.confidence })),
    };

    // Server-side isolated Random Prediction Generation for nextId
    const randNum = Math.floor(Math.random() * 10);
    const randSize = randNum >= 5 ? "BIG" : "SMALL";
    const randGetColor = (n) => {
      if (n === 0) return "RED_VIOLET";
      if (n === 5) return "GREEN_VIOLET";
      if ([2,4,6,8].includes(n)) return "RED";
      return "GREEN";
    };
    const randColor = randGetColor(randNum);

    await pool.query(
      `INSERT INTO rand_predictions (game_type, period_id, rand_num, rand_size, rand_color)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (game_type, period_id) DO NOTHING`,
      [gameType, nextId, randNum, randSize, randColor]
    ).catch(err => console.error(`[${gameType}] DB rand_predict err:`, err.message));

  } catch (err) {
    console.error(`[${gameType}] Error:`, err.message);
  }
}

// ─── API Routes ───────────────────────────────────────────────
app.use(express.static(require("path").join(__dirname, "public")));
app.use(express.json());

// Stats endpoint
app.get("/api/stats", async (req, res) => {
  try {
    const game = req.query.game === "30S" ? "30S" : "1M";
    const dateFilter = req.query.date || null;
    const gs = state[game];

    // Current prediction
    const prediction = gs.lastPred ? {
      number: gs.lastPred.n, size: gs.lastPred.sz, color: gs.lastPred.col,
      method: gs.lastPred.method, confidence: gs.lastPred.confidence,
      source: gs.lastPred.source, targetId: gs.lastPred.targetId,
      allMethods: gs.lastPred.allMethods || [],
    } : null;

    // Recent results (last 15)
    const recentRes = await pool.query(
      `SELECT * FROM predictions WHERE game_type = $1 ORDER BY id DESC LIMIT 15`,
      [game]
    );
    const recent = recentRes.rows.map((r) => ({
      periodId: r.period_id, actualNum: r.actual_num, actualSize: r.actual_size, actualColor: r.actual_color,
      predNum: r.pred_num, predSize: r.pred_size, predColor: r.pred_color,
      pattern: r.pattern_used, numWin: r.num_win, sizeWin: r.size_win, colorWin: r.color_win,
      time: r.time_ist, confidence: r.confidence, source: r.source,
    }));

    // Total count
    const countRes = await pool.query(
      `SELECT COUNT(*) as cnt FROM predictions WHERE game_type = $1`, [game]
    );
    const totalRows = parseInt(countRes.rows[0].cnt) || 0;

    // Rolling pulse — last 10 and 20 minutes
    const rolling10 = await computeRolling(game, 10);
    const rolling20 = await computeRolling(game, 20);
    const sureShots = await computeSureShots(game);

    // Hourly analytics
    const hourlyQuery = dateFilter
      ? await pool.query(
          `SELECT date_ist, hour_ist, size_win, num_win, color_win FROM predictions WHERE game_type = $1 AND date_ist = $2`,
          [game, dateFilter])
      : await pool.query(
          `SELECT date_ist, hour_ist, size_win, num_win, color_win FROM predictions WHERE game_type = $1`,
          [game]);
    const hourly = computeHourly(hourlyQuery.rows);

    // Method leaderboard
    const methods = getMethodAccuracies();

    // Engine status
    const engineStatus = {
      totalRows,
      source: totalRows >= 100 ? "NEURAL" : "STATISTICAL",
      lastFetchedAt: gs.lastFetchedAt,
    };

    res.json({ prediction, recent, rolling10, rolling20, sureShots, hourly, methods, engineStatus });
  } catch (err) {
    console.error("[API] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Reset AI Memory (Weights) without deleting mined history
app.post("/api/reset_weights", async (req, res) => {
  await pool.query("DELETE FROM method_weights");
  methodWeights.clear();
  res.json({ ok: true, message: "AI Memory Wiped. Learning from scratch." });
});

// Clear data
app.delete("/api/clear/:mode", async (req, res) => {
  const mode = req.params.mode === "30S" ? "30S" : "1M";
  await pool.query("DELETE FROM predictions WHERE game_type = $1", [mode]);
  await pool.query("DELETE FROM rand_predictions WHERE game_type = $1", [mode]);
  await pool.query("DELETE FROM method_weights");
  methodWeights.clear();
  state[mode].lastPred = null;
  state[mode].lastId = null;
  res.json({ ok: true, message: `Cleared ${mode} data` });
});

// Clear all random predictions
app.post("/api/clear_randomizer", async (req, res) => {
  try {
    await pool.query("DELETE FROM rand_predictions");
    res.json({ ok: true, message: "Cleared all random predictions history" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Store a random prediction for a specific period
app.post("/api/rand_predict", async (req, res) => {
  try {
    const { gameType, periodId, randNum, randSize, randColor } = req.body;
    if (!gameType || !periodId || randNum === undefined) {
      return res.status(400).json({ error: "Missing fields" });
    }
    // INSERT ... ON CONFLICT DO NOTHING so we only store the FIRST prediction per period
    await pool.query(
      `INSERT INTO rand_predictions (game_type, period_id, rand_num, rand_size, rand_color)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (game_type, period_id) DO NOTHING`,
      [gameType, periodId, randNum, randSize, randColor]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get randomizer stats & recent results for comparison
app.get("/api/rand_stats", async (req, res) => {
  try {
    const game = req.query.game === "30S" ? "30S" : "1M";
    const gs = state[game];
    const targetId = gs && gs.lastPred ? gs.lastPred.targetId : null;

    if (targetId) {
      // Check if a random prediction already exists for this active target period
      const checkRes = await pool.query(
        "SELECT id FROM rand_predictions WHERE game_type = $1 AND period_id = $2",
        [game, targetId]
      );
      if (checkRes.rows.length === 0) {
        // Auto-generate one on the fly!
        const randNum = Math.floor(Math.random() * 10);
        const randSize = randNum >= 5 ? "BIG" : "SMALL";
        const randGetColor = (n) => {
          if (n === 0) return "RED_VIOLET";
          if (n === 5) return "GREEN_VIOLET";
          if ([2,4,6,8].includes(n)) return "RED";
          return "GREEN";
        };
        const randColor = randGetColor(randNum);

        await pool.query(
          `INSERT INTO rand_predictions (game_type, period_id, rand_num, rand_size, rand_color)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (game_type, period_id) DO NOTHING`,
          [game, targetId, randNum, randSize, randColor]
        ).catch(err => console.error(`[${game}] On-the-fly rand_predict err:`, err.message));
      }
    }

    // Join rand_predictions with actual predictions to fill in results
    const result = await pool.query(
      `SELECT r.period_id, r.rand_num, r.rand_size, r.rand_color,
              p.actual_num, p.actual_size, p.actual_color,
              CASE WHEN p.actual_size IS NULL THEN 'PENDING'
                   WHEN r.rand_size = p.actual_size THEN 'WIN' ELSE 'LOSS' END AS size_win,
              CASE WHEN p.actual_num IS NULL THEN 'PENDING'
                   WHEN r.rand_num = p.actual_num THEN 'WIN' ELSE 'LOSS' END AS num_win,
              CASE WHEN p.actual_color IS NULL THEN 'PENDING'
                   WHEN r.rand_color = p.actual_color OR
                        (r.rand_color LIKE '%RED%' AND p.actual_color LIKE '%RED%') OR
                        (r.rand_color LIKE '%GREEN%' AND p.actual_color LIKE '%GREEN%')
                        THEN 'WIN' ELSE 'LOSS' END AS color_win,
              r.created_at
       FROM rand_predictions r
       LEFT JOIN predictions p ON r.game_type = p.game_type AND r.period_id = p.period_id
       WHERE r.game_type = $1
       ORDER BY r.created_at DESC
       LIMIT 30`,
      [game]
    );
    const rows = result.rows;
    const played = rows.filter(r => r.size_win !== 'PENDING');
    const total = played.length;
    const sizeWins = played.filter(r => r.size_win === 'WIN').length;
    const colorWins = played.filter(r => r.color_win === 'WIN').length;
    res.json({
      recent: rows,
      stats: {
        total,
        sizeWinRate: total > 0 ? Math.round((sizeWins / total) * 100) : 0,
        colorWinRate: total > 0 ? Math.round((colorWins / total) * 100) : 0,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download CSV (export from database)
app.get("/data", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM predictions ORDER BY id ASC");
    const headers = "GameType,Date_IST,Time_IST,Hour_IST,PeriodID,ActualNum,ActualSize,ActualColor,PredNum,PredSize,PredColor,PatternUsed,NumWin,SizeWin,ColorWin,Confidence,Source";
    const rows = result.rows.map((r) =>
      [r.game_type, r.date_ist, r.time_ist, r.hour_ist, r.period_id,
       r.actual_num, r.actual_size, r.actual_color,
       r.pred_num, r.pred_size, r.pred_color,
       r.pattern_used, r.num_win, r.size_win, r.color_win,
       r.confidence, r.source].join(",")
    );
    const csv = [headers, ...rows].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=intel.csv");
    res.send(csv);
  } catch (err) {
    res.status(500).send("Error exporting CSV");
  }
});

// Health check (for UptimeRobot)
app.get("/health", (req, res) => res.json({ status: "alive", uptime: process.uptime() }));

// ─── Helpers ──────────────────────────────────────────────────
async function computeRolling(game, minutes) {
  try {
    const res = await pool.query(
      `SELECT size_win, num_win, color_win FROM predictions
       WHERE game_type = $1 AND created_at >= NOW() - INTERVAL '${minutes} minutes'`,
      [game]
    );
    const rows = res.rows;
    const playedRows = rows.filter(r => r.size_win !== 'SKIP');
    const total = playedRows.length;
    if (total === 0) return { rounds: rows.length, sizeWin: 0, numWin: 0, colorWin: 0 }; // Still show total mined rounds, but 0% win if none played

    return {
      rounds: total, // Show how many were actually PLAYED
      sizeWin: Math.round((playedRows.filter((r) => r.size_win === "WIN").length / total) * 100),
      numWin: Math.round((playedRows.filter((r) => r.num_win === "WIN").length / total) * 100),
      colorWin: Math.round((playedRows.filter((r) => r.color_win === "WIN").length / total) * 100),
    };
  } catch { return { rounds: 0, sizeWin: 0, numWin: 0, colorWin: 0 }; }
}

async function computeSureShots(game) {
  try {
    const res = await pool.query(
      `SELECT size_win, num_win, color_win FROM predictions
       WHERE game_type = $1 AND confidence >= 65`,
      [game]
    );
    const rows = res.rows;
    const playedRows = rows.filter(r => r.size_win !== 'SKIP');
    const total = playedRows.length;
    if (total === 0) return { rounds: 0, sizeWin: 0, numWin: 0, colorWin: 0 };

    return {
      rounds: total,
      sizeWin: Math.round((playedRows.filter((r) => r.size_win === "WIN").length / total) * 100),
      numWin: Math.round((playedRows.filter((r) => r.num_win === "WIN").length / total) * 100),
      colorWin: Math.round((playedRows.filter((r) => r.color_win === "WIN").length / total) * 100),
    };
  } catch { return { rounds: 0, sizeWin: 0, numWin: 0, colorWin: 0 }; }
}

function computeHourly(rows) {
  const groups = {};
  for (const r of rows) {
    if (r.size_win === "SKIP") continue; // Exclude skipped rounds from hourly average entirely
    
    const key = `${r.date_ist}|${r.hour_ist}`;
    if (!groups[key]) groups[key] = { date: r.date_ist, hour: r.hour_ist, total: 0, sizeW: 0, numW: 0, colorW: 0 };
    groups[key].total++;
    if (r.size_win === "WIN") groups[key].sizeW++;
    if (r.num_win === "WIN") groups[key].numW++;
    if (r.color_win === "WIN") groups[key].colorW++;
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
async function start() {
  await initDB();
  await loadWeights();

  app.listen(PORT, () => {
    console.log(`\n╔══════════════════════════════════════════╗`);
    console.log(`║   CORTEX V3 Neural Engine Active         ║`);
    console.log(`║   Dashboard: http://localhost:${PORT}        ║`);
    console.log(`║   Mining: WinGo 1M + 30S                 ║`);
    console.log(`║   Storage: PostgreSQL ✅                  ║`);
    console.log(`╚══════════════════════════════════════════╝\n`);

    // Start mining loops
    mineLoop("1M");
    mineLoop("30S");
    setInterval(() => mineLoop("1M"), 9000);
    setInterval(() => mineLoop("30S"), 9000);
  });
}

start().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
