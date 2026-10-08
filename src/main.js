import { Chess, DEFAULT_POSITION, validateFen } from 'chess.js';
import { Chessground } from 'chessground';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';
import './style.css';

import { Engine } from './engine.js';
import {
  CLASSES,
  classifyCandidates,
  classifyMove,
  formatScore,
  moveAccuracy,
  uciToMove,
  winPct,
} from './classify.js';
import { explainMove, replyLine } from './explain.js';

const ENGINE_URL = '/engine/stockfish-19-lite-single.js';
const $ = (id) => document.getElementById(id);

// ---------- settings ----------
const DEFAULTS = {
  mode: 'self',
  color: 'white',
  skill: 5,
  depth: 14,
  multipv: 3,
  autoHint: true,
  evalBar: true,
};
const SETTINGS_KEY = 'chess-coach-settings-v2';
const settings = loadSettings();

function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}
function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable: settings just won't persist */
  }
}

// ---------- state ----------
/** history[i] = position after i plies. Entry 0 is the start position. */
let history = [];
let orientation = settings.mode === 'bot' ? settings.color : 'white';
let hintsVisible = settings.autoHint;
let hoveredHint = null;
let liveInfo = null; // latest engine info for the current position
let startFen = DEFAULT_POSITION;
let editing = false;
let editTool = null; // { role, color } | 'trash' | null (null = move pieces)
let reviewing = false;
let reviewIdx = 0; // ply shown on the board while reviewing
let reviewRun = 0;
let reviewProgress = null; // { done, total, depth } while a review analysis runs

const analyst = new Engine(ENGINE_URL);
const bot = new Engine(ENGINE_URL);
const analyses = new Map(); // `${depth}|${fen}` -> Promise<analysis | null>

const current = () => history[history.length - 1];
/** The position on the board: the reviewed ply, or the live position. */
const shown = () => (reviewing ? history[reviewIdx] : current());
const botColor = () => (settings.color === 'white' ? 'b' : 'w');
const isBotTurn = () =>
  settings.mode === 'bot' && new Chess(current().fen).turn() === botColor();

// ---------- board ----------
const brushes = Object.fromEntries(
  Object.entries(CLASSES).map(([k, c]) => [k, { key: k, color: c.color, opacity: 0.85, lineWidth: 10 }]),
);
const ground = Chessground($('board'), {
  fen: DEFAULT_POSITION,
  orientation,
  animation: { enabled: true, duration: 180 },
  highlight: { lastMove: true, check: true },
  movable: { free: false, showDests: true, events: { after: onBoardMove } },
  premovable: { enabled: false },
  drawable: { enabled: true, brushes },
  events: { change: onEditorChange },
});

function toDests(chess) {
  const dests = new Map();
  for (const m of chess.moves({ verbose: true })) {
    if (!dests.has(m.from)) dests.set(m.from, []);
    dests.get(m.from).push(m.to);
  }
  return dests;
}

function syncBoard() {
  const entry = shown();
  const chess = new Chess(entry.fen);
  const turn = chess.turn() === 'w' ? 'white' : 'black';
  const canMove = !reviewing && !chess.isGameOver() && !isBotTurn();
  ground.set({
    fen: entry.fen,
    orientation,
    turnColor: turn,
    lastMove: entry.uci ? [entry.uci.slice(0, 2), entry.uci.slice(2, 4)] : undefined,
    check: chess.inCheck() ? turn : false,
    draggable: { deleteOnDropOff: false },
    movable: {
      free: false,
      color: canMove ? turn : undefined,
      dests: canMove ? toDests(chess) : new Map(),
    },
  });
  drawShapes();
}

function badgeSvg(cls) {
  const c = CLASSES[cls];
  const glyph = c.glyph === '👍' ? '✓' : c.glyph;
  const size = glyph.length > 1 ? 52 : 64;
  return `<g transform="translate(66 -6)">
    <circle cx="20" cy="20" r="20" fill="${c.color}" stroke="#fff" stroke-width="3"/>
    <text x="20" y="21" text-anchor="middle" dominant-baseline="central" fill="#fff"
      font-family="system-ui, sans-serif" font-weight="800" font-size="${size / 2}">${glyph}</text>
  </g>`;
}

function drawShapes() {
  if (editing) return ground.setAutoShapes([]);
  const shapes = [];
  const entry = shown();
  if (entry.result) {
    shapes.push({ orig: entry.uci.slice(2, 4), customSvg: { html: badgeSvg(entry.result.cls) } });
    // While reviewing, show what should have been played instead.
    if (reviewing && !entry.result.isTop) {
      const best = entry.result.bestUci;
      shapes.push({ orig: best.slice(0, 2), dest: best.slice(2, 4), brush: 'best', modifiers: { lineWidth: 12 } });
    }
  }
  if (!reviewing && hintsVisible && entry.candidates && !isBotTurn()) {
    entry.candidates.forEach((c, i) => {
      if (hoveredHint !== null && hoveredHint !== i) return;
      shapes.push({
        orig: c.uci.slice(0, 2),
        dest: c.uci.slice(2, 4),
        brush: c.cls,
        modifiers: { lineWidth: i === 0 || hoveredHint === i ? 12 : 7 },
      });
    });
  }
  ground.setAutoShapes(shapes);
}

