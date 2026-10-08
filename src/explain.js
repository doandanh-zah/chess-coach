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
        w: back.type === 'k' ? 70 : 55,
        text: `Ghim ${piece(front, front.square)} vào ${NAME[back.type]} — quân này ${back.type === 'k' ? 'không được phép' : 'khó'} di chuyển`,
      });
    } else if (worth(front) > worth(back) && back.type !== 'p' && VALUE[back.type] >= 3) {
      out.push({
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

/**
 * @param {string} fen position before the move
 * @param {{pv: string[], cp?: number, mate?: number}} line engine line starting with the move
 * @param {{max?: number}} opts
 * @returns {string[]} reasons, most important first
 */
export function explainMove(fen, line, { max = 3 } = {}) {
  const uci = line.pv[0];
  const before = new Chess(fen);
  const me = before.turn();
  const opp = other(me);
  const after = new Chess(fen);
  let move;
  try {
    move = after.move(uciToMove(uci));
  } catch {
    return [];
  }
  const { from, to } = move;
  const moved = after.get(to);
  const reasons = [];
  const add = (w, text) => reasons.push({ w, text });

  // Forced mate
  if (after.isCheckmate()) add(100, 'Chiếu hết — kết thúc ván cờ!');
  else if (line.mate > 0) add(95, `Mở ra đòn chiếu hết sau ${line.mate} nước nếu đi chính xác`);

  if (move.isKingsideCastle() || move.isQueensideCastle())
    add(50, 'Nhập thành: đưa Vua vào chỗ an toàn và đưa Xe vào trận');
  if (move.promotion) add(85, `Phong cấp Tốt thành ${NAME[move.promotion]}`);

  // Captures
  if (move.captured) {
    const cap = { type: move.captured };
    const loose = !before.attackers(to, opp).length || !after.attackers(to, opp).length;
    if (move.isEnPassant()) add(40, 'Bắt Tốt qua đường');
    else if (loose) add(80, `Ăn không ${NAME[cap.type]} ở ${to} (quân không được bảo vệ)`);
    else if (VALUE[cap.type] > VALUE[move.piece]) add(75, `Dùng ${NAME[move.piece]} ăn ${NAME[cap.type]} — đổi quân có lợi`);
    else if (VALUE[cap.type] === VALUE[move.piece]) add(35, `Đổi quân: ${NAME[move.piece]} lấy ${NAME[cap.type]}`);
  }

  // Sacrifice
  const sac = sacrificedMaterial(fen, uci);
  if (sac >= 2) add(78, `Thí quân (bỏ ${sac} điểm vật chất) để giành thế tấn công`);

  // Check / threats / fork from the moved piece
  if (after.inCheck() && !after.isCheckmate()) add(45, 'Chiếu Vua, buộc đối phương phải đối phó');
  const threats = targetsOf(after, to).filter(
    (t) => t.type === 'k' || VALUE[t.type] > VALUE[moved.type] || (isHanging(after, t.square) && VALUE[t.type] >= 3),
  );
  if (threats.length >= 2) {
    const names = threats.map((t) => (t.type === 'k' ? 'Vua' : piece(t, t.square))).join(' và ');
    add(88, `Đòn chĩa đôi: ${NAME[moved.type]} tấn công cùng lúc ${names}`);
  } else if (threats.length === 1 && threats[0].type !== 'k') {
    add(60, `Đe dọa ăn ${piece(threats[0], threats[0].square)}`);
  } else if (lineTactics(after, to).length === 0) {
    const pressured = targetsOf(after, to).find((t) => t.type !== 'p' && t.type !== 'k');
    if (pressured) add(20, `Gây áp lực lên ${piece(pressured, pressured.square)}`);
  }
  if (!after.isGameOver() && !after.inCheck()) {
    const mateIn1 = mateThreat(after);
    if (mateIn1) add(82, `Đe dọa chiếu hết bằng ${mateIn1}`);
  }

  // Discovered attacks: other pieces that now hit something valuable
  for (const t of pieces(after, opp)) {
    if (t.type === 'p') continue;
    const newHits = after
      .attackers(t.square, me)
      .filter((a) => a !== to && !before.attackers(t.square, me).includes(a));
    if (newHits.length && (t.type === 'k' || isHanging(after, t.square))) {
      const by = after.get(newHits[0]);
      add(t.type === 'k' ? 72 : 62, `Mở đường cho ${NAME[by.type]} ${t.type === 'k' ? 'chiếu Vua' : `tấn công ${piece(t, t.square)}`}`);
      break;
    }
  }

  for (const t of lineTactics(after, to)) add(t.w, t.text);

  // Safety: rescuing the moved piece or another one
  if (isHanging(before, from) && !isHanging(after, to)) add(58, `Đưa ${NAME[moved.type]} thoát khỏi chỗ bị tấn công`);
  for (const p of pieces(before, me)) {
    if (p.square === from || !isHanging(before, p.square)) continue;
    if (after.get(p.square) && !isHanging(after, p.square)) {
      add(55, `Bảo vệ ${piece(p, p.square)} đang bị đe dọa`);
      break;
    }
  }

  // Strategic ideas
  const backRank = me === 'w' ? '1' : '8';
  if (before.moveNumber() <= 12 && 'nb'.includes(move.piece) && from[1] === backRank)
    add(30, `Phát triển ${NAME[move.piece]} ra trận`);
  if (move.piece === 'p' && ['d4', 'e4', 'd5', 'e5'].includes(to)) add(28, 'Chiếm trung tâm bằng Tốt');
  if (move.piece === 'p' && isPassed(after, to, me)) {
    const rank = +to[1];
    const close = me === 'w' ? rank >= 6 : rank <= 3;
    add(close ? 70 : 40, close ? 'Đẩy Tốt thông, sắp phong cấp' : 'Đẩy Tốt thông tiến lên');
  }
  if (move.piece === 'r' && !pieces(after, me).some((p) => p.type === 'p' && p.square[0] === to[0]))
    add(32, `Đưa Xe vào cột ${to[0]} mở`);

  // Where the engine line leads
  const gain = pvMaterialGain(fen, line.pv);
  if (gain >= 2 && !(line.mate > 0)) add(68, `Theo biến chính, ${SIDE[me]} lời thêm ${gain} điểm vật chất`);

  if (reasons.length === 0 || reasons.every((r) => r.w < 30)) {
    const m0 = mobility(before, from);
    const m1 = mobility(after, to);
    if (m1 - m0 >= 2) add(25, `Tăng hoạt động cho ${NAME[moved.type]}: kiểm soát ${m0} → ${m1} ô`);
  }
  if (line.pv.length > 1) {
    const reply = new Chess(after.fen());
    try {
      const r = reply.move(uciToMove(line.pv[1]));
      add(10, `Đối phương nên đáp ${r.san}`);
    } catch {
      /* PV ended or is stale */
    }
  }
  if (reasons.length === 0) add(5, 'Nước củng cố, giữ thế cờ ổn định');

  return reasons
    .sort((a, b) => b.w - a.w)
    .filter((r, i, arr) => arr.findIndex((x) => x.text === r.text) === i)
    .slice(0, max)
    .map((r) => r.text);
}

/** Flip an engine line to the perspective of the side replying to its first move. */
export function replyLine(line) {
  return {
    pv: line.pv.slice(1),
    cp: line.cp === undefined ? undefined : -line.cp,
    mate: line.mate === undefined ? undefined : -line.mate,
  };
}
