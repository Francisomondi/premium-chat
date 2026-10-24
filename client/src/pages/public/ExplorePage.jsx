import {
  Search,
  Users,
  ShieldCheck,
} from "lucide-react";

import Button from "../../components/ui/Button.jsx";
import Card from "../../components/ui/Card.jsx";

export default function ExplorePage() {
  return (
    <section className="page-section">
      <div className="page-container">
        <div className="section-heading">
          <span className="eyebrow">Creator Discovery</span>

          <h1 className="mt-4 text-4xl font-bold">
            Explore Creators
          </h1>

          <p className="page-description">
            Discover verified creators and connect privately.
          </p>
        </div>

        <Card className="mb-8">
          <div className="flex items-center gap-3 text-muted">
            <Search size={22} />
            <span className="text-sm">
              Creator search will be implemented
              in the Discovery module.
            </span>
          </div>
        </Card>

        <Card className="flex flex-col items-center text-center">
          <Users size={46} className="text-accent" />

          <h2 className="mt-5 text-2xl font-bold">
            Creator Profiles Coming Soon
          </h2>

          <p className="mt-3 max-w-lg text-sm leading-7 text-muted">
            Verified creator profiles will appear here
            after we implement registration, verification,
            and discovery.
          </p>

          <div className="mt-5 flex items-center gap-2 text-sm text-muted">
            <ShieldCheck size={18} className="text-accent" />
            <span>Verified creators and safety controls</span>
          </div>

          <Button
            to="/register"
            variant="accent"
            className="mt-7"
          >
            Join Now
          </Button>
        </Card>
      </div>
    </section>
  );
}