// ---------- analysis ----------
function getAnalysis(fen, depth = settings.depth) {
  const key = `${depth}|${fen}`;
  if (!analyses.has(key)) {
    const p = analyst
      .analyze(fen, {
        depth,
        multipv: settings.multipv,
        onInfo: (info, f) => {
          if (!reviewing && f === current().fen) {
            liveInfo = info;
            renderEval();
            renderStatus();
          }
        },
      })
      .then((a) => {
        if (!a) analyses.delete(key); // dropped; allow a fresh request later
        return a;
      });
    analyses.set(key, p);
  }
  return analyses.get(key);
}

function terminalOf(fen) {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) return 'mate';
  if (chess.isGameOver()) return 'draw';
  return null;
}

async function analyzeCurrent() {
  const entry = current();
  liveInfo = null;
  analyst.prune((fen) => history.some((h) => h.fen === fen));
  if (terminalOf(entry.fen)) {
    renderAll();
    return;
  }
  const a = await getAnalysis(entry.fen);
  if (!a || current() !== entry) return;
  entry.analysis = a;
  entry.candidates = classifyCandidates(entry.fen, a).map((c, i) => ({
    ...c,
    reasons: explainMove(entry.fen, c.line, { max: i === 0 ? 3 : 2 }),
  }));
  renderAll();
}

async function gradeMove(entry, depth = settings.depth) {
  const idx = history.indexOf(entry);
  const prev = history[idx - 1];
  const before = await getAnalysis(prev.fen, depth);
  if (!before || !history.includes(entry)) return;
  let after;
  const term = terminalOf(entry.fen);
  if (term) after = { terminal: term };
  else if (!before.lines.some((l) => l.pv[0] === entry.uci)) {
    after = await getAnalysis(entry.fen, depth);
    if (!after || !history.includes(entry)) return;
  }
  // Never let a shallower grade overwrite a deeper one (e.g. after a deep review).
  if ((entry.resultDepth ?? 0) > depth) return;
  entry.resultDepth = depth;
  const r = classifyMove(prev.fen, entry.uci, before, after);
  r.isTop = ['brilliant', 'great', 'best', 'forced'].includes(r.cls) || r.bestUci === entry.uci;

  // The played move as an engine line: from `before` if it was a candidate,
  // otherwise the move followed by the best line of the resulting position.
  const reply = after?.lines?.[0];
  const own = before.lines.find((l) => l.pv[0] === entry.uci) ??
    (reply
      ? { pv: [entry.uci, ...reply.pv], cp: reply.cp === undefined ? undefined : -reply.cp, mate: reply.mate === undefined ? undefined : -reply.mate }
      : { pv: [entry.uci] });
  r.reasons = explainMove(prev.fen, own);
  if (!r.isTop) r.bestReasons = explainMove(prev.fen, before.lines[0], { max: 2 });
  if (['inaccuracy', 'mistake', 'blunder'].includes(r.cls) && own.pv.length > 1) {
    const refute = replyLine(own);
    r.refutationSan = uciToSan(entry.fen, refute.pv[0]);
    r.refutation = explainMove(entry.fen, refute, { max: 2 }).filter((t) => !t.startsWith('Đối phương nên đáp'));
  }
  entry.result = r;
  renderAll();
}

// ---------- moves ----------
function onBoardMove(orig, dest) {
  if (editing) return onEditorChange();
  const chess = new Chess(current().fen);
  const piece = chess.get(orig);
  const promoting = piece?.type === 'p' && (dest[1] === '8' || dest[1] === '1');
  if (promoting) askPromotion(piece.color, (role) => playMove(orig + dest + role));
  else playMove(orig + dest);
}

function playMove(uci) {
  const chess = new Chess(current().fen);
  const no = chess.moveNumber();
  let move;
  try {
    move = chess.move(uciToMove(uci));
  } catch {
    syncBoard();
    return;
  }
  const entry = { fen: chess.fen(), uci, san: move.san, color: move.color, no };
  history.push(entry);
  hoveredHint = null;
  hintsVisible = settings.autoHint;
  syncBoard();
  renderAll();
  gradeMove(entry);
  analyzeCurrent();
  if (isBotTurn() && !chess.isGameOver()) botMove();
}

async function botMove() {
  const entry = current();
  await bot.setOption('Skill Level', settings.skill);
  const a = await bot.analyze(entry.fen, { movetime: 300 + settings.skill * 40 });
  if (!a || reviewing || editing || current() !== entry || !isBotTurn()) return;
  playMove(a.bestmove);
}

