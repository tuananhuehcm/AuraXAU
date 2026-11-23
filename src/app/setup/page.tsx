export default function Setup() {
  return (
    <main className="setup-page">
      <a href="/">AuraGold 100K</a>
      <h1>Kết nối tài khoản cá nhân</h1>
      <p>
        Thực hiện trong tài khoản Vercel và Google của bạn. Không gửi secret qua
        chat hoặc đưa vào GitHub.
      </p>
      <section className="panel">
        <h2>1. Database Neon</h2>
        <ol>
          <li>
            Tạo dự án PostgreSQL trên{" "}
            <a
              href="https://console.neon.tech/"
              target="_blank"
              rel="noreferrer"
            >
              Neon
            </a>
            , chọn khu vực Singapore nếu có.
          </li>
          <li>
            Trong Connection details, sao chép connection string có{" "}
            <code>sslmode=require</code>.
          </li>
          <li>
            Vào Vercel → auraxau → Settings → Environment Variables, thêm{" "}
            <code>DATABASE_URL</code>.
          </li>
          <li>
            Từ máy có biến này trong file <code>.env.local</code>, chạy
            migration theo README:{" "}
            <code>
              node --env-file=.env.local node_modules/prisma/build/index.js
              migrate deploy
            </code>
            . Hoặc đặt biến trong terminal rồi chạy{" "}
            <code>npm run db:migrate</code>.
          </li>
        </ol>
      </section>
      <section className="panel">
        <h2>2. Google OAuth</h2>
        <ol>
          <li>
            Mở{" "}
            <a
              href="https://console.cloud.google.com/auth/clients"
              target="_blank"
              rel="noreferrer"
            >
              Google Cloud → Google Auth Platform
            </a>
            , tạo OAuth client loại Web application.
          </li>
          <li>
            Thêm email của bạn vào Test users nếu ứng dụng ở trạng thái Testing.
          </li>
          <li>
            Authorized redirect URI:{" "}
            <code>https://auraxau.vercel.app/api/auth/callback/google</code>.
          </li>
          <li>
            Thêm <code>AUTH_GOOGLE_ID</code>, <code>AUTH_GOOGLE_SECRET</code>{" "}
            vào Vercel.
          </li>
          <li>
            Thêm <code>ALLOWED_EMAIL</code> bằng email Google duy nhất được phép
            dùng app.
          </li>
          <li>
            Tạo <code>AUTH_SECRET</code> bằng{" "}
            <code>
              node -e
              &quot;console.log(require('crypto').randomBytes(32).toString('base64url'))&quot;
            </code>
            , lưu vào Vercel. Thêm{" "}
            <code>AUTH_URL=https://auraxau.vercel.app</code>.
          </li>
          <li>Redeploy trên Vercel để áp dụng các biến mới.</li>
        </ol>
      </section>
      <section className="panel">
        <h2>3. Google Sheet (khi cần đồng bộ)</h2>
        <p>
          Bật Google Sheets API, tạo Service Account trong cùng Google Cloud
          project. Thêm <code>GOOGLE_SERVICE_ACCOUNT_EMAIL</code> và{" "}
          <code>GOOGLE_PRIVATE_KEY</code> vào Vercel, rồi chia sẻ riêng file
          Google Sheet với email Service Account với quyền Editor. Chỉ dùng file
          nhập liệu dành riêng cho AuraGold.
        </p>
      </section>
      <a className="primary" href="/demo">
        Xem thử trong lúc cấu hình
      </a>
    </main>
  );
}
