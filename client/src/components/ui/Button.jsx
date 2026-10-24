import { Link } from "react-router-dom";

const variants = {
  primary:
    "bg-primary text-white hover:bg-primary-hover",

  accent:
    "bg-accent text-background hover:bg-accent-hover",

  outline:
    "border border-border bg-transparent text-foreground hover:bg-surface-light",

  ghost:
    "bg-transparent text-muted hover:bg-surface-light hover:text-foreground",

  danger:
    "bg-danger text-white hover:bg-red-600",
};

const sizes = {
  sm: "min-h-9 px-3 py-2 text-sm",
  md: "min-h-11 px-5 py-2.5 text-sm",
  lg: "min-h-12 px-6 py-3 text-base",
};

export default function Button({
  children,
  variant = "primary",
  size = "md",
  fullWidth = false,
  loading = false,
  disabled = false,
  to,
  type = "button",
  className = "",
  ...props
}) {
  const classes = [
    "inline-flex items-center justify-center gap-2",
    "rounded-xl font-semibold transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2",
    "focus-visible:outline-accent",
    "disabled:cursor-not-allowed disabled:opacity-50",
    variants[variant] || variants.primary,
    sizes[size] || sizes.md,
    fullWidth ? "w-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (to) {
    return (
      <Link
        to={to}
        className={classes}
        aria-disabled={disabled || loading}
        tabIndex={disabled || loading ? -1 : undefined}
        onClick={(event) => {
          if (disabled || loading) {
            event.preventDefault();
          }
        }}
        {...props}
      >
        {children}
      </Link>
    );
  }

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      )}

      {children}
    </button>
  );
}