import { useState, useEffect, useCallback } from "react";

// ─── CONFIG — your live Render server ──────────────────────────────────────────
const API_BASE = "https://ehdr-ledger-bot.onrender.com";

const CURRENCY = "RM";

// ─── API ──────────────────────────────────────────────────────────────────────
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
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
const fmtD = (d) => new Date(d+"T12:00:00").toLocaleDateString("en-MY",{weekday:"short",month:"short",day:"numeric"});

// ─── Category config ──────────────────────────────────────────────────────────
const CAT_ICONS  = { trips:"🚗",bonus:"⭐",tip:"💰",fuel:"⛽",toll:"🛣️",maintenance:"🔧",car_wash:"🫧",insurance:"🛡️",food:"🍔",other:"📦" };
const CAT_COLORS = { trips:"#00E676",bonus:"#FFD600",tip:"#69F0AE",fuel:"#FF5252",toll:"#FF6D00",maintenance:"#E040FB",car_wash:"#40C4FF",insurance:"#FF4081",food:"#FFAB40",other:"#78909C" };
const INCOME_CATS  = ["trips","bonus","tip"];
const EXPENSE_CATS = ["fuel","toll","maintenance","car_wash","insurance","food","other"];

const summarize = (entries) => {
  const income   = entries.filter(e=>e.type==="income").reduce((s,e)=>s+e.amount,0);
  const expenses = entries.filter(e=>e.type==="expense").reduce((s,e)=>s+e.amount,0);
  const trips    = entries.filter(e=>e.category==="trips").reduce((s,e)=>s+(e.trips||0),0);
  const byCategory = {};
  entries.forEach(e=>{ byCategory[e.category]=(byCategory[e.category]||0)+e.amount; });
  return { income, expenses, profit: income-expenses, trips, byCategory, count: entries.length };
};

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [entries,    setEntries]    = useState([]);
  const [view,       setView]       = useState("dashboard");
  const [period,     setPeriod]     = useState("today");
  const [loading,    setLoading]    = useState(false);
  const [connected,  setConnected]  = useState(null);
  const [toast,      setToast]      = useState(null);
  const [lastSync,   setLastSync]   = useState(null);

  const range = useCallback(() => {
    const t = todayStr();
    if (period==="today") return [t,t];
    if (period==="week")  return [startOfWeek(),t];
    return [startOfMonth(),t];
  }, [period]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [from,to] = range();
      const data = await fetchEntries(from,to);
      setEntries(Array.isArray(data) ? data : []);
      setConnected(true);
      setLastSync(new Date());
    } catch { setConnected(false); }
    setLoading(false);
  }, [range]);

  useEffect(()=>{ load(); },[load]);
  useEffect(()=>{ const t=setInterval(load,30000); return ()=>clearInterval(t); },[load]);

  const toast$ = (msg, type="success") => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };

  const handleDelete = async (id) => {
    await removeEntry(id);
    setEntries(e=>e.filter(x=>x.id!==id));
    toast$("Deleted","error");
  };

  const [from, to] = range();
  const S = summarize(entries);

  return (
    <div style={css.app}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={css.header}>
        <div>
          <div style={css.logo}>⚡ EhDrvr</div>
          <div style={css.logoSub}>DRIVER LEDGER · MY</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{...css.dot, color: connected===null?"#888":connected?"#00E676":"#FF5252"}}>
            {connected===null?"…":connected?"● LIVE":"● OFFLINE"}
          </div>
          {lastSync && <div style={css.sync}>{lastSync.toLocaleTimeString("en-MY",{hour:"2-digit",minute:"2-digit"})}</div>}
        </div>
      </div>

      {connected===false && (
        <div style={css.banner}>
          ⚠️ Cannot reach server — is your bot backend running?
          <br/><span style={{opacity:0.6,fontSize:11}}>{API_BASE}</span>
        </div>
      )}

      {/* ── Period tabs ─────────────────────────────────────────────────────── */}
      <div style={css.tabs}>
        {["today","week","month"].map(p=>(
          <button key={p} style={{...css.tab,...(period===p?css.tabOn:{})}} onClick={()=>setPeriod(p)}>
            {p==="today"?"HARI INI":p==="week"?"MINGGU INI":"BULAN INI"}
          </button>
        ))}
      </div>

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <div style={css.nav}>
        {[["dashboard","📊 DASH"],["log","📋 LOG"],["add","➕ ADD"]].map(([v,l])=>(
          <button key={v} style={{...css.navBtn,...(view===v?css.navOn:{})}} onClick={()=>setView(v)}>{l}</button>
        ))}
        <button style={css.refresh} onClick={load} disabled={loading}>{loading?"⏳":"🔄"}</button>
      </div>

      {/* ── Dashboard ───────────────────────────────────────────────────────── */}
      {view==="dashboard" && (
        <div style={css.page}>
          {/* Big P&L card */}
          <div style={{...css.bigCard, background: S.profit>=0
            ?"linear-gradient(135deg,#003300,#001a00)"
            :"linear-gradient(135deg,#330000,#1a0000)"}}>
            <div style={css.bigLabel}>{period==="today"?"HARI INI":period==="week"?"MINGGU INI":"BULAN INI"}</div>
            <div style={{...css.bigAmt, color: S.profit>=0?"#00E676":"#FF5252"}}>
              {S.profit>=0?"+":"-"}{fmt(S.profit)}
            </div>
            <div style={css.bigSub}>
              {S.trips>0?`${S.trips} trips · `:""}
              {fmtD(from)}{period!=="today"?` → ${fmtD(to)}`:""}
            </div>
          </div>

          {/* Income / Expense split */}
          <div style={{display:"flex",gap:10,marginBottom:12}}>
            <div style={{...css.card,flex:1,marginBottom:0,borderTop:"3px solid #00E676"}}>
              <div style={css.miniLbl}>PENDAPATAN</div>
              <div style={{...css.miniAmt,color:"#00E676"}}>{fmt(S.income)}</div>
            </div>
            <div style={{...css.card,flex:1,marginBottom:0,borderTop:"3px solid #FF5252"}}>
              <div style={css.miniLbl}>PERBELANJAAN</div>
              <div style={{...css.miniAmt,color:"#FF5252"}}>{fmt(S.expenses)}</div>
            </div>
          </div>

          {/* Category breakdown */}
          {Object.keys(S.byCategory).length>0 && (
            <div style={css.card}>
              <div style={css.secTitle}>PECAHAN KATEGORI</div>
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

          {/* Insight */}
          {S.income>0 && S.expenses>0 && (
            <div style={css.insight}>
              <div style={{fontSize:10,letterSpacing:2,color:"#4CAF50",marginBottom:6}}>💡 ANALISIS</div>
              <div style={{fontSize:13,color:"#aaa",lineHeight:1.6}}>
                {S.profit<0
                  ? `Rugi RM${Math.abs(S.profit).toFixed(2)}. Kos makan ${((S.expenses/S.income)*100).toFixed(0)}% dari pendapatan.`
                  : `Simpan ${((S.profit/S.income)*100).toFixed(0)}% pendapatan sebagai untung. ${S.expenses>S.income*0.4?"Awas — kos agak tinggi!":"Margin bagus, teruskan!"}`}
              </div>
            </div>
          )}

          {/* Telegram tip */}
          <div style={css.tgCard}>
            <div style={{fontSize:10,letterSpacing:2,color:"#40C4FF",marginBottom:8}}>🤖 TELEGRAM BOT</div>
            <div style={{fontSize:12,color:"#777",lineHeight:1.8}}>
              Hantar voice note ke bot anda:<br/>
              <em style={{color:"#aaa"}}>"10 trip dapat RM72, isi minyak RM20, toll RM4"</em><br/><br/>
              Commands: <code>/today</code> · <code>/week</code> · <code>/month</code>
            </div>
          </div>

          {connected && S.count===0 && !loading && (
            <div style={css.empty}>
              <div style={{fontSize:48,marginBottom:12}}>🚗</div>
              <div>Tiada rekod untuk tempoh ini.</div>
              <div style={{opacity:0.5,marginTop:8,fontSize:12}}>Hantar voice note ke Telegram bot untuk log trips & kos.</div>
            </div>
          )}
        </div>
      )}

      {/* ── Log ─────────────────────────────────────────────────────────────── */}
      {view==="log" && (
        <div style={css.page}>
          {entries.length===0
            ? <div style={css.empty}><div style={{fontSize:48}}>📋</div><div style={{marginTop:12}}>Tiada rekod.</div></div>
            : [...entries].sort((a,b)=>b.date.localeCompare(a.date)).map(e=>(
              <div key={e.id} style={{...css.logRow,borderLeft:`3px solid ${CAT_COLORS[e.category]||"#555"}`}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:20}}>{CAT_ICONS[e.category]||"📦"}</span>
                  <div>
                    <div style={{fontSize:13,color:"#ddd"}}>{e.description}</div>
                    <div style={{fontSize:10,color:"#555",marginTop:3}}>
                      {fmtD(e.date)} · {e.category.replace("_"," ")}{e.trips?` · ${e.trips} trips`:""}
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

      {/* ── Add ─────────────────────────────────────────────────────────────── */}
      {view==="add" && (
        <div style={css.page}>
          <ManualAdd onAdd={async(entry)=>{
            await addEntry(entry);
            toast$("✅ Rekod disimpan!");
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

// ─── Manual Add ───────────────────────────────────────────────────────────────
function ManualAdd({ onAdd }) {
  const [type,   setType]   = useState("income");
  const [cat,    setCat]    = useState("trips");
  const [amount, setAmount] = useState("");
  const [trips,  setTrips]  = useState("");
  const [desc,   setDesc]   = useState("");
  const [date,   setDate]   = useState(todayStr());

  const cats = type==="income" ? ["trips","bonus","tip"] : ["fuel","toll","maintenance","car_wash","insurance","food","other"];

  return (
    <div style={css.card}>
      <div style={css.secTitle}>📝 TAMBAH REKOD MANUAL</div>
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        <button style={{...css.typeBtn,...(type==="income"?{background:"#0d1a0d",border:"1px solid #00E676",color:"#00E676"}:{})}}
          onClick={()=>{ setType("income"); setCat("trips"); }}>💚 PENDAPATAN</button>
        <button style={{...css.typeBtn,...(type==="expense"?{background:"#1a0d0d",border:"1px solid #FF5252",color:"#FF5252"}:{})}}
          onClick={()=>{ setType("expense"); setCat("fuel"); }}>🔴 PERBELANJAAN</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div style={css.field}>
          <label style={css.lbl}>KATEGORI</label>
          <select style={css.sel} value={cat} onChange={e=>setCat(e.target.value)}>
            {cats.map(c=><option key={c} value={c}>{CAT_ICONS[c]} {c.replace("_"," ").toUpperCase()}</option>)}
          </select>
        </div>
        <div style={css.field}>
          <label style={css.lbl}>JUMLAH (RM)</label>
          <input style={css.inp} type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00"/>
        </div>
        {cat==="trips" && (
          <div style={css.field}>
            <label style={css.lbl}>BIL. TRIP</label>
            <input style={css.inp} type="number" value={trips} onChange={e=>setTrips(e.target.value)} placeholder="0"/>
          </div>
        )}
        <div style={css.field}>
          <label style={css.lbl}>TARIKH</label>
          <input style={css.inp} type="date" value={date} onChange={e=>setDate(e.target.value)}/>
        </div>
        <div style={{...css.field,gridColumn:"1 / -1"}}>
          <label style={css.lbl}>PENERANGAN (optional)</label>
          <input style={css.inp} value={desc} onChange={e=>setDesc(e.target.value)} placeholder="cth: isi minyak pagi"/>
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
        ➕ SIMPAN
      </button>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const css = {
  app:     { fontFamily:"'Share Tech Mono','Courier New',monospace", background:"#080808", color:"#e0e0e0", minHeight:"100vh", maxWidth:480, margin:"0 auto", paddingBottom:40 },
  header:  { background:"#1a1a00", borderBottom:"2px solid #FFD600", padding:"14px 18px", display:"flex", justifyContent:"space-between", alignItems:"center" },
  logo:    { fontSize:20, fontWeight:700, color:"#FFD600", letterSpacing:3 },
  logoSub: { fontSize:9, color:"#888", letterSpacing:4, marginTop:1 },
  dot:     { fontSize:11, letterSpacing:2 },
  sync:    { fontSize:9, color:"#555", marginTop:2 },
  banner:  { background:"#1a0d00", border:"1px solid #FF6D00", padding:"10px 16px", fontSize:12, color:"#FF6D00", lineHeight:1.6 },
  tabs:    { display:"flex", background:"#111", borderBottom:"1px solid #222" },
  tab:     { flex:1, padding:"10px 0", background:"none", border:"none", color:"#555", fontSize:9, letterSpacing:2, cursor:"pointer", borderBottom:"2px solid transparent" },
  tabOn:   { color:"#FFD600", borderBottom:"2px solid #FFD600" },
  nav:     { display:"flex", background:"#0a0a0a", borderBottom:"1px solid #1a1a1a" },
  navBtn:  { flex:1, padding:"12px 0", background:"none", border:"none", color:"#555", fontSize:10, letterSpacing:1, cursor:"pointer" },
  navOn:   { color:"#fff", background:"#1a1a1a" },
  refresh: { padding:"12px 14px", background:"none", border:"none", color:"#555", cursor:"pointer", fontSize:14 },
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
  del:     { background:"none", border:"none", color:"#333", cursor:"pointer", fontSize:12 },
  typeBtn: { flex:1, padding:"10px", background:"#1a1a1a", border:"1px solid #2a2a2a", borderRadius:4, color:"#555", fontFamily:"inherit", fontSize:11, cursor:"pointer" },
  field:   { display:"flex", flexDirection:"column" },
  lbl:     { fontSize:9, letterSpacing:2, color:"#555", marginBottom:5 },
  inp:     { background:"#0a0a0a", border:"1px solid #2a2a2a", borderRadius:4, color:"#ddd", padding:"10px", fontFamily:"inherit", fontSize:13 },
  sel:     { background:"#0a0a0a", border:"1px solid #2a2a2a", borderRadius:4, color:"#ddd", padding:"10px 8px", fontFamily:"inherit", fontSize:12 },
  saveBtn: { width:"100%", padding:"14px", background:"#FFD600", border:"none", borderRadius:4, color:"#000", fontSize:12, letterSpacing:2, cursor:"pointer", fontWeight:700, fontFamily:"inherit" },
  toast:   { position:"fixed", bottom:20, left:"50%", transform:"translateX(-50%)", padding:"12px 24px", borderRadius:4, color:"#000", fontWeight:700, fontSize:13, letterSpacing:1, zIndex:999 },
};
