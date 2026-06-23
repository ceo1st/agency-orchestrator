import { Check, GitCompare, Loader2, Play, Scale, Search, Star, Workflow as WorkflowIcon, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "@/i18n/LanguageProvider";
import { Button } from "@/components/ui/button";
import { api, getFavWorkflows, setFavWorkflows, type Workflow } from "@/lib/studio";
import { track } from "@/lib/track";
import { cn } from "@/lib/utils";
import { RoleAvatar } from "./RoleAvatar";
import type { RunRequest } from "./RunManager";
import { CompareOverlay } from "./CompareOverlay";
import { BaselineCompareOverlay } from "./BaselineCompareOverlay";
import { WorkflowCanvas } from "./WorkflowCanvas";

function CastStack({ steps }: { steps: NonNullable<Workflow["steps"]> }) {
  const shown = steps.slice(0, 6);
  const extra = steps.length - shown.length;
  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {shown.map((s, i) => (
          <RoleAvatar
            key={s.id}
            seed={s.role || s.id}
            name={s.name ?? s.id}
            title={s.name ?? s.id}
            className="size-8 ring-2 ring-card"
            style={{ zIndex: shown.length - i }}
          />
        ))}
      </div>
      {extra > 0 && <span className="ml-2 text-xs text-muted-foreground">+{extra}</span>}
    </div>
  );
}

