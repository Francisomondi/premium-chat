
import {
  Users,
  ShieldCheck,
  ChartNoAxesCombined,
  UserRound,
  MailCheck,
  ClipboardCheck,
  AlertTriangle,
} from "lucide-react";

import Card from "../../components/ui/Card.jsx";
import PendingCreatorApplications from "../../components/admin/PendingCreatorApplications.jsx";
import { useAuthStore } from "../../store/useAuthStore.js";
import AdminCreatorProfiles from "../../components/admin/AdminCreatorProfiles.jsx";

import CreatorApplicationHistory from "../../components/admin/CreatorApplicationHistory.jsx";

/**
 * ============================================================
 * PREMIUMCHAT ADMIN DASHBOARD
 * ============================================================
 *
 * Displays authenticated administrator information.
 *
 * Admin access is controlled by ProtectedRoute.
 *
 * Future modules:
 * - User management
 * - Creator application reviews
 * - Verification and moderation
 * - Platform analytics
 * - Payment and transaction oversight
 *
 * Platform statistics are not fabricated.
 */

const sections = [
  {
    icon: Users,
    title: "User Management",
    description:
      "Manage registered accounts, roles, and account statuses.",
  },
  {
    icon: ShieldCheck,
    title: "Verification & Safety",
    description:
      "Review creator applications. Additional verification and moderation tools are planned.",
  },
  {
    icon: ChartNoAxesCombined,
    title: "Analytics",
    description:
      "View platform activity, transactions, and revenue.",
  },
];

const formatStatus = (value) => {
  if (!value) {
    return "Unknown";
  }

  return String(value)
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase()
    );
};

export default function AdminDashboard() {
  const user = useAuthStore((state) => state.user);

  const displayName =
    user?.displayName || "Administrator";

  const email =
    user?.email || "Not available";

  const role =
    user?.role || "UNKNOWN";

  const accountStatus =
    user?.accountStatus || "UNKNOWN";

  const emailVerified =
    user?.emailVerified === true;

  const isActiveAdmin =
    role === "ADMIN" &&
    accountStatus === "ACTIVE";

  return (
    <section className="page-section">
      <div className="page-container">
        {/* ============================================= */}
        {/* ADMIN WELCOME                                 */}
        {/* ============================================= */}

        <span className="eyebrow">
          Administration
        </span>

        <h1 className="mt-4 text-3xl font-bold">
          Welcome, {displayName}!
        </h1>

        <p className="page-description">
          Manage platform users, creator verification,
          moderation, and transactions.
        </p>

        {/* ============================================= */}
        {/* ADMIN ACCOUNT OVERVIEW                        */}
        {/* ============================================= */}

        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <Card>
            <UserRound
              size={26}
              className="text-accent"
            />

            <h2 className="mt-4 text-lg font-semibold">
              Administrator Profile
            </h2>

            <div className="mt-4 space-y-3 text-sm">
              <div>
                <p className="text-muted">
                  Display Name
                </p>

                <p className="mt-1 font-medium">
                  {displayName}
                </p>
              </div>

              <div>
                <p className="text-muted">
                  Email Address
                </p>

                <p className="mt-1 break-all font-medium">
                  {email}
                </p>
              </div>

              <div>
                <p className="text-muted">
                  Account Role
                </p>

                <p className="mt-1 font-medium">
                  {formatStatus(role)}
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <ShieldCheck
              size={26}
              className="text-accent"
            />

            <h2 className="mt-4 text-lg font-semibold">
              Account Security
            </h2>

            <div className="mt-4 space-y-3 text-sm">
              <div>
                <p className="text-muted">
                  Account Status
                </p>

                <p className="mt-1 font-medium">
                  {formatStatus(accountStatus)}
                </p>
              </div>

              <div>
                <p className="text-muted">
                  Email Verification
                </p>

                <p className="mt-1 flex items-center gap-2 font-medium">
                  <MailCheck
                    size={16}
                    className="text-accent"
                  />

                  {emailVerified
                    ? "Verified"
                    : "Not Verified"}
                </p>
              </div>

              <div>
                <p className="text-muted">
                  Administrator Access
                </p>

                <p className="mt-1 font-medium">
                  {isActiveAdmin
                    ? "Active Admin"
                    : "Restricted"}
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <ClipboardCheck
              size={26}
              className="text-accent"
            />

            <h2 className="mt-4 text-lg font-semibold">
              Platform Oversight
            </h2>

            <p className="mt-4 text-sm leading-6 text-muted">
              Administrative tools will allow
              authorized staff to review accounts,
              creator applications, moderation
              reports, and financial activity.
            </p>

            <p className="mt-4 text-xs font-medium text-muted">
              Management APIs will be connected
              in future modules.
            </p>
          </Card>
        </div>

        
        {/* ============================================= */}
        {/* CREATOR APPLICATION MANAGEMENT                */}
        {/* ============================================= */}

        {isActiveAdmin && (
          <div
            id="creator-application-reviews"
            className="mt-10 space-y-10"
          >
            {/* Pending applications */}
            <PendingCreatorApplications />

            {/* Application history */}
            <CreatorApplicationHistory />

            {/* Approved creator profiles */}
            <AdminCreatorProfiles />
          </div>
        )}



        {/* ============================================= */}
        {/* ADMINISTRATION NOTICE                         */}
        {/* ============================================= */}

        <div className="mt-8 rounded-2xl border border-border bg-surface p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle
              size={23}
              className="mt-1 shrink-0 text-accent"
            />

            <div>
              <h2 className="text-lg font-semibold">
                Administrative Security
              </h2>

              <p className="mt-2 text-sm leading-6 text-muted">
                Administrative operations require
                server-side authorization.
                Access to this dashboard alone
                does not grant permission to
                perform privileged actions.
              </p>

              <p className="mt-3 text-sm leading-6 text-muted">
                User management, creator approvals,
                and financial operations will be
                protected by backend role checks
                and appropriate audit logging.
              </p>
            </div>
          </div>
        </div>

        {/* ============================================= */}
        {/* ADMIN TOOLS                                   */}
        {/* ============================================= */}

        <div className="mt-10">
          <h2 className="text-2xl font-bold">
            Administration Tools
          </h2>

        <p className="mt-2 text-sm text-muted">
          Manage creator applications and access
          administrative tools as additional
          platform features become available.
        </p>

          <div className="dashboard-grid mt-6">
            {sections.map(
              ({ icon: Icon, title, description }) => (
                <Card key={title}>
                  <Icon
                    size={28}
                    className="text-accent"
                  />

                  <h3 className="mt-4 text-lg font-semibold">
                    {title}
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-muted">
                    {description}
                  </p>

                  <p className="mt-4 text-xs font-medium text-muted">
                    Feature coming in a future module
                  </p>
                </Card>
              )
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
