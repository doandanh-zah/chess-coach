// "Bình luận vui": play-by-play commentary in the voice of Vietnamese chess
// YouTube. Each move gets one plain, accurate sentence — who moves what where
// and why — tied to what just happened on the board:
//
//   "Trắng thúc tốt tiến xuống H6 bắt tượng."
//   "Đen chạy tượng lên F6 né đòn."
//   "Chưa dừng lại ở đó, Đen phi tượng lên E6 tiếp tục truy sát hậu."
//   "Biết rằng quân tốt này có tẩm thuốc độc nên Đen không dám ăn uống linh tinh…"
//   "Nếu mà Đen tưởng ngon ăn hậu lên B5 thì Trắng sẽ ăn xe D8 chiếu hết."
//
// Catchphrases are kept for the moments that earn them (sacrifices, blunders,
// mates, promotions); ordinary moves are narrated straight. Edit freely.

import { Chess } from 'chess.js';
import { uciToMove, winPct } from './classify.js';
import { pieces, isHanging, lineTactics, mateThreat, isPassed } from './explain.js';

const PW = { k: 'vua', q: 'hậu', r: 'xe', b: 'tượng', n: 'mã', p: 'tốt' };
const WORTH = { k: 100, q: 9, r: 5, b: 3, n: 3, p: 1 };
const STRONG = new Set(['brilliant', 'great', 'best', 'excellent']);
const BAD = new Set(['blunder', 'mistake', 'inaccuracy']);
const FILES = 'abcdefgh';
const CENTER = ['d4', 'e4', 'd5', 'e5'];

const other = (c) => (c === 'w' ? 'b' : 'w');
const SQ = (s) => s.toUpperCase();
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/** "tượng" for pieces, "tốt C5" for pawns (there are many of them). */
const nameOf = (t) => (t.type === 'p' ? `tốt ${SQ(t.square)}` : PW[t.type]);
const named = (t) => `${PW[t.type]} ${SQ(t.square)}`;

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) >>> 0;
  return h;
}

function picker(seed) {
  let n = 0;
  return (...options) => options[hash(`${seed}|${n++}`) % options.length];
}
const first = (a) => a;

const material = (chess, color) =>
  pieces(chess, color).reduce((s, p) => s + (p.type === 'k' ? 0 : WORTH[p.type]), 0);

/** Squares the piece on `sq` attacks. */
function reach(chess, sq) {
  const me = chess.get(sq).color;
  const out = [];
  for (const f of FILES) for (let r = 1; r <= 8; r++) if (chess.attackers(f + r, me).includes(sq)) out.push(f + r);
  return out;
}

/** Defenders of `sq` for `color`, not counting the king. */
const guardsOf = (chess, sq, color) => chess.attackers(sq, color).filter((a) => chess.get(a).type !== 'k').length;

/** Has `color` castled (king tucked on the wing of its back rank)? */
function castled(chess, color) {
  const k = pieces(chess, color).find((p) => p.type === 'k');
  return !!k && k.square[1] === (color === 'w' ? '1' : '8') && 'bcgh'.includes(k.square[0]);
}

/**
 * Everything the narrator needs to know about one move, worked out from the
 * board itself so every claim ("bắt xe", "né đòn", "bảo vệ tốt E4") is true.
 */
