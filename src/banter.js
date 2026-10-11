// "Bình luận vui": funny, story-like Vietnamese commentary in the style of
// Vietnamese chess YouTube ("thần Mã hoá thần Zeus", "xe tăng cài số lùi",
// "chiếu hết trong sự ngỡ ngàng của Đen"…).
//
// A sentence is built from three parts:
//   opener  — how the move relates to what just happened
//             ("Chỉ chờ có thế, Trắng…", "Thấy nguy, Đen vội…", "Thấy Đen có vẻ gà, Trắng…")
//   action  — what the move does, with the pieces' nicknames
//   kicker  — the punchline ("— chiếu hết trong sự ngỡ ngàng của Đen!")
// Edit the phrases below freely; keep the {placeholders}.

const NICK = { k: 'Thượng đế', q: 'em Hậu', r: 'xe tăng', b: 'voi chiến', n: 'thần Mã', p: 'chú Tốt' };
const PLAIN = { k: 'Vua', q: 'Hậu', r: 'Xe', b: 'Tượng', n: 'Mã', p: 'Tốt' };
const WORTH = { k: 0, q: 9, r: 5, b: 3, n: 3, p: 1 };

const STRONG = new Set(['brilliant', 'great', 'best', 'excellent']);
const BAD = new Set(['blunder', 'mistake', 'inaccuracy']);
const TACTICAL = ['mate', 'matingNet', 'sac', 'knightFork', 'fork', 'royalFork', 'pawnFork', 'freeQueen', 'mateThreat', 'discoveredCheck', 'skewer', 'pinKing', 'promoteQueen'];

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * @param {object} ctx
 * @param {object} ctx.facts     from describeMove()
 * @param {Set<string>} ctx.tags events (describeMove + game context)
 * @param {string} [ctx.cls]     move class if known
 * @param {'w'|'b'} ctx.color    side that moves
 * @param {object} [ctx.prev]    opponent's previous move: { cls, tags, facts }
 * @param {number} ctx.oppBad    opponent's weak moves among their last three
 * @param {number} [ctx.winAfter] mover's win % after the move
 * @param {string} [ctx.refutation] SAN of the opponent's best reply (for weak moves)
 * @param {number} [ctx.mate]    moves to mate, if the line mates
 * @param {number} ctx.moves     full moves played
 * @param {string} ctx.seed      stable per move, so the wording doesn't flicker
 * @returns {string|null}
 */
