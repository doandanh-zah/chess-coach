# Chess Coach

Bàn cờ luyện tập chạy hoàn toàn trên trình duyệt: Stockfish 19 (WASM) chấm điểm từng nước đi và gợi ý các nước tốt nhất.

**Demo:** https://chess.thezah.space

## Chạy

```bash
npm install
npm run dev
```

Build tĩnh: `npm run build` → thư mục `dist/` (host ở đâu cũng được, không cần header đặc biệt).

## Tính năng

- Chế độ **tự chơi cả hai bên** hoặc **đấu với máy** (chọn **độ chính xác của máy**: 60–70 / 71–80 / 81–85 / 86–90 / 91–100%, chọn màu quân). Máy xét tới 12 nước ứng viên và chọn ngẫu nhiên có điều khiển để độ chính xác cả ván nằm trong mốc — phần lớn đi hợp lý, thỉnh thoảng sai như người thật.
- Mỗi nước đi được chấm: Thiên tài `!!`, Tuyệt vời `!`, Tốt nhất `★`, Xuất sắc, Tốt, Bắt buộc, Thiếu chính xác `?!`, Sai lầm `?`, Nước đi tệ `??`.
- **Gợi ý luôn hiện**: top 2–5 nước kèm nhãn, điểm, biến chính và mũi tên trên bàn; bấm để đi. Nút 💡 / phím `H` để tạm ẩn; tắt hẳn trong Cài đặt.
- **Giải thích vì sao** (`src/explain.js`): mỗi nước gợi ý kèm lý do — chiếu hết / đe dọa chiếu hết, chĩa đôi, ghim, xiên, mở đường tấn công, ăn quân không được bảo vệ, thí quân, phong cấp, Tốt thông, phát triển quân, chiếm trung tâm, nhập thành, cột mở, lợi vật chất theo biến chính. Nước bạn vừa đi chưa tốt thì app chỉ ra cách đối phương trừng phạt và vì sao nước tốt nhất hay hơn.
- **Ý đồ & diễn biến**: mỗi nước còn ghi nó *chuẩn bị* gì (nước tiếp theo trong biến chính) hay *ngăn* gì (chặn chiếu hết), cộng các ý chiến lược (Mã vào ô mạnh, Xe hàng 7, chồng Xe, fianchetto, đột phá Tốt, phòng ngừa, ô thở cho Vua, Vua ra trung tâm ở tàn cuộc…). Mục *Diễn biến dự kiến* đi qua từng nước của biến chính, mỗi nước một câu giải thích.
- **🎙️ Bình luận vui** (`src/banter.js`, bật/tắt trong Cài đặt): tường thuật từng nước kiểu kênh YouTube cờ vua Việt, ngắn gọn và đúng ý cờ. Mỗi nước: ai đi quân gì đi đâu ("phát triển mã cánh vua lên F6", "kéo tượng lùi về D7", "lắc hậu qua A2", "thúc tốt tiến xuống H6") và để làm gì — mọi mục đích đều được kiểm tra trên bàn cờ ("uy hiếp tốt C5", "đuổi hậu", "bắt xe", "né đòn", "gạ đổi tượng", "tăng thêm quân uy hiếp…", "bịt đường tấn công của tượng H8", "chuẩn bị đưa tượng lên G2"). Câu nối dựa trên nước trước của hai bên ("Thấy vậy…", "Chưa dừng lại ở đó… tiếp tục truy sát hậu", "Thừa thế xông lên…", "Không muốn lằng nhằng… choảng luôn", "Biết rằng quân tốt này có tẩm thuốc độc…", "Tưởng ngon…", "Chỉ chờ có thế…", "Cực chẳng đã…"). Câu đùa của kênh gắn với đúng tình huống trên bàn cờ: "xuất chiêu thần mã hoá thần Zeus" (mã đánh đôi), "YouTuber lái wave tàu" / "la hán đẩy xe bò" (xe lắc ngang / lao thẳng tấn công), "xe tăng cài số lùi" (xe rút về), "voi chiến chảy nước miếng" (tượng nhắm hậu, xe, vua), "đem hậu lên… rình rập", "Không ngờ… gặp phải thằng liều… dí hậu vào mồm thách ăn", "Tưởng Trắng hớ hênh… mồm kêu mình xin" → "Thế nhưng không phải tự nhiên mà…", "múc được em hậu thơm phức", "chén em xe thơm phức", "Lớp trưởng vồ lớp phó", "Thượng đế bế quan âm", "Thấy nguy…", "Theo bản năng…", "Thấy Đen có vẻ gà…", "hí hửng ăn…", "rung đùi chờ… quit game", "thái giám hoá thái hậu", "chiếu hết trong sự ngỡ ngàng", "…và cờ đen sẽ toang". Nước kém được kể như kênh ("Ở đây Đen nên… Song Đen lại có vẻ lóng ngóng khi…") kèm biến giả định chỉ khi nó dẫn tới mất quân hoặc chiếu hết ("Lúc này nếu Trắng… thì Đen sẽ… và Đen sẽ hơn chất"). Có tên khai cuộc (`src/openings.js`), tên người chơi nếu PGN có, "Bạn"/"Máy" khi đấu với máy. Chế độ Phân tích có mục **Tường thuật ván đấu**.
- **📊 Phân tích ván**: xem lại từng nước (nút ⏮ ◀ ▶ ⏭, phím ←/→/Home/End, hoặc bấm vào biên bản), đồ thị lợi thế (bấm để nhảy tới nước), bảng thống kê nhãn và độ chính xác từng bên, mũi tên nước nên đi thay thế, phân tích sâu hơn (+4 độ sâu), *Chơi tiếp từ đây*, nhập/xuất **PGN** để phân tích ván đã chơi xong ở nơi khác.
- **✏️ Xếp cờ**: kéo/thả quân từ bảng vào bàn (hoặc chọn quân rồi bấm ô, 🗑 để xóa, kéo ra ngoài bàn để bỏ), chọn bên đi tiếp, hoặc dán FEN. Bấm *Xong* để phân tích và chơi tiếp từ thế đó. Quyền nhập thành được suy ra từ vị trí Vua/Xe.
- Thanh đánh giá, độ chính xác từng bên, đi lại (`←`), lật bàn (`F`).

## App Android (APK)

Đóng gói bằng [Capacitor](https://capacitorjs.com) — chạy offline, Stockfish nằm sẵn trong app.

```bash
npm run android:apk
```

Cần JDK 17 và Android SDK (platform 34). APK ra ở `android/app/build/outputs/apk/debug/app-debug.apk`. Mở `android/` bằng Android Studio nếu muốn build bản release có ký.

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