function inspect(fen, uci) {
  const before = new Chess(fen);
  const after = new Chess(fen);
  let mv;
  try {
    mv = after.move(uciToMove(uci));
  } catch {
    return null;
  }
  const me = mv.color;
  const opp = other(me);
  const rel = (sq) => (me === 'w' ? +sq[1] : 9 - +sq[1]);
  const { from, to, piece } = mv;
  const x = {
    me,
    opp,
    piece,
    from,
    to,
    san: mv.san,
    captured: mv.captured ?? null,
    promotion: mv.promotion ?? null,
    castle: mv.isKingsideCastle() ? 'short' : mv.isQueensideCastle() ? 'long' : null,
    check: after.inCheck(),
    mate: after.isCheckmate(),
    stalemate: after.isStalemate(),
    inCheckBefore: before.inCheck(),
    relFrom: rel(from),
    relTo: rel(to),
    forward: rel(to) > rel(from),
    retreat: rel(to) < rel(from),
    lateral: rel(to) === rel(from),
    twoStep: piece === 'p' && Math.abs(+to[1] - +from[1]) === 2,
    develop: 'nb'.includes(piece) && rel(from) === 1,
    moveNo: before.moveNumber(),
    before,
    after,
  };
  x.dir = x.retreat ? 'về' : x.forward ? (x.relTo >= 6 ? 'xuống' : 'lên') : 'sang';
  x.lead = material(before, me) - material(before, opp); // material balance before the move
  if (x.mate) return x;

  const mine = after.attackers(to, me).length;
  x.safe = !after.attackers(to, opp).length || (mine > 0 && !isHanging(after, to));
  x.hanging = isHanging(after, to);
  x.escape = !x.captured && piece !== 'k' && isHanging(before, from) && !isHanging(after, to);
  x.blocksCheck = x.inCheckBefore && piece !== 'k' && !x.captured;

  // New attacks by the moved piece that actually threaten something.
  const hits = pieces(after, opp).filter((t) => after.attackers(t.square, me).includes(to));
  x.threats = hits.filter((t) => {
    if (t.type === 'k' || before.attackers(t.square, me).includes(from) || isHanging(before, t.square)) return false;
    const undefended = !after.attackers(t.square, opp).length;
    if (!(WORTH[t.type] > WORTH[piece] || undefended)) return false;
    // A target that can simply take the attacker is not really threatened.
    if (after.attackers(to, opp).includes(t.square) && (!mine || WORTH[piece] >= WORTH[t.type])) return false;
    return true;
  });
  x.threats.sort((a, b) => WORTH[b.type] - WORTH[a.type]);
  if (x.captured && !x.safe) x.threats = x.threats.filter((t) => WORTH[t.type] > WORTH[piece] && 'qr'.includes(t.type));
  // "Tấn công đôi" only when both targets matter; otherwise name the big one.
  if (x.threats.length >= 2 && x.threats.filter((t) => WORTH[t.type] >= 3).length < 2) x.threats = x.threats.slice(0, 1);
  // A check that is answered by taking the checker wins nothing.
  x.checkerTakeable = x.check && after.moves({ verbose: true }).some((m) => m.to === to);
  // Gives up more than it takes, on purpose or not.
  x.givesUp = !!x.captured && x.hanging && WORTH[piece] - WORTH[x.captured] >= 2 && piece !== 'k';
  // Equal piece, both sides defended: a trade offer.
  if (!x.captured && x.safe && mine > 0) {
    x.tradeOffer = hits.find(
      (t) =>
        t.type === piece &&
        'nbrq'.includes(t.type) &&
        after.attackers(t.square, opp).length &&
        !before.attackers(t.square, me).includes(from) &&
        after.moves({ square: t.square, verbose: true }).some((m) => m.to === to), // they can take back (not pinned)
    );
  }
  // One more attacker on something already under fire.
  if (!x.threats.length) {
    x.pressure = hits.find((t) => {
      if (t.type === 'k' || before.attackers(t.square, me).includes(from)) return false;
      const n = after.attackers(t.square, me).length;
      return n >= 2 && n >= guardsOf(after, t.square, opp) && before.attackers(t.square, me).length >= 1;
    });
  }
  // A piece of ours that was en prise and now is not, with the mover guarding it.
  x.defends = piece === 'k' ? null : pieces(before, me).find(
    (p) => p.square !== from && isHanging(before, p.square) && after.get(p.square) && !isHanging(after, p.square) && after.attackers(p.square, me).includes(to),
  );
  // Or one more defender for a piece under as much fire as it has guards.
  if (!x.defends && piece !== 'k') {
    x.guards = pieces(before, me).find(
      (p) =>
        p.square !== from &&
        p.type !== 'k' &&
        after.get(p.square) &&
        after.attackers(p.square, me).includes(to) &&
        !before.attackers(p.square, me).includes(from) &&
        before.attackers(p.square, opp).length >= Math.max(1, guardsOf(before, p.square, me)),
    );
  }
  // Stops a mate the opponent was threatening.
  const flip = (c, turn) => new Chess(c.fen().replace(/ [wb] /, ` ${turn} `).replace(/ [a-h][36] /, ' - '));
  try {
    const threatBefore = mateThreat(flip(before, me));
    x.stopsMate = !!threatBefore && !x.mate && !mateThreat(flip(after, me));
  } catch {
    x.stopsMate = false;
  }
  const tactics = lineTactics(after, to).filter((t) => !before.get(from) || !lineTactics(before, from).some((u) => u.front.square === t.front.square));
  x.pin = x.captured && !x.safe ? null : (tactics[0] ?? null);
  // Discovered attack: moving away lets another piece hit something.
  for (const t of pieces(after, opp)) {
    if (t.type === 'p') continue;
    const fresh = after.attackers(t.square, me).filter((a) => a !== to && !before.attackers(t.square, me).includes(a));
    if (fresh.length && (t.type === 'k' || isHanging(after, t.square))) {
      x.opened = { by: after.get(fresh[0]).type, type: t.type, square: t.square };
      break;
    }
  }
  x.mateThreat = !x.check ? mateThreat(after) : null;
  // Eyeing the squares around the enemy king (for "rình rập").
  const ok = pieces(after, opp).find((p) => p.type === 'k').square;
  const ring = [];
  for (let df = -1; df <= 1; df++)
    for (let dr = -1; dr <= 1; dr++) {
      const f = FILES.indexOf(ok[0]) + df;
      const r = +ok[1] + dr;
      if ((df || dr) && f >= 0 && f < 8 && r >= 1 && r <= 8) ring.push(FILES[f] + r);
    }
  x.eyesKing = 'qrb'.includes(piece) && !x.check && ring.filter((q) => after.attackers(q, me).includes(to)).length >= 2;
  const weak = me === 'w' ? 'f7' : 'f2';
  if (after.get(weak)?.color === opp && after.get(weak).type !== 'k' && after.attackers(weak, me).includes(to) && !castled(after, opp)) x.weakPoint = weak;

  // Castling: does the rook land on something?
  if (x.castle) {
    const rSq = (x.castle === 'short' ? 'f' : 'd') + to[1];
    const t = pieces(after, opp).find((q) => q.type !== 'k' && q.type !== 'p' && after.attackers(q.square, me).includes(rSq));
    if (t) x.rookHits = { file: rSq[0], target: t };
  }
  // Quiet ideas.
  const oppKing = pieces(after, opp).find((p) => p.type === 'k').square;
  const myKing = pieces(after, me).find((p) => p.type === 'k').square;
  if (piece === 'p') {
    const home = me === 'w' ? { f: 'f1', c: 'c1' } : { f: 'f8', c: 'c8' };
    const fian = { g: me === 'w' ? 'g2' : 'g7', b: me === 'w' ? 'b2' : 'b7' };
    if (x.relFrom === 2 && (from[0] === 'g' || from[0] === 'b') && x.relTo === 3) {
      const bSq = from[0] === 'g' ? home.f : home.c;
      if (after.get(bSq)?.type === 'b' && after.get(bSq).color === me) x.fianchettoPrep = fian[from[0]];
    }
    for (const bSq of [home.c, home.f]) {
      const b = before.get(bSq);
      if (b?.type === 'b' && b.color === me && !reach(before, bSq).some((s) => !before.get(s)) && reach(after, bSq).some((s) => !after.get(s)))
        x.opensBishop = bSq;
    }
    if (isPassed(after, to, me) && x.relTo >= 6) x.passed = true;
    // Pawn levers: hitting an enemy pawn, or about to.
    const lever = reach(after, to).find((s) => after.get(s)?.type === 'p' && after.get(s).color === opp);
    if (lever && x.relTo >= 4) x.lever = { square: lever, center: 'cde'.includes(to[0]) && 'cdef'.includes(lever[0]) };
    else if (x.relTo >= 4 && 'abgh'.includes(to[0])) {
      const next = to[0] + (+to[1] + (me === 'w' ? 1 : -1));
      const probe = new Chess(after.fen());
      probe.remove(to);
      if (!probe.get(next)) {
        probe.put({ type: 'p', color: me }, next);
        const hit = reach(probe, next)
          .map((s) => probe.get(s))
          .filter((q) => q && q.color === opp && q.type !== 'k')
          .sort((a, b) => WORTH[b.type] - WORTH[a.type])[0];
        if (hit) x.threatensPush = { square: next, type: hit.type };
      }
    }
    // Shutting an enemy bishop out.
    for (const b of pieces(after, opp).filter((q) => q.type === 'b')) {
      const left = reach(after, b.square).length;
      const lost = reach(before, b.square).length - left;
      if (lost >= 3 || (lost >= 2 && left <= 3)) x.shutsBishop = b.square;
    }
    const wing = (sq) => ('fgh'.includes(sq[0]) ? 'k' : 'abc'.includes(sq[0]) ? 'q' : null);
    if (x.relTo >= 4 && wing(to) && wing(to) === wing(oppKing) && castled(after, opp) && wing(myKing) !== wing(to)) x.storm = wing(to);
    // Prophylaxis: the pawn now covers a square an enemy minor piece could jump to.
    const covers = reach(after, to).filter((s) => !before.attackers(s, me).some((a) => before.get(a).type === 'p'));
    let probe;
    try {
      probe = new Chess(`${before.fen().split(' ')[0]} ${opp} - - 0 1`);
    } catch {
      probe = null;
    }
    // …and only squares worth jumping to: from there it would hit one of our pieces or the king.
    const jump = probe?.moves({ verbose: true }).find((m) => {
      if (!'nb'.includes(m.piece) || !covers.includes(m.to) || m.captured) return false;
      probe.move(m);
      const hits = pieces(probe, me).some((q) => q.type !== 'p' && probe.attackers(q.square, opp).includes(m.to));
      probe.undo();
      return hits;
    });
    if (jump) x.denies = { type: jump.piece, square: jump.to };
  }
  if (piece === 'b' && [me === 'w' ? 'g2' : 'g7', me === 'w' ? 'b2' : 'b7'].includes(to)) x.longDiagonal = true;
  if (piece === 'r' || piece === 'q') {
    const file = to[0];
    const pawnsOn = (c) => pieces(after, c).some((p) => p.type === 'p' && p.square[0] === file);
    if (piece === 'r' && from[0] !== file && !pawnsOn(me)) x.file = pawnsOn(opp) ? 'half' : 'open';
    const partner = pieces(after, me).find((p) => p.square !== to && p.square[0] === file && 'rq'.includes(p.type));
    if (partner && from[0] !== file && !pawnsOn(me)) {
      const [lo, hi] = [+to[1], +partner.square[1]].sort((a, b) => a - b);
      let clear = true;
      for (let r = lo + 1; r < hi; r++) if (after.get(file + r)) clear = false;
      if (clear) x.doubled = partner.type;
    }
    if (piece === 'r' && x.relTo === 7) x.seventh = true;
  }
  if (piece === 'n' && x.develop) x.center = reach(after, to).some((s) => CENTER.includes(s));
  if (piece === 'k' && !x.castle) {
    const heavy = pieces(before).filter((p) => 'qrbn'.includes(p.type)).reduce((s, p) => s + WORTH[p.type], 0);
    const dist = (sq) => Math.max(Math.abs(FILES.indexOf(sq[0]) - 3.5), Math.abs(+sq[1] - 4.5));
    if (heavy <= 26 && dist(to) < dist(from)) x.kingCentre = true;
  }
  return x;
}

