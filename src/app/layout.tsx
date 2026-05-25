import type { Metadata } from "next";
import "./globals.css";
import { JobsPopup } from "@/components/shared/jobs-popup";

export const metadata: Metadata = {
  title: "Spark — Innovation visualization",
  description: "Turn raw innovation ideas into tangible, interactive visualizations.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        {children}
        <JobsPopup />
      </body>
    </html>
  );
}
