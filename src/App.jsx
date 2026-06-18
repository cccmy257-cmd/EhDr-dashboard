/**
 * EhDrvr Driver Ledger — Telegram Bot Backend
 * ==========================================
 * 100% FREE TIER VERSION — PERSISTENT database (Supabase Postgres)
 * Bilingual: auto-detects English vs Bahasa Malaysia and replies in kind.
 * Shift tracking: start/end shift + breaks via voice or text commands.
 *
 * Stack:
 *  - Telegraf           - Telegram bot
 *  - Groq API           - FREE Whisper voice transcription
 *  - Google Gemini      - FREE AI parsing
 *  - Supabase Postgres  - FREE persistent database (survives redeploys!)
 *  - Express            - REST API for dashboard
 *  - Render.com         - FREE hosting
 *
 * Cost: RM0/month
 */

require("dotenv").config();
const express    = require("express");
const cors       = require("cors");
const { Telegraf } = require("telegraf");
const { message }  = require("telegraf/filters");
const postgres   = require("postgres");
const Groq       = require("groq-sdk");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs         = require("fs");
const path       = require("path");
const https      = require("https");
const { createWriteStream, unlinkSync } = require("fs");
const { tmpdir } = require("os");

const BOT_TOKEN        = process.env.TELEGRAM_BOT_TOKEN;
const GROQ_KEY         = process.env.GROQ_API_KEY;
const GEMINI_KEY       = process.env.GEMINI_API_KEY;
const YOUR_TELEGRAM_ID = process.env.YOUR_TELEGRAM_ID;
const DATABASE_URL     = process.env.DATABASE_URL;
const PORT             = process.env.PORT || 3000;
const WEBHOOK_URL      = process.env.WEBHOOK_URL;

if (!BOT_TOKEN || !GROQ_KEY || !GEMINI_KEY || !DATABASE_URL) {
  console.error("Missing env vars. Check your .env file (need DATABASE_URL too now).");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { ssl: "require" });

async function initDb() {
  await sql`
    CREATE TABLE IF NOT EXISTS entries (
      id          SERIAL PRIMARY KEY,
      type        TEXT NOT NULL,
      category    TEXT NOT NULL,
      amount      NUMERIC NOT NULL,
      description TEXT,
      trips       INTEGER,
      date        DATE NOT NULL,
      created_at  TIMESTAMP DEFAULT NOW(),
      raw_input   TEXT
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS shifts (
      id          SERIAL PRIMARY KEY,
      date        DATE NOT NULL,
      start_time  TIMESTAMP,
      end_time    TIMESTAMP,
      status      TEXT NOT NULL DEFAULT 'active',
      created_at  TIMESTAMP DEFAULT NOW()
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS breaks (
      id          SERIAL PRIMARY KEY,
      shift_id    INTEGER REFERENCES shifts(id) ON DELETE CASCADE,
      start_time  TIMESTAMP NOT NULL,
      end_time    TIMESTAMP,
      created_at  TIMESTAMP DEFAULT NOW()
    );
  `;
  console.log("Database ready (Supabase Postgres)");
}

const groq   = new Groq({ apiKey: GROQ_KEY });
const genAI  = new GoogleGenerativeAI(GEMINI_KEY);
const model  = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
const bot    = new Telegraf(BOT_TOKEN);
const app    = express();
app.use(cors());
app.use(express.json());

const MALAY_MARKERS = [
  "buat", "dapat", "minyak", "isi", "tol", "hari", "ini", "minggu",
  "bulan", "untung", "rugi", "duit", "sen", "ringgit", "tadi", "pagi",
  "petang", "malam", "basuh", "kereta", "bayar", "dah", "belum", "nak",
  "saya", "ada", "tak", "tidak", "boleh", "dengan", "dan", "yang", "untuk",
  "mula", "shift", "rehat", "habis", "sambung"
];

function detectLanguage(text) {
  const lower = (text || "").toLowerCase();
  const hits = MALAY_MARKERS.filter(function(w) { return new RegExp("\\b" + w + "\\b").test(lower); }).length;
  return hits >= 1 ? "ms" : "en";
}

