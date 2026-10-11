import { Chess } from 'chess.js';
import { VALUE, sacrificedMaterial, uciToMove } from './classify.js';

// Rule-based "why this move" explanations, in Vietnamese.
// Each detector looks at the position before/after the move (and the engine's
// principal variation) and contributes reasons with a weight; the strongest win.

const NAME = { p: 'Tốt', n: 'Mã', b: 'Tượng', r: 'Xe', q: 'Hậu', k: 'Vua' };
const SIDE = { w: 'Trắng', b: 'Đen' };
const FILES = 'abcdefgh';
const DIRS = {
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
};
DIRS.q = [...DIRS.b, ...DIRS.r];

const other = (c) => (c === 'w' ? 'b' : 'w');
const piece = (p, sq) => `${NAME[p.type]} ở ${sq}`;

function pieces(chess, color) {
  const out = [];
  for (const row of chess.board()) for (const sq of row) if (sq && (!color || sq.color === color)) out.push(sq);
  return out;
}

function material(chess, color) {
  return pieces(chess, color).reduce((s, p) => s + VALUE[p.type], 0);
}

/** Can `color` win the piece on `sq` (undefended, or attacked by something cheaper)? */
function isHanging(chess, sq) {
  const p = chess.get(sq);
  if (!p || p.type === 'k') return false;
  const attackers = chess.attackers(sq, other(p.color));
  if (attackers.length === 0) return false;
  const defended = chess.attackers(sq, p.color).length > 0;
  const values = attackers
    .map((a) => chess.get(a).type)
    .filter((t) => !(defended && t === 'k'))
    .map((t) => VALUE[t]);
  if (values.length === 0) return false;
  return !defended || Math.min(...values) < VALUE[p.type];
}

/** Opponent pieces the piece on `from` attacks. */
function targetsOf(chess, from) {
  const me = chess.get(from).color;
  return pieces(chess, other(me)).filter((t) => chess.attackers(t.square, me).includes(from));
}

function mobility(chess, from) {
  const me = chess.get(from)?.color;
  if (!me) return 0;
  let n = 0;
  for (const f of FILES) for (let r = 1; r <= 8; r++) if (chess.attackers(f + r, me).includes(from)) n++;
  return n;
}

/** Pins and skewers created by a slider standing on `sq`. */
function lineTactics(chess, sq) {
  const p = chess.get(sq);
  if (!DIRS[p.type]) return [];
  const out = [];
  for (const [df, dr] of DIRS[p.type]) {
    let f = FILES.indexOf(sq[0]);
    let r = +sq[1] - 1;
    const hits = [];
    while (hits.length < 2) {
      f += df;
      r += dr;
      if (f < 0 || f > 7 || r < 0 || r > 7) break;
      const s = FILES[f] + (r + 1);
      const q = chess.get(s);
      if (q) hits.push({ ...q, square: s });
      if (q && q.color === p.color) break;
    }
    if (hits.length < 2 || hits.some((h) => h.color === p.color)) continue;
    const [front, back] = hits;
    const worth = (x) => (x.type === 'k' ? 100 : VALUE[x.type]);
    if (front.type !== 'k' && worth(back) > worth(front) && front.type !== 'p') {
      out.push({
        kind: 'pin',
        front,
        back,
        w: back.type === 'k' ? 70 : 55,
        text: `Ghim ${piece(front, front.square)} vào ${NAME[back.type]} — quân này ${back.type === 'k' ? 'không được phép' : 'khó'} di chuyển`,
      });
    } else if (worth(front) > worth(back) && back.type !== 'p' && VALUE[back.type] >= 3) {
      out.push({
        kind: 'skewer',
        front,
        back,
        w: 65,
        text: `Đòn xiên: ${NAME[front.type]} phải tránh, để lộ ${piece(back, back.square)}`,
      });
    }
  }
  return out;
}