function InputsDialog({ wf, provider, onClose, onRun, onCompare }: { wf: Workflow; provider: string; onClose: () => void; onRun: (r: RunRequest) => void; onCompare: (inputs: Record<string, string>) => void }) {
  const { t, lang } = useLanguage();
  const inputs = wf.inputs ?? [];
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    inputs.forEach((i) => (init[i.name] = i.default ?? ""));
    return init;
  });
  const [materialize, setMaterialize] = useState(false);

  const submit = () => {
    onRun({ kind: "workflow", title: wf.name, file: wf.file, inputs: vals, provider: provider || undefined, cast: wf.steps, materialize });
    onClose();
  };
  const compare = () => {
    onCompare(vals);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[55] grid place-items-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-border/70 bg-background p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{wf.name}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
        {wf.description && <p className="mt-1 text-sm text-muted-foreground">{wf.description}</p>}
        <div className="mt-4 space-y-3">
          {inputs.map((inp) => (
            <label key={inp.name} className="block">
              <span className="text-sm font-medium">
                {inp.name}
                {inp.required && <span className="text-red-500"> *</span>}
              </span>
              {inp.description && <span className="block text-xs text-muted-foreground">{inp.description}</span>}
              <textarea
                value={vals[inp.name] ?? ""}
                onChange={(e) => setVals((p) => ({ ...p, [inp.name]: e.target.value }))}
                rows={2}
                className="mt-1 w-full rounded-xl border border-border/70 bg-card/60 px-3 py-2 text-sm outline-none focus:border-primary/50"
              />
            </label>
          ))}
          {!inputs.length && <p className="text-sm text-muted-foreground">{t.studio.workflows.noInputsNeeded}</p>}
        </div>
        <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-xl border border-border/70 bg-card/40 p-3">
          <input type="checkbox" checked={materialize} onChange={(e) => setMaterialize(e.target.checked)} className="mt-0.5" />
          <span className="text-sm">
            <span className="font-medium">{lang === "en" ? "Develop project (write code to files)" : "开发项目（把生成的代码写成真实文件）"}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {lang === "en"
                ? "If the workflow produces code, save it as a runnable scaffold on disk. The run log shows where."
                : "若工作流会产出代码，跑完落盘成可运行脚手架到本地；运行日志里显示路径。"}
            </span>
          </span>
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t.studio.workflows.cancel}
          </Button>
          <Button variant="outline" onClick={compare} title={lang === "en" ? "Run the workflow and a single-shot baseline, then blind-judge both" : "跑工作流 + 单次基线并盲评对比"}>
            <Scale className="size-4" />
            {lang === "en" ? "vs Single-shot" : "对比单次"}
          </Button>
          <Button onClick={submit}>
            <Play className="size-4" />
            {t.studio.workflows.run}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function WorkflowsPanel({ provider, onRun, demo, onInstallPrompt }: { provider: string; onRun: (r: RunRequest) => void; demo?: boolean; onInstallPrompt?: () => void }) {
  const { t, lang } = useLanguage();
  const [wfs, setWfs] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Record<string, Workflow>>({});
  const [inputsFor, setInputsFor] = useState<Workflow | null>(null);
  const [compare, setCompare] = useState<Workflow[] | null>(null);
  const [baseline, setBaseline] = useState<{ wf: Workflow; inputs: Record<string, string> } | null>(null);
  const [canvasFor, setCanvasFor] = useState<Workflow | null>(null);
  // 用户自选「常用」：点星收藏（localStorage）。首次无记录时用编辑推荐(featured)做种子。
  const [favs, setFavs] = useState<Set<string>>(() => getFavWorkflows() ?? new Set());
  const seededRef = useRef(false);
  const toggleFav = (w: Workflow) =>
    setFavs((prev) => {
      const n = new Set(prev);
      if (n.has(w.file)) n.delete(w.file); else n.add(w.file);
      setFavWorkflows(n);
      return n;
    });

  useEffect(() => {
    setLoading(true);
    if (demo) {
      // 演示模式：用内置模板的静态快照，可浏览、看步骤，但运行时引导安装
      import("@/lib/demo")
        .then((m) => m.demoWorkflows(lang))
        .then(setWfs)
        .catch(() => setWfs([]))
        .finally(() => setLoading(false));
      return;
    }
    api
      .workflows(lang)
      .then(setWfs)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [lang, demo]);

  // 首次（localStorage 无收藏记录）用编辑推荐做种子，让新用户也有「常用」默认值。
  useEffect(() => {
    if (seededRef.current || wfs.length === 0) return;
    seededRef.current = true;
    if (getFavWorkflows() === null) {
      const seed = new Set(wfs.filter((w) => w.featured).map((w) => w.file));
      if (seed.size > 0) { setFavWorkflows(seed); setFavs(seed); }
    }
  }, [wfs]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return wfs.filter((w) => !n || (w.name + (w.description ?? "")).toLowerCase().includes(n));
  }, [wfs, q]);

  // 分组：⭐ 推荐置顶，其余按类目（开发 → 内容 → 商业 → 职场 → 我的 → 其他）。治"太多、不知道用哪个"。
  const CATEGORY_ORDER = ["开发", "内容创作", "商业 / 产品", "职场 / 学术", "我的工作流", "其他"];
  const groups = useMemo(() => {
    const fav = filtered.filter((w) => favs.has(w.file));
    const byCat = new Map<string, Workflow[]>();
    for (const w of filtered) {
      // 收藏的也仍按类目展示一份，方便浏览；顶部「常用」组只是把它们额外置顶。
      const c = w.category || "其他";
      if (!byCat.has(c)) byCat.set(c, []);
      byCat.get(c)!.push(w);
    }
    const cats = [...byCat.keys()].sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a), ib = CATEGORY_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    return { fav, cats: cats.map((c) => [c, byCat.get(c)!] as [string, Workflow[]]) };
  }, [filtered, favs]);

  const pickedList = Object.values(picked);

  const togglePick = (w: Workflow) =>
    setPicked((p) => {
      const n = { ...p };
      if (n[w.file]) delete n[w.file];
      else n[w.file] = w;
      return n;
    });

  const runOne = (w: Workflow) => {
    if (demo) return onInstallPrompt?.();
    track("workflow_run", { file: w.filename });
    if (w.inputs && w.inputs.length) setInputsFor(w);
    else onRun({ kind: "workflow", title: w.name, file: w.file, provider: provider || undefined, cast: w.steps });
  };

  // 对比单次基线：需引擎，demo 引导安装；有输入先填，再开对比视图
  const compareOne = (w: Workflow) => {
    if (demo) return onInstallPrompt?.();
    track("compare_open", { from: "card" });
    if (w.inputs && w.inputs.length) setInputsFor(w); // 复用输入对话框（含「对比单次」按钮）
    else setBaseline({ wf: w, inputs: {} });
  };

  if (loading)
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> {t.studio.workflows.loading}
      </div>
    );
  if (err) return <p className="py-20 text-center text-sm text-red-500">{`${t.studio.workflows.loadFailed}${err}`}</p>;

  return (
    <div className="pb-28">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.studio.workflows.searchPlaceholder}
          className="h-10 w-full rounded-xl border border-border/70 bg-card/60 pl-9 pr-3 text-sm outline-none focus:border-primary/50"
        />
      </div>

      {(() => {
        const renderCard = (w: Workflow) => {
          const on = !!picked[w.file];
          return (
            <div
              key={w.file}
              className={cn(
                "flex flex-col rounded-2xl border bg-card/60 p-4 transition-colors",
                on ? "border-primary ring-1 ring-primary/40" : "border-border/70",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="flex items-center gap-1.5 font-semibold leading-snug">
                  <button
                    onClick={() => toggleFav(w)}
                    title={favs.has(w.file) ? "取消收藏" : "收藏为常用"}
                    className="shrink-0 text-muted-foreground/50 transition-colors hover:text-amber-400"
                  >
                    <Star className={cn("size-3.5", favs.has(w.file) && "fill-amber-400 text-amber-400")} />
                  </button>
                  {w.name}
                </h3>
                <button
                  onClick={() => togglePick(w)}
                  title={t.studio.workflows.checkToCompare}
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-md border transition-colors",
                    on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
                  )}
                >
                  {on && <Check className="size-3.5" />}
                </button>
              </div>
              {w.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{w.description}</p>}
              {!!(w.steps && w.steps.length) && (
                <div className="mt-3">
                  <CastStack steps={w.steps} />
                </div>
              )}
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {`${w.steps?.length ?? 0} ${t.studio.workflows.steps}`}
                  {w.private ? ` · ${t.studio.workflows.mine}` : ""}
                </span>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => (demo ? onInstallPrompt?.() : setCanvasFor(w))} title={lang === "en" ? "View as canvas" : "画布视图（可视化工作流图）"}>
                    <WorkflowIcon className="size-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => compareOne(w)} title={lang === "en" ? "Compare vs single-shot" : "对比单次基线（看多智能体到底强在哪）"}>
                    <Scale className="size-3.5" />
                  </Button>
                  <Button size="sm" onClick={() => runOne(w)}>
                    <Play className="size-3.5" />
                    {t.studio.workflows.run}
                  </Button>
                </div>
              </div>
            </div>
          );
        };
        const Section = ({ title, items, star }: { title: string; items: Workflow[]; star?: boolean }) => (
          <section className="mt-6">
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-muted-foreground">
              {star && <Star className="size-3.5 fill-amber-400 text-amber-400" />}
              {title}
              <span className="font-normal text-muted-foreground/60">· {items.length}</span>
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{items.map(renderCard)}</div>
          </section>
        );
        return (
          <>
            {groups.fav.length > 0 && <Section title={lang === "en" ? "Favorites" : "常用（点 ☆ 收藏）"} items={groups.fav} star />}
            {groups.cats.map(([c, items]) => <Section key={c} title={c} items={items} />)}
            {filtered.length === 0 && <p className="mt-10 text-center text-sm text-muted-foreground">{lang === "en" ? "No matching workflows" : "没有匹配的工作流"}</p>}
          </>
        );
      })()}

      {pickedList.length >= 2 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur-xl">
          <div className="container-page flex items-center justify-between gap-3 py-4">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-sm font-semibold text-primary">
              <GitCompare className="size-4" />
              {`${t.studio.workflows.checkedPrefix}${pickedList.length}${t.studio.workflows.checkedSuffix}`}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPicked({})} className="text-xs text-muted-foreground hover:text-foreground">
                {t.studio.workflows.clear}
              </button>
              <Button onClick={() => (demo ? onInstallPrompt?.() : setCompare(pickedList))}>
                <GitCompare className="size-4" />
                {t.studio.workflows.compareRun}
              </Button>
            </div>
          </div>
        </div>
      )}

      {inputsFor && (
        <InputsDialog
          wf={inputsFor}
          provider={provider}
          onClose={() => setInputsFor(null)}
          onRun={onRun}
          onCompare={(inputs) => setBaseline({ wf: inputsFor, inputs })}
        />
      )}
      {compare && <CompareOverlay workflows={compare} provider={provider} onClose={() => setCompare(null)} />}
      {baseline && <BaselineCompareOverlay wf={baseline.wf} inputs={baseline.inputs} provider={provider} onClose={() => setBaseline(null)} />}
      {canvasFor && (
        <WorkflowCanvas
          file={canvasFor.file}
          name={canvasFor.name}
          onClose={() => setCanvasFor(null)}
          onSaved={() => { if (!demo) api.workflows(lang).then(setWfs).catch(() => {}); }}
        />
      )}
    </div>
  );
}
