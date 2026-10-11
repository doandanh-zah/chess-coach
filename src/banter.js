// Fun Vietnamese commentary ("bình luận vui"), in the dramatic action /
// sports-commentary voice of Vietnamese chess YouTube ("phế Mã kinh hoàng",
// "truy sát Vua", "ép Vua vào tuyệt lộ", "lật kèo"…).
//
// Add or edit lines freely. Each key is an event tag (from describeMove() or
// contextTags() in main.js) or a move class. Placeholders:
//   {side} side that moved (Trắng/Đen)   {opp} the other side
//   {mate} moves to mate                 {moves} full moves played so far
//   {promo} piece promoted to

const LINES = {
  // --- the finish
  castleMate: ['Nhập thành chiếu hết — hiếm có khó tìm, chụp màn hình lại ngay!'],
  smothered: [
    'Chiếu hết ngạt thở! Vua chết trong vòng vây của chính quân nhà.',
    'Mã luồn sâu vào tận hậu cung — Vua hết đường thở!',
  ],
  scholarMate: ['Chiếu hết học trò — mới vào trận đã hạ màn!'],
  pawnMate: ['Tốt chiếu hết — cái kết khó tin nhất bàn cờ!'],
  longFinish: ['Tra tấn suốt {moves} nước, cái kết đẳng cấp!', 'Cuộc chiến sinh tử {moves} nước khép lại bằng một đòn kết liễu!'],
  backRank: ['Vua bị nhốt ở hàng cuối, hết đường chạy — chiếu hết!', 'Ép Vua vào chân tường, hạ màn ở hàng cuối!'],
  mate: ['Ép Vua vào tuyệt lộ — chiếu hết!', 'Hết đường chạy! {side} kết liễu ván đấu.', 'Đòn kết liễu đẳng cấp — Vua {opp} gục ngã!'],
  stalemate: ['Hòa pat! Thắng đến nơi lại để Vua hết nước đi — tiếc đứt ruột!'],
  missedMate: [
    'Bỏ lỡ chiếu hết! Cơ hội vàng trôi qua kẽ tay.',
    'Có đòn chiếu hết ngay trước mắt mà không thấy — tiếc hùi hụi!',
  ],

  // --- sacrifices
  comboSac: ['Liên hoàn thí quân! {side} chơi khô máu thật sự!', 'Thí liền mấy quân — được ăn cả, ngã về không!'],
  sacQ: ['Phế Hậu! {side} dụ đối thủ sập bẫy!', 'Thí Hậu kinh hoàng — chơi khô máu đến cùng!'],
  sacR: ['Thí Xe kiểu thằng liều!', 'Phế Xe điên rồ — {opp} có dám ăn không?'],
  sacKingside: ['Thí quân xé toang phòng tuyến trước mặt Vua!', 'Phá tan lá chắn của Vua — cuộc truy sát bắt đầu!'],
  sacN: ['Phế Mã kinh hoàng!', 'Thí Mã: cái bẫy chết người hay sai lầm khó tin?'],
  sacB: ['Thí Tượng kinh điển!', 'Phế Tượng — một đòn mở toang cục diện!'],
  sac: ['Thí quân không chớp mắt — liều ăn nhiều!'],

  // --- attacks
  promoteQueen: [
    'Thái giám hóa thái hậu!',
    'Tốt vượt ải thành công — lên ngôi Hoàng hậu, cục diện đổi chiều!',
    'Từ lính trơn thành Hoàng hậu — {side} có thêm vũ khí hủy diệt!',
  ],
  underpromote: ['Thái giám không thèm làm thái hậu, chọn làm {promo}!', 'Phong cấp thành {promo} — không lấy Hậu mà vẫn đẳng cấp!'],
  matingNet: ['Ép Vua vào tuyệt lộ — chiếu hết sau {mate} nước!', 'Lưới chiếu hết đã giăng, Vua {opp} hết đường chạy!'],
  chaseKing: ['Truy sát Vua! Rượt chạy khắp bàn cờ như phim hành động!', 'Ra đòn liên tiếp — Vua {opp} không kịp thở!'],
  royalFork: ['Chĩa đôi Vua và Hậu — {opp} không kịp trở tay!'],
  knightFork: ['Mã chĩa đôi — một nước hai mục tiêu, đối thủ không kịp trở tay!', 'Cú nhảy chết người của Mã — trúng hai đích một lúc!'],
  pawnFork: ['Tốt chĩa đôi — lính trơn cũng biết ra đòn hiểm!'],
  fork: ['Một đòn trúng hai mục tiêu!'],
  discoveredCheck: ['Chiếu mở! Ra đòn liên tiếp, {opp} trở tay không kịp!'],
  pinKing: ['Ghim chết vào Vua — nhúc nhích là mất quân!'],
  skewer: ['Đòn xiên! Quân phía trước né, quân phía sau mất mạng.'],
  pin: ['Ghim chặt — {opp} bị trói tay trói chân.'],
  discovered: ['Đòn mở bất ngờ — đồng đội nhường đường để ra đòn!'],
  turnaround: ['Lật kèo! Tưởng thua đến nơi, {side} vùng lên mạnh mẽ!', 'Chớp thời cơ — {side} trừng phạt sai lầm không thương tiếc!'],
  freeQueen: ['Hậu cho không — nhận quà mà không cần cảm ơn!'],
  stopMate: ['Thoát hiểm trong gang tấc — chặn đứng đòn chiếu hết!', 'Bị dồn đến chân tường nhưng vẫn tìm ra sinh lộ!'],
  mateThreat: ['Lưỡi dao đã kề cổ — dọa chiếu hết!'],
  enPassant: ['Bắt Tốt qua đường — đòn hiểm ít ai ngờ tới!'],
  bongcloud: ['Vua xuất cung từ những nước đầu — liều hay là tự tin?'],
  kingWalk: ['Vua dạo bước giữa vòng vây — gan to thật!'],
  queenTrade: ['Đổi Hậu — trận chiến bước sang hồi mới.'],
  earlyQueen: ['Hậu xuất trận quá sớm — coi chừng bị quân nhỏ rượt chạy khắp bàn!'],
  castleLong: ['Nhập thành dài — Vua sang cánh Hậu, chuẩn bị đấu khô máu!'],
  castleShort: ['Nhập thành — Vua lui về hậu phương an toàn.'],
  hitQueen: ['Chọc thẳng vào Hậu — bà hoàng phải chạy!'],
  freePiece: ['Ăn không quân — quà tặng không thể chối từ!'],

  // --- move classes (used when no event fits)
  brilliant: ['Thế này mới gọi là thiên tài!', 'Nước đi khiến cả khán đài nín thở!'],
  great: ['Nước duy nhất — đi trên dây mà không ngã!', 'Tìm ra sinh lộ giữa cuộc chiến sinh tử!'],
  blunder: [
    'Sai lầm khó tin! Một nước đi, cả ván sụp đổ.',
    'Địa chấn! {side} tặng luôn chiến thắng cho đối thủ.',
    'Thua sốc vì một phút lơ là!',
  ],
  mistake: ['Đi sai một bước — {opp} có cơ hội phản công!', 'Run tay rồi — thế cờ bắt đầu lung lay.'],
  inaccuracy: ['Chưa chuẩn lắm — bỏ lỡ cơ hội làm khó đối thủ.', 'Lệch một nhịp, như sút trúng cột dọc.'],
};

