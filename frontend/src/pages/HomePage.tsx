import { Link } from "react-router-dom";
import {
  AlignJustify,
  ArrowRight,
  Combine,
  Crop,
  Edit3,
  FileOutput,
  FileSymlink,
  Minimize2,
  Scissors,
  Trash2
} from "lucide-react";

type ToolCard = {
  title: string;
  description: string;
  to: string;
  icon: JSX.Element;
};

const tools: ToolCard[] = [
  {
    title: "Merge PDF",
    description: "Об’єднання кількох PDF в один документ.",
    to: "/merge",
    icon: <Combine className="h-8 w-8" />
  },
  {
    title: "Split PDF",
    description: "Розділення PDF за сторінками або діапазонами.",
    to: "/split",
    icon: <Scissors className="h-8 w-8" />
  },
  {
    title: "Edit PDF",
    description: "Редагування порядку, повороту та сторінок.",
    to: "/edit",
    icon: <Edit3 className="h-8 w-8" />
  },
  {
    title: "Compress PDF",
    description: "Зменшення розміру документа.",
    to: "/compress",
    icon: <Minimize2 className="h-8 w-8" />
  },
  {
    title: "Extract Pages",
    description: "Витяг обраних сторінок у новий файл.",
    to: "/extract",
    icon: <FileOutput className="h-8 w-8" />
  },
  {
    title: "Delete Pages",
    description: "Видалення сторінок з PDF без зайвих кроків.",
    to: "/delete-pages",
    icon: <Trash2 className="h-8 w-8" />
  },
  {
    title: "Convert",
    description: "Конвертація PDF, зображень та DOCX.",
    to: "/convert",
    icon: <FileSymlink className="h-8 w-8" />
  },
  {
    title: "Crop PDF",
    description: "Обрізання сторінок і полів документа.",
    to: "/crop",
    icon: <Crop className="h-8 w-8" />
  },
  {
    title: "Align PDF",
    description: "Вирівнювання орієнтації та розміру сторінок.",
    to: "/align",
    icon: <AlignJustify className="h-8 w-8" />
  }
];

export default function HomePage() {
  return (
    <section className="space-y-8">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft sm:p-8">
        <div className="max-w-3xl">
          <div className="inline-flex rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-accent">
            Corporate PDF Suite
          </div>
          <h1 className="mt-4 font-syne text-3xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
            PDF Web Toolkit
          </h1>
          <p className="mt-4 max-w-2xl font-dmsans text-base leading-7 text-slate-600 sm:text-lg">
            Мінімалістичний набір інструментів для професійної роботи з PDF:
            об’єднання, редагування, конвертація, стиснення, обрізання та вирівнювання.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tools.map((tool) => (
          <Link
            key={tool.to}
            to={tool.to}
            aria-label={`Відкрити ${tool.title}`}
            className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-accent/50 hover:shadow-soft"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-accent transition-all duration-200 group-hover:bg-accent/10">
                {tool.icon}
              </div>
              <ArrowRight className="h-5 w-5 text-slate-300 transition-all duration-200 group-hover:translate-x-1 group-hover:text-accent" />
            </div>

            <div className="mt-5">
              <h2 className="font-syne text-xl font-bold text-slate-900">{tool.title}</h2>
              <p className="mt-2 truncate font-dmsans text-sm text-slate-600">{tool.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}