/** If the mover could move again right now, which move would mate? */
function mateThreat(chess) {
  const [board, turn, castling] = chess.fen().split(' ');
  let probe;
  try {
    probe = new Chess(`${board} ${other(turn)} ${castling} - 0 1`);
  } catch {
    return null;
  }
  if (probe.inCheck()) return null;
  for (const m of probe.moves({ verbose: true })) {
    probe.move(m);
    const mate = probe.isCheckmate();
    probe.undo();
    if (mate) return m.san;
  }
  return null;
}

function isPassed(chess, sq, color) {
  const f = FILES.indexOf(sq[0]);
  const r = +sq[1];
  const ahead = color === 'w' ? (rr) => rr > r : (rr) => rr < r;
  return !pieces(chess, other(color)).some(
    (p) => p.type === 'p' && Math.abs(FILES.indexOf(p.square[0]) - f) <= 1 && ahead(+p.square[1]),
  );
}

/** Material swing for the mover along the PV (even number of plies so exchanges finish). */
function pvMaterialGain(fen, pv) {
  const chess = new Chess(fen);
  const me = chess.turn();
  const start = material(chess, me) - material(chess, other(me));
  let best = null;
  for (let i = 0; i < Math.min(pv.length, 10); i++) {
    try {
      chess.move(uciToMove(pv[i]));
    } catch {
      break;
    }
    if (i % 2 === 1) best = material(chess, me) - material(chess, other(me)) - start;
  }
  return best ?? 0;
}

const CENTER_OUTPOSTS = new Set(['c4', 'd4', 'e4', 'f4', 'c5', 'd5', 'e5', 'f5']);
const centerDist = (sq) => Math.max(Math.abs(FILES.indexOf(sq[0]) - 3.5), Math.abs(+sq[1] - 4.5));

/** Squares a piece of `color` could reach if it were its turn (pseudo-legal enough for ideas). */
function movesFor(chess, color) {
  const [board, , castling] = chess.fen().split(' ');
  try {
    return new Chess(`${board} ${color} ${castling} - 0 1`).moves({ verbose: true });
  } catch {
    return [];
  }
}

/**
 * Analyse one move: why it is played (reasons, strongest first) and which
 * notable events happen (tags, used for the fun commentary).
 * @param {string} fen position before the move
 * @param {{pv: string[], cp?: number, mate?: number}} line engine line starting with the move
 * @param {{max?: number, shallow?: boolean}} opts shallow: skip look-ahead ideas (used for PV steps)
 */
