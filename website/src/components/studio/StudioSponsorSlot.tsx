import { ArrowUpRight, Sparkles } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageProvider";
import { sponsorLogo, sponsorUrl, sponsorsByTier } from "@/content/sponsors";
import { PerkText } from "@/components/sponsors/PerkText";
import { cn } from "@/lib/utils";

/**
 * Studio 底部旗舰赞助位 —— 桌面端落地页(/studio)也是这个页面，所以这里放一个
 * 克制的旗舰赞助商横条，不打断工作区。取 flagship 档第一个赞助商。
 */
export function StudioSponsorSlot() {
  const { lang, t } = useLanguage();
  const sponsor = sponsorsByTier("flagship")[0];
  if (!sponsor) return null;

  return (
    <div className="container-page pb-8">
      <a
        href={sponsorUrl(sponsor, lang)}
        target="_blank"
        rel="noreferrer"
        className="group flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-gold/40 bg-gold/[0.04] px-5 py-3.5 transition-colors hover:border-gold/70"
      >
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-2.5 py-0.5 text-[11px] font-semibold text-gold">
          <Sparkles className="size-3" /> {t.studio.providers.flagshipTag}
        </span>

        {sponsor.logo ? (
          <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-lg border border-border/60 bg-white p-1 dark:bg-white/95">
            <img src={sponsorLogo(sponsor, lang)} alt={sponsor.name} className="h-full w-full object-contain" />
          </span>
        ) : (
          <span className={cn("grid size-6 place-items-center rounded bg-gradient-to-br text-sm", sponsor.accent ?? "from-primary to-fuchsia-500")}>
            {sponsor.badge}
          </span>
        )}

        <span className="font-bold">{sponsor.name}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{sponsor.tagline[lang]}</span>

        {sponsor.perk && (
          <span className="hidden shrink-0 items-center gap-1.5 text-xs font-medium text-gold sm:inline-flex">
            <PerkText text={sponsor.perk[lang]} code={sponsor.couponCode} />
          </span>
        )}
        <ArrowUpRight className="size-4 shrink-0 text-gold/70 transition-colors group-hover:text-gold" />
      </a>
    </div>
  );
}
