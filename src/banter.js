// "Bình luận vui": play-by-play commentary in the voice of Vietnamese chess
// YouTube. Every move is narrated like a live broadcast:
//
//   [connector]  [actor] [piece verb + square] [purpose], [flourish]. [What if…]
//   "Chỉ chờ có thế, Trắng nhảy mã G5 nhắm vào điểm yếu F7."
//   "Tưởng Trắng hớ hênh, Đen nhanh chóng ăn tượng vào tốt A6, mồm kêu mình xin."
//   "Nếu Đen tham ăn thì Trắng sẽ ăn hậu vào tốt F7 chiếu, Đen chạy vua sang D8…"
//
// Phrases are original lines written in that style (plus the catchphrases the
// channel is known for). Edit freely.

import { Chess } from 'chess.js';
import { describeMove } from './explain.js';
import { uciToMove } from './classify.js';

const PW = { k: 'vua', q: 'hậu', r: 'xe', b: 'tượng', n: 'mã', p: 'tốt' };
const WORTH = { k: 100, q: 9, r: 5, b: 3, n: 3, p: 1 };
const STRONG = new Set(['brilliant', 'great', 'best', 'excellent']);
const BAD = new Set(['blunder', 'mistake', 'inaccuracy']);
const TACTICAL = ['mate', 'matingNet', 'sac', 'knightFork', 'fork', 'royalFork', 'pawnFork', 'freeQueen', 'mateThreat', 'discoveredCheck', 'skewer', 'pinKing', 'promoteQueen'];

const SQ = (s) => s.toUpperCase();
const term = (t) => `${PW[t.type]} ${SQ(t.square)}`;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) >>> 0;
  return h;
}

function picker(seed) {
  let n = 0;
  return (...options) => options[hash(`${seed}|${n++}`) % options.length];
}

/** "nhảy mã F3", "kéo tượng lui về F1", "ăn hậu vào xe D8", "lắc xe qua D8"… */
function action(f, tags, pick, plain = false) {
  if (plain) pick = (first) => first;
  const P = PW[f.piece];
  const S = SQ(f.to);
  const dir = f.forward ? 'lên' : f.retreat ? 'về' : 'sang';
  if (tags.has('castleShort')) return 'nhập thành';
  if (tags.has('castleLong')) return 'nhập thành dài';
  if (f.promotion) return `${f.captured ? 'ăn' : 'đẩy'} tốt ${f.captured ? 'sang' : 'lên'} ${S} phong ${PW[f.promotion]}`;
  if (f.captured) {
    const C = PW[f.captured];
    if (f.piece === 'p') return `ăn tốt sang ${S}`;
    if (f.piece === 'k') return `ăn vua ${dir} ${S}`;
    return pick(`ăn ${P} vào ${C} ${S}`, `ăn ${P} vào ${C} ${S}`, `phang thẳng ${P} vào ${C} ${S}`);
  }
  switch (f.piece) {
    case 'p':
      return pick(`đẩy tốt ${S}`, `tiến tốt ${dir} ${S}`);
    case 'n':
      if (f.retreat) return `lùi mã về ${S}`;
      if (f.develop) return pick(`phát triển mã lên ${S}`, `nhảy mã ${S}`);
      return pick(`nhảy mã ${S}`, `tung mã ${dir} ${S}`);
    case 'b':
      if (f.retreat) return `kéo tượng lui về ${S}`;
      if (f.develop) return `triển khai tượng lên ${S}`;
      return pick(`phi tượng ${dir} ${S}`, `đưa tượng ${dir} ${S}`);
    case 'q':
      if (f.retreat) return pick(`kéo hậu lui về ${S}`, `giật hậu về ${S}`);
      return f.forward ? `phi hậu lên ${S}` : `chạy hậu sang ${S}`;
    case 'r':
      if (f.sameRank) return pick(`lắc xe qua ${S}`, `đưa xe sang ${S}`);
      if (f.forward && f.check) return `lao thẳng xe xuống ${S}`;
      return f.forward ? pick(`đẩy xe lên ${S}`, `lao thẳng xe xuống ${S}`) : `kéo xe lui về ${S}`;
    case 'k':
      return pick(`chạy vua ${dir} ${S}`, `kéo vua ${dir} ${S}`);
  }
  return `đi ${f.san}`;
}

