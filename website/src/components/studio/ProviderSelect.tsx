import { Check, ChevronDown, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/i18n/LanguageProvider";
import { PROVIDER_LABELS, PROVIDERS } from "@/lib/studio";
import { sponsorsByTier } from "@/content/sponsors";
import { cn } from "@/lib/utils";

// 旗舰赞助商对应的 provider id（金色高亮 + 星标 + 徽章）
const FLAGSHIP_ID = sponsorsByTier("flagship")[0]?.id;
// 普通赞助商对应的 provider id（中性「赞助商」标记，不抢旗舰风头）。
// 注意：赞助商 content 里的 id（如 youyun）与 provider id（compshare）不一致，这里直接按 provider id 列。
const SPONSOR_IDS = ["compshare"];

/**
 * Studio 顶部 provider 选择器。原生 <select> 无法给单个选项上色/加徽章，
 * 这里用一个轻量自定义下拉，把旗舰赞助商（APINEBULA）金色高亮 + 星标 + 旗舰徽章并置顶。
 */
export function ProviderSelect({ value, onChange }: { value: string; onChange: (p: string) => void }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const labelFor = (p: string) => (p === "" ? t.studio.shell.providerDefault : PROVIDER_LABELS[p] ?? p);
  const isFlagship = (p: string) => !!FLAGSHIP_ID && p === FLAGSHIP_ID;
  const isSponsor = (p: string) => SPONSOR_IDS.includes(p);
  const selectedFlagship = isFlagship(value);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={t.studio.shell.providerSelectTitle}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm outline-none transition-colors",
          selectedFlagship
            ? "border-gold/60 bg-gold/10 font-semibold text-gold"
            : "border-border/70 bg-card/60 text-foreground hover:border-border",
        )}
      >
        {selectedFlagship && <Star className="size-3.5 shrink-0 fill-gold text-gold" />}
        <span className="max-w-[160px] truncate">{labelFor(value)}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-60" />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1.5 max-h-[70vh] w-60 overflow-auto rounded-xl border border-border/70 bg-card p-1 shadow-xl">
          {PROVIDERS.map((p) => {
            const flag = isFlagship(p);
            const sponsor = isSponsor(p);
            const on = p === value;
            return (
              <button
                key={p}
                type="button"
                onClick={() => {
                  onChange(p);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                  flag ? "font-semibold text-gold hover:bg-gold/10" : "text-foreground hover:bg-muted",
                  on && !flag && "bg-muted",
                  on && flag && "bg-gold/10",
                )}
              >
                {flag ? (
                  <Star className="size-4 shrink-0 fill-gold text-gold" />
                ) : (
                  <span className="size-4 shrink-0" />
                )}
                <span className="min-w-0 flex-1 truncate">{labelFor(p)}</span>
                {flag && (
                  <span className="shrink-0 rounded-full bg-gold/15 px-1.5 py-0.5 text-[10px] font-semibold text-gold">
                    {t.studio.providers.flagshipTag}
                  </span>
                )}
                {sponsor && (
                  <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {t.studio.providers.sponsorTag}
                  </span>
                )}
                {on && <Check className="size-4 shrink-0 text-gold" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