function askPromotion(color, done) {
  const el = $('promo');
  const pieces = color === 'w' ? ['♕', '♖', '♗', '♘'] : ['♛', '♜', '♝', '♞'];
  el.innerHTML = '';
  ['q', 'r', 'b', 'n'].forEach((role, i) => {
    const b = document.createElement('button');
    b.textContent = pieces[i];
    b.onclick = () => {
      el.hidden = true;
      done(role);
    };
    el.appendChild(b);
  });
  const cancel = document.createElement('button');
  cancel.textContent = '✕';
  cancel.className = 'cancel';
  cancel.onclick = () => {
    el.hidden = true;
    syncBoard();
  };
  el.appendChild(cancel);
  el.hidden = false;
}

function undo() {
  if (history.length <= 1) return;
  bot.stopAll();
  history.pop();
  // In bot mode, take back to the player's own turn.
  if (settings.mode === 'bot' && history.length > 1 && isBotTurn()) history.pop();
  if (settings.mode === 'bot' && history.length === 1 && isBotTurn()) {
    restart();
    return;
  }
  hoveredHint = null;
  hintsVisible = settings.autoHint;
  syncBoard();
  renderAll();
  analyzeCurrent();
}

function restart() {
  bot.stopAll();
  history = [{ fen: startFen, uci: null, san: null }];
  orientation = settings.mode === 'bot' ? settings.color : orientation;
  hoveredHint = null;
  hintsVisible = settings.autoHint;
  syncBoard();
  renderAll();
  analyzeCurrent();
  if (isBotTurn()) botMove();
}

// ---------- rendering ----------
function renderAll() {
  renderStatus();
  renderEval();
  renderFeedback();
  renderHints();
  renderMoves();
  renderAccuracy();
  renderReview();
  drawShapes();
}

function renderStatus() {
  if (reviewing) {
    $('status').textContent = `Phân tích ván · nước ${reviewIdx}/${history.length - 1}`;
    return;
  }
  const chess = new Chess(current().fen);
  let text;
  if (chess.isCheckmate()) text = `Chiếu hết! ${chess.turn() === 'w' ? 'Đen' : 'Trắng'} thắng`;
  else if (chess.isStalemate()) text = 'Hòa — hết nước đi (stalemate)';
  else if (chess.isThreefoldRepetition()) text = 'Hòa — lặp lại 3 lần';
  else if (chess.isInsufficientMaterial()) text = 'Hòa — không đủ quân chiếu hết';
  else if (chess.isDraw()) text = 'Hòa — luật 50 nước';
  else {
    const side = chess.turn() === 'w' ? 'Trắng' : 'Đen';
    const thinking = isBotTurn() ? ' · Máy đang nghĩ…' : '';
    const depth = current().analysis
      ? ` · độ sâu ${current().analysis.depth}`
      : liveInfo
        ? ` · đang phân tích (độ sâu ${liveInfo.depth})`
        : ' · đang phân tích…';
    text = `Lượt ${side}${thinking}${depth}`;
  }
  $('status').textContent = text;
}

function renderEval() {
  const bar = $('evalBar');
  bar.hidden = !settings.evalBar;
  const entry = shown();
  const chess = new Chess(entry.fen);
  const turn = chess.turn();
  let whiteWin = 50;
  let text = '0.0';
  if (chess.isCheckmate()) {
    whiteWin = turn === 'w' ? 0 : 100;
    text = turn === 'w' ? '0-1' : '1-0';
  } else if (chess.isGameOver()) {
    text = '½-½';
  } else {
    const line = entry.analysis?.lines[0] ?? (reviewing ? null : liveInfo);
    if (line) {
      const w = winPct(line);
      whiteWin = turn === 'w' ? w : 100 - w;
      text = formatScore(line, true, turn).replace(/^\+/, '');
    }
  }
  $('evalFill').style.height = `${whiteWin}%`;
  bar.classList.toggle('flipped', orientation === 'black');
  bar.classList.toggle('black-ahead', whiteWin < 50);
  $('evalText').textContent = text;
}

function badgeHtml(cls, withLabel = false) {
  const c = CLASSES[cls];
  return `<span class="badge" style="--c:${c.color}" title="${c.label} (${c.en})">${c.glyph}</span>${
    withLabel ? `<span class="badge-label" style="color:${c.color}">${c.label}</span>` : ''
  }`;
}

function uciToSan(fen, uci) {
  try {
    return new Chess(fen).move(uciToMove(uci)).san;
  } catch {
    return uci;
  }
}

function pvToSan(fen, pv, max = 6) {
  const chess = new Chess(fen);
  const out = [];
  for (const uci of pv.slice(0, max)) {
    try {
      const m = chess.move(uciToMove(uci));
      out.push(m.san);
    } catch {
      break;
    }
  }
  return out.join(' ');
}