function detectShiftCommand(text) {
  const lower = (text || "").toLowerCase().trim();

  // Note: "syif" is a common phonetic Malay spelling of "shift" - both are matched.
  const startShiftPatterns = [
    /\bstart(ing)?\s+(my\s+)?(shift|syif)\b/, /\bmula(kan)?\s+(shift|syif)\b/,
    /\bbegin\s+(shift|syif)\b/, /\bstarting\s+work\b/, /\bmula\s+kerja\b/
  ];
  const endShiftPatterns = [
    /\bend(ing)?\s+(my\s+)?(shift|syif)\b/, /\bhabis\s+(shift|syif)\b/, /\btamat(kan)?\s+(shift|syif)?\b/,
    /\bfinish(ed)?\s+(my\s+)?(shift|syif)\b/, /\bstop\s+(shift|syif)\b/, /\bhabis\s+kerja\b/,
    /\bdone\s+for\s+(the\s+)?day\b/, /\boff\s+work\b/
  ];
  const startBreakPatterns = [
    /\b(taking|take|going for|on)\s+a?\s*break\b/, /\brehat\b/, /\bbreak\s+time\b/,
    /\bmakan\s+dulu\b/, /\bberhenti\s+sekejap\b/
  ];
  const endBreakPatterns = [
    /\bback\s+(from\s+break|to\s+work)\b/, /\bend\s+break\b/, /\bsambung\s+(balik\s+)?(kerja|bekerja)\b/,
    /\bdone\s+with\s+break\b/, /\bhabis\s+rehat\b/, /\bresume\s+(shift|syif|work)\b/,
    /\bmula\s+bekerja\b/, /\bstart\s+work(ing)?\s*(again)?\b/, /\bcontinue\s+work(ing)?\b/
  ];

  if (startShiftPatterns.some(function(p) { return p.test(lower); })) return "start_shift";
  if (endShiftPatterns.some(function(p) { return p.test(lower); })) return "end_shift";
  if (startBreakPatterns.some(function(p) { return p.test(lower); })) return "start_break";
  if (endBreakPatterns.some(function(p) { return p.test(lower); })) return "end_break";
  return null;
}

const T = {
  ms: {
    logged: "DIREKOD",
    net: "Untung",
    netLoss: "Rugi",
    viewDashboard: "Lihat dashboard untuk P&L penuh",
    aiBusy: "Server AI sedang sibuk. Cuba lagi dalam seminit.",
    parseFail: "Tak faham. Cuba: \"10 trip RM72, minyak RM20\"",
    voiceFail: "Tak dapat proses voice note. Cuba lagi.",
    noRecords: function(period) {
      var label = period === "today" ? "hari ini" : period === "week" ? "minggu ini" : "bulan ini";
      return "Tiada rekod untuk " + label + ".";
    },
    summaryTitle: { today: "HARI INI", week: "MINGGU INI", month: "BULAN INI" },
    trips: "Trips",
    income: "Pendapatan",
    expenses: "Perbelanjaan",
    profit: "Untung",
    loss: "Rugi",
    shiftStarted: function(time) { return "SHIFT BERMULA\n\nMasa: " + time + "\n\nSelamat memandu!"; },
    shiftAlreadyActive: "Shift sudah bermula. Hantar \"habis shift\" untuk tamatkan.",
    shiftEnded: function(time, durationStr) {
      return "SHIFT TAMAT\n\nMasa: " + time + "\nJumlah masa: " + durationStr + "\n\nTahniah atas kerja keras hari ini!";
    },
    noActiveShift: "Tiada shift aktif. Hantar \"mula shift\" dahulu.",
    breakStarted: function(time) { return "REHAT BERMULA\n\nMasa: " + time; },
    alreadyOnBreak: "Anda sudah dalam rehat. Hantar \"sambung kerja\" untuk teruskan.",
    breakEnded: function(time, durationStr) { return "REHAT TAMAT\n\nMasa: " + time + "\nLama rehat: " + durationStr; },
    notOnBreak: "Anda tidak dalam rehat sekarang.",
    welcome:
      "EhDrvr Driver Ledger\n\n" +
      "Hantar voice note atau taip:\n\n" +
      "\"10 trip dapat RM72, minyak RM20, toll RM4\"\n\n" +
      "Shift tracking:\n" +
      "\"mula shift\" - start\n" +
      "\"rehat\" - break\n" +
      "\"sambung kerja\" - resume\n" +
      "\"habis shift\" - end\n\n" +
      "Commands:\n" +
      "/today - P&L hari ini\n" +
      "/week - Minggu ini\n" +
      "/month - Bulan ini\n\n" +
      "Bot ini faham Bahasa Malaysia & English - cakap macam biasa!",
  },
  en: {
    logged: "LOGGED",
    net: "Net",
    netLoss: "Net",
    viewDashboard: "View dashboard for full P&L",
    aiBusy: "AI server is busy right now. Try again in a minute.",
    parseFail: "Didn't catch that. Try: \"10 trips RM72, fuel RM20\"",
    voiceFail: "Couldn't process that voice note. Please try again.",
    noRecords: function(period) {
      var label = period === "today" ? "today" : period === "week" ? "this week" : "this month";
      return "No records for " + label + ".";
    },
    summaryTitle: { today: "TODAY", week: "THIS WEEK", month: "THIS MONTH" },
    trips: "Trips",
    income: "Income",
    expenses: "Expenses",
    profit: "Profit",
    loss: "Loss",
    shiftStarted: function(time) { return "SHIFT STARTED\n\nTime: " + time + "\n\nDrive safe!"; },
    shiftAlreadyActive: "Shift already in progress. Send \"end shift\" to finish it.",
    shiftEnded: function(time, durationStr) {
      return "SHIFT ENDED\n\nTime: " + time + "\nTotal duration: " + durationStr + "\n\nGreat work today!";
    },
    noActiveShift: "No active shift. Send \"start shift\" first.",
    breakStarted: function(time) { return "BREAK STARTED\n\nTime: " + time; },
    alreadyOnBreak: "You're already on a break. Send \"back to work\" to resume.",
    breakEnded: function(time, durationStr) { return "BREAK ENDED\n\nTime: " + time + "\nBreak duration: " + durationStr; },
    notOnBreak: "You're not currently on a break.",
    welcome:
      "EhDrvr Driver Ledger\n\n" +
      "Send a voice note or type:\n\n" +
      "\"10 trips, made RM72, fuel RM20, toll RM4\"\n\n" +
      "Shift tracking:\n" +
      "\"start shift\" - begin\n" +
      "\"taking a break\" - pause\n" +
      "\"back to work\" - resume\n" +
      "\"end shift\" - finish\n\n" +
      "Commands:\n" +
      "/today - today's P&L\n" +
      "/week - this week\n" +
      "/month - this month\n\n" +
      "This bot understands both English & Bahasa Malaysia - speak naturally!",
  },
};

