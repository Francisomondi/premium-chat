import { House } from "lucide-react";

import Button from "../../components/ui/Button.jsx";

export default function NotFoundPage() {
  return (
    <section className="flex min-h-[70vh] items-center justify-center px-4 py-16">
      <div className="text-center">
        <h1 className="text-7xl font-extrabold text-accent">
          404
        </h1>

        <h2 className="mt-4 text-3xl font-bold">
          Page Not Found
        </h2>

        <p className="mt-4 text-muted">
          The page you're looking for doesn't exist
          or has been moved.
        </p>

        <Button
          to="/"
          variant="accent"
          className="mt-7"
        >
          <House size={18} />
          Return Home
        </Button>
      </div>
    </section>
  );
}