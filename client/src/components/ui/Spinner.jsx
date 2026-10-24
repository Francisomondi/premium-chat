export default function Spinner({
  size = "md",
  label = "Loading...",
}) {
  const sizes = {
    sm: "h-4 w-4",
    md: "h-8 w-8",
    lg: "h-12 w-12",
  };

  return (
    <div
      role="status"
      className="inline-flex items-center gap-3 text-muted"
    >
      <span
        aria-hidden="true"
        className={[
          "animate-spin rounded-full",
          "border-2 border-accent/20",
          "border-t-accent",
          sizes[size] || sizes.md,
        ].join(" ")}
      />

      <span className="text-sm">{label}</span>
    </div>
  );
}