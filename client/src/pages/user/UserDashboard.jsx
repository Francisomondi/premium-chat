
import { Link } from "react-router-dom";

import {
  MessageCircle,
  LockKeyhole,
  UserRound,
  ShieldCheck,
  MailCheck,
  BadgeCheck,
  Compass,
  ArrowRight,
} from "lucide-react";

import Card from "../../components/ui/Card.jsx";
import CreatorApplicationForm from "../../components/creator/CreatorApplicationForm.jsx";
import { useAuthStore } from "../../store/useAuthStore.js";

/**
 * ============================================================
 * PREMIUMCHAT USER DASHBOARD
 * ============================================================
 *
 * Uses the authenticated user from Zustand.
 *
 * Backend user fields:
 * - displayName
 * - email
 * - role
 * - accountStatus
 * - emailVerified
 * - ageVerificationStatus
 * - creatorApplicationStatus
 *
 * Future modules will connect messages,
 * purchased media, and profile management.
 */

const sections = [
  {
    icon: MessageCircle,
    title: "Messages",
    description:
      "Your private conversations with creators will appear here.",
  },
  {
    icon: LockKeyhole,
    title: "Unlocked Media",
    description:
      "Access images and videos you have purchased.",
  },
  {
    icon: UserRound,
    title: "My Profile",
    description:
      "Manage your personal information and account preferences.",
  },
];

/**
 * Convert backend status values into readable labels.
 */
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

export default function UserDashboard() {
  const user = useAuthStore((state) => state.user);

  const displayName = user?.displayName || "Member";

  const email = user?.email || "Not available";

  const role = user?.role || "USER";

  const accountStatus =
    user?.accountStatus || "UNKNOWN";

  const emailVerified = user?.emailVerified === true;

  const ageVerificationStatus =
    user?.ageVerificationStatus || "NOT_STARTED";

  const creatorApplicationStatus =
    user?.creatorApplicationStatus || "NOT_APPLIED";

  return (
    <section className="page-section">
      <div className="page-container">
        {/* ============================================= */}
        {/* WELCOME                                       */}
        {/* ============================================= */}

        <span className="eyebrow">User Area</span>

        <h1 className="mt-4 text-3xl font-bold">
          Welcome back, {displayName}!
        </h1>

        <p className="page-description">
          Manage your conversations, unlocked media,
          and PremiumChat account.
        </p>

        {/* ============================================= */}
        {/* ACCOUNT OVERVIEW                              */}
        {/* ============================================= */}

        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <Card>
            <UserRound
              size={26}
              className="text-accent"
            />

            <h2 className="mt-4 text-lg font-semibold">
              Account Information
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
              Account Status
            </h2>

            <div className="mt-4 space-y-3 text-sm">
              <div>
                <p className="text-muted">
                  Status
                </p>

                <p className="mt-1 font-semibold">
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
                  {formatStatus(ageVerificationStatus)}
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
              Creator Eligibility
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
                  Creator Role
                </p>

                <p className="mt-1 font-medium">
                  {role === "CREATOR"
                    ? "Assigned"
                    : "Not Assigned"}
                </p>
              </div>
            </div>

            <p className="mt-4 text-xs leading-5 text-muted">
              Creator features require an approved
              application and valid adult verification.
            </p>
          </Card>
        </div>

        {/* ============================================= */}
        {/* CREATOR APPLICATION                           */}
        {/* ============================================= */}

        {role === "USER" && accountStatus === "ACTIVE" && (
          <div className="mt-8">
            <CreatorApplicationForm />
          </div>
        )}

        {/* ============================================= */}
        {/* EXPLORE CREATORS                              */}
        {/* ============================================= */}

        <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Compass
                size={22}
                className="text-accent"
              />

              <h2 className="text-lg font-semibold">
                Discover Creators
              </h2>
            </div>

            <p className="mt-2 text-sm leading-6 text-muted">
              Explore creators and discover new
              conversations on PremiumChat.
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

        {/* ============================================= */}
        {/* DASHBOARD SECTIONS                            */}
        {/* ============================================= */}

        <div className="mt-10">
          <div className="flex items-center gap-2">
            <MailCheck
              size={22}
              className="text-accent"
            />

            <h2 className="text-2xl font-bold">
              Your Activity
            </h2>
          </div>

          <p className="mt-2 text-sm text-muted">
            Your conversations, purchased media,
            and account tools will appear here.
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
                </Card>
              )
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