function renderFeedback() {
  const el = $('feedback');
  const entry = shown();
  const idx = history.indexOf(entry);
  if (idx === 0 && reviewing) {
    el.innerHTML = `<div class="muted">Thế cờ ban đầu. Bấm ▶ (hoặc phím →) để xem từng nước.</div>`;
    return;
  }
  if (idx === 0) {
    el.innerHTML = `<div class="muted">Đi một nước để được chấm điểm. Bấm vào một nước gợi ý để đi luôn; bấm <b>✏️ Xếp cờ</b> để tự tạo thế cờ.</div>`;
    return;
  }
  if (!entry.result) {
    el.innerHTML = `<div class="fb-move">${moveNo(entry)} ${entry.san}</div><div class="muted">Đang chấm điểm…</div>`;
    return;
  }
  const r = entry.result;
  const c = CLASSES[r.cls];
  const prevFen = history[idx - 1].fen;
  const bestSan = uciToSan(prevFen, r.bestUci);
  const who = entry.color === 'w' ? 'Trắng' : 'Đen';
  const explain = {
    brilliant: 'Hy sinh quân đầy chính xác — đúng chất thiên tài!',
    great: 'Nước duy nhất giữ được thế cờ — các nước khác đều kém hẳn.',
    best: 'Đúng nước mà Stockfish chọn.',
    forced: 'Chỉ có một nước hợp lệ.',
    excellent: 'Gần như ngang nước tốt nhất.',
    good: 'Nước ổn, nhưng còn nước mạnh hơn.',
    inaccuracy: 'Mất một chút lợi thế.',
    mistake: 'Mất lợi thế đáng kể.',
    blunder: 'Sai lầm nghiêm trọng, thế cờ thay đổi lớn.',
  }[r.cls];
  el.innerHTML = `
    <div class="fb-head" style="--c:${c.color}">
      ${badgeHtml(r.cls)}
      <div>
        <div class="fb-title"><b>${entry.san}</b> là nước <span style="color:${c.color}">${c.label}</span></div>
        <div class="muted small">${who} · ${moveNo(entry)} · tỉ lệ thắng ${r.winBefore.toFixed(0)}% → ${r.winAfter.toFixed(0)}%</div>
      </div>
    </div>
    <div class="fb-body">${explain}</div>
    ${
      r.refutation
        ? `<div class="why-block"><div class="why-title">Vì sao chưa tốt?</div>
           <div class="why"><div>Đối phương có thể đáp <b>${r.refutationSan}</b></div>${whyHtml(r.refutation)}</div></div>`
        : r.reasons?.length && r.cls !== 'forced'
          ? `<div class="why-block"><div class="why-title">Vì sao nước này hay?</div><div class="why">${whyHtml(r.reasons)}</div></div>`
          : ''
    }
    ${
      r.isTop
        ? ''
        : `<div class="why-block"><div class="why-title">Nước tốt nhất: <b class="best-san">${bestSan}</b></div>
           <div class="why">${whyHtml(r.bestReasons ?? [])}</div></div>`
    }`;
}

function whyHtml(reasons) {
  return reasons.map((t) => `<div>${t}</div>`).join('');
}

function moveNo(entry) {
  return entry.color === 'w' ? `${entry.no}.` : `${entry.no}...`;
}

function renderHints() {
  const card = $('hintCard');
  const entry = current();
  const over = new Chess(entry.fen).isGameOver();
  card.hidden = reviewing || !hintsVisible || over || isBotTurn();
  $('btnHint').classList.toggle('active', hintsVisible);
  if (card.hidden) return;
  const list = $('hints');
  if (!entry.candidates) {
    $('hintDepth').textContent = '';
    list.innerHTML = `<li class="muted">Stockfish đang tính${liveInfo ? ` (độ sâu ${liveInfo.depth})` : ''}…</li>`;
    return;
  }
  $('hintDepth').textContent = `· độ sâu ${entry.analysis.depth}`;
  const turn = new Chess(entry.fen).turn();
  list.innerHTML = entry.candidates
    .map((c, i) => {
      const cls = CLASSES[c.cls];
      return `<li data-i="${i}" style="--c:${cls.color}">
        ${badgeHtml(c.cls)}
        <div class="hint-main">
          <div><b class="hint-san">${uciToSan(entry.fen, c.uci)}</b>
            <span class="hint-label" style="color:${cls.color}">${cls.label}</span></div>
          <div class="why">${whyHtml(c.reasons)}</div>
          <div class="pv muted small">Biến: ${pvToSan(entry.fen, c.line.pv)}</div>
        </div>
        <span class="score">${formatScore(c.line, true, turn)}</span>
      </li>`;
    })
    .join('');
}

function renderMoves() {
  const el = $('moves');
  const cell = (e) => {
    if (!e) return '<span class="muted">…</span>';
    const ply = history.indexOf(e);
    const cur = reviewing && ply === reviewIdx ? ' cur' : '';
    return `<span class="mv${cur}" data-ply="${ply}" title="Xem lại nước này">${e.san}${
      e.result ? badgeHtml(e.result.cls) : '<span class="pending">…</span>'
    }</span>`;
  };
  // Group plies into numbered rows; a game set up with Black to move starts with "1. …".
  const rows = [];
  for (const e of history.slice(1)) {
    const last = rows[rows.length - 1];
    if (e.color === 'b' && last && !last.b && last.no === e.no) last.b = e;
    else rows.push({ no: e.no, [e.color]: e });
  }
  el.innerHTML =
    rows
      .map((r) => `<div class="row"><span class="no">${r.no}.</span>${cell(r.w)}${r.b ? cell(r.b) : r.w ? '<span></span>' : cell(null)}</div>`)
      .join('') || '<div class="muted small">Chưa có nước đi.</div>';
  const cur = el.querySelector('.mv.cur');
  if (cur) el.scrollTop = cur.offsetTop - el.offsetTop - el.clientHeight / 2;
  else if (!reviewing) el.scrollTop = el.scrollHeight;
}

