// Fun Vietnamese commentary ("bình luận vui") for notable moves.
// Add or edit lines freely: each key is an event tag from describeMove()
// or a move class from classify.js; one line is picked per move.

const LINES = {
  // --- events, roughly most to least spectacular
  castleMate: ['Nhập thành chiếu hết — hàng hiếm, chụp màn hình lại ngay!'],
  smothered: [
    'Chiếu hết ngạt thở — Vua bị chính quân nhà chèn chết!',
    'Mã chui vào tận giường, Vua hết đường thở.',
  ],
  scholarMate: ['Chiếu hết học trò — bài học vỡ lòng, ai cũng từng trải qua!'],
  pawnMate: ['Tốt chiếu hết — nỗi nhục khó rửa nhất làng cờ!'],
  backRank: [
    'Chiếu hết hàng cuối — Vua ngủ quên trong nhà, quên mở cửa sổ.',
    'Vua bị nhốt ở hàng cuối, chính quân nhà khóa cửa.',
  ],
  mate: ['Game over! Vua xin nghỉ hưu sớm.', 'Chiếu hết! Cảm ơn quý vị đã theo dõi.', 'Hạ màn — Vua giơ cờ trắng.'],
  stalemate: ['Hòa pat — thắng đến nơi rồi lại hòa, tức như bò đá!', 'Vua hết đường đi mà không bị chiếu — hòa trong tiếc nuối.'],
  promoteQueen: [
    'Thái giám hóa thái hậu!',
    'Lính quèn lên làm hoàng hậu — đổi đời chỉ trong một nước.',
    'Tốt đi hết đường đời, cuối cùng cũng được lên ngôi.',
  ],
  underpromote: [
    'Thái giám không thèm làm thái hậu, đòi làm kỵ sĩ!',
    'Phong cấp mà không chọn Hậu — khiêm tốn hay cao tay?',
  ],
  queenSac: ['Thí Hậu — hy sinh cả hoàng hậu vì đại cục!', 'Hoàng hậu xả thân cứu giá — khán giả nín thở!'],
  royalFork: ['Chĩa đôi Vua và Hậu — cả hoàng gia nhận giấy triệu tập!'],
  knightFork: [
    'Mã chĩa đôi — một mũi tên trúng hai con nhạn!',
    'Mã nhảy vào nhà dân, gõ cửa hai phòng cùng lúc.',
  ],
  pawnFork: ['Tốt chĩa đôi — lính quèn mà dọa được cả hai sĩ quan!'],
  fork: ['Một mũi tên trúng hai con nhạn!'],
  discoveredCheck: ['Chiếu mở — mở cửa một cái, Vua lãnh đủ!'],
  sacrifice: ['Thí quân không chớp mắt — liều ăn nhiều!', 'Cho không biếu không… nhưng có điều kiện kèm theo.'],
  pinKing: ['Ghim tuyệt đối — nhúc nhích là Vua ăn đòn.', 'Đóng đinh vào Vua, quân kia đứng im như tượng sáp.'],
  skewer: ['Xiên que! Quân trước né thì quân sau lên vỉ nướng.'],
  pin: ['Ghim chặt — đi thì mất quân to, đứng thì bị dồn.'],
  discovered: ['Đòn mở — đồng đội nhường đường, ăn ý như trong phim.'],
  freeQueen: ['Hậu cho không — đối thủ cảm ơn rối rít!'],
  stopMate: ['Kịp chặn đòn chiếu hết — thoát hiểm trong gang tấc!'],
  mateThreat: ['Lưỡi dao đã kề cổ — dọa chiếu hết!'],
  enPassant: ['Bắt Tốt qua đường — luật bí ẩn làm người mới hoang mang!', 'En passant! Tốt đi ngang qua cũng không thoát.'],
  bongcloud: ['Vua ra phố từ sớm — tự tin hay liều mạng đây?'],
  kingWalk: ['Vua đi dạo giữa chợ — gan thật!'],
  queenTrade: ['Hai Hậu dắt tay nhau rời sân khấu.', 'Đổi Hậu — ván cờ bớt nóng, bắt đầu tính toán tàn cuộc.'],
  earlyQueen: ['Hậu ra sớm thế — coi chừng bị quân nhỏ đuổi chạy vòng vòng!'],
  castleLong: ['Nhập thành dài — Vua dọn nhà sang cánh Hậu.'],
  castleShort: ['Vua về dinh, Xe ra trận.', 'Nhập thành — Vua chui vào boongke an toàn.'],
  hitQueen: ['Chọc vào Hậu — bà hoàng phải dọn nhà rồi!'],
  freePiece: ['Ăn không — của trời cho, không ăn thì phí!'],

  // --- move classes (used when no event fits)
  brilliant: ['Nước đi của thiên tài — khán giả đứng dậy vỗ tay!', 'Đẳng cấp là mãi mãi!'],
  great: ['Nước duy nhất — đi trên dây mà không ngã!', 'Tìm ra đúng nước giữa vô vàn cạm bẫy.'],
  blunder: ['Tay nhanh hơn não!', 'Nước đi tặng quà — đối thủ chưa kịp xin đã được cho.', 'Ối dồi ôi, rơi đài!'],
  mistake: ['Run tay rồi!', 'Một bước sai, cả thế cờ lung lay.'],
  inaccuracy: ['Lệch một chút — như sút trúng cột dọc.', 'Chưa chuẩn lắm, còn nước hay hơn.'],
};

const PRIORITY = [
  'castleMate', 'smothered', 'scholarMate', 'pawnMate', 'backRank', 'mate', 'stalemate',
  'promoteQueen', 'underpromote', 'queenSac', 'royalFork', 'knightFork', 'pawnFork', 'fork',
  'discoveredCheck', 'sacrifice', 'pinKing', 'skewer', 'pin', 'discovered', 'freeQueen',
  'stopMate', 'mateThreat', 'enPassant', 'bongcloud', 'kingWalk', 'queenTrade', 'earlyQueen',
  'castleLong', 'castleShort', 'hitQueen', 'freePiece',
];

// Bad moves get the class line even if a flashy event happened (a "sacrifice" that loses is a blunder).
const BAD = new Set(['blunder', 'mistake', 'inaccuracy']);

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * @param {Set<string>} tags events from describeMove()
 * @param {string} [cls] move class, if graded
 * @param {string} seed something stable per move (e.g. fen + uci) so the line doesn't flicker
 */
export function banterFor(tags, cls, seed) {
  let key = null;
  // A few events describe a bad move better than the generic class line.
  const flavour = ['bongcloud', 'kingWalk', 'earlyQueen'].find((t) => tags.has(t));
  if (BAD.has(cls) && flavour) key = flavour;
  else if (BAD.has(cls) && !tags.has('mate')) key = cls;
  else key = PRIORITY.find((t) => tags.has(t)) ?? (cls in LINES ? cls : null);
  if (!key) return null;
  const options = LINES[key];
  return options[hash(seed + key) % options.length];
}
