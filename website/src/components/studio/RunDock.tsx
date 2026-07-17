import { CheckCircle2, CirclePause, Loader2, X, XCircle } from "lucide-react";
import { useRunManager } from "./RunManager";
import { useLanguage } from "@/i18n/LanguageProvider";
import { cn } from "@/lib/utils";

export function RunDock() {
  const { t } = useLanguage();
  const { runs, openId, open, remove } = useRunManager();
  // Show every run that isn't currently open in the viewer.
  const docked = runs.filter((r) => r.id !== openId);
  if (!docked.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-72 flex-col gap-2">
      {docked.map((r) => {
        const running = r.state === "running";
        // 暂停等输入的运行必须最醒目——用户最小化后极易错过弹框，运行会一直干等
        const awaiting = running && !!r.pendingInput;
        const done = r.steps.filter((s) => s.status === "done").length;
        return (
          <button
            key={r.id}
            onClick={() => open(r.id)}
            className={cn(
              "group flex items-center gap-2.5 rounded-xl border bg-card/95 px-3 py-2.5 text-left shadow-lg backdrop-blur transition-colors hover:border-primary/50",
              awaiting ? "border-amber-500/60 ring-1 ring-amber-500/30" : running ? "border-primary/40" : "border-border/70",
            )}
          >
            {awaiting ? (
              <CirclePause className="size-4 shrink-0 animate-pulse text-amber-500" />
            ) : running ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
            ) : r.state === "error" ? (
              <XCircle className="size-4 shrink-0 text-red-500" />
            ) : (
              <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{r.title}</span>
              <span className={cn("block truncate text-[11px]", awaiting ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
                {awaiting ? t.studio.run.awaitingInputDock : running ? (r.steps.length ? `${t.studio.run.running} · ${done}/${r.steps.length} ${t.studio.run.stepsUnit}` : t.studio.run.runningEllipsis) : r.state === "error" ? t.studio.run.error : t.studio.run.doneClickToView}
              </span>
            </span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                remove(r.id);
              }}
              className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
              title={t.studio.run.remove}
            >
              <X className="size-3.5" />
            </span>
          </button>
        );
      })}
    </div>
  );
}
