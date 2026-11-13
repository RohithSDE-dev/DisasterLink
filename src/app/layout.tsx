import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "DisasterLink — Know the Risk. Find Safety. Get Help.",
  description:
    "AI-assisted disaster intelligence and emergency coordination prototype for Tamil Nadu. Citizen reporting, SOS triage, command centre and flood-risk estimation.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
