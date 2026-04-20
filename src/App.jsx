import { useState } from "react";

const POSITIONS = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "Bench"];
const POSITION_COLORS = {
  P: "#e53935", C: "#1e88e5", "1B": "#43a047", "2B": "#fb8c00",
  "3B": "#8e24aa", SS: "#00acc1", LF: "#f4511e", CF: "#6d4c41",
  RF: "#039be5", Bench: "#546e7a"
};
const POSITION_LABELS = {
  P: "Pitcher", C: "Catcher", "1B": "First Base", "2B": "Second Base",
  "3B": "Third Base", SS: "Shortstop", LF: "Left Field", CF: "Center Field",
  RF: "Right Field", Bench: "Bench"
};
const FIELD_POSITIONS = {
  CF: { x: 50, y: 10 }, LF: { x: 18, y: 22 }, RF: { x: 82, y: 22 },
  SS: { x: 33, y: 42 }, "2B": { x: 57, y: 36 }, "3B": { x: 22, y: 56 },
  "1B": { x: 76, y: 56 }, P: { x: 50, y: 54 }, C: { x: 50, y: 74 },
};
const INITIAL_PLAYERS = [
  "Player 1","Player 2","Player 3","Player 4","Player 5","Player 6",
  "Player 7","Player 8","Player 9","Player 10","Player 11"
];
const TOTAL_INNINGS = 6;

// Scorebook: at-bat outcomes
const OUTCOMES = [
  { code: "1B", label: "Single", color: "#2d7a2d" },
  { code: "2B", label: "Double", color: "#1a6b8a" },
  { code: "3B", label: "Triple", color: "#7a5a1a" },
  { code: "HR", label: "Home Run", color: "#b71c1c" },
  { code: "BB", label: "Walk", color: "#4a7a4a" },
  { code: "K",  label: "Strikeout", color: "#8a1a1a" },
  { code: "Kl", label: "K Looking", color: "#6a1a6a" },
  { code: "E",  label: "Error", color: "#8a6a1a" },
  { code: "FC", label: "Fielder's Ch.", color: "#5a5a8a" },
  { code: "SF", label: "Sac Fly", color: "#4a6a7a" },
  { code: "SAC", label: "Sacrifice", color: "#6a4a4a" },
  { code: "HBP", label: "Hit by Pitch", color: "#7a4a1a" },
  { code: "GO", label: "Ground Out", color: "#5a5a5a" },
  { code: "FO", label: "Fly Out", color: "#4a4a6a" },
  { code: "DP", label: "Double Play", color: "#6a3a3a" },
];

const BASE_COLORS = { "1B": "#2d7a2d", "2B": "#1a6b8a", "3B": "#b8860b", HR: "#b71c1c" };

function createEmptyInning() {
  return POSITIONS.reduce((acc, pos) => ({ ...acc, [pos]: null }), {});
}

// Score cell: tracks what happened each at-bat per inning
function createScoreCell() {
  return { outcome: null, rbi: 0, run: false, basesReached: [] };
}

