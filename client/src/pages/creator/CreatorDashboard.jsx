
import { Link } from "react-router-dom";

import {
  MessageSquare,
  Images,
  Wallet,
  UserRound,
  ShieldCheck,
  BadgeCheck,
  ArrowRight,
  Info,
} from "lucide-react";

import Card from "../../components/ui/Card.jsx";

import { useAuthStore } from "../../store/useAuthStore.js";

/**
 * ============================================================
 * PREMIUMCHAT CREATOR DASHBOARD
 * ============================================================
 *
 * Displays authenticated creator account information.
 *
 * Creator dashboard access is controlled by
 * ProtectedRoute.
 *
 * Future modules:
 * - Real-time conversations
 * - Paid images and videos
 * - Creator earnings
 * - Payout management
 * - Creator profile settings
 *
 * No financial statistics are fabricated.
 */

const sections = [
  {
    icon: MessageSquare,
    title: "Conversations",
    description:
      "Manage private conversations with your audience.",
  },
  {
    icon: Images,
    title: "Premium Content",
    description:
      "Upload and manage locked images and videos.",
  },
  {
    icon: Wallet,
    title: "Earnings",
    description:
      "Track payments, revenue, and future payouts.",
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

export default function CreatorDashboard() {
  const user = useAuthStore((state) => state.user);

  const displayName =
    user?.displayName || "Creator";

  const email =
    user?.email || "Not available";

  const role =
    user?.role || "UNKNOWN";

  const accountStatus =
    user?.accountStatus || "UNKNOWN";

  const ageVerificationStatus =
    user?.ageVerificationStatus || "NOT_STARTED";

  const creatorApplicationStatus =
    user?.creatorApplicationStatus || "NOT_APPLIED";

  const emailVerified =
    user?.emailVerified === true;

  /**
   * This is a frontend display check.
   *
   * The backend remains responsible for verifying
   * the account's actual eligibility, including
   * verification expiry.
   */
  const creatorRequirementsMet =
    role === "CREATOR" &&
    accountStatus === "ACTIVE" &&
    ageVerificationStatus === "VERIFIED" &&
    creatorApplicationStatus === "APPROVED";

  return (
    <section className="page-section">
      <div className="page-container">
        {/* ============================================= */}
        {/* WELCOME                                       */}
        {/* ============================================= */}

        <span className="eyebrow">
          Creator Area
        </span>

        <h1 className="mt-4 text-3xl font-bold">
          Welcome, {displayName}!
        </h1>

        <p className="page-description">
          Manage your audience, premium content,
          and creator account on PremiumChat.
        </p>

        {/* ============================================= */}
        {/* CREATOR ACCOUNT OVERVIEW                      */}
        {/* ============================================= */}

        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <Card>
            <UserRound
              size={26}
              className="text-accent"
            />

            <h2 className="mt-4 text-lg font-semibold">
              Creator Profile
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
              Verification Status
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

                <p className="mt-1 font-medium">
                  {emailVerified
                    ? "Verified"
                    : "Not Verified"}
                </p>
              </div>

              <div>
                <p className="text-muted">
                  Age Verification
                </p>

                <p className="mt-1 font-medium">
                  {formatStatus(
                    ageVerificationStatus
                  )}
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <BadgeCheck
              size={26}
              className="text-accent"
            />

            <h2 className="mt-4 text-lg font-semibold">
              Creator Approval
            </h2>

            <div className="mt-4 space-y-3 text-sm">
              <div>
                <p className="text-muted">
                  Application Status
                </p>

                <p className="mt-1 font-medium">
                  {formatStatus(
                    creatorApplicationStatus
                  )}
                </p>
              </div>

              <div>
                <p className="text-muted">
                  Creator Requirements
                </p>

                <p className="mt-1 font-medium">
                  {creatorRequirementsMet
                    ? "Requirements Met"
                    : "Requirements Pending"}
                </p>
              </div>
            </div>

            <p className="mt-4 text-xs leading-5 text-muted">
              Final access to creator features
              is verified securely by the backend.
            </p>
          </Card>
        </div>

        {/* ============================================= */}
        {/* MONETIZATION PREPARATION                      */}
        {/* ============================================= */}

        <div className="mt-8 rounded-2xl border border-border bg-surface p-6">
          <div className="flex items-start gap-3">
            <Info
              size={23}
              className="mt-1 shrink-0 text-accent"
            />

            <div>
              <h2 className="text-lg font-semibold">
                Creator Monetization
              </h2>

              <p className="mt-2 text-sm leading-6 text-muted">
                Your future creator workspace will
                include private conversations,
                paid images and videos, earnings
                tracking, and payout management.
              </p>

              <p className="mt-3 text-sm leading-6 text-muted">
                Earnings and transaction statistics
                will appear once the payment and
                monetization modules are connected.
              </p>
            </div>
          </div>
        </div>

        {/* ============================================= */}
        {/* CREATOR TOOLS                                 */}
        {/* ============================================= */}

        <div className="mt-10">
          <h2 className="text-2xl font-bold">
            Creator Tools
          </h2>

          <p className="mt-2 text-sm text-muted">
            Manage the main areas of your creator
            workspace.
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

        {/* ============================================= */}
        {/* EXPLORE PLATFORM                              */}
        {/* ============================================= */}

        <div className="mt-10 flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">
              Explore PremiumChat
            </h2>

            <p className="mt-2 text-sm text-muted">
              Discover other creators and explore
              the platform.
            </p>
          </div>

          <Link
            to="/explore"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Explore Creators
            <ArrowRight size={17} />
          </Link>
        </div>
      </div>
    </section>
  );
}
