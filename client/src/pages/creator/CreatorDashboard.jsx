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
  LockKeyhole,
  Video,
  Image as ImageIcon,
  CircleCheck,
} from "lucide-react";

import Card from "../../components/ui/Card.jsx";

import { useAuthStore } from "../../store/useAuthStore.js";

const sections = [
  {
    icon: MessageSquare,
    title: "Conversations",
    description:
      "Manage private conversations with your audience.",
    status: "Coming soon",
  },
  {
    icon: Images,
    title: "Creator Gallery",
    description:
      "Upload and organize the images and videos you share with your audience.",
    path: "/creator/gallery",
    status: "Available",
  },
  {
    icon: Wallet,
    title: "Earnings",
    description:
      "Track payments, revenue, and future payouts.",
    status: "Coming soon",
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

function StatusBadge({ children, positive = false }) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-3 py-1",
        "text-xs font-medium",
        positive
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          : "border-border bg-background text-muted",
      ].join(" ")}
    >
      {children}
    </span>
  );
}

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
   * This is a frontend display check only.
   *
   * The backend remains responsible for verifying
   * the account's actual eligibility, including
   * verification expiry and creator permissions.
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

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="eyebrow">
              Creator Workspace
            </span>

            <h1 className="mt-4 text-3xl font-bold">
              Welcome, {displayName}!
            </h1>

            <p className="page-description">
              Manage your audience, premium content,
              and creator account on PremiumChat.
            </p>
          </div>

          <StatusBadge positive={creatorRequirementsMet}>
            {creatorRequirementsMet
              ? "Creator approved"
              : "Setup in progress"}
          </StatusBadge>
        </div>

        {/* ============================================= */}
        {/* CREATOR ACCOUNT OVERVIEW                      */}
        {/* ============================================= */}

        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {/* Creator Profile */}

          <Card>
            <UserRound
              size={26}
              className="text-accent"
            />

            <h2 className="mt-4 text-lg font-semibold">
              Creator Profile
            </h2>

            <div className="mt-4 space-y-4 text-sm">
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

          {/* Verification Status */}

          <Card>
            <ShieldCheck
              size={26}
              className="text-accent"
            />

            <h2 className="mt-4 text-lg font-semibold">
              Verification Status
            </h2>

            <div className="mt-4 space-y-4 text-sm">
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
                  {formatStatus(ageVerificationStatus)}
                </p>
              </div>
            </div>
          </Card>

          {/* Creator Approval */}

          <Card>
            <BadgeCheck
              size={26}
              className="text-accent"
            />

            <h2 className="mt-4 text-lg font-semibold">
              Creator Approval
            </h2>

            <div className="mt-4 space-y-4 text-sm">
              <div>
                <p className="text-muted">
                  Application Status
                </p>

                <p className="mt-1 font-medium">
                  {formatStatus(creatorApplicationStatus)}
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

            <div className="mt-4 flex items-start gap-2">
              <Info
                size={15}
                className="mt-0.5 shrink-0 text-muted"
              />

              <p className="text-xs leading-5 text-muted">
                Final access to creator features is
                verified securely by the backend.
              </p>
            </div>
          </Card>
        </div>

        {/* ============================================= */}
        {/* CREATOR CONTENT WORKSPACE                     */}
        {/* ============================================= */}

        <div className="mt-10">
          <div>
            <span className="eyebrow">
              Your Workspace
            </span>

            <h2 className="mt-3 text-2xl font-bold">
              Creator Tools
            </h2>

            <p className="mt-2 text-sm leading-6 text-muted">
              Build your content library and prepare
              to connect with your audience.
            </p>
          </div>

          <div className="dashboard-grid mt-6">
            {sections.map(
              ({
                icon: Icon,
                title,
                description,
                path,
                status,
              }) => {
                const isAvailable = Boolean(path);

                return (
                  <Card
                    key={title}
                    className="flex flex-col"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex size-11 items-center justify-center rounded-xl border border-border bg-background">
                        <Icon
                          size={23}
                          className="text-accent"
                        />
                      </div>

                      <StatusBadge positive={isAvailable}>
                        {status}
                      </StatusBadge>
                    </div>

                    <h3 className="mt-5 text-lg font-semibold">
                      {title}
                    </h3>

                    <p className="mt-2 flex-1 text-sm leading-6 text-muted">
                      {description}
                    </p>

                    {isAvailable ? (
                      <Link
                        to={path}
                        className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-accent transition-opacity hover:opacity-80"
                      >
                        Open gallery
                        <ArrowRight size={16} />
                      </Link>
                    ) : (
                      <p className="mt-5 text-xs font-medium text-muted">
                        This workspace will be available
                        in a future module.
                      </p>
                    )}
                  </Card>
                );
              }
            )}
          </div>
        </div>

        {/* ============================================= */}
        {/* PREMIUM CONTENT PREVIEW                       */}
        {/* ============================================= */}

        <Card className="mt-10 overflow-hidden">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <span className="eyebrow">
                Monetization
              </span>

              <h2 className="mt-3 text-2xl font-bold">
                Your premium content journey
              </h2>

              <p className="mt-3 text-sm leading-6 text-muted">
                PremiumChat is preparing tools that
                will help creators share exclusive
                content and build paid relationships
                with their audience.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 lg:min-w-[280px]">
              <div className="rounded-xl border border-border bg-background p-3 text-center">
                <MessageSquare
                  size={20}
                  className="mx-auto text-accent"
                />

                <p className="mt-2 text-xs font-medium">
                  Private chat
                </p>
              </div>

              <div className="rounded-xl border border-border bg-background p-3 text-center">
                <ImageIcon
                  size={20}
                  className="mx-auto text-accent"
                />

                <p className="mt-2 text-xs font-medium">
                  Paid images
                </p>
              </div>

              <div className="rounded-xl border border-border bg-background p-3 text-center">
                <Video
                  size={20}
                  className="mx-auto text-accent"
                />

                <p className="mt-2 text-xs font-medium">
                  Paid videos
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 border-t border-border pt-5">
            <div className="flex items-start gap-3">
              <LockKeyhole
                size={19}
                className="mt-0.5 shrink-0 text-accent"
              />

              <p className="text-sm leading-6 text-muted">
                Paid media delivery, earnings, and
                payout management will be connected
                when their respective modules are ready.
                No earnings or transaction figures are
                displayed until real data is available.
              </p>
            </div>
          </div>
        </Card>

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