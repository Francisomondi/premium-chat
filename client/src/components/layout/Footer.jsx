import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="border-t border-border bg-[#0b0910] py-12">
      <div className="page-container">
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="text-xl font-bold text-accent">
              PremiumChat
            </h3>

            <p className="mt-3 max-w-md text-sm leading-7 text-muted">
              A creator-to-user platform for private
              conversations and premium digital content.
            </p>
          </div>

          <div className="flex flex-wrap gap-6 md:justify-end">
            <Link to="/" className="text-sm text-muted hover:text-accent">
              Home
            </Link>

            <Link to="/explore" className="text-sm text-muted hover:text-accent">
              Explore
            </Link>

            <Link to="/register" className="text-sm text-muted hover:text-accent">
              Join
            </Link>
          </div>
        </div>

        <div className="mt-8 border-t border-border pt-6 text-sm text-muted">
          © {new Date().getFullYear()} PremiumChat.
          All rights reserved. Adults 18+ only.
        </div>
      </div>
    </footer>
  );
}