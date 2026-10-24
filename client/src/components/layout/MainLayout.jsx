import { Outlet } from "react-router-dom";

import Navbar from "./Navbar.jsx";
import Footer from "./Footer.jsx";
import NotificationBanner from "../ui/NotificationBanner.jsx";

export default function MainLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Navbar />

      <NotificationBanner />

      <main className="flex-1">
        <Outlet />
      </main>

      <Footer />
    </div>
  );
}