/** Why the move is played, in commentator words: "nhắm vào điểm yếu F7", "chiếu bắt xe"… */
function purpose(f, tags, opening, color) {
  const parts = [];
  if (tags.has('mate')) return '';
  if (f.check) {
    const extra = f.forkOn.find((t) => t.type !== 'k');
    if (extra) parts.push(`chiếu bắt ${PW[extra.type]}`);
    else if (tags.has('discoveredCheck')) parts.push('chiếu trộm');
    else if (tags.has('chaseKing')) parts.push('chiếu bồi');
    else parts.push('chiếu');
  } else if (f.blocksCheck) parts.push('cản chiếu');

  if (f.stoppedMate) parts.push('chặn đứng đòn chiếu hết');
  else if (!f.check && f.forkOn.length >= 2) parts.push(`chĩa đôi ${f.forkOn.map(term).join(' và ')}`);
  else if (f.pin?.kind === 'pin') parts.push(`tung đòn ghim khống chế ${term(f.pin.frontOn)}`);
  else if (f.pin) parts.push(`xiên thẳng vào ${term(f.pin.frontOn)}`);
  else if (f.mateThreat) parts.push(f.weakPoint ? `nhắm vào điểm yếu ${SQ(f.weakPoint)}` : 'dọa chiếu hết');
  else if (f.weakPoint) parts.push(`nhắm vào điểm yếu ${SQ(f.weakPoint)}`);
  else if (f.tradeOffer && !f.captured) parts.push(`gạ đổi ${PW[f.tradeOffer.type]}`);
  else if (f.threatOn && !f.check && !f.captured) {
    const t = f.threatOn;
    if (!t.mild) parts.push(`${WORTH[f.piece] < WORTH[t.type] ? 'đuổi' : 'tấn công'} ${t.type === 'p' ? term(t) : PW[t.type]}`);
    else if (f.piece === 'q' || f.piece === 'r') parts.push(`rình rập ${term(t)}`);
  } else if (f.threatOn && f.captured && !f.check && !f.threatOn.mild) parts.push(`bắt ${PW[f.threatOn.type]}`);

  if (f.opened && parts.length < 2) parts.push(`mở đường cho ${PW[f.opened.by]} tấn công ${PW[f.opened.type]}`);
  if (!parts.length && f.protected) parts.push(`bảo vệ ${PW[f.protected]}`);
  if (!parts.length && (tags.has('castleShort') || tags.has('castleLong'))) parts.push('đưa vua vào nơi an toàn');
  if (!parts.length && (f.followTags.has('castleShort') || f.followTags.has('castleLong'))) parts.push('chuẩn bị nhập thành');
  if (!parts.length && f.piece === 'p' && ['d4', 'e4', 'd5', 'e5'].includes(f.to)) parts.push('chiếm trung tâm');
  const out = parts.slice(0, 2);
  if (opening) out.push(color === 'w' ? `sử dụng ${opening}` : `chọn ${opening}`);
  return out.join(', ');
}

function describe(fen, pv, prevUci, pick) {
  const d = describeMove(fen, { pv }, { max: 1, shallow: true, prevUci });
  const why = purpose(d.facts, d.tags, null, fen.split(' ')[1]);
  return { d, text: `${action(d.facts, d.tags, pick)}${why ? ` ${why}` : ''}` };
}

/**
 * Tell a line of moves as a story: "Đen sẽ ăn tượng vào mã C6 chiếu, Trắng chạy vua sang D1
 * thì Đen sẽ ăn hậu sang C2 chiếu bồi… và cờ trắng sẽ toang".
 */
function storyOf(fen, pv, names, pick, plies = 4) {
  const chess = new Chess(fen);
  const first = chess.turn();
  const countFor = (c) =>
    chess.board().flat().filter((p) => p && p.color === c).reduce((s, p) => s + (p.type === 'k' ? 0 : WORTH[p.type]), 0);
  const balance = () => countFor(first) - countFor(first === 'w' ? 'b' : 'w');
  const start = balance();
  let prevUci = null;
  let text = '';
  for (let i = 0; i < Math.min(pv.length, plies); i++) {
    const color = chess.turn();
    const { text: t } = describe(chess.fen(), pv.slice(i), prevUci, pick);
    let m;
    try {
      m = chess.move(uciToMove(pv[i]));
    } catch {
      break;
    }
    prevUci = m.captured ? pv[i] : null;
    if (i === 0) text = `${names[color]} sẽ ${t}`;
    else if (i % 2 === 1) text += `, ${names[color]} ${t}`;
    else text += ` thì ${names[color]} sẽ ${t}`;
    if (chess.isCheckmate()) return `${text} — chiếu hết!`;
  }
  const swing = balance() - start;
  const loser = first === 'w' ? 'đen' : 'trắng';
  if (swing >= 3) text += ` và cờ ${loser} sẽ toang`;
  return text;
}

