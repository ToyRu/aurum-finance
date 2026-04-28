import { useState, useRef, useEffect, useCallback } from "react";
import Papa from "papaparse";
import { PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Legend } from "recharts";
import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { doc, setDoc, onSnapshot } from "firebase/firestore";

// ── CONSTANTS ──────────────────────────────────────────────────────────────────
const C = {
  bg:"#0a0f1e", surface:"#111827", card:"#1a2235", border:"#1e2d45",
  gold:"#c9a84c", text:"#e8eaf0", muted:"#6b7a99",
  green:"#4caf82", red:"#e05c6a", blue:"#5b8dee",
};
const CAT_EMOJI = {Food:"🍔",Transport:"🚗",Housing:"🏠",Entertainment:"🎬",Health:"💊",Shopping:"🛍️",Salary:"💰",Freelance:"💻",Investment:"📈",Other:"📦"};
const CATEGORIES = Object.keys(CAT_EMOJI);
const CHART_COLORS = ["#c9a84c","#5b8dee","#4caf82","#e05c6a","#a78bfa","#f97316","#06b6d4","#ec4899","#84cc16","#6b7a99"];
const CARD_BG  = ["#0d2440","#1e0d38","#0d2e1e","#2e0d0d","#0d1e2e"];
const CARD_ACC = [C.blue,"#a78bfa",C.green,C.red,C.gold];
const STOCK_COLORS = ["#5b8dee","#4caf82","#c9a84c","#a78bfa","#f97316","#06b6d4","#ec4899","#e05c6a"];
const MONTH_FULL  = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const fmt      = n => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n||0);
const fmtPct   = n => `${Math.round(n)}%`;
const fmtChg   = n => `${n>=0?"+":""}${fmt(n)}`;
const fmtPctCh = n => `${n>=0?"+":""}${n.toFixed(2)}%`;
const todayStr = () => new Date().toISOString().split("T")[0];
const pad      = n => String(n).padStart(2,"0");
const INIT_BUDGETS = {Food:600,Transport:200,Housing:1500,Entertainment:150,Health:100,Shopping:300,Other:200};
const NOW_YEAR = new Date().getFullYear();
const NOW_MONTH = new Date().getMonth() + 1;

const SAMPLE_TRANSACTIONS = [
  {id:1,date:`${NOW_YEAR}-${pad(NOW_MONTH)}-01`,desc:"Monthly Salary",amount:4500,type:"income",category:"Salary",paymentMethod:"cash",cardId:null},
  {id:2,date:`${NOW_YEAR}-${pad(NOW_MONTH)}-03`,desc:"Grocery Store",amount:-120,type:"expense",category:"Food",paymentMethod:"credit",cardId:1},
  {id:3,date:`${NOW_YEAR}-${pad(NOW_MONTH)}-05`,desc:"Netflix",amount:-16,type:"expense",category:"Entertainment",paymentMethod:"credit",cardId:1},
  {id:4,date:`${NOW_YEAR}-${pad(NOW_MONTH)}-08`,desc:"Gas",amount:-55,type:"expense",category:"Transport",paymentMethod:"credit",cardId:2},
  {id:5,date:`${NOW_YEAR}-${pad(NOW_MONTH)}-10`,desc:"Freelance Project",amount:800,type:"income",category:"Freelance",paymentMethod:"cash",cardId:null},
  {id:6,date:`${NOW_YEAR}-${pad(NOW_MONTH)}-15`,desc:"Rent",amount:-1400,type:"expense",category:"Housing",paymentMethod:"cash",cardId:null},
  {id:7,date:`${NOW_YEAR}-${pad(NOW_MONTH)}-18`,desc:"Gym Membership",amount:-40,type:"expense",category:"Health",paymentMethod:"cash",cardId:null},
];
const SAMPLE_CARDS = [
  {id:1,name:"Chase Sapphire",last4:"4821",limit:8000,dueDate:15,colorIdx:0},
  {id:2,name:"Citi Double Cash",last4:"3390",limit:5000,dueDate:22,colorIdx:1},
];
const SAMPLE_GOALS = [
  {id:1,name:"🆘 Emergency Fund",target:10000,saved:4200,color:C.gold},
  {id:2,name:"✈️ Vacation",target:3000,saved:900,color:C.blue},
  {id:3,name:"💻 New Laptop",target:2000,saved:1450,color:C.green},
];

// ── RESPONSIVE HOOK ────────────────────────────────────────────────────────────
const useWidth = () => {
  const [w, setW] = useState(window.innerWidth);
  useEffect(()=>{ const h=()=>setW(window.innerWidth); window.addEventListener("resize",h); return ()=>window.removeEventListener("resize",h); },[]);
  return w;
};

// ── SMALL COMPONENTS ───────────────────────────────────────────────────────────
const Bar2 = ({pct,color}) => (
  <div style={{height:"6px",borderRadius:"3px",background:C.border,overflow:"hidden",marginTop:"6px"}}>
    <div style={{height:"100%",width:`${Math.min(pct,100)}%`,background:pct>90?C.red:pct>75?"#f0a030":color||C.gold,borderRadius:"3px",transition:"width .7s ease"}}/>
  </div>
);
const Ring = ({pct,color,size=64,stroke=6}) => {
  const r=(size-stroke)/2,circ=2*Math.PI*r,fill=circ*Math.min(pct,100)/100;
  const clr=pct>90?C.red:pct>75?"#f0a030":color||C.gold;
  return (
    <svg width={size} height={size} style={{flexShrink:0}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.border} strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={clr} strokeWidth={stroke}
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} style={{transition:"stroke-dasharray .7s ease"}}/>
      <text x={size/2} y={size/2+1} textAnchor="middle" dominantBaseline="middle"
        style={{fill:clr,fontSize:size<50?"9px":"11px",fontWeight:"600",fontFamily:"'DM Mono',monospace"}}>
        {Math.round(pct)}%
      </text>
    </svg>
  );
};
const Tip = ({active,payload,label}) => {
  if(!active||!payload?.length) return null;
  return (
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:"8px",padding:"8px 12px",fontSize:"12px"}}>
      {label&&<div style={{color:C.muted,marginBottom:"3px",fontSize:"11px"}}>{label}</div>}
      {payload.map((p,i)=><div key={i} style={{color:p.color||C.text}}>{p.name}: <strong>{fmt(p.value)}</strong></div>)}
    </div>
  );
};

// ── LOGIN SCREEN ───────────────────────────────────────────────────────────────
const LoginScreen = () => {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode]         = useState("login"); // "login" | "signup"
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const inp = {background:C.surface,border:`1px solid ${C.border}`,borderRadius:"8px",padding:"12px 16px",color:C.text,fontSize:"14px",fontFamily:"inherit",width:"100%",boxSizing:"border-box",outline:"none"};

  const handle = async () => {
    if(!email||!password){setError("Please fill in both fields.");return;}
    setLoading(true); setError("");
    try {
      if(mode==="login") await signInWithEmailAndPassword(auth,email,password);
      else               await createUserWithEmailAndPassword(auth,email,password);
    } catch(e) {
      const msgs = {
        "auth/user-not-found":"No account with that email. Try signing up!",
        "auth/wrong-password":"Wrong password. Try again.",
        "auth/email-already-in-use":"Email already used. Try logging in.",
        "auth/weak-password":"Password must be at least 6 characters.",
        "auth/invalid-email":"Please enter a valid email address.",
        "auth/invalid-credential":"Wrong email or password. Try again.",
      };
      setError(msgs[e.code]||"Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px",fontFamily:"'DM Mono','Courier New',monospace"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Playfair+Display:wght@600&display=swap" rel="stylesheet"/>
      <div style={{width:"100%",maxWidth:"400px"}}>
        <div style={{textAlign:"center",marginBottom:"36px"}}>
          <div style={{fontSize:"36px",marginBottom:"10px"}}>◈</div>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:"26px",color:C.gold,letterSpacing:"0.08em"}}>Aurum Finance</div>
          <div style={{fontSize:"12px",color:C.muted,marginTop:"6px",letterSpacing:"0.1em"}}>YOUR PERSONAL MONEY MANAGER</div>
        </div>

        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:"14px",padding:"28px"}}>
          {/* Toggle */}
          <div style={{display:"flex",gap:"4px",background:C.bg,borderRadius:"8px",padding:"3px",marginBottom:"22px"}}>
            {[{val:"login",label:"🔑 Log In"},{val:"signup",label:"✨ Sign Up"}].map(m=>(
              <button key={m.val} onClick={()=>{setMode(m.val);setError("");}}
                style={{flex:1,background:mode===m.val?C.gold:"transparent",color:mode===m.val?"#0a0f1e":C.muted,border:"none",padding:"8px",borderRadius:"6px",cursor:"pointer",fontSize:"12px",fontFamily:"inherit",fontWeight:mode===m.val?"600":"400",transition:"all .15s"}}>
                {m.label}
              </button>
            ))}
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:"12px"}}>
            <div>
              <div style={{fontSize:"10px",color:C.muted,letterSpacing:"0.15em",marginBottom:"5px"}}>EMAIL</div>
              <input style={inp} type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()}/>
            </div>
            <div>
              <div style={{fontSize:"10px",color:C.muted,letterSpacing:"0.15em",marginBottom:"5px"}}>PASSWORD</div>
              <input style={inp} type="password" placeholder={mode==="signup"?"At least 6 characters":"Your password"} value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()}/>
            </div>
            {error&&<div style={{fontSize:"12px",color:C.red,background:`${C.red}15`,padding:"8px 12px",borderRadius:"6px"}}>{error}</div>}
            <button onClick={handle} disabled={loading}
              style={{background:C.gold,color:"#0a0f1e",border:"none",padding:"13px",borderRadius:"8px",cursor:loading?"default":"pointer",fontSize:"13px",fontWeight:"600",fontFamily:"inherit",opacity:loading?.7:1,marginTop:"4px",letterSpacing:"0.05em"}}>
              {loading?"⏳ Please wait...":(mode==="login"?"🔑 Log In to My Account":"✨ Create My Account")}
            </button>
          </div>

          <div style={{textAlign:"center",marginTop:"18px",fontSize:"12px",color:C.muted}}>
            {mode==="login"?"Don't have an account? ":"Already have an account? "}
            <button onClick={()=>{setMode(mode==="login"?"signup":"login");setError("");}}
              style={{background:"none",border:"none",color:C.gold,cursor:"pointer",fontFamily:"inherit",fontSize:"12px",textDecoration:"underline"}}>
              {mode==="login"?"Sign up free":"Log in"}
            </button>
          </div>
        </div>

        <div style={{textAlign:"center",marginTop:"18px",fontSize:"11px",color:C.muted}}>
          🔒 Your data is private and encrypted.<br/>Only you can access it.
        </div>
      </div>
    </div>
  );
};

