export default function Card({
  children,
  className = "",
  padding = true,
  ...props
}) {
  return (
    <div
      className={[
        "rounded-2xl border border-border bg-surface",
        "shadow-lg shadow-black/10",
        padding ? "p-6" : "",
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}