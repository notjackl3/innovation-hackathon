import Link from "next/link";
import { Sparkles, Twitter, Github, Linkedin } from "lucide-react";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Product pipeline", href: "/companies/new" },
      { label: "Service pipeline", href: "/companies/new" },
      { label: "Software pipeline", href: "/companies/new" },
      { label: "Dashboard", href: "/dashboard" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "How it works", href: "#how" },
      { label: "Stories", href: "#stories" },
      { label: "FAQ", href: "#faq" },
      { label: "Start a company", href: "/companies/new" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "#" },
      { label: "Terms", href: "#" },
      { label: "Security", href: "#" },
      { label: "Contact", href: "mailto:hello@spark.app" },
    ],
  },
];

const SOCIALS = [
  { icon: Twitter, href: "#", label: "Twitter" },
  { icon: Github, href: "#", label: "GitHub" },
  { icon: Linkedin, href: "#", label: "LinkedIn" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
                <Sparkles className="h-5 w-5" strokeWidth={2.5} />
              </span>
              <span className="text-lg font-bold tracking-tight font-display">Spark</span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              The innovation visualization platform. Turn raw ideas into 3D models, animated video,
              and click-through demos.
            </p>
            <div className="mt-5 flex gap-2.5">
              {SOCIALS.map((s) => {
                const Icon = s.icon;
                return (
                  <a
                    key={s.label}
                    href={s.href}
                    aria-label={s.label}
                    className="grid h-9 w-9 place-items-center rounded-full border border-border text-muted-foreground transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:text-primary"
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                );
              })}
            </div>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
                {col.title}
              </h3>
              <ul className="mt-4 space-y-3 text-sm">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-border pt-8 text-sm text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} Spark. Built for the innovation hackathon.</p>
          <p className="flex items-center gap-1.5">
            Made with <span className="text-primary">✦</span> for teams who&apos;d rather see than tell.
          </p>
        </div>
      </div>
    </footer>
  );
}