const PRIORITY = [
  'castleMate', 'smothered', 'scholarMate', 'pawnMate', 'longFinish', 'backRank', 'mate', 'stalemate',
  'comboSac', 'sacQ', 'sacR', 'sacKingside', 'sacN', 'sacB', 'sac',
  'promoteQueen', 'underpromote', 'matingNet', 'chaseKing', 'royalFork', 'knightFork', 'pawnFork', 'fork',
  'discoveredCheck', 'pinKing', 'skewer', 'pin', 'discovered', 'turnaround', 'freeQueen',
  'stopMate', 'mateThreat', 'enPassant', 'bongcloud', 'kingWalk', 'queenTrade', 'earlyQueen',
  'castleLong', 'castleShort', 'hitQueen', 'freePiece',
];

// Bad moves get the class line even if a flashy event happened (a "sacrifice"
// that loses is just a blunder) — except for a few events that describe them better.
const BAD = new Set(['blunder', 'mistake', 'inaccuracy']);
const BAD_FLAVOUR = ['missedMate', 'bongcloud', 'kingWalk', 'earlyQueen'];
const STRONG = new Set(['brilliant', 'great', 'best', 'excellent']);
const SAC_TAGS = new Set(['comboSac', 'sacQ', 'sacR', 'sacKingside', 'sacN', 'sacB', 'sac']);

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * @param {Set<string>} tags events for this move
 * @param {string} [cls] move class, if known
 * @param {string} seed stable per move (e.g. fen + uci) so the line doesn't flicker
 * @param {Record<string, string|number>} vars placeholder values
 */
export function banterFor(tags, cls, seed, vars = {}) {
  let key;
  if (BAD.has(cls)) key = BAD_FLAVOUR.find((t) => tags.has(t)) ?? cls;
  else {
    // Only celebrate a sacrifice when it is actually a strong move.
    const sacOk = !cls || STRONG.has(cls);
    key = PRIORITY.find((t) => tags.has(t) && (sacOk || !SAC_TAGS.has(t))) ?? (cls in LINES ? cls : null);
  }
  if (!key || !LINES[key]) return null;
  const options = LINES[key];
  const line = options[hash(seed + key) % options.length];
  return line.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
}
