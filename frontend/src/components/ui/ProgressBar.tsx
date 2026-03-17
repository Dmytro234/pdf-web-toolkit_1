type ProgressVariant = "default" | "success" | "error";

type ProgressBarProps = {
  progress?: number;
  label?: string;
  variant?: ProgressVariant;
};

const variantClassMap: Record<ProgressVariant, string> = {
  default: "bg-accent",
  success: "bg-green-500",
  error: "bg-red-500"
};

export default function ProgressBar({
  progress,
  label,
  variant = "default"
}: ProgressBarProps) {
  const isIndeterminate = typeof progress !== "number" || Number.isNaN(progress);
  const normalized = isIndeterminate
    ? 40
    : Math.max(0, Math.min(100, Math.round(progress)));

  return (
    <div className="w-full" aria-label={label ?? "Індикатор прогресу"}>
      {(label || !isIndeterminate) && (
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-slate-600">{label ?? "Прогрес"}</span>
          {!isIndeterminate ? <span className="font-medium text-slate-800">{normalized}%</span> : null}
        </div>
      )}

      <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all duration-200 ${
            isIndeterminate ? `${variantClassMap[variant]} animate-pulse` : variantClassMap[variant]
          }`}
          style={{
            width: isIndeterminate ? "40%" : `${normalized}%`
          }}
        />
      </div>
    </div>
  );
}