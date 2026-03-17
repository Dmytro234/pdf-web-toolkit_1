import { useMemo, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  AlignJustify,
  Crop,
  Edit3,
  FileOutput,
  FileSymlink,
  Files,
  Menu,
  Minimize2,
  MoreHorizontal,
  Scissors,
  Trash2,
  UserCircle2,
  X
} from "lucide-react";

type NavItem = {
  label: string;
  to: string;
  icon: JSX.Element;
};

const navItems: NavItem[] = [
  { label: "Merge", to: "/merge", icon: <Files className="h-4 w-4" /> },
  { label: "Split", to: "/split", icon: <Scissors className="h-4 w-4" /> },
  { label: "Edit", to: "/edit", icon: <Edit3 className="h-4 w-4" /> },
  { label: "Compress", to: "/compress", icon: <Minimize2 className="h-4 w-4" /> },
  { label: "Extract", to: "/extract", icon: <FileOutput className="h-4 w-4" /> },
  { label: "Delete", to: "/delete-pages", icon: <Trash2 className="h-4 w-4" /> },
  { label: "Convert", to: "/convert", icon: <FileSymlink className="h-4 w-4" /> },
  { label: "Crop", to: "/crop", icon: <Crop className="h-4 w-4" /> },
  { label: "Align", to: "/align", icon: <AlignJustify className="h-4 w-4" /> }
];

function PdfLogo() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 64"
      className="h-8 w-8 shrink-0"
      fill="none"
    >
      <rect x="10" y="6" width="38" height="52" rx="8" fill="#ffffff" />
      <path d="M40 6v12c0 2.2 1.8 4 4 4h12" fill="#f1f5f9" />
      <path d="M48 6l8 8v8H44a4 4 0 0 1-4-4V6h8Z" fill="#E5E7EB" />
      <rect x="18" y="28" width="22" height="6" rx="3" fill="#E84040" />
      <rect x="18" y="38" width="16" height="4" rx="2" fill="#CBD5E1" />
    </svg>
  );
}

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const links = useMemo(() => navItems, []);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-topbar">
      <div className="mx-auto flex h-[52px] w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            aria-label="Відкрити меню"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-white transition-all duration-200 hover:bg-white/10 md:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>

          <Link to="/" className="flex min-w-0 items-center gap-3">
            <PdfLogo />
            <span className="truncate font-syne text-base font-bold tracking-tight text-white sm:text-lg">
              PDF Web Toolkit
            </span>
          </Link>
        </div>

        <nav className="hidden items-center gap-1 md:flex">
          {links.slice(0, 6).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-white/10 text-white"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 sm:flex">
            <UserCircle2 className="h-5 w-5 text-white/80" />
            <span className="font-dmsans text-sm font-medium text-white">Guest</span>
          </div>

          <button
            type="button"
            aria-label="Меню користувача"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-white transition-all duration-200 hover:bg-white/10"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div
        className={`fixed inset-0 z-[60] md:hidden ${
          mobileOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
      >
        <div
          className={`absolute inset-0 bg-black/40 transition-all duration-200 ${
            mobileOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setMobileOpen(false)}
        />
        <aside
          className={`absolute left-0 top-0 h-full w-[86%] max-w-[320px] border-r border-white/10 bg-topbar p-4 shadow-2xl transition-all duration-200 ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <PdfLogo />
              <span className="font-syne text-lg font-bold text-white">PDF Toolkit</span>
            </div>
            <button
              type="button"
              aria-label="Закрити меню"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-white transition-all duration-200 hover:bg-white/10"
              onClick={() => setMobileOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center gap-2">
              <UserCircle2 className="h-5 w-5 text-white/80" />
              <span className="text-sm font-medium text-white">Guest</span>
            </div>
          </div>

          <nav className="space-y-1">
            {links.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-white/10 text-white"
                      : "text-white/75 hover:bg-white/10 hover:text-white"
                  }`
                }
              >
                {item.icon}
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>
      </div>
    </header>
  );
}