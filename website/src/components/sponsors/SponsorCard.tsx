import { ArrowUpRight, Sparkles } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageProvider";
import type { Sponsor } from "@/content/sponsors";
import { cn } from "@/lib/utils";

export function SponsorCard({ sponsor }: { sponsor: Sponsor }) {
  const { lang } = useLanguage();
  const s = sponsor;

  // 旗舰 + 有 banner：全宽大屏卡片，图片在上、文字在下
  if (s.banner) {
    return (
      <a
        href={s.url}
        target="_blank"
        rel="noreferrer"
        className="group relative flex flex-col overflow-hidden rounded-2xl border border-gold/40 bg-card/60 transition-all hover:-translate-y-0.5 hover:border-gold/70 md:col-span-2 lg:col-span-3"
      >
        <ArrowUpRight className="absolute right-4 top-4 z-10 size-4 text-white/80 transition-colors group-hover:text-white" />

        <img
          src={s.banner}
          alt={s.name}
          className="aspect-[1269/337] w-full object-cover"
        />

        <div className="flex flex-col gap-3 p-6">
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-bold">{s.name}</h3>
            <span className="rounded-full bg-gold/10 px-2.5 py-0.5 text-xs font-semibold text-gold">
              {s.tagline[lang]}
            </span>
          </div>

          <p className="text-sm leading-relaxed text-muted-foreground">{s.description[lang]}</p>

          {s.perk && (
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-gold/10 px-2.5 py-1.5 text-xs font-medium text-gold">
                <Sparkles className="size-3.5" />
                {s.perk[lang]}
              </span>
            </div>
          )}
        </div>
      </a>
    );
  }

  return (
    <a
      href={s.url}
      target="_blank"
      rel="noreferrer"
      className="group relative flex min-h-[180px] flex-col rounded-2xl border border-border/70 bg-card/60 p-6 transition-all hover:-translate-y-0.5 hover:border-primary/40"
    >
      <ArrowUpRight className="absolute right-4 top-4 size-4 text-muted-foreground transition-colors group-hover:text-primary" />

      <div className="flex items-center gap-3.5">
        {s.logo ? (
          <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl border border-border/60 bg-white shadow">
            <img src={s.logo} alt={s.name} className="h-9 w-9 object-contain" />
          </span>
        ) : (
          <span
            className={cn(
              "grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-2xl shadow",
              s.accent ?? "from-primary to-fuchsia-500",
            )}
          >
            {s.badge}
          </span>
        )}
        <h3 className="min-w-0 truncate pr-5 text-lg font-bold">{s.name}</h3>
      </div>

      {/* 描述填满卡片，避免大片空白 */}
      <p className="mt-4 flex-1 text-sm leading-relaxed text-muted-foreground line-clamp-4">
        {s.description[lang]}
      </p>

      {s.perk && (
        <div className="pt-4">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-gold/10 px-2.5 py-1.5 text-xs font-medium text-gold">
            <Sparkles className="size-3.5" />
            {s.perk[lang]}
          </span>
        </div>
      )}
    </a>
  );
}
