import Link from "next/link";
import { Sparkles, Plus } from "lucide-react";

/** Consistent sticky top bar for all internal app pages. */
export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="group flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-transform duration-300 group-hover:rotate-12 group-hover:scale-105">
            <Sparkles className="h-5 w-5" strokeWidth={2.5} />
          </span>
          <span className="text-lg font-bold tracking-tight font-display">Spark</span>
        </Link>

        <nav className="flex items-center gap-1">
          <Link
            href="/dashboard"
            className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Dashboard
          </Link>
          <Link
            href="/companies/new"
            className="group inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background shadow-sm transition-all duration-300 hover:scale-[1.03] hover:bg-primary hover:shadow-md hover:shadow-primary/20"
          >
            <Plus className="h-4 w-4" />
            New company
          </Link>
        </nav>
      </div>
    </header>
  );
}
