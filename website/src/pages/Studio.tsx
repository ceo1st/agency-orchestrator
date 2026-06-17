import { BarChart3, Boxes, Download, History, KeyRound, Plug, TriangleAlert, Users, Wand2 } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { ProviderSelect } from "@/components/studio/ProviderSelect";
import { ProvidersPanel } from "@/components/studio/ProvidersPanel";
import { PromptLab } from "@/components/studio/PromptLab";
import { RolesPicker } from "@/components/studio/RolesPicker";
import { RunDock } from "@/components/studio/RunDock";
import { RunProvider, useRunManager } from "@/components/studio/RunManager";
import { RunViewer } from "@/components/studio/RunViewer";
import { RunsPanel } from "@/components/studio/RunsPanel";
import { StudioDemo } from "@/components/studio/StudioDemo";
import { StudioSponsorSlot } from "@/components/studio/StudioSponsorSlot";
import { InstallPrompt } from "@/components/studio/InstallPrompt";
import { WorkflowsPanel } from "@/components/studio/WorkflowsPanel";
import { useBackend } from "@/components/studio/useBackend";
import { useLanguage } from "@/i18n/LanguageProvider";
import { api, DEFAULT_PROVIDER, getActiveProvider, setActiveProvider } from "@/lib/studio";
import { cn } from "@/lib/utils";

// recharts(~390kB)只在用量 tab 用 → 懒加载，避免拖累 Studio 首屏与演示模式
const UsagePanel = lazy(() => import("@/components/studio/UsagePanel").then((m) => ({ default: m.UsagePanel })));

// 需要 API key 的 provider。apinebula 是当前默认 provider，必须在列——否则新用户没填 key 时
// 不会弹「需要配置 key」提示，直接运行才报认证错（commit 61e84a6 改默认后遗漏）。
const KEYED = ["apinebula", "deepseek", "compshare", "openai", "claude"];

type Tab = "roles" | "workflows" | "prompt" | "runs" | "usage" | "providers";

const TAB_META: { id: Tab; icon: typeof Users }[] = [
  { id: "roles", icon: Users },
  { id: "workflows", icon: Boxes },
  { id: "prompt", icon: Wand2 },
  { id: "runs", icon: History },
  { id: "usage", icon: BarChart3 },
  { id: "providers", icon: Plug },
];