function fmtTime(date) {
  return date.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kuala_Lumpur" });
}

// Returns today's date as YYYY-MM-DD in Malaysia time (UTC+8), not server UTC time.
// Without this, a trip logged at 7am MY time would be filed under the previous
// UTC day, since Render's server clock runs in UTC.
function myToday(date) {
  date = date || new Date();
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" }); // en-CA formats as YYYY-MM-DD
}

function fmtDuration(ms) {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return m + "m";
  return h + "h " + m + "m";
}

async function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

async function parseWithGemini(transcript, attempt) {
  attempt = attempt || 1;
  const today = myToday();

  const prompt = "You are a data parser for a Bolt ride-hailing driver's business ledger in Malaysia.\n" +
"Extract structured entries from natural speech. Today is " + today + ".\n" +
"Currency is MYR (Malaysian Ringgit, RM). Input may be in English or Bahasa Malaysia.\n\n" +
"Return ONLY a valid JSON array (no markdown, no explanation). Each item:\n" +
"{\n" +
"  \"type\": \"income\" or \"expense\",\n" +
"  \"category\": string,\n" +
"  \"amount\": number (positive),\n" +
"  \"description\": string,\n" +
"  \"date\": \"YYYY-MM-DD\",\n" +
"  \"trips\": number or null\n" +
"}\n\n" +
"Income categories: trips, bonus, tip\n" +
"Expense categories: fuel, toll, maintenance, car_wash, insurance, food, other\n\n" +
"Examples:\n" +
"\"buat 10 trip dapat RM72\" -> [{\"type\":\"income\",\"category\":\"trips\",\"amount\":72,\"trips\":10,\"description\":\"10 trips\",\"date\":\"" + today + "\"}]\n" +
"\"isi minyak RM30, toll RM4\" -> two expense objects\n" +
"\"got RM5 tip\" -> [{\"type\":\"income\",\"category\":\"tip\",\"amount\":5,...}]\n\n" +
"Input: " + transcript;

  const MAX_ATTEMPTS = 3;

  try {
    const result = await model.generateContent(prompt);
    const text   = result.response.text();
    const clean  = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch (err) {
    const isOverloaded = err.message && (err.message.includes("503") || err.message.includes("overloaded") || err.message.includes("high demand"));
    if (isOverloaded && attempt < MAX_ATTEMPTS) {
      const waitMs = attempt * 2000;
      console.log("Gemini overloaded, retrying in " + waitMs + "ms (attempt " + (attempt + 1) + "/" + MAX_ATTEMPTS + ")");
      await sleep(waitMs);
      return parseWithGemini(transcript, attempt + 1);
    }
    throw err;
  }
}

async function downloadFile(url, destPath) {
  return new Promise(function(resolve, reject) {
    const file = createWriteStream(destPath);
    https.get(url, function(res) {
      res.pipe(file);
      file.on("finish", function() { file.close(); resolve(); });
    }).on("error", reject);
  });
}

async function transcribeVoice(fileUrl) {
  const tmpFile = path.join(tmpdir(), "voice_" + Date.now() + ".ogg");
  await downloadFile(fileUrl, tmpFile);

  const transcription = await groq.audio.transcriptions.create({
    file:     fs.createReadStream(tmpFile),
    model:    "whisper-large-v3",
    language: "ms",
  });

  try { unlinkSync(tmpFile); } catch (e) {}
  return transcription.text;
}

function formatReply(entries, lang) {
  const t = T[lang];
  const lines = entries.map(function(e) {
    const sign  = e.type === "income" ? "+" : "-";
    const cat   = e.category.replace("_", " ").toUpperCase();
    const trips = e.trips ? " (" + e.trips + " trips)" : "";
    return sign + "RM" + Number(e.amount).toFixed(2) + " " + cat + trips;
  });

  const income   = entries.filter(function(e) { return e.type === "income"; }).reduce(function(s,e) { return s + Number(e.amount); }, 0);
  const expenses = entries.filter(function(e) { return e.type === "expense"; }).reduce(function(s,e) { return s + Number(e.amount); }, 0);
  const profit   = income - expenses;

  let summary = lines.join("\n");
  if (entries.length > 1) {
    summary += "\n----------\n";
    summary += profit >= 0
      ? t.net + ": +RM" + profit.toFixed(2)
      : t.netLoss + ": -RM" + Math.abs(profit).toFixed(2);
  }
  return t.logged + "\n\n" + summary + "\n\n" + t.viewDashboard;
}

function isAuthorized(ctx) {
  if (!YOUR_TELEGRAM_ID) return true;
  return String(ctx.from && ctx.from.id) === String(YOUR_TELEGRAM_ID);
}

async function handleShiftCommand(ctx, command, lang) {
  const t = T[lang];
  const now = new Date();
  const today = myToday(now);

  if (command === "start_shift") {
    const active = await sql`SELECT * FROM shifts WHERE status = 'active' LIMIT 1`;
    if (active.length) {
      return ctx.reply(t.shiftAlreadyActive);
    }
    await sql`INSERT INTO shifts (date, start_time, status) VALUES (${today}, ${now.toISOString()}, 'active')`;
    return ctx.reply(t.shiftStarted(fmtTime(now)));
  }

  if (command === "end_shift") {
    const active = await sql`SELECT * FROM shifts WHERE status = 'active' LIMIT 1`;
    if (!active.length) {
      return ctx.reply(t.noActiveShift);
    }
    const shift = active[0];

    const openBreak = await sql`SELECT * FROM breaks WHERE shift_id = ${shift.id} AND end_time IS NULL LIMIT 1`;
    if (openBreak.length) {
      await sql`UPDATE breaks SET end_time = ${now.toISOString()} WHERE id = ${openBreak[0].id}`;
    }

    await sql`UPDATE shifts SET end_time = ${now.toISOString()}, status = 'completed' WHERE id = ${shift.id}`;

    const startTime = new Date(shift.start_time);
    const totalMs = now - startTime;

    const breaks = await sql`SELECT * FROM breaks WHERE shift_id = ${shift.id}`;
    let breakMs = 0;
    breaks.forEach(function(b) {
      const bStart = new Date(b.start_time);
      const bEnd = b.end_time ? new Date(b.end_time) : now;
      breakMs += (bEnd - bStart);
    });

    const workedMs = totalMs - breakMs;
    return ctx.reply(t.shiftEnded(fmtTime(now), fmtDuration(workedMs)));
  }

  if (command === "start_break") {
    const active = await sql`SELECT * FROM shifts WHERE status = 'active' LIMIT 1`;
    if (!active.length) {
      return ctx.reply(t.noActiveShift);
    }
    const shift = active[0];
    const openBreak = await sql`SELECT * FROM breaks WHERE shift_id = ${shift.id} AND end_time IS NULL LIMIT 1`;
    if (openBreak.length) {
      return ctx.reply(t.alreadyOnBreak);
    }
    await sql`INSERT INTO breaks (shift_id, start_time) VALUES (${shift.id}, ${now.toISOString()})`;
    return ctx.reply(t.breakStarted(fmtTime(now)));
  }

  if (command === "end_break") {
    const active = await sql`SELECT * FROM shifts WHERE status = 'active' LIMIT 1`;
    if (!active.length) {
      return ctx.reply(t.noActiveShift);
    }
    const shift = active[0];
    const openBreak = await sql`SELECT * FROM breaks WHERE shift_id = ${shift.id} AND end_time IS NULL LIMIT 1`;
    if (!openBreak.length) {
      return ctx.reply(t.notOnBreak);
    }
    await sql`UPDATE breaks SET end_time = ${now.toISOString()} WHERE id = ${openBreak[0].id}`;
    const breakStart = new Date(openBreak[0].start_time);
    return ctx.reply(t.breakEnded(fmtTime(now), fmtDuration(now - breakStart)));
  }
}

bot.on(message("text"), async function(ctx) {
  if (!isAuthorized(ctx)) return;

  const text = ctx.message.text;

  if (text === "/start") {
    return ctx.reply(T.en.welcome);
  }

  if (text === "/today") return sendSummary(ctx, "today", "en");
  if (text === "/week")  return sendSummary(ctx, "week", "en");
  if (text === "/month") return sendSummary(ctx, "month", "en");

  const lang = detectLanguage(text);

  const shiftCommand = detectShiftCommand(text);
  if (shiftCommand) {
    try {
      return await handleShiftCommand(ctx, shiftCommand, lang);
    } catch (err) {
      console.error("Shift command error:", err.message);
      return ctx.reply(T[lang].parseFail);
    }
  }

  await ctx.sendChatAction("typing");
  try {
    const entries = await parseWithGemini(text);
    await saveEntries(entries, text);
    await ctx.reply(formatReply(entries, lang));
  } catch (err) {
    console.error("Parse error:", err.message);
    const isOverloaded = err.message && (err.message.includes("503") || err.message.includes("overloaded") || err.message.includes("high demand"));
    await ctx.reply(isOverloaded ? T[lang].aiBusy : T[lang].parseFail);
  }
});

bot.on(message("voice"), async function(ctx) {
  if (!isAuthorized(ctx)) return;

  await ctx.sendChatAction("typing");
  try {
    const fileLink   = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
    const transcript = await transcribeVoice(fileLink.href);
    const lang = detectLanguage(transcript);

    await ctx.reply("Heard: \"" + transcript + "\"");

    const shiftCommand = detectShiftCommand(transcript);
    if (shiftCommand) {
      try {
        return await handleShiftCommand(ctx, shiftCommand, lang);
      } catch (err) {
        console.error("Shift command error:", err.message);
        return ctx.reply(T[lang].parseFail);
      }
    }

    const entries = await parseWithGemini(transcript);
    await saveEntries(entries, transcript);
    await ctx.reply(formatReply(entries, lang));
  } catch (err) {
    console.error("Voice error:", err.message);
    const lang = "en";
    const isOverloaded = err.message && (err.message.includes("503") || err.message.includes("overloaded") || err.message.includes("high demand"));
    await ctx.reply(isOverloaded ? T[lang].aiBusy : T[lang].voiceFail);
  }
});

async function saveEntries(entries, rawInput) {
  rawInput = rawInput || "";
  for (const e of entries) {
    await sql`
      INSERT INTO entries (type, category, amount, description, trips, date, raw_input)
      VALUES (
        ${e.type},
        ${e.category},
        ${e.amount},
        ${e.description || ""},
        ${e.trips || null},
        ${e.date || myToday()},
        ${rawInput}
      )
    `;
  }
}

async function sendSummary(ctx, period, lang) {
  lang = lang || "en";
  const t = T[lang];
  const today = myToday();
  let from    = today;

  if (period === "week") {
    // Compute the week boundary using Malaysia's calendar day, not the server's UTC day.
    const myDateStr = myToday(); // YYYY-MM-DD in Malaysia time
    const d = new Date(myDateStr + "T00:00:00");
    const day = d.getDay();
    from = new Date(new Date(d).setDate(d.getDate() - day + (day === 0 ? -6 : 1)))
      .toISOString().split("T")[0];
  } else if (period === "month") {
    const myDateStr = myToday();
    from = myDateStr.slice(0, 7) + "-01";
  }

  const entries = await sql`
    SELECT * FROM entries WHERE date >= ${from} AND date <= ${today}
  `;
  if (!entries.length) return ctx.reply(t.noRecords(period));

  const income   = entries.filter(function(e) { return e.type === "income"; }).reduce(function(s,e) { return s+Number(e.amount); }, 0);
  const expenses = entries.filter(function(e) { return e.type === "expense"; }).reduce(function(s,e) { return s+Number(e.amount); }, 0);
  const profit   = income - expenses;
  const trips    = entries.filter(function(e) { return e.category === "trips"; }).reduce(function(s,e) { return s+(e.trips||0); }, 0);

  const shifts = await sql`
    SELECT * FROM shifts WHERE date >= ${from} AND date <= ${today}
  `;
  let workedMs = 0;
  for (const shift of shifts) {
    const startT = new Date(shift.start_time);
    const endT = shift.end_time ? new Date(shift.end_time) : new Date();
    let shiftMs = endT - startT;
    const breaks = await sql`SELECT * FROM breaks WHERE shift_id = ${shift.id}`;
    breaks.forEach(function(b) {
      const bStart = new Date(b.start_time);
      const bEnd = b.end_time ? new Date(b.end_time) : endT;
      shiftMs -= (bEnd - bStart);
    });
    workedMs += shiftMs;
  }
  const hoursWorked = workedMs / 3600000;
  const rmPerHour = hoursWorked > 0 ? (income / hoursWorked) : 0;

  const label = t.summaryTitle[period];

  let msg =
    label + "\n\n" +
    t.trips + ": " + trips + "\n" +
    t.income + ": RM" + income.toFixed(2) + "\n" +
    t.expenses + ": RM" + expenses.toFixed(2) + "\n";

  if (hoursWorked > 0) {
    msg += (lang === "ms" ? "Jam kerja" : "Hours worked") + ": " + fmtDuration(workedMs) + "\n";
    msg += "RM/" + (lang === "ms" ? "jam" : "hour") + ": RM" + rmPerHour.toFixed(2) + "\n";
  }

  msg += "----------\n" +
    (profit >= 0 ? t.profit + ": RM" + profit.toFixed(2) : t.loss + ": RM" + Math.abs(profit).toFixed(2));

  return ctx.reply(msg);
}

app.get("/api/entries", async function(req, res) {
  try {
    const from = req.query.from, to = req.query.to;
    const rows = from && to
      ? await sql`SELECT * FROM entries WHERE date >= ${from} AND date <= ${to} ORDER BY date DESC, id DESC`
      : await sql`SELECT * FROM entries ORDER BY date DESC, id DESC LIMIT 200`;
    res.json(rows);
  } catch (err) {
    console.error("GET /api/entries error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/entries", async function(req, res) {
  try {
    const b = req.body;
    if (!b.type || !b.category || !b.amount || !b.date)
      return res.status(400).json({ error: "Missing fields" });
    const rows = await sql`
      INSERT INTO entries (type, category, amount, description, trips, date)
      VALUES (${b.type}, ${b.category}, ${b.amount}, ${b.description||""}, ${b.trips||null}, ${b.date})
      RETURNING *
    `;
    res.json(rows[0]);
  } catch (err) {
    console.error("POST /api/entries error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/entries/:id", async function(req, res) {
  try {
    await sql`DELETE FROM entries WHERE id = ${req.params.id}`;
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/summary", async function(req, res) {
  try {
    const from = req.query.from, to = req.query.to;
    if (!from || !to) return res.status(400).json({ error: "from and to required" });
    const entries = await sql`SELECT * FROM entries WHERE date >= ${from} AND date <= ${to}`;
    const income     = entries.filter(function(e) { return e.type==="income"; }).reduce(function(s,e) { return s+Number(e.amount); },0);
    const expenses   = entries.filter(function(e) { return e.type==="expense"; }).reduce(function(s,e) { return s+Number(e.amount); },0);
    const trips      = entries.filter(function(e) { return e.category==="trips"; }).reduce(function(s,e) { return s+(e.trips||0); },0);
    const byCategory = {};
    entries.forEach(function(e) { byCategory[e.category] = (byCategory[e.category]||0) + Number(e.amount); });

    const shifts = await sql`SELECT * FROM shifts WHERE date >= ${from} AND date <= ${to}`;
    let workedMs = 0;
    for (const shift of shifts) {
      const startT = new Date(shift.start_time);
      const endT = shift.end_time ? new Date(shift.end_time) : new Date();
      let shiftMs = endT - startT;
      const breaks = await sql`SELECT * FROM breaks WHERE shift_id = ${shift.id}`;
      breaks.forEach(function(b) {
        const bStart = new Date(b.start_time);
        const bEnd = b.end_time ? new Date(b.end_time) : endT;
        shiftMs -= (bEnd - bStart);
      });
      workedMs += shiftMs;
    }
    const hoursWorked = workedMs / 3600000;
    const rmPerHour = hoursWorked > 0 ? (income / hoursWorked) : 0;

    res.json({
      income: income, expenses: expenses, profit: income-expenses, trips: trips,
      byCategory: byCategory, count: entries.length,
      hoursWorked: hoursWorked, rmPerHour: rmPerHour
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/shifts", async function(req, res) {
  try {
    const from = req.query.from, to = req.query.to;
    const shifts = from && to
      ? await sql`SELECT * FROM shifts WHERE date >= ${from} AND date <= ${to} ORDER BY start_time DESC`
      : await sql`SELECT * FROM shifts ORDER BY start_time DESC LIMIT 100`;

    const result = [];
    for (const shift of shifts) {
      const breaks = await sql`SELECT * FROM breaks WHERE shift_id = ${shift.id} ORDER BY start_time`;
      result.push(Object.assign({}, shift, { breaks: breaks }));
    }
    res.json(result);
  } catch (err) {
    console.error("GET /api/shifts error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/shifts/active", async function(req, res) {
  try {
    const active = await sql`SELECT * FROM shifts WHERE status = 'active' LIMIT 1`;
    if (!active.length) return res.json(null);
    const shift = active[0];
    const openBreak = await sql`SELECT * FROM breaks WHERE shift_id = ${shift.id} AND end_time IS NULL LIMIT 1`;
    res.json(Object.assign({}, shift, { onBreak: openBreak.length > 0, currentBreak: openBreak[0] || null }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/shifts", async function(req, res) {
  try {
    const b = req.body;
    if (!b.date || !b.start_time) return res.status(400).json({ error: "date and start_time required" });
    const rows = await sql`
      INSERT INTO shifts (date, start_time, end_time, status)
      VALUES (${b.date}, ${b.start_time}, ${b.end_time || null}, ${b.end_time ? 'completed' : 'active'})
      RETURNING *
    `;
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/shifts/:id", async function(req, res) {
  try {
    const b = req.body;
    const rows = await sql`
      UPDATE shifts SET
        start_time = COALESCE(${b.start_time || null}, start_time),
        end_time   = COALESCE(${b.end_time || null}, end_time),
        status     = COALESCE(${b.status || null}, status)
      WHERE id = ${req.params.id}
      RETURNING *
    `;
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/shifts/:id", async function(req, res) {
  try {
    await sql`DELETE FROM shifts WHERE id = ${req.params.id}`;
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/health", function(_req, res) {
  res.json({ ok: true, cost: "RM0", db: "supabase-postgres", time: new Date().toISOString() });
});

async function start() {
  await initDb();

  if (WEBHOOK_URL) {
    app.use(bot.webhookCallback("/telegram-webhook"));
    await bot.telegram.setWebhook(WEBHOOK_URL + "/telegram-webhook");
    console.log("Webhook: " + WEBHOOK_URL + "/telegram-webhook");
  } else {
    bot.launch();
    console.log("Bot started (polling)");
  }

  app.listen(PORT, function() {
    console.log("Server on port " + PORT + " | Cost: RM0/month | DB: Supabase Postgres");
  });
}

start();
process.once("SIGINT",  function() { bot.stop("SIGINT"); });
process.once("SIGTERM", function() { bot.stop("SIGTERM"); });