function accuracyOf(color) {
  const moves = history.filter((h) => h.color === color && h.result && h.result.cls !== 'forced');
  if (!moves.length) return null;
  return moves.reduce((s, h) => s + moveAccuracy(h.result.loss), 0) / moves.length;
}

function renderAccuracy() {
  for (const color of ['w', 'b']) {
    const acc = accuracyOf(color);
    $(color === 'w' ? 'accW' : 'accB').textContent = acc === null ? '–' : `${acc.toFixed(1)}%`;
  }
}

// ---------- controls ----------
$('btnHint').onclick = toggleHints;
$('btnUndo').onclick = undo;
$('btnNew').onclick = () => {
  startFen = DEFAULT_POSITION;
  restart();
};
$('btnEdit').onclick = enterEditor;
$('btnFlip').onclick = flip;

function toggleHints() {
  hintsVisible = !hintsVisible;
  hoveredHint = null;
  renderHints();
  drawShapes();
}
function flip() {
  orientation = orientation === 'white' ? 'black' : 'white';
  ground.set({ orientation });
  renderEval();
}

$('hints').addEventListener('mouseover', (e) => {
  const li = e.target.closest('li[data-i]');
  const i = li ? +li.dataset.i : null;
  if (i !== hoveredHint) {
    hoveredHint = i;
    drawShapes();
  }
});
$('hints').addEventListener('mouseleave', () => {
  hoveredHint = null;
  drawShapes();
});
$('hints').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-i]');
  const c = li && current().candidates?.[+li.dataset.i];
  if (c && !isBotTurn()) playMove(c.uci);
});

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea') || editing) return;
  if (reviewing) {
    const keys = { ArrowLeft: reviewIdx - 1, ArrowRight: reviewIdx + 1, Home: 0, End: history.length - 1 };
    if (e.key in keys) {
      e.preventDefault();
      gotoPly(keys[e.key]);
    } else if (e.key === 'Escape') exitReview();
    else if (e.key === 'f' || e.key === 'F') flip();
    return;
  }
  if (e.key === 'h' || e.key === 'H') toggleHints();
  else if (e.key === 'ArrowLeft') undo();
  else if (e.key === 'f' || e.key === 'F') flip();
});

function bindSettings() {
  const sync = () => {
    $('setMode').value = settings.mode;
    $('setColor').value = settings.color;
    $('setSkill').value = settings.skill;
    $('skillVal').textContent = `${settings.skill}/20`;
    $('setDepth').value = settings.depth;
    $('depthVal').textContent = settings.depth;
    $('setMultipv').value = settings.multipv;
    $('setAutoHint').checked = settings.autoHint;
    $('setEvalBar').checked = settings.evalBar;
    document.body.classList.toggle('mode-bot', settings.mode === 'bot');
  };
  sync();

  const on = (id, ev, fn) =>
    $(id).addEventListener(ev, (e) => {
      fn(e.target);
      saveSettings();
      sync();
    });

  on('setMode', 'change', (t) => {
    settings.mode = t.value;
    orientation = settings.mode === 'bot' ? settings.color : 'white';
    restart();
  });
  on('setColor', 'change', (t) => {
    settings.color = t.value;
    if (settings.mode === 'bot') restart();
  });
  on('setSkill', 'input', (t) => (settings.skill = +t.value));
  const reanalyze = () => {
    analyst.stopAll();
    analyses.clear();
    for (const h of history) {
      delete h.analysis;
      delete h.candidates;
      delete h.result;
      delete h.resultDepth;
    }
    renderAll();
    analyzeCurrent();
    history.slice(1).forEach(gradeMove);
  };
  on('setDepth', 'change', (t) => {
    settings.depth = +t.value;
    reanalyze();
  });
  $('setDepth').addEventListener('input', (e) => ($('depthVal').textContent = e.target.value));
  on('setMultipv', 'change', (t) => {
    settings.multipv = +t.value;
    reanalyze();
  });
  on('setAutoHint', 'change', (t) => {
    settings.autoHint = t.checked;
    hintsVisible = t.checked;
    renderHints();
    drawShapes();
  });
  on('setEvalBar', 'change', (t) => {
    settings.evalBar = t.checked;
    renderEval();
  });
}


// ---------- position editor ----------
const ROLES = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'];
const ROLE_VI = { king: 'Vua', queen: 'Hậu', rook: 'Xe', bishop: 'Tượng', knight: 'Mã', pawn: 'Tốt' };