export function commentate(ctx) {
  const { facts: f, tags, cls } = ctx;
  if (!f) return null;
  const side = ctx.color === 'w' ? 'Trắng' : 'Đen';
  const opp = ctx.color === 'w' ? 'Đen' : 'Trắng';
  let n = 0;
  const pick = (...options) => options[hash(`${ctx.seed}|${n++}`) % options.length];
  const nick = NICK[f.piece];
  const capName = f.captured ? PLAIN[f.captured] : '';
  const into = f.forward ? 'lên' : f.retreat ? 'về' : 'sang';
  const strong = !cls || STRONG.has(cls);
  const aggressive = f.check || f.captured || tags.has('sac') || f.targets.length || f.threat || f.mateThreat;
  const prevOffered = ctx.prev?.facts?.bait?.square ?? (ctx.prev?.tags?.has('sac') ? ctx.prev?.facts?.to : null);
  const acceptsSac =
    f.captured && ctx.prev?.tags?.has('sac') && STRONG.has(ctx.prev?.cls) && prevOffered === f.to;

  // --- opener: who moves, and in what mood
  let opener = side;
  if (tags.has('turnaround') && strong) opener = `Lật kèo! ${side}`;
  else if (['mistake', 'blunder'].includes(ctx.prev?.cls) && strong) opener = pick(`Chỉ chờ có thế, ${side}`, `Không chậm trễ, ${side}`);
  else if (ctx.oppBad >= 2 && aggressive && strong) opener = `Thấy ${opp} có vẻ gà, ${side}`;

  // --- weak moves: tell the story of the slip
  if (BAD.has(cls)) {
    const punish = ctx.refutation ? ` ${opp} chỉ chờ có thế: ${ctx.refutation}!` : '';
    if (tags.has('missedMate')) return `Có đòn chiếu hết ngay trước mắt mà ${side} không thấy — bỏ lỡ cơ hội vàng!`;
    if (tags.has('bongcloud')) return `${side} cho Thượng đế xuất cung từ sớm — liều hay là tự tin đây?${punish}`;
    if (tags.has('earlyQueen')) return `${side} cho em Hậu ra trận quá sớm — coi chừng bị quân nhỏ rượt chạy khắp bàn!`;
    if (f.captured && cls !== 'inaccuracy')
      return `${side} hí hửng ăn ${capName}… tưởng ${opp} hớ hênh, ai ngờ trúng bẫy!${punish}`;
    if (cls === 'blunder') return `Tưởng ngon, ${side} đưa ${nick} ${into} ${f.to}…${punish || ' một nước đi, cả ván sụp đổ!'}`;
    if (cls === 'mistake') return `${side} đưa ${nick} ${into} ${f.to} — tưởng ngon, nhưng ${opp} có cơ hội phản công${ctx.refutation ? ` bằng ${ctx.refutation}` : ''}.`;
    return pick(
      `${side} hơi lỏng tay — vẫn còn nước hay hơn.`,
      'Nước đi chưa chuẩn lắm, như sút trúng cột dọc.',
      `${side} đi hơi chậm một nhịp, để ${opp} dễ thở hơn.`,
    );
  }

  // --- the finish
  if (tags.has('mate')) {
    let how = `lao ${nick} vào ${f.to}`;
    if (tags.has('smothered')) how = 'cho thần Mã luồn vào tận hậu cung';
    else if (tags.has('castleMate')) how = 'nhập thành';
    else if (tags.has('pawnMate')) how = 'dùng chú Tốt';
    const tail = tags.has('longFinish') ? ` Tra tấn suốt ${ctx.moves} nước, cái kết đẳng cấp!` : '';
    return `${opener} ${how} — chiếu hết trong sự ngỡ ngàng của ${opp}!${tail}`;
  }
  if (tags.has('stalemate')) return `${side} dồn ép quá tay — Thượng đế ${opp} hết nước đi, hòa pat! Tiếc đứt ruột!`;

  if (f.promotion === 'q') return pick('Thái giám hoá thái hậu!', 'Thái giám hoá thái hậu! Chú Tốt vượt ải thành công.') + ` ${side} có thêm em Hậu mới.`;
  if (f.promotion) return `Thái giám không thèm làm thái hậu, xin làm ${PLAIN[f.promotion]}!`;

  // --- no choice
  const plainAction = f.captured ? `ăn ${capName}` : `đưa ${nick} ${into} ${f.to}`;
  if (cls === 'forced') return `Cực chẳng đã, ${side} đành ${plainAction}.`;
  if (acceptsSac) {
    return ['brilliant', 'great'].includes(ctx.prev?.cls)
      ? `Cực chẳng đã, ${side} đành ăn ${capName}.`
      : `${side} hí hửng ăn ${capName} — quà ngon thì phải nhận!`;
  }
  // A king in check running for its life
  if (f.piece === 'k' && f.inCheckBefore && !f.captured) {
    return tags.has('chased')
      ? pick(`Thượng đế ${side} chạy loạn ${into} ${f.to} — bị truy sát khắp bàn cờ!`, `Thượng đế ${side} hoảng hốt bỏ chạy ${into} ${f.to}.`)
      : `Thượng đế ${side} né sang ${f.to}.`;
  }
  if (tags.has('recapture')) {
    const withCheck = f.check ? ', tiện tay chiếu luôn Thượng đế' : '';
    return pick(`Theo bản năng, ${side} ăn lại ${capName}${withCheck}.`, `Không chậm trễ, ${side} ăn lại ${capName}${withCheck}.`);
  }

  // --- sacrifices
  if (tags.has('sacQ') && (f.forcedTake || f.check))
    return `${opener} nhét Hậu vào mồm bắt ${opp} ăn! ${opp} không ngờ gặp phải thằng liều.`;
  // Also count captures that leave the capturing piece to be won back cheaply
  // (Nxb5 for a pawn, Rxd7 for a knight): the static sacrifice check misses those.
  const givesUp = f.captured && f.hanging && WORTH[f.piece] - WORTH[f.captured] >= 2;
  if (tags.has('sac') || (givesUp && strong && cls)) {
    const kicker = tags.has('comboSac')
      ? 'Liên hoàn thí quân, chơi khô máu thật sự!'
      : tags.has('sacKingside')
        ? 'Xé toang phòng tuyến trước mặt Thượng đế!'
        : `${opp} không ngờ gặp phải thằng liều.`;
    // The piece offered is not always the one that moved (e.g. leaving the Queen hanging).
    if (f.bait && f.bait.square !== f.to)
      return `${opener} lạnh lùng bỏ mặc ${NICK[f.bait.type]} ở ${f.bait.square}, lao ${nick} vào ${f.to}! ${kicker}`;
    return `${opener} lạnh lùng lao ${nick} vào ${f.to}! ${kicker}`;
  }

  // --- forks and big captures
  if (tags.has('knightFork')) return `${opener} xuất chiêu thần Mã hoá thần Zeus, chĩa cùng lúc ${f.targets.join(' và ')}!`;
  if (tags.has('pawnFork')) return `${opener} cho chú Tốt chĩa đôi ${f.targets.join(' và ')} — lính trơn cũng biết ra đòn hiểm!`;
  if (f.targets.length >= 2 && f.piece !== 'k' && f.targets.some((t) => !t.startsWith('Tốt')))
    return `${opener} dùng ${nick} chĩa đôi ${f.targets.join(' và ')} — ${opp} không kịp trở tay!`;
  if (f.piece === 'k' && f.captured === 'q') return `Thượng đế bế Quan Âm! ${side} cho Vua tự tay xơi em Hậu ở ${f.to}.`;
  if (f.captured === 'q') return `${opener} múc được em Hậu thơm phức!`;
  if (f.piece === 'q' && f.captured === 'r') return `Lớp trưởng vồ lớp phó — em Hậu xơi gọn xe tăng ở ${f.to}!`;
  if (tags.has('freePiece') || tags.has('freeQueen')) return `${opener} ăn luôn ${capName} ở ${f.to} — cái này mình xin!`;

  // --- hunting the king
  if (tags.has('chaseKing')) return `${opener} tung tiếp đòn chiếu sát thủ ${f.san} — truy sát Thượng đế ${opp} chạy khắp bàn cờ!`;
  if (tags.has('discoveredCheck')) return `${opener} mở cửa cho đồng đội chiếu Vua — đòn chiếu sát thủ!`;
  if (tags.has('matingNet')) {
    return f.check
      ? `${opener} tung đòn chiếu sát thủ ${f.san} — Thượng đế ${opp} sắp hết đường chạy!`
      : `${opener} giăng lưới, ép Thượng đế ${opp} vào tuyệt lộ${ctx.mate ? ` — chiếu hết sau ${ctx.mate} nước` : ''}!`;
  }

  // --- ordinary captures (trades)
  if (f.captured) {
    if (f.piece === 'p' && f.captured === 'p' && !f.check) return null; // pawn trades aren't news
    const withCheck = f.check ? ', tiện tay chiếu luôn Thượng đế' : '';
    return f.piece === f.captured
      ? `${side} cho ${nick} đổi lấy ${nick} ở ${f.to}${withCheck}.`
      : `${opener} cho ${nick} xơi ${capName} ở ${f.to}${withCheck}.`;
  }

  // --- defence
  if (f.stoppedMate) return `Thấy nguy, ${side} vội đưa ${nick} ${into} ${f.to}, chặn đứng đòn ${f.stoppedMate}!`;
  if (tags.has('escape') && f.piece !== 'p') {
    return f.piece === 'r' && f.retreat
      ? `Thấy nguy, ${side} cho xe tăng cài số lùi về ${f.to}.`
      : `Thấy nguy, ${side} vội đưa ${nick} ${into} ${f.to} lánh nạn.`;
  }
  if (tags.has('protect') && f.protected && f.protected !== 'p')
    return `Thấy nguy, ${side} đưa ${nick} ${into} ${f.to} che chắn cho ${NICK[f.protected]}.`;

  // --- building the attack
  if (f.mateThreat) return `${opener} đem ${nick} ${into} ${f.to} rình rập — lưỡi dao đã kề cổ, dọa ${f.mateThreat}!`;
  if (f.pin?.kind === 'skewer') return `${opener} dùng ${nick} xiên thẳng ${f.pin.front} — né thì ${f.pin.back} phía sau mất mạng!`;
  if (f.piece === 'b' && (f.pin || f.threat))
    return `${opener} đưa voi chiến ${into} ${f.to}, chảy nước miếng nhìn ${f.pin ? f.pin.front : f.threat}.`;
  if (ctx.winAfter >= 97 && !f.check && strong) return pick(`${side} rung đùi chờ ${opp} quit game.`, `Thắng thế quá rõ, ${side} chỉ việc rung đùi chờ ${opp} quit game.`);
  if (f.pin) return `${opener} ghim chặt ${f.pin.front} vào ${f.pin.back} — ${opp} bị trói tay trói chân.`;
  if (strong && cls !== 'excellent' && !f.check && TACTICAL.some((t) => f.followTags.has(t)))
    return `${side} âm thầm chuẩn bị một mưu đồ đen tối… (nhắm tới ${f.followSan})`;
  if (f.piece === 'r' && f.lateral) return `${opener} xuất chiêu youtuber lái wave tàu — xe tăng lướt ngang sang ${f.to}!`;
  if (f.piece === 'r' && f.retreat && f.ranks >= 2) return `${side} cho xe tăng cài số lùi về ${f.to}.`;
  if (f.piece === 'r' && f.forward && f.ranks >= 2) return `La hán đẩy xe bò — ${side} cho xe tăng tiến thẳng lên ${f.to}!`;
  if (f.threat && f.forward && f.piece !== 'p') return `${opener} đem ${nick} ${into} ${f.to} rình rập ${f.threat}.`;

  // --- everyday moves
  if (tags.has('castleShort')) return `${side} nhập thành, đưa Thượng đế vào hầm trú ẩn.`;
  if (tags.has('castleLong')) return `${side} nhập thành dài — Thượng đế sang cánh Hậu, sẵn sàng đấu khô máu!`;
  if (tags.has('enPassant')) return `${side} bắt Tốt qua đường — đòn hiểm ít ai ngờ tới!`;
  if (cls === 'brilliant') return 'Thế này mới gọi là thiên tài!';
  if (cls === 'great') return `Nước duy nhất — ${side} đi trên dây mà không ngã!`;
  return null;
}