// prevUci: the previous ply, only when it was a capture (to recognise recaptures).
export function describeMove(fen, line, { max = 3, shallow = false, prevUci = null } = {}) {
  const uci = line.pv[0];
  const before = new Chess(fen);
  const me = before.turn();
  const opp = other(me);
  const after = new Chess(fen);
  let move;
  try {
    move = after.move(uciToMove(uci));
  } catch {
    return { reasons: [], tags: new Set(), san: uci };
  }
  const { from, to } = move;
  const moved = after.get(to);
  const reasons = [];
  const tags = new Set();
  const add = (w, text) => reasons.push({ w, text });
  const myMat = material(before, me) - material(before, opp);
  const relRank = (sq) => (me === 'w' ? +sq[1] : 9 - +sq[1]);
  // Plain facts about the move, used to build the commentary sentences.
  const facts = {
    piece: move.piece,
    from,
    to,
    san: move.san,
    captured: move.captured ?? null,
    promotion: move.promotion ?? null,
    check: after.inCheck(),
    forward: relRank(to) > relRank(from),
    retreat: relRank(to) < relRank(from),
    lateral: from[1] === to[1] && Math.abs(FILES.indexOf(from[0]) - FILES.indexOf(to[0])) >= 3,
    ranks: Math.abs(+to[1] - +from[1]),
    targets: [],
    threat: null,
    pin: null,
    mateThreat: null,
    stoppedMate: null,
    followSan: null,
    followTags: new Set(),
    forcedTake: false,
    hanging: isHanging(after, to),
    inCheckBefore: before.inCheck(),
    protected: null,
  };

  // --- Game enders
  if (after.isCheckmate()) {
    add(100, 'Chiếu hết — kết thúc ván cờ!');
    tags.add('mate');
    const kSq = pieces(after, opp).find((p) => p.type === 'k').square;
    const ring = [];
    for (let df = -1; df <= 1; df++)
      for (let dr = -1; dr <= 1; dr++) {
        const f = FILES.indexOf(kSq[0]) + df;
        const r = +kSq[1] + dr;
        if ((df || dr) && f >= 0 && f < 8 && r >= 1 && r <= 8) ring.push(FILES[f] + r);
      }
    if (move.piece === 'n' && ring.every((q) => after.get(q)?.color === opp)) tags.add('smothered');
    if (['1', '8'].includes(kSq[1]) && 'rq'.includes(move.piece) && to[1] === kSq[1]) tags.add('backRank');
    if (move.piece === 'p') tags.add('pawnMate');
    if (move.isKingsideCastle() || move.isQueensideCastle()) tags.add('castleMate');
    if (before.moveNumber() <= 4 && move.piece === 'q') tags.add('scholarMate');
  } else if (after.isStalemate()) {
    tags.add('stalemate');
  } else if (line.mate > 0) {
    add(95, `Mở ra đòn chiếu hết sau ${line.mate} nước nếu đi chính xác`);
    if (line.mate <= 5) tags.add('matingNet');
  }

  if (move.isKingsideCastle() || move.isQueensideCastle()) {
    add(50, 'Nhập thành: đưa Vua vào chỗ an toàn và đưa Xe vào trận');
    tags.add(move.isKingsideCastle() ? 'castleShort' : 'castleLong');
  }
  if (move.promotion) {
    add(85, `Phong cấp Tốt thành ${NAME[move.promotion]}`);
    tags.add(move.promotion === 'q' ? 'promoteQueen' : 'underpromote');
  }

  // --- Captures
  if (move.captured) {
    const loose = !before.attackers(to, opp).length || !after.attackers(to, opp).length;
    const recapture = prevUci && prevUci.slice(2, 4) === to;
    if (recapture && !move.isEnPassant()) {
      add(50, `Ăn lại ${NAME[move.captured]}, giữ cân bằng vật chất`);
      tags.add('recapture');
    } else if (move.isEnPassant()) {
      add(40, 'Bắt Tốt qua đường');
      tags.add('enPassant');
    } else if (loose) {
      add(80, `Ăn không ${NAME[move.captured]} ở ${to} (quân không được bảo vệ)`);
      tags.add(move.captured === 'q' ? 'freeQueen' : 'freePiece');
    } else if (VALUE[move.captured] > VALUE[move.piece]) {
      add(75, `Dùng ${NAME[move.piece]} ăn ${NAME[move.captured]} — đổi quân có lợi`);
    } else if (VALUE[move.captured] === VALUE[move.piece]) {
      if (move.piece === 'q') tags.add('queenTrade');
      if (myMat >= 2) add(38, 'Đang hơn quân nên chủ động đổi quân để đơn giản hóa thế cờ');
      else add(35, `Đổi quân: ${NAME[move.piece]} lấy ${NAME[move.captured]}`);
    }
  }

  // --- Sacrifice
  const sac = sacrificedMaterial(fen, uci);
  if (sac >= 2) {
    add(78, `Thí quân (bỏ ${sac} điểm vật chất) để giành thế tấn công`);
    tags.add('sac');
    // Name the sacrifice after the most valuable piece left en prise.
    const loose = pieces(after, me).filter(
      (p) => p.type !== 'k' && isHanging(after, p.square) && (p.square === to || !isHanging(before, p.square)),
    );
    const given = loose.sort((a, b) => VALUE[b.type] - VALUE[a.type])[0]?.type;
    if (given && 'qrbn'.includes(given)) tags.add(`sac${given.toUpperCase()}`);
    const bait = loose.sort((a, b) => VALUE[b.type] - VALUE[a.type])[0];
    const replies = after.moves({ verbose: true });
    facts.forcedTake = !!bait && replies.length > 0 && replies.every((m) => m.to === bait.square);
    facts.bait = bait ? { type: bait.type, square: bait.square } : null;
    const oppKing = pieces(before, opp).find((p) => p.type === 'k').square;
    const near = Math.max(Math.abs(FILES.indexOf(to[0]) - FILES.indexOf(oppKing[0])), Math.abs(+to[1] - +oppKing[1])) <= 1;
    if (near) tags.add('sacKingside');
  }

  // --- Checks, threats, forks
  if (after.inCheck() && !after.isCheckmate()) {
    add(45, 'Chiếu Vua, buộc đối phương phải đối phó');
    tags.add('check');
  }
  const threats = targetsOf(after, to).filter(
    (t) => t.type === 'k' || VALUE[t.type] > VALUE[moved.type] || (isHanging(after, t.square) && VALUE[t.type] >= 3),
  );
  if (threats.length >= 2) {
    const names = threats.map((t) => (t.type === 'k' ? 'Vua' : piece(t, t.square))).join(' và ');
    add(88, `Đòn chĩa đôi: ${NAME[moved.type]} tấn công cùng lúc ${names}`);
    facts.targets = threats.map((t) => (t.type === 'k' ? 'Vua' : piece(t, t.square)));
    tags.add(moved.type === 'n' ? 'knightFork' : moved.type === 'p' ? 'pawnFork' : 'fork');
    if (threats.some((t) => t.type === 'k') && threats.some((t) => t.type === 'q')) tags.add('royalFork');
  } else if (threats.length === 1 && threats[0].type !== 'k') {
    add(60, `Đe dọa ăn ${piece(threats[0], threats[0].square)}`);
    facts.threat = piece(threats[0], threats[0].square);
    if (threats[0].type === 'q') tags.add('hitQueen');
  } else if (targetsOf(after, to).some((t) => t.type === 'p' && isHanging(after, t.square))) {
    const pawn = targetsOf(after, to).find((t) => t.type === 'p' && isHanging(after, t.square));
    add(33, `Tấn công Tốt ở ${pawn.square} đang không được bảo vệ`);
    facts.threat = `Tốt ở ${pawn.square}`;
  } else if (lineTactics(after, to).length === 0) {
    const pressured = targetsOf(after, to).find((t) => t.type !== 'p' && t.type !== 'k');
    if (pressured) {
      add(20, `Gây áp lực lên ${piece(pressured, pressured.square)}`);
      facts.threat = piece(pressured, pressured.square);
    }
  }
  if (!after.isGameOver() && !after.inCheck()) {
    const mateIn1 = mateThreat(after);
    if (mateIn1) {
      add(82, `Đe dọa chiếu hết bằng ${mateIn1}`);
      facts.mateThreat = mateIn1;
      tags.add('mateThreat');
    }
  }

  // --- Discovered attacks
  for (const t of pieces(after, opp)) {
    if (t.type === 'p') continue;
    const newHits = after
      .attackers(t.square, me)
      .filter((a) => a !== to && !before.attackers(t.square, me).includes(a));
    if (newHits.length && (t.type === 'k' || isHanging(after, t.square))) {
      const by = after.get(newHits[0]);
      add(t.type === 'k' ? 72 : 62, `Mở đường cho ${NAME[by.type]} ${t.type === 'k' ? 'chiếu Vua' : `tấn công ${piece(t, t.square)}`}`);
      tags.add(t.type === 'k' ? 'discoveredCheck' : 'discovered');
      break;
    }
  }

  for (const t of lineTactics(after, to)) {
    add(t.w, t.text);
    facts.pin = { kind: t.kind, front: piece(t.front, t.front.square), back: NAME[t.back.type] };
    tags.add(t.text.startsWith('Ghim') ? (t.w >= 70 ? 'pinKing' : 'pin') : 'skewer');
  }

  // --- Defence
  const oppMateBefore = mateThreat(new Chess(`${before.fen().split(' ')[0]} ${me} - - 0 1`));
  if (oppMateBefore && !after.isGameOver() && !mateThreat(new Chess(after.fen().replace(/ [wb] /, ` ${me} `)))) {
    add(86, `Chặn đòn chiếu hết ${oppMateBefore} của đối phương`);
    facts.stoppedMate = oppMateBefore;
    tags.add('stopMate');
  }
  if (isHanging(before, from) && !isHanging(after, to)) {
    add(58, `Đưa ${NAME[moved.type]} thoát khỏi chỗ bị tấn công`);
    tags.add('escape');
  }
  for (const p of pieces(before, me)) {
    if (p.square === from || !isHanging(before, p.square)) continue;
    if (after.get(p.square) && !isHanging(after, p.square)) {
      add(55, `Bảo vệ ${piece(p, p.square)} đang bị đe dọa`);
      tags.add('protect');
      facts.protected = p.type;
      break;
    }
  }

  // --- Strategy
  const backRank = me === 'w' ? '1' : '8';
  const rel = (sq) => (me === 'w' ? +sq[1] : 9 - +sq[1]); // rank from the mover's side
  const opening = before.moveNumber() <= 12;
  const heavy = pieces(before).filter((p) => 'qrbn'.includes(p.type)).reduce((s, p) => s + VALUE[p.type], 0);
  if (opening && 'nb'.includes(move.piece) && from[1] === backRank) add(30, `Phát triển ${NAME[move.piece]} ra trận`);
  if (move.piece === 'p' && ['d4', 'e4', 'd5', 'e5'].includes(to)) add(28, 'Chiếm trung tâm bằng Tốt');
  if (move.piece === 'n' && CENTER_OUTPOSTS.has(to) && rel(to) >= 4) add(26, 'Đưa Mã vào ô mạnh ở trung tâm, khó bị đuổi');
  if (move.piece === 'b' && ['g2', 'b2', 'g7', 'b7'].includes(to)) add(26, 'Đưa Tượng lên đường chéo dài (fianchetto)');
  if (move.piece === 'r' && rel(to) === 7) add(45, 'Xe xuống hàng 7: ăn Tốt và dồn ép Vua đối phương');
  if ('rq'.includes(move.piece)) {
    const partner = pieces(after, me).find(
      (p) => p.square !== to && p.square[0] === to[0] && 'rq'.includes(p.type),
    );
    if (partner) {
      const lo = Math.min(+to[1], +partner.square[1]);
      const hi = Math.max(+to[1], +partner.square[1]);
      let clear = true;
      for (let r = lo + 1; r < hi; r++) if (after.get(to[0] + r)) clear = false;
      if (clear) add(34, `Chồng ${NAME[move.piece]} với ${NAME[partner.type]} trên cột ${to[0]}`);
    }
  }
  if (move.piece === 'r' && !pieces(after, me).some((p) => p.type === 'p' && p.square[0] === to[0]))
    add(32, `Đưa Xe vào cột ${to[0]} mở`);
  if (move.piece === 'p') {
    if (isPassed(after, to, me)) {
      const close = rel(to) >= 6;
      add(close ? 70 : 40, close ? 'Đẩy Tốt thông, sắp phong cấp' : 'Đẩy Tốt thông tiến lên');
    }
    const hitsPawn = targetsOf(after, to).some((t) => t.type === 'p');
    if (hitsPawn && !move.captured) add(30, 'Đột phá Tốt: thách đổi để mở cột, mở đường cho quân');
    const king = pieces(before, me).find((p) => p.type === 'k');
    if ('fgh'.includes(from[0]) && rel(from) === 2 && king.square[1] === backRank && 'fgh'.includes(king.square[0]))
      add(28, 'Tạo ô thở cho Vua, tránh bị chiếu hết hàng cuối');
    // Prophylaxis: the pawn now guards a square an enemy minor piece wanted.
    const guarded = targetsOfSquares(after, to);
    const intruder = movesFor(before, opp).find((m) => 'nb'.includes(m.piece) && guarded.includes(m.to));
    if (intruder) add(29, `Phòng ngừa: không cho ${NAME[intruder.piece]} đối phương nhảy vào ${intruder.to}`);
  }
  if (move.piece === 'k' && !move.isKingsideCastle() && !move.isQueensideCastle()) {
    if (heavy <= 26 && centerDist(to) < centerDist(from)) add(30, 'Tàn cuộc: đưa Vua ra trung tâm làm quân chiến đấu');
    else if (heavy > 26 && rel(to) >= 3 && pieces(before, opp).some((p) => p.type === 'q')) tags.add('kingWalk');
  }
  if (move.piece === 'q' && before.moveNumber() <= 4 && rel(to) >= 4) tags.add('earlyQueen');
  const fullBoard = pieces(before).length >= 30; // still the opening of a normal game
  if (fullBoard && before.moveNumber() <= 3 && move.piece === 'k' && !move.isKingsideCastle() && !move.isQueensideCastle())
    tags.add('bongcloud');

  // --- Where the engine line leads
  const gain = shallow ? 0 : pvMaterialGain(fen, line.pv);
  if (gain >= 2 && !(line.mate > 0)) add(68, `Theo biến chính, ${SIDE[me]} lời thêm ${gain} điểm vật chất`);

  // --- Look ahead: what this move prepares (our follow-up in the engine line)
  if (!shallow && line.pv.length > 2 && !after.isGameOver()) {
    const sim = new Chess(after.fen());
    try {
      const reply = sim.move(uciToMove(line.pv[1]));
      const next = describeMove(sim.fen(), { pv: line.pv.slice(2) }, {
        max: 1,
        shallow: true,
        prevUci: reply.captured ? line.pv[1] : null,
      });
      facts.followSan = next.san;
      facts.followTags = next.tags;
      const why = next.reasons[0];
      if (why && !/^(Nước củng cố|Tăng hoạt động)/.test(why))
        add(24, `Chuẩn bị ${next.san}: ${why.charAt(0).toLowerCase()}${why.slice(1)}`);
    } catch {
      /* stale PV */
    }
  }

  if (reasons.length === 0 || reasons.every((r) => r.w < 30)) {
    const m0 = mobility(before, from);
    const m1 = mobility(after, to);
    if (m1 - m0 >= 2) add(22, `Tăng hoạt động cho ${NAME[moved.type]}: kiểm soát ${m0} → ${m1} ô`);
  }
  if (reasons.length === 0) add(5, 'Nước củng cố, giữ thế cờ ổn định');

  // Nothing else matters once the game is over.
  if (after.isCheckmate()) reasons.splice(0, reasons.length, ...reasons.filter((r) => r.w >= 95));

  return {
    san: move.san,
    tags,
    facts,
    reasons: reasons
      .sort((a, b) => b.w - a.w)
      .filter((r, i, arr) => arr.findIndex((x) => x.text === r.text) === i)
      .slice(0, max)
      .map((r) => r.text),
  };
}