/** The move itself, in commentator verbs: "phát triển mã cánh vua lên F6", "lắc hậu sang E2"… */
function verb(x, pick, recapture = false) {
  const P = PW[x.piece];
  const S = SQ(x.to);
  const D = x.dir;
  if (x.castle) return x.castle === 'short' ? 'nhập thành' : 'nhập thành cánh hậu';
  if (x.promotion) {
    const how = x.captured ? `ăn ${PW[x.captured]} ${S}` : `thúc tốt xuống ${S}`;
    return `${how} phong ${PW[x.promotion]}`;
  }
  if (x.captured) {
    const C = PW[x.captured];
    if (x.piece === 'p') return recapture ? `ăn tốt lên ${S}` : x.captured === 'p' ? `ăn tốt sang ${S}` : `ăn ${C} ${S}`;
    if (x.piece === 'k') return `dùng vua ăn ${C} ${S}`;
    if (recapture) return `ăn ${P} ${D} ${S}`;
    return `ăn ${P} vào ${C} ${S}`;
  }
  switch (x.piece) {
    case 'p':
      if (x.relTo >= 6) return pick(`thúc tốt tiến xuống ${S}`, `lao tốt xuống ${S}`);
      if (x.relTo === 5) return pick(`thúc tốt tiến sang ${S}`, `thúc tốt tràn sang ${S}`);
      return x.twoStep ? pick(`dâng tốt ${S}`, `đẩy tốt ${S}`) : `đẩy tốt ${S}`;
    case 'n':
      if (x.develop) return pick(`phát triển mã cánh ${'efgh'.includes(x.from[0]) ? 'vua' : 'hậu'} lên ${S}`, `triển khai mã lên ${S}`);
      if (x.retreat) return x.escape && x.relFrom - x.relTo >= 2 ? `kéo mã chạy hẳn về ${S}` : pick(`lùi mã về ${S}`, `kéo mã lùi về ${S}`);
      if (x.escape) return `chạy mã ${D} ${S}`;
      return pick(`nhảy mã ${S}`, `tung mã ${D} ${S}`);
    case 'b':
      if (x.develop) return pick(`triển khai tượng lên ${S}`, `phát triển tượng lên ${S}`);
      if (x.retreat) return pick(`lùi tượng về ${S}`, `kéo tượng lùi về ${S}`);
      if (x.escape) return `chạy tượng ${D} ${S}`;
      return pick(`phi tượng ${D} ${S}`, `đưa tượng ${D} ${S}`);
    case 'q':
      if (x.retreat) return pick(`kéo hậu lùi về ${S}`, `chạy hậu về ${S}`);
      if (x.lateral) return pick(`lắc hậu sang ${S}`, `lắc hậu qua ${S}`);
      if (x.escape) return `chạy hậu ${D} ${S}`;
      if (x.relTo >= 6) return pick(`phi hậu xuống ${S}`, `lao hậu xuống ${S}`);
      if (x.relFrom === 1 && x.relTo <= 3 && !x.threats.length) return pick(`tiến hậu lên ${S}`, `đưa hậu lên ${S}`);
      return pick(`phi hậu lên ${S}`, `tung hậu lên ${S}`);
    case 'r':
      if (x.lateral && x.relFrom === 1) return pick(`qua xe ${S}`, `đưa xe qua ${S}`);
      if (x.lateral) return pick(`chạy xe sang ${S}`, `lắc xe sang ${S}`);
      if (x.retreat) return pick(`kéo xe lùi về ${S}`, `lùi xe về ${S}`);
      if (x.relTo >= 6) return `lao xe xuống ${S}`;
      return pick(`tiến xe lên ${S}`, `đưa xe lên ${S}`);
    case 'k':
      if (x.inCheckBefore) return pick(`chạy vua ${D} ${S}`, `kéo vua ${D} ${S}`);
      return pick(`đưa vua ${D} ${S}`, `di chuyển vua ${D} ${S}`);
  }
  return x.san;
}

/** What a single threat means: "đuổi hậu", "bắt xe", "uy hiếp tốt C5", "tấn công mã". */
function threatWords(x, t) {
  if (t.type === 'p') return `uy hiếp tốt ${SQ(t.square)}`;
  if (x.piece === 'p') return `${t.type === 'r' || t.type === 'q' ? 'bắt' : 'đuổi'} ${PW[t.type]}`;
  if (WORTH[x.piece] < WORTH[t.type]) return t.type === 'q' ? 'đuổi hậu' : `bắt ${PW[t.type]}`;
  return `tấn công ${PW[t.type]}`;
}

function pairWords(ts) {
  const [a, b] = ts;
  if (a.type === b.type) return `cặp ${PW[a.type]}`;
  return `${nameOf(a)} và ${nameOf(b)}`;
}

