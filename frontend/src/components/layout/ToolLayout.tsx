import { useState, type ReactNode } from "react";
import { HelpCircle, X } from "lucide-react";
import { Link } from "react-router-dom";

type ToolLayoutProps = {
  title: string;
  icon: ReactNode;
  description: string;
  children: ReactNode;
};

export default function ToolLayout({
  title,
  icon,
  description,
  children
}: ToolLayoutProps) {
  const [openHelp, setOpenHelp] = useState(false);

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-all duration-200 hover:border-accent hover:text-accent"
          aria-label="Повернутися до всіх інструментів"
        >
          ← Всі інструменти
        </Link>

        <button
          type="button"
          aria-label={`Підказка для ${title}`}
          onClick={() => setOpenHelp(true)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-all duration-200 hover:border-accent hover:text-accent"
        >
          <HelpCircle className="h-5 w-5" />
        </button>
      </div>

      <div className="rounded-3xl border border-border bg-white p-5 shadow-soft sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
              {icon}
            </div>

            <div>
              <h1 className="font-syne text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                {title}
              </h1>
              <p className="mt-2 max-w-2xl font-dmsans text-sm text-slate-600 sm:text-base">
                {description}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div>{children}</div>

      {openHelp && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-syne text-xl font-bold text-slate-900">Як працює {title}</h2>
                <p className="mt-2 text-sm text-slate-600">{description}</p>
              </div>
              <button
                type="button"
                aria-label="Закрити підказку"
                onClick={() => setOpenHelp(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition-all duration-200 hover:border-accent hover:text-accent"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
              Завантаж файл, налаштуй параметри інструменту, запусти обробку та дочекайся
              завершення job. Після цього завантаж готовий результат.
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setOpenHelp(false)}
                className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:opacity-90"
              >
                Зрозуміло
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}