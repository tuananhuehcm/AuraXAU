# AuraGold 100K / AuraXAU

Nhật ký giao dịch cá nhân cho XAUUSD, FX và chứng khoán Việt Nam. Next.js App Router, TypeScript, React, Tailwind, Prisma/PostgreSQL, Auth.js và next-intl.

## Chạy trên máy

Node.js 22 hoặc 24 LTS:

```powershell
npm ci
npm run dev
```

- `/`: đăng nhập cá nhân hoặc hướng dẫn khi chưa cấu hình.
- `/demo`: đủ 6 tab với dữ liệu minh họa, lưu riêng trong localStorage. Không ghi vào DB.
- `/setup`: hướng dẫn Neon, Google OAuth và Google Sheet.
- `/api/health`: trạng thái cấu hình boolean, không tiết lộ secret.

## Neon và Vercel

1. Tạo PostgreSQL tại https://console.neon.tech/ (Singapore nếu khả dụng).
2. Connection details: lưu connection string có SSL trong `.env.local` trên máy và `DATABASE_URL` trên Vercel (Production; Preview/Development nếu cần).
3. Áp dụng migration đã có:

```powershell
node --env-file=.env.local node_modules/prisma/build/index.js migrate deploy
```

`npm run db:migrate` dùng DATABASE_URL từ môi trường terminal. Migration không chạy tự động khi build production.

## Google OAuth

1. Google Cloud → Google Auth Platform: tạo ứng dụng, thêm email cá nhân vào Test users khi ở chế độ Testing.
2. Tạo OAuth client loại Web application.
3. Authorized redirect URIs:
   - `https://auraxau.vercel.app/api/auth/callback/google`
   - `http://localhost:3000/api/auth/callback/google` (phát triển)
4. Thêm biến vào Vercel Environment Variables:

| Biến               | Nội dung                                     |
| ------------------ | -------------------------------------------- |
| DATABASE_URL       | Connection string Neon                       |
| AUTH_GOOGLE_ID     | OAuth client ID                              |
| AUTH_GOOGLE_SECRET | OAuth client secret                          |
| ALLOWED_EMAIL      | Một email Google duy nhất được phép dùng app |
| AUTH_SECRET        | Chuỗi ngẫu nhiên ít nhất 32 byte             |
| AUTH_URL           | `https://auraxau.vercel.app`                 |

Tạo AUTH_SECRET trong terminal cá nhân, lưu trực tiếp vào Vercel, không gửi qua chat:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

5. Redeploy để áp dụng biến mới. Đăng nhập, tạo tài khoản và giai đoạn trong Cài đặt hoặc nạp cấu hình mẫu không có lịch sử lệnh.

Google email phải được xác minh và khớp ALLOWED_EMAIL. API dữ liệu xác thực phiên và Origin của yêu cầu ghi. Không có đường bỏ qua đăng nhập để truy cập dữ liệu thật. Không commit `.env`, mật khẩu hay service account JSON.

## Google Sheet

1. Bật Google Sheets API, tạo Service Account trong Google Cloud.
2. Thêm `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` vào Vercel. Private key có thể dùng xuống dòng thật hoặc `\n`.
3. Xuất Excel từ app, nhập vào Google Sheets; giữ nguyên 5 sheet và tên cột dòng 5.
4. Chia sẻ file riêng cho email Service Account với quyền Editor; không công khai.
5. Cài đặt → Đồng bộ Google Sheet: lưu link rồi bấm Đồng bộ ngay.

Chỉ đọc cột nhập. Dòng trống trade_id/cf_id được cấp mã. Xoá dòng trong Sheet không xoá DB. So ba phiên bản: DB, Sheet và bản đồng bộ trước; giữ DB nếu xung đột. Sau lưu DB, đẩy dữ liệu chuẩn về 5 sheet. Nếu đẩy thất bại, DB đã lưu vẫn được giữ và log nêu rõ để tải lại, thử lại. Dùng file nhập liệu riêng: nội dung 5 sheet do app quản lý sẽ được ghi lại từ DB.

## Logic đã áp dụng

- Ngân sách risk, lot, % risk thực, cảnh báo đều theo **vốn đầu bậc đang áp dụng**.
- Lịch sử risk lấy bậc tại thời điểm mở lệnh. Chính lệnh đóng cùng thời điểm mở không làm tăng bậc của nó.
- DD đạt ngưỡng: giữ thành tích và áp dụng risk bậc trước (bậc 1 không hạ thêm).
- Mẫu XAU: 61 bậc, 4 Botcamp, rút $7,700; số dư cuối $100,000. Số bậc thay đổi theo cấu hình.
- PnL ròng = gộp + swap − phí − thuế. Nạp/rút tách khỏi PnL.
- Ngày theo giờ đóng; vàng/FX cắt 05:00 VN, CK 00:00. Phiên theo giờ mở. New York dùng IANA timezone/DST.
- Mẫu số lỗ ngày cố định ở đầu ngày, không tăng theo tiền nạp trong ngày.
- DB lưu input, không lưu kết quả công thức. 10 bảng nghiệp vụ và DayJournal; Workspace/SheetSync/SyncLog hỗ trợ lưu, đồng bộ. Record chứa JSON input đã được Zod kiểm tra, có timestamp và xoá mềm.
- Lưu trong transaction có advisory lock và revision; cửa sổ dùng dữ liệu cũ nhận 409 và cần tải lại.

## Báo cáo và PWA

Excel 5 sheet. `In / PDF`: chọn Save as PDF trong hộp thoại trình duyệt. CSS in riêng, Lexend/Noto Sans SC hỗ trợ tiếng Việt và Trung; font web cần mạng lần tải đầu.

Manifest có PNG 192/512, standalone, Service Worker. Không cache dữ liệu cá nhân offline. Chrome/Edge hỗ trợ cài app; iOS: Safari → Chia sẻ → Thêm vào màn hình chính. App ghi nhật ký và cảnh báo, không đặt hoặc chặn lệnh trên broker.

## Kiểm tra và triển khai

```powershell
npm test
npm run typecheck
npm run build
```

Tests: roadmap/Botcamp, risk bậc, phí/thuế, drawdown, cashflow trong ngày, DST, validation, Excel round-trip, xung đột Sheet. Kết nối Neon/OAuth/Sheets thật được kiểm tra sau khi chủ tài khoản cấu hình biến môi trường.

Repo `tuananhuehcm/AuraXAU`, Vercel `edward-d826/auraxau`, nhánh `main`; cấu hình build ở `vercel.json`. Các tài liệu tham chiếu AuraGold gốc trên máy được giữ nguyên và gitignore.
