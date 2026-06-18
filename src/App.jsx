import { useState, useEffect, useCallback } from "react";

const API_BASE = "https://ehdr-ledger-bot.onrender.com";
const CURRENCY = "RM";

const fetchEntries = async (from, to) => {
  const res = await fetch(`${API_BASE}/api/entries?from=${from}&to=${to}`);
  return res.json();
};
const addEntry = async (entry) => {
  const res = await fetch(`${API_BASE}/api/entries`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
  return res.json();
};
const removeEntry = async (id) =>
  fetch(`${API_BASE}/api/entries/${id}`, { method: "DELETE" });

const fetchShifts = async (from, to) => {
  const res = await fetch(`${API_BASE}/api/shifts?from=${from}&to=${to}`);
  return res.json();
};
const fetchActiveShift = async () => {
  const res = await fetch(`${API_BASE}/api/shifts/active`);
  return res.json();
};
const createShift = async (shift) => {
  const res = await fetch(`${API_BASE}/api/shifts`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(shift),
  });
  return res.json();
};
const updateShift = async (id, patch) => {
  const res = await fetch(`${API_BASE}/api/shifts/${id}`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return res.json();
};
const removeShift = async (id) =>
  fetch(`${API_BASE}/api/shifts/${id}`, { method: "DELETE" });

const todayStr = () => new Date().toISOString().split("T")[0];
const startOfWeek = () => {
  const d = new Date(), day = d.getDay();
  return new Date(new Date().setDate(d.getDate() - day + (day === 0 ? -6 : 1)))
    .toISOString().split("T")[0];
};
const startOfMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`;
};
const fmt  = (n) => `${CURRENCY}${Math.abs(n).toFixed(2)}`;

const CAT_ICONS  = { trips:"🚗",bonus:"⭐",tip:"💰",fuel:"⛽",toll:"🛣️",maintenance:"🔧",car_wash:"🫧",insurance:"🛡️",food:"🍔",other:"📦" };
const CAT_COLORS = { trips:"#00E676",bonus:"#FFD600",tip:"#69F0AE",fuel:"#FF5252",toll:"#FF6D00",maintenance:"#E040FB",car_wash:"#40C4FF",insurance:"#FF4081",food:"#FFAB40",other:"#78909C" };
const INCOME_CATS  = ["trips","bonus","tip"];

const STR = {
  ms: {
    driverLedger: "DRIVER LEDGER · MY",
    live: "LIVE", offline: "OFFLINE", connecting: "…",
    cannotReach: "Tidak dapat sambung ke server — bot backend running?",
    today: "HARI INI", week: "MINGGU INI", month: "BULAN INI",
    dash: "📊 DASH", log: "📋 LOG", add: "➕ ADD", shifts: "⏱️ SHIFT",
    income: "PENDAPATAN", expenses: "PERBELANJAAN",
    breakdown: "PECAHAN KATEGORI",
    insightTitle: "💡 ANALISIS",
    insightLoss: (loss, pct) => `Rugi RM${loss}. Kos makan ${pct}% dari pendapatan.`,
    insightProfit: (pct, warn) => `Simpan ${pct}% pendapatan sebagai untung. ${warn}`,
    warnHigh: "Awas — kos agak tinggi!", warnGood: "Margin bagus, teruskan!",
    telegramBot: "🤖 TELEGRAM BOT",
    telegramHint: "Hantar voice note ke bot anda:",
    telegramExample: '"10 trip dapat RM72, isi minyak RM20, toll RM4"',
    shiftHint: "Mula/tamat shift:",
    shiftExample: '"mula shift" · "rehat" · "habis shift"',
    noRecords: "Tiada rekod untuk tempoh ini.",
    noRecordsLog: "Tiada rekod.",
    sendHint: "Hantar voice note ke Telegram bot untuk log trips & kos.",
    manualAdd: "📝 TAMBAH REKOD MANUAL",
    incomeBtn: "💚 PENDAPATAN", expenseBtn: "🔴 PERBELANJAAN",
    category: "KATEGORI", amount: "JUMLAH (RM)", numTrips: "BIL. TRIP",
    date: "TARIKH", description: "PENERANGAN (optional)",
    descPlaceholder: "cth: isi minyak pagi",
    save: "➕ SIMPAN",
    saved: "✅ Rekod disimpan!", deleted: "Dipadam",
    trips: "trips",
    hoursWorked: "JAM KERJA", rmPerHour: "RM/JAM",
    activeShift: "SHIFT AKTIF SEKARANG", startedAt: "Bermula",
    onBreakNow: "☕ Sedang rehat",
    noActiveShift: "Tiada shift aktif sekarang.",
    shiftHistory: "SEJARAH SHIFT",
    noShifts: "Tiada rekod shift.",
    duration: "Tempoh", breaks: "rehat",
    deleteShift: "Padam",
    completed: "Selesai", active: "Aktif",
  },
  en: {
    driverLedger: "DRIVER LEDGER · MY",
    live: "LIVE", offline: "OFFLINE", connecting: "…",
    cannotReach: "Cannot reach server — is the bot backend running?",
    today: "TODAY", week: "THIS WEEK", month: "THIS MONTH",
    dash: "📊 DASH", log: "📋 LOG", add: "➕ ADD", shifts: "⏱️ SHIFTS",
    income: "INCOME", expenses: "EXPENSES",
    breakdown: "BREAKDOWN",
    insightTitle: "💡 INSIGHT",
    insightLoss: (loss, pct) => `Losing RM${loss}. Expenses are ${pct}% of income.`,
    insightProfit: (pct, warn) => `Keeping ${pct}% of income as profit. ${warn}`,
    warnHigh: "Watch those costs!", warnGood: "Good margin, keep it up!",
    telegramBot: "🤖 TELEGRAM BOT",
    telegramHint: "Send a voice note to your bot:",
    telegramExample: '"10 trips, made RM72, fuel RM20, toll RM4"',
    shiftHint: "Start/end your shift:",
    shiftExample: '"start shift" · "taking a break" · "end shift"',
    noRecords: "No records for this period.",
    noRecordsLog: "No records.",
    sendHint: "Send a voice note to your Telegram bot to log trips & costs.",
    manualAdd: "📝 ADD MANUAL ENTRY",
    incomeBtn: "💚 INCOME", expenseBtn: "🔴 EXPENSE",
    category: "CATEGORY", amount: "AMOUNT (RM)", numTrips: "# TRIPS",
    date: "DATE", description: "DESCRIPTION (optional)",
    descPlaceholder: "e.g. morning fuel stop",
    save: "➕ SAVE",
    saved: "✅ Entry saved!", deleted: "Deleted",
    trips: "trips",
    hoursWorked: "HOURS WORKED", rmPerHour: "RM/HOUR",
    activeShift: "ACTIVE SHIFT RIGHT NOW", startedAt: "Started",
    onBreakNow: "☕ Currently on break",
    noActiveShift: "No active shift right now.",
    shiftHistory: "SHIFT HISTORY",
    noShifts: "No shift records.",
    duration: "Duration", breaks: "breaks",
    deleteShift: "Delete",
    completed: "Completed", active: "Active",
  },
};

const fmtD = (d, lang) => {
  // Postgres may return a plain "YYYY-MM-DD" or a full ISO timestamp.
  // Normalize to just the date portion before parsing, to avoid "Invalid Date".
  const datePart = String(d).slice(0, 10);
  return new Date(datePart+"T12:00:00").toLocaleDateString(lang==="ms"?"ms-MY":"en-MY",{weekday:"short",month:"short",day:"numeric"});
};
const fmtT = (iso) => new Date(iso).toLocaleTimeString("en-MY",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Kuala_Lumpur"});

function fmtHrs(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function shiftWorkedHours(shift) {
  const start = new Date(shift.start_time);
  const end = shift.end_time ? new Date(shift.end_time) : new Date();
  let ms = end - start;
  (shift.breaks || []).forEach(b => {
    const bStart = new Date(b.start_time);
    const bEnd = b.end_time ? new Date(b.end_time) : end;
    ms -= (bEnd - bStart);
  });
  return Math.max(0, ms / 3600000);
}

const summarize = (entries, shifts) => {
  const income   = entries.filter(e=>e.type==="income").reduce((s,e)=>s+e.amount,0);
  const expenses = entries.filter(e=>e.type==="expense").reduce((s,e)=>s+e.amount,0);
  const trips    = entries.filter(e=>e.category==="trips").reduce((s,e)=>s+(e.trips||0),0);
  const byCategory = {};
  entries.forEach(e=>{ byCategory[e.category]=(byCategory[e.category]||0)+e.amount; });

  // Include both completed AND active shifts when calculating hours worked.
  // shiftWorkedHours() already handles an in-progress shift correctly by
  // falling back to "now" for the end time, so excluding active shifts here
  // was undercounting hours (and inflating RM/hour) while a shift was live.
  const hoursWorked = (shifts || [])
    .reduce((s, sh) => s + shiftWorkedHours(sh), 0);
  const rmPerHour = hoursWorked > 0 ? income / hoursWorked : 0;

  return { income, expenses, profit: income-expenses, trips, byCategory, count: entries.length, hoursWorked, rmPerHour };
};

export default function App() {
  const [entries,    setEntries]    = useState([]);
  const [shifts,     setShifts]     = useState([]);
  const [activeShift,setActiveShift]= useState(null);
  const [view,       setView]       = useState("dashboard");
  const [period,     setPeriod]     = useState("today");
  const [loading,    setLoading]    = useState(false);
  const [connected,  setConnected]  = useState(null);
  const [toast,      setToast]      = useState(null);
  const [lastSync,   setLastSync]   = useState(null);
  const [lang,       setLang]       = useState("en");

  const t = STR[lang];

  const range = useCallback(() => {
    const tt = todayStr();
    if (period==="today") return [tt,tt];
    if (period==="week")  return [startOfWeek(),tt];
    return [startOfMonth(),tt];
  }, [period]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [from,to] = range();
      const [entriesData, shiftsData, activeData] = await Promise.all([
        fetchEntries(from,to),
        fetchShifts(from,to),
        fetchActiveShift(),
      ]);
      setEntries(Array.isArray(entriesData) ? entriesData : []);
      setShifts(Array.isArray(shiftsData) ? shiftsData : []);
      setActiveShift(activeData);
      setConnected(true);
      setLastSync(new Date());
    } catch { setConnected(false); }
    setLoading(false);
  }, [range]);

  useEffect(()=>{ load(); },[load]);
  useEffect(()=>{ const tm=setInterval(load,30000); return ()=>clearInterval(tm); },[load]);

  const toast$ = (msg, type="success") => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };

  const handleDelete = async (id) => {
    await removeEntry(id);
    setEntries(e=>e.filter(x=>x.id!==id));
    toast$(t.deleted,"error");
  };

  const handleDeleteShift = async (id) => {
    await removeShift(id);
    setShifts(s=>s.filter(x=>x.id!==id));
    toast$(t.deleted,"error");
  };

  const [from, to] = range();
  const S = summarize(entries, shifts);
  const periodLabel = period==="today" ? t.today : period==="week" ? t.week : t.month;

  return (
    <div style={css.app}>
      <div style={css.header}>
        <div>
          <div style={css.logo}>⚡ EhDrvr</div>
          <div style={css.logoSub}>{t.driverLedger}</div>
        </div>
        <div style={{display:"flex", alignItems:"center", gap:10}}>
          <button style={css.langBtn} onClick={()=>setLang(l => l==="en" ? "ms" : "en")}>
            {lang==="en" ? "🇬🇧 EN" : "🇲🇾 BM"}
          </button>
          <div style={{textAlign:"right"}}>
            <div style={{...css.dot, color: connected===null?"#888":connected?"#00E676":"#FF5252"}}>
              {connected===null?t.connecting:connected?`● ${t.live}`:`● ${t.offline}`}
            </div>
            {lastSync && <div style={css.sync}>{lastSync.toLocaleTimeString("en-MY",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Kuala_Lumpur"})}</div>}
          </div>
        </div>
      </div>

      {connected===false && (
        <div style={css.banner}>
          ⚠️ {t.cannotReach}
          <br/><span style={{opacity:0.6,fontSize:11}}>{API_BASE}</span>
        </div>
      )}

      {activeShift && (
        <div style={css.activeShiftBanner}>
          🟢 {t.activeShift} · {t.startedAt} {fmtT(activeShift.start_time)}
          {activeShift.onBreak ? ` · ${t.onBreakNow}` : ""}
        </div>
      )}

      <div style={css.tabs}>
        {["today","week","month"].map(p=>(
          <button key={p} style={{...css.tab,...(period===p?css.tabOn:{})}} onClick={()=>setPeriod(p)}>
            {p==="today"?t.today:p==="week"?t.week:t.month}
          </button>
        ))}
      </div>

      <div style={css.nav}>
        {[["dashboard",t.dash],["log",t.log],["shifts",t.shifts],["add",t.add]].map(([v,l])=>(
          <button key={v} style={{...css.navBtn,...(view===v?css.navOn:{})}} onClick={()=>setView(v)}>{l}</button>
        ))}
        <button style={css.refresh} onClick={load} disabled={loading}>{loading?"⏳":"🔄"}</button>
      </div>

      {view==="dashboard" && (
        <div style={css.page}>
          <div style={{...css.bigCard, background: S.profit>=0
            ?"linear-gradient(135deg,#003300,#001a00)"
            :"linear-gradient(135deg,#330000,#1a0000)"}}>
            <div style={css.bigLabel}>{periodLabel}</div>
            <div style={{...css.bigAmt, color: S.profit>=0?"#00E676":"#FF5252"}}>
              {S.profit>=0?"+":"-"}{fmt(S.profit)}
            </div>
            <div style={css.bigSub}>
              {S.trips>0?`${S.trips} ${t.trips} · `:""}
              {fmtD(from,lang)}{period!=="today"?` → ${fmtD(to,lang)}`:""}
            </div>
          </div>

          <div style={{display:"flex",gap:10,marginBottom:12}}>
            <div style={{...css.card,flex:1,marginBottom:0,borderTop:"3px solid #00E676"}}>
              <div style={css.miniLbl}>{t.income}</div>
              <div style={{...css.miniAmt,color:"#00E676"}}>{fmt(S.income)}</div>
            </div>
            <div style={{...css.card,flex:1,marginBottom:0,borderTop:"3px solid #FF5252"}}>
              <div style={css.miniLbl}>{t.expenses}</div>
              <div style={{...css.miniAmt,color:"#FF5252"}}>{fmt(S.expenses)}</div>
            </div>
          </div>

          {S.hoursWorked > 0 && (
            <div style={{display:"flex",gap:10,marginBottom:12}}>
              <div style={{...css.card,flex:1,marginBottom:0,borderTop:"3px solid #40C4FF"}}>
                <div style={css.miniLbl}>{t.hoursWorked}</div>
                <div style={{...css.miniAmt,color:"#40C4FF"}}>{fmtHrs(S.hoursWorked)}</div>
              </div>
              <div style={{...css.card,flex:1,marginBottom:0,borderTop:"3px solid #FFD600"}}>
                <div style={css.miniLbl}>{t.rmPerHour}</div>
                <div style={{...css.miniAmt,color:"#FFD600"}}>{fmt(S.rmPerHour)}</div>
              </div>
            </div>
          )}

          {Object.keys(S.byCategory).length>0 && (
            <div style={css.card}>
              <div style={css.secTitle}>{t.breakdown}</div>
              {Object.entries(S.byCategory).sort((a,b)=>b[1]-a[1]).map(([cat,amt])=>{
                const isInc = INCOME_CATS.includes(cat);
                const pct = S[isInc?"income":"expenses"]>0 ? (amt/S[isInc?"income":"expenses"])*100 : 0;
                return (
                  <div key={cat} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                    <span style={{fontSize:18,width:24}}>{CAT_ICONS[cat]||"📦"}</span>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:4}}>
                        <span style={{color:"#aaa"}}>{cat.replace("_"," ").toUpperCase()}</span>
                        <span style={{color:CAT_COLORS[cat]||"#fff"}}>{fmt(amt)}</span>
                      </div>
                      <div style={css.barBg}>
                        <div style={{height:4,borderRadius:2,background:CAT_COLORS[cat]||"#aaa",width:`${pct}%`,transition:"width 0.5s"}}/>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {S.income>0 && S.expenses>0 && (
            <div style={css.insight}>
              <div style={{fontSize:10,letterSpacing:2,color:"#4CAF50",marginBottom:6}}>{t.insightTitle}</div>
              <div style={{fontSize:13,color:"#aaa",lineHeight:1.6}}>
                {S.profit<0
                  ? t.insightLoss(Math.abs(S.profit).toFixed(2), ((S.expenses/S.income)*100).toFixed(0))
                  : t.insightProfit(((S.profit/S.income)*100).toFixed(0), S.expenses>S.income*0.4?t.warnHigh:t.warnGood)}
              </div>
            </div>
          )}

          <div style={css.tgCard}>
            <div style={{fontSize:10,letterSpacing:2,color:"#40C4FF",marginBottom:8}}>{t.telegramBot}</div>
            <div style={{fontSize:12,color:"#777",lineHeight:1.8}}>
              {t.telegramHint}<br/>
              <em style={{color:"#aaa"}}>{t.telegramExample}</em><br/><br/>
              {t.shiftHint}<br/>
              <em style={{color:"#aaa"}}>{t.shiftExample}</em><br/><br/>
              Commands: <code>/today</code> · <code>/week</code> · <code>/month</code>
            </div>
          </div>

          {connected && S.count===0 && !loading && (
            <div style={css.empty}>
              <div style={{fontSize:48,marginBottom:12}}>🚗</div>
              <div>{t.noRecords}</div>
              <div style={{opacity:0.5,marginTop:8,fontSize:12}}>{t.sendHint}</div>
            </div>
          )}
        </div>
      )}

      {view==="log" && (
        <div style={css.page}>
          {entries.length===0
            ? <div style={css.empty}><div style={{fontSize:48}}>📋</div><div style={{marginTop:12}}>{t.noRecordsLog}</div></div>
            : [...entries].sort((a,b)=>b.date.localeCompare(a.date)).map(e=>(
              <div key={e.id} style={{...css.logRow,borderLeft:`3px solid ${CAT_COLORS[e.category]||"#555"}`}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:20}}>{CAT_ICONS[e.category]||"📦"}</span>
                  <div>
                    <div style={{fontSize:13,color:"#ddd"}}>{e.description}</div>
                    <div style={{fontSize:10,color:"#555",marginTop:3}}>
                      {fmtD(e.date,lang)} · {e.category.replace("_"," ")}{e.trips?` · ${e.trips} ${t.trips}`:""}
                    </div>
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                  <div style={{color:e.type==="income"?"#00E676":"#FF5252",fontWeight:700}}>
                    {e.type==="income"?"+":"-"}{fmt(e.amount)}
                  </div>
                  <button style={css.del} onClick={()=>handleDelete(e.id)}>✕</button>
                </div>
              </div>
            ))
          }
        </div>
      )}

      {view==="shifts" && (
        <div style={css.page}>
          {shifts.length===0
            ? <div style={css.empty}><div style={{fontSize:48}}>⏱️</div><div style={{marginTop:12}}>{t.noShifts}</div></div>
            : [...shifts].sort((a,b)=>new Date(b.start_time)-new Date(a.start_time)).map(s=>{
              const hrs = shiftWorkedHours(s);
              const breakCount = (s.breaks||[]).length;
              return (
                <div key={s.id} style={{...css.shiftRow, borderLeft: `3px solid ${s.status==="active"?"#00E676":"#555"}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div>
                      <div style={{fontSize:13,color:"#ddd"}}>
                        {fmtD(s.date,lang)} · {fmtT(s.start_time)}{s.end_time?` → ${fmtT(s.end_time)}`:""}
                      </div>
                      <div style={{fontSize:10,color:"#555",marginTop:3}}>
                        {t.duration}: {fmtHrs(hrs)}{breakCount>0?` · ${breakCount} ${t.breaks}`:""}
                      </div>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                      <span style={{fontSize:9, color: s.status==="active"?"#00E676":"#888", letterSpacing:1}}>
                        {s.status==="active"?t.active:t.completed}
                      </span>
                      <button style={css.del} onClick={()=>handleDeleteShift(s.id)}>✕</button>
                    </div>
                  </div>
                </div>
              );
            })
          }
        </div>
      )}

      {view==="add" && (
        <div style={css.page}>
          <ManualAdd t={t} onAdd={async(entry)=>{
            await addEntry(entry);
            toast$(t.saved);
            await load();
            setView("dashboard");
          }}/>
        </div>
      )}

      {toast && (
        <div style={{...css.toast, background: toast.type==="error"?"#FF5252":"#00C853"}}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function ManualAdd({ onAdd, t }) {
  const [type,   setType]   = useState("income");
  const [cat,    setCat]    = useState("trips");
  const [amount, setAmount] = useState("");
  const [trips,  setTrips]  = useState("");
  const [desc,   setDesc]   = useState("");
  const [date,   setDate]   = useState(todayStr());

  const cats = type==="income" ? ["trips","bonus","tip"] : ["fuel","toll","maintenance","car_wash","insurance","food","other"];

  return (
    <div style={css.card}>
      <div style={css.secTitle}>{t.manualAdd}</div>
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        <button style={{...css.typeBtn,...(type==="income"?{background:"#0d1a0d",border:"1px solid #00E676",color:"#00E676"}:{})}}
          onClick={()=>{ setType("income"); setCat("trips"); }}>{t.incomeBtn}</button>
        <button style={{...css.typeBtn,...(type==="expense"?{background:"#1a0d0d",border:"1px solid #FF5252",color:"#FF5252"}:{})}}
          onClick={()=>{ setType("expense"); setCat("fuel"); }}>{t.expenseBtn}</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div style={css.field}>
          <label style={css.lbl}>{t.category}</label>
          <select style={css.sel} value={cat} onChange={e=>setCat(e.target.value)}>
            {cats.map(c=><option key={c} value={c}>{CAT_ICONS[c]} {c.replace("_"," ").toUpperCase()}</option>)}
          </select>
        </div>
        <div style={css.field}>
          <label style={css.lbl}>{t.amount}</label>
          <input style={css.inp} type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00"/>
        </div>
        {cat==="trips" && (
          <div style={css.field}>
            <label style={css.lbl}>{t.numTrips}</label>
            <input style={css.inp} type="number" value={trips} onChange={e=>setTrips(e.target.value)} placeholder="0"/>
          </div>
        )}
        <div style={css.field}>
          <label style={css.lbl}>{t.date}</label>
          <input style={css.inp} type="date" value={date} onChange={e=>setDate(e.target.value)}/>
        </div>
        <div style={{...css.field,gridColumn:"1 / -1"}}>
          <label style={css.lbl}>{t.description}</label>
          <input style={css.inp} value={desc} onChange={e=>setDesc(e.target.value)} placeholder={t.descPlaceholder}/>
        </div>
      </div>
      <button style={{...css.saveBtn,marginTop:12}}
        onClick={()=>{
          if(!amount||isNaN(+amount)) return;
          onAdd({ type, category:cat, amount:+amount,
            description: desc||(cat+" "+type),
            trips: cat==="trips"&&trips ? +trips : null, date });
          setAmount(""); setTrips(""); setDesc("");
        }}>
        {t.save}
      </button>
    </div>
  );
}

const css = {
  app:     { fontFamily:"'Share Tech Mono','Courier New',monospace", background:"#080808", color:"#e0e0e0", minHeight:"100vh", maxWidth:480, margin:"0 auto", paddingBottom:40 },
  header:  { background:"#1a1a00", borderBottom:"2px solid #FFD600", padding:"14px 18px", display:"flex", justifyContent:"space-between", alignItems:"center" },
  logo:    { fontSize:20, fontWeight:700, color:"#FFD600", letterSpacing:3 },
  logoSub: { fontSize:9, color:"#888", letterSpacing:4, marginTop:1 },
  langBtn: { background:"#1a1a1a", border:"1px solid #333", color:"#ddd", fontFamily:"inherit", fontSize:11, padding:"6px 10px", borderRadius:4, cursor:"pointer", letterSpacing:1 },
  dot:     { fontSize:11, letterSpacing:2 },
  sync:    { fontSize:9, color:"#555", marginTop:2 },
  banner:  { background:"#1a0d00", border:"1px solid #FF6D00", padding:"10px 16px", fontSize:12, color:"#FF6D00", lineHeight:1.6 },
  activeShiftBanner: { background:"#0d1a0d", border:"1px solid #00E676", padding:"10px 16px", fontSize:12, color:"#00E676", letterSpacing:0.5 },
  tabs:    { display:"flex", background:"#111", borderBottom:"1px solid #222" },
  tab:     { flex:1, padding:"10px 0", background:"none", border:"none", color:"#555", fontSize:9, letterSpacing:2, cursor:"pointer", borderBottom:"2px solid transparent" },
  tabOn:   { color:"#FFD600", borderBottom:"2px solid #FFD600" },
  nav:     { display:"flex", background:"#0a0a0a", borderBottom:"1px solid #1a1a1a" },
  navBtn:  { flex:1, padding:"12px 0", background:"none", border:"none", color:"#555", fontSize:9, letterSpacing:1, cursor:"pointer" },
  navOn:   { color:"#fff", background:"#1a1a1a" },
  refresh: { padding:"12px 10px", background:"none", border:"none", color:"#555", cursor:"pointer", fontSize:13 },
  page:    { padding:12 },
  bigCard: { padding:"24px 20px", textAlign:"center", border:"1px solid #333", borderRadius:4, marginBottom:12 },
  bigLabel:{ fontSize:10, letterSpacing:3, color:"#888", marginBottom:8 },
  bigAmt:  { fontSize:40, fontWeight:700, lineHeight:1 },
  bigSub:  { fontSize:11, color:"#666", marginTop:8 },
  card:    { background:"#111", border:"1px solid #222", borderRadius:4, padding:16, marginBottom:12 },
  miniLbl: { fontSize:9, letterSpacing:3, color:"#666", marginBottom:6 },
  miniAmt: { fontSize:20, fontWeight:700 },
  secTitle:{ fontSize:10, letterSpacing:3, color:"#666", marginBottom:14, borderBottom:"1px solid #1f1f1f", paddingBottom:8 },
  barBg:   { background:"#1a1a1a", borderRadius:2, height:4 },
  insight: { background:"#0d1a0d", border:"1px solid #1a3a1a", borderRadius:4, padding:"14px 16px", marginBottom:12 },
  tgCard:  { background:"#0a0d1a", border:"1px solid #1a2a4a", borderRadius:4, padding:"14px 16px", marginBottom:12 },
  empty:   { textAlign:"center", padding:"40px 20px", color:"#444" },
  logRow:  { display:"flex", justifyContent:"space-between", alignItems:"center", background:"#111", border:"1px solid #1a1a1a", padding:"12px 14px", marginBottom:8, borderRadius:4 },
  shiftRow:{ background:"#111", border:"1px solid #1a1a1a", padding:"12px 14px", marginBottom:8, borderRadius:4 },
  del:     { background:"none", border:"none", color:"#333", cursor:"pointer", fontSize:12 },
  typeBtn: { flex:1, padding:"10px", background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:4, color:"#555", fontFamily:"inherit", fontSize:11, cursor:"pointer" },
  field:   { display:"flex", flexDirection:"column" },
  lbl:     { fontSize:9, letterSpacing:2, color:"#555", marginBottom:5 },
  inp:     { background:"#0a0a0a", border:"1px solid #2a2a2a", borderRadius:4, color:"#ddd", padding:"10px", fontFamily:"inherit", fontSize:13 },
  sel:     { background:"#0a0a0a", border:"1px solid #2a2a2a", borderRadius:4, color:"#ddd", padding:"10px 8px", fontFamily:"inherit", fontSize:12 },
  saveBtn: { width:"100%", padding:"14px", background:"#FFD600", border:"none", borderRadius:4, color:"#000", fontSize:12, letterSpacing:2, cursor:"pointer", fontWeight:700, fontFamily:"inherit" },
  toast:   { position:"fixed", bottom:20, left:"50%", transform:"translateX(-50%)", padding:"12px 24px", borderRadius:4, color:"#000", fontWeight:700, fontSize:13, letterSpacing:1, zIndex:999 },
};
