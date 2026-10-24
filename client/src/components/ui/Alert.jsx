import {
  AlertCircle,
  CheckCircle2,
  Info,
} from "lucide-react";

const styles = {
  success: {
    icon: CheckCircle2,
    className:
      "border-success/30 bg-success/10 text-green-300",
  },

  error: {
    icon: AlertCircle,
    className:
      "border-danger/30 bg-danger/10 text-red-300",
  },

  info: {
    icon: Info,
    className:
      "border-border bg-surface-light text-foreground",
  },
};

export default function Alert({
  type = "info",
  children,
  className = "",
}) {
  const selected = styles[type] || styles.info;
  const Icon = selected.icon;

  return (
    <div
      role={type === "error" ? "alert" : "status"}
      className={[
        "flex items-start gap-3 rounded-xl border p-4",
        selected.className,
        className,
      ].join(" ")}
    >
      <Icon
        size={20}
        className="mt-0.5 shrink-0"
      />

      <div className="text-sm leading-6">
        {children}
      </div>
    </div>
  );
}