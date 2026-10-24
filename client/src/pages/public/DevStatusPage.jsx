import {
  ShieldCheck,
  ServerCog,
} from "lucide-react";

import ApiStatus from "../../components/ui/ApiStatus.jsx";
import Alert from "../../components/ui/Alert.jsx";

export default function DevStatusPage() {
  return (
    <section className="page-section">
      <div className="page-container max-w-3xl">
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <ServerCog
              size={30}
              className="text-accent"
            />

            <h1 className="text-3xl font-bold">
              Development Status
            </h1>
          </div>

          <p className="mt-4 text-muted">
            Verify communication between the React
            frontend, Express backend, and MongoDB Atlas.
          </p>
        </div>

        <ApiStatus />

        <Alert type="info" className="mt-6">
          <div className="flex items-start gap-2">
            <ShieldCheck size={18} className="shrink-0" />

            <p>
              This page is for local development only.
              Production diagnostics will use protected
              administrative tools.
            </p>
          </div>
        </Alert>
      </div>
    </section>
  );
}