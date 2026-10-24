import { useId } from "react";

export default function Input({
  label,
  error,
  helperText,
  className = "",
  id,
  type = "text",
  ...props
}) {
  const generatedId = useId();
  const inputId = id || generatedId;

  const errorId = `${inputId}-error`;
  const helperId = `${inputId}-helper`;

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="mb-2 block text-sm font-medium text-foreground"
        >
          {label}
        </label>
      )}

      <input
        id={inputId}
        type={type}
        aria-invalid={Boolean(error)}
        aria-describedby={
          error
            ? errorId
            : helperText
              ? helperId
              : undefined
        }
        className={[
          "w-full rounded-xl border bg-surface-light",
          "px-4 py-3 text-sm text-foreground",
          "placeholder:text-muted",
          "outline-none transition-colors",
          error
            ? "border-danger"
            : "border-border focus:border-accent",
          className,
        ].join(" ")}
        {...props}
      />

      {error && (
        <p
          id={errorId}
          role="alert"
          className="mt-2 text-xs text-danger"
        >
          {error}
        </p>
      )}

      {!error && helperText && (
        <p
          id={helperId}
          className="mt-2 text-xs text-muted"
        >
          {helperText}
        </p>
      )}
    </div>
  );
}