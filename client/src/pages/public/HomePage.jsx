import {
  ArrowRight,
  LockKeyhole,
  MessageCircle,
  ShieldCheck,
  Users,
} from "lucide-react";

import Button from "../../components/ui/Button.jsx";
import Card from "../../components/ui/Card.jsx";
import { Link } from "react-router-dom";

import { useUIStore } from "../../store/useUIStore.js";

const features = [
  {
    icon: MessageCircle,
    title: "Private Live Messaging",
    description:
      "Connect with creators through private, real-time conversations.",
  },
  {
    icon: LockKeyhole,
    title: "Exclusive Content",
    description:
      "Unlock premium photos and videos from verified creators.",
  },
  {
    icon: ShieldCheck,
    title: "Privacy & Safety",
    description:
      "Secure accounts, consent-focused sharing, and privacy controls.",
  },
];

export default function HomePage() {
  const showNotification = useUIStore(
    (state) => state.showNotification
  );

  return (
    <>
      <section className="relative overflow-hidden py-24 sm:py-32">
        <div className="pointer-events-none absolute right-0 top-0 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />

        <div className="page-container relative">
          <span className="eyebrow">
            Exclusive Creator Experiences
          </span>

          <h1 className="mt-5 max-w-4xl text-5xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl">
            Connect Privately.
            <br />
            <span className="text-accent">
              Unlock More.
            </span>
          </h1>

          <p className="mt-7 max-w-2xl text-lg leading-8 text-muted">
            Discover creators, enjoy private conversations,
            and access exclusive digital content in one
            premium platform.
          </p>

          <div className="mt-9 flex flex-wrap gap-4">
            <Button to="/explore" variant="accent" size="lg">
              Explore Creators
              <ArrowRight size={18} />
            </Button>

            <Button to="/register" variant="outline" size="lg">
              Join the Platform
            </Button>

            {import.meta.env.DEV && (
            <div className="mt-6">
                <Link
                to="/dev/status"
                className="text-sm font-medium text-accent hover:underline"
                >
                View Development API Status →
                </Link>
            </div>
            )}
          </div>

          <div className="mt-9 flex max-w-xl items-start gap-3 text-sm text-muted">
            <ShieldCheck
              size={20}
              className="shrink-0 text-accent"
            />

            <span>
              Adults 18+ only. Age verification is required
              before accessing restricted features.
            </span>
          </div>
        </div>
      </section>

      <section className="page-section border-t border-border">
        <div className="page-container">
          <div className="section-heading">
            <span className="eyebrow">
              Platform Features
            </span>

            <h2 className="mt-4 text-3xl font-bold sm:text-4xl">
              Everything in One Place
            </h2>

            <p className="mt-4 text-muted">
              Built for creator connections, privacy,
              and premium experiences.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon;

              return (
                <Card key={feature.title}>
                  <div className="mb-5 inline-flex rounded-xl bg-primary/20 p-3 text-accent">
                    <Icon size={27} />
                  </div>

                  <h3 className="text-lg font-bold">
                    {feature.title}
                  </h3>

                  <p className="mt-3 text-sm leading-7 text-muted">
                    {feature.description}
                  </p>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-surface py-20">
        <div className="page-container flex flex-col items-center text-center">
          <Users size={36} className="text-accent" />

          <h2 className="mt-5 text-3xl font-bold">
            Ready to Get Started?
          </h2>

          <p className="mt-4 max-w-xl text-muted">
            Create an account and discover our upcoming
            creator community.
          </p>

          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button to="/register" variant="accent">
              Create Account
              <ArrowRight size={18} />
            </Button>

            <Button
              variant="outline"
              onClick={() =>
                showNotification({
                  type: "info",
                  message:
                    "Our creator platform is currently under development.",
                })
              }
            >
              Platform Status
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}