/**
 * @param {object} ctx
 * @param {object} ctx.facts / ctx.tags  from describeMove() (+ game context tags)
 * @param {string} [ctx.cls]   move class
 * @param {'w'|'b'} ctx.color  side that moved
 * @param {{w: string, b: string}} ctx.names  how to call each side ("Trắng", "Bạn", "Nakamura"…)
 * @param {object} [ctx.prev]  opponent's previous move: { cls, tags, facts }
 * @param {number} ctx.oppBad  opponent's weak moves among their last three
 * @param {number} [ctx.winAfter] mover's win % after the move
 * @param {string} ctx.fen     position before the move
 * @param {string[]} ctx.pv    engine line starting with this move
 * @param {string[]} [ctx.refutationPv] best line for the opponent after a weak move
 * @param {string[]} [ctx.bestPv] best line instead of a weak move
 * @param {string} [ctx.nextUci] the move actually played next (to avoid telling what happens anyway)
 * @param {string} [ctx.opening] opening name reached by this move
 * @param {number} ctx.ply     half-moves played including this one
 * @param {boolean} [ctx.short] one sentence only (hint list)
 * @param {string} ctx.seed
 */
export function commentate(ctx) {
  const { facts: f, tags, cls, color } = ctx;
  if (!f) return null;
  const pick = picker(ctx.seed);
  const oppColor = color === 'w' ? 'b' : 'w';
  const me = ctx.names[color];
  const them = ctx.names[oppColor];
  const meColor = color === 'w' ? 'trắng' : 'đen';
  const strong = !cls || STRONG.has(cls);
  const act = action(f, tags, pick);
  const actC = `${act}${f.check ? ' chiếu' : ''}`; // action alone, keeping the check
  const why = purpose(f, tags, ctx.opening, color);
  const base = `${act}${why ? ` ${why}` : ''}`;
  const prev = ctx.prev;
  const prevStrongSac = prev?.tags?.has('sac') && STRONG.has(prev?.cls);
  const bait = prev?.facts?.bait?.square ?? (prev?.tags?.has('sac') ? prev?.facts?.to : null);
  const takesBait = f.captured && prevStrongSac && bait === f.to;
  const afterFen = (() => {
    const c = new Chess(ctx.fen);
    try {
      c.move(uciToMove(ctx.pv[0]));
    } catch {
      /* ignore */
    }
    return c.fen();
  })();
  const say = (main, whatIf) => {
    let out = cap(main.trim());
    if (!/[.!?…]$/.test(out)) out += '.';
    if (whatIf && !ctx.short) out += ` ${cap(whatIf)}${/[.!?]$/.test(whatIf) ? '' : '.'}`;
    return out;
  };

  // How the move connects to what just happened.
  let lead = me;
  if (tags.has('turnaround') && strong) lead = `Lật kèo! ${me}`;
  else if (['mistake', 'blunder'].includes(prev?.cls) && strong) lead = pick(`Chỉ chờ có thế, ${me}`, `Không chậm trễ, ${me}`, `Được ${them} cho quà, ${me} nhanh chóng`);
  else if (ctx.oppBad >= 2 && strong && (f.check || f.captured || f.threatOn || f.mateThreat)) lead = `Thấy ${them} có vẻ gà, ${me}`;

  // ----- weak moves
  if (BAD.has(cls)) {
    const refute =
      ctx.refutationPv?.length && ctx.nextUci !== ctx.refutationPv[0]
        ? `Lúc này ${storyOf(afterFen, ctx.refutationPv, ctx.names, pick, 3)}`
        : '';
    if (tags.has('missedMate')) return say(`${me} ${base}, bỏ lỡ cơ hội chiếu hết ngay trước mắt!`);
    if (tags.has('bongcloud')) return say(`${me} ${act} — cho thượng đế xuất cung từ sớm, liều hay là tự tin đây?`, refute);
    if (tags.has('earlyQueen')) return say(`${me} ${act}, cho em hậu ra trận quá sớm — coi chừng bị quân nhỏ rượt chạy khắp bàn!`, refute);
    if (f.captured && cls !== 'inaccuracy')
      return say(`Tưởng ${them} hớ hênh, ${me} nhanh chóng ${act}, mồm kêu mình xin`, refute);
    if (cls === 'blunder') return say(`${me} ${base}. Một sai lầm chết người!`, refute);
    if (cls === 'mistake') return say(`${me} ${base}, tưởng ngon nhưng lại là sai lầm`, refute);
    const better = ctx.bestPv?.length ? describe(ctx.fen, ctx.bestPv, null, pick).text : '';
    return say(`${me} ${base}, nước đi chưa thật chính xác`, better ? `Hay hơn là ${better}` : '');
  }

  // ----- game over
  if (tags.has('mate')) {
    const tail = tags.has('longFinish') ? ` Sau ${Math.ceil(ctx.ply / 2)} nước giằng co, một cái kết đẳng cấp!` : '';
    const how = tags.has('smothered') ? `${act}, thần mã luồn vào tận hậu cung` : act;
    return say(`${lead} ${how} — chiếu hết trong sự ngỡ ngàng của ${them}!${tail}`);
  }
  if (tags.has('stalemate')) return say(`${me} ${act}… ôi không, thượng đế ${them} hết nước đi — hòa pat! Thắng đến nơi mà tiếc đứt ruột`);

  // ----- forced replies and sacrifices accepted / declined
  if (cls === 'forced') return say(`Cực chẳng đã, ${me} đành ${action(f, tags, pick, true)}${f.check ? ' chiếu' : ''}`);
  if (takesBait) {
    return ['brilliant', 'great'].includes(prev.cls)
      ? say(pick(`Dù hơi chột dạ trước độ liều của đối thủ, ${me} vẫn ${act}`, `${me} đâu có ngại, ${act} luôn`))
      : say(`Được ${them} cho quà, ${me} nhanh chóng ${act}`);
  }
  if (prev?.facts?.captured && ['mistake', 'blunder'].includes(prev.cls) && strong) {
    return say(`Nhưng ${me} dâng ${PW[prev.facts.captured]} cho đối thủ xơi đâu phải vô cớ! ${cap(me)} lập tức ${base}`);
  }
  if (prevStrongSac && !f.captured && strong && cls !== 'excellent') {
    return say(
      cls === 'great'
        ? `Trong cái khó ló cái khôn, ${me} không tham ăn mà tìm ra nước phòng thủ chuẩn xác: ${base}`
        : `${me} không tham ăn, ${base}`,
    );
  }

  if (f.promotion) return say(`${lead} ${act} — thái giám hoá thái hậu!`);

  // ----- sacrifices
  const givesUp = f.captured && f.hanging && WORTH[f.piece] - WORTH[f.captured] >= 2 && f.piece !== 'k';
  if ((tags.has('sac') || givesUp) && strong && (ctx.winAfter ?? 50) >= 40) {
    // "Already up so much he can afford it" — only when really far ahead in material.
    const board = new Chess(ctx.fen).board().flat().filter(Boolean);
    const mat = (c) => board.filter((p) => p.color === c && p.type !== 'k').reduce((sum, p) => sum + WORTH[p.type], 0);
    const calm =
      (ctx.winAfter ?? 0) >= 90 && mat(color) - mat(oppColor) >= 5 && !['brilliant', 'great'].includes(cls) && !tags.has('matingNet');
    if (calm) return say(`Có lẽ hơn quá nhiều quân rồi nên ${me} thản nhiên ${base}`);
    const pre = tags.has('comboSac') ? pick(`Chót đâm lao thì phải theo lao, ${me}`, `${me} tiếp tục chơi lớn,`) : lead;
    const oneWhy = why.split(', ')[0];
    const sacBase = `${act}${oneWhy ? ` ${oneWhy}` : ''}`;
    let main;
    if (tags.has('sacQ') && (f.forcedTake || f.check)) main = `${pre} ${sacBase}, nhét hậu vào mồm bắt ${them} ăn!`;
    else if (f.bait && f.bait.square !== f.to) main = `${pre} ${sacBase}, bỏ cả ${term(f.bait)} mời ${them} xơi!`;
    else main = `${pre} ${sacBase}, dí ${PW[f.piece]} vào mồm thách ${them} ăn!`;
    const flourish = pick(`${them} không ngờ lại gặp phải thằng liều.`, 'Bàn cờ như nổ tung!', `${cap(me)} đang thả mồi thử lòng tham của đối thủ.`);
    let whatIf = '';
    const baitSq = f.bait?.square ?? f.to;
    if (ctx.pv.length > 2) {
      const c = new Chess(afterFen);
      try {
        const reply = c.move(uciToMove(ctx.pv[1]));
        if (reply.to === baitSq && ctx.nextUci !== ctx.pv[1]) {
          whatIf = `Nếu ${them} tham ăn thì ${storyOf(c.fen(), ctx.pv.slice(2), ctx.names, pick, 3)}`;
        }
      } catch {
        /* stale line */
      }
    }
    return say(`${main} ${flourish}`, whatIf);
  }

  // ----- big tactics and big captures
  if (tags.has('knightFork')) return say(`${lead} xuất chiêu thần mã hoá thần Zeus, ${act} chĩa đôi ${f.forkOn.map(term).join(' và ')}!`);
  if (f.piece === 'k' && f.captured === 'q') return say(`Thượng đế bế quan âm! ${cap(me)} ${act}`);
  if (f.captured === 'q') return say(`${lead} ${actC}, múc được em hậu thơm phức!`);
  if (f.piece === 'q' && f.captured === 'r') return say(`Lớp trưởng vồ lớp phó! ${cap(me)} ${act}`);
  if (tags.has('recapture')) return say(`Theo bản năng, ${me} ${action(f, tags, pick, true)}${f.check ? ' chiếu' : ''}`);
  if (f.captured === 'r' && strong) return say(`${lead} ${actC}, chén em xe thơm phức!`);
  if ((tags.has('freePiece') || tags.has('freeQueen')) && strong) return say(`${lead} ${actC}, mồm kêu mình xin`);
  if (tags.has('matingNet') && f.check) return say(`${lead} tung đòn chiếu sát thủ, ${base}!`);
  if (tags.has('matingNet')) return say(`${lead} ${base}, giăng lưới ép thượng đế ${them} vào tuyệt lộ!`);

  // ----- defence
  if (cls === 'great' && (f.inCheckBefore || f.stoppedMate || tags.has('escape') || (ctx.winAfter ?? 50) < 45))
    return say(`Trong cái khó ló cái khôn, ${me} vẫn tìm ra nước phòng thủ chuẩn xác khi ${base}`);
  if (f.stoppedMate || (tags.has('escape') && f.piece !== 'p')) {
    if (f.piece === 'r' && f.retreat) return say(`Thấy nguy, ${me} cho xe tăng cài số lùi về ${SQ(f.to)}`);
    return say(`Thấy nguy, ${me} vội ${base}`);
  }
  if (f.piece === 'k' && f.inCheckBefore) {
    return tags.has('chased') ? say(pick(`Bị truy sát ráo riết, ${me} ${act}`, `Thượng đế ${meColor} lại phải ${act}`)) : say(`${me} ${base}`);
  }

  // ----- building the attack
  const notable = f.check || f.threatOn?.mild === false || f.mateThreat || f.opened || f.pin;
  if (f.piece === 'r' && f.sameRank && notable && strong) return say(`${lead} xuất chiêu YouTuber lái wave tàu, ${base}!`);
  if (f.piece === 'r' && f.forward && f.ranks >= 2 && notable && strong) return say(`${lead} xuất chiêu la hán đẩy xe bò, ${base}!`);
  if (strong && cls !== 'excellent' && !f.check && !f.captured && TACTICAL.some((t) => f.followTags.has(t)))
    return say(`${lead} ${base}, âm thầm chuẩn bị một mưu đồ đen tối`);
  if (f.piece === 'b' && (f.pin || (f.threatOn && !f.threatOn.mild)) && strong) return say(`${lead} ${base} — voi chiến chảy nước miếng!`);
  if ((f.mateThreat || f.weakPoint) && strong)
    return say(`${lead} ${base}. ${pick('Một nước cờ tấn công cực kỳ quyết liệt!', 'Không hề nao núng!', 'Đòn tấn công bắt đầu!')}`);
  if ((ctx.winAfter ?? 0) >= 95 && !f.captured && !f.check && strong && hash(ctx.seed) % 2)
    return say(`Thắng thế quá rõ, ${me} ${base}, rung đùi chờ ${them} quit game`);

  // ----- plain narration
  if (ctx.ply === 1 && !f.captured) return say(`${me} mở màn ván cờ bằng nước ${PW[f.piece]} ${SQ(f.to)}${why ? `, ${why}` : ''}`);
  if (ctx.ply === 2 && !f.captured) return say(`${me} nhanh chóng đáp trả bằng nước ${PW[f.piece]} ${SQ(f.to)}${why ? `, ${why}` : ''}`);
  const flourish = cls === 'brilliant' ? ' Một nước đi đẳng cấp!' : cls === 'great' ? ' Nước đi duy nhất, chuẩn không cần chỉnh!' : '';
  return say(`${lead} ${base}.${flourish}`);
}
