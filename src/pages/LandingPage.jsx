import React from "react";
import appIcon from "../../src-tauri/icons/icon.png";

const features = [
  {
    title: "All-in-one control panel",
    description: "Quản lý Apache, PHP, MySQL, Redis, Node và project services trong một giao diện desktop thống nhất.",
  },
  {
    title: "Native Windows performance",
    description: "Tauri v2 + Rust backend giúp app nhẹ, khởi động nhanh và xử lý service ổn định hơn Electron-style shells.",
  },
  {
    title: "Built for local workflows",
    description: "Tạo site local, đổi runtime version, đọc log, cấu hình port và xử lý quick config mà không phải nhớ quá nhiều lệnh.",
  },
];

const sections = [
  "Apache và PHP version switching cho nhiều dự án local",
  "MySQL management, query nhanh và theo dõi trạng thái dịch vụ",
  "Sites, virtual hosts, tunnel integrations và log viewer",
  "Cấu hình tập trung cho ports, startup, editor và update",
];

function LandingPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(0,229,160,0.16),_transparent_35%),linear-gradient(180deg,#08110f_0%,#0b0f14_45%,#05070a_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 sm:px-10 lg:px-12">
        <header className="flex flex-col gap-5 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-400/30 bg-white/5 shadow-[0_0_30px_rgba(0,229,160,0.18)]">
              <img src={appIcon} alt="DevStack icon" className="h-10 w-10" />
            </div>
            <div>
              <div className="font-mono text-xs uppercase tracking-[0.32em] text-emerald-300/80">DevStack</div>
              <div className="text-sm text-slate-300">Windows local development environment</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href="https://github.com/holdon1996/dev-stack/releases/latest"
              className="rounded-full border border-emerald-300/30 bg-emerald-300 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:-translate-y-0.5 hover:bg-emerald-200"
            >
              Download latest release
            </a>
            <a
              href="https://github.com/holdon1996/dev-stack"
              className="rounded-full border border-white/15 px-5 py-2 text-sm font-semibold text-slate-100 transition hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/5"
            >
              View on GitHub
            </a>
          </div>
        </header>

        <main className="flex-1 py-10 sm:py-14">
          <section className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div>
              <div className="mb-4 inline-flex rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 font-mono text-xs uppercase tracking-[0.28em] text-emerald-200">
                Desktop tool for PHP stacks
              </div>
              <h1 className="max-w-4xl font-display text-5xl font-bold leading-[0.95] text-white sm:text-6xl lg:text-7xl">
                DevStack giúp môi trường local trên Windows gọn hơn, nhanh hơn và dễ kiểm soát hơn.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
                Một app desktop tập trung để quản lý Apache, PHP, MySQL, Redis, tunnels và cấu hình dự án local mà không cần ghép nhiều công cụ rời rạc.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <a
                  href="https://github.com/holdon1996/dev-stack/releases/latest"
                  className="rounded-2xl border border-emerald-300/25 bg-emerald-300 px-6 py-3 font-semibold text-slate-950 shadow-[0_18px_50px_rgba(0,229,160,0.2)] transition hover:-translate-y-0.5 hover:bg-emerald-200"
                >
                  Tải bản phát hành mới nhất
                </a>
                <a
                  href="https://github.com/holdon1996/dev-stack#quick-start"
                  className="rounded-2xl border border-white/15 bg-white/5 px-6 py-3 font-semibold text-white transition hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/10"
                >
                  Xem hướng dẫn cài đặt
                </a>
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 rounded-[32px] bg-emerald-300/10 blur-3xl" />
              <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-slate-950/70 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur">
                <div className="mb-5 flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-rose-400" />
                  <span className="h-3 w-3 rounded-full bg-amber-300" />
                  <span className="h-3 w-3 rounded-full bg-emerald-400" />
                </div>
                <div className="space-y-4">
                  <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                    <div className="font-mono text-xs uppercase tracking-[0.24em] text-slate-400">Managed services</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {["Apache", "PHP", "MySQL", "Redis", "Node"].map((service) => (
                        <span
                          key={service}
                          className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-sm text-emerald-100"
                        >
                          {service}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                      <div className="text-sm text-slate-400">Focus</div>
                      <div className="mt-2 text-xl font-semibold text-white">Local PHP workflow</div>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                      <div className="text-sm text-slate-400">Runtime</div>
                      <div className="mt-2 text-xl font-semibold text-white">Tauri v2 + React</div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-[linear-gradient(135deg,rgba(0,229,160,0.15),rgba(255,255,255,0.04))] p-4">
                    <div className="font-mono text-xs uppercase tracking-[0.24em] text-emerald-100/80">Why it matters</div>
                    <p className="mt-3 text-sm leading-7 text-slate-200">
                      Khi local stack nằm trong một nơi duy nhất, việc đổi version, đọc log và sửa cấu hình bớt rời rạc hơn rất nhiều.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-16 grid gap-5 md:grid-cols-3">
            {features.map((feature) => (
              <article
                key={feature.title}
                className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm transition hover:-translate-y-1 hover:border-emerald-300/30 hover:bg-white/[0.07]"
              >
                <h2 className="text-2xl font-semibold text-white">{feature.title}</h2>
                <p className="mt-4 text-sm leading-7 text-slate-300">{feature.description}</p>
              </article>
            ))}
          </section>

          <section className="mt-16 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-[32px] border border-white/10 bg-[#0a1110]/80 p-7">
              <div className="font-mono text-xs uppercase tracking-[0.3em] text-emerald-200/80">What you can do</div>
              <ul className="mt-6 space-y-4">
                {sections.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-slate-200">
                    <span className="mt-2 h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(0,229,160,0.8)]" />
                    <span className="leading-7">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-[32px] border border-white/10 bg-white/5 p-7">
              <div className="font-mono text-xs uppercase tracking-[0.3em] text-slate-400">Project stack</div>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {[
                  ["Frontend", "React 19 + Tailwind CSS"],
                  ["Desktop shell", "Tauri v2"],
                  ["Backend", "Rust commands + system integration"],
                  ["Distribution", "GitHub Releases + updater support"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-white/8 bg-slate-950/40 p-4">
                    <div className="text-sm text-slate-400">{label}</div>
                    <div className="mt-2 text-lg font-semibold text-white">{value}</div>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-2xl border border-amber-300/15 bg-amber-300/10 p-4 text-sm leading-7 text-amber-50">
                Hiện tại DevStack hướng đến Windows và tối ưu cho quy trình local development truyền thống của PHP stack.
              </div>
            </div>
          </section>
        </main>

        <footer className="flex flex-col gap-4 border-t border-white/10 pt-6 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <div>DevStack is open source and distributed through GitHub Releases.</div>
          <div className="flex flex-wrap gap-4">
            <a href="https://github.com/holdon1996/dev-stack/issues" className="transition hover:text-white">
              Issues
            </a>
            <a href="https://github.com/holdon1996/dev-stack/releases" className="transition hover:text-white">
              Releases
            </a>
            <a href="https://github.com/holdon1996/dev-stack" className="transition hover:text-white">
              Repository
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default LandingPage;
