import { useState, useEffect, useCallback, useRef } from "react";
import { db } from "./firebase";
import { ref, onValue, set, update, remove, get } from "firebase/database";

// ─────────────────────────────────────────────────────────────────────
// COACH PASSWORD — change this to whatever you want
// ─────────────────────────────────────────────────────────────────────
const COACH_PASSWORD = "Cardinals9U";

// ── Constants ─────────────────────────────────────────────────────────
const POSITIONS = ["P","C","1B","2B","3B","SS","LF","CF","RF","Bench"];
const POS_COLORS = {
  P:"#e53935",C:"#1e88e5","1B":"#43a047","2B":"#fb8c00",
  "3B":"#8e24aa",SS:"#00acc1",LF:"#f4511e",CF:"#6d4c41",
  RF:"#039be5",Bench:"#546e7a"
};
const POS_LABELS = {
  P:"Pitcher",C:"Catcher","1B":"First Base","2B":"Second Base",
  "3B":"Third Base",SS:"Shortstop",LF:"Left Field",CF:"Center Field",
  RF:"Right Field",Bench:"Bench"
};
const FIELD_POS = {
  CF:{x:50,y:10},LF:{x:18,y:22},RF:{x:82,y:22},
  SS:{x:33,y:42},"2B":{x:57,y:36},"3B":{x:22,y:56},
  "1B":{x:76,y:56},P:{x:50,y:54},C:{x:50,y:74}
};
const INIT_PLAYERS = ["Player 1","Player 2","Player 3","Player 4","Player 5","Player 6","Player 7","Player 8","Player 9","Player 10","Player 11"];
const INNINGS = 6;
const OUTCOMES = [
  {code:"1B",label:"Single",color:"#2d7a2d"},{code:"2B",label:"Double",color:"#1a6b8a"},
  {code:"3B",label:"Triple",color:"#7a5a1a"},{code:"HR",label:"Home Run",color:"#b71c1c"},
  {code:"BB",label:"Walk",color:"#4a7a4a"},{code:"K",label:"Strikeout",color:"#8a1a1a"},
  {code:"Kl",label:"K Looking",color:"#6a1a6a"},{code:"E",label:"Error",color:"#8a6a1a"},
  {code:"FC",label:"Fielder's Ch.",color:"#5a5a8a"},{code:"SF",label:"Sac Fly",color:"#4a6a7a"},
  {code:"SAC",label:"Sacrifice",color:"#6a4a4a"},{code:"HBP",label:"Hit by Pitch",color:"#7a4a1a"},
  {code:"GO",label:"Ground Out",color:"#5a5a5a"},{code:"FO",label:"Fly Out",color:"#4a4a6a"},
  {code:"DP",label:"Double Play",color:"#6a3a3a"},
];
const BASE_COLORS = {"1B":"#2d7a2d","2B":"#1a6b8a","3B":"#b8860b",HR:"#b71c1c"};
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// ── Data factories ────────────────────────────────────────────────────
const emptyInning = () => POSITIONS.reduce((a,p)=>({...a,[p]:null}),{});
const emptyScoreCell = () => ({outcome:null,run:false});

function createGame(overrides={}) {
  return {
    id: `game_${Date.now()}`,
    date: "",
    time: "",
    opponent: "",
    location: "",
    result: null,
    runsFor: "",
    runsAgainst: "",
    notes: "",
    lineup: Array.from({length:INNINGS}, emptyInning),
    scoreGrid: Array.from({length:11}, ()=>Array.from({length:INNINGS}, emptyScoreCell)),
    teamRuns: Array(INNINGS).fill(0),
    oppRuns: Array(INNINGS).fill(0),
    pitchLog: Array.from({length:INNINGS}, ()=>[]),
    ...overrides,
  };
}

function newCalEvent(date="") {
  return { id:`evt_${Date.now()}`, date, time:"", opponent:"", location:"", notes:"" };
}

// ── Firebase helpers ──────────────────────────────────────────────────
// Firebase doesn't allow arrays — convert nulls and arrays for safe storage
function sanitize(obj) {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) {
    // Convert array to object with numeric keys so Firebase stores it safely
    const result = {};
    obj.forEach((v, i) => { result[i] = sanitize(v); });
    return result;
  }
  if (typeof obj === "object") {
    const result = {};
    Object.entries(obj).forEach(([k, v]) => { result[k] = sanitize(v); });
    return result;
  }
  return obj;
}

function restoreGame(raw) {
  if (!raw) return null;
  // Restore arrays from Firebase objects
  const restoreArr = (obj, def) => {
    if (!obj) return def;
    if (Array.isArray(obj)) return obj;
    const len = Math.max(...Object.keys(obj).map(Number).filter(n=>!isNaN(n))) + 1;
    return Array.from({length:len}, (_,i) => obj[i] !== undefined ? obj[i] : def[0]);
  };

  return {
    ...raw,
    lineup: raw.lineup
      ? Array.from({length:INNINGS}, (_,i) => raw.lineup[i] ? {...emptyInning(),...raw.lineup[i]} : emptyInning())
      : Array.from({length:INNINGS}, emptyInning),
    scoreGrid: raw.scoreGrid
      ? Array.from({length:11}, (_,pi) => Array.from({length:INNINGS}, (_,ii) => raw.scoreGrid[pi]?.[ii] ? raw.scoreGrid[pi][ii] : emptyScoreCell()))
      : Array.from({length:11}, ()=>Array.from({length:INNINGS}, emptyScoreCell)),
    teamRuns: raw.teamRuns ? Array.from({length:INNINGS}, (_,i)=>raw.teamRuns[i]||0) : Array(INNINGS).fill(0),
    oppRuns: raw.oppRuns ? Array.from({length:INNINGS}, (_,i)=>raw.oppRuns[i]||0) : Array(INNINGS).fill(0),
    pitchLog: raw.pitchLog
      ? Array.from({length:INNINGS}, (_,i)=> raw.pitchLog[i] ? Object.values(raw.pitchLog[i]) : [])
      : Array.from({length:INNINGS}, ()=>[]),
  };
}

// ── Mini Components ───────────────────────────────────────────────────
function MiniDiamond({outcome, run, size=38}) {
  const color = outcome ? (BASE_COLORS[outcome]||"#888") : "#ccc";
  return (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <polygon points="20,4 36,20 20,36 4,20" fill={run?"rgba(229,57,53,0.25)":"transparent"} stroke={outcome?color:"#c8b89a"} strokeWidth={outcome?"2":"1.2"}/>
      {["1B","2B","3B","HR"].includes(outcome) && <>
        <circle cx="36" cy="20" r="3" fill={color}/>
        {["2B","3B","HR"].includes(outcome)&&<circle cx="20" cy="4" r="3" fill={color}/>}
        {["3B","HR"].includes(outcome)&&<circle cx="4" cy="20" r="3" fill={color}/>}
        {outcome==="HR"&&<circle cx="20" cy="36" r="3.5" fill="#e53935"/>}
      </>}
      {run&&<circle cx="20" cy="36" r="3.5" fill="#e53935"/>}
      {outcome&&<text x="20" y="24" textAnchor="middle" fontSize="9" fontWeight="bold" fill={color} fontFamily="Georgia,serif">{outcome}</text>}
    </svg>
  );
}

