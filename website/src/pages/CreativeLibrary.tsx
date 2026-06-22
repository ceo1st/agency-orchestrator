// 创意提示词库：图像生成（Nano Banana / Gemini）提示词,独立于专家库,方便直接取用。
// 内容来自 CC BY 4.0 开源库,UI 标注出处与作者署名（见底部 + 每张卡片）。
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Copy, ExternalLink, Search } from "lucide-react";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { useLanguage } from "@/i18n/LanguageProvider";
import { cn } from "@/lib/utils";
import dataset from "@/content/creative-prompts.json";

interface CreativePrompt {
  id: string;
  title: string;
  description: string;
  prompt: string;
  category: string;
  author: string;
  authorUrl: string;
  image: string;
  source: string;
}
interface Source { name: string; url: string; license: string; licenseUrl: string }
const DATA = dataset as {
  model: string; count: number; sources: Source[]; prompts: CreativePrompt[];
};

function PromptCard({ p }: { p: CreativePrompt }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(p.prompt); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* noop */ }
  };
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/60">
      {p.image && (
        <img
          src={p.image}
          alt={p.title}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          className="aspect-[4/3] w-full bg-muted/40 object-cover"
        />
      )}
      <div className="flex flex-1 flex-col p-4">
      <div className="mb-1 flex items-center gap-2">
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">{p.category}</span>
        <span className="text-[10px] text-muted-foreground/60">{p.source}</span>
      </div>
      <h3 className="font-semibold leading-snug">{p.title}</h3>
      {p.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>}
      <pre className="mt-3 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-2.5 text-[11px] leading-relaxed text-foreground/90">{p.prompt}</pre>
      <div className="mt-3 flex items-center justify-between gap-2">
        {p.author ? (
          <a href={p.authorUrl || undefined} target="_blank" rel="noreferrer" className="truncate text-[11px] text-muted-foreground hover:text-foreground">
            @{p.author}
          </a>
        ) : <span />}
        <button
          onClick={copy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border/70 px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-primary/50 hover:text-primary"
        >
          {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
          {copied ? "已复制" : "复制提示词"}
        </button>
      </div>
      </div>
    </div>
  );
}

export default function CreativeLibrary() {
  const { lang } = useLanguage();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");

  const categories = useMemo(() => {
    const set = new Map<string, number>();
    for (const p of DATA.prompts) set.set(p.category, (set.get(p.category) ?? 0) + 1);
    return [...set.entries()].sort((a, b) => b[1] - a[1]);
  }, []);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return DATA.prompts.filter(
      (p) => (cat === "all" || p.category === cat) && (!n || (p.title + p.description + p.prompt).toLowerCase().includes(n)),
    );
  }, [q, cat]);

  // 分页：每页 24 条（带图卡片多了渲染重）。筛选/搜索/分类变化时回到第 1 页。
  const PAGE_SIZE = 24;
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [q, cat]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <>
      <main className="pt-24">
        <div className="container-page pb-20">
          {/* 头部 */}
          <h1 className="text-2xl font-bold">{lang === "en" ? "Creative Library" : "创意库"}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {lang === "en"
              ? `${DATA.count} ready-to-use image generation prompts (${DATA.model}). Copy and paste into your image tool.`
              : `${DATA.count} 条可直接取用的图像生成提示词（${DATA.model}）。复制后粘进你的图像工具即可。`}
          </p>

          {/* 视频提示词 → 跳转配套站 prompts.aiolaola.com */}
          <a
            href="https://prompts.aiolaola.com/"
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/[0.06] px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary/60"
          >
            🎬 {lang === "en" ? "Looking for video prompts? Browse prompts.aiolaola.com" : "找视频提示词？去 prompts.aiolaola.com 浏览"}
            <ExternalLink className="size-3.5 text-muted-foreground" />
          </a>

          {/* 搜索 + 分类 */}
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={lang === "en" ? "Search prompts…" : "搜索提示词…"}
                className="h-10 w-full rounded-xl border border-border/70 bg-card/60 pl-9 pr-3 text-sm outline-none focus:border-primary/50"
              />
            </div>
            <span className="text-sm text-muted-foreground">{filtered.length} {lang === "en" ? "prompts" : "条"}</span>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              onClick={() => setCat("all")}
              className={cn("rounded-full px-3 py-1.5 text-xs font-medium transition-colors", cat === "all" ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:text-foreground")}
            >
              {lang === "en" ? "All" : "全部"}
            </button>
            {categories.map(([c, n]) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={cn("rounded-full px-3 py-1.5 text-xs font-medium transition-colors", cat === c ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:text-foreground")}
              >
                {c} <span className="opacity-60">{n}</span>
              </button>
            ))}
          </div>

          {/* 卡片 */}
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pageItems.map((p) => <PromptCard key={p.id} p={p} />)}
          </div>
          {filtered.length === 0 && <p className="mt-10 text-center text-sm text-muted-foreground">{lang === "en" ? "No matching prompts" : "没有匹配的提示词"}</p>}

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-3 text-sm">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="inline-flex items-center gap-1 rounded-lg border border-border/70 px-3 py-1.5 transition-colors hover:border-primary/50 disabled:opacity-40"
              >
                <ChevronLeft className="size-4" /> {lang === "en" ? "Prev" : "上一页"}
              </button>
              <span className="text-muted-foreground">{safePage} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="inline-flex items-center gap-1 rounded-lg border border-border/70 px-3 py-1.5 transition-colors hover:border-primary/50 disabled:opacity-40"
              >
                {lang === "en" ? "Next" : "下一页"} <ChevronRight className="size-4" />
              </button>
            </div>
          )}

          {/* 出处署名（CC BY 4.0 要求） */}
          <div className="mt-10 rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
            {lang === "en" ? "Prompts & previews from " : "提示词与预览图来自 "}
            {DATA.sources.map((s, i) => (
              <span key={s.url}>
                {i > 0 && "、"}
                <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-foreground hover:text-primary">
                  {s.name} <ExternalLink className="size-3" />
                </a>
              </span>
            ))}
            {" · "}
            <a href={DATA.sources[0].licenseUrl} target="_blank" rel="noreferrer" className="hover:text-foreground">CC BY 4.0</a>
            {lang === "en" ? "。Credit to the original authors." : "，版权归原作者,已按 CC BY 4.0 署名。"}
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