/** Squares attacked by the piece standing on `sq`. */
function targetsOfSquares(chess, sq) {
  const me = chess.get(sq).color;
  const out = [];
  for (const f of FILES) for (let r = 1; r <= 8; r++) if (chess.attackers(f + r, me).includes(sq)) out.push(f + r);
  return out;
}

export function explainMove(fen, line, opts) {
  return describeMove(fen, line, opts).reasons;
}

/**
 * Step through the engine line: each ply with its move number and one short
 * reason, so the player can see how the idea unfolds.
 */
export function walkthrough(fen, pv, plies = 6, prevUci = null) {
  const chess = new Chess(fen);
  const steps = [];
  let lastCapture = null;
  for (let i = 0; i < Math.min(pv.length, plies); i++) {
    const pos = chess.fen();
    const no = chess.moveNumber();
    const color = chess.turn();
    const d = describeMove(pos, { pv: pv.slice(i) }, { max: 1, shallow: true, prevUci: i ? lastCapture : prevUci });
    let played;
    try {
      played = chess.move(uciToMove(pv[i]));
    } catch {
      break;
    }
    lastCapture = played.captured ? pv[i] : null;
    const why = d.reasons[0];
    steps.push({
      label: `${no}${color === 'w' ? '.' : '...'} ${d.san}`,
      color,
      why: why && !why.startsWith('Nước củng cố') ? why : '',
    });
  }
  return steps;
}

/** Flip an engine line to the perspective of the side replying to its first move. */
export function replyLine(line) {
  return {
    pv: line.pv.slice(1),
    cp: line.cp === undefined ? undefined : -line.cp,
    mate: line.mate === undefined ? undefined : -line.mate,
  };
}