function buildPalette() {
  const el = $('palette');
  el.innerHTML = '';
  for (const color of ['white', 'black']) {
    const tools = [color === 'white' ? null : 'trash', ...ROLES.map((role) => ({ role, color }))];
    for (const tool of tools) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tool';
      b.tool = tool;
      if (tool === null) {
        b.textContent = '✋';
        b.title = 'Kéo quân trên bàn cờ';
      } else if (tool === 'trash') {
        b.textContent = '🗑';
        b.title = 'Xóa quân (bấm vào ô)';
      } else {
        b.innerHTML = `<piece class="${tool.color} ${tool.role}"></piece>`;
        b.title = `${ROLE_VI[tool.role]} ${tool.color === 'white' ? 'trắng' : 'đen'}`;
        const drag = (e) => ground.dragNewPiece({ ...tool }, e, true);
        b.addEventListener('mousedown', drag);
        b.addEventListener('touchstart', drag, { passive: true });
      }
      b.addEventListener('click', () => {
        editTool = tool;
        renderPalette();
      });
      el.appendChild(b);
    }
  }
}

function renderPalette() {
  for (const b of $('palette').children) b.classList.toggle('active', b.tool === editTool);
}

function editorFen() {
  const pieces = ground.state.pieces;
  const at = (k, role, color) => {
    const p = pieces.get(k);
    return !!p && p.role === role && p.color === color;
  };
  let castling = '';
  if (at('e1', 'king', 'white')) {
    if (at('h1', 'rook', 'white')) castling += 'K';
    if (at('a1', 'rook', 'white')) castling += 'Q';
  }
  if (at('e8', 'king', 'black')) {
    if (at('h8', 'rook', 'black')) castling += 'k';
    if (at('a8', 'rook', 'black')) castling += 'q';
  }
  return `${ground.getFen()} ${$('editTurn').value} ${castling || '-'} - 0 1`;
}

function positionError(fen) {
  const pieces = [...ground.state.pieces.entries()];
  const count = (role, color) => pieces.filter(([, p]) => p.role === role && p.color === color).length;
  if (count('king', 'white') !== 1 || count('king', 'black') !== 1) return 'Mỗi bên phải có đúng 1 Vua.';
  if (pieces.some(([k, p]) => p.role === 'pawn' && (k[1] === '1' || k[1] === '8')))
    return 'Tốt không được đứng ở hàng 1 hoặc hàng 8.';
  if (count('pawn', 'white') > 8 || count('pawn', 'black') > 8) return 'Mỗi bên chỉ có tối đa 8 quân Tốt.';
  const v = validateFen(fen);
  if (!v.ok) return `Thế cờ không hợp lệ: ${v.error}`;
  const [board, turn, ...rest] = fen.split(' ');
  try {
    if (new Chess([board, turn === 'w' ? 'b' : 'w', ...rest].join(' ')).inCheck()) {
      const other = turn === 'w' ? 'Đen' : 'Trắng';
      return `${other} đang bị chiếu dù không tới lượt — đổi bên đi tiếp hoặc sửa lại thế cờ.`;
    }
  } catch {
    /* fall through: chess.js will reject it on load if it is really broken */
  }
  return null;
}

function syncFenInput() {
  $('editFen').value = editorFen();
  $('editError').textContent = '';
}

// With a palette tool active, clicks on the board place/remove pieces directly.
// Captured before chessground sees them so it doesn't also select or move a piece.
function onEditorPointer(e) {
  if (!editing || editTool === null) return;
  const pt = e.touches ? e.touches[0] : e;
  const key = ground.getKeyAtDomPos([pt.clientX, pt.clientY]);
  if (!key) return;
  e.stopPropagation();
  e.preventDefault();
  const cur = ground.state.pieces.get(key);
  const same = editTool !== 'trash' && cur?.role === editTool.role && cur?.color === editTool.color;
  const piece = editTool === 'trash' || same ? undefined : { ...editTool };
  ground.setPieces(new Map([[key, piece]]));
  syncFenInput();
}
$('board').addEventListener('mousedown', onEditorPointer, { capture: true });
$('board').addEventListener('touchstart', onEditorPointer, { capture: true, passive: false });

function onEditorChange() {
  if (editing) syncFenInput();
}

function enterEditor() {
  editing = true;
  analyst.stopAll();
  bot.stopAll();
  editTool = null;
  const fen = current().fen;
  document.body.classList.add('editing');
  $('editTurn').value = fen.split(' ')[1];
  ground.set({
    fen,
    lastMove: undefined,
    check: false,
    movable: { free: true, color: 'both', dests: new Map() },
    draggable: { deleteOnDropOff: true },
  });
  ground.setAutoShapes([]);
  buildPalette();
  renderPalette();
  syncFenInput();
  $('status').textContent = 'Đang xếp thế cờ';
}

function exitEditor() {
  editing = false;
  editTool = null;
  document.body.classList.remove('editing');
}

function finishEditor() {
  const fen = editorFen();
  const err = positionError(fen);
  if (err) {
    $('editError').textContent = err;
    return;
  }
  startFen = new Chess(fen).fen();
  exitEditor();
  restart();
  hintsVisible = true;
  renderHints();
  drawShapes();
}

