import { useEffect } from "react";

import {
  Activity,
  Database,
  RefreshCw,
  Server,
} from "lucide-react";

import Card from "./Card.jsx";
import Button from "./Button.jsx";
import Alert from "./Alert.jsx";

import { useApiStatusStore } from "../../store/useApiStatusStore.js";

const statusStyles = {
  online: "text-success",
  connected: "text-success",
  offline: "text-danger",
  disconnected: "text-danger",
  checking: "text-accent",
  idle: "text-muted",
};

function StatusRow({
  icon: Icon,
  label,
  status,
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-4 last:border-b-0">
      <div className="flex items-center gap-3">
        <Icon size={20} className="text-accent" />

        <span className="text-sm font-medium">
          {label}
        </span>
      </div>

      <span
        className={[
          "text-sm font-semibold capitalize",
          statusStyles[status] || "text-muted",
        ].join(" ")}
      >
        {status}
      </span>
    </div>
  );
}

export default function ApiStatus() {
  const serverStatus = useApiStatusStore(
    (state) => state.serverStatus
  );

  const databaseStatus = useApiStatusStore(
    (state) => state.databaseStatus
  );

  const loading = useApiStatusStore(
    (state) => state.loading
  );

  const error = useApiStatusStore(
    (state) => state.error
  );

  const lastChecked = useApiStatusStore(
    (state) => state.lastChecked
  );

  const checkConnectivity = useApiStatusStore(
    (state) => state.checkConnectivity
  );

  useEffect(() => {
    checkConnectivity();
  }, [checkConnectivity]);

  return (
    <Card>
      <div className="mb-5 flex items-center gap-3">
        <Activity size={24} className="text-accent" />

        <div>
          <h2 className="text-xl font-bold">
            API Connectivity
          </h2>

          <p className="mt-1 text-sm text-muted">
            Development environment status
          </p>
        </div>
      </div>

      <StatusRow
        icon={Server}
        label="Express API"
        status={serverStatus}
      />

      <StatusRow
        icon={Database}
        label="MongoDB Atlas"
        status={databaseStatus}
      />

      {error && (
        <Alert type="error" className="mt-5">
          {error}
        </Alert>
      )}

      {lastChecked && (
        <p className="mt-5 text-xs text-muted">
          Last checked:{" "}
          {new Date(lastChecked).toLocaleString()}
        </p>
      )}

      <Button
        variant="outline"
        loading={loading}
        disabled={loading}
        onClick={checkConnectivity}
        className="mt-5"
      >
        <RefreshCw size={17} />
        Check Connection
      </Button>
    </Card>
  );
}