function TallyMarks({count, color}) {
  const groups=Math.floor(count/5), rem=count%5, marks=[];
  for(let g=0;g<groups;g++) marks.push(
    <svg key={`g${g}`} width="22" height="18" viewBox="0 0 22 18" style={{display:"inline-block"}}>
      {[0,1,2,3].map(i=><line key={i} x1={3+i*4} y1="3" x2={3+i*4} y2="15" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>)}
      <line x1="1" y1="15" x2="21" y2="3" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
  if(rem>0) marks.push(
    <svg key="r" width={rem*4+4} height="18" viewBox={`0 0 ${rem*4+4} 18`} style={{display:"inline-block"}}>
      {Array.from({length:rem},(_,i)=><line key={i} x1={3+i*4} y1="3" x2={3+i*4} y2="15" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>)}
    </svg>
  );
  return <span style={{display:"inline-flex",alignItems:"center",gap:2,flexWrap:"wrap"}}>{marks}</span>;
}

// ── FORM FIELDS ───────────────────────────────────────────────────────
function FormFields({form, onChange, showResult}) {
  return <>
    <div style={S.formField}><div style={S.formLabel}>Opponent</div>
      <input style={S.formInput} placeholder="Team name" value={form.opponent||""} onChange={e=>onChange(v=>({...v,opponent:e.target.value}))}/></div>
    <div style={{display:"flex",gap:8}}>
      <div style={{...S.formField,flex:2}}><div style={S.formLabel}>Date</div>
        <input style={S.formInput} type="date" value={form.date||""} onChange={e=>onChange(v=>({...v,date:e.target.value}))}/></div>
      <div style={{...S.formField,flex:1}}><div style={S.formLabel}>Time</div>
        <input style={S.formInput} type="time" value={form.time||""} onChange={e=>onChange(v=>({...v,time:e.target.value}))}/></div>
    </div>
    <div style={S.formField}><div style={S.formLabel}>Location</div>
      <div style={S.toggleRow}>
        {["Home","Away","Neutral"].map(loc=>(
          <button key={loc} style={{...S.toggle,...(form.location===loc?S.toggleActive:{})}} onClick={()=>onChange(v=>({...v,location:loc}))}>{loc}</button>
        ))}
      </div>
    </div>
    {showResult&&<>
      <div style={S.formField}><div style={S.formLabel}>Result</div>
        <div style={S.toggleRow}>
          {[null,"W","L","T"].map(r=>(
            <button key={String(r)} style={{...S.toggle,...(form.result===r?{background:r==="W"?"#2d7a2d":r==="L"?"#8a1a1a":r==="T"?"#7a6a1a":"#444",color:"#fff",border:"1px solid transparent"}:{})}}
              onClick={()=>onChange(v=>({...v,result:r}))}>
              {r===null?"Upcoming":r==="W"?"✅ Win":r==="L"?"❌ Loss":"🤝 Tie"}
            </button>
          ))}
        </div>
      </div>
      {form.result&&<div style={{display:"flex",gap:8}}>
        <div style={{...S.formField,flex:1}}><div style={S.formLabel}>Cardinals Runs</div>
          <input style={S.formInput} type="number" min="0" placeholder="0" value={form.runsFor||""} onChange={e=>onChange(v=>({...v,runsFor:e.target.value}))}/></div>
        <div style={{...S.formField,flex:1}}><div style={S.formLabel}>{form.opponent||"Opp."} Runs</div>
          <input style={S.formInput} type="number" min="0" placeholder="0" value={form.runsAgainst||""} onChange={e=>onChange(v=>({...v,runsAgainst:e.target.value}))}/></div>
      </div>}
    </>}
    <div style={S.formField}><div style={S.formLabel}>Notes</div>
      <textarea style={{...S.formInput,height:64,resize:"none"}} placeholder="Field, weather, notes..." value={form.notes||""} onChange={e=>onChange(v=>({...v,notes:e.target.value}))}/></div>
  </>;
}

// ── MAIN APP ──────────────────────────────────────────────────────────
export default function App() {
  // ── Cloud state (synced from Firebase) ────────────────────────────
  const [players, setPlayersState] = useState(INIT_PLAYERS);
  const [games, setGamesState] = useState([]);
  const [calEvents, setCalEventsState] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState("connecting"); // connecting | live | offline

  // ── Auth state ────────────────────────────────────────────────────
  const [isCoach, setIsCoach] = useState(() => sessionStorage.getItem("cr_coach")==="yes");
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);

  // ── UI state ─────────────────────────────────────────────────────
  const [tab, setTab] = useState("games");
  const [openGameId, setOpenGameId] = useState(null);
  const [gameTab, setGameTab] = useState("lineup");
  const [seasonTab, setSeasonTab] = useState("calendar");
  const [lineupInning, setLineupInning] = useState(0);
  const [fieldInning, setFieldInning] = useState(0);
  const [scoreInning, setScoreInning] = useState(0);
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [editName, setEditName] = useState("");
  const [assignModal, setAssignModal] = useState(null);
  const [outcomeModal, setOutcomeModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [newGameModal, setNewGameModal] = useState(false);
  const [newGameForm, setNewGameForm] = useState({date:"",time:"",opponent:"",location:"",notes:""});
  const [editGameModal, setEditGameModal] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [calMonth, setCalMonth] = useState(()=>{const n=new Date();return{year:n.getFullYear(),month:n.getMonth()};});
  const [calEventModal, setCalEventModal] = useState(null);
  const [editingCalEvent, setEditingCalEvent] = useState(null);

  const showToast = msg => { setToast(msg); setTimeout(()=>setToast(null),2400); };

  // ── Firebase listeners ────────────────────────────────────────────
  useEffect(()=>{
    let unsubs = [];
    const handleErr = () => setSyncStatus("offline");

    // Players
    const pRef = ref(db,"players");
    const unsubP = onValue(pRef, snap=>{
      const val=snap.val();
      if(val) setPlayersState(Array.isArray(val)?val:Object.values(val));
      setSyncStatus("live"); setLoading(false);
    }, handleErr);
    unsubs.push(unsubP);

    // Games
    const gRef = ref(db,"games");
    const unsubG = onValue(gRef, snap=>{
      const val=snap.val()||{};
      const restored = Object.values(val).map(restoreGame).filter(Boolean).sort((a,b)=>(a.date||"").localeCompare(b.date||""));
      setGamesState(restored);
    }, handleErr);
    unsubs.push(unsubG);

    // Calendar events
    const eRef = ref(db,"events");
    const unsubE = onValue(eRef, snap=>{
      const val=snap.val()||{};
      setCalEventsState(Object.values(val).sort((a,b)=>(a.date||"").localeCompare(b.date||"")));
    }, handleErr);
    unsubs.push(unsubE);

    return ()=>unsubs.forEach(u=>u());
  },[]);

  // Init players on first load if empty
  useEffect(()=>{
    if(!loading && players.length===0) {
      set(ref(db,"players"), sanitize(INIT_PLAYERS));
    }
  },[loading]);

  // ── Auth helpers ──────────────────────────────────────────────────
  const tryPassword = () => {
    if(passwordInput===COACH_PASSWORD) {
      setIsCoach(true);
      sessionStorage.setItem("cr_coach","yes");
      setShowPasswordModal(false);
      setPasswordInput("");
      setPasswordError(false);
      showToast("Coach mode enabled ✅");
    } else {
      setPasswordError(true);
      setPasswordInput("");
    }
  };
  const lockCoach = () => {
    setIsCoach(false);
    sessionStorage.removeItem("cr_coach");
    showToast("Switched to view-only mode");
  };

  // Guard: require coach auth for edits
  const requireCoach = (fn) => {
    if(!isCoach) { setShowPasswordModal(true); return; }
    fn();
  };

  // ── Firebase write helpers ────────────────────────────────────────
  const fbSetPlayers = (newPlayers) => {
    set(ref(db,"players"), sanitize(newPlayers));
  };

  const fbSetGame = (game) => {
    set(ref(db,`games/${game.id}`), sanitize(game));
  };

  const fbUpdateGame = (gameId, updater) => {
    const game = games.find(g=>g.id===gameId);
    if(!game) return;
    const updated = typeof updater==="function" ? updater(game) : {...game,...updater};
    set(ref(db,`games/${gameId}`), sanitize(updated));
  };

  const fbDeleteGame = (gameId) => {
    remove(ref(db,`games/${gameId}`));
  };

  const fbSetCalEvent = (event) => {
    set(ref(db,`events/${event.id}`), sanitize(event));
  };

  const fbDeleteCalEvent = (eventId) => {
    remove(ref(db,`events/${eventId}`));
  };

  // ── Game actions ──────────────────────────────────────────────────
  const openGame = (id) => {
    setOpenGameId(id);
    setGameTab("lineup");
    setLineupInning(0);
    setFieldInning(0);
    setScoreInning(0);
  };

  const createNewGame = () => requireCoach(()=>{
    const lastGame = games.length>0 ? games[games.length-1] : null;
    const g = createGame({
      ...newGameForm,
      lineup: lastGame ? lastGame.lineup.map(inn=>({...inn})) : Array.from({length:INNINGS},emptyInning),
    });
    fbSetGame(g);
    setNewGameModal(false);
    setNewGameForm({date:"",time:"",opponent:"",location:"",notes:""});
    setTimeout(()=>openGame(g.id), 300);
    showToast("Game created!");
  });

  const saveGameEdits = () => requireCoach(()=>{
    fbSetGame(editGameModal);
    setEditGameModal(null);
    showToast("Game saved!");
  });

  const deleteGame = (id) => requireCoach(()=>{
    fbDeleteGame(id);
    if(openGameId===id) setOpenGameId(null);
    setDeleteConfirm(null);
    showToast("Game deleted");
  });

  const currentGame = games.find(g=>g.id===openGameId)||null;

  // ── Lineup actions ────────────────────────────────────────────────
  const assignPlayer = (pos, player, inning) => requireCoach(()=>{
    fbUpdateGame(openGameId, g=>{
      const lineup = g.lineup.map(inn=>({...inn}));
      Object.keys(lineup[inning]).forEach(p=>{ if(lineup[inning][p]===player) lineup[inning][p]=null; });
      lineup[inning][pos] = player;
      return {...g, lineup};
    });
    setAssignModal(null);
    showToast(`${player} → ${pos}`);
  });

  const removeFromPos = (inning, pos) => requireCoach(()=>{
    fbUpdateGame(openGameId, g=>{
      const lineup = g.lineup.map(inn=>({...inn}));
      lineup[inning][pos] = null;
      return {...g, lineup};
    });
  });

  const copyInning = (from, to) => requireCoach(()=>{
    fbUpdateGame(openGameId, g=>{
      const lineup = g.lineup.map(inn=>({...inn}));
      lineup[to] = {...lineup[from]};
      return {...g, lineup};
    });
    showToast(`Inning ${from+1} copied to ${to+1}`);
  });

  const getUnassigned = (inning) => {
    if(!currentGame) return players;
    const assigned = new Set(Object.values(currentGame.lineup[inning]||{}).filter(Boolean));
    return players.filter(p=>!assigned.has(p));
  };

  const getPlayerPos = (inning, player) => {
    if(!currentGame) return null;
    return Object.entries(currentGame.lineup[inning]||{}).find(([,p])=>p===player)?.[0]||null;
  };

  // ── Scorebook actions ─────────────────────────────────────────────
  const setOutcome = (pi, ii, outcome) => requireCoach(()=>{
    fbUpdateGame(openGameId, g=>{
      const sg = g.scoreGrid.map(r=>r.map(c=>({...c})));
      sg[pi][ii].outcome = outcome;
      return {...g, scoreGrid:sg};
    });
    setOutcomeModal(null);
  });

  const toggleRun = (pi, ii) => requireCoach(()=>{
    fbUpdateGame(openGameId, g=>{
      const sg = g.scoreGrid.map(r=>r.map(c=>({...c})));
      sg[pi][ii].run = !sg[pi][ii].run;
      return {...g, scoreGrid:sg};
    });
  });

  const adjTeamRuns = (ii, d) => requireCoach(()=>{
    fbUpdateGame(openGameId, g=>{
      const tr=[...g.teamRuns]; tr[ii]=Math.max(0,(tr[ii]||0)+d); return {...g,teamRuns:tr};
    });
  });

  const adjOppRuns = (ii, d) => requireCoach(()=>{
    fbUpdateGame(openGameId, g=>{
      const or=[...g.oppRuns]; or[ii]=Math.max(0,(or[ii]||0)+d); return {...g,oppRuns:or};
    });
  });

  const addPitch = type => requireCoach(()=>{
    fbUpdateGame(openGameId, g=>{
      const pl=g.pitchLog.map(a=>[...a]); pl[scoreInning]=[...pl[scoreInning],type]; return {...g,pitchLog:pl};
    });
  });

  const undoPitch = () => requireCoach(()=>{
    fbUpdateGame(openGameId, g=>{
      const pl=g.pitchLog.map(a=>[...a]);
      if(pl[scoreInning].length>0) pl[scoreInning]=pl[scoreInning].slice(0,-1);
      return {...g,pitchLog:pl};
    });
  });

  const resetPitches = () => requireCoach(()=>{
    fbUpdateGame(openGameId, g=>{
      const pl=g.pitchLog.map(a=>[...a]); pl[scoreInning]=[]; return {...g,pitchLog:pl};
    });
  });

  // ── Roster actions ────────────────────────────────────────────────
  const renamePlayer = (idx, name) => requireCoach(()=>{
    const oldName = players[idx];
    const newName = name.trim()||oldName;
    const newPlayers = players.map((p,i)=>i===idx?newName:p);
    fbSetPlayers(newPlayers);
    // Update all games lineups
    games.forEach(g=>{
      const needsUpdate = g.lineup.some(inn=>Object.values(inn).includes(oldName));
      if(needsUpdate) {
        const newLineup = g.lineup.map(inn=>{
          const n={...inn};
          Object.keys(n).forEach(pos=>{ if(n[pos]===oldName) n[pos]=newName; });
          return n;
        });
        fbSetGame({...g, lineup:newLineup});
      }
    });
    setEditingPlayer(null);
  });

  // ── Calendar actions ──────────────────────────────────────────────
  const saveCalEvent = () => requireCoach(()=>{
    fbSetCalEvent(editingCalEvent);
    setCalEventModal(null);
    setEditingCalEvent(null);
    showToast("Event saved!");
  });

  const deleteCalEvent = (id) => requireCoach(()=>{
    fbDeleteCalEvent(id);
    setCalEventModal(null);
    setEditingCalEvent(null);
    showToast("Event removed");
  });

  // ── Derived ───────────────────────────────────────────────────────
  const completedGames = games.filter(g=>g.result);
  const totalW = completedGames.filter(g=>g.result==="W").length;
  const totalL = completedGames.filter(g=>g.result==="L").length;
  const totalT = completedGames.filter(g=>g.result==="T").length;
  const formatDate = d=>{ if(!d) return ""; const [y,m,dd]=d.split("-"); return `${MONTHS[parseInt(m)-1].slice(0,3)} ${parseInt(dd)}`; };
  const resultColor = r=>r==="W"?"#4CAF50":r==="L"?"#e53935":r==="T"?"#fb8c00":"#555";
  const resultBg = r=>r==="W"?"rgba(76,175,80,0.15)":r==="L"?"rgba(229,57,53,0.15)":r==="T"?"rgba(251,140,0,0.15)":"#1e1e1e";
  const fieldPositions = POSITIONS.filter(p=>p!=="Bench");

  // Calendar grid
  const {year,month} = calMonth;
  const firstDay = new Date(year,month,1).getDay();
  const daysInMonth = new Date(year,month+1,0).getDate();
  const calCells = [];
  for(let i=0;i<firstDay;i++) calCells.push(null);
  for(let d=1;d<=daysInMonth;d++) calCells.push(d);
  while(calCells.length%7!==0) calCells.push(null);
  const dateStr = d=>`${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  const todayDate = new Date();
  const isToday = d=>d&&todayDate.getFullYear()===year&&todayDate.getMonth()===month&&todayDate.getDate()===d;
  const gamesOnDay = d=>games.filter(g=>g.date===dateStr(d));
  const eventsOnDay = d=>calEvents.filter(e=>e.date===dateStr(d));

  // ── Loading screen ─────────────────────────────────────────────────
  if(loading) return (
    <div style={{background:"#0f0f0f",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh",fontFamily:"'Georgia',serif"}}>
      <div style={{width:48,height:48,border:"3px solid #1e1e1e",borderTop:"3px solid #e53935",borderRadius:"50%",animation:"spin 0.8s linear infinite",marginBottom:20}}/>
      <div style={{fontSize:12,color:"#333",letterSpacing:2}}>LOADING...</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────
  // GAME DETAIL VIEW
  // ─────────────────────────────────────────────────────────────────
  if(openGameId && currentGame) {
    const g = currentGame;
    const pitches = g.pitchLog[scoreInning]||[];
    const balls = pitches.filter(p=>p==="ball").length;
    const strikes = pitches.filter(p=>p==="strike").length;
    const fouls = pitches.filter(p=>p==="foul").length;
    const totalPitchesInning = pitches.length;
    const totalPitchesGame = g.pitchLog.flat().length;
    const cardRuns = g.teamRuns.reduce((a,b)=>a+b,0);
    const oppRuns2 = g.oppRuns.reduce((a,b)=>a+b,0);

    return (
      <div style={S.root}>
        <style>{css}</style>

        {/* Game header */}
        <div style={S.gameHeader}>
          <button style={S.backBtn} onClick={()=>setOpenGameId(null)}>‹ Games</button>
          <div style={S.gameHeaderCenter}>
            <div style={S.gameHeaderOpp}>{g.opponent||"Untitled Game"}</div>
            <div style={S.gameHeaderMeta}>{formatDate(g.date)}{g.time?` · ${g.time}`:""}{g.location?` · ${g.location}`:""}</div>
          </div>
          <div style={{...S.resultBadge,background:resultBg(g.result),color:resultColor(g.result)}}>
            {g.result||(g.date&&new Date(g.date)<todayDate?"Final":"—")}
          </div>
        </div>

        {/* Sync + auth bar */}
        <div style={S.syncBar}>
          <div style={{...S.syncDot,background:syncStatus==="live"?"#4CAF50":syncStatus==="offline"?"#e53935":"#fb8c00"}}/>
          <span style={S.syncText}>{syncStatus==="live"?"Live sync":syncStatus==="offline"?"Offline":"Connecting..."}</span>
          <span style={S.syncSpacer}/>
          {isCoach
            ? <button style={S.coachBadge} onClick={lockCoach}>🔓 Coach Mode</button>
            : <button style={S.viewBadge} onClick={()=>setShowPasswordModal(true)}>🔒 View Only</button>
          }
        </div>

        {/* Game sub-tabs */}
        <div style={S.gameSubNav}>
          {[["lineup","⚾ Lineup"],["field","🏟 Field"],["score","📓 Score"],["print","🖨️ Print"]].map(([id,label])=>(
            <button key={id} style={{...S.gameSubBtn,...(gameTab===id?S.gameSubBtnActive:{})}} onClick={()=>setGameTab(id)}>{label}</button>
          ))}
          <button style={S.gameEditBtn} onClick={()=>requireCoach(()=>setEditGameModal({...g}))}>✏️</button>
        </div>

        {/* ── LINEUP TAB ── */}
        {gameTab==="lineup"&&(
          <div style={S.content}>
            <div style={S.scoreBar}>
              <span style={S.scoreBarTeam}>Cardinals</span>
              <span style={S.scoreBarScore}>{cardRuns} – {oppRuns2}</span>
              <span style={S.scoreBarTeam}>{g.opponent||"Opp."}</span>
            </div>
            <div style={S.inningTabs}>
              {Array.from({length:INNINGS},(_,i)=>(
                <button key={i} style={{...S.inningTab,...(lineupInning===i?S.inningTabActive:{})}} onClick={()=>setLineupInning(i)}>
                  <span style={S.innTabNum}>INN</span><span style={S.innTabBig}>{i+1}</span>
                </button>
              ))}
            </div>
            {lineupInning>0&&(
              <div style={S.copyBar}>
                <span style={S.copyBarLabel}>Copy from:</span>
                {Array.from({length:lineupInning},(_,i)=>(
                  <button key={i} style={S.copyBtn} onClick={()=>copyInning(i,lineupInning)}>Inn {i+1}</button>
                ))}
              </div>
            )}
            <div style={S.sectionLabel}>⚾ Positions</div>
            <div style={S.posGrid}>
              {fieldPositions.map(pos=>{
                const player=g.lineup[lineupInning]?.[pos];
                return (
                  <div key={pos} style={S.posCard} onClick={()=>requireCoach(()=>setAssignModal({pos,inning:lineupInning,mode:"position"}))}>
                    <div style={{...S.posBadge,background:POS_COLORS[pos]}}>{pos}</div>
                    <div style={S.posPlayer}>{player||<span style={S.posEmpty}>{isCoach?"Tap to assign":"—"}</span>}</div>
                    {player&&isCoach&&<button style={S.posRemove} onClick={e=>{e.stopPropagation();removeFromPos(lineupInning,pos);}}>✕</button>}
                  </div>
                );
              })}
            </div>
            <div style={S.sectionLabel}>🪑 Bench</div>
            <div style={S.benchArea}>
              {getUnassigned(lineupInning).length===0
                ? <div style={S.benchEmpty}>All players assigned!</div>
                : getUnassigned(lineupInning).map(p=>(
                  <div key={p} style={S.benchChip} onClick={()=>requireCoach(()=>setAssignModal({pos:"pick",player:p,inning:lineupInning}))}>
                    <span style={S.benchDot}/>{p}
                  </div>
                ))
              }
            </div>
            <div style={S.sectionLabel}>📋 Full Lineup</div>
            <div style={{overflowX:"auto",padding:"0 16px 20px"}}>
              <table style={S.summaryTable}>
                <thead><tr>
                  <th style={S.sumTh}>Player</th>
                  {Array.from({length:INNINGS},(_,i)=><th key={i} style={S.sumTh}>I{i+1}</th>)}
                </tr></thead>
                <tbody>
                  {players.map((p,pi)=>(
                    <tr key={pi}>
                      <td style={S.sumTdName}>{p.split(" ").pop()}</td>
                      {Array.from({length:INNINGS},(_,ii)=>{
                        const pos=getPlayerPos(ii,p);
                        return <td key={ii} style={{...S.sumTd,background:pos?POS_COLORS[pos]:"#1e1e1e",color:pos?"#fff":"#333"}}>{pos||"—"}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── FIELD TAB ── */}
        {gameTab==="field"&&(
          <div style={S.content}>
            <div style={S.inningTabs}>
              {Array.from({length:INNINGS},(_,i)=>(
                <button key={i} style={{...S.inningTab,...(fieldInning===i?S.inningTabActive:{})}} onClick={()=>setFieldInning(i)}>
                  <span style={S.innTabNum}>INN</span><span style={S.innTabBig}>{i+1}</span>
                </button>
              ))}
            </div>
            <div style={S.fieldWrapper}>
              <svg viewBox="0 0 100 92" style={S.fieldSvg} xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <radialGradient id="gg" cx="50%" cy="55%" r="65%"><stop offset="0%" stopColor="#3a6b24"/><stop offset="100%" stopColor="#1c3d0f"/></radialGradient>
                  <radialGradient id="dg" cx="50%" cy="55%" r="65%"><stop offset="0%" stopColor="#2e5a1b"/><stop offset="100%" stopColor="#162e0a"/></radialGradient>
                  <radialGradient id="ig" cx="50%" cy="50%" r="60%"><stop offset="0%" stopColor="#d4a96a"/><stop offset="100%" stopColor="#a07840"/></radialGradient>
                  <filter id="gl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                  <clipPath id="fc"><ellipse cx="50" cy="46" rx="47" ry="43"/></clipPath>
                </defs>
                <ellipse cx="50" cy="46" rx="47" ry="43" fill="url(#gg)"/>
                {[0,1,2,3,4,5].map(i=><ellipse key={i} cx="50" cy="48" rx={10+i*7} ry={9+i*6.5} fill={i%2===0?"url(#gg)":"url(#dg)"} clipPath="url(#fc)"/>)}
                <line x1="50" y1="80" x2="4" y2="4" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" strokeDasharray="2,1.5"/>
                <line x1="50" y1="80" x2="96" y2="4" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" strokeDasharray="2,1.5"/>
                <ellipse cx="50" cy="46" rx="45" ry="41" fill="none" stroke="#c8a060" strokeWidth="3" opacity="0.35"/>
                <polygon points="50,34 74,57 50,80 26,57" fill="url(#ig)" opacity="0.92"/>
                <circle cx="50" cy="57" r="14" fill="#3a6b24" opacity="0.5"/>
                <polygon points="50,34 74,57 50,80 26,57" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="0.5"/>
                <rect x="47.2" y="31.2" width="5.6" height="5.6" rx="1" fill="white" opacity="0.95"/>
                <rect x="71.2" y="54.2" width="5.6" height="5.6" rx="1" fill="white" opacity="0.95"/>
                <rect x="23.2" y="54.2" width="5.6" height="5.6" rx="1" fill="white" opacity="0.95"/>
                <polygon points="50,77 53.5,80.5 52,84 48,84 46.5,80.5" fill="white" opacity="0.95"/>
                <ellipse cx="50" cy="57" rx="4" ry="2.5" fill="#b8906a" stroke="rgba(255,255,255,0.25)" strokeWidth="0.4"/>
                <circle cx="50" cy="57" r="1.2" fill="#c89a72"/>
                {Object.entries(FIELD_POS).map(([pos,c])=>{
                  const player=g.lineup[fieldInning]?.[pos]; const color=POS_COLORS[pos]; const r=5.2;
                  const parts=player?player.split(" "):[];
                  const short=player?(parts.length>=2?`${parts[0][0]}.${parts[parts.length-1]}`:player.substring(0,7)):null;
                  return (
                    <g key={pos} style={{cursor:"pointer"}} onClick={()=>requireCoach(()=>setAssignModal({pos,inning:fieldInning,mode:"position"}))}>
                      {player&&<circle cx={c.x} cy={c.y} r={r+2.8} fill={color} opacity="0.2" filter="url(#gl)"/>}
                      <circle cx={c.x+0.4} cy={c.y+0.6} r={r} fill="rgba(0,0,0,0.4)"/>
                      <circle cx={c.x} cy={c.y} r={r} fill={player?color:"rgba(15,15,15,0.72)"} stroke={player?"rgba(255,255,255,0.8)":"rgba(255,255,255,0.22)"} strokeWidth={player?"0.8":"0.5"}/>
                      <text x={c.x} y={c.y+1.3} textAnchor="middle" fontSize="2.9" fontWeight="bold" fill={player?"white":"rgba(255,255,255,0.3)"} fontFamily="Georgia,serif">{pos}</text>
                      {player&&<g><rect x={c.x-9.5} y={c.y+r+0.6} width="19" height="5.8" rx="1.8" fill="rgba(0,0,0,0.82)" stroke={color} strokeWidth="0.4"/><text x={c.x} y={c.y+r+4.8} textAnchor="middle" fontSize="2.7" fill="white" fontFamily="Georgia,serif" fontWeight="bold">{short}</text></g>}
                      {!player&&<text x={c.x} y={c.y+r+5.2} textAnchor="middle" fontSize="2" fill="rgba(255,255,255,0.28)" fontFamily="Georgia,serif">empty</text>}
                    </g>
                  );
                })}
              </svg>
            </div>
            <div style={S.fieldLegend}>
              {Object.entries(FIELD_POS).map(([pos])=>{
                const player=g.lineup[fieldInning]?.[pos];
                return (
                  <div key={pos} style={S.legendRow} onClick={()=>requireCoach(()=>setAssignModal({pos,inning:fieldInning,mode:"position"}))}>
                    <span style={{...S.legendBadge,background:POS_COLORS[pos]}}>{pos}</span>
                    <span style={S.legendName}>{player||<span style={S.legendEmpty}>—</span>}</span>
                    {player&&isCoach&&<button style={S.legendRemove} onClick={e=>{e.stopPropagation();removeFromPos(fieldInning,pos);}}>✕</button>}
                  </div>
                );
              })}
            </div>
            <div style={S.sectionLabel}>🪑 Not Playing</div>
            <div style={S.benchArea}>
              {players.filter(p=>!Object.values(g.lineup[fieldInning]||{}).some(v=>v===p)).length===0
                ? <div style={S.benchEmpty}>All players on field!</div>
                : players.filter(p=>!Object.values(g.lineup[fieldInning]||{}).some(v=>v===p)).map(p=>(
                  <div key={p} style={S.benchChip} onClick={()=>requireCoach(()=>setAssignModal({pos:"pick",player:p,inning:fieldInning}))}>
                    <span style={S.benchDot}/>{p}
                  </div>
                ))
              }
            </div>
          </div>
        )}

        {/* ── SCORE TAB ── */}
        {gameTab==="score"&&(
          <div style={sb.page}>
            <div style={sb.scoreboard}>
              <div style={sb.sbRow}>
                <div style={sb.sbTeamCell}>CARDINALS</div>
                {Array.from({length:INNINGS},(_,i)=>(
                  <div key={i} style={sb.sbInnCell}>
                    <div style={sb.sbInnNum}>{i+1}</div>
                    <div style={sb.sbRunCtrl}>
                      <button style={sb.runBtn} onClick={()=>adjTeamRuns(i,1)}>+</button>
                      <span style={sb.runNum}>{g.teamRuns[i]||0}</span>
                      <button style={sb.runBtn} onClick={()=>adjTeamRuns(i,-1)}>−</button>
                    </div>
                  </div>
                ))}
                <div style={{...sb.sbInnCell,...sb.totalCell}}><div style={sb.totalLbl}>R</div><div style={sb.totalNum}>{cardRuns}</div></div>
              </div>
              <div style={sb.sbRow}>
                <div style={sb.sbTeamCell}>{(g.opponent||"OPP").toUpperCase().slice(0,10)}</div>
                {Array.from({length:INNINGS},(_,i)=>(
                  <div key={i} style={sb.sbInnCell}>
                    <div style={sb.sbRunCtrl}>
                      <button style={sb.runBtn} onClick={()=>adjOppRuns(i,1)}>+</button>
                      <span style={sb.runNum}>{g.oppRuns[i]||0}</span>
                      <button style={sb.runBtn} onClick={()=>adjOppRuns(i,-1)}>−</button>
                    </div>
                  </div>
                ))}
                <div style={{...sb.sbInnCell,...sb.totalCell}}><div style={sb.totalNum}>{oppRuns2}</div></div>
              </div>
              <div style={sb.bigScore}>
                <div style={sb.bigTeam}><div style={sb.bigNum}>{cardRuns}</div><div style={sb.bigLabel}>Cardinals</div></div>
                <div style={sb.bigDash}>—</div>
                <div style={sb.bigTeam}><div style={sb.bigNum}>{oppRuns2}</div><div style={sb.bigLabel}>{g.opponent||"Opp."}</div></div>
              </div>
            </div>
            <div style={sb.sectionHead}>📋 AT-BAT RECORD</div>
            <div style={{overflowX:"auto"}}>
              <table style={sb.scoreTable}>
                <thead><tr>
                  <th style={sb.thName}>BATTER</th>
                  {Array.from({length:INNINGS},(_,i)=><th key={i} style={sb.thInn}>INN {i+1}</th>)}
                </tr></thead>
                <tbody>
                  {players.map((player,pi)=>(
                    <tr key={pi} style={pi%2===0?sb.trEven:sb.trOdd}>
                      <td style={sb.tdName}><div style={sb.batNum}>#{pi+1}</div><div style={sb.batName}>{player.split(" ").pop()}</div></td>
                      {Array.from({length:INNINGS},(_,ii)=>{
                        const cell=g.scoreGrid[pi]?.[ii]||emptyScoreCell();
                        return (
                          <td key={ii} style={sb.tdCell} onClick={()=>requireCoach(()=>setOutcomeModal({pi,ii}))}>
                            <div style={sb.cellInner}><MiniDiamond outcome={cell.outcome} run={cell.run}/>{cell.run&&<div style={sb.runDot}>R</div>}</div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={sb.gridHint}>{isCoach?"Tap a cell to record at-bat":"View-only mode — log in as coach to edit"}</div>
            <div style={sb.sectionHead}>⚾ PITCH COUNT</div>
            <div style={sb.pitchPanel}>
              <div style={sb.pitchInnRow}>
                {Array.from({length:INNINGS},(_,i)=>(
                  <button key={i} style={{...sb.pitchInnBtn,...(scoreInning===i?sb.pitchInnActive:{})}} onClick={()=>setScoreInning(i)}>I{i+1}</button>
                ))}
              </div>
              <div style={sb.liveCount}>
                {[["BALLS",balls,"#4CAF50"],["STRIKES",strikes,"#e53935"],["FOULS",fouls,"#fb8c00"],["THIS INN",totalPitchesInning,"#8a6a4a"],["GAME",totalPitchesGame,"#5a3a1a"]].map(([lbl,val,clr])=>(
                  <div key={lbl} style={sb.liveBox}><div style={{...sb.liveNum,color:clr}}>{val}</div><div style={sb.liveLbl}>{lbl}</div></div>
                ))}
              </div>
              <div style={sb.pitchBtns}>
                <button style={{...sb.pitchBtn,background:"#e8f5e9",color:"#2d6a2d"}} onClick={()=>addPitch("ball")}><span style={sb.pitchIcon}>●</span>Ball</button>
                <button style={{...sb.pitchBtn,background:"#ffebee",color:"#8a1a1a"}} onClick={()=>addPitch("strike")}><span style={sb.pitchIcon}>✗</span>Strike</button>
                <button style={{...sb.pitchBtn,background:"#fff8e1",color:"#8a6a1a"}} onClick={()=>addPitch("foul")}><span style={sb.pitchIcon}>↗</span>Foul</button>
              </div>
              <div style={sb.pitchActions}>
                <button style={sb.undoBtn} onClick={undoPitch}>↩ Undo</button>
                <button style={sb.resetBtn} onClick={resetPitches}>⟳ Reset Inning</button>
              </div>
              <div style={sb.tallySection}>
                {[["Balls",balls,"#2d6a2d"],["Strikes",strikes,"#8a1a1a"],["Fouls",fouls,"#8a6a1a"]].map(([lbl,cnt,clr])=>(
                  <div key={lbl} style={sb.tallyRow}>
                    <div style={sb.tallyLbl}>{lbl}</div>
                    <div style={sb.tallyMarks}><TallyMarks count={cnt} color={clr}/>{cnt===0&&<span style={sb.tallyNone}>—</span>}</div>
                  </div>
                ))}
              </div>
              <div style={sb.pitchSummTitle}>PITCH TOTALS BY INNING</div>
              <div style={sb.pitchSummGrid}>
                {Array.from({length:INNINGS},(_,i)=>{
                  const log=g.pitchLog[i]||[]; const b=log.filter(p=>p==="ball").length; const s=log.filter(p=>p==="strike").length; const f=log.filter(p=>p==="foul").length;
                  return (
                    <div key={i} style={{...sb.pitchSummCell,...(scoreInning===i?sb.pitchSummActive:{})}} onClick={()=>setScoreInning(i)}>
                      <div style={sb.pitchSummInn}>INN {i+1}</div>
                      <div style={sb.pitchSummTotal}>{log.length}</div>
                      <div style={sb.pitchSummBreak}><span style={{color:"#2d6a2d"}}>{b}B</span><span style={{color:"#8a1a1a"}}> {s}S</span><span style={{color:"#8a6a1a"}}> {f}F</span></div>
                    </div>
                  );
                })}
              </div>
            </div>
            {outcomeModal&&(
              <div style={S.overlay} onClick={()=>setOutcomeModal(null)}>
                <div style={{...S.modal,background:"#faf6ee"}} onClick={e=>e.stopPropagation()}>
                  <div style={{...S.modalTitle,color:"#2a1a08",borderBottom:"1px solid #e0d5c0"}}>{players[outcomeModal.pi]} — Inning {outcomeModal.ii+1}</div>
                  <div style={sb.outcomeGrid}>
                    {OUTCOMES.map(({code,label,color})=>{
                      const cell=g.scoreGrid[outcomeModal.pi]?.[outcomeModal.ii]||emptyScoreCell();
                      return (
                        <button key={code} style={{...sb.outcomeBtn,background:cell.outcome===code?color:"#f0ebe0",color:cell.outcome===code?"#fff":"#3a2a10",border:`1px solid ${color}40`}}
                          onClick={()=>setOutcome(outcomeModal.pi,outcomeModal.ii,code)}>
                          <span style={sb.outCode}>{code}</span><span style={sb.outLabel}>{label}</span>
                        </button>
                      );
                    })}
                    <button style={{...sb.outcomeBtn,gridColumn:"span 2",background:(g.scoreGrid[outcomeModal.pi]?.[outcomeModal.ii]||emptyScoreCell()).run?"#e53935":"#f0ebe0",color:(g.scoreGrid[outcomeModal.pi]?.[outcomeModal.ii]||emptyScoreCell()).run?"#fff":"#3a2a10",border:"1px solid #e5393540"}}
                      onClick={()=>{toggleRun(outcomeModal.pi,outcomeModal.ii);setOutcomeModal(null);}}>
                      <span style={sb.outCode}>R</span><span style={sb.outLabel}>Run Scored</span>
                    </button>
                    <button style={{...sb.outcomeBtn,background:"#f0ebe0",color:"#888",border:"1px solid #ccc"}} onClick={()=>setOutcome(outcomeModal.pi,outcomeModal.ii,null)}>
                      <span style={sb.outCode}>CLR</span><span style={sb.outLabel}>Clear</span>
                    </button>
                  </div>
                  <button style={{...S.modalClose,background:"#e8e0d0",color:"#5a4a30",margin:"8px 16px 0"}} onClick={()=>setOutcomeModal(null)}>Close</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── PRINT TAB ── */}
        {gameTab==="print"&&(
          <div style={S.content}>
            {/* Print button — only shows on screen, hides on paper */}
            <div style={S.printActionBar}>
              <div style={S.printHint}>Tap Print to send this lineup card to your printer or save as PDF.</div>
              <button style={S.printBtn} onClick={()=>window.print()}>🖨️ Print / Save PDF</button>
            </div>

            {/* ── PRINTABLE AREA ── */}
            <div id="printable" style={S.printPage}>
              {/* Header */}
              <div style={S.printHeader}>
                <div style={S.printHeaderLeft}>
                  <div style={S.printTeamName}>ST. LOUIS CARDINALS</div>
                  <div style={S.printSubtitle}>9U · Official Lineup Card</div>
                </div>
                <div style={S.printHeaderRight}>
                  <div style={S.printGameInfo}><strong>vs.</strong> {g.opponent||"———————"}</div>
                  <div style={S.printGameInfo}><strong>Date:</strong> {g.date ? new Date(g.date+'T12:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) : "———————"}</div>
                  <div style={S.printGameInfo}><strong>Time:</strong> {g.time||"———"} &nbsp;&nbsp; <strong>Location:</strong> {g.location||"———————"}</div>
                  {g.result&&<div style={S.printGameInfo}><strong>Result:</strong> {g.result} {g.runsFor&&g.runsAgainst?`(${g.runsFor}–${g.runsAgainst})`:""}</div>}
                </div>
              </div>

              {/* Main lineup grid */}
              <table style={S.printTable}>
                <thead>
                  <tr>
                    <th style={{...S.printTh,...S.printThPlayer}}>#</th>
                    <th style={{...S.printTh,...S.printThPlayer}}>PLAYER</th>
                    {Array.from({length:INNINGS},(_,i)=>(
                      <th key={i} style={S.printTh}>INN {i+1}</th>
                    ))}
                    <th style={S.printTh}>NOTES</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((player,pi)=>(
                    <tr key={pi} style={pi%2===0?S.printTrEven:S.printTrOdd}>
                      <td style={S.printTdNum}>{pi+1}</td>
                      <td style={S.printTdName}>{player}</td>
                      {Array.from({length:INNINGS},(_,ii)=>{
                        const pos = Object.entries(g.lineup[ii]||{}).find(([,p])=>p===player)?.[0]||null;
                        return (
                          <td key={ii} style={{...S.printTdPos,...(pos?{background:POS_COLORS[pos]+"22",fontWeight:"bold",color:"#1a1a1a"}:{})}}>
                            {pos||"—"}
                          </td>
                        );
                      })}
                      <td style={S.printTdNotes}>&nbsp;</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Inning-by-inning breakdown */}
              <div style={S.printSectionTitle}>FIELD ASSIGNMENTS BY INNING</div>
              <div style={S.printInningGrid}>
                {Array.from({length:INNINGS},(_,i)=>(
                  <div key={i} style={S.printInningBox}>
                    <div style={S.printInningHeader}>INNING {i+1}</div>
                    {fieldPositions.map(pos=>{
                      const player = g.lineup[i]?.[pos]||null;
                      return (
                        <div key={pos} style={S.printPosRow}>
                          <span style={{...S.printPosBadge,background:POS_COLORS[pos]}}>{pos}</span>
                          <span style={S.printPosPlayer}>{player||<span style={{color:"#bbb"}}>—</span>}</span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* Score box */}
              <div style={S.printScoreSection}>
                <div style={S.printSectionTitle}>SCORE BY INNING</div>
                <table style={S.printScoreTable}>
                  <thead>
                    <tr>
                      <th style={S.printScoreTh}>TEAM</th>
                      {Array.from({length:INNINGS},(_,i)=><th key={i} style={S.printScoreTh}>{i+1}</th>)}
                      <th style={{...S.printScoreTh,borderLeft:"2px solid #333"}}>R</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={S.printScoreTd}>Cardinals</td>
                      {g.teamRuns.map((r,i)=><td key={i} style={S.printScoreTd}>{r||""}</td>)}
                      <td style={{...S.printScoreTd,fontWeight:"bold",borderLeft:"2px solid #333"}}>{g.teamRuns.reduce((a,b)=>a+b,0)||""}</td>
                    </tr>
                    <tr>
                      <td style={S.printScoreTd}>{g.opponent||"Opponent"}</td>
                      {g.oppRuns.map((r,i)=><td key={i} style={S.printScoreTd}>{r||""}</td>)}
                      <td style={{...S.printScoreTd,fontWeight:"bold",borderLeft:"2px solid #333"}}>{g.oppRuns.reduce((a,b)=>a+b,0)||""}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              <div style={S.printFooter}>
                Cardinals 9U · Printed {new Date().toLocaleDateString()} · cardinals-app.vercel.app
              </div>
            </div>
          </div>
        )}

        {/* Assign modal */}
        {assignModal&&(
          <div style={S.overlay} onClick={()=>setAssignModal(null)}>
            <div style={S.modal} onClick={e=>e.stopPropagation()}>
              <div style={S.modalTitle}>
                {assignModal.mode==="pick"?`Assign ${assignModal.player}`:`${assignModal.pos} — ${POS_LABELS[assignModal.pos]||""}`}
              </div>
              {assignModal.mode==="pick"?(
                <div style={S.modalList}>
                  {fieldPositions.map(pos=>{
                    const cur=g.lineup[assignModal.inning]?.[pos];
                    return (
                      <button key={pos} style={S.modalItem} onClick={()=>assignPlayer(pos,assignModal.player,assignModal.inning)}>
                        <span style={{...S.modalBadge,background:POS_COLORS[pos]}}>{pos}</span>
                        <span style={S.modalPosName}>{POS_LABELS[pos]}</span>
                        {cur&&<span style={S.modalCurrent}>{cur}</span>}
                      </button>
                    );
                  })}
                </div>
              ):(
                <div style={S.modalList}>
                  {players.map(p=>{
                    const curPos=getPlayerPos(assignModal.inning,p);
                    return (
                      <button key={p} style={S.modalItem} onClick={()=>assignPlayer(assignModal.pos,p,assignModal.inning)}>
                        <span style={S.modalPlayerName}>{p}</span>
                        {curPos&&<span style={{...S.modalBadge,background:POS_COLORS[curPos]}}>{curPos}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
              <button style={S.modalClose} onClick={()=>setAssignModal(null)}>Cancel</button>
            </div>
          </div>
        )}

        {/* Edit game modal */}
        {editGameModal&&(
          <div style={S.overlay} onClick={()=>setEditGameModal(null)}>
            <div style={S.modal} onClick={e=>e.stopPropagation()}>
              <div style={S.modalTitle}>Edit Game</div>
              <div style={{overflowY:"auto",flex:1,padding:"12px 20px"}}>
                <FormFields form={editGameModal} onChange={setEditGameModal} showResult={true}/>
              </div>
              <div style={{padding:"8px 20px 0",display:"flex",gap:8}}>
                <button style={S.saveBtn} onClick={saveGameEdits}>Save</button>
                <button style={S.deleteBtn} onClick={()=>setDeleteConfirm(editGameModal.id)}>Delete</button>
              </div>
              <button style={S.modalClose} onClick={()=>setEditGameModal(null)}>Cancel</button>
            </div>
          </div>
        )}

        {deleteConfirm&&(
          <div style={S.overlay} onClick={()=>setDeleteConfirm(null)}>
            <div style={S.modal} onClick={e=>e.stopPropagation()}>
              <div style={S.modalTitle}>Delete this game?</div>
              <div style={{padding:"12px 20px",color:"#aaa",fontSize:14}}>This cannot be undone.</div>
              <div style={{padding:"8px 20px",display:"flex",gap:8}}>
                <button style={S.saveBtn} onClick={()=>deleteGame(deleteConfirm)}>Yes, Delete</button>
              </div>
              <button style={S.modalClose} onClick={()=>setDeleteConfirm(null)}>Cancel</button>
            </div>
          </div>
        )}

        {/* Password modal */}
        {showPasswordModal&&<PasswordModal onClose={()=>{setShowPasswordModal(false);setPasswordInput("");setPasswordError(false);}} passwordInput={passwordInput} setPasswordInput={setPasswordInput} passwordError={passwordError} onSubmit={tryPassword}/>}
        {toast&&<div style={S.toast}>{toast}</div>}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // MAIN TABS
  // ─────────────────────────────────────────────────────────────────
  return (
    <div style={S.root}>
      <style>{css}</style>

      <div style={S.header}>
        {/* Cardinals logo replaces the text title */}
        <img src="/cardinalslogo.webp" alt="Cardinals"
          style={S.headerLogo}
          onError={e=>{e.target.style.display="none";}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={S.headerSub}>9U LINEUP MANAGER</div>
          <div style={S.headerRecord}>{totalW}W – {totalL}L{totalT>0?` – ${totalT}T`:""}</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:syncStatus==="live"?"#4CAF50":syncStatus==="offline"?"#e53935":"#fb8c00"}}/>
          {isCoach
            ? <button style={{...S.coachBadge,fontSize:10}} onClick={lockCoach}>🔓 Coach</button>
            : <button style={{...S.viewBadge,fontSize:10}} onClick={()=>setShowPasswordModal(true)}>🔒 Login</button>
          }
        </div>
      </div>

      <div style={S.mainNav}>
        {[["games","⚾ Games"],["season","📅 Season"],["roster","👥 Roster"]].map(([id,label])=>(
          <button key={id} style={{...S.mainNavBtn,...(tab===id?S.mainNavBtnActive:{})}} onClick={()=>setTab(id)}>{label}</button>
        ))}
      </div>

      {/* ── GAMES ── */}
      {tab==="games"&&(
        <div style={S.content}>
          <div style={S.gamesTopBar}>
            <div style={S.gamesTitle}>Game Log</div>
            {isCoach&&<button style={S.newGameBtn} onClick={()=>setNewGameModal(true)}>+ New Game</button>}
          </div>
          {!isCoach&&games.length===0&&<div style={S.emptyState}><div style={S.emptyIcon}>👁</div><div style={S.emptyText}>View Only</div><div style={S.emptySubtext}>Log in as coach to create games</div><button style={S.emptyBtn} onClick={()=>setShowPasswordModal(true)}>Coach Login</button></div>}
          {isCoach&&games.length===0&&<div style={S.emptyState}><div style={S.emptyIcon}>⚾</div><div style={S.emptyText}>No games yet</div><div style={S.emptySubtext}>Tap "New Game" to get started</div><button style={S.emptyBtn} onClick={()=>setNewGameModal(true)}>Create First Game</button></div>}
          {games.filter(g=>!g.result).length>0&&<>
            <div style={S.gameListSection}>UPCOMING</div>
            {games.filter(g=>!g.result).map(g=>(
              <div key={g.id} style={S.gameCard} onClick={()=>openGame(g.id)}>
                <div style={S.gameCardLeft}>
                  <div style={{...S.gameCardResult,background:"#1a1a1a",color:"#444"}}>—</div>
                  <div><div style={S.gameCardOpp}>{g.opponent||"TBD"}</div><div style={S.gameCardMeta}>{formatDate(g.date)}{g.time?` · ${g.time}`:""}{g.location?` · ${g.location}`:""}</div></div>
                </div>
                <div style={S.gameCardArrow}>›</div>
              </div>
            ))}
          </>}
          {games.filter(g=>g.result).length>0&&<>
            <div style={S.gameListSection}>COMPLETED</div>
            {[...games].filter(g=>g.result).reverse().map(g=>(
              <div key={g.id} style={S.gameCard} onClick={()=>openGame(g.id)}>
                <div style={S.gameCardLeft}>
                  <div style={{...S.gameCardResult,background:resultBg(g.result),color:resultColor(g.result)}}>
                    <div style={S.gameCardResultCode}>{g.result}</div>
                    {g.runsFor&&g.runsAgainst&&<div style={S.gameCardScore}>{g.runsFor}–{g.runsAgainst}</div>}
                  </div>
                  <div><div style={S.gameCardOpp}>{g.opponent||"TBD"}</div><div style={S.gameCardMeta}>{formatDate(g.date)}{g.time?` · ${g.time}`:""}{g.location?` · ${g.location}`:""}</div></div>
                </div>
                <div style={S.gameCardArrow}>›</div>
              </div>
            ))}
          </>}
        </div>
      )}

      {/* ── SEASON ── */}
      {tab==="season"&&(
        <div>
          <div style={S.seasonSubNav}>
            {[["calendar","📅 Calendar"],["list","📋 Schedule"],["record","🏆 Record"]].map(([id,label])=>(
              <button key={id} style={{...S.seasonSubBtn,...(seasonTab===id?S.seasonSubActive:{})}} onClick={()=>setSeasonTab(id)}>{label}</button>
            ))}
          </div>
          {seasonTab==="calendar"&&(
            <div>
              <div style={S.monthNav}>
                <button style={S.monthArrow} onClick={()=>setCalMonth(p=>{const d=new Date(p.year,p.month-1);return{year:d.getFullYear(),month:d.getMonth()};})}>‹</button>
                <div style={S.monthLabel}>{MONTHS[month]} {year}</div>
                <button style={S.monthArrow} onClick={()=>setCalMonth(p=>{const d=new Date(p.year,p.month+1);return{year:d.getFullYear(),month:d.getMonth()};})}>›</button>
              </div>
              <div style={S.recordStrip}>
                <span style={{...S.recNum,color:"#4CAF50"}}>{totalW}</span><span style={S.recLbl}>W</span>
                <span style={S.recDash}>—</span>
                <span style={{...S.recNum,color:"#e53935"}}>{totalL}</span><span style={S.recLbl}>L</span>
                {totalT>0&&<><span style={S.recDash}>—</span><span style={{...S.recNum,color:"#fb8c00"}}>{totalT}</span><span style={S.recLbl}>T</span></>}
              </div>
              <div style={S.calDayHeaders}>{DAYS.map(d=><div key={d} style={S.calDayHdr}>{d}</div>)}</div>
              <div style={S.calGrid}>
                {calCells.map((d,i)=>{
                  const dg=d?gamesOnDay(d):[]; const ev=d?eventsOnDay(d):[];
                  return (
                    <div key={i} style={{...S.calCell,...(d?S.calCellActive:{}),...(isToday(d)?S.calCellToday:{})}}
                      onClick={()=>{ if(!d) return; requireCoach(()=>{const ev=newCalEvent(dateStr(d));setEditingCalEvent(ev);setCalEventModal({mode:"add"});}); }}>
                      {d&&<>
                        <div style={{...S.calCellNum,...(isToday(d)?S.calCellNumToday:{})}}>{d}</div>
                        <div style={S.calDots}>
                          {dg.map((g,gi)=><div key={gi} style={{...S.calDot,background:g.result?resultColor(g.result):"#666"}} onClick={e=>{e.stopPropagation();openGame(g.id);}}/>)}
                          {ev.map((e,ei)=><div key={ei} style={{...S.calDot,background:"#1e88e5"}} onClick={ex=>{ex.stopPropagation();setEditingCalEvent({...e});setCalEventModal({mode:"edit"});}}/>)}
                        </div>
                      </>}
                    </div>
                  );
                })}
              </div>
              <div style={{padding:"8px 12px 0"}}>
                {[...games.filter(g=>g.date&&g.date.startsWith(`${year}-${String(month+1).padStart(2,"0")}`)),
                  ...calEvents.filter(e=>e.date&&e.date.startsWith(`${year}-${String(month+1).padStart(2,"0")}`))]
                  .sort((a,b)=>(a.date||"").localeCompare(b.date||"")).map((item,idx)=>{
                    const isGame=games.some(g=>g.id===item.id);
                    return (
                      <div key={idx} style={S.calListRow} onClick={()=>isGame?openGame(item.id):(setEditingCalEvent({...item}),setCalEventModal({mode:"edit"}))}>
                        <div style={S.calListDate}>{formatDate(item.date)}{item.time?` · ${item.time}`:""}</div>
                        <div style={S.calListOpp}>{item.opponent||"TBD"}</div>
                        <div style={{...S.calListResult,background:isGame?resultBg(item.result):"rgba(30,136,229,0.15)",color:isGame?resultColor(item.result):"#1e88e5"}}>
                          {isGame?(item.result||"—"):"EVT"}
                        </div>
                      </div>
                    );
                  })}
                {[...games,...calEvents].filter(i=>i.date&&i.date.startsWith(`${year}-${String(month+1).padStart(2,"0")}`)).length===0&&
                  <div style={S.noItems}>No games this month</div>}
              </div>
            </div>
          )}
          {seasonTab==="list"&&(
            <div style={{padding:"12px 0"}}>
              <div style={S.listHeader}>
                <div style={S.listTitle}>Full Schedule</div>
                {isCoach&&<button style={S.addCalBtn} onClick={()=>{const ev=newCalEvent();setEditingCalEvent(ev);setCalEventModal({mode:"add"});}}>+ Add Event</button>}
              </div>
              {[...games,...calEvents].sort((a,b)=>(a.date||"").localeCompare(b.date||"")).length===0&&<div style={S.noItems}>No games scheduled</div>}
              {["Upcoming","Completed"].map(section=>{
                const items=[...games,...calEvents].filter(i=>section==="Upcoming"?!i.result:!!i.result).sort((a,b)=>(a.date||"").localeCompare(b.date||""));
                if(!items.length) return null;
                return (
                  <div key={section}>
                    <div style={S.listSection}>{section}</div>
                    {items.map(item=>{
                      const isGame=games.some(g=>g.id===item.id);
                      return (
                        <div key={item.id} style={S.listRow} onClick={()=>isGame?openGame(item.id):(setEditingCalEvent({...item}),setCalEventModal({mode:"edit"}))}>
                          <div style={{...S.listResult,background:isGame?resultBg(item.result):"rgba(30,136,229,0.15)",color:isGame?resultColor(item.result):"#1e88e5"}}>{isGame?(item.result||"—"):"EVT"}</div>
                          <div><div style={S.listOpp}>{item.opponent||"TBD"}</div><div style={S.listMeta}>{formatDate(item.date)}{item.time?` · ${item.time}`:""}{item.location?` · ${item.location}`:""}</div></div>
                          {item.runsFor&&item.runsAgainst&&<div style={S.listScore}>{item.runsFor}–{item.runsAgainst}</div>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
          {seasonTab==="record"&&(
            <div style={{padding:"12px"}}>
              <div style={S.overallCard}>
                <div style={S.overallTitle}>SEASON RECORD</div>
                <div style={S.overallScore}>
                  <div style={S.overallBox}><div style={{...S.overallNum,color:"#4CAF50"}}>{totalW}</div><div style={S.overallLbl}>WINS</div></div>
                  <div style={S.overallDash}>—</div>
                  <div style={S.overallBox}><div style={{...S.overallNum,color:"#e53935"}}>{totalL}</div><div style={S.overallLbl}>LOSSES</div></div>
                  {totalT>0&&<><div style={S.overallDash}>—</div><div style={S.overallBox}><div style={{...S.overallNum,color:"#fb8c00"}}>{totalT}</div><div style={S.overallLbl}>TIES</div></div></>}
                </div>
                {(totalW+totalL+totalT)>0&&<div style={S.winPct}>Win %: {Math.round(totalW/(totalW+totalL+totalT)*100)}%</div>}
                {(totalW+totalL)>0&&<div style={S.barOuter}><div style={{...S.barInner,width:`${Math.round(totalW/(totalW+totalL)*100)}%`}}/></div>}
              </div>
              <div style={S.oppHeader}>VS. OPPONENTS</div>
              {(()=>{
                const rec={};
                completedGames.forEach(g=>{ if(!g.opponent||!g.result) return; if(!rec[g.opponent]) rec[g.opponent]={W:0,L:0,T:0,games:[]}; rec[g.opponent][g.result]++; rec[g.opponent].games.push(g); });
                return Object.keys(rec).length===0?<div style={S.noItems}>No completed games yet</div>
                  :Object.entries(rec).sort((a,b)=>(b[1].W-b[1].L)-(a[1].W-a[1].L)).map(([opp,r])=>(
                    <div key={opp} style={S.oppCard}>
                      <div style={S.oppName}>{opp}</div>
                      <div style={S.oppRec}><span style={{...S.oppRecNum,color:"#4CAF50"}}>{r.W}W</span><span style={S.oppRecSep}>·</span><span style={{...S.oppRecNum,color:"#e53935"}}>{r.L}L</span>{r.T>0&&<><span style={S.oppRecSep}>·</span><span style={{...S.oppRecNum,color:"#fb8c00"}}>{r.T}T</span></>}</div>
                      <div style={S.oppDots}>{r.games.map((g,i)=><div key={i} style={{...S.oppDot,background:resultColor(g.result)}}/>)}</div>
                      <div style={{...S.oppPct,color:(r.W/(r.W+r.L+r.T))>=0.5?"#4CAF50":"#e53935"}}>{Math.round(r.W/(r.W+r.L+r.T)*100)}%</div>
                    </div>
                  ));
              })()}
              {completedGames.filter(g=>g.runsFor&&g.runsAgainst).length>0&&(()=>{
                const played=completedGames.filter(g=>g.runsFor&&g.runsAgainst);
                const rf=played.reduce((s,g)=>s+parseInt(g.runsFor||0),0);
                const ra=played.reduce((s,g)=>s+parseInt(g.runsAgainst||0),0);
                return <>
                  <div style={S.oppHeader}>RUN TOTALS</div>
                  <div style={S.runTotals}>
                    {[["Runs Scored",rf,"#4CAF50"],["Runs Allowed",ra,"#e53935"],["Differential",rf>=ra?`+${rf-ra}`:rf-ra,rf>=ra?"#4CAF50":"#e53935"]].map(([lbl,val,clr])=>(
                      <div key={lbl} style={S.runBox}><div style={{...S.runNum,color:clr}}>{val}</div><div style={S.runLbl}>{lbl}</div></div>
                    ))}
                  </div>
                </>;
              })()}
            </div>
          )}
        </div>
      )}

      {/* ── ROSTER ── */}
      {tab==="roster"&&(
        <div style={S.content}>
          <div style={S.sectionLabel}>👥 Team Roster</div>
          {players.map((player,idx)=>(
            <div key={idx} style={S.rosterRow}>
              <div style={S.rosterNum}>#{idx+1}</div>
              {editingPlayer===idx
                ? <input style={S.rosterInput} value={editName} onChange={e=>setEditName(e.target.value)}
                    onBlur={()=>renamePlayer(idx,editName)} onKeyDown={e=>e.key==="Enter"&&renamePlayer(idx,editName)} autoFocus/>
                : <div style={S.rosterName}>{player}</div>}
              {isCoach&&<button style={S.rosterEdit} onClick={()=>{setEditingPlayer(idx);setEditName(player);}}>✏️</button>}
            </div>
          ))}
          {isCoach&&<div style={S.rosterHint}>Tap ✏️ to rename a player</div>}
          {!isCoach&&<div style={S.rosterHint}>Log in as coach to edit roster</div>}
          <div style={S.sectionLabel}>📊 Games Played</div>
          {players.map(player=>{
            const gamesPlayed=games.filter(g=>g.lineup&&g.lineup.some(inn=>Object.values(inn).includes(player))).length;
            return (
              <div key={player} style={S.statRow}>
                <div style={S.statName}>{player}</div>
                <div style={S.statGames}>{gamesPlayed}G</div>
                <div style={S.statDots}>
                  {games.slice(-6).map((g,i)=>{
                    const played=g.lineup&&g.lineup.some(inn=>Object.values(inn).includes(player));
                    return <div key={i} style={{...S.statDot,background:played?"#e53935":"#1e1e1e"}}/>;
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New game modal */}
      {newGameModal&&(
        <div style={S.overlay} onClick={()=>setNewGameModal(false)}>
          <div style={S.modal} onClick={e=>e.stopPropagation()}>
            <div style={S.modalTitle}>New Game</div>
            <div style={{overflowY:"auto",flex:1,padding:"12px 20px"}}>
              <FormFields form={newGameForm} onChange={setNewGameForm} showResult={false}/>
            </div>
            <div style={{padding:"8px 20px 0"}}>
              <button style={S.saveBtn} onClick={createNewGame}>Create Game</button>
            </div>
            <button style={S.modalClose} onClick={()=>setNewGameModal(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Calendar event modal */}
      {calEventModal&&editingCalEvent&&(
        <div style={S.overlay} onClick={()=>{setCalEventModal(null);setEditingCalEvent(null);}}>
          <div style={S.modal} onClick={e=>e.stopPropagation()}>
            <div style={S.modalTitle}>{calEventModal.mode==="add"?"Add Event":"Edit Event"}</div>
            <div style={{overflowY:"auto",flex:1,padding:"12px 20px"}}>
              <div style={S.formField}><div style={S.formLabel}>Opponent / Event</div>
                <input style={S.formInput} placeholder="Team or event name" value={editingCalEvent.opponent||""} onChange={e=>setEditingCalEvent(v=>({...v,opponent:e.target.value}))}/></div>
              <div style={{display:"flex",gap:8}}>
                <div style={{...S.formField,flex:2}}><div style={S.formLabel}>Date</div>
                  <input style={S.formInput} type="date" value={editingCalEvent.date||""} onChange={e=>setEditingCalEvent(v=>({...v,date:e.target.value}))}/></div>
                <div style={{...S.formField,flex:1}}><div style={S.formLabel}>Time</div>
                  <input style={S.formInput} type="time" value={editingCalEvent.time||""} onChange={e=>setEditingCalEvent(v=>({...v,time:e.target.value}))}/></div>
              </div>
              <div style={S.formField}><div style={S.formLabel}>Location</div>
                <div style={S.toggleRow}>
                  {["Home","Away","Neutral"].map(loc=>(
                    <button key={loc} style={{...S.toggle,...(editingCalEvent.location===loc?S.toggleActive:{})}} onClick={()=>setEditingCalEvent(v=>({...v,location:loc}))}>{loc}</button>
                  ))}
                </div>
              </div>
              <div style={S.formField}><div style={S.formLabel}>Notes</div>
                <textarea style={{...S.formInput,height:64,resize:"none"}} value={editingCalEvent.notes||""} onChange={e=>setEditingCalEvent(v=>({...v,notes:e.target.value}))}/></div>
            </div>
            <div style={{padding:"8px 20px 0",display:"flex",gap:8}}>
              <button style={S.saveBtn} onClick={saveCalEvent}>Save</button>
              {calEventModal.mode==="edit"&&<button style={S.deleteBtn} onClick={()=>deleteCalEvent(editingCalEvent.id)}>Delete</button>}
            </div>
            <button style={S.modalClose} onClick={()=>{setCalEventModal(null);setEditingCalEvent(null);}}>Cancel</button>
          </div>
        </div>
      )}

      {/* Password modal */}
      {showPasswordModal&&<PasswordModal onClose={()=>{setShowPasswordModal(false);setPasswordInput("");setPasswordError(false);}} passwordInput={passwordInput} setPasswordInput={setPasswordInput} passwordError={passwordError} onSubmit={tryPassword}/>}

      {toast&&<div style={S.toast}>{toast}</div>}
    </div>
  );
}

// ── Password Modal Component ───────────────────────────────────────────
function PasswordModal({onClose, passwordInput, setPasswordInput, passwordError, onSubmit}) {
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e=>e.stopPropagation()}>
        <div style={S.modalTitle}>🔒 Coach Login</div>
        <div style={{padding:"16px 20px"}}>
          <div style={S.formLabel}>Enter coach password</div>
          <input style={{...S.formInput,marginTop:6,borderColor:passwordError?"#e53935":"#333"}}
            type="password" placeholder="Password" value={passwordInput}
            onChange={e=>setPasswordInput(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&onSubmit()} autoFocus/>
          {passwordError&&<div style={{color:"#e53935",fontSize:12,marginTop:6}}>Incorrect password — try again</div>}
          <div style={{fontSize:11,color:"#555",marginTop:8}}>Coaches can edit lineups, scores, and roster. Viewers can see everything without logging in.</div>
        </div>
        <div style={{padding:"0 20px"}}>
          <button style={S.saveBtn} onClick={onSubmit}>Login</button>
        </div>
        <button style={S.modalClose} onClick={onClose}>Cancel — stay in view mode</button>
      </div>
    </div>
  );
}

// ── SCOREBOOK STYLES ──────────────────────────────────────────────────
const sb = {
  page:{background:"#faf6ee",minHeight:"60vh",paddingBottom:40},
  scoreboard:{margin:"12px 12px 0",background:"#fff",border:"2px solid #8b1a1a",borderRadius:8,boxShadow:"0 2px 12px rgba(0,0,0,0.15)",overflow:"hidden"},
  sbRow:{display:"flex",borderBottom:"1px solid #e0d5c0",fontFamily:"'Georgia',serif"},
  sbTeamCell:{width:80,flexShrink:0,fontSize:9,fontWeight:"bold",color:"#5a2a0a",padding:"4px 6px",background:"#fdf8f0",borderRight:"1px solid #e0d5c0",display:"flex",alignItems:"center"},
  sbInnCell:{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"2px 0",borderRight:"1px solid #e8dfc8",minWidth:0},
  sbInnNum:{fontSize:8,color:"#8b1a1a",fontWeight:"bold"},
  sbRunCtrl:{display:"flex",flexDirection:"column",alignItems:"center"},
  runBtn:{background:"none",border:"none",color:"#8b1a1a",fontSize:13,lineHeight:1,cursor:"pointer",padding:"0 4px",fontFamily:"'Georgia',serif",fontWeight:"bold"},
  runNum:{fontSize:14,fontWeight:"bold",color:"#2a1a08",fontFamily:"'Georgia',serif"},
  totalCell:{background:"#fdf0e8",minWidth:30,flexShrink:0},
  totalLbl:{fontSize:8,color:"#8b1a1a",fontWeight:"bold",letterSpacing:1},
  totalNum:{fontSize:18,fontWeight:"bold",color:"#8b1a1a",fontFamily:"'Georgia',serif"},
  bigScore:{display:"flex",alignItems:"center",justifyContent:"center",gap:16,padding:"10px 0",background:"#faf6ee"},
  bigTeam:{textAlign:"center"},
  bigNum:{fontSize:36,fontWeight:"bold",color:"#8b1a1a",fontFamily:"'Georgia',serif",lineHeight:1},
  bigLabel:{fontSize:10,color:"#8a6a4a",letterSpacing:1,marginTop:2},
  bigDash:{fontSize:24,color:"#c8a060",fontFamily:"'Georgia',serif"},
  sectionHead:{fontFamily:"'Georgia',serif",fontSize:10,letterSpacing:3,textTransform:"uppercase",color:"#8b1a1a",padding:"14px 12px 6px",borderBottom:"1px solid #e0d5c0",background:"#faf6ee"},
  scoreTable:{width:"100%",borderCollapse:"collapse",fontFamily:"'Georgia',serif",background:"#fff",fontSize:10},
  thName:{background:"#8b1a1a",color:"#f5e6c8",padding:"6px 8px",fontSize:9,letterSpacing:1,fontWeight:"bold",textAlign:"left",position:"sticky",left:0,zIndex:2,minWidth:65,borderRight:"1px solid #6a1010"},
  thInn:{background:"#8b1a1a",color:"#f5e6c8",padding:"6px 4px",fontSize:9,textAlign:"center",minWidth:46,borderRight:"1px solid #6a1010"},
  trEven:{background:"#fff"},trOdd:{background:"#fdf8f0"},
  tdName:{padding:"4px 8px",borderRight:"2px solid #c8b89a",borderBottom:"1px solid #e8dfc8",position:"sticky",left:0,background:"inherit",zIndex:1,minWidth:65},
  batNum:{fontSize:8,color:"#8a6a4a"},
  batName:{fontSize:11,fontWeight:"bold",color:"#2a1a08",whiteSpace:"nowrap"},
  tdCell:{padding:"3px",borderRight:"1px solid #e8dfc8",borderBottom:"1px solid #e8dfc8",cursor:"pointer",textAlign:"center",verticalAlign:"middle"},
  cellInner:{display:"flex",flexDirection:"column",alignItems:"center",position:"relative"},
  runDot:{position:"absolute",top:-2,right:-2,background:"#e53935",color:"#fff",borderRadius:"50%",width:12,height:12,fontSize:7,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:"bold"},
  gridHint:{fontSize:10,color:"#8a6a4a",padding:"6px 12px",fontStyle:"italic",background:"#faf6ee"},
  outcomeGrid:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,padding:"12px 14px",overflowY:"auto",maxHeight:"50vh"},
  outcomeBtn:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"8px 4px",borderRadius:8,cursor:"pointer",fontFamily:"'Georgia',serif",gap:2,minHeight:54},
  outCode:{fontSize:14,fontWeight:"bold",lineHeight:1},
  outLabel:{fontSize:8,opacity:0.85,textAlign:"center",lineHeight:1.2},
  pitchPanel:{margin:"0 12px 20px",background:"#fff",border:"2px solid #8b1a1a",borderRadius:8,overflow:"hidden"},
  pitchInnRow:{display:"flex",background:"#fdf8f0",borderBottom:"1px solid #e0d5c0",padding:"6px 8px",gap:4},
  pitchInnBtn:{flex:1,padding:"5px 2px",background:"none",border:"1px solid #e0d5c0",borderRadius:6,fontSize:10,color:"#8a6a4a",cursor:"pointer",fontFamily:"'Georgia',serif"},
  pitchInnActive:{background:"#8b1a1a",color:"#f5e6c8",border:"1px solid #8b1a1a"},
  liveCount:{display:"flex",borderBottom:"1px solid #e0d5c0"},
  liveBox:{flex:1,textAlign:"center",padding:"10px 4px",borderRight:"1px solid #e8dfc8"},
  liveNum:{fontSize:22,fontWeight:"bold",lineHeight:1,fontFamily:"'Georgia',serif"},
  liveLbl:{fontSize:7,color:"#8a6a4a",letterSpacing:1,marginTop:2,textTransform:"uppercase"},
  pitchBtns:{display:"flex",borderBottom:"1px solid #e0d5c0"},
  pitchBtn:{flex:1,padding:"14px 4px",border:"none",cursor:"pointer",fontSize:13,fontFamily:"'Georgia',serif",fontWeight:"bold",display:"flex",flexDirection:"column",alignItems:"center",gap:3,borderRight:"1px solid #e8dfc8"},
  pitchIcon:{fontSize:18},
  pitchActions:{display:"flex",borderBottom:"1px solid #e0d5c0"},
  undoBtn:{flex:1,padding:"10px",background:"#fdf8f0",border:"none",borderRight:"1px solid #e0d5c0",color:"#5a4a30",fontSize:12,cursor:"pointer",fontFamily:"'Georgia',serif"},
  resetBtn:{flex:1,padding:"10px",background:"#fdf8f0",border:"none",color:"#8b1a1a",fontSize:12,cursor:"pointer",fontFamily:"'Georgia',serif"},
  tallySection:{padding:"8px 14px",borderBottom:"1px solid #e0d5c0",background:"#faf6ee"},
  tallyRow:{display:"flex",alignItems:"center",gap:8,padding:"4px 0",borderBottom:"1px solid #ede5d0"},
  tallyLbl:{width:50,fontSize:10,color:"#5a4a30",fontWeight:"bold",fontFamily:"'Georgia',serif",flexShrink:0},
  tallyMarks:{flex:1,display:"flex",flexWrap:"wrap",alignItems:"center"},
  tallyNone:{fontSize:11,color:"#c8b89a",fontStyle:"italic"},
  pitchSummTitle:{fontSize:9,letterSpacing:2,color:"#8a6a4a",textTransform:"uppercase",padding:"8px 14px 4px",background:"#fdf8f0"},
  pitchSummGrid:{display:"flex",padding:"4px 8px 12px",gap:4},
  pitchSummCell:{flex:1,background:"#faf6ee",border:"1px solid #e0d5c0",borderRadius:6,padding:"6px 4px",textAlign:"center",cursor:"pointer"},
  pitchSummActive:{background:"#fff0ec",border:"1px solid #8b1a1a"},
  pitchSummInn:{fontSize:8,color:"#8a6a4a"},
  pitchSummTotal:{fontSize:18,fontWeight:"bold",color:"#2a1a08",fontFamily:"'Georgia',serif",lineHeight:1.2},
  pitchSummBreak:{fontSize:8,color:"#8a6a4a",marginTop:1},
};

// ── APP STYLES ────────────────────────────────────────────────────────
const S = {
  root:{background:"#0f0f0f",minHeight:"100vh",maxWidth:430,margin:"0 auto",fontFamily:"'Georgia',serif",color:"#f0f0f0",position:"relative",paddingBottom:32},
  header:{background:"linear-gradient(135deg,#b71c1c 0%,#7f0000 100%)",padding:"14px 16px",display:"flex",alignItems:"center",gap:12,boxShadow:"0 4px 20px rgba(183,28,28,0.5)"},
  headerLogo:{width:64,height:64,objectFit:"contain",flexShrink:0,filter:"drop-shadow(0 2px 8px rgba(0,0,0,0.6))"},
  headerTitle:{fontSize:24,fontWeight:"bold",letterSpacing:1,color:"#fff"},
  headerSub:{fontSize:11,color:"rgba(255,255,255,0.55)",letterSpacing:2,textTransform:"uppercase"},
  headerRecord:{fontSize:15,fontWeight:"bold",color:"rgba(255,255,255,0.9)",letterSpacing:1,marginTop:2},
  // Sync bar
  syncBar:{display:"flex",alignItems:"center",gap:8,padding:"6px 14px",background:"#111",borderBottom:"1px solid #1e1e1e"},
  syncDot:{width:7,height:7,borderRadius:"50%",flexShrink:0},
  syncText:{fontSize:10,color:"#555"},
  syncSpacer:{flex:1},
  coachBadge:{background:"rgba(76,175,80,0.15)",border:"1px solid rgba(76,175,80,0.3)",borderRadius:12,color:"#4CAF50",padding:"3px 10px",fontSize:11,cursor:"pointer",fontFamily:"'Georgia',serif"},
  viewBadge:{background:"rgba(229,57,53,0.1)",border:"1px solid rgba(229,57,53,0.2)",borderRadius:12,color:"#888",padding:"3px 10px",fontSize:11,cursor:"pointer",fontFamily:"'Georgia',serif"},
  // Main nav
  mainNav:{display:"flex",background:"#1a1a1a",borderBottom:"1px solid #222"},
  mainNavBtn:{flex:1,padding:"13px 4px",background:"none",border:"none",color:"#555",fontSize:12,cursor:"pointer",fontFamily:"'Georgia',serif"},
  mainNavBtnActive:{color:"#e53935",borderBottom:"2px solid #e53935",background:"rgba(229,57,53,0.06)"},
  content:{padding:"0 0 20px"},
  // Game header
  gameHeader:{background:"linear-gradient(135deg,#1a0808 0%,#0f0f0f 100%)",padding:"14px 16px",display:"flex",alignItems:"center",gap:10,borderBottom:"1px solid #1e1e1e"},
  backBtn:{background:"none",border:"none",color:"#e53935",fontSize:15,cursor:"pointer",fontFamily:"'Georgia',serif",fontWeight:"bold",padding:"4px 8px 4px 0",flexShrink:0},
  gameHeaderCenter:{flex:1,minWidth:0},
  gameHeaderOpp:{fontSize:16,fontWeight:"bold",color:"#fff",fontFamily:"'Georgia',serif",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"},
  gameHeaderMeta:{fontSize:11,color:"#555",marginTop:2},
  resultBadge:{borderRadius:8,padding:"5px 10px",fontSize:13,fontWeight:"bold",fontFamily:"'Georgia',serif",flexShrink:0},
  gameSubNav:{display:"flex",background:"#161616",borderBottom:"1px solid #1e1e1e"},
  gameSubBtn:{flex:1,padding:"11px 4px",background:"none",border:"none",color:"#555",fontSize:11,cursor:"pointer",fontFamily:"'Georgia',serif"},
  gameSubBtnActive:{color:"#e53935",borderBottom:"2px solid #e53935",background:"rgba(229,57,53,0.06)"},
  gameEditBtn:{padding:"11px 12px",background:"none",border:"none",color:"#555",fontSize:11,cursor:"pointer",borderLeft:"1px solid #1e1e1e"},
  // Score bar
  scoreBar:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 20px",background:"#161616",borderBottom:"1px solid #1a1a1a"},
  scoreBarTeam:{fontSize:12,color:"#777",fontFamily:"'Georgia',serif"},
  scoreBarScore:{fontSize:22,fontWeight:"bold",color:"#fff",fontFamily:"'Georgia',serif"},
  // Inning tabs
  inningTabs:{display:"flex",overflowX:"auto",gap:8,padding:"14px 16px 8px",scrollbarWidth:"none"},
  inningTab:{flexShrink:0,width:50,height:56,background:"#1e1e1e",border:"1px solid #2a2a2a",borderRadius:10,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"#777"},
  inningTabActive:{background:"linear-gradient(135deg,#b71c1c,#e53935)",border:"1px solid #e53935",color:"#fff",boxShadow:"0 4px 12px rgba(229,57,53,0.35)"},
  innTabNum:{fontSize:8,letterSpacing:1,opacity:0.7},
  innTabBig:{fontSize:20,fontWeight:"bold",lineHeight:1},
  copyBar:{display:"flex",alignItems:"center",gap:8,padding:"4px 16px 8px",overflowX:"auto",scrollbarWidth:"none"},
  copyBarLabel:{fontSize:11,color:"#555",flexShrink:0},
  copyBtn:{flexShrink:0,padding:"4px 10px",background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:6,color:"#777",fontSize:11,cursor:"pointer"},
  sectionLabel:{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:"#444",padding:"14px 16px 8px",borderTop:"1px solid #1a1a1a"},
  posGrid:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,padding:"0 16px"},
  posCard:{background:"#161616",borderRadius:12,padding:"12px",border:"1px solid #222",cursor:"pointer",position:"relative",display:"flex",flexDirection:"column",gap:6,minHeight:66},
  posBadge:{display:"inline-flex",alignItems:"center",justifyContent:"center",borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:"bold",color:"#fff",alignSelf:"flex-start"},
  posPlayer:{fontSize:13,fontWeight:"bold",color:"#eee"},
  posEmpty:{fontSize:11,color:"#383838",fontStyle:"italic",fontWeight:"normal"},
  posRemove:{position:"absolute",top:8,right:8,background:"rgba(229,57,53,0.2)",border:"none",borderRadius:6,color:"#e53935",width:22,height:22,fontSize:10,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"},
  benchArea:{padding:"0 16px",display:"flex",flexWrap:"wrap",gap:8},
  benchChip:{display:"flex",alignItems:"center",gap:6,background:"#161616",border:"1px solid #222",borderRadius:20,padding:"6px 14px",fontSize:13,cursor:"pointer",color:"#bbb"},
  benchDot:{width:7,height:7,borderRadius:"50%",background:"#333"},
  benchLabel:{fontSize:10,color:"#444"},
  benchEmpty:{fontSize:13,color:"#4CAF50",padding:"8px 0"},
  summaryTable:{borderCollapse:"collapse",fontSize:11,fontFamily:"'Georgia',serif"},
  sumTh:{background:"#1a1a1a",color:"#555",padding:"5px 8px",fontSize:9,letterSpacing:1,textTransform:"uppercase",textAlign:"center",border:"1px solid #222",fontWeight:"bold"},
  sumTdName:{padding:"5px 8px",color:"#bbb",fontSize:11,border:"1px solid #1a1a1a",whiteSpace:"nowrap",background:"#111"},
  sumTd:{padding:"4px 6px",textAlign:"center",fontSize:10,fontWeight:"bold",border:"1px solid #111",minWidth:30},
  fieldWrapper:{padding:"10px 12px 0",background:"linear-gradient(180deg,#091506 0%,#0f0f0f 100%)"},
  fieldSvg:{width:"100%",display:"block",borderRadius:16,border:"1px solid #1e3014",boxShadow:"0 8px 32px rgba(0,0,0,0.6)"},
  fieldLegend:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:5,padding:"10px 12px 0"},
  legendRow:{display:"flex",alignItems:"center",gap:5,background:"#161616",borderRadius:8,padding:"5px 7px",cursor:"pointer",border:"1px solid #1e1e1e"},
  legendBadge:{display:"inline-flex",alignItems:"center",justifyContent:"center",width:24,height:16,borderRadius:4,fontSize:8,fontWeight:"bold",color:"#fff",flexShrink:0},
  legendName:{fontSize:10,color:"#bbb",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1},
  legendEmpty:{color:"#2a2a2a"},
  legendRemove:{background:"none",border:"none",color:"#444",fontSize:8,cursor:"pointer",padding:0,flexShrink:0},
  // Games list
  gamesTopBar:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 16px 8px"},
  gamesTitle:{fontSize:18,fontWeight:"bold",color:"#f0f0f0",fontFamily:"'Georgia',serif"},
  newGameBtn:{background:"#b71c1c",border:"none",borderRadius:20,color:"#fff",padding:"8px 18px",fontSize:12,fontWeight:"bold",cursor:"pointer",fontFamily:"'Georgia',serif"},
  emptyState:{textAlign:"center",padding:"60px 20px 40px"},
  emptyIcon:{fontSize:44,marginBottom:12},
  emptyText:{fontSize:18,fontWeight:"bold",color:"#444",fontFamily:"'Georgia',serif"},
  emptySubtext:{fontSize:13,color:"#333",marginTop:6,marginBottom:24},
  emptyBtn:{background:"#b71c1c",border:"none",borderRadius:20,color:"#fff",padding:"12px 28px",fontSize:14,cursor:"pointer",fontFamily:"'Georgia',serif"},
  gameListSection:{fontSize:10,letterSpacing:2,color:"#444",textTransform:"uppercase",padding:"12px 16px 6px",borderTop:"1px solid #1a1a1a"},
  gameCard:{display:"flex",alignItems:"center",padding:"12px 16px",borderBottom:"1px solid #1a1a1a",cursor:"pointer"},
  gameCardLeft:{display:"flex",alignItems:"center",gap:12,flex:1},
  gameCardResult:{width:46,height:46,borderRadius:10,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0},
  gameCardResultCode:{fontSize:16,fontWeight:"bold",fontFamily:"'Georgia',serif",lineHeight:1},
  gameCardScore:{fontSize:9,marginTop:1},
  gameCardOpp:{fontSize:15,fontWeight:"bold",color:"#eee",fontFamily:"'Georgia',serif"},
  gameCardMeta:{fontSize:11,color:"#444",marginTop:2},
  gameCardArrow:{fontSize:20,color:"#333"},
  // Season
  seasonSubNav:{display:"flex",background:"#161616",borderBottom:"1px solid #1e1e1e"},
  seasonSubBtn:{flex:1,padding:"11px 4px",background:"none",border:"none",color:"#555",fontSize:11,cursor:"pointer",fontFamily:"'Georgia',serif"},
  seasonSubActive:{color:"#e53935",borderBottom:"2px solid #e53935",background:"rgba(229,57,53,0.06)"},
  monthNav:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px 8px"},
  monthArrow:{background:"none",border:"none",color:"#888",fontSize:28,cursor:"pointer",padding:"0 8px",lineHeight:1},
  monthLabel:{fontSize:18,fontWeight:"bold",color:"#f0f0f0",fontFamily:"'Georgia',serif"},
  recordStrip:{display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"0 0 10px"},
  recNum:{fontSize:20,fontWeight:"bold",fontFamily:"'Georgia',serif"},
  recLbl:{fontSize:11,color:"#444"},
  recDash:{fontSize:14,color:"#222"},
  calDayHeaders:{display:"grid",gridTemplateColumns:"repeat(7,1fr)",padding:"0 8px",borderBottom:"1px solid #1a1a1a"},
  calDayHdr:{textAlign:"center",fontSize:10,color:"#444",padding:"4px 0"},
  calGrid:{display:"grid",gridTemplateColumns:"repeat(7,1fr)",padding:"4px 8px",gap:2},
  calCell:{minHeight:46,borderRadius:8,padding:"4px 3px"},
  calCellActive:{cursor:"pointer",background:"#161616"},
  calCellToday:{background:"#1a0808",border:"1px solid #b71c1c"},
  calCellNum:{fontSize:12,color:"#555",textAlign:"center",lineHeight:1.4},
  calCellNumToday:{color:"#e53935",fontWeight:"bold"},
  calDots:{display:"flex",flexWrap:"wrap",gap:2,justifyContent:"center",marginTop:3},
  calDot:{width:7,height:7,borderRadius:"50%",cursor:"pointer"},
  calListRow:{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:"1px solid #1a1a1a",cursor:"pointer"},
  calListDate:{fontSize:10,color:"#444",width:70,flexShrink:0},
  calListOpp:{flex:1,fontSize:13,color:"#ccc",fontFamily:"'Georgia',serif"},
  calListResult:{fontSize:11,fontWeight:"bold",borderRadius:6,padding:"3px 8px",fontFamily:"'Georgia',serif"},
  noItems:{textAlign:"center",color:"#333",fontSize:13,padding:"24px 16px",fontStyle:"italic"},
  listHeader:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 16px 12px"},
  listTitle:{fontSize:16,fontWeight:"bold",color:"#f0f0f0",fontFamily:"'Georgia',serif"},
  addCalBtn:{background:"#b71c1c",border:"none",borderRadius:20,color:"#fff",padding:"7px 16px",fontSize:12,cursor:"pointer",fontFamily:"'Georgia',serif"},
  listSection:{fontSize:10,letterSpacing:2,color:"#444",textTransform:"uppercase",padding:"8px 16px 4px",borderTop:"1px solid #1a1a1a"},
  listRow:{display:"flex",alignItems:"center",gap:12,padding:"11px 16px",borderBottom:"1px solid #1a1a1a",cursor:"pointer"},
  listResult:{width:32,height:32,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:"bold",fontFamily:"'Georgia',serif",flexShrink:0},
  listOpp:{fontSize:14,fontWeight:"bold",color:"#eee",fontFamily:"'Georgia',serif"},
  listMeta:{fontSize:11,color:"#444",marginTop:2},
  listScore:{fontSize:14,fontWeight:"bold",color:"#777",fontFamily:"'Georgia',serif",marginLeft:"auto"},
  overallCard:{background:"#161616",border:"1px solid #1e1e1e",borderRadius:14,padding:"20px 16px 16px",marginBottom:12,textAlign:"center"},
  overallTitle:{fontSize:10,letterSpacing:3,color:"#444",marginBottom:12},
  overallScore:{display:"flex",alignItems:"center",justifyContent:"center",gap:16},
  overallBox:{textAlign:"center"},
  overallNum:{fontSize:52,fontWeight:"bold",fontFamily:"'Georgia',serif",lineHeight:1},
  overallLbl:{fontSize:10,color:"#444",letterSpacing:2,marginTop:4},
  overallDash:{fontSize:28,color:"#1e1e1e",fontFamily:"'Georgia',serif"},
  winPct:{fontSize:13,color:"#444",marginTop:10},
  barOuter:{height:8,background:"#1a1a1a",borderRadius:4,marginTop:10,overflow:"hidden"},
  barInner:{height:"100%",background:"linear-gradient(90deg,#2d7a2d,#4CAF50)",borderRadius:4},
  oppHeader:{fontSize:10,letterSpacing:3,color:"#444",textTransform:"uppercase",padding:"14px 0 6px"},
  oppCard:{background:"#161616",border:"1px solid #1a1a1a",borderRadius:10,padding:"12px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:10},
  oppName:{flex:1,fontSize:14,fontWeight:"bold",color:"#eee",fontFamily:"'Georgia',serif"},
  oppRec:{display:"flex",alignItems:"center",gap:4},
  oppRecNum:{fontSize:13,fontWeight:"bold",fontFamily:"'Georgia',serif"},
  oppRecSep:{color:"#222",fontSize:10},
  oppDots:{display:"flex",gap:3},
  oppDot:{width:7,height:7,borderRadius:"50%"},
  oppPct:{fontSize:12,fontWeight:"bold",fontFamily:"'Georgia',serif",width:34,textAlign:"right"},
  runTotals:{display:"flex",gap:8,marginBottom:20},
  runBox:{flex:1,background:"#161616",border:"1px solid #1a1a1a",borderRadius:10,padding:"12px 8px",textAlign:"center"},
  runNum:{fontSize:26,fontWeight:"bold",fontFamily:"'Georgia',serif",lineHeight:1},
  runLbl:{fontSize:9,color:"#444",letterSpacing:1,marginTop:4,textTransform:"uppercase"},
  // Roster
  rosterRow:{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",borderBottom:"1px solid #1a1a1a"},
  rosterNum:{width:28,fontSize:11,color:"#444",fontStyle:"italic"},
  rosterName:{flex:1,fontSize:15,color:"#eee"},
  rosterInput:{flex:1,background:"#222",border:"1px solid #e53935",borderRadius:6,padding:"4px 8px",color:"#fff",fontSize:15,fontFamily:"'Georgia',serif",outline:"none"},
  rosterEdit:{background:"none",border:"none",fontSize:16,cursor:"pointer"},
  rosterHint:{fontSize:11,color:"#333",padding:"8px 16px 0",fontStyle:"italic"},
  statRow:{display:"flex",alignItems:"center",gap:10,padding:"8px 16px",borderBottom:"1px solid #1a1a1a"},
  statName:{width:90,fontSize:12,color:"#bbb",flexShrink:0},
  statGames:{width:28,fontSize:11,color:"#444",flexShrink:0,textAlign:"right"},
  statDots:{display:"flex",gap:4,flex:1},
  statDot:{width:20,height:20,borderRadius:5},
  // Modals
  overlay:{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",display:"flex",alignItems:"flex-end",zIndex:100,backdropFilter:"blur(4px)"},
  modal:{background:"#1a1a1a",borderRadius:"20px 20px 0 0",padding:"24px 0 40px",width:"100%",maxHeight:"85vh",display:"flex",flexDirection:"column",border:"1px solid #2a2a2a"},
  modalTitle:{fontSize:16,fontWeight:"bold",color:"#fff",padding:"0 20px 16px",borderBottom:"1px solid #222",fontFamily:"'Georgia',serif"},
  modalList:{flex:1,overflowY:"auto",padding:"8px 0"},
  modalItem:{width:"100%",padding:"12px 20px",background:"none",border:"none",display:"flex",alignItems:"center",gap:10,cursor:"pointer",textAlign:"left",borderBottom:"1px solid #1a1a1a",color:"#eee",fontFamily:"'Georgia',serif"},
  modalBadge:{borderRadius:5,padding:"2px 7px",fontSize:11,fontWeight:"bold",color:"#fff"},
  modalPosName:{flex:1,fontSize:14,color:"#888"},
  modalCurrent:{fontSize:11,color:"#444"},
  modalPlayerName:{flex:1,fontSize:14},
  modalClose:{margin:"12px 20px 0",padding:"12px",background:"#222",border:"none",borderRadius:10,color:"#666",fontSize:14,cursor:"pointer",fontFamily:"'Georgia',serif"},
  saveBtn:{flex:1,padding:13,background:"#b71c1c",border:"none",borderRadius:10,color:"#fff",fontSize:14,fontWeight:"bold",cursor:"pointer",fontFamily:"'Georgia',serif"},
  deleteBtn:{padding:"13px 18px",background:"#222",border:"none",borderRadius:10,color:"#e53935",fontSize:14,cursor:"pointer",fontFamily:"'Georgia',serif"},
  formField:{marginBottom:12},
  formLabel:{fontSize:11,color:"#555",letterSpacing:1,marginBottom:4,textTransform:"uppercase"},
  formInput:{width:"100%",background:"#222",border:"1px solid #2a2a2a",borderRadius:8,padding:"10px 12px",color:"#fff",fontSize:14,fontFamily:"'Georgia',serif",outline:"none",boxSizing:"border-box"},
  toggleRow:{display:"flex",gap:6,flexWrap:"wrap"},
  toggle:{padding:"7px 12px",background:"#222",border:"1px solid #2a2a2a",borderRadius:20,color:"#777",fontSize:12,cursor:"pointer",fontFamily:"'Georgia',serif"},
  toggleActive:{background:"#2a2a2a",color:"#fff",border:"1px solid #444"},
  toast:{position:"fixed",bottom:80,left:"50%",transform:"translateX(-50%)",background:"rgba(229,57,53,0.92)",color:"#fff",padding:"8px 20px",borderRadius:20,fontSize:13,backdropFilter:"blur(8px)",zIndex:200,boxShadow:"0 4px 20px rgba(0,0,0,0.5)",whiteSpace:"nowrap"},
  // Print tab
  printActionBar:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 16px 12px",borderBottom:"1px solid #1a1a1a"},
  printHint:{fontSize:12,color:"#555",flex:1,marginRight:12},
  printBtn:{background:"#b71c1c",border:"none",borderRadius:20,color:"#fff",padding:"10px 20px",fontSize:13,fontWeight:"bold",cursor:"pointer",fontFamily:"'Georgia',serif",flexShrink:0},
  printPage:{background:"#fff",margin:"0 12px 24px",borderRadius:12,padding:"20px",boxShadow:"0 2px 16px rgba(0,0,0,0.3)",fontFamily:"'Georgia',serif"},
  printHeader:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",borderBottom:"3px solid #b71c1c",paddingBottom:10,marginBottom:14},
  printHeaderLeft:{flex:1},
  printHeaderRight:{flex:1,textAlign:"right"},
  printTeamName:{fontSize:16,fontWeight:"bold",color:"#b71c1c",letterSpacing:2},
  printSubtitle:{fontSize:10,color:"#888",letterSpacing:1,marginTop:2},
  printGameInfo:{fontSize:10,color:"#333",marginTop:3},
  printTable:{width:"100%",borderCollapse:"collapse",marginBottom:16,fontSize:10},
  printTh:{background:"#b71c1c",color:"#fff",padding:"5px 6px",textAlign:"center",fontSize:9,letterSpacing:0.5,border:"1px solid #8a1010"},
  printThPlayer:{textAlign:"left",minWidth:80},
  printTrEven:{background:"#fff"},
  printTrOdd:{background:"#fdf8f0"},
  printTdNum:{padding:"5px 6px",textAlign:"center",border:"1px solid #e0d5c0",color:"#888",fontSize:10,width:20},
  printTdName:{padding:"5px 8px",border:"1px solid #e0d5c0",fontWeight:"bold",color:"#1a1a1a",fontSize:11,minWidth:80},
  printTdPos:{padding:"5px 6px",textAlign:"center",border:"1px solid #e0d5c0",fontSize:10,color:"#333",minWidth:34},
  printTdNotes:{padding:"5px 8px",border:"1px solid #e0d5c0",minWidth:60},
  printSectionTitle:{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:"#b71c1c",marginBottom:8,borderBottom:"1px solid #e0d5c0",paddingBottom:4},
  printInningGrid:{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:16},
  printInningBox:{border:"1px solid #e0d5c0",borderRadius:6,overflow:"hidden"},
  printInningHeader:{background:"#b71c1c",color:"#fff",padding:"4px 8px",fontSize:9,fontWeight:"bold",letterSpacing:1},
  printPosRow:{display:"flex",alignItems:"center",gap:6,padding:"3px 8px",borderBottom:"1px solid #f0e8e0"},
  printPosBadge:{display:"inline-flex",alignItems:"center",justifyContent:"center",width:24,height:16,borderRadius:3,fontSize:8,fontWeight:"bold",color:"#fff",flexShrink:0},
  printPosPlayer:{fontSize:9,color:"#1a1a1a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},
  printScoreSection:{marginBottom:12},
  printScoreTable:{width:"100%",borderCollapse:"collapse",fontSize:10},
  printScoreTh:{background:"#333",color:"#fff",padding:"4px 8px",textAlign:"center",border:"1px solid #555",fontSize:9},
  printScoreTd:{padding:"5px 8px",textAlign:"center",border:"1px solid #e0d5c0",minWidth:28,fontSize:11},
  printFooter:{textAlign:"center",fontSize:8,color:"#bbb",marginTop:12,paddingTop:8,borderTop:"1px solid #e0d5c0"},
};

const css=`
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
  body{margin:0;background:#0f0f0f;}
  ::-webkit-scrollbar{display:none;}
  button:active{opacity:0.75;transform:scale(0.97);}
  input[type="date"],input[type="time"]{color-scheme:dark;}
  @media print {
    body { background: #fff !important; }
    #root > div { max-width: 100% !important; background: #fff !important; }
    .no-print, [style*="position:fixed"] { display: none !important; }
    #printable { margin: 0 !important; box-shadow: none !important; border-radius: 0 !important; padding: 12px !important; }
    @page { margin: 0.5in; size: landscape; }
  }
`;