/** Why the move is played, most important first (at most two reasons). */
function reasons(x, { recapture = false } = {}) {
  const out = [];
  if (x.mate) return out;
  if (x.check) {
    const t = !x.checkerTakeable && x.threats.find((u) => WORTH[u.type] >= 3);
    out.push(t ? `chiếu bắt ${PW[t.type]}` : 'chiếu');
  } else if (x.blocksCheck) out.push('che chắn cho vua');
  if (x.stopsMate && !x.check) out.push('chặn đòn chiếu hết');
  if (x.piece === 'k' && x.inCheckBefore && !x.captured && !x.threats.length) out.push('tránh chiếu');

  if (!x.check && x.threats.length >= 2) out.push(`tấn công đôi ${pairWords(x.threats)}`);
  else if (x.pin && (x.pin.kind === 'pin' || !x.check)) {
    const { front, back, kind } = x.pin;
    if (kind === 'pin') out.push(`ghim ${named(front)} vào ${PW[back.type]}`);
    else out.push(front.type === back.type ? `xiên vào cặp ${PW[front.type]}` : `xiên vào ${PW[front.type]} và ${PW[back.type]}`);
  } else if (!x.check && x.threats.length === 1) out.push(threatWords(x, x.threats[0]));

  if (x.weakPoint && !x.captured) out.push(`nhắm vào điểm yếu ${SQ(x.weakPoint)}`);
  if (x.mateThreat) out.push('dọa chiếu hết');
  if (x.captured || recapture) return out.slice(0, 2);
  if (out.length < 2 && x.tradeOffer) out.push(`gạ đổi ${PW[x.tradeOffer.type]}`);
  if (out.length < 2 && x.defends) out.push(`bảo vệ ${nameOf(x.defends)}`);
  if (!out.length && x.pressure) out.push(`tăng thêm quân uy hiếp ${nameOf(x.pressure)}`);
  if (!out.length && x.guards) out.push(`tăng thêm quân bảo vệ ${nameOf(x.guards)}`);
  if (!out.length && x.opened && !x.check) out.push(`mở đường cho ${PW[x.opened.by]} tấn công ${PW[x.opened.type]}`);
  if (out.length) return out.slice(0, 2);

  // Quiet moves: the plan behind them.
  if (x.castle) {
    out.push('đưa vua vào vùng an toàn');
    if (x.rookHits) out.push(`đồng thời đưa xe vào cột ${SQ(x.rookHits.file)} uy hiếp ${nameOf(x.rookHits.target)}`);
  }
  if (x.piece === 'p') {
    if (x.shutsBishop) out.push(`bịt đường tấn công của tượng ${SQ(x.shutsBishop)}`);
    if (CENTER.includes(x.to) && x.moveNo <= 30) out.push('chiếm lĩnh trung tâm');
    else if (x.lever) out.push(x.lever.center ? 'đột phá vào trung tâm' : `công phá vào cứ điểm ${SQ(x.lever.square)}`);
    else if (['c4', 'c5'].includes(x.to) && x.moveNo <= 4) out.push('kiểm soát trung tâm');
    if (x.threatensPush && !x.lever)
      out.push(`đe dọa sẽ tràn sang ${SQ(x.threatensPush.square)}${x.threatensPush.type === 'p' ? '' : ` đuổi ${PW[x.threatensPush.type]}`}`);
    if (x.fianchettoPrep) out.push(`chuẩn bị đưa tượng lên ${SQ(x.fianchettoPrep)}`);
    else if (x.opensBishop && !out.length) out.push(`mở đường cho tượng ${SQ(x.opensBishop)} xuất trận`);
    if (x.passed) out.push('chuẩn bị phong hậu');
    else if (x.storm) out.push(`tiến đánh cánh ${x.storm === 'k' ? 'vua' : 'hậu'}`);
    if (!out.length && x.denies) out.push(`không cho ${PW[x.denies.type]} đối phương vào ${SQ(x.denies.square)}`);
  }
  if (x.longDiagonal) out.push('khống chế đường chéo lớn');
  if (x.file) out.push(x.file === 'open' ? `chiếm cột mở ${SQ(x.to[0])}` : `tham chiến trên cột nửa mở ${SQ(x.to[0])}`);
  if (x.doubled) out.push(`chồng ${x.doubled === 'q' || x.piece === 'q' ? 'hậu xe' : 'xe'} trên cột ${SQ(x.to[0])}`);
  if (x.seventh) out.push('xuống hàng 7');
  if (x.kingCentre) out.push('đưa vua ra trung tâm');
  if (!out.length && x.develop) out.push(x.center && x.piece === 'n' && (x.to.charCodeAt(0) + +x.to[1]) % 2 ? 'kiểm soát trung tâm' : 'đưa quân xuất trận');
  return out.slice(0, 2);
}

const clause = (act, why) => `${act}${why.length ? ` ${why.join(', ')}` : ''}`;

/** Taking back on the square of the last capture, for about what was lost. */
const isRecapture = (x, prev) => !!(x.captured && prev?.captured && prev.to === x.to && WORTH[x.captured] <= WORTH[prev.captured] + 2);

/**
 * "ăn hậu vào tốt B7 bắt xe" for any move in a line (used in what-if stories).
 * @param {{to: string, captured: string}} [prev] the previous ply, if it captured
 */
function plainMove(fen, uci, prev) {
  const x = inspect(fen, uci);
  if (!x) return null;
  const recapture = isRecapture(x, prev);
  // In a story, a capture only needs its check or a hit on a big piece.
  const why = reasons(x, { recapture }).filter((w) => !x.captured || /chiếu|hậu|xe/.test(w));
  let text = clause(verb(x, first, recapture), why);
  if (x.mate) text += ' chiếu hết';
  return { x, text };
}

/** "lời một con tốt", "hơn chất"… from what each side took along a line. */
function gainWords(mineTook, theirsTook) {
  const a = [...mineTook];
  const b = [...theirsTook];
  const norm = (t) => (t === 'b' ? 'n' : t);
  for (let i = a.length - 1; i >= 0; i--) {
    const j = b.findIndex((t) => norm(t) === norm(a[i]));
    if (j >= 0) {
      a.splice(i, 1);
      b.splice(j, 1);
    }
  }
  const diff = a.reduce((s, t) => s + WORTH[t], 0) - b.reduce((s, t) => s + WORTH[t], 0);
  if (diff <= 0) return null;
  if (!b.length && a.length === 1) return `lời một con ${PW[a[0]]}`;
  if (a.length === 1 && a[0] === 'r' && b.length === 1 && 'nb'.includes(b[0])) return 'hơn chất';
  return diff >= 3 ? 'chiếm ưu thế lớn về lực lượng' : 'lời thêm chút vật chất';
}

/**
 * Tell a line as the channel does: "Đen ăn mã vào C1 thì Trắng sẽ ăn tượng E6 bắt hậu.
 * Đen chạy hậu lên E6 thì Trắng sẽ ăn xe sang C1 và Trắng sẽ hơn chất."
 * @param {string} [hook] words slipped in before the first move ("tưởng ngon ")
 */