function StudioInner() {
  const { t } = useLanguage();
  const { status, version } = useBackend();
  const TABS = TAB_META.map((tb) => ({
    ...tb,
    label: t.studio.shell.tabs[tb.id].label,
    hint: t.studio.shell.tabs[tb.id].hint,
  }));
  const { start, open } = useRunManager();
  const [tab, setTabState] = useState<Tab>("roles");
  const [provider, setProviderState] = useState(getActiveProvider);
  const [keyedHas, setKeyedHas] = useState<Record<string, boolean>>({});
  const [installOpen, setInstallOpen] = useState(false);
  const offline = status !== "online";

  const setProvider = useCallback((p: string) => {
    setActiveProvider(p);
    setProviderState(p);
  }, []);

  const refreshConfig = useCallback(() => {
    api
      .config()
      .then((c) => setKeyedHas(Object.fromEntries(Object.entries(c.providers).map(([k, v]) => [k, !!v.hasKey]))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (status === "online") refreshConfig();
  }, [status, refreshConfig]);

  // Refresh key status whenever leaving the providers tab (so the warning clears).
  const setTab = useCallback(
    (t: Tab) => {
      setTabState((prev) => {
        if (prev === "providers" && t !== "providers") refreshConfig();
        return t;
      });
    },
    [refreshConfig],
  );

  const effProvider = provider || DEFAULT_PROVIDER;
  const needKeyWarning = status === "online" && KEYED.includes(effProvider) && keyedHas[effProvider] === false;

  return (
    <>
      <main className="pt-20">
        <div className="sticky top-16 z-30 border-b border-border/60 bg-background/85 backdrop-blur-xl">
          <div className="container-page flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
            <span className="flex items-center gap-2 font-bold">
              <span className="grid size-7 place-items-center rounded-lg bg-primary text-sm text-primary-foreground">ao</span>
              Studio
            </span>

            {status !== "checking" && (
              <nav className="flex flex-1 gap-1 overflow-x-auto rounded-xl bg-muted/50 p-1">
                {TABS.map((tb) => {
                  const Icon = tb.icon;
                  const on = tab === tb.id;
                  return (
                    <button
                      key={tb.id}
                      onClick={() => setTab(tb.id)}
                      title={tb.hint}
                      className={cn(
                        "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                        on ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Icon className="size-4" />
                      {tb.label}
                    </button>
                  );
                })}
              </nav>
            )}

            <div className="ml-auto flex items-center gap-2">
              <span
                title={status === "online" ? `${t.studio.shell.engineOnline} v${version ?? ""}` : status === "offline" ? t.studio.shell.engineOffline : t.studio.shell.engineChecking}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                  status === "online" && "bg-emerald-500/15 text-emerald-500",
                  status === "offline" && "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                  status === "checking" && "bg-muted text-muted-foreground",
                )}
              >
                <span className={cn("size-1.5 rounded-full", status === "online" ? "bg-emerald-500" : status === "offline" ? "bg-amber-500" : "bg-muted-foreground")} />
                {status === "online" ? t.studio.shell.statusOnline : status === "offline" ? t.studio.shell.statusOffline : t.studio.shell.statusChecking}
              </span>
              <ProviderSelect value={provider} onChange={setProvider} />
              <Button size="sm" variant="outline" onClick={() => setTab("providers")}>
                <KeyRound className="size-4" />
                <span className="hidden sm:inline">{t.studio.shell.keys}</span>
              </Button>
            </div>
          </div>
        </div>

        <div className="container-page py-8">
          {needKeyWarning && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/[0.08] px-4 py-3">
              <span className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                <TriangleAlert className="size-4 shrink-0" />
                {`${t.studio.shell.noKeyWarningPrefix}「${effProvider}」${t.studio.shell.noKeyWarningSuffix}`}
              </span>
              <Button size="sm" variant="outline" onClick={() => setTab("providers")}>
                <KeyRound className="size-4" />
                {t.studio.shell.setUpNow}
              </Button>
            </div>
          )}
          {tab === "providers" ? (
            // 供应商/API 面板在线、离线都能进、能填（演示站没有引擎也照样展示卡片，只是无法实际运行）
            <ProvidersPanel active={provider} onSetActive={(p) => setProvider(p)} />
          ) : offline ? (
            <>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/[0.07] px-4 py-3">
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">{t.studio.demo.bannerTitle}</span>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t.studio.demo.bannerDesc}</p>
                </div>
                <Button size="sm" onClick={() => setInstallOpen(true)}>
                  <Download className="size-4" />
                  {t.studio.demo.bannerInstall}
                </Button>
              </div>
              <RolesPicker provider={provider} onRun={() => setInstallOpen(true)} demo onInstallPrompt={() => setInstallOpen(true)} />
              <StudioDemo />
            </>
          ) : tab === "roles" ? (
            <RolesPicker provider={provider} onRun={start} onGoToWorkflows={() => setTab("workflows")} />
          ) : tab === "workflows" ? (
            <WorkflowsPanel provider={provider} onRun={start} />
          ) : tab === "prompt" ? (
            <PromptLab provider={provider} />
          ) : tab === "runs" ? (
            <RunsPanel provider={provider} onRun={start} />
          ) : tab === "usage" ? (
            <Suspense fallback={<div className="py-20 text-center text-sm text-muted-foreground">…</div>}>
              <UsagePanel />
            </Suspense>
          ) : (
            <ProvidersPanel active={provider} onSetActive={(p) => setProvider(p)} />
          )}
        </div>
      </main>

      <RunViewer
        onViewHistory={() => {
          open(null);
          setTab("runs");
        }}
      />
      <RunDock />
      {installOpen && <InstallPrompt onClose={() => setInstallOpen(false)} />}
      <StudioSponsorSlot />
      <SiteFooter />
    </>
  );
}

export default function Studio() {
  return (
    <RunProvider>
      <StudioInner />
    </RunProvider>
  );
}