export default function App() {
  const [players, setPlayers] = useState(INITIAL_PLAYERS);
  const [innings, setInnings] = useState(Array.from({ length: TOTAL_INNINGS }, createEmptyInning));
  const [view, setView] = useState("lineup");
  const [currentInning, setCurrentInning] = useState(0);
  const [fieldInning, setFieldInning] = useState(0);
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [editName, setEditName] = useState("");
  const [assignModal, setAssignModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [hoveredPos, setHoveredPos] = useState(null);

  // Scorebook state
  // scoreGrid[playerIdx][inningIdx] = { outcome, run, basesReached[] }
  const [scoreGrid, setScoreGrid] = useState(
    () => Array.from({ length: 11 }, () => Array.from({ length: TOTAL_INNINGS }, createScoreCell))
  );
  // inningRuns[team][inning]: "Cardinals" and "Opponent"
  const [teamRuns, setTeamRuns] = useState(Array(TOTAL_INNINGS).fill(0));
  const [oppRuns, setOppRuns] = useState(Array(TOTAL_INNINGS).fill(0));
  const [oppName, setOppName] = useState("Opponent");
  const [editingOpp, setEditingOpp] = useState(false);
  // Pitch count
  const [pitchCount, setPitchCount] = useState({ balls: 0, strikes: 0, fouls: 0 });
  // Per-inning pitch log: array of { type: "ball"|"strike"|"foul" }
  const [pitchLog, setPitchLog] = useState(Array.from({ length: TOTAL_INNINGS }, () => []));
  const [scoreInning, setScoreInning] = useState(0);
  const [outcomeModal, setOutcomeModal] = useState(null); // { playerIdx, inningIdx }

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  // ── Lineup helpers ──────────────────────────────────────────────────
  const assignPlayer = (inningIdx, pos, player) => {
    setInnings(prev => {
      const next = prev.map(inn => ({ ...inn }));
      Object.keys(next[inningIdx]).forEach(p => { if (next[inningIdx][p] === player) next[inningIdx][p] = null; });
      next[inningIdx][pos] = player;
      return next;
    });
    setAssignModal(null);
    showToast(`${player} → ${pos}`);
  };
  const removeFromPosition = (inningIdx, pos) => {
    setInnings(prev => { const n = prev.map(i => ({ ...i })); n[inningIdx][pos] = null; return n; });
  };
  const getPlayerPosition = (inningIdx, player) =>
    Object.entries(innings[inningIdx]).find(([, p]) => p === player)?.[0] || null;
  const getUnassigned = (inningIdx) => {
    const assigned = new Set(Object.values(innings[inningIdx]).filter(Boolean));
    return players.filter(p => !assigned.has(p));
  };
  const copyInning = (fromIdx, toIdx) => {
    setInnings(prev => { const n = [...prev]; n[toIdx] = { ...prev[fromIdx] }; return n; });
    showToast(`Inning ${fromIdx + 1} copied to Inning ${toIdx + 1}`);
  };
  const renamePlayer = (idx, name) => {
    const oldName = players[idx];
    const newName = name.trim() || oldName;
    setPlayers(prev => prev.map((p, i) => i === idx ? newName : p));
    setInnings(prev => prev.map(inn => {
      const next = { ...inn };
      Object.keys(next).forEach(pos => { if (next[pos] === oldName) next[pos] = newName; });
      return next;
    }));
    setEditingPlayer(null);
  };
  const fieldPositions = POSITIONS.filter(p => p !== "Bench");

  // ── Scorebook helpers ───────────────────────────────────────────────
  const setOutcome = (playerIdx, inningIdx, outcome) => {
    setScoreGrid(prev => {
      const next = prev.map(row => row.map(cell => ({ ...cell })));
      next[playerIdx][inningIdx].outcome = outcome;
      return next;
    });
    setOutcomeModal(null);
    showToast(`${players[playerIdx]}: ${outcome}`);
  };
  const toggleRun = (playerIdx, inningIdx) => {
    setScoreGrid(prev => {
      const next = prev.map(row => row.map(cell => ({ ...cell })));
      next[playerIdx][inningIdx].run = !next[playerIdx][inningIdx].run;
      return next;
    });
  };
  const adjustTeamRuns = (inningIdx, delta) => {
    setTeamRuns(prev => { const n = [...prev]; n[inningIdx] = Math.max(0, (n[inningIdx] || 0) + delta); return n; });
  };
  const adjustOppRuns = (inningIdx, delta) => {
    setOppRuns(prev => { const n = [...prev]; n[inningIdx] = Math.max(0, (n[inningIdx] || 0) + delta); return n; });
  };
  const addPitch = (type) => {
    setPitchLog(prev => {
      const next = prev.map(arr => [...arr]);
      next[scoreInning] = [...next[scoreInning], type];
      return next;
    });
  };
  const undoPitch = () => {
    setPitchLog(prev => {
      const next = prev.map(arr => [...arr]);
      if (next[scoreInning].length > 0) next[scoreInning] = next[scoreInning].slice(0, -1);
      return next;
    });
  };
  const resetPitches = () => {
    setPitchLog(prev => { const n = [...prev]; n[scoreInning] = []; return n; });
  };

  const currentPitches = pitchLog[scoreInning];
  const pitchBalls = currentPitches.filter(p => p === "ball").length;
  const pitchStrikes = currentPitches.filter(p => p === "strike").length;
  const pitchFouls = currentPitches.filter(p => p === "foul").length;
  const totalPitchesInning = currentPitches.length;
  const totalPitchesGame = pitchLog.flat().length;

  const cardinalsTotalRuns = teamRuns.reduce((a, b) => a + b, 0);
  const oppTotalRuns = oppRuns.reduce((a, b) => a + b, 0);

  // Tally mark renderer (groups of 5: 4 vertical + 1 diagonal)
  const TallyMarks = ({ count, color }) => {
    const groups = Math.floor(count / 5);
    const rem = count % 5;
    const marks = [];
    for (let g = 0; g < groups; g++) {
      marks.push(
        <svg key={`g${g}`} width="22" height="18" viewBox="0 0 22 18" style={{ display: "inline-block" }}>
          {[0,1,2,3].map(i => <line key={i} x1={3+i*4} y1="3" x2={3+i*4} y2="15" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>)}
          <line x1="1" y1="15" x2="21" y2="3" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      );
    }
    if (rem > 0) {
      marks.push(
        <svg key="rem" width={rem * 4 + 4} height="18" viewBox={`0 0 ${rem*4+4} 18`} style={{ display: "inline-block" }}>
          {Array.from({ length: rem }, (_, i) => <line key={i} x1={3+i*4} y1="3" x2={3+i*4} y2="15" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>)}
        </svg>
      );
    }
    return <span style={{ display: "inline-flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>{marks}</span>;
  };

  // Mini diamond SVG for scorebook cell
  const MiniDiamond = ({ outcome, run, size = 38 }) => {
    const isHit = ["1B","2B","3B","HR"].includes(outcome);
    const color = outcome ? (BASE_COLORS[outcome] || "#888") : "#ccc";
    const fillColor = run ? "rgba(229,57,53,0.25)" : "transparent";
    return (
      <svg width={size} height={size} viewBox="0 0 40 40">
        <polygon points="20,4 36,20 20,36 4,20"
          fill={fillColor} stroke={outcome ? color : "#c8b89a"} strokeWidth={outcome ? "2" : "1.2"} />
        {/* Base dots */}
        {["1B","2B","3B","HR"].includes(outcome) && (
          <>
            {(outcome === "1B" || outcome === "2B" || outcome === "3B" || outcome === "HR") &&
              <circle cx="36" cy="20" r="3" fill={color} />}
            {(outcome === "2B" || outcome === "3B" || outcome === "HR") &&
              <circle cx="20" cy="4" r="3" fill={color} />}
            {(outcome === "3B" || outcome === "HR") &&
              <circle cx="4" cy="20" r="3" fill={color} />}
            {outcome === "HR" && <circle cx="20" cy="36" r="3.5" fill="#e53935" />}
          </>
        )}
        {run && <circle cx="20" cy="36" r="3.5" fill="#e53935" />}
        {outcome && (
          <text x="20" y="24" textAnchor="middle" fontSize="9" fontWeight="bold"
            fill={color} fontFamily="Georgia, serif">{outcome}</text>
        )}
      </svg>
    );
  };

  // ── SCOREBOOK VIEW ──────────────────────────────────────────────────
  const ScorebookView = () => (
    <div style={sb.page}>
      {/* Paper texture header */}
      <div style={sb.bookHeader}>
        <div style={sb.bookTitle}>OFFICIAL SCORE BOOK</div>
        <div style={sb.bookSubtitle}>Cardinals · 9U</div>
        <div style={sb.vsRow}>
          <span style={sb.teamName}>Cardinals</span>
          <span style={sb.vsText}>vs</span>
          {editingOpp
            ? <input style={sb.oppInput} value={oppName} autoFocus
                onChange={e => setOppName(e.target.value)}
                onBlur={() => setEditingOpp(false)}
                onKeyDown={e => e.key === "Enter" && setEditingOpp(false)} />
            : <span style={sb.teamName} onClick={() => setEditingOpp(true)}>{oppName} ✏️</span>
          }
        </div>
      </div>

      {/* Scoreboard */}
      <div style={sb.scoreboard}>
        <div style={sb.scoreboardInner}>
          <div style={sb.scoreboardRow}>
            <div style={sb.scoreboardTeamCell}>CARDINALS</div>
            {Array.from({ length: TOTAL_INNINGS }, (_, i) => (
              <div key={i} style={sb.scoreboardInningCell}>
                <div style={sb.scoreboardInnNum}>{i+1}</div>
                <div style={sb.scoreboardRunControls}>
                  <button style={sb.runBtn} onClick={() => adjustTeamRuns(i, 1)}>+</button>
                  <span style={sb.runNum}>{teamRuns[i]}</span>
                  <button style={sb.runBtn} onClick={() => adjustTeamRuns(i, -1)}>−</button>
                </div>
              </div>
            ))}
            <div style={{ ...sb.scoreboardInningCell, ...sb.totalCell }}>
              <div style={sb.totalLabel}>R</div>
              <div style={sb.totalNum}>{cardinalsTotalRuns}</div>
            </div>
          </div>
          <div style={sb.scoreboardRow}>
            <div style={sb.scoreboardTeamCell}>{oppName.toUpperCase().slice(0,10)}</div>
            {Array.from({ length: TOTAL_INNINGS }, (_, i) => (
              <div key={i} style={sb.scoreboardInningCell}>
                <div style={sb.scoreboardRunControls}>
                  <button style={sb.runBtn} onClick={() => adjustOppRuns(i, 1)}>+</button>
                  <span style={sb.runNum}>{oppRuns[i]}</span>
                  <button style={sb.runBtn} onClick={() => adjustOppRuns(i, -1)}>−</button>
                </div>
              </div>
            ))}
            <div style={{ ...sb.scoreboardInningCell, ...sb.totalCell }}>
              <div style={sb.totalNum}>{oppTotalRuns}</div>
            </div>
          </div>
        </div>
        {/* Big score display */}
        <div style={sb.bigScore}>
          <div style={sb.bigScoreTeam}>
            <div style={sb.bigScoreNum}>{cardinalsTotalRuns}</div>
            <div style={sb.bigScoreLabel}>Cardinals</div>
          </div>
          <div style={sb.bigScoreDash}>—</div>
          <div style={sb.bigScoreTeam}>
            <div style={sb.bigScoreNum}>{oppTotalRuns}</div>
            <div style={sb.bigScoreLabel}>{oppName}</div>
          </div>
        </div>
      </div>

      {/* At-Bat Grid */}
      <div style={sb.sectionHeading}>📋 AT-BAT RECORD</div>
      <div style={sb.gridScroll}>
        <table style={sb.scoreTable}>
          <thead>
            <tr>
              <th style={sb.thName}>BATTER</th>
              {Array.from({ length: TOTAL_INNINGS }, (_, i) => (
                <th key={i} style={sb.thInn}>INN {i+1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((player, pi) => (
              <tr key={pi} style={pi % 2 === 0 ? sb.trEven : sb.trOdd}>
                <td style={sb.tdName}>
                  <div style={sb.batterNum}>#{pi+1}</div>
                  <div style={sb.batterName}>{player.split(" ").pop()}</div>
                </td>
                {Array.from({ length: TOTAL_INNINGS }, (_, ii) => {
                  const cell = scoreGrid[pi][ii];
                  return (
                    <td key={ii} style={sb.tdCell}
                      onClick={() => setOutcomeModal({ playerIdx: pi, inningIdx: ii })}>
                      <div style={sb.cellInner}>
                        <MiniDiamond outcome={cell.outcome} run={cell.run} />
                        {cell.run && <div style={sb.runDot}>R</div>}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={sb.gridHint}>Tap any cell to record an at-bat result • Tap again to mark a Run scored</div>

      {/* Pitch Count */}
      <div style={sb.sectionHeading}>⚾ PITCH COUNT</div>
      <div style={sb.pitchPanel}>
        {/* Inning selector */}
        <div style={sb.pitchInningRow}>
          {Array.from({ length: TOTAL_INNINGS }, (_, i) => (
            <button key={i} style={{ ...sb.pitchInnBtn, ...(scoreInning === i ? sb.pitchInnActive : {}) }}
              onClick={() => setScoreInning(i)}>
              <span style={sb.pitchInnNum}>I{i+1}</span>
            </button>
          ))}
        </div>

        {/* Live count display */}
        <div style={sb.liveCount}>
          <div style={sb.liveBox}>
            <div style={{ ...sb.liveNum, color: "#4CAF50" }}>{pitchBalls}</div>
            <div style={sb.liveLabel}>BALLS</div>
          </div>
          <div style={sb.liveBox}>
            <div style={{ ...sb.liveNum, color: "#e53935" }}>{pitchStrikes}</div>
            <div style={sb.liveLabel}>STRIKES</div>
          </div>
          <div style={sb.liveBox}>
            <div style={{ ...sb.liveNum, color: "#fb8c00" }}>{pitchFouls}</div>
            <div style={sb.liveLabel}>FOULS</div>
          </div>
          <div style={{ ...sb.liveBox, borderLeft: "1px solid #e0d5c0" }}>
            <div style={{ ...sb.liveNum, color: "#5a4a30" }}>{totalPitchesInning}</div>
            <div style={sb.liveLabel}>THIS INN</div>
          </div>
          <div style={sb.liveBox}>
            <div style={{ ...sb.liveNum, color: "#3a2a10" }}>{totalPitchesGame}</div>
            <div style={sb.liveLabel}>TOTAL</div>
          </div>
        </div>

        {/* Pitch buttons */}
        <div style={sb.pitchBtns}>
          <button style={{ ...sb.pitchBtn, ...sb.pitchBall }} onClick={() => addPitch("ball")}>
            <span style={sb.pitchBtnIcon}>●</span> Ball
          </button>
          <button style={{ ...sb.pitchBtn, ...sb.pitchStrike }} onClick={() => addPitch("strike")}>
            <span style={sb.pitchBtnIcon}>✗</span> Strike
          </button>
          <button style={{ ...sb.pitchBtn, ...sb.pitchFoul }} onClick={() => addPitch("foul")}>
            <span style={sb.pitchBtnIcon}>↗</span> Foul
          </button>
        </div>
        <div style={sb.pitchActions}>
          <button style={sb.undoBtn} onClick={undoPitch}>↩ Undo</button>
          <button style={sb.resetBtn} onClick={resetPitches}>⟳ Reset Inning</button>
        </div>

        {/* Tally marks display */}
        <div style={sb.tallySection}>
          <div style={sb.tallyRow}>
            <div style={sb.tallyLabel}>Balls</div>
            <div style={sb.tallyMarks}>
              <TallyMarks count={pitchBalls} color="#2d6a2d" />
              {pitchBalls === 0 && <span style={sb.tallyNone}>—</span>}
            </div>
          </div>
          <div style={sb.tallyRow}>
            <div style={sb.tallyLabel}>Strikes</div>
            <div style={sb.tallyMarks}>
              <TallyMarks count={pitchStrikes} color="#8a1a1a" />
              {pitchStrikes === 0 && <span style={sb.tallyNone}>—</span>}
            </div>
          </div>
          <div style={sb.tallyRow}>
            <div style={sb.tallyLabel}>Fouls</div>
            <div style={sb.tallyMarks}>
              <TallyMarks count={pitchFouls} color="#8a6a1a" />
              {pitchFouls === 0 && <span style={sb.tallyNone}>—</span>}
            </div>
          </div>
        </div>

        {/* Per-inning pitch summary */}
        <div style={sb.pitchSummaryTitle}>PITCH TOTALS BY INNING</div>
        <div style={sb.pitchSummaryGrid}>
          {Array.from({ length: TOTAL_INNINGS }, (_, i) => {
            const log = pitchLog[i];
            const b = log.filter(p => p === "ball").length;
            const s = log.filter(p => p === "strike").length;
            const f = log.filter(p => p === "foul").length;
            return (
              <div key={i} style={{ ...sb.pitchSummaryCell, ...(scoreInning === i ? sb.pitchSummaryCellActive : {}) }}
                onClick={() => setScoreInning(i)}>
                <div style={sb.pitchSummaryInn}>INN {i+1}</div>
                <div style={sb.pitchSummaryTotal}>{log.length}</div>
                <div style={sb.pitchSummaryBreak}>
                  <span style={{ color: "#2d6a2d" }}>{b}B</span>
                  <span style={{ color: "#8a1a1a" }}> {s}S</span>
                  <span style={{ color: "#8a6a1a" }}> {f}F</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Outcome Modal */}
      {outcomeModal && (
        <div style={styles.modalOverlay} onClick={() => setOutcomeModal(null)}>
          <div style={{ ...styles.modal, background: "#faf6ee" }} onClick={e => e.stopPropagation()}>
            <div style={{ ...styles.modalTitle, color: "#2a1a08", borderBottom: "1px solid #e0d5c0" }}>
              {players[outcomeModal.playerIdx]} — Inning {outcomeModal.inningIdx + 1}
            </div>
            <div style={sb.outcomeGrid}>
              {OUTCOMES.map(({ code, label, color }) => (
                <button key={code}
                  style={{
                    ...sb.outcomeBtn,
                    background: scoreGrid[outcomeModal.playerIdx][outcomeModal.inningIdx].outcome === code
                      ? color : "#f0ebe0",
                    color: scoreGrid[outcomeModal.playerIdx][outcomeModal.inningIdx].outcome === code
                      ? "#fff" : "#3a2a10",
                    border: `1px solid ${color}40`,
                  }}
                  onClick={() => setOutcome(outcomeModal.playerIdx, outcomeModal.inningIdx, code)}>
                  <span style={sb.outcomeBtnCode}>{code}</span>
                  <span style={sb.outcomeBtnLabel}>{label}</span>
                </button>
              ))}
              {/* Toggle run */}
              <button style={{
                  ...sb.outcomeBtn, gridColumn: "span 2",
                  background: scoreGrid[outcomeModal.playerIdx][outcomeModal.inningIdx].run ? "#e53935" : "#f0ebe0",
                  color: scoreGrid[outcomeModal.playerIdx][outcomeModal.inningIdx].run ? "#fff" : "#3a2a10",
                  border: "1px solid #e5393540",
                }}
                onClick={() => { toggleRun(outcomeModal.playerIdx, outcomeModal.inningIdx); setOutcomeModal(null); }}>
                <span style={sb.outcomeBtnCode}>R</span>
                <span style={sb.outcomeBtnLabel}>Run Scored</span>
              </button>
              {/* Clear */}
              <button style={{ ...sb.outcomeBtn, gridColumn: "span 1", background: "#f0ebe0", color: "#888", border: "1px solid #ccc" }}
                onClick={() => { setOutcome(outcomeModal.playerIdx, outcomeModal.inningIdx, null); }}>
                <span style={sb.outcomeBtnCode}>CLR</span>
                <span style={sb.outcomeBtnLabel}>Clear</span>
              </button>
            </div>
            <button style={{ ...styles.modalClose, background: "#e8e0d0", color: "#5a4a30", margin: "8px 16px 0" }}
              onClick={() => setOutcomeModal(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );

  // ── FIELD VIEW ──────────────────────────────────────────────────────
  const FieldView = () => {
    const inn = innings[fieldInning];
    const unfielded = players.filter(p => !Object.values(inn).some(v => v === p));
    return (
      <div style={styles.content}>
        <div style={styles.inningTabs}>
          {Array.from({ length: TOTAL_INNINGS }, (_, i) => (
            <button key={i}
              style={{ ...styles.inningTab, ...(fieldInning === i ? styles.inningTabActive : {}) }}
              onClick={() => setFieldInning(i)}>
              <span style={styles.inningTabNum}>INN</span>
              <span style={styles.inningTabBig}>{i + 1}</span>
            </button>
          ))}
        </div>
        <div style={styles.fieldWrapper}>
          <svg viewBox="0 0 100 92" style={styles.fieldSvg} xmlns="http://www.w3.org/2000/svg">
            <defs>
              <radialGradient id="grassGrad" cx="50%" cy="55%" r="65%">
                <stop offset="0%" stopColor="#3a6b24" /><stop offset="100%" stopColor="#1c3d0f" />
              </radialGradient>
              <radialGradient id="darkGrassGrad" cx="50%" cy="55%" r="65%">
                <stop offset="0%" stopColor="#2e5a1b" /><stop offset="100%" stopColor="#162e0a" />
              </radialGradient>
              <radialGradient id="infieldGrad" cx="50%" cy="50%" r="60%">
                <stop offset="0%" stopColor="#d4a96a" /><stop offset="100%" stopColor="#a07840" />
              </radialGradient>
              <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="1.2" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <clipPath id="fieldClip"><ellipse cx="50" cy="46" rx="47" ry="43" /></clipPath>
            </defs>
            <ellipse cx="50" cy="46" rx="47" ry="43" fill="url(#grassGrad)" />
            {[0,1,2,3,4,5].map(i => (
              <ellipse key={i} cx="50" cy="48" rx={10+i*7} ry={9+i*6.5}
                fill={i%2===0 ? "url(#grassGrad)" : "url(#darkGrassGrad)"} clipPath="url(#fieldClip)" />
            ))}
            <line x1="50" y1="80" x2="4"  y2="4"  stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" strokeDasharray="2,1.5"/>
            <line x1="50" y1="80" x2="96" y2="4"  stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" strokeDasharray="2,1.5"/>
            <ellipse cx="50" cy="46" rx="45" ry="41" fill="none" stroke="#c8a060" strokeWidth="3" opacity="0.35" />
            <polygon points="50,34 74,57 50,80 26,57" fill="url(#infieldGrad)" opacity="0.92" />
            <circle cx="50" cy="57" r="14" fill="#3a6b24" opacity="0.5" />
            <polygon points="50,34 74,57 50,80 26,57" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="0.5" />
            <rect x="47.2" y="31.2" width="5.6" height="5.6" rx="1" fill="white" opacity="0.95" />
            <rect x="71.2" y="54.2" width="5.6" height="5.6" rx="1" fill="white" opacity="0.95" />
            <rect x="23.2" y="54.2" width="5.6" height="5.6" rx="1" fill="white" opacity="0.95" />
            <polygon points="50,77 53.5,80.5 52,84 48,84 46.5,80.5" fill="white" opacity="0.95" />
            <ellipse cx="50" cy="57" rx="4" ry="2.5" fill="#b8906a" stroke="rgba(255,255,255,0.25)" strokeWidth="0.4" />
            <circle cx="50" cy="57" r="1.2" fill="#c89a72" />
            {Object.entries(FIELD_POSITIONS).map(([pos, coords]) => {
              const player = inn[pos];
              const color = POSITION_COLORS[pos];
              const r = 5.2;
              const parts = player ? player.split(" ") : [];
              const shortName = player
                ? (parts.length >= 2 ? `${parts[0][0]}.${parts[parts.length-1]}` : player.substring(0,7))
                : null;
              return (
                <g key={pos} style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHoveredPos(pos)}
                  onMouseLeave={() => setHoveredPos(null)}
                  onClick={() => setAssignModal({ pos, inning: fieldInning })}>
                  {player && <circle cx={coords.x} cy={coords.y} r={r+2.8} fill={color} opacity="0.2" filter="url(#softGlow)" />}
                  <circle cx={coords.x+0.4} cy={coords.y+0.6} r={r} fill="rgba(0,0,0,0.4)" />
                  <circle cx={coords.x} cy={coords.y} r={r}
                    fill={player ? color : "rgba(15,15,15,0.72)"}
                    stroke={player ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.22)"} strokeWidth={player ? "0.8" : "0.5"} />
                  <text x={coords.x} y={coords.y+1.3} textAnchor="middle" fontSize="2.9" fontWeight="bold"
                    fill={player ? "white" : "rgba(255,255,255,0.3)"} fontFamily="Georgia, serif">{pos}</text>
                  {player && (
                    <g>
                      <rect x={coords.x-9.5} y={coords.y+r+0.6} width="19" height="5.8" rx="1.8"
                        fill="rgba(0,0,0,0.82)" stroke={color} strokeWidth="0.4" />
                      <text x={coords.x} y={coords.y+r+4.8} textAnchor="middle" fontSize="2.7" fill="white"
                        fontFamily="Georgia, serif" fontWeight="bold">{shortName}</text>
                    </g>
                  )}
                  {!player && (
                    <text x={coords.x} y={coords.y+r+5.2} textAnchor="middle" fontSize="2"
                      fill="rgba(255,255,255,0.28)" fontFamily="Georgia, serif">empty</text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
        <div style={styles.fieldLegendGrid}>
          {Object.entries(FIELD_POSITIONS).map(([pos]) => {
            const player = inn[pos];
            return (
              <div key={pos} style={styles.legendRow} onClick={() => setAssignModal({ pos, inning: fieldInning })}>
                <span style={{ ...styles.legendBadge, background: POSITION_COLORS[pos] }}>{pos}</span>
                <span style={styles.legendPlayerName}>{player || <span style={styles.legendEmpty}>—</span>}</span>
                {player && <button style={styles.legendRemove}
                  onClick={e => { e.stopPropagation(); removeFromPosition(fieldInning, pos); }}>✕</button>}
              </div>
            );
          })}
        </div>
        <div style={styles.sectionLabel}>🪑 Not in Field</div>
        <div style={styles.benchArea}>
          {unfielded.length === 0
            ? <div style={styles.benchEmpty}>All players on the field!</div>
            : unfielded.map(p => (
              <div key={p} style={styles.benchChip}
                onClick={() => setAssignModal({ pos: "pick", player: p, inning: fieldInning })}>
                <span style={styles.benchDot} />{p}
              </div>
            ))
          }
        </div>
      </div>
    );
  };

  return (
    <div style={styles.root}>
      <style>{css}</style>

      {/* Header */}
      <div style={styles.header}>
        <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/St._Louis_Cardinals_logo.svg/200px-St._Louis_Cardinals_logo.svg.png"
          alt="St. Louis Cardinals" style={styles.headerLogo}
          onError={e => { e.target.style.display = "none"; }} />
        <div>
          <div style={styles.headerTitle}>Cardinals</div>
          <div style={styles.headerSub}>9U Lineup Manager</div>
        </div>
        <div style={styles.headerBadge}>{players.length} Players</div>
      </div>

      {/* Nav - 5 tabs */}
      <div style={styles.nav}>
        {[["lineup","⚾ Lineup"],["field","🏟 Field"],["score","📓 Score"],["summary","📋 Summary"],["roster","👥 Roster"]].map(([id, label]) => (
          <button key={id} style={{ ...styles.navBtn, ...(view === id ? styles.navBtnActive : {}) }}
            onClick={() => setView(id)}>{label}</button>
        ))}
      </div>

      {/* ── LINEUP VIEW ── */}
      {view === "lineup" && (
        <div style={styles.content}>
          <div style={styles.inningTabs}>
            {Array.from({ length: TOTAL_INNINGS }, (_, i) => (
              <button key={i} style={{ ...styles.inningTab, ...(currentInning === i ? styles.inningTabActive : {}) }}
                onClick={() => setCurrentInning(i)}>
                <span style={styles.inningTabNum}>INN</span>
                <span style={styles.inningTabBig}>{i + 1}</span>
              </button>
            ))}
          </div>
          {currentInning > 0 && (
            <div style={styles.copyBar}>
              <span style={styles.copyBarText}>Copy from:</span>
              {Array.from({ length: currentInning }, (_, i) => (
                <button key={i} style={styles.copyBtn} onClick={() => copyInning(i, currentInning)}>Inn {i+1}</button>
              ))}
            </div>
          )}
          <div style={styles.sectionLabel}>⚾ Field Positions</div>
          <div style={styles.posGrid}>
            {fieldPositions.map(pos => {
              const player = innings[currentInning][pos];
              return (
                <div key={pos} style={styles.posCard} onClick={() => setAssignModal({ pos, inning: currentInning })}>
                  <div style={{ ...styles.posBadge, background: POSITION_COLORS[pos] }}>{pos}</div>
                  <div style={styles.posPlayer}>{player || <span style={styles.posEmpty}>Tap to assign</span>}</div>
                  {player && <button style={styles.posRemove}
                    onClick={e => { e.stopPropagation(); removeFromPosition(currentInning, pos); }}>✕</button>}
                </div>
              );
            })}
          </div>
          <div style={styles.sectionLabel}>🪑 Bench</div>
          <div style={styles.benchArea}>
            {getUnassigned(currentInning).length === 0
              ? <div style={styles.benchEmpty}>All players are assigned!</div>
              : getUnassigned(currentInning).map(p => (
                <div key={p} style={styles.benchChip}
                  onClick={() => setAssignModal({ pos: "pick", player: p, inning: currentInning })}>
                  <span style={styles.benchDot} />{p}
                </div>
              ))
            }
            {innings[currentInning]["Bench"] && (
              <div style={{ ...styles.benchChip, opacity: 0.6 }}>
                <span style={{ ...styles.benchDot, background: POSITION_COLORS["Bench"] }} />
                {innings[currentInning]["Bench"]} <span style={styles.benchLabel}>(Bench)</span>
              </div>
            )}
          </div>
          {getUnassigned(currentInning).length > 0 && (
            <div style={styles.warning}>
              ⚠️ {getUnassigned(currentInning).length} player{getUnassigned(currentInning).length > 1 ? "s" : ""} unassigned
            </div>
          )}
        </div>
      )}

      {view === "field" && <FieldView />}
      {view === "score" && <ScorebookView />}

      {/* ── SUMMARY VIEW ── */}
      {view === "summary" && (
        <div style={styles.content}>
          <div style={styles.sectionLabel}>📋 Full Game Summary</div>
          <div style={styles.summaryScroll}>
            {players.map(player => (
              <div key={player} style={styles.summaryRow}>
                <div style={styles.summaryName}>{player}</div>
                <div style={styles.summaryInnings}>
                  {Array.from({ length: TOTAL_INNINGS }, (_, i) => {
                    const pos = getPlayerPosition(i, player);
                    return (
                      <div key={i} style={styles.summaryCell}>
                        <div style={styles.summaryCellInn}>I{i+1}</div>
                        <div style={{ ...styles.summaryCellPos, background: pos ? POSITION_COLORS[pos] : "#2a2a2a", color: pos ? "#fff" : "#555" }}>{pos || "—"}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div style={styles.sectionLabel}>📊 Position Stats</div>
          <div style={styles.statsGrid}>
            {fieldPositions.map(pos => {
              const assignments = innings.map(inn => inn[pos]).filter(Boolean);
              return (
                <div key={pos} style={styles.statCard}>
                  <div style={{ ...styles.statBadge, background: POSITION_COLORS[pos] }}>{pos}</div>
                  <div style={styles.statPlayers}>
                    {assignments.length === 0 ? <span style={styles.statEmpty}>None</span>
                      : assignments.map((p, i) => <div key={i} style={styles.statPlayer}>{p}</div>)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── ROSTER VIEW ── */}
      {view === "roster" && (
        <div style={styles.content}>
          <div style={styles.sectionLabel}>👥 Team Roster</div>
          {players.map((player, idx) => (
            <div key={idx} style={styles.rosterRow}>
              <div style={styles.rosterNum}>#{idx+1}</div>
              {editingPlayer === idx ? (
                <input style={styles.rosterInput} value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onBlur={() => renamePlayer(idx, editName)}
                  onKeyDown={e => e.key === "Enter" && renamePlayer(idx, editName)}
                  autoFocus />
              ) : <div style={styles.rosterName}>{player}</div>}
              <button style={styles.rosterEdit} onClick={() => { setEditingPlayer(idx); setEditName(player); }}>✏️</button>
            </div>
          ))}
          <div style={styles.rosterHint}>Tap ✏️ to rename a player</div>
          <div style={styles.sectionLabel}>🔄 Innings Played</div>
          {players.map(player => {
            const played = innings.filter(inn => Object.values(inn).some(p => p === player)).length;
            return (
              <div key={player} style={styles.playedRow}>
                <span style={styles.playedName}>{player}</span>
                <div style={styles.playedDots}>
                  {Array.from({ length: TOTAL_INNINGS }, (_, i) => {
                    const pos = getPlayerPosition(i, player);
                    return <div key={i} style={{ ...styles.playedDot, background: pos ? POSITION_COLORS[pos] : "#2a2a2a" }} />;
                  })}
                </div>
                <span style={styles.playedCount}>{played}/{TOTAL_INNINGS}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── ASSIGN MODAL ── */}
      {assignModal && (
        <div style={styles.modalOverlay} onClick={() => setAssignModal(null)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={styles.modalTitle}>
              {assignModal.pos === "pick"
                ? `Assign ${assignModal.player}`
                : `Assign to ${assignModal.pos} — ${POSITION_LABELS[assignModal.pos] || ""}`}
            </div>
            {assignModal.pos === "pick" ? (
              <div style={styles.modalList}>
                {fieldPositions.map(pos => (
                  <button key={pos} style={styles.modalItem}
                    onClick={() => assignPlayer(assignModal.inning, pos, assignModal.player)}>
                    <span style={{ ...styles.modalPosBadge, background: POSITION_COLORS[pos] }}>{pos}</span>
                    <span style={styles.modalPosName}>{POSITION_LABELS[pos]}</span>
                    {innings[assignModal.inning][pos] && <span style={styles.modalCurrent}>{innings[assignModal.inning][pos]}</span>}
                  </button>
                ))}
              </div>
            ) : (
              <div style={styles.modalList}>
                {players.map(p => {
                  const currentPos = getPlayerPosition(assignModal.inning, p);
                  return (
                    <button key={p} style={styles.modalItem}
                      onClick={() => assignPlayer(assignModal.inning, assignModal.pos, p)}>
                      <span style={styles.modalPlayerName}>{p}</span>
                      {currentPos && <span style={{ ...styles.modalPosBadge, background: POSITION_COLORS[currentPos] }}>{currentPos}</span>}
                    </button>
                  );
                })}
              </div>
            )}
            <button style={styles.modalClose} onClick={() => setAssignModal(null)}>Cancel</button>
          </div>
        </div>
      )}

      {toast && <div style={styles.toast}>{toast}</div>}
    </div>
  );
}

// ── SCOREBOOK STYLES (paper/book aesthetic) ─────────────────────────
const sb = {
  page: { background: "#faf6ee", minHeight: "100vh", paddingBottom: 40 },
  bookHeader: {
    background: "linear-gradient(135deg, #8b1a1a 0%, #5a0e0e 100%)",
    padding: "16px 16px 14px", textAlign: "center",
    borderBottom: "3px double #c8a060",
  },
  bookTitle: {
    fontFamily: "'Georgia', serif", fontSize: 13, letterSpacing: 4,
    color: "#f5e6c8", textTransform: "uppercase", fontWeight: "bold",
  },
  bookSubtitle: { fontSize: 11, color: "rgba(245,230,200,0.7)", letterSpacing: 2, marginTop: 2 },
  vsRow: { display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 8 },
  teamName: { fontSize: 13, color: "#f5e6c8", fontWeight: "bold", fontFamily: "'Georgia', serif", cursor: "pointer" },
  vsText: { fontSize: 11, color: "rgba(245,230,200,0.5)", letterSpacing: 2 },
  oppInput: {
    background: "rgba(255,255,255,0.15)", border: "1px solid rgba(245,230,200,0.4)",
    borderRadius: 4, padding: "2px 8px", color: "#f5e6c8", fontSize: 13,
    fontFamily: "'Georgia', serif", outline: "none", width: 100,
  },
  scoreboard: {
    margin: "12px 12px 0", background: "#fff",
    border: "2px solid #8b1a1a", borderRadius: 8,
    boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
    overflow: "hidden",
  },
  scoreboardInner: { borderBottom: "1px solid #ddd" },
  scoreboardRow: {
    display: "flex", borderBottom: "1px solid #e0d5c0",
    fontFamily: "'Georgia', serif",
  },
  scoreboardTeamCell: {
    width: 88, flexShrink: 0, fontSize: 9, fontWeight: "bold",
    color: "#5a2a0a", padding: "4px 6px", background: "#fdf8f0",
    borderRight: "1px solid #e0d5c0", display: "flex", alignItems: "center",
    letterSpacing: 0.5,
  },
  scoreboardInningCell: {
    flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", padding: "2px 0", borderRight: "1px solid #e8dfc8", minWidth: 0,
  },
  scoreboardInnNum: { fontSize: 8, color: "#8b1a1a", fontWeight: "bold", letterSpacing: 0.5 },
  scoreboardRunControls: { display: "flex", flexDirection: "column", alignItems: "center", gap: 0 },
  runBtn: {
    background: "none", border: "none", color: "#8b1a1a",
    fontSize: 13, lineHeight: 1, cursor: "pointer", padding: "0 4px",
    fontFamily: "'Georgia', serif", fontWeight: "bold",
  },
  runNum: { fontSize: 14, fontWeight: "bold", color: "#2a1a08", fontFamily: "'Georgia', serif" },
  totalCell: { background: "#fdf0e8", minWidth: 30, flexShrink: 0 },
  totalLabel: { fontSize: 8, color: "#8b1a1a", fontWeight: "bold", letterSpacing: 1 },
  totalNum: { fontSize: 18, fontWeight: "bold", color: "#8b1a1a", fontFamily: "'Georgia', serif" },
  bigScore: {
    display: "flex", alignItems: "center", justifyContent: "center",
    gap: 16, padding: "10px 0", background: "#faf6ee",
  },
  bigScoreTeam: { textAlign: "center" },
  bigScoreNum: { fontSize: 36, fontWeight: "bold", color: "#8b1a1a", fontFamily: "'Georgia', serif", lineHeight: 1 },
  bigScoreLabel: { fontSize: 10, color: "#8a6a4a", letterSpacing: 1, marginTop: 2 },
  bigScoreDash: { fontSize: 24, color: "#c8a060", fontFamily: "'Georgia', serif" },

  sectionHeading: {
    fontFamily: "'Georgia', serif", fontSize: 10, letterSpacing: 3,
    textTransform: "uppercase", color: "#8b1a1a", padding: "14px 12px 6px",
    borderBottom: "1px solid #e0d5c0", background: "#faf6ee",
  },

  // At-bat grid
  gridScroll: { overflowX: "auto", padding: "0 0 0 0" },
  scoreTable: {
    width: "100%", borderCollapse: "collapse", fontFamily: "'Georgia', serif",
    background: "#fff", fontSize: 10,
  },
  thName: {
    background: "#8b1a1a", color: "#f5e6c8", padding: "6px 8px",
    fontSize: 9, letterSpacing: 1, fontWeight: "bold", textAlign: "left",
    position: "sticky", left: 0, zIndex: 2, minWidth: 70, borderRight: "1px solid #6a1010",
  },
  thInn: {
    background: "#8b1a1a", color: "#f5e6c8", padding: "6px 4px",
    fontSize: 9, letterSpacing: 0.5, fontWeight: "bold", textAlign: "center",
    minWidth: 48, borderRight: "1px solid #6a1010",
  },
  trEven: { background: "#fff" },
  trOdd: { background: "#fdf8f0" },
  tdName: {
    padding: "4px 8px", borderRight: "2px solid #c8b89a", borderBottom: "1px solid #e8dfc8",
    position: "sticky", left: 0, background: "inherit", zIndex: 1, minWidth: 70,
  },
  batterNum: { fontSize: 8, color: "#8a6a4a" },
  batterName: { fontSize: 11, fontWeight: "bold", color: "#2a1a08", whiteSpace: "nowrap" },
  tdCell: {
    padding: "3px 3px", borderRight: "1px solid #e8dfc8", borderBottom: "1px solid #e8dfc8",
    cursor: "pointer", textAlign: "center", verticalAlign: "middle",
  },
  cellInner: { display: "flex", flexDirection: "column", alignItems: "center", position: "relative" },
  runDot: {
    position: "absolute", top: -2, right: -2,
    background: "#e53935", color: "#fff", borderRadius: "50%",
    width: 12, height: 12, fontSize: 7, display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: "bold",
  },
  gridHint: { fontSize: 10, color: "#8a6a4a", padding: "6px 12px", fontStyle: "italic", background: "#faf6ee" },

  // Outcome modal
  outcomeGrid: {
    display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6,
    padding: "12px 14px", overflowY: "auto", maxHeight: "50vh",
  },
  outcomeBtn: {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    padding: "8px 4px", borderRadius: 8, cursor: "pointer",
    fontFamily: "'Georgia', serif", gap: 2, minHeight: 54,
  },
  outcomeBtnCode: { fontSize: 14, fontWeight: "bold", lineHeight: 1 },
  outcomeBtnLabel: { fontSize: 8, opacity: 0.85, textAlign: "center", lineHeight: 1.2 },

  // Pitch panel
  pitchPanel: {
    margin: "0 12px 0", background: "#fff", border: "2px solid #8b1a1a",
    borderRadius: 8, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.1)",
  },
  pitchInningRow: {
    display: "flex", background: "#fdf8f0", borderBottom: "1px solid #e0d5c0", padding: "6px 8px", gap: 4,
  },
  pitchInnBtn: {
    flex: 1, padding: "5px 2px", background: "none",
    border: "1px solid #e0d5c0", borderRadius: 6,
    fontSize: 10, color: "#8a6a4a", cursor: "pointer", fontFamily: "'Georgia', serif",
  },
  pitchInnActive: {
    background: "#8b1a1a", color: "#f5e6c8", border: "1px solid #8b1a1a",
  },
  pitchInnNum: { fontWeight: "bold" },
  liveCount: {
    display: "flex", borderBottom: "1px solid #e0d5c0",
  },
  liveBox: {
    flex: 1, textAlign: "center", padding: "10px 4px",
    borderRight: "1px solid #e8dfc8",
  },
  liveNum: { fontSize: 26, fontWeight: "bold", lineHeight: 1, fontFamily: "'Georgia', serif" },
  liveLabel: { fontSize: 8, color: "#8a6a4a", letterSpacing: 1, marginTop: 2, textTransform: "uppercase" },
  pitchBtns: {
    display: "flex", gap: 0, borderBottom: "1px solid #e0d5c0",
  },
  pitchBtn: {
    flex: 1, padding: "14px 4px", border: "none", cursor: "pointer",
    fontSize: 13, fontFamily: "'Georgia', serif", fontWeight: "bold",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
    borderRight: "1px solid #e8dfc8",
  },
  pitchBtnIcon: { fontSize: 18 },
  pitchBall: { background: "#e8f5e9", color: "#2d6a2d" },
  pitchStrike: { background: "#ffebee", color: "#8a1a1a" },
  pitchFoul: { background: "#fff8e1", color: "#8a6a1a" },
  pitchActions: {
    display: "flex", gap: 0, borderBottom: "1px solid #e0d5c0",
  },
  undoBtn: {
    flex: 1, padding: "10px", background: "#fdf8f0", border: "none",
    borderRight: "1px solid #e0d5c0", color: "#5a4a30", fontSize: 12,
    cursor: "pointer", fontFamily: "'Georgia', serif",
  },
  resetBtn: {
    flex: 1, padding: "10px", background: "#fdf8f0", border: "none",
    color: "#8b1a1a", fontSize: 12, cursor: "pointer", fontFamily: "'Georgia', serif",
  },
  tallySection: { padding: "8px 14px", borderBottom: "1px solid #e0d5c0", background: "#faf6ee" },
  tallyRow: { display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: "1px solid #ede5d0" },
  tallyLabel: { width: 50, fontSize: 10, color: "#5a4a30", fontWeight: "bold", fontFamily: "'Georgia', serif", flexShrink: 0 },
  tallyMarks: { flex: 1, display: "flex", flexWrap: "wrap", alignItems: "center" },
  tallyNone: { fontSize: 11, color: "#c8b89a", fontStyle: "italic" },
  pitchSummaryTitle: {
    fontSize: 9, letterSpacing: 2, color: "#8a6a4a", textTransform: "uppercase",
    padding: "8px 14px 4px", background: "#fdf8f0",
  },
  pitchSummaryGrid: {
    display: "flex", padding: "4px 8px 12px", gap: 4,
  },
  pitchSummaryCell: {
    flex: 1, background: "#faf6ee", border: "1px solid #e0d5c0",
    borderRadius: 6, padding: "6px 4px", textAlign: "center", cursor: "pointer",
  },
  pitchSummaryCellActive: { background: "#fff0ec", border: "1px solid #8b1a1a" },
  pitchSummaryInn: { fontSize: 8, color: "#8a6a4a", letterSpacing: 0.5 },
  pitchSummaryTotal: { fontSize: 18, fontWeight: "bold", color: "#2a1a08", fontFamily: "'Georgia', serif", lineHeight: 1.2 },
  pitchSummaryBreak: { fontSize: 8, color: "#8a6a4a", marginTop: 1 },
};

// ── DARK-THEME APP STYLES ───────────────────────────────────────────
const styles = {
  root: {
    background: "#0f0f0f", minHeight: "100vh", maxWidth: 430,
    margin: "0 auto", fontFamily: "'Georgia', serif",
    color: "#f0f0f0", position: "relative", paddingBottom: 32,
  },
  header: {
    background: "linear-gradient(135deg, #b71c1c 0%, #7f0000 100%)",
    padding: "20px 20px 16px", display: "flex", alignItems: "center", gap: 12,
    boxShadow: "0 4px 20px rgba(183,28,28,0.5)",
  },
  headerLogo: { width: 54, height: 54, objectFit: "contain", flexShrink: 0, filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.5))" },
  headerTitle: { fontSize: 26, fontWeight: "bold", letterSpacing: 1, color: "#fff" },
  headerSub: { fontSize: 12, color: "rgba(255,255,255,0.7)", letterSpacing: 2, textTransform: "uppercase" },
  headerBadge: {
    marginLeft: "auto", background: "rgba(255,255,255,0.15)",
    borderRadius: 20, padding: "4px 12px", fontSize: 12, color: "#fff",
  },
  nav: { display: "flex", background: "#1a1a1a", borderBottom: "1px solid #2a2a2a" },
  navBtn: {
    flex: 1, padding: "10px 1px", background: "none", border: "none",
    color: "#666", fontSize: 10, cursor: "pointer", fontFamily: "'Georgia', serif",
    transition: "all 0.2s", whiteSpace: "nowrap",
  },
  navBtnActive: {
    color: "#e53935", borderBottom: "2px solid #e53935", background: "rgba(229,57,53,0.08)",
  },
  content: { padding: "0 0 20px" },
  fieldWrapper: { padding: "10px 12px 0", background: "linear-gradient(180deg, #091506 0%, #0f0f0f 100%)" },
  fieldSvg: { width: "100%", display: "block", borderRadius: 16, border: "1px solid #1e3014", boxShadow: "0 8px 32px rgba(0,0,0,0.6)" },
  fieldLegendGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5, padding: "10px 12px 0" },
  legendRow: { display: "flex", alignItems: "center", gap: 5, background: "#181818", borderRadius: 8, padding: "5px 7px", cursor: "pointer", border: "1px solid #242424", position: "relative" },
  legendBadge: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 18, borderRadius: 4, fontSize: 9, fontWeight: "bold", color: "#fff", flexShrink: 0 },
  legendPlayerName: { fontSize: 10.5, color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 },
  legendEmpty: { color: "#3a3a3a" },
  legendRemove: { background: "none", border: "none", color: "#666", fontSize: 8, cursor: "pointer", padding: 0, flexShrink: 0 },
  inningTabs: { display: "flex", overflowX: "auto", gap: 8, padding: "16px 16px 8px", scrollbarWidth: "none" },
  inningTab: { flexShrink: 0, width: 52, height: 60, background: "#1e1e1e", border: "1px solid #333", borderRadius: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#888", transition: "all 0.2s" },
  inningTabActive: { background: "linear-gradient(135deg, #b71c1c, #e53935)", border: "1px solid #e53935", color: "#fff", boxShadow: "0 4px 12px rgba(229,57,53,0.4)" },
  inningTabNum: { fontSize: 8, letterSpacing: 1, opacity: 0.7 },
  inningTabBig: { fontSize: 22, fontWeight: "bold", lineHeight: 1 },
  copyBar: { display: "flex", alignItems: "center", gap: 8, padding: "6px 16px", overflowX: "auto", scrollbarWidth: "none" },
  copyBarText: { fontSize: 11, color: "#666", flexShrink: 0 },
  copyBtn: { flexShrink: 0, padding: "4px 10px", background: "#1e1e1e", border: "1px solid #444", borderRadius: 6, color: "#aaa", fontSize: 11, cursor: "pointer" },
  sectionLabel: { fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#666", padding: "16px 16px 8px", borderTop: "1px solid #1e1e1e" },
  posGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "0 16px" },
  posCard: { background: "#1a1a1a", borderRadius: 12, padding: "12px", border: "1px solid #2a2a2a", cursor: "pointer", position: "relative", transition: "all 0.15s", display: "flex", flexDirection: "column", gap: 6, minHeight: 70 },
  posBadge: { display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: "bold", color: "#fff", alignSelf: "flex-start", letterSpacing: 0.5 },
  posPlayer: { fontSize: 14, fontWeight: "bold", color: "#eee" },
  posEmpty: { fontSize: 12, color: "#444", fontStyle: "italic", fontWeight: "normal" },
  posRemove: { position: "absolute", top: 8, right: 8, background: "rgba(229,57,53,0.2)", border: "none", borderRadius: 6, color: "#e53935", width: 22, height: 22, fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  benchArea: { padding: "0 16px", display: "flex", flexWrap: "wrap", gap: 8 },
  benchChip: { display: "flex", alignItems: "center", gap: 6, background: "#1e1e1e", border: "1px solid #333", borderRadius: 20, padding: "6px 14px", fontSize: 13, cursor: "pointer", color: "#ccc" },
  benchDot: { width: 8, height: 8, borderRadius: "50%", background: "#555" },
  benchLabel: { fontSize: 10, color: "#666" },
  benchEmpty: { fontSize: 13, color: "#4CAF50", padding: "8px 0" },
  warning: { margin: "12px 16px 0", padding: "8px 14px", background: "rgba(251,140,0,0.1)", border: "1px solid rgba(251,140,0,0.3)", borderRadius: 8, fontSize: 12, color: "#fb8c00" },
  summaryScroll: { padding: "0 16px", overflowX: "auto" },
  summaryRow: { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #1e1e1e" },
  summaryName: { width: 90, fontSize: 12, color: "#ddd", flexShrink: 0 },
  summaryInnings: { display: "flex", gap: 4 },
  summaryCell: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2 },
  summaryCellInn: { fontSize: 9, color: "#555" },
  summaryCellPos: { width: 34, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: "bold" },
  statsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "0 16px" },
  statCard: { background: "#1a1a1a", borderRadius: 10, padding: 10, border: "1px solid #2a2a2a" },
  statBadge: { display: "inline-flex", borderRadius: 5, padding: "2px 7px", fontSize: 11, fontWeight: "bold", color: "#fff", marginBottom: 6 },
  statPlayers: { display: "flex", flexDirection: "column", gap: 2 },
  statPlayer: { fontSize: 11, color: "#bbb" },
  statEmpty: { fontSize: 11, color: "#444" },
  rosterRow: { display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1px solid #1e1e1e" },
  rosterNum: { width: 30, fontSize: 11, color: "#666", fontStyle: "italic" },
  rosterName: { flex: 1, fontSize: 15, color: "#eee" },
  rosterInput: { flex: 1, background: "#252525", border: "1px solid #e53935", borderRadius: 6, padding: "4px 8px", color: "#fff", fontSize: 15, fontFamily: "'Georgia', serif", outline: "none" },
  rosterEdit: { background: "none", border: "none", fontSize: 16, cursor: "pointer" },
  rosterHint: { fontSize: 11, color: "#444", padding: "8px 16px 0", fontStyle: "italic" },
  playedRow: { display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", borderBottom: "1px solid #1a1a1a" },
  playedName: { width: 90, fontSize: 12, color: "#ccc", flexShrink: 0 },
  playedDots: { display: "flex", gap: 4, flex: 1 },
  playedDot: { width: 24, height: 24, borderRadius: 5 },
  playedCount: { fontSize: 12, color: "#666", flexShrink: 0 },
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "flex-end", zIndex: 100, backdropFilter: "blur(4px)" },
  modal: { background: "#1a1a1a", borderRadius: "20px 20px 0 0", padding: "24px 0 40px", width: "100%", maxHeight: "75vh", display: "flex", flexDirection: "column", border: "1px solid #2a2a2a" },
  modalTitle: { fontSize: 16, fontWeight: "bold", color: "#fff", padding: "0 20px 16px", borderBottom: "1px solid #2a2a2a" },
  modalList: { flex: 1, overflowY: "auto", padding: "8px 0" },
  modalItem: { width: "100%", padding: "12px 20px", background: "none", border: "none", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", textAlign: "left", borderBottom: "1px solid #1e1e1e", color: "#eee", fontFamily: "'Georgia', serif" },
  modalPosBadge: { borderRadius: 5, padding: "2px 8px", fontSize: 11, fontWeight: "bold", color: "#fff" },
  modalPosName: { flex: 1, fontSize: 14, color: "#ccc" },
  modalCurrent: { fontSize: 11, color: "#888" },
  modalPlayerName: { flex: 1, fontSize: 14 },
  modalClose: { margin: "12px 20px 0", padding: "12px", background: "#2a2a2a", border: "none", borderRadius: 10, color: "#aaa", fontSize: 14, cursor: "pointer", fontFamily: "'Georgia', serif" },
  toast: { position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", background: "rgba(229,57,53,0.9)", color: "#fff", padding: "8px 20px", borderRadius: 20, fontSize: 13, backdropFilter: "blur(8px)", zIndex: 200, boxShadow: "0 4px 20px rgba(0,0,0,0.4)", whiteSpace: "nowrap" },
};

const css = `
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body { margin: 0; background: #0f0f0f; }
  ::-webkit-scrollbar { display: none; }
  button:active { opacity: 0.75; transform: scale(0.97); }
`;