function tale(fen, pv, names, { hook = '', plies = 6, prev = null } = {}) {
  const chess = new Chess(fen);
  const a = chess.turn();
  const took = { w: [], b: [] };
  let text = '';
  let last = prev;
  let i = 0;
  for (; i < Math.min(pv.length, plies); i++) {
    const color = chess.turn();
    const m = plainMove(chess.fen(), pv[i], last);
    if (!m) break;
    chess.move(uciToMove(pv[i]));
    if (m.x.captured) took[color].push(m.x.captured);
    last = m.x.captured ? { to: m.x.to, captured: m.x.captured } : null;
    if (i === 0) text = `${names[color]} ${hook}${m.text}`;
    else if (color === a) text += `. ${names[color]} ${m.text}`;
    else text += ` thì ${names[color]} sẽ ${m.text}`;
    if (chess.isCheckmate()) return text;
    // Stop once the dust has settled: a quiet move after material changed hands.
    const traded = took.w.length + took.b.length > 0;
    if (i >= 1 && traded && !m.x.captured && !m.x.check && !m.x.threats.length) break;
  }
  const b = other(a);
  const gainB = gainWords(took[b], took[a]);
  const gainA = gainWords(took[a], took[b]);
  const doom = (winner, loser, g) =>
    g === 'chiếm ưu thế lớn về lực lượng' ? `${text} và cờ ${names[loser]} sẽ toang` : `${text} và ${names[winner]} sẽ ${g}`;
  if (gainB) return doom(b, a, gainB);
  if (gainA) return doom(a, b, gainA);
  return null; // nothing to show for it
}

/**
 * @param {object} ctx
 * @param {string} ctx.fen      position before the move
 * @param {string[]} ctx.pv     engine line starting with this move
 * @param {string} [ctx.cls]    move class
 * @param {'w'|'b'} ctx.color   side that moved
 * @param {{w: string, b: string}} ctx.names  how to call each side ("Trắng", "Bạn", "Nakamura"…)
 * @param {Set<string>} ctx.tags  describeMove() tags plus game context (sac, comboSac, missedMate…)
 * @param {object} [ctx.facts]  describeMove() facts (bait, forcedTake, stoppedMate)
 * @param {{fen: string, uci: string, cls?: string}} [ctx.prevMove] the opponent's last move
 * @param {{fen: string, uci: string, cls?: string, sac?: boolean}} [ctx.myPrev] this side's previous move
 * @param {object} [ctx.prev]   { cls, tags, facts } of the opponent's last move
 * @param {number} [ctx.oppBad] opponent's weak moves among their last three
 * @param {number} [ctx.winBefore] / [ctx.winAfter] mover's win % around the move
 * @param {object[]} [ctx.lines] engine lines (MultiPV) of the position before the move
 * @param {string[]} [ctx.refutationPv] best line for the opponent after a weak move
 * @param {string[]} [ctx.bestPv] best line instead of a weak move
 * @param {string} [ctx.nextUci] the move actually played next (so we don't foretell it)
 * @param {string} [ctx.opening] opening name reached by this move
 * @param {number} ctx.ply      half-moves played including this one
 * @param {boolean} [ctx.short] one sentence only (hint list)
 * @param {string} ctx.seed
 */
