// A small opening book: the move that completes a known sequence gets its name
// mentioned in the commentary ("…, sử dụng khai cuộc Italia").

const BOOK = [
  ['e4 e5 Nf3 Nc6 Bc4', 'khai cuộc Italia'],
  ['e4 e5 Nf3 Nc6 Bc4 Bc5', 'biến Giuoco Piano'],
  ['e4 e5 Nf3 Nc6 Bc4 Nf6', 'phòng thủ Hai Mã'],
  ['e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5', 'biến tấn công Mã G5'],
  ['e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7', 'đòn Fried Liver'],
  ['e4 e5 Nf3 Nc6 Bb5', 'khai cuộc Tây Ban Nha'],
  ['e4 e5 Nf3 Nc6 d4', 'khai cuộc Scotch'],
  ['e4 e5 Nf3 Nf6', 'phòng thủ Petrov'],
  ['e4 e5 Nf3 d6', 'phòng thủ Philidor'],
  ['e4 e5 Nc3', 'khai cuộc Vienna'],
  ['e4 e5 f4', 'gambit Vua'],
  ['e4 e5 Qh5', 'đòn tấn công kiểu học trò'],
  ['e4 e5 Ke2', 'khai cuộc Bongcloud huyền thoại'],
  ['e4 c5', 'phòng thủ Sicilia'],
  ['e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6', 'biến Najdorf'],
  ['e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6', 'biến Rồng'],
  ['e4 e6', 'phòng thủ Pháp'],
  ['e4 c6', 'phòng thủ Caro-Kann'],
  ['e4 d5', 'phòng thủ Scandinavia'],
  ['e4 d6', 'phòng thủ Pirc'],
  ['e4 g6', 'phòng thủ Hiện đại'],
  ['e4 Nf6', 'phòng thủ Alekhine'],
  ['d4 d5 c4', 'gambit Hậu'],
  ['d4 d5 c4 e6', 'gambit Hậu từ chối'],
  ['d4 d5 c4 dxc4', 'gambit Hậu chấp nhận'],
  ['d4 d5 c4 c6', 'phòng thủ Slav'],
  ['d4 d5 Bf4', 'hệ thống London'],
  ['d4 Nf6 Bf4', 'hệ thống London'],
  ['d4 d5 Nf3 Nf6 Bf4', 'hệ thống London'],
  ['d4 Nf6 c4 g6', 'phòng thủ Ấn Độ Vua'],
  ['d4 Nf6 c4 e6 Nc3 Bb4', 'phòng thủ Nimzo-Ấn Độ'],
  ['d4 Nf6 c4 c5', 'phòng thủ Benoni'],
  ['d4 f5', 'phòng thủ Hà Lan'],
  ['c4', 'khai cuộc Anh'],
  ['Nf3', 'khai cuộc Réti'],
  ['b3', 'khai cuộc Larsen'],
];

const BY_LINE = new Map(BOOK.map(([line, name]) => [line, name]));

/** Name of the opening completed by the last move of `sans`, if any. */
export function openingAt(sans) {
  return BY_LINE.get(sans.join(' ')) ?? null;
}
