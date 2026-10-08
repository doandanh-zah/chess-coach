# Chess Coach

Bàn cờ luyện tập chạy hoàn toàn trên trình duyệt: Stockfish 19 (WASM) chấm điểm từng nước đi và gợi ý các nước tốt nhất.

**Demo:** https://chess-coach-ten-nu.vercel.app

## Chạy

```bash
npm install
npm run dev
```

Build tĩnh: `npm run build` → thư mục `dist/` (host ở đâu cũng được, không cần header đặc biệt).

## Tính năng

- Chế độ **tự chơi cả hai bên** hoặc **đấu với máy** (Skill 0–20, chọn màu quân).
- Mỗi nước đi được chấm: Thiên tài `!!`, Tuyệt vời `!`, Tốt nhất `★`, Xuất sắc, Tốt, Bắt buộc, Thiếu chính xác `?!`, Sai lầm `?`, Nước đi tệ `??`.
- **Gợi ý luôn hiện**: top 2–5 nước kèm nhãn, điểm, biến chính và mũi tên trên bàn; bấm để đi. Nút 💡 / phím `H` để tạm ẩn; tắt hẳn trong Cài đặt.
- **Giải thích vì sao** (`src/explain.js`): mỗi nước gợi ý kèm lý do — chiếu hết / đe dọa chiếu hết, chĩa đôi, ghim, xiên, mở đường tấn công, ăn quân không được bảo vệ, thí quân, phong cấp, Tốt thông, phát triển quân, chiếm trung tâm, nhập thành, cột mở, lợi vật chất theo biến chính. Nước bạn vừa đi chưa tốt thì app chỉ ra cách đối phương trừng phạt và vì sao nước tốt nhất hay hơn.
- **📊 Phân tích ván**: xem lại từng nước (nút ⏮ ◀ ▶ ⏭, phím ←/→/Home/End, hoặc bấm vào biên bản), đồ thị lợi thế (bấm để nhảy tới nước), bảng thống kê nhãn và độ chính xác từng bên, mũi tên nước nên đi thay thế, phân tích sâu hơn (+4 độ sâu), *Chơi tiếp từ đây*, nhập/xuất **PGN** để phân tích ván đã chơi xong ở nơi khác.
- **✏️ Xếp cờ**: kéo/thả quân từ bảng vào bàn (hoặc chọn quân rồi bấm ô, 🗑 để xóa, kéo ra ngoài bàn để bỏ), chọn bên đi tiếp, hoặc dán FEN. Bấm *Xong* để phân tích và chơi tiếp từ thế đó. Quyền nhập thành được suy ra từ vị trí Vua/Xe.
- Thanh đánh giá, độ chính xác từng bên, đi lại (`←`), lật bàn (`F`).

## Cách chấm điểm (`src/classify.js`)

Điểm centipawn được đổi sang **tỉ lệ thắng** (công thức của Lichess). Mức mất tỉ lệ thắng so với nước tốt nhất quyết định nhãn:

| Mất | Nhãn |
|---|---|
| ≤ 2% | Xuất sắc |
| ≤ 5% | Tốt |
| ≤ 10% | Thiếu chính xác |
| ≤ 20% | Sai lầm |
| > 20% | Nước đi tệ |

- **Tốt nhất**: trùng nước Stockfish chọn (hoặc mất < 0.5%).
- **Thiên tài**: mất ≤ 2%, có thí quân (để lại ≥ 2 điểm vật chất cho đối phương ăn), trước đó chưa thắng tuyệt đối (< 97%) và sau đó không bị thua (≥ 45%).
- **Tuyệt vời**: là nước tốt nhất, còn nước tốt thứ hai kém hơn ≥ 15%, tức là nước duy nhất.

## Giấy phép

GPL-3.0-or-later, vì project đóng gói Stockfish (GPL-3.0) qua [stockfish.js](https://github.com/nmrugg/stockfish.js). Nếu phát hành, bạn phải công khai mã nguồn theo GPL.