export function commentate(ctx) {
  const x = inspect(ctx.fen, ctx.pv[0]);
  if (!x) return null;
  const tags = ctx.tags ?? new Set();
  const f = ctx.facts ?? {};
  const { cls, color } = ctx;
  const pick = picker(ctx.seed);
  const me = ctx.names[color];
  const them = ctx.names[other(color)];
  const strong = !cls || STRONG.has(cls);
  const prevCls = ctx.prevMove?.cls ?? ctx.prev?.cls;
  const prevBad = ['mistake', 'blunder'].includes(prevCls);
  const P = ctx.prevMove ? inspect(ctx.prevMove.fen, ctx.prevMove.uci) : null; // their last move
  const M = ctx.myPrev ? inspect(ctx.myPrev.fen, ctx.myPrev.uci) : null; // my last move
  const recapture = isRecapture(x, P);
  const prevCap = P?.captured ? { to: P.to, captured: P.captured } : null;
  const why = reasons(x, { recapture });
  const act = verb(x, pick, recapture);
  const afterFen = x.after.fen();
  const winAfter = ctx.winAfter ?? 50;

  const say = (main, extra) => {
    let out = cap(main.trim());
    if (!/[.!?…]$/.test(out)) out += '.';
    if (extra && !ctx.short) out += ` ${cap(extra.trim())}${/[.!?]$/.test(extra.trim()) ? '' : '.'}`;
    return out;
  };
  const line = (lead, w = why, a = act) => `${lead}${me} ${a}${w.length ? ` ${w.join(', ')}` : ''}`;
  const bestText = () => {
    if (!ctx.bestPv?.length) return '';
    const m = plainMove(ctx.fen, ctx.bestPv[0], prevCap);
    return m?.text ?? '';
  };
  const story = (lead, ...args) => {
    const t = tale(...args);
    return t ? `${lead}${t}` : '';
  };
  const refute = (lead = 'Lúc này nếu ') => {
    if (!ctx.refutationPv?.length || ctx.nextUci === ctx.refutationPv[0]) return '';
    const prev = x.captured ? { to: x.to, captured: x.captured } : null;
    const r = plainMove(afterFen, ctx.refutationPv[0], prev);
    if (r?.x.mate) return `Lúc này ${them} chỉ cần ${r.text.replace(/ chiếu hết$/, '')} là chiếu hết`;
    return story(lead, afterFen, ctx.refutationPv, ctx.names, { plies: 5, prev });
  };

  // A quiet move with no visible point: say what it prepares (our next move in the line).
  if (!why.length && !x.captured && !x.castle && strong && ctx.pv.length >= 3) {
    try {
      const c = new Chess(afterFen);
      const reply = c.move(uciToMove(ctx.pv[1]));
      const next = inspect(c.fen(), ctx.pv[2]);
      const between = (a, b, c) => {
        const [fa, ra, fb, rb, fc, rc] = [a, b, c].flatMap((q) => [FILES.indexOf(q[0]), +q[1]]);
        const df = Math.sign(fc - fa), dr = Math.sign(rc - ra);
        if ((fc - fa) * dr !== (rc - ra) * df && !(df === 0 || dr === 0)) return false;
        for (let f = fa + df, r = ra + dr; f !== fc || r !== rc; f += df, r += dr) if (f === fb && r === rb) return true;
        return false;
      };
      const linked =
        next &&
        !next.mate &&
        next.to !== x.from && // not just going back
        (next.from === x.to || // same piece carries on
          ('bqr'.includes(next.piece) && between(next.from, x.from, next.to)) || // we cleared its path
          (next.after.attackers(next.to, color).includes(x.to) && next.after.attackers(next.to, other(color)).length)); // we cover its square
      if (linked) {
        const nextAct = verb(next, first, isRecapture(next, reply.captured ? { to: reply.to, captured: reply.captured } : null));
        why.push(`chuẩn bị ${nextAct}`);
      }
    } catch {
      /* stale line */
    }
  }
  if (!why.length && x.retreat && 'nb'.includes(x.piece) && !x.captured && hash(ctx.seed) % 2) why.push('để phòng có biến');

  // ----- opening name (takes the place of a second reason)
  if (ctx.opening) why.splice(1, why.length, color === 'w' ? `triển khai lối chơi ${ctx.opening}` : `chọn ${ctx.opening}`);

  // ----- game over
  if (x.mate) {
    const lead = prevBad ? 'Chỉ chờ có thế, ' : '';
    // Mating while behind in material, or right after a sacrifice / their blunder.
    const surprise = prevBad || !!ctx.myPrev?.sac || x.lead < 0;
    const kind = tags.has('smothered') ? ' chiếu ngộp' : ' chiếu hết';
    let how = act;
    if (x.piece === 'r' && x.forward && x.relTo - x.relFrom >= 2) how = `xuất chiêu la hán đẩy xe bò, lao thẳng xe xuống ${SQ(x.to)}`;
    else if (x.piece === 'n' && tags.has('smothered')) how = `${act}, thần mã luồn sâu vào tận hậu cung`;
    else how = `${pick('lạnh lùng ', '')}${act}`;
    return say(`${lead}${me} ${how}${kind}${surprise ? ` trong sự ngỡ ngàng của ${them}` : ''}`);
  }
  if (x.stalemate) return say(`${me} ${act}, nhưng ${them} đã hết nước đi — ván cờ hòa pat. Thắng đến nơi mà tiếc đứt ruột`);

  // Their last move left a piece hanging on purpose (a sacrifice), and we take it.
  const prevSac = ctx.prev?.tags?.has('sac') && STRONG.has(prevCls);
  const baitSq = ctx.prev?.facts?.bait?.square ?? P?.to;
  const takesBait = prevSac && x.captured && baitSq === x.to && cls !== 'forced';
  // We sacrificed last move, they grabbed it, and now the point of it shows.
  const payoff = ctx.myPrev?.sac && P?.captured && strong && !recapture;

  // ----- weak moves
  if (BAD.has(cls)) {
    if (tags.has('missedMate')) {
      const b = bestText();
      return say(`${line('')}, bỏ lỡ cơ hội chiếu hết`, b ? `Đáng lẽ ${me} chỉ cần ${b.replace(/ chiếu hết$/, ' là chiếu hết')}` : '');
    }
    if (prevBad && cls !== 'inaccuracy' && (ctx.winBefore ?? 0) >= 60) {
      const b = bestText();
      return say(`${me} bỏ lỡ cơ hội trừng phạt, ${act}${why.length ? ` ${why.join(', ')}` : ''}`, b ? `Đáng lẽ ${me} nên ${b}` : '');
    }
    if (takesBait) return say(`Tưởng ${them} hớ hênh, ${me} nhanh chóng ${act}, mồm kêu mình xin`, refute());
    if (x.captured && !recapture && cls !== 'inaccuracy')
      return say(pick(`Tưởng ngon, ${line('')}`, `${me} hí hửng ${act}${why.length ? ` ${why.join(', ')}` : ''}, tưởng ngon nhưng không phải`), refute());
    if (cls === 'blunder') {
      const r0 = ctx.refutationPv?.[0] ? inspect(afterFen, ctx.refutationPv[0]) : null;
      const forgot = !r0
        ? ''
        : r0.mate
          ? ` ${cap(me)} đã không nhìn thấy đòn chiếu hết`
          : r0.captured && r0.to === x.to && WORTH[x.piece] >= 3
            ? ` ${cap(me)} đã dâng ${PW[x.piece]} cho đối thủ`
            : r0.from !== P?.to && r0.piece !== 'p' && (r0.captured || r0.check || r0.threats.length >= 2) && !x.threats.some((t) => t.square === r0.from)
            ? ` ${cap(me)} đã quên mất ${them} còn con ${PW[r0.piece]} ở ${SQ(r0.from)}`
            : '';
      return say(`${line('')}. Một sai lầm nghiêm trọng!${forgot}`, refute());
    }
    if (cls === 'mistake') {
      const b = bestText();
      const main = b ? `Ở đây ${me} nên ${b}. Song ${me} lại có vẻ lóng ngóng khi ${act}` : `${line('')}, nước đi chưa ổn`;
      return say(main, refute());
    }
    const b = bestText();
    return say(line(''), b ? `Hay hơn là ${b}` : '');
  }

  // ----- forced replies
  if (cls === 'forced') {
    const behind = x.lead <= -6 && x.check ? ` dù đang kém cả một sư đoàn quân` : '';
    return say(`Cực chẳng đã, ${me} buộc phải ${verb(x, first, recapture)}${x.check ? ' chiếu' : ''}${behind}`);
  }

  if (x.promotion === 'q') return say(`${prevBad ? 'Chỉ chờ có thế, ' : ''}${me} ${act} — thái giám hoá thái hậu!`);
  if (x.promotion) return say(`${me} ${act} thay vì phong hậu`);

  // ----- sacrifices
  const sac = (tags.has('sac') || (x.givesUp && !recapture)) && strong && winAfter >= 40;
  if (sac) {
    const bait = f.bait ?? { type: x.piece, square: x.to };
    const w1 = why.slice(0, 1);
    // Far ahead already: giving something back is just being relaxed.
    if (x.lead >= 6 && (ctx.winBefore ?? 0) >= 90 && !['brilliant', 'great'].includes(cls))
      return say(`Có lẽ hơn quá nhiều quân rồi nên ${me} thản nhiên ${act}${w1.length ? ` ${w1[0]}` : ''}`);
    const lead = tags.has('comboSac') && STRONG.has(ctx.myPrev?.cls)
      ? 'Chót đâm lao thì phải theo lao, '
      : prevBad
        ? 'Chỉ chờ có thế, '
        : pick(`Không ngờ ${them} lại gặp phải thằng liều, `, '');
    const actQ = act.replace(/^(phi|tung|lao) hậu/, 'phi thẳng hậu');
    let main;
    if (bait.type === 'q' && bait.square === x.to)
      main = f.forcedTake
        ? `${line(lead, w1)}, nhét hậu vào mồm bắt ${them} phải ăn`
        : `${lead}${me} ${actQ}${w1.length ? ` ${w1[0]}` : ''}, dí hậu vào mồm ${them} thách ăn`;
    else if (bait.square !== x.to) main = `${line(lead, w1)}, bỏ cả ${named(bait)} mời ${them} xơi`;
    else if (bait.type === 'r') main = `${line(lead, w1)}, dí xe vào mồm ${them} thách ăn`;
    else main = `${line(lead, w1)}, bỏ cả ${PW[bait.type]} mời ${them} xơi`;
    const flourish = f.forcedTake ? '' : pick(` Có lẽ ${me} đang khuấy động lòng tham của đối thủ.`, ' Một nước cờ khiến cả bàn cờ bùng nổ!', '');
    let whatIf = '';
    if (ctx.pv.length > 2 && !f.forcedTake) {
      const c = new Chess(afterFen);
      try {
        const reply = c.move(uciToMove(ctx.pv[1]));
        if (reply.to === bait.square && ctx.nextUci !== ctx.pv[1])
          whatIf = story('Nếu mà ', afterFen, ctx.pv.slice(1), ctx.names, { hook: pick('tưởng ngon ', 'mất cảnh giác ', 'tham ăn '), plies: 5 });
      } catch {
        /* stale line */
      }
    }
    return say(`${main}${cls === 'brilliant' ? '!' : '.'}${flourish}`, whatIf);
  }

  // ----- answers to a sacrifice
  if (takesBait)
    return say(
      pick(
        `Mặc dù giật mình trước sự liều lĩnh của đối thủ, ${me} vẫn ${act}`,
        `Được ${them} cho quà, ${me} nhanh chóng ${act}`,
        `Tưởng ${them} hớ hênh, ${me} nhanh chóng ${act}, mồm kêu mình xin`,
      ),
    );
  if (payoff)
    return say(
      `Thế nhưng không phải tự nhiên mà ${me} lại dâng ${PW[P.captured]} cho đối thủ xơi! ${cap(me)} lập tức ${act}${why.length ? ` ${why.join(', ')}` : ''}`,
    );
  if (prevSac && !x.captured && strong) {
    if (cls === 'great' || x.inCheckBefore)
      return say(`Trong cái khó ló cái khôn, ${me} vẫn tìm ra nước phòng thủ chuẩn xác khi ${act}${why.length ? ` ${why.join(', ')}` : ''}`);
    return say(`${me} không tham ăn, ${act}${why.length ? ` ${why.join(', ')}` : ''}`);
  }
  // Left something en prise on purpose, and we wisely don't take it.
  const poison = P && STRONG.has(prevCls) && !x.captured && !x.inCheckBefore ? poisoned(x.before, ctx.lines) : null;
  if (poison && strong && !x.check) {
    return say(`Biết rằng quân ${PW[poison.type]} này có tẩm thuốc độc nên ${me} không dám đú đởn ăn uống linh tinh, ${act}${why.length ? ` ${why.join(', ')}` : ''}`);
  }

  // What a capture wins, in the channel's words.
  const yum = () => {
    if (!x.captured || recapture || !x.safe) return '';
    // A fair trade isn't a gift.
    if (x.after.attackers(x.to, x.opp).length && WORTH[x.captured] <= WORTH[x.piece]) return '';
    if (x.captured === 'q') return ', múc được em hậu thơm phức';
    if (x.captured === 'r') return ', chén em xe thơm phức';
    if (WORTH[x.captured] >= 3) return ', mồm kêu mình xin';
    return '';
  };

  // ----- the knight fork, capture or not
  const fork = x.threats.length >= 2 || (x.check && x.threats.some((t) => WORTH[t.type] >= 5) && !x.checkerTakeable);
  if (x.piece === 'n' && fork && strong)
    return say(`${prevBad ? 'Chỉ chờ có thế, ' : ''}${me} xuất chiêu thần mã hoá thần Zeus, ${act} ${why.join(', ')}!`);

  // ----- pouncing on their mistake
  if (prevBad && strong && !recapture && (x.captured || x.check || x.threats.length)) {
    if (x.piece === 'q' && x.captured === 'r' && x.safe) return say(`Lớp trưởng vồ lớp phó! ${cap(me)} lập tức ${act}${why.length ? ` ${why.join(', ')}` : ''}`);
    const lead = x.captured && x.safe ? pick('Chỉ chờ có thế, ', 'Không chậm trễ, ', `Được ${them} cho quà, `) : pick('Chỉ chờ có thế, ', 'Không chậm trễ, ');
    const how = lead.startsWith('Được') ? `nhanh chóng ${act}` : `lập tức ${act}`;
    return say(`${line(lead, why, how)}${yum()}`);
  }
  const gà =
    (ctx.oppBad ?? 0) >= 2 && BAD.has(prevCls) && strong && ((x.captured && WORTH[x.captured] >= 3) || x.check || x.threats.some((t) => WORTH[t.type] >= 3))
      ? `Thấy ${them} có vẻ gà, `
      : '';

  // ----- captures
  if (recapture) {
    if (x.inCheckBefore) return say(`Theo bản năng, ${line('')}`);
    return say(line(''));
  }
  if (x.captured) {
    const trade = WORTH[x.captured] === WORTH[x.piece] && !x.safe;
    const pressed = P && (P.threats.length || P.tradeOffer);
    if (trade && pressed && x.piece !== 'p')
      return say(`${pick('Không muốn lằng nhằng', 'Không muốn đôi co nhiều với đối thủ')}, ${me} liền choảng luôn ${PW[x.piece]} vào ${x.captured === x.piece ? SQ(x.to) : `${PW[x.captured]} ${SQ(x.to)}`}${why.length ? ` ${why.join(', ')}` : ''}`);
    if (x.piece === 'k' && x.captured === 'q') return say(`Thượng đế bế quan âm! ${cap(me)} ${act}`);
    if (x.piece === 'q' && x.captured === 'r' && x.safe) return say(`Lớp trưởng vồ lớp phó! ${line('')}`);
    const big = winAfter >= 85 && WORTH[x.captured] >= 3;
    return say(`${line(gà, why, big && !gà ? `lạnh lùng ${act}` : act)}${yum()}`);
  }

  // ----- defence
  if (x.blocksCheck) return say(pick(`Theo bản năng, ${line('')}`, line('')));
  if (x.piece === 'k' && x.inCheckBefore) {
    if (tags.has('chased') && x.retreat) return say(`Không muốn bị ${them} tấn công nữa, ${me} kéo vua chạy hẳn về ${SQ(x.to)}`);
    if (tags.has('chased')) return say(`Bị truy sát ráo riết, ${line('')}`);
    return say(line('', why.length ? why : ['tránh chiếu']));
  }
  if ((f.stoppedMate || x.stopsMate) && strong && !x.check) return say(`Thấy nguy, ${me} vội ${act} chặn đứng đòn chiếu hết${why.filter((w) => w !== 'chặn đòn chiếu hết').length ? `, ${why.filter((w) => w !== 'chặn đòn chiếu hết').join(', ')}` : ''}`);
  if (P?.tradeOffer?.square === x.from && !x.captured && !P.threats.some((t) => t.square === x.from))
    return say(line('', why.length && !why[0].startsWith('chuẩn bị') ? why : ['tránh giao chiến']));
  if (x.escape && x.piece !== 'p') {
    const rest = why.filter((w) => /^(tấn công|đuổi|bắt|uy hiếp|gạ đổi|ghim|xiên|chiếu|dọa)/.test(w));
    const also = rest.length ? `, đồng thời ${rest[0]}` : '';
    const chasedTwice = M?.escape && M.to === x.from;
    if (x.piece === 'r' && x.retreat) return say(`${chasedTwice ? 'Bị truy sát, ' : 'Thấy nguy, '}${me} cho xe tăng cài số lùi về ${SQ(x.to)}${also}`);
    if (x.piece === 'q' && !chasedTwice && !x.check) return say(`Thấy nguy, ${me} vội ${act} né đòn${also}`);
    return say(`${chasedTwice ? 'Bị truy sát, ' : ''}${me} ${act} né đòn${also}`);
  }
  if (x.defends && P?.threats.some((t) => t.square === x.defends.square))
    return say(x.piece === 'r' && x.retreat ? `Thấy vậy, ${me} cho xe tăng cài số lùi về ${SQ(x.to)} ${why.join(', ')}` : line('Thấy vậy, '));

  // ----- attack
  const chase = M && P && M.threats.some((t) => t.square === P.from) && x.threats.some((t) => t.square === P.to);
  if (chase) {
    const t = x.threats.find((u) => u.square === P.to);
    return say(`Chưa dừng lại ở đó, ${me} ${act} tiếp tục truy sát ${PW[t.type]}`);
  }
  if (x.check && tags.has('matingNet')) return say(`${gà}${me} tung đòn chiếu sát thủ, ${act}${why.length > 1 ? ` ${why.slice(1).join(', ')}` : ''}`);
  const loud = x.check || x.threats.some((t) => WORTH[t.type] >= 3) || x.mateThreat || x.pin;
  if (x.piece === 'r' && x.lateral && x.relTo >= 2 && loud && strong)
    return say(`${gà}${me} xuất chiêu YouTuber lái wave tàu, ${act} ${why.join(', ')}`);
  if (x.piece === 'r' && x.forward && x.relTo - x.relFrom >= 2 && loud && strong)
    return say(`${gà}${me} xuất chiêu la hán đẩy xe bò, lao thẳng xe ${x.dir} ${SQ(x.to)} ${why.join(', ')}`);
  const pushing =
    M && x.forward && !x.captured && (x.threats.length || x.storm || x.lever || x.mateThreat) &&
    ((M.to === x.from && M.forward) || (P && (P.escape || P.retreat) && M.threats.length));
  if (pushing && strong) return say(line('Thừa thế xông lên, '));
  if (x.piece === 'p' && x.threats.some((t) => 'nb'.includes(t.type) && t.square !== P?.to && x.relTo <= 4)) {
    const t = x.threats.find((u) => 'nb'.includes(u.type));
    if (rel(color, t.square) <= 4 && hash(ctx.seed) % 2)
      return say(`Ngứa mắt với con ${PW[t.type]} cứ lượn lờ, ${me} ${act} đuổi ${PW[t.type]}, mồm kêu biến`);
  }
  if (strong && cls !== 'excellent' && !x.check && !x.threats.length && TACTIC.some((t) => f.followTags?.has(t))) {
    let whatIf = '';
    if (ctx.pv.length > 2 && ctx.nextUci !== ctx.pv[1]) {
      const r = inspect(afterFen, ctx.pv[1]);
      if (r?.captured) whatIf = story('Trường hợp mà ', afterFen, ctx.pv.slice(1), ctx.names, { hook: 'tưởng ngon ', plies: 5 });
    }
    return say(`${line('')}, âm thầm chuẩn bị một mưu đồ đen tối`, whatIf);
  }
  // A bishop with something juicy in its sights.
  const juicy = x.threats.find((t) => 'qrk'.includes(t.type)) ?? (x.pin && 'qrk'.includes(x.pin.back.type) ? x.pin.back : null);
  if (x.piece === 'b' && juicy && strong && !x.check)
    return say(`${line(gà)}, voi chiến chảy nước miếng nhìn về phía ${PW[juicy.type]} ${them}`);
  if (x.mateThreat && strong) return say(line(gà || pick('', 'Không chậm trễ, ')));
  if (x.check && strong && x.piece === 'q' && x.forward && winAfter >= 85) return say(line(gà, why, `lạnh lùng ${act}`));
  // Quietly lining up on the king or a big piece.
  if ('qrb'.includes(x.piece) && strong && !x.check && !x.threats.length && !x.captured && (x.eyesKing || (x.pressure && x.pressure.type !== 'p'))) {
    const target = x.pressure && x.pressure.type !== 'p' ? nameOf(x.pressure) : `vua ${them}`;
    const where = `${PW[x.piece]} ${x.dir} ${SQ(x.to)}`;
    if (hash(ctx.seed) % 2) return say(`${me} đem ${where} rình rập ${target}`);
  }

  // ----- castling and calm moves
  if (x.castle) {
    if (castled(x.before, x.opp)) return say(`Không dám nấn ná để vua ở giữa bàn cờ lâu, ${me} vội vã nhập thành${x.castle === 'long' ? ' cánh hậu' : ''}, đưa vua vào vùng an toàn`);
    if (M?.storm || M?.threats.length) return say(`Chưa thể đánh nhanh thắng nhanh, ${me} ${act} mau chóng đưa vua vào vùng an toàn`);
    return say(line(''));
  }
  if (P?.storm && !x.captured && strong && !P.threats.length)
    return say(line('Không hề nao núng, '));
  if (x.piece === 'r' && x.retreat && x.relFrom - x.relTo >= 2) return say(`${me} cho xe tăng cài số lùi về ${SQ(x.to)}${why.length ? ` ${why.join(', ')}` : ''}`);
  // Cruising to victory.
  if (winAfter >= 95 && x.lead >= 5 && strong && !x.check && !x.captured && hash(ctx.seed) % 3 === 0)
    return say(`Thắng thế quá rõ, ${me} ${act}${why.length ? ` ${why.join(', ')}` : ''}, rung đùi chờ ${them} quit game`);

  // ----- opening moves
  if (ctx.ply === 1) return say(`${me} ${pick('khai cuộc', 'mở màn ván cờ')} bằng nước ${PW[x.piece]} ${SQ(x.to)}${why.length ? `, ${why.join(', ')}` : ''}`);
  if (ctx.ply === 2) return say(`${me} nhanh chóng đáp trả ${act}${why.length ? ` ${why.join(', ')}` : ''}`);

  const adv = x.threats.some((t) => t.type !== 'p') && x.forward && !x.develop && hash(ctx.seed) % 3 === 0 ? pick('mạnh mẽ ', 'hùng hổ ') : '';
  return say(`${line(gà, why, adv + act)}${cls === 'brilliant' ? '. Một nước đi thiên tài!' : ''}`);
}

