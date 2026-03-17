import { Link } from "react-router-dom";

const tools = [
  { label: "Merge", to: "/merge" },
  { label: "Split", to: "/split" },
  { label: "Edit", to: "/edit" },
  { label: "Compress", to: "/compress" },
  { label: "Extract", to: "/extract" },
  { label: "Delete Pages", to: "/delete-pages" },
  { label: "Convert", to: "/convert" },
  { label: "Crop", to: "/crop" },
  { label: "Align", to: "/align" }
];

export default function Footer() {
  return (
    <footer className="mt-12 border-t border-slate-200 bg-slate-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap gap-2">
          {tools.map((tool) => (
            <Link
              key={tool.to}
              to={tool.to}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 transition-all duration-200 hover:border-accent hover:text-accent"
            >
              {tool.label}
            </Link>
          ))}
        </div>

        <div className="flex flex-col justify-between gap-2 border-t border-slate-200 pt-4 text-sm text-slate-500 sm:flex-row">
          <p>© {new Date().getFullYear()} PDF Web Toolkit. All rights reserved.</p>
          <p>Built with React, TypeScript, TailwindCSS and Flask.</p>
        </div>
      </div>
    </footer>
  );
}