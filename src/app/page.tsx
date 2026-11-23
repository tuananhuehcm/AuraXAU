import { auth, authConfigured, signIn } from "@/auth";
import Dashboard from "@/components/dashboard";
export const dynamic = "force-dynamic";
export default async function Page() {
  const configured = authConfigured() && !!process.env.DATABASE_URL;
  const session = configured ? await auth() : null;
  if (
    session?.user?.email &&
    session.user.email.toLowerCase() ===
    process.env.ALLOWED_EMAIL?.toLowerCase()
  )
    return <Dashboard mode="cloud" email={session!.user!.email!} />;
  return (
    <main className="welcome">
      <div className="welcome-card">
        <div className="logo large">A</div>
        <p className="eyebrow">NHẬT KÝ GIAO DỊCH CÁ NHÂN</p>
        <h1>
          AuraGold <span>100K</span>
        </h1>
        <p className="welcome-description">
          Giữ kỷ luật từng lệnh.
          <br />
          Theo dõi hành trình tăng trưởng của bạn.
        </p>
        <div className="welcome-pills">
          <span>Vàng & FX</span>
          <span>Chứng khoán VN</span>
          <span>Lộ trình riêng</span>
        </div>
        {configured ? (
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/" });
            }}
          >
            <button className="primary wide" type="submit">
              Đăng nhập bằng Google
            </button>
          </form>
        ) : (
          <div className="setup-notice">
            <b>Ứng dụng đã sẵn sàng để cấu hình</b>
            <p>
              Kết nối database và Google OAuth để dùng dữ liệu cá nhân. Chỉ
              email được cho phép mới đăng nhập được.
            </p>
            <a href="/setup">Xem hướng dẫn cấu hình</a>
          </div>
        )}
        <a href="/demo" className="secondary wide">
          Khám phá bản mẫu
        </a>
        <p className="muted small">
          Bản mẫu dùng dữ liệu minh họa riêng, không ghi vào tài khoản thật.
        </p>
      </div>
      <div className="welcome-preview">
        <div className="gold-orbit" />
        <div className="preview-card">
          <span>HÀNH TRÌNH CỦA BẠN</span>
          <strong>
            $200 <i>→</i> $100,000
          </strong>
          <div className="preview-line">
            <svg viewBox="0 0 400 180" aria-hidden="true">
              <path
                d="M0 165L40 160 75 148 100 155 135 130 165 136 195 100 225 108 250 75 280 82 310 48 340 55 370 15 400 0"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
              />
            </svg>
          </div>
          <p>61 bậc trong lộ trình mẫu · $7,700 rút kế hoạch</p>
        </div>
      </div>
    </main>
  );
}
