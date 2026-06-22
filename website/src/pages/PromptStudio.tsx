import { useState } from "react";
import { Sparkles } from "lucide-react";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { InstallPrompt } from "@/components/studio/InstallPrompt";
import { PromptLab } from "@/components/studio/PromptLab";
import { useBackend } from "@/components/studio/useBackend";
import { useLanguage } from "@/i18n/LanguageProvider";
import { useSeo } from "@/lib/useSeo";
import { getActiveProvider } from "@/lib/studio";

/**
 * 独立「提示词优化」页（顶部导航入口，挨着专家库）。
 * 公开站(无后端→demo)也能优化/测试——走 Cloudflare Pages Function 代理的免费额度；
 * 保存/版本/多结果评分等需本地引擎,演示时引导安装。本地 ao web 则全功能。
 */
export default function PromptStudio() {
  const { t, lang } = useLanguage();
  useSeo(
    lang === "en" ? "Prompt Studio — AI rewrites your prompt to be more effective | Agency Orchestrator"
      : "提示词优化 — AI 帮你把提示词改得更有效 | Agency Orchestrator",
    lang === "en" ? "Optimize, test and compare prompts with AI. System & user prompt meta-optimization, free to try."
      : "用 AI 优化、测试、对比提示词。系统/用户提示词元优化,免费试用。",
  );
  const { status } = useBackend();
  const [installOpen, setInstallOpen] = useState(false);
  const offline = status !== "online";
  const provider = getActiveProvider();

  return (
    <>
      <main className="pt-20">
        <div className="container-page py-8">
          <header className="mb-6">
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <Sparkles className="size-6 text-primary" />
              {t.nav.prompt}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {lang === "en"
                ? "Optimize, test and compare prompts — turn gut-feel into reusable assets. Free to try here; install for the full flow."
                : "把靠感觉的提示词，变成可优化 · 可测试 · 可对比的资产。这里可免费试用；完整流程本地安装后使用。"}
            </p>
          </header>
          <PromptLab provider={provider} demo={offline} onInstallPrompt={() => setInstallOpen(true)} hideHeader />
        </div>
      </main>
      {installOpen && <InstallPrompt onClose={() => setInstallOpen(false)} />}
      <SiteFooter />
    </>
  );
}