// ── MAIN APP ───────────────────────────────────────────────────────────────────
export default function App() {
  // ── AUTH STATE ──────────────────────────────────────────────────────────────
  const [user, setUser]           = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [syncStatus, setSyncStatus]   = useState("synced"); // "synced" | "saving" | "offline"
  const isRemoteUpdate = useRef(false);
  const saveTimer      = useRef(null);
  const unsubFirestore = useRef(null);

  useEffect(()=>{
    const unsub = onAuthStateChanged(auth, u => { setUser(u); setAuthLoading(false); });
    return unsub;
  },[]);

  // ── RESPONSIVE ──────────────────────────────────────────────────────────────
  const vw = useWidth();
  const isMobile  = vw < 640;
  const isDesktop = vw >= 1024;
  const cols = n => isMobile ? 1 : Math.min(n, isDesktop ? n : 2);
  const gap  = isMobile ? "10px" : "14px";
  const rSize = isMobile ? 38 : 44;
  const box  = {background:C.card,border:`1px solid ${C.border}`,borderRadius:"10px",padding:isMobile?"13px":"18px"};
  const secT = {fontSize:"10px",letterSpacing:"0.18em",color:C.muted,textTransform:"uppercase",marginBottom:"12px"};
  const inp  = {background:C.surface,border:`1px solid ${C.border}`,borderRadius:"5px",padding:"9px 11px",color:C.text,fontSize:"13px",fontFamily:"inherit",width:"100%",boxSizing:"border-box"};
  const btnS = (v="primary") => ({background:v==="primary"?C.gold:"transparent",color:v==="primary"?"#0a0f1e":C.gold,border:`1px solid ${C.gold}`,padding:"7px 14px",borderRadius:"5px",cursor:"pointer",fontSize:"11px",letterSpacing:"0.07em",textTransform:"uppercase",fontFamily:"inherit",whiteSpace:"nowrap"});

  // ── APP STATE ───────────────────────────────────────────────────────────────
  const [tab, setTab] = useState("dashboard");
  const [periodMode, setPeriodMode] = useState("monthly");
  const [selYear,  setSelYear]  = useState(NOW_YEAR);
  const [selMonth, setSelMonth] = useState(NOW_MONTH);

  const [transactions, setTransactions] = useState([]);
  const [cards,        setCards]        = useState([]);
  const [cardCharges,  setCardCharges]  = useState([]);
  const [goals,        setGoals]        = useState([]);
  const [budgets,      setBudgets]      = useState(INIT_BUDGETS);
  const [stocks,       setStocks]       = useState([
    {id:1,ticker:"AAPL",name:"Apple Inc.",shares:5,avgPrice:170,currentPrice:null,prevPrice:null},
    {id:2,ticker:"NVDA",name:"NVIDIA",shares:2,avgPrice:450,currentPrice:null,prevPrice:null},
    {id:3,ticker:"TSLA",name:"Tesla",shares:3,avgPrice:200,currentPrice:null,prevPrice:null},
  ]);

  const [priceLoading, setPriceLoading] = useState(false);
  const [lastUpdated,  setLastUpdated]  = useState(null);
  const [priceError,   setPriceError]   = useState(null);
  const [showAddStock, setShowAddStock] = useState(false);
  const [newStock, setNewStock] = useState({ticker:"",name:"",shares:"",avgPrice:""});

  const [messages,  setMessages]  = useState([{role:"assistant",content:"👋 Hi! I'm your AI financial advisor. I can see your full financial picture. Ask me anything!"}]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  const [showAddTx,     setShowAddTx]     = useState(false);
  const [showAddGoal,   setShowAddGoal]   = useState(false);
  const [showAddCard,   setShowAddCard]   = useState(false);
  const [showAddCharge, setShowAddCharge] = useState(null);
  const [selectedCard,  setSelectedCard]  = useState(null);
  const [newTx,     setNewTx]     = useState({date:"",desc:"",amount:"",type:"expense",category:"Food",paymentMethod:"cash",cardId:null});
  const [newGoal,   setNewGoal]   = useState({name:"",target:"",saved:""});
  const [newCard,   setNewCard]   = useState({name:"",last4:"",limit:"",dueDate:""});
  const [newCharge, setNewCharge] = useState({date:todayStr(),desc:"",amount:"",category:"Shopping"});
  const [editTxItem,   setEditTxItem]   = useState(null); // null or tx object (amount = absolute)
  const [editGoalItem, setEditGoalItem] = useState(null); // null or goal object
  const [editCardItem, setEditCardItem] = useState(null); // null or card object
  const chatEndRef = useRef(null);
  useEffect(()=>{ chatEndRef.current?.scrollIntoView({behavior:"smooth"}); },[messages]);

  // ── FIRESTORE: LISTEN + SYNC ────────────────────────────────────────────────
  useEffect(()=>{
    if(!user){ if(unsubFirestore.current){ unsubFirestore.current(); unsubFirestore.current=null; } return; }
    // Listen for changes from any device
    unsubFirestore.current = onSnapshot(doc(db,"users",user.uid), snap => {
      if(!snap.exists()) return; // new user — keep sample data
      const d = snap.data();
      isRemoteUpdate.current = true;
      if(d.transactions) setTransactions(d.transactions);
      if(d.cards)        setCards(d.cards);
      if(d.cardCharges)  setCardCharges(d.cardCharges);
      if(d.goals)        setGoals(d.goals);
      if(d.budgets)      setBudgets(d.budgets);
      if(d.stocks)       setStocks(d.stocks);
      setTimeout(()=>{ isRemoteUpdate.current = false; }, 200);
    }, () => setSyncStatus("offline"));
    return ()=>{ if(unsubFirestore.current) unsubFirestore.current(); };
  },[user]);

  // ── FIRESTORE: SAVE (debounced 1.5s) ───────────────────────────────────────
  const saveData = useCallback(()=>{
    if(!user||isRemoteUpdate.current) return;
    setSyncStatus("saving");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async ()=>{
      try {
        await setDoc(doc(db,"users",user.uid),{transactions,cards,cardCharges,goals,budgets,stocks},{merge:true});
        setSyncStatus("synced");
      } catch { setSyncStatus("offline"); }
    },1500);
  },[user,transactions,cards,cardCharges,goals,budgets,stocks]);

  useEffect(()=>{ saveData(); },[transactions,cards,cardCharges,goals,budgets,stocks]);

  // ── PERIOD ──────────────────────────────────────────────────────────────────
  const periodLabel = periodMode==="monthly" ? `${MONTH_FULL[selMonth-1]} ${selYear}` : `${selYear}`;
  const isNow = periodMode==="monthly"?(selYear===NOW_YEAR&&selMonth===NOW_MONTH):selYear===NOW_YEAR;
  const prevPeriod=()=>{ if(periodMode==="monthly"){if(selMonth===1){setSelMonth(12);setSelYear(y=>y-1);}else setSelMonth(m=>m-1);}else setSelYear(y=>y-1); };
  const nextPeriod=()=>{ if(isNow)return; if(periodMode==="monthly"){if(selMonth===12){setSelMonth(1);setSelYear(y=>y+1);}else setSelMonth(m=>m+1);}else setSelYear(y=>y+1); };
  const goNow=()=>{ setSelYear(NOW_YEAR); setSelMonth(NOW_MONTH); };

  // ── DERIVED DATA ─────────────────────────────────────────────────────────────
  const filterTx = list => periodMode==="monthly"?list.filter(t=>t.date.startsWith(`${selYear}-${pad(selMonth)}`)):list.filter(t=>t.date.startsWith(`${selYear}`));
  const filterCC = list => periodMode==="monthly"?list.filter(c=>c.date.startsWith(`${selYear}-${pad(selMonth)}`)):list.filter(c=>c.date.startsWith(`${selYear}`));
  const periodTx      = filterTx(transactions);
  const totalIncome   = periodTx.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0);
  const totalExpenses = Math.abs(periodTx.filter(t=>t.amount<0).reduce((s,t)=>s+t.amount,0));
  const balance       = totalIncome-totalExpenses;
  const expByCat      = CATEGORIES.reduce((acc,cat)=>{acc[cat]=Math.abs(periodTx.filter(t=>t.category===cat&&t.amount<0).reduce((s,t)=>s+t.amount,0));return acc;},{});
  const cardBal       = id=>cardCharges.filter(c=>c.cardId===id).reduce((s,c)=>s+c.amount,0);
  const cardPeriodBal = id=>filterCC(cardCharges).filter(c=>c.cardId===id).reduce((s,c)=>s+c.amount,0);
  const totalCCDue    = cards.reduce((s,c)=>s+cardPeriodBal(c.id),0);
  const totalCCBal    = cards.reduce((s,c)=>s+cardBal(c.id),0);
  const totalSaved    = goals.reduce((s,g)=>s+g.saved,0);
  const totalInvested   = stocks.reduce((s,st)=>s+st.shares*st.avgPrice,0);
  const totalCurrentVal = stocks.reduce((s,st)=>s+st.shares*(st.currentPrice||st.avgPrice),0);
  const totalGainLoss   = totalCurrentVal-totalInvested;
  const totalReturn     = totalInvested>0?(totalGainLoss/totalInvested)*100:0;

  const yearlyMonthData = MONTH_SHORT.map((name,i)=>{
    const prefix=`${selYear}-${pad(i+1)}`;
    const inc=transactions.filter(t=>t.amount>0&&t.date.startsWith(prefix)).reduce((s,t)=>s+t.amount,0);
    const exp=Math.abs(transactions.filter(t=>t.amount<0&&t.date.startsWith(prefix)).reduce((s,t)=>s+t.amount,0));
    return {name,income:inc,expenses:exp,net:inc-exp};
  }).filter(d=>d.income>0||d.expenses>0);

  const pieData       = CATEGORIES.filter(cat=>expByCat[cat]>0).map((cat,i)=>({name:cat,value:expByCat[cat],fill:CHART_COLORS[i%CHART_COLORS.length]}));
  const stockPieData  = stocks.map((s,i)=>({name:s.ticker,value:s.shares*(s.currentPrice||s.avgPrice),fill:STOCK_COLORS[i%STOCK_COLORS.length]}));

  // ── ACTIONS ──────────────────────────────────────────────────────────────────
  const addTransaction=()=>{ if(!newTx.date||!newTx.desc||!newTx.amount)return; const amt=newTx.type==="expense"?-Math.abs(parseFloat(newTx.amount)):Math.abs(parseFloat(newTx.amount)); const txId=Date.now(); setTransactions(prev=>[...prev,{...newTx,id:txId,amount:amt}]); if(newTx.paymentMethod==="credit"&&newTx.cardId) setCardCharges(prev=>[...prev,{id:txId+1,cardId:parseInt(newTx.cardId),date:newTx.date,desc:newTx.desc,amount:Math.abs(parseFloat(newTx.amount)),category:newTx.category,fromTx:true}]); setNewTx({date:"",desc:"",amount:"",type:"expense",category:"Food",paymentMethod:"cash",cardId:null}); setShowAddTx(false); };
  const handleCSV=e=>{ const f=e.target.files[0]; if(!f)return; Papa.parse(f,{header:true,complete:r=>{ const p=r.data.filter(x=>x.date&&x.amount).map((x,i)=>({id:Date.now()+i,date:x.date,desc:x.description||x.desc||"Imported",amount:parseFloat(x.amount),type:parseFloat(x.amount)>=0?"income":"expense",category:x.category||"Other",paymentMethod:"cash",cardId:null})); setTransactions(prev=>[...prev,...p]); }}); e.target.value=""; };
  const addGoal=()=>{ if(!newGoal.name||!newGoal.target)return; const c2=[C.gold,C.blue,C.green,"#a78bfa","#f97316"]; setGoals(prev=>[...prev,{...newGoal,id:Date.now(),target:parseFloat(newGoal.target),saved:parseFloat(newGoal.saved)||0,color:c2[prev.length%c2.length]}]); setNewGoal({name:"",target:"",saved:""}); setShowAddGoal(false); };
  const addCard=()=>{ if(!newCard.name||!newCard.limit)return; setCards(prev=>[...prev,{...newCard,id:Date.now(),limit:parseFloat(newCard.limit),dueDate:parseInt(newCard.dueDate)||1,colorIdx:prev.length%CARD_BG.length}]); setNewCard({name:"",last4:"",limit:"",dueDate:""}); setShowAddCard(false); };
  const addCharge=id=>{ if(!newCharge.desc||!newCharge.amount)return; setCardCharges(prev=>[...prev,{...newCharge,id:Date.now(),cardId:id,amount:parseFloat(newCharge.amount)}]); setNewCharge({date:todayStr(),desc:"",amount:"",category:"Shopping"}); setShowAddCharge(null); };
  const addStock=()=>{ if(!newStock.ticker||!newStock.shares||!newStock.avgPrice)return; setStocks(prev=>[...prev,{id:Date.now(),ticker:newStock.ticker.toUpperCase(),name:newStock.name||newStock.ticker.toUpperCase(),shares:parseFloat(newStock.shares),avgPrice:parseFloat(newStock.avgPrice),currentPrice:null,prevPrice:null}]); setNewStock({ticker:"",name:"",shares:"",avgPrice:""}); setShowAddStock(false); };
  const rmStock=id=>setStocks(prev=>prev.filter(s=>s.id!==id));

  // ── EDIT / DELETE ─────────────────────────────────────────────────────────────
  const deleteTx=id=>{ if(!window.confirm("Delete this transaction?"))return; setTransactions(prev=>prev.filter(t=>t.id!==id)); setCardCharges(prev=>prev.filter(c=>!(c.fromTx===true&&c.id===id+1))); };
  const updateTx=()=>{ if(!editTxItem||!editTxItem.date||!editTxItem.desc||!editTxItem.amount)return; const amt=editTxItem.type==="expense"?-Math.abs(parseFloat(editTxItem.amount)):Math.abs(parseFloat(editTxItem.amount)); setTransactions(prev=>prev.map(t=>t.id===editTxItem.id?{...editTxItem,amount:amt}:t)); setEditTxItem(null); };
  const deleteGoalById=id=>{ if(!window.confirm("Delete this goal?"))return; setGoals(prev=>prev.filter(g=>g.id!==id)); };
  const updateGoal=()=>{ if(!editGoalItem||!editGoalItem.name||!editGoalItem.target)return; setGoals(prev=>prev.map(g=>g.id===editGoalItem.id?{...editGoalItem,target:parseFloat(editGoalItem.target),saved:parseFloat(editGoalItem.saved)||0}:g)); setEditGoalItem(null); };
  const deleteCard=id=>{ if(!window.confirm("Delete this card and all its charges?"))return; setCards(prev=>prev.filter(c=>c.id!==id)); setCardCharges(prev=>prev.filter(c=>c.cardId!==id)); if(selectedCard===id) setSelectedCard(null); };
  const updateCard=()=>{ if(!editCardItem||!editCardItem.name||!editCardItem.limit)return; setCards(prev=>prev.map(c=>c.id===editCardItem.id?{...editCardItem,limit:parseFloat(editCardItem.limit),dueDate:parseInt(editCardItem.dueDate)||1}:c)); setEditCardItem(null); };

  const fetchPrices=async()=>{ if(!stocks.length||priceLoading)return; setPriceLoading(true); setPriceError(null); try{ const res=await fetch("/api/anthropic",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:600,tools:[{type:"web_search_20250305",name:"web_search"}],system:`Stock price lookup. Return ONLY raw JSON {"TICKER":price}`,messages:[{role:"user",content:`Current prices for ${stocks.map(s=>s.ticker).join(", ")}. Return ONLY JSON.`}]})}); const data=await res.json(); const text=(data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join(""); const match=text.match(/\{[\s\S]*?\}/); if(match){const prices=JSON.parse(match[0]);setStocks(prev=>prev.map(s=>{const p=prices[s.ticker]||prices[s.ticker.toUpperCase()];return p?{...s,prevPrice:s.currentPrice,currentPrice:parseFloat(p)}:s;}));setLastUpdated(new Date());}else setPriceError("Couldn't parse. Try again.");}catch{setPriceError("Failed to fetch.");}setPriceLoading(false); };

  const sendMessage=async()=>{ if(!chatInput.trim()||chatLoading)return; const userMsg=chatInput.trim(); setChatInput(""); setMessages(prev=>[...prev,{role:"user",content:userMsg}]); setChatLoading(true); const ctx=`Period:${periodLabel} Income:${fmt(totalIncome)} Expenses:${fmt(totalExpenses)} Balance:${fmt(balance)} CCDue:${fmt(totalCCDue)} StockValue:${fmt(totalCurrentVal)} StockPL:${fmtChg(totalGainLoss)} Goals:${goals.map(g=>`${g.name} ${fmt(g.saved)}/${fmt(g.target)}`).join(",")}`; try{const res=await fetch("/api/anthropic",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,system:`Friendly expert personal finance advisor. Use real data. 2-4 sentences, practical, with emojis. No specific investment advice.\n${ctx}`,messages:[...messages.slice(1).map(m=>({role:m.role,content:m.content})),{role:"user",content:userMsg}]})}); const data=await res.json(); setMessages(prev=>[...prev,{role:"assistant",content:data.content?.find(b=>b.type==="text")?.text||"Sorry."}]);}catch{setMessages(prev=>[...prev,{role:"assistant",content:"⚠️ Network error."}]);} setChatLoading(false); };

  // ── PERIOD PICKER ────────────────────────────────────────────────────────────
  const PeriodPicker=()=>(
    <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"16px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:"10px",padding:"9px 12px",flexWrap:"wrap"}}>
      <div style={{display:"flex",gap:"3px",background:C.bg,borderRadius:"6px",padding:"2px"}}>
        {[{val:"monthly",label:"📅"+(isMobile?"":" Monthly")},{val:"yearly",label:"📆"+(isMobile?"":" Yearly")}].map(m=>(
          <button key={m.val} onClick={()=>setPeriodMode(m.val)} style={{background:periodMode===m.val?C.gold:"transparent",color:periodMode===m.val?"#0a0f1e":C.muted,border:"none",padding:isMobile?"5px 10px":"5px 14px",borderRadius:"4px",cursor:"pointer",fontSize:"12px",fontFamily:"inherit",transition:"all .15s",fontWeight:periodMode===m.val?"600":"400"}}>{m.label}</button>
        ))}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
        <button onClick={prevPeriod} style={{background:"none",border:`1px solid ${C.border}`,color:C.text,width:"28px",height:"28px",borderRadius:"6px",cursor:"pointer",fontSize:"14px",display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
        <div style={{minWidth:isMobile?"110px":"148px",textAlign:"center"}}>
          <div style={{fontSize:isMobile?"13px":"15px",fontWeight:"600",color:C.text}}>{periodLabel}</div>
          {isNow&&<div style={{fontSize:"9px",color:C.gold,letterSpacing:"0.1em"}}>● NOW</div>}
        </div>
        <button onClick={nextPeriod} disabled={isNow} style={{background:"none",border:`1px solid ${C.border}`,color:isNow?C.border:C.text,width:"28px",height:"28px",borderRadius:"6px",cursor:isNow?"default":"pointer",fontSize:"14px",display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
      </div>
      {!isNow&&<button onClick={goNow} style={{...btnS("outline"),fontSize:"10px",padding:"4px 10px",marginLeft:"auto"}}>↩ Now</button>}
    </div>
  );

  // ── CARD VISUAL ──────────────────────────────────────────────────────────────
  const CardVisual=({card,isSelected,onClick})=>{
    const bal=cardBal(card.id),pBal=cardPeriodBal(card.id),util=Math.round(bal/card.limit*100);
    const bg=CARD_BG[card.colorIdx%CARD_BG.length],acc=CARD_ACC[card.colorIdx%CARD_ACC.length];
    const ord=n=>n===1?"st":n===2?"nd":n===3?"rd":"th";
    return(
      <div onClick={onClick} style={{cursor:"pointer",position:"relative",borderRadius:"14px",background:`linear-gradient(135deg,${bg} 0%,${bg}ee 50%,${acc}28 100%)`,border:`2px solid ${isSelected?acc:C.border}`,padding:"18px 20px",height:isMobile?"140px":"160px",boxSizing:"border-box",display:"flex",flexDirection:"column",justifyContent:"space-between",boxShadow:isSelected?`0 0 0 1px ${acc}55,0 8px 32px ${acc}22`:"0 4px 16px #00000044",transition:"all .25s",overflow:"hidden"}}>
        <div style={{position:"absolute",right:"-14px",top:"-14px",width:"90px",height:"90px",borderRadius:"50%",background:`${acc}12`}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",position:"relative"}}>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:isMobile?"12px":"13px",color:"rgba(255,255,255,.88)"}}>💳 {card.name}</div>
          <div style={{fontSize:"9px",color:acc,letterSpacing:"0.15em",border:`1px solid ${acc}44`,padding:"1px 6px",borderRadius:"8px"}}>CREDIT</div>
        </div>
        <div style={{position:"relative"}}>
          <div style={{fontSize:"11px",letterSpacing:"0.22em",color:"rgba(255,255,255,.35)",marginBottom:"6px"}}>**** **** **** {card.last4||"····"}</div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
            <div>
              <div style={{fontSize:"8px",color:"rgba(255,255,255,.4)",letterSpacing:"0.15em",marginBottom:"2px"}}>PERIOD</div>
              <div style={{fontSize:isMobile?"16px":"18px",fontWeight:"600",color:"#fff"}}>{fmt(pBal)}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <Ring pct={util} color={acc} size={isMobile?42:48} stroke={4}/>
              <div style={{fontSize:"8px",color:"rgba(255,255,255,.3)",marginTop:"2px"}}>Due {card.dueDate}{ord(card.dueDate)}</div>
            </div>
          </div>
          <div style={{marginTop:"6px",height:"2px",borderRadius:"1px",background:"rgba(255,255,255,.1)",overflow:"hidden"}}>
            <div style={{height:"100%",width:`${Math.min(util,100)}%`,background:util>80?C.red:acc,borderRadius:"1px",transition:"width .7s"}}/>
          </div>
        </div>
      </div>
    );
  };

  const activeCard=selectedCard?cards.find(c=>c.id===selectedCard):null;
  const activeCharges=selectedCard?[...cardCharges.filter(c=>c.cardId===selectedCard)].sort((a,b)=>b.date.localeCompare(a.date)):[];

  const StatCard=({emoji,label,value,color,sub})=>(
    <div style={box}>
      <div style={{fontSize:"18px",marginBottom:"4px"}}>{emoji}</div>
      <div style={{fontSize:"10px",letterSpacing:"0.13em",color:C.muted,textTransform:"uppercase",marginBottom:"3px"}}>{label}</div>
      <div style={{fontSize:isMobile?"17px":"20px",fontWeight:"600",color}}>{value}</div>
      {sub&&<div style={{fontSize:"11px",color:C.muted,marginTop:"3px"}}>{sub}</div>}
    </div>
  );

  const tabs=[
    {id:"dashboard",icon:"📊",label:"Dashboard"},
    {id:"portfolio",icon:"📈",label:"Stocks"},
    {id:"transactions",icon:"↕️",label:"Transactions"},
    {id:"cards",icon:"💳",label:"Cards"},
    {id:"budget",icon:"📋",label:"Budget"},
    {id:"goals",icon:"🎯",label:"Goals"},
    {id:"advisor",icon:"🤖",label:"Advisor"},
  ];

  // ── SHOW AUTH LOADING ────────────────────────────────────────────────────────
  if(authLoading) return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Mono',monospace"}}>
      <div style={{textAlign:"center",color:C.muted}}>
        <div style={{fontSize:"32px",marginBottom:"12px"}}>◈</div>
        <div style={{fontSize:"13px",letterSpacing:"0.15em"}}>Loading Aurum...</div>
      </div>
    </div>
  );

  // ── SHOW LOGIN ───────────────────────────────────────────────────────────────
  if(!user) return <LoginScreen/>;

  // ── MAIN APP ─────────────────────────────────────────────────────────────────
  return (
    <div style={{fontFamily:"'DM Mono','Courier New',monospace",background:C.bg,minHeight:"100vh",color:C.text,display:"flex",flexDirection:"column",paddingBottom:isMobile?"70px":"0"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Playfair+Display:wght@600&display=swap" rel="stylesheet"/>

      {/* HEADER */}
      <div style={{padding:isMobile?"11px 14px 0":"11px 26px 0",borderBottom:`1px solid ${C.border}`,flexShrink:0,position:"sticky",top:0,background:C.bg,zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:isMobile?"0":"6px"}}>
          <span style={{fontSize:"15px"}}>◈</span>
          <span style={{fontFamily:"'Playfair Display',serif",fontSize:isMobile?"14px":"16px",color:C.gold}}>Aurum Finance</span>
          {/* Sync indicator */}
          <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:"8px"}}>
            <span style={{fontSize:"10px",color:syncStatus==="synced"?C.green:syncStatus==="saving"?C.gold:C.red}}>
              {syncStatus==="synced"?"✓ Synced":syncStatus==="saving"?"↑ Saving...":"⚠ Offline"}
            </span>
            <button onClick={()=>signOut(auth)} style={{background:"none",border:`1px solid ${C.border}`,color:C.muted,padding:"3px 8px",borderRadius:"4px",cursor:"pointer",fontSize:"10px",fontFamily:"inherit"}}>
              Sign out
            </button>
          </div>
        </div>
        {!isMobile&&(
          <nav style={{display:"flex",overflowX:"auto"}}>
            {tabs.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{background:"none",border:"none",padding:"7px 13px",cursor:"pointer",fontSize:"12px",color:tab===t.id?C.gold:C.muted,borderBottom:tab===t.id?`2px solid ${C.gold}`:"2px solid transparent",transition:"all .2s",whiteSpace:"nowrap",fontFamily:"inherit"}}>
                {t.icon} {t.label}
              </button>
            ))}
          </nav>
        )}
      </div>

      {/* MOBILE BOTTOM NAV */}
      {isMobile&&(
        <div style={{position:"fixed",bottom:0,left:0,right:0,background:C.surface,borderTop:`1px solid ${C.border}`,display:"flex",zIndex:100,paddingBottom:"env(safe-area-inset-bottom)"}}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,background:"none",border:"none",padding:"7px 2px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:"2px",color:tab===t.id?C.gold:C.muted,fontFamily:"inherit",borderTop:tab===t.id?`2px solid ${C.gold}`:"2px solid transparent"}}>
              <span style={{fontSize:"15px"}}>{t.icon}</span>
              <span style={{fontSize:"7px",letterSpacing:"0.04em"}}>{t.label}</span>
            </button>
          ))}
        </div>
      )}

      <div style={{padding:isMobile?"13px":"20px 26px",flex:1,overflow:"auto"}}>

        {/* ═══════ DASHBOARD ═══════ */}
        {tab==="dashboard"&&(<>
          <PeriodPicker/>
          <div style={{display:"grid",gridTemplateColumns:`repeat(${isMobile?2:4},1fr)`,gap,marginBottom:gap}}>
            <StatCard emoji="💵" label="Net Balance" value={fmt(balance)} color={balance>=0?C.green:C.red} sub={balance>=0?"✅ Good":"⚠️ Over"}/>
            <StatCard emoji="📥" label="Income" value={fmt(totalIncome)} color={C.green}/>
            <StatCard emoji="📤" label="Expenses" value={fmt(totalExpenses)} color={C.red} sub={totalIncome?`${fmtPct(totalExpenses/totalIncome*100)} of income`:"—"}/>
            <StatCard emoji="💳" label="CC Charges" value={fmt(totalCCDue)} color={C.gold}/>
          </div>
          {periodMode==="yearly"&&(
            <div style={{...box,marginBottom:gap}}>
              <div style={secT}>📆 {selYear} Month by Month</div>
              {yearlyMonthData.length>0?(<>
                <ResponsiveContainer width="100%" height={isMobile?150:190}>
                  <BarChart data={yearlyMonthData} margin={{top:0,right:0,bottom:0,left:0}}>
                    <XAxis dataKey="name" tick={{fill:C.muted,fontSize:9}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fill:C.muted,fontSize:9}} axisLine={false} tickLine={false} tickFormatter={v=>`$${(v/1000).toFixed(0)}k`} width={30}/>
                    <Tooltip content={<Tip/>}/>{!isMobile&&<Legend wrapperStyle={{fontSize:"11px"}}/>}
                    <Bar dataKey="income" name="💰 Income" fill={C.green} radius={[3,3,0,0]}/>
                    <Bar dataKey="expenses" name="💸 Expenses" fill={C.red} radius={[3,3,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"8px",marginTop:"12px",paddingTop:"12px",borderTop:`1px solid ${C.border}`}}>
                  {[{l:"Income",v:yearlyMonthData.reduce((s,m)=>s+m.income,0),c:C.green},{l:"Expenses",v:yearlyMonthData.reduce((s,m)=>s+m.expenses,0),c:C.red},{l:"Net",v:yearlyMonthData.reduce((s,m)=>s+m.net,0),c:C.gold}].map(s=>(
                    <div key={s.l} style={{textAlign:"center",padding:"8px",background:C.surface,borderRadius:"8px"}}>
                      <div style={{fontSize:"9px",color:C.muted,letterSpacing:"0.12em",marginBottom:"3px",textTransform:"uppercase"}}>{s.l}</div>
                      <div style={{fontSize:isMobile?"14px":"17px",fontWeight:"600",color:s.c}}>{fmt(s.v)}</div>
                    </div>
                  ))}
                </div>
              </>):<div style={{textAlign:"center",color:C.muted,padding:"24px",fontSize:"13px"}}>No data for {selYear}.</div>}
            </div>
          )}
          <div style={{display:"grid",gridTemplateColumns:isDesktop?"1.1fr 0.9fr":"1fr",gap}}>
            <div style={{display:"flex",flexDirection:"column",gap}}>
              <div style={box}>
                <div style={secT}>🍩 Spending · {periodLabel}</div>
                {pieData.length>0?(<div style={{display:"flex",alignItems:"center",gap:"12px",flexWrap:isMobile?"wrap":"nowrap"}}>
                  <ResponsiveContainer width={isMobile?145:155} height={isMobile?145:155}>
                    <PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={isMobile?36:42} outerRadius={isMobile?65:70} paddingAngle={2} dataKey="value">{pieData.map((e,i)=><Cell key={i} fill={e.fill}/>)}</Pie><Tooltip formatter={v=>fmt(v)}/></PieChart>
                  </ResponsiveContainer>
                  <div style={{flex:1,display:"flex",flexDirection:"column",gap:"5px",minWidth:"100px"}}>
                    {pieData.map(d=>(
                      <div key={d.name} style={{display:"flex",alignItems:"center",gap:"5px",fontSize:"11px"}}>
                        <div style={{width:"8px",height:"8px",borderRadius:"2px",background:d.fill,flexShrink:0}}/>
                        <span style={{flex:1}}>{CAT_EMOJI[d.name]} {d.name}</span>
                        <span style={{color:C.muted}}>{fmtPct(d.value/totalExpenses*100)}</span>
                      </div>
                    ))}
                  </div>
                </div>):<div style={{textAlign:"center",color:C.muted,padding:"20px",fontSize:"13px"}}>No expenses for {periodLabel}</div>}
              </div>
              {periodMode==="monthly"&&<div style={box}><div style={secT}>📊 Overview</div><ResponsiveContainer width="100%" height={125}><BarChart data={[{n:"Income 💰",v:totalIncome,f:C.green},{n:"Expenses 💸",v:totalExpenses,f:C.red},{n:"CC 💳",v:totalCCDue,f:C.gold}]} margin={{top:0,right:0,bottom:0,left:0}}><XAxis dataKey="n" tick={{fill:C.muted,fontSize:9}} axisLine={false} tickLine={false}/><YAxis tick={{fill:C.muted,fontSize:9}} axisLine={false} tickLine={false} tickFormatter={v=>`$${(v/1000).toFixed(1)}k`} width={34}/><Tooltip content={<Tip/>}/><Bar dataKey="v" radius={[4,4,0,0]} name="Amount">{[C.green,C.red,C.gold].map((f,i)=><Cell key={i} fill={f}/>)}</Bar></BarChart></ResponsiveContainer></div>}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap}}>
              <div style={box}><div style={secT}>💳 Credit Cards</div>{cards.map(c=>{ const util=Math.round(cardBal(c.id)/c.limit*100),acc=CARD_ACC[c.colorIdx%CARD_ACC.length]; return(<div key={c.id} style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"11px",cursor:"pointer"}} onClick={()=>{setTab("cards");setSelectedCard(c.id);}}><Ring pct={util} color={acc} size={rSize} stroke={4}/><div style={{flex:1,minWidth:0}}><div style={{fontSize:"12px"}}>{c.name}</div><div style={{fontSize:"11px",color:C.muted}}>{fmt(cardPeriodBal(c.id))} charged</div><Bar2 pct={util} color={acc}/></div></div>); })}<div style={{paddingTop:"8px",borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",fontSize:"12px"}}><span style={{color:C.muted}}>Period total</span><span style={{color:C.gold,fontWeight:"600"}}>{fmt(totalCCDue)}</span></div></div>
              <div style={box}><div style={secT}>🎯 Goals</div>{goals.map(g=>{ const p=Math.min(g.saved/g.target*100,100); return(<div key={g.id} style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"11px"}}><Ring pct={p} color={g.color} size={rSize} stroke={4}/><div style={{flex:1,minWidth:0}}><div style={{fontSize:"12px"}}>{g.name}</div><div style={{fontSize:"11px",color:C.muted}}>{fmt(g.saved)} / {fmt(g.target)}</div><Bar2 pct={p} color={g.color}/></div></div>); })}</div>
            </div>
          </div>
        </>)}

        {/* ═══════ STOCKS ═══════ */}
        {tab==="portfolio"&&(<>
          <div style={{display:"grid",gridTemplateColumns:`repeat(${isMobile?2:4},1fr)`,gap,marginBottom:gap}}>
            <StatCard emoji="💼" label="Invested" value={fmt(totalInvested)} color={C.text}/>
            <StatCard emoji="💰" label="Value" value={fmt(totalCurrentVal)} color={totalGainLoss>=0?C.green:C.red}/>
            <StatCard emoji={totalGainLoss>=0?"🟢":"🔴"} label="Gain/Loss" value={fmtChg(totalGainLoss)} color={totalGainLoss>=0?C.green:C.red}/>
            <StatCard emoji="📊" label="Return" value={fmtPctCh(totalReturn)} color={totalReturn>=0?C.green:C.red}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"12px",flexWrap:"wrap",gap:"8px"}}>
            <div><div style={{...secT,margin:0}}>📈 Holdings</div>{lastUpdated&&<div style={{fontSize:"10px",color:C.muted}}>🕐 {lastUpdated.toLocaleTimeString()}</div>}{priceError&&<div style={{fontSize:"10px",color:C.red}}>⚠️ {priceError}</div>}</div>
            <div style={{display:"flex",gap:"8px"}}>
              <button style={btnS("outline")} onClick={()=>setShowAddStock(!showAddStock)}>+ Add</button>
              <button style={{...btnS(),opacity:priceLoading?.6:1}} onClick={fetchPrices} disabled={priceLoading}>{priceLoading?"⏳ …":"🔄 Refresh"}</button>
            </div>
          </div>
          {showAddStock&&<div style={{...box,marginBottom:"12px",display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"1fr 2fr 1fr 1fr auto",gap:"8px",alignItems:"end"}}>
            <div><div style={{fontSize:"9px",color:C.muted,marginBottom:"3px"}}>TICKER *</div><input style={inp} placeholder="AAPL" value={newStock.ticker} onChange={e=>setNewStock(p=>({...p,ticker:e.target.value.toUpperCase()}))}/></div>
            {!isMobile&&<div><div style={{fontSize:"9px",color:C.muted,marginBottom:"3px"}}>COMPANY</div><input style={inp} placeholder="Apple Inc." value={newStock.name} onChange={e=>setNewStock(p=>({...p,name:e.target.value}))}/></div>}
            <div><div style={{fontSize:"9px",color:C.muted,marginBottom:"3px"}}>SHARES *</div><input style={inp} type="number" placeholder="10" value={newStock.shares} onChange={e=>setNewStock(p=>({...p,shares:e.target.value}))}/></div>
            <div><div style={{fontSize:"9px",color:C.muted,marginBottom:"3px"}}>AVG PRICE *</div><input style={inp} type="number" placeholder="150" value={newStock.avgPrice} onChange={e=>setNewStock(p=>({...p,avgPrice:e.target.value}))}/></div>
            <button style={{...btnS(),alignSelf:"flex-end"}} onClick={addStock}>Add</button>
          </div>}
          <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
            {stocks.map((s,i)=>{ const cur=s.currentPrice||s.avgPrice,iv=s.shares*s.avgPrice,cv=s.shares*cur,gl=cv-iv,glP=iv>0?(gl/iv)*100:0,dc=s.prevPrice?s.currentPrice-s.prevPrice:null,clr=STOCK_COLORS[i%STOCK_COLORS.length]; return(
              <div key={s.id} style={{...box,borderLeft:`3px solid ${clr}`}}>
                <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                  <div style={{width:"46px",height:"46px",borderRadius:"8px",background:`${clr}22`,border:`1px solid ${clr}44`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <div style={{fontSize:"11px",fontWeight:"600",color:clr}}>{s.ticker}</div>
                    <div style={{fontSize:"9px",color:C.muted}}>{s.shares}sh</div>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div><div style={{fontSize:"13px",fontWeight:"500"}}>{s.name}</div><div style={{fontSize:"10px",color:C.muted}}>{s.shares}sh · avg ${s.avgPrice} · {fmt(iv)}</div></div>
                      <button onClick={()=>rmStock(s.id)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:"13px"}}>✕</button>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:"6px"}}>
                      <div><span style={{fontSize:"16px",fontWeight:"600",color:s.currentPrice?C.text:C.muted}}>{s.currentPrice?`$${cur.toFixed(2)}`:"—"}</span>{dc!==null&&<span style={{fontSize:"10px",color:dc>=0?C.green:C.red,marginLeft:"6px"}}>{dc>=0?"▲":"▼"}${Math.abs(dc).toFixed(2)}</span>}{!s.currentPrice&&<span style={{fontSize:"10px",color:C.muted,marginLeft:"6px"}}>↑ Refresh</span>}</div>
                      <div style={{textAlign:"right"}}><div style={{fontSize:"14px",fontWeight:"600",color:gl>=0?C.green:C.red}}>{fmtChg(gl)}</div><div style={{fontSize:"10px",color:gl>=0?C.green:C.red}}>{gl>=0?"📈":"📉"} {fmtPctCh(glP)}</div></div>
                    </div>
                    <div style={{marginTop:"5px",height:"4px",borderRadius:"3px",background:C.border,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min((cv/Math.max(iv,cv))*100,100)}%`,background:gl>=0?C.green:C.red,borderRadius:"3px",transition:"width .7s"}}/></div>
                  </div>
                </div>
              </div>
            ); })}
            {!stocks.length&&<div style={{...box,textAlign:"center",padding:"32px",color:C.muted}}>📈 No stocks yet — click Add</div>}
          </div>
        </>)}

        {/* ═══════ TRANSACTIONS ═══════ */}
        {tab==="transactions"&&(
          <div>
            <PeriodPicker/>
            <div style={box}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"14px"}}>
                <div><div style={secT}>↕️ {periodLabel}</div><div style={{fontSize:"11px",color:C.muted,marginTop:"-8px"}}>{periodTx.length} transactions</div></div>
                <div style={{display:"flex",gap:"6px"}}>
                  <label style={{...btnS("outline"),display:"inline-block",cursor:"pointer"}}>📂<input type="file" accept=".csv" onChange={handleCSV} style={{display:"none"}}/></label>
                  <button style={btnS()} onClick={()=>setShowAddTx(!showAddTx)}>+ Add</button>
                </div>
              </div>
              {showAddTx&&(
                <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:"8px",padding:"14px",marginBottom:"14px"}}>
                  <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"130px 1fr 100px 120px 150px",gap:"8px",marginBottom:"8px"}}>
                    <div><div style={{fontSize:"9px",color:C.muted,marginBottom:"3px"}}>DATE</div><input style={inp} type="date" value={newTx.date} onChange={e=>setNewTx(p=>({...p,date:e.target.value}))}/></div>
                    <div style={isMobile?{gridColumn:"1/-1"}:{}}><div style={{fontSize:"9px",color:C.muted,marginBottom:"3px"}}>DESCRIPTION</div><input style={inp} placeholder="What was this?" value={newTx.desc} onChange={e=>setNewTx(p=>({...p,desc:e.target.value}))}/></div>
                    <div><div style={{fontSize:"9px",color:C.muted,marginBottom:"3px"}}>AMOUNT ($)</div><input style={inp} type="number" placeholder="0.00" value={newTx.amount} onChange={e=>setNewTx(p=>({...p,amount:e.target.value}))}/></div>
                    <div><div style={{fontSize:"9px",color:C.muted,marginBottom:"3px"}}>TYPE</div><select style={inp} value={newTx.type} onChange={e=>setNewTx(p=>({...p,type:e.target.value}))}><option value="expense">📤 Expense</option><option value="income">📥 Income</option></select></div>
                    <div><div style={{fontSize:"9px",color:C.muted,marginBottom:"3px"}}>CATEGORY</div><select style={inp} value={newTx.category} onChange={e=>setNewTx(p=>({...p,category:e.target.value}))}>{CATEGORIES.map(c=><option key={c}>{CAT_EMOJI[c]} {c}</option>)}</select></div>
                  </div>
                  <div style={{display:"flex",gap:"8px",alignItems:"flex-end",paddingTop:"8px",borderTop:`1px solid ${C.border}`,flexWrap:"wrap"}}>
                    <div><div style={{fontSize:"9px",color:C.muted,marginBottom:"5px"}}>💳 PAYMENT</div><div style={{display:"flex",gap:"5px"}}>{[{val:"cash",label:"💵 Cash"},{val:"credit",label:"💳 Card"}].map(opt=>(<button key={opt.val} onClick={()=>setNewTx(p=>({...p,paymentMethod:opt.val,cardId:opt.val==="cash"?null:p.cardId}))} style={{padding:"6px 10px",borderRadius:"6px",border:`1px solid ${newTx.paymentMethod===opt.val?C.gold:C.border}`,background:newTx.paymentMethod===opt.val?`${C.gold}22`:"transparent",color:newTx.paymentMethod===opt.val?C.gold:C.muted,cursor:"pointer",fontSize:"12px",fontFamily:"inherit"}}>{opt.label}</button>))}</div></div>
                    {newTx.paymentMethod==="credit"&&<div style={{flex:1,minWidth:"160px",maxWidth:"240px"}}><div style={{fontSize:"9px",color:C.muted,marginBottom:"3px"}}>WHICH CARD?</div><select style={{...inp,borderColor:newTx.cardId?C.gold:C.red+"88"}} value={newTx.cardId||""} onChange={e=>setNewTx(p=>({...p,cardId:e.target.value}))}><option value="">— select card —</option>{cards.map(c=><option key={c.id} value={c.id}>💳 {c.name} ····{c.last4}</option>)}</select></div>}
                    <button style={{...btnS(),marginLeft:"auto"}} onClick={addTransaction} disabled={newTx.paymentMethod==="credit"&&!newTx.cardId}>✅ Save</button>
                  </div>
                  {newTx.paymentMethod==="credit"&&newTx.cardId&&<div style={{marginTop:"6px",fontSize:"11px",color:C.gold,background:`${C.gold}11`,padding:"5px 10px",borderRadius:"5px"}}>💳 Auto-added to {cards.find(c=>c.id==newTx.cardId)?.name}</div>}
                </div>
              )}
              {(()=>{
                const sorted=[...periodTx].sort((a,b)=>b.date.localeCompare(a.date));
                const months=[...new Set(sorted.map(t=>t.date.slice(0,7)))];
                if(!sorted.length) return <div style={{textAlign:"center",color:C.muted,padding:"28px",fontSize:"13px"}}>No transactions for {periodLabel}.</div>;
                return months.map(month=>{
                  const mTx=sorted.filter(t=>t.date.startsWith(month));
                  const mIn=mTx.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0);
                  const mOut=Math.abs(mTx.filter(t=>t.amount<0).reduce((s,t)=>s+t.amount,0));
                  const lbl=new Date(month+"-15").toLocaleDateString("en-US",{month:"long",year:"numeric"});
                  const isCur=month===`${NOW_YEAR}-${pad(NOW_MONTH)}`;
                  return(
                    <div key={month} style={{marginBottom:"18px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 10px",background:C.surface,borderRadius:"6px",marginBottom:"4px",border:`1px solid ${isCur?C.gold+"55":C.border+"44"}`}}>
                        <span style={{fontSize:"12px",fontWeight:"500",color:isCur?C.gold:C.text}}>{isCur?"📅 ":""}{lbl}</span>
                        <div style={{display:"flex",gap:"8px",fontSize:"11px"}}><span style={{color:C.green}}>📥 {fmt(mIn)}</span><span style={{color:C.red}}>📤 {fmt(mOut)}</span></div>
                      </div>
                      {isMobile?(
                        <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
                          {mTx.map(t=>{ const uc=t.paymentMethod==="credit"&&t.cardId?cards.find(c=>c.id==t.cardId):null; return(
                            <div key={t.id} style={{background:C.surface,borderRadius:"8px",padding:"10px 12px",border:`1px solid ${C.border}22`,borderLeft:`3px solid ${t.amount>=0?C.green:C.red}`}}>
                              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><span style={{fontSize:"13px",fontWeight:"500",flex:1,paddingRight:"8px"}}>{t.desc}</span><div style={{display:"flex",alignItems:"center",gap:"4px",flexShrink:0}}><span style={{fontSize:"14px",fontWeight:"600",color:t.amount>=0?C.green:C.red}}>{fmt(t.amount)}</span><button onClick={()=>setEditTxItem({...t,amount:Math.abs(t.amount)})} style={{background:"none",border:"none",cursor:"pointer",color:C.muted,fontSize:"13px",padding:"1px"}} title="Edit">✏️</button><button onClick={()=>deleteTx(t.id)} style={{background:"none",border:"none",cursor:"pointer",color:C.muted,fontSize:"13px",padding:"1px"}} title="Delete">🗑️</button></div></div>
                              <div style={{display:"flex",gap:"8px",marginTop:"4px",fontSize:"10px",color:C.muted,flexWrap:"wrap"}}><span>{t.date}</span><span>{CAT_EMOJI[t.category]} {t.category}</span><span>{uc?`💳 ${uc.name}`:"💵 Cash"}</span></div>
                            </div>
                          ); })}
                        </div>
                      ):(
                        <>
                          <div style={{fontSize:"10px",display:"grid",gridTemplateColumns:"88px 1fr 80px 70px 103px 128px 56px",gap:"0 10px",color:C.muted,letterSpacing:"0.1em",padding:"5px 4px",borderBottom:`1px solid ${C.border}22`}}><span>DATE</span><span>DESC</span><span>AMOUNT</span><span>TYPE</span><span>CATEGORY</span><span>PAID WITH</span><span></span></div>
                          {mTx.map(t=>{ const uc=t.paymentMethod==="credit"&&t.cardId?cards.find(c=>c.id==t.cardId):null; return(
                            <div key={t.id} style={{display:"grid",gridTemplateColumns:"88px 1fr 80px 70px 103px 128px 56px",gap:"0 10px",padding:"8px 4px",borderBottom:`1px solid ${C.border}14`,fontSize:"12px",alignItems:"center"}}>
                              <span style={{color:C.muted}}>{t.date}</span><span>{t.desc}</span>
                              <span style={{color:t.amount>=0?C.green:C.red,fontWeight:"500"}}>{fmt(t.amount)}</span>
                              <span style={{fontSize:"10px",padding:"2px 5px",borderRadius:"20px",background:t.amount>=0?`${C.green}22`:`${C.red}22`,color:t.amount>=0?C.green:C.red,textAlign:"center"}}>{t.amount>=0?"📥":"📤"}</span>
                              <span>{CAT_EMOJI[t.category]} {t.category}</span>
                              {uc?<span style={{color:C.gold,cursor:"pointer"}} onClick={()=>{setTab("cards");setSelectedCard(uc.id);}}>💳 {uc.name}</span>:<span style={{color:C.muted}}>💵 Cash</span>}
                              <span style={{display:"flex",gap:"3px"}}><button onClick={()=>setEditTxItem({...t,amount:Math.abs(t.amount)})} style={{background:"none",border:"none",cursor:"pointer",color:C.muted,fontSize:"13px",padding:"2px"}} title="Edit">✏️</button><button onClick={()=>deleteTx(t.id)} style={{background:"none",border:"none",cursor:"pointer",color:C.muted,fontSize:"13px",padding:"2px"}} title="Delete">🗑️</button></span>
                            </div>
                          ); })}
                        </>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* ═══════ CREDIT CARDS ═══════ */}
        {tab==="cards"&&(
          <div>
            <PeriodPicker/>
            <div style={{display:"grid",gridTemplateColumns:`repeat(${cols(3)},1fr)`,gap,marginBottom:gap}}>
              <StatCard emoji="🧾" label="Period Charges" value={fmt(totalCCDue)} color={C.gold}/>
              <StatCard emoji="💰" label="Outstanding" value={fmt(totalCCBal)} color={totalCCBal>0?C.red:C.green}/>
              <StatCard emoji="💳" label="Cards" value={cards.length} color={C.blue}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"12px"}}>
              <div style={{...secT,margin:0}}>💳 Your Cards</div>
              <button style={btnS()} onClick={()=>setShowAddCard(!showAddCard)}>+ Add Card</button>
            </div>
            {showAddCard&&<div style={{...box,marginBottom:"12px",display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"2fr 1fr 1fr 1fr auto",gap:"8px",alignItems:"end"}}>
              <div style={isMobile?{gridColumn:"1/-1"}:{}}><div style={{fontSize:"9px",color:C.muted,marginBottom:"3px"}}>CARD NAME</div><input style={inp} placeholder="Chase Sapphire" value={newCard.name} onChange={e=>setNewCard(p=>({...p,name:e.target.value}))}/></div>
              <div><div style={{fontSize:"9px",color:C.muted,marginBottom:"3px"}}>LAST 4</div><input style={inp} maxLength={4} placeholder="4821" value={newCard.last4} onChange={e=>setNewCard(p=>({...p,last4:e.target.value}))}/></div>
              <div><div style={{fontSize:"9px",color:C.muted,marginBottom:"3px"}}>LIMIT ($)</div><input style={inp} type="number" placeholder="5000" value={newCard.limit} onChange={e=>setNewCard(p=>({...p,limit:e.target.value}))}/></div>
              <div><div style={{fontSize:"9px",color:C.muted,marginBottom:"3px"}}>DUE DAY</div><input style={inp} type="number" min={1} max={31} placeholder="15" value={newCard.dueDate} onChange={e=>setNewCard(p=>({...p,dueDate:e.target.value}))}/></div>
              <button style={{...btnS(),alignSelf:"flex-end"}} onClick={addCard}>Add</button>
            </div>}
            <div style={{display:"grid",gridTemplateColumns:`repeat(auto-fill,minmax(${isMobile?"calc(50% - 6px)":"260px"},1fr))`,gap,marginBottom:"16px"}}>
              {cards.map(c=><CardVisual key={c.id} card={c} isSelected={selectedCard===c.id} onClick={()=>setSelectedCard(selectedCard===c.id?null:c.id)}/>)}
              {cards.length===0&&<div style={{...box,textAlign:"center",padding:"32px",color:C.muted,gridColumn:"1/-1"}}><div style={{fontSize:"32px",marginBottom:"10px"}}>💳</div><div style={{fontSize:"13px",marginBottom:"6px"}}>No cards yet</div><div style={{fontSize:"11px"}}>Click <strong style={{color:C.gold}}>+ Add Card</strong> to track your credit cards and spending</div></div>}
            </div>
            {activeCard&&(
              <div style={box}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"14px",flexWrap:"wrap",gap:"10px"}}>
                  <div><div style={{fontFamily:"'Playfair Display',serif",fontSize:"15px"}}>💳 {activeCard.name}</div><div style={{fontSize:"11px",color:C.muted,marginTop:"2px"}}>····{activeCard.last4} · Due {activeCard.dueDate}{["st","nd","rd"][activeCard.dueDate-1]||"th"}</div></div>
                  <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
                    <div style={{textAlign:"right"}}><div style={{fontSize:"8px",color:C.muted,letterSpacing:"0.12em"}}>PERIOD</div><div style={{fontSize:"18px",color:C.gold,fontWeight:"600"}}>{fmt(cardPeriodBal(activeCard.id))}</div></div>
                    <button onClick={()=>setEditCardItem({...activeCard,limit:String(activeCard.limit),dueDate:String(activeCard.dueDate)})} style={{background:"none",border:`1px solid ${C.border}`,color:C.muted,padding:"5px 8px",borderRadius:"5px",cursor:"pointer",fontSize:"12px",fontFamily:"inherit"}} title="Edit card">✏️</button>
                    <button onClick={()=>deleteCard(activeCard.id)} style={{background:"none",border:`1px solid ${C.border}`,color:C.muted,padding:"5px 8px",borderRadius:"5px",cursor:"pointer",fontSize:"12px",fontFamily:"inherit"}} title="Delete card">🗑️</button>
                    <button style={btnS()} onClick={()=>setShowAddCharge(showAddCharge===activeCard.id?null:activeCard.id)}>+ Charge</button>
                  </div>
                </div>
                {showAddCharge===activeCard.id&&<div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"12px",marginBottom:"14px",display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"1fr 2fr 1fr 1fr auto",gap:"8px",alignItems:"end"}}>
                  <input style={inp} type="date" value={newCharge.date} onChange={e=>setNewCharge(p=>({...p,date:e.target.value}))}/>
                  <div style={isMobile?{gridColumn:"1/-1"}:{}}><input style={inp} placeholder="Description" value={newCharge.desc} onChange={e=>setNewCharge(p=>({...p,desc:e.target.value}))}/></div>
                  <input style={inp} type="number" placeholder="Amount" value={newCharge.amount} onChange={e=>setNewCharge(p=>({...p,amount:e.target.value}))}/>
                  <select style={inp} value={newCharge.category} onChange={e=>setNewCharge(p=>({...p,category:e.target.value}))}>{CATEGORIES.map(c=><option key={c}>{CAT_EMOJI[c]} {c}</option>)}</select>
                  <button style={btnS()} onClick={()=>addCharge(activeCard.id)}>Add</button>
                </div>}
                {(()=>{ const allM=[...new Set(activeCharges.map(c=>c.date.slice(0,7)))].sort().reverse(); const disp=periodMode==="yearly"?allM.filter(m=>m.startsWith(`${selYear}`)):allM.filter(m=>m===`${selYear}-${pad(selMonth)}`); if(!disp.length) return <div style={{textAlign:"center",color:C.muted,padding:"24px",fontSize:"13px"}}>💸 No charges for {periodLabel}.</div>; return disp.map(month=>{ const mc=activeCharges.filter(c=>c.date.startsWith(month)); const mt=mc.reduce((s,c)=>s+c.amount,0); const lbl=new Date(month+"-15").toLocaleDateString("en-US",{month:"long",year:"numeric"}); const cur2=month===`${NOW_YEAR}-${pad(NOW_MONTH)}`; return(
                  <div key={month} style={{marginBottom:"16px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",padding:"6px 10px",background:C.surface,borderRadius:"6px",marginBottom:"4px",border:`1px solid ${cur2?C.gold+"44":C.border+"44"}`}}><span style={{fontSize:"11px",color:cur2?C.gold:C.muted,textTransform:"uppercase",letterSpacing:"0.1em"}}>{cur2?"📅 ":""}{lbl}</span><span style={{fontSize:"13px",color:C.gold,fontWeight:"500"}}>{fmt(mt)}</span></div>
                    {mc.map(ch=>( <div key={ch.id} style={isMobile?{display:"flex",justifyContent:"space-between",padding:"8px 4px",borderBottom:`1px solid ${C.border}14`,fontSize:"12px"}:{display:"grid",gridTemplateColumns:"88px 1fr 95px 103px",gap:"0 10px",padding:"7px 4px",borderBottom:`1px solid ${C.border}14`,fontSize:"12px",alignItems:"center"}}>{isMobile?(<><div><div style={{fontWeight:"500"}}>{ch.desc}</div><div style={{fontSize:"10px",color:C.muted}}>{ch.date} · {CAT_EMOJI[ch.category]} {ch.category}</div></div><span style={{color:C.red,fontWeight:"600",flexShrink:0}}>−{fmt(ch.amount)}</span></>):(<><span style={{color:C.muted}}>{ch.date}</span><span>{ch.desc}</span><span style={{color:C.red,fontWeight:"500"}}>−{fmt(ch.amount)}</span><span>{CAT_EMOJI[ch.category]} {ch.category}</span></>)}</div> ))}
                  </div>
                ); }); })()}
              </div>
            )}
            {!activeCard&&<div style={{color:C.muted,fontSize:"12px",textAlign:"center",padding:"12px"}}>👆 Tap a card to view charges</div>}
          </div>
        )}

        {/* ═══════ BUDGET ═══════ */}
        {tab==="budget"&&(<>
          <PeriodPicker/>
          <div style={{...box,marginBottom:gap}}>
            <div style={secT}>📊 Overall · {periodLabel}</div>
            <div style={{display:"flex",alignItems:"center",gap:"16px"}}>
              {(()=>{ const tb=Object.values(budgets).reduce((s,v)=>s+v,0)*(periodMode==="yearly"?12:1); const ts=Object.keys(budgets).reduce((s,cat)=>s+(expByCat[cat]||0),0); const p=Math.round(ts/tb*100); return(<><Ring pct={p} color={C.gold} size={isMobile?70:86} stroke={8}/><div><div style={{fontSize:isMobile?"22px":"26px",fontWeight:"600",color:p>90?C.red:p>75?"#f0a030":C.green}}>{p}%</div><div style={{fontSize:"11px",color:C.muted}}>of {periodMode==="yearly"?"annual":"monthly"} budget</div><div style={{fontSize:"12px",marginTop:"4px"}}>{fmt(ts)} <span style={{color:C.muted}}>of</span> {fmt(tb)}</div><div style={{fontSize:"11px",color:p>100?C.red:C.green,marginTop:"2px"}}>{p>100?"⚠️ Over budget!":"✅ "+fmt(tb-ts)+" left"}</div></div></>); })()}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:`repeat(${cols(2)},1fr)`,gap}}>
            {Object.entries(budgets).map(([cat,limit])=>{ const sp=expByCat[cat]||0,el=limit*(periodMode==="yearly"?12:1),p=sp/el*100,ov=sp>el; return(
              <div key={cat} style={{...box,border:`1px solid ${ov?C.red+"55":C.border}`}}>
                <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                  <Ring pct={p} color={C.gold} size={isMobile?50:60} stroke={5}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"3px"}}><span style={{fontSize:"12px",fontWeight:"500"}}>{CAT_EMOJI[cat]} {cat}</span>{ov&&<span style={{fontSize:"9px",color:C.red,background:`${C.red}22`,padding:"1px 5px",borderRadius:"8px"}}>⚠️</span>}</div>
                    <div style={{display:"flex",gap:"4px",alignItems:"center",marginBottom:"3px"}}><span style={{fontSize:"10px",color:C.muted}}>$</span><input style={{...inp,width:"70px",padding:"3px 6px",fontSize:"12px"}} type="number" value={limit} onChange={e=>setBudgets(p2=>({...p2,[cat]:parseFloat(e.target.value)||0}))}/><span style={{fontSize:"10px",color:C.muted}}>/mo</span></div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:"10px"}}><span style={{color:C.muted}}>Spent: <span style={{color:ov?C.red:C.text}}>{fmt(sp)}</span></span><span style={{color:ov?C.red:C.green}}>{ov?"−":"+"}{fmt(Math.abs(el-sp))}</span></div>
                  </div>
                </div>
              </div>
            ); })}
          </div>
        </>)}

        {/* ═══════ GOALS ═══════ */}
        {tab==="goals"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"14px"}}>
              <div style={{...secT,margin:0}}>🎯 Savings Goals</div>
              <button style={btnS()} onClick={()=>setShowAddGoal(!showAddGoal)}>+ New</button>
            </div>
            {showAddGoal&&<div style={{...box,marginBottom:"12px",display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"2fr 1fr 1fr auto",gap:"8px",alignItems:"end"}}>
              <div style={isMobile?{gridColumn:"1/-1"}:{}}><div style={{fontSize:"9px",color:C.muted,marginBottom:"3px"}}>GOAL NAME</div><input style={inp} placeholder="🏖️ Dream Vacation" value={newGoal.name} onChange={e=>setNewGoal(p=>({...p,name:e.target.value}))}/></div>
              <div><div style={{fontSize:"9px",color:C.muted,marginBottom:"3px"}}>TARGET ($)</div><input style={inp} type="number" placeholder="5000" value={newGoal.target} onChange={e=>setNewGoal(p=>({...p,target:e.target.value}))}/></div>
              <div><div style={{fontSize:"9px",color:C.muted,marginBottom:"3px"}}>SAVED ($)</div><input style={inp} type="number" placeholder="0" value={newGoal.saved} onChange={e=>setNewGoal(p=>({...p,saved:e.target.value}))}/></div>
              <button style={{...btnS(),alignSelf:"flex-end"}} onClick={addGoal}>Add</button>
            </div>}
            <div style={{display:"grid",gridTemplateColumns:`repeat(${cols(3)},1fr)`,gap}}>
              {goals.length===0&&<div style={{...box,textAlign:"center",padding:"32px",color:C.muted,gridColumn:"1/-1"}}><div style={{fontSize:"32px",marginBottom:"10px"}}>🎯</div><div style={{fontSize:"13px",marginBottom:"6px"}}>No goals yet</div><div style={{fontSize:"11px"}}>Click <strong style={{color:C.gold}}>+ New</strong> to set your first savings goal — Emergency Fund, Vacation, New Car...</div></div>}
              {goals.map(g=>{ const p=Math.min(g.saved/g.target*100,100),em=p>=100?"🎉":p>=75?"🔥":p>=50?"💪":p>=25?"🌱":"🚀"; return(
                <div key={g.id} style={{...box,borderTop:`3px solid ${g.color}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"10px"}}><div style={{fontSize:"13px",fontFamily:"'Playfair Display',serif"}}>{g.name}</div><div style={{display:"flex",alignItems:"center",gap:"3px"}}><span style={{fontSize:"16px"}}>{em}</span><button onClick={()=>setEditGoalItem({...g,target:String(g.target),saved:String(g.saved)})} style={{background:"none",border:"none",cursor:"pointer",color:C.muted,fontSize:"13px",padding:"2px"}} title="Edit">✏️</button><button onClick={()=>deleteGoalById(g.id)} style={{background:"none",border:"none",cursor:"pointer",color:C.muted,fontSize:"13px",padding:"2px"}} title="Delete">🗑️</button></div></div>
                  <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"8px"}}>
                    <Ring pct={p} color={g.color} size={isMobile?58:66} stroke={6}/>
                    <div><div style={{fontSize:isMobile?"18px":"20px",fontWeight:"600",color:g.color}}>{fmt(g.saved)}</div><div style={{fontSize:"11px",color:C.muted}}>of {fmt(g.target)}</div><div style={{fontSize:"10px",color:p>=100?C.green:C.muted,marginTop:"2px"}}>{p>=100?"✅ Done!":fmt(g.target-g.saved)+" to go"}</div></div>
                  </div>
                  <Bar2 pct={p} color={g.color}/>
                  <div style={{display:"flex",gap:"5px",marginTop:"10px"}}><input style={{...inp,padding:"5px 8px",fontSize:"12px"}} type="number" placeholder="💰 Add $" onKeyDown={e=>{ if(e.key==="Enter"&&e.target.value){setGoals(prev=>prev.map(x=>x.id===g.id?{...x,saved:Math.min(x.saved+parseFloat(e.target.value),x.target)}:x));e.target.value="";}}} /><span style={{fontSize:"10px",color:C.muted,alignSelf:"center",whiteSpace:"nowrap"}}>↵</span></div>
                </div>
              ); })}
            </div>
          </div>
        )}

        {/* ═══════ AI ADVISOR ═══════ */}
        {tab==="advisor"&&(
          <div style={{display:"flex",flexDirection:"column",height:isMobile?"calc(100dvh - 140px)":"calc(100vh - 148px)"}}>
            <div style={{...box,flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
              <div style={{...secT,marginBottom:"10px"}}>🤖 AI Advisor · {periodLabel}</div>
              <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:"10px",paddingRight:"2px"}}>
                {messages.map((m,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
                    <div style={{maxWidth:isMobile?"88%":"76%",background:m.role==="user"?C.gold:C.surface,color:m.role==="user"?"#0a0f1e":C.text,padding:"10px 14px",borderRadius:m.role==="user"?"14px 14px 4px 14px":"14px 14px 14px 4px",fontSize:"13px",lineHeight:"1.6",border:m.role==="assistant"?`1px solid ${C.border}`:"none"}}>
                      {m.role==="assistant"&&<div style={{fontSize:"9px",color:C.gold,letterSpacing:"0.13em",marginBottom:"4px"}}>🤖 ADVISOR</div>}
                      {m.content}
                    </div>
                  </div>
                ))}
                {chatLoading&&<div style={{display:"flex"}}><div style={{background:C.surface,border:`1px solid ${C.border}`,padding:"10px 14px",borderRadius:"14px 14px 14px 4px",fontSize:"13px",color:C.muted}}><div style={{fontSize:"9px",color:C.gold,letterSpacing:"0.13em",marginBottom:"4px"}}>🤖 ADVISOR</div>⏳ Thinking...</div></div>}
                <div ref={chatEndRef}/>
              </div>
              <div style={{display:"flex",gap:"8px",marginTop:"10px",paddingTop:"10px",borderTop:`1px solid ${C.border}`}}>
                <input style={{...inp,flex:1}} placeholder="Ask anything..." value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendMessage()}/>
                <button style={{...btnS(),padding:"8px 14px",opacity:chatLoading?.5:1}} onClick={sendMessage} disabled={chatLoading}>Send ↵</button>
              </div>
              <div style={{display:"flex",gap:"5px",marginTop:"7px",flexWrap:"wrap"}}>
                {(isMobile?["📊 This month?","📈 Portfolio?","💳 CC advice?","🎯 Savings?"]:["📊 How did I do this month?","📈 How's my portfolio?","💳 Pay off CC first?","🎯 Am I saving enough?"]).map(q=>(
                  <button key={q} onClick={()=>setChatInput(q)} style={{background:"none",border:`1px solid ${C.border}`,color:C.muted,padding:"4px 9px",borderRadius:"20px",fontSize:"10px",cursor:"pointer",fontFamily:"inherit"}}>{q}</button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── TRANSACTION EDIT MODAL ─────────────────────────────────────────────── */}
      {editTxItem&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}} onClick={()=>setEditTxItem(null)}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:"14px",padding:"22px",width:"100%",maxWidth:"480px"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"16px"}}>
              <div style={{fontSize:"14px",fontWeight:"600"}}>✏️ Edit Transaction</div>
              <button onClick={()=>setEditTxItem(null)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:"22px",lineHeight:1}}>×</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
              <div><div style={{fontSize:"9px",color:C.muted,marginBottom:"3px",letterSpacing:"0.12em"}}>DATE</div><input style={inp} type="date" value={editTxItem.date} onChange={e=>setEditTxItem(p=>({...p,date:e.target.value}))}/></div>
              <div><div style={{fontSize:"9px",color:C.muted,marginBottom:"3px",letterSpacing:"0.12em"}}>DESCRIPTION</div><input style={inp} placeholder="What was this?" value={editTxItem.desc} onChange={e=>setEditTxItem(p=>({...p,desc:e.target.value}))}/></div>
              <div><div style={{fontSize:"9px",color:C.muted,marginBottom:"3px",letterSpacing:"0.12em"}}>AMOUNT ($)</div><input style={inp} type="number" min="0" placeholder="0.00" value={editTxItem.amount} onChange={e=>setEditTxItem(p=>({...p,amount:e.target.value}))}/></div>
              <div style={{display:"flex",gap:"8px"}}>
                <div style={{flex:1}}><div style={{fontSize:"9px",color:C.muted,marginBottom:"3px",letterSpacing:"0.12em"}}>TYPE</div><select style={inp} value={editTxItem.type} onChange={e=>setEditTxItem(p=>({...p,type:e.target.value}))}><option value="expense">📤 Expense</option><option value="income">📥 Income</option></select></div>
                <div style={{flex:1}}><div style={{fontSize:"9px",color:C.muted,marginBottom:"3px",letterSpacing:"0.12em"}}>CATEGORY</div><select style={inp} value={editTxItem.category} onChange={e=>setEditTxItem(p=>({...p,category:e.target.value}))}>{CATEGORIES.map(c=><option key={c}>{CAT_EMOJI[c]} {c}</option>)}</select></div>
              </div>
              <div style={{display:"flex",gap:"8px",marginTop:"4px"}}>
                <button onClick={()=>setEditTxItem(null)} style={{...btnS("outline"),flex:1,padding:"9px"}}>Cancel</button>
                <button onClick={updateTx} style={{...btnS(),flex:1,padding:"9px"}}>✅ Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── GOAL EDIT MODAL ────────────────────────────────────────────────────── */}
      {editGoalItem&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}} onClick={()=>setEditGoalItem(null)}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:"14px",padding:"22px",width:"100%",maxWidth:"380px"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"16px"}}>
              <div style={{fontSize:"14px",fontWeight:"600"}}>✏️ Edit Goal</div>
              <button onClick={()=>setEditGoalItem(null)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:"22px",lineHeight:1}}>×</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
              <div><div style={{fontSize:"9px",color:C.muted,marginBottom:"3px",letterSpacing:"0.12em"}}>GOAL NAME</div><input style={inp} placeholder="🏖️ Dream Vacation" value={editGoalItem.name} onChange={e=>setEditGoalItem(p=>({...p,name:e.target.value}))}/></div>
              <div><div style={{fontSize:"9px",color:C.muted,marginBottom:"3px",letterSpacing:"0.12em"}}>TARGET AMOUNT ($)</div><input style={inp} type="number" min="0" placeholder="5000" value={editGoalItem.target} onChange={e=>setEditGoalItem(p=>({...p,target:e.target.value}))}/></div>
              <div><div style={{fontSize:"9px",color:C.muted,marginBottom:"3px",letterSpacing:"0.12em"}}>SAVED SO FAR ($)</div><input style={inp} type="number" min="0" placeholder="0" value={editGoalItem.saved} onChange={e=>setEditGoalItem(p=>({...p,saved:e.target.value}))}/></div>
              <div style={{display:"flex",gap:"8px",marginTop:"4px"}}>
                <button onClick={()=>setEditGoalItem(null)} style={{...btnS("outline"),flex:1,padding:"9px"}}>Cancel</button>
                <button onClick={updateGoal} style={{...btnS(),flex:1,padding:"9px"}}>✅ Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CARD EDIT MODAL ────────────────────────────────────────────────────── */}
      {editCardItem&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}} onClick={()=>setEditCardItem(null)}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:"14px",padding:"22px",width:"100%",maxWidth:"380px"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"16px"}}>
              <div style={{fontSize:"14px",fontWeight:"600"}}>✏️ Edit Card</div>
              <button onClick={()=>setEditCardItem(null)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:"22px",lineHeight:1}}>×</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
              <div><div style={{fontSize:"9px",color:C.muted,marginBottom:"3px",letterSpacing:"0.12em"}}>CARD NAME</div><input style={inp} placeholder="Chase Sapphire" value={editCardItem.name} onChange={e=>setEditCardItem(p=>({...p,name:e.target.value}))}/></div>
              <div><div style={{fontSize:"9px",color:C.muted,marginBottom:"3px",letterSpacing:"0.12em"}}>LAST 4 DIGITS</div><input style={inp} maxLength={4} placeholder="4821" value={editCardItem.last4||""} onChange={e=>setEditCardItem(p=>({...p,last4:e.target.value}))}/></div>
              <div style={{display:"flex",gap:"8px"}}>
                <div style={{flex:1}}><div style={{fontSize:"9px",color:C.muted,marginBottom:"3px",letterSpacing:"0.12em"}}>CREDIT LIMIT ($)</div><input style={inp} type="number" min="0" value={editCardItem.limit} onChange={e=>setEditCardItem(p=>({...p,limit:e.target.value}))}/></div>
                <div style={{flex:1}}><div style={{fontSize:"9px",color:C.muted,marginBottom:"3px",letterSpacing:"0.12em"}}>PAYMENT DUE DAY</div><input style={inp} type="number" min={1} max={31} value={editCardItem.dueDate} onChange={e=>setEditCardItem(p=>({...p,dueDate:e.target.value}))}/></div>
              </div>
              <div style={{display:"flex",gap:"8px",marginTop:"4px"}}>
                <button onClick={()=>setEditCardItem(null)} style={{...btnS("outline"),flex:1,padding:"9px"}}>Cancel</button>
                <button onClick={updateCard} style={{...btnS(),flex:1,padding:"9px"}}>✅ Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