function cancelEditor() {
  exitEditor();
  syncBoard();
  renderAll();
  analyzeCurrent();
  if (isBotTurn()) botMove();
}

$('editDone').onclick = finishEditor;
$('editCancel').onclick = cancelEditor;
$('editFlip').onclick = flip;
$('editTurn').onchange = syncFenInput;
$('editEmpty').onclick = () => {
  ground.set({ fen: '8/8/8/8/8/8/8/8' });
  syncFenInput();
};
$('editStart').onclick = () => {
  ground.set({ fen: DEFAULT_POSITION.split(' ')[0] });
  $('editTurn').value = 'w';
  syncFenInput();
};
$('editFen').addEventListener('change', () => {
  const [board, turn] = $('editFen').value.trim().split(/\s+/);
  if (board) ground.set({ fen: board });
  if (turn === 'w' || turn === 'b') $('editTurn').value = turn;
  syncFenInput();
});

// ---------- game review ----------
const REVIEW_CLASSES = ['brilliant', 'great', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder'];
const GRAPH_MARKS = new Set(['brilliant', 'great', 'mistake', 'blunder']);

function enterReview(ply = history.length - 1) {
  if (editing) return;
  bot.stopAll();
  reviewing = true;
  reviewIdx = Math.max(0, Math.min(ply, history.length - 1));
  document.body.classList.add('reviewing');
  $('pgnError').textContent = '';
  syncBoard();
  renderAll();
  if (history.length > 1) runReview(settings.depth);
}

function exitReview() {
  reviewing = false;
  document.body.classList.remove('reviewing');
  hoveredHint = null;
  hintsVisible = settings.autoHint;
  syncBoard();
  renderAll();
  analyzeCurrent();
  if (isBotTurn() && !new Chess(current().fen).isGameOver()) botMove();
}

function continueFromHere() {
  history = history.slice(0, reviewIdx + 1);
  exitReview();
}

function gotoPly(ply) {
  const next = Math.max(0, Math.min(ply, history.length - 1));
  if (next === reviewIdx) return;
  reviewIdx = next;
  syncBoard();
  renderAll();
}

/** Analyse every position of the game at `depth`, then (re)grade every move. */
async function runReview(depth) {
  const run = ++reviewRun;
  const items = history.slice();
  let done = 0;
  reviewProgress = { done, total: items.length, depth };
  renderReview();
  await Promise.all(
    items.map(async (h) => {
      if (!terminalOf(h.fen)) {
        const a = await getAnalysis(h.fen, depth);
        if (a && (!h.analysis || a.depth >= h.analysis.depth)) h.analysis = a;
      }
      if (run !== reviewRun) return;
      reviewProgress.done = ++done;
      renderReview();
      if (h === shown()) renderEval();
    }),
  );
  await Promise.all(items.slice(1).map((h) => gradeMove(h, depth)));
  if (run !== reviewRun) return;
  reviewProgress = null;
  renderAll();
}

function whiteWinAt(h) {
  const term = terminalOf(h.fen);
  const turn = h.fen.split(' ')[1];
  if (term === 'mate') return turn === 'w' ? 0 : 100;
  if (term === 'draw') return 50;
  const line = h.analysis?.lines[0];
  if (!line) return null;
  const w = winPct(line);
  return turn === 'w' ? w : 100 - w;
}

function renderGraph() {
  const W = 400;
  const H = 100;
  const n = history.length - 1;
  const x = (i) => (n ? (i / n) * W : W / 2);
  let last = 50;
  const pts = history.map((h, i) => {
    const v = whiteWinAt(h);
    if (v !== null) last = v;
    return [x(i), H - (last / 100) * H];
  });
  const area = `M0,${H} L0,${pts[0][1]} ${pts.map(([px, py]) => `L${px.toFixed(1)},${py.toFixed(1)}`).join(' ')} L${W},${pts[pts.length - 1][1]} L${W},${H} Z`;
  const marks = history
    .map((h, i) => (h.result && GRAPH_MARKS.has(h.result.cls) ? { i, cls: h.result.cls } : null))
    .filter(Boolean)
    .map(({ i, cls }) => `<circle cx="${x(i)}" cy="${pts[i][1]}" r="4" fill="${CLASSES[cls].color}" stroke="#1f1d1b" stroke-width="1.5"/>`)
    .join('');
  $('evalGraph').innerHTML = `
    <rect width="${W}" height="${H}" fill="#403d39"/>
    <path d="${area}" fill="#f0eee9"/>
    <line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" stroke="#8a8784" stroke-dasharray="3 3" stroke-width="1"/>
    <line x1="${x(reviewIdx)}" x2="${x(reviewIdx)}" y1="0" y2="${H}" stroke="#81b64c" stroke-width="2"/>
    ${marks}`;
}

function renderSummary() {
  const count = (cls, color) => history.filter((h) => h.color === color && h.result?.cls === cls).length;
  const acc = (c) => {
    const a = accuracyOf(c);
    return a === null ? '–' : a.toFixed(1);
  };
  const rows = REVIEW_CLASSES.map((cls) => {
    const c = CLASSES[cls];
    const td = (color) => {
      const k = count(cls, color);
      return `<td class="num${k ? ' jump' : ''}" style="color:${k ? c.color : 'var(--muted)'}" data-cls="${cls}" data-color="${color}">${k}</td>`;
    };
    return `<tr><td>${badgeHtml(cls)} ${c.label}</td>${td('w')}${td('b')}</tr>`;
  }).join('');
  $('reviewSummary').innerHTML = `
    <thead><tr><th></th><th>Trắng</th><th>Đen</th></tr></thead>
    <tbody>
      <tr class="acc-row"><td>Độ chính xác</td><td class="num">${acc('w')}</td><td class="num">${acc('b')}</td></tr>
      ${rows}
    </tbody>`;
}

function renderReview() {
  if (!reviewing) return;
  const p = reviewProgress;
  $('reviewProgress').hidden = !p;
  if (p) {
    $('reviewBar').style.width = `${(p.done / p.total) * 100}%`;
    $('reviewProgressText').textContent =
      p.done < p.total ? `Đang phân tích ${p.done}/${p.total} thế cờ (độ sâu ${p.depth})…` : 'Đang chấm điểm các nước…';
  }
  const entry = shown();
  $('reviewPly').textContent = reviewIdx === 0 ? 'Bắt đầu' : `${moveNo(entry)} ${entry.san}`;
  $('revFirst').disabled = $('revPrev').disabled = reviewIdx === 0;
  $('revLast').disabled = $('revNext').disabled = reviewIdx === history.length - 1;
  const deeper = Math.min(settings.depth + 4, 24);
  $('reviewDeep').textContent = `🔬 Phân tích sâu hơn (độ sâu ${deeper})`;
  $('reviewDeep').disabled = !!p || history.length < 2;
  $('reviewEmpty').hidden = history.length > 1;
  $('reviewBody').hidden = history.length < 2;
  if (history.length > 1) {
    renderGraph();
    renderSummary();
  }
}

function loadPgn(text) {
  const game = new Chess();
  try {
    game.loadPgn(text.trim());
  } catch (err) {
    return `Không đọc được PGN: ${err.message}`;
  }
  const moves = game.history({ verbose: true });
  if (!moves.length) return 'PGN không có nước đi nào.';
  bot.stopAll();
  startFen = moves[0].before;
  history = [{ fen: startFen, uci: null, san: null }];
  for (const m of moves) {
    history.push({
      fen: m.after,
      uci: m.from + m.to + (m.promotion ?? ''),
      san: m.san,
      color: m.color,
      no: +m.before.split(' ')[5],
    });
  }
  analyst.prune((fen) => history.some((h) => h.fen === fen));
  reviewing = false;
  enterReview(0);
  return null;
}

function exportPgn() {
  const game = new Chess(history[0].fen);
  for (const h of history.slice(1)) game.move(uciToMove(h.uci));
  return game.pgn();
}

$('btnReview').onclick = () => enterReview();
$('reviewExit').onclick = exitReview;
$('reviewContinue').onclick = continueFromHere;
$('reviewDeep').onclick = () => runReview(Math.min(settings.depth + 4, 24));
$('revFirst').onclick = () => gotoPly(0);
$('revPrev').onclick = () => gotoPly(reviewIdx - 1);
$('revNext').onclick = () => gotoPly(reviewIdx + 1);
$('revLast').onclick = () => gotoPly(history.length - 1);
$('revFlip').onclick = flip;
$('evalGraph').addEventListener('click', (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  gotoPly(Math.round(((e.clientX - r.left) / r.width) * (history.length - 1)));
});
$('reviewSummary').addEventListener('click', (e) => {
  const td = e.target.closest('td.jump');
  if (!td) return;
  // Jump to the next move of this class by this side (wrapping around).
  const plies = history
    .map((h, i) => (h.color === td.dataset.color && h.result?.cls === td.dataset.cls ? i : -1))
    .filter((i) => i > 0);
  gotoPly(plies.find((i) => i > reviewIdx) ?? plies[0]);
});
$('moves').addEventListener('click', (e) => {
  const mv = e.target.closest('[data-ply]');
  if (!mv || editing) return;
  if (reviewing) gotoPly(+mv.dataset.ply);
  else enterReview(+mv.dataset.ply);
});
$('pgnLoad').onclick = () => {
  const err = loadPgn($('pgnText').value);
  $('pgnError').textContent = err ?? '';
};
$('pgnCopy').onclick = async () => {
  const pgn = exportPgn();
  try {
    await navigator.clipboard.writeText(pgn);
    $('pgnCopy').textContent = '✓ Đã sao chép';
    setTimeout(() => ($('pgnCopy').textContent = 'Sao chép PGN ván này'), 1500);
  } catch {
    $('pgnText').value = pgn;
  }
};

bindSettings();
restart();