/**
 * A piece the opponent left en prise that the engine says not to take: the
 * capture is ranked well below the best move, or misses the top lines while
 * even the third line is clearly worse.
 */
function poisoned(before, lines) {
  if (!lines?.length) return null;
  const best = winPct(lines[0]);
  const me = before.turn();
  for (const m of before.moves({ verbose: true })) {
    if (!m.captured || m.captured === 'k') continue;
    if (!isHanging(before, m.to)) continue;
    if (!pieces(before, other(me)).some((p) => p.square === m.to)) continue;
    const uci = m.from + m.to + (m.promotion ?? '');
    const own = lines.find((l) => l.pv[0] === uci);
    // Poison means the grab actually backfires, not just that something else is stronger.
    const last = winPct(lines[lines.length - 1]);
    const clearlyWorse = own ? best - winPct(own) >= 20 && winPct(own) <= 55 : lines.length >= 3 && best - last >= 20 && last <= 55;
    if (clearlyWorse) return { type: m.captured, square: m.to };
  }
  return null;
}

const TACTIC = ['knightFork', 'fork', 'royalFork', 'skewer', 'pinKing', 'discoveredCheck', 'mateThreat', 'matingNet'];
const rel = (color, sq) => (color === 'w' ? +sq[1] : 9 - +sq[1]);
