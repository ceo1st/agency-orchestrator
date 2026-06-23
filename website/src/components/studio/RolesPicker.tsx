import { Bookmark, Check, Loader2, MessageSquare, Search, Sparkles, Trash2, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/i18n/LanguageProvider";
import { api, type ComposeResult, type Role, type Team, type Workflow } from "@/lib/studio";
import { track } from "@/lib/track";
import { demoRoles } from "@/lib/demo";
import { cn } from "@/lib/utils";
import { ComposePreview } from "./ComposePreview";
import { RoleAvatar } from "./RoleAvatar";
import { RoleDetail } from "./RoleDetail";
import type { RunRequest } from "./RunManager";

function roleKey(r: Role) {
  return `${r.category}/${r.id}`;
}

export function RolesPicker({
  provider,
  onRun,
  onGoToWorkflows,
  demo,
  onInstallPrompt,
}: {
  provider: string;
  onRun: (r: RunRequest) => void;
  onGoToWorkflows?: () => void;
  demo?: boolean;
  onInstallPrompt?: () => void;
}) {
  const { t, lang } = useLanguage();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [selected, setSelected] = useState<Record<string, Role>>({});

  // compose tray state
  const [task, setTask] = useState("");
  const [teamName, setTeamName] = useState("");
  const [composing, setComposing] = useState(false);
  const [composeErr, setComposeErr] = useState<string | null>(null);
  const [detail, setDetail] = useState<Role | null>(null);
  const [preview, setPreview] = useState<{ result: ComposeResult; meta: Workflow | null; loading: boolean } | null>(null);

  // teams / loadouts
  const [teams, setTeams] = useState<Team[]>([]);
  const [savingTeam, setSavingTeam] = useState(false);
  const [teamMsg, setTeamMsg] = useState<string | null>(null);

  const refreshTeams = () => {
    if (demo) return;
    api.teams().then(setTeams).catch(() => setTeams([]));
  };
  useEffect(refreshTeams, [demo]);

  useEffect(() => {
    if (demo) {
      setLoading(true);
      demoRoles(lang)
        .then((r) => setRoles(r))
        .catch(() => setRoles([]))
        .finally(() => setLoading(false));
      return;
    }
    setLoading(true);
    api
      .roles(lang)
      .then((r) => setRoles(r))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [lang, demo]);

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    roles.forEach((r) => map.set(r.category, r.categoryName || r.category));
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [roles]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return roles.filter((r) => {
      if (cat !== "all" && r.category !== cat) return false;
      if (!needle) return true;
      return (r.name + r.description + r.categoryName).toLowerCase().includes(needle);
    });
  }, [roles, q, cat]);

  const selectedList = Object.values(selected);
  const count = selectedList.length;

  const toggle = (r: Role) => {
    setComposeErr(null);
    setSelected((prev) => {
      const key = roleKey(r);
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = r;
      return next;
    });
  };

  const clearSel = () => setSelected({});

  const roleByPath = useMemo(() => {
    const m: Record<string, Role> = {};
    roles.forEach((r) => { m[roleKey(r)] = r; });
    return m;
  }, [roles]);

  // 点一个已存团队：把它的角色整队载入选择区（缺失的角色——如换了语言库——跳过）
  const loadTeam = (team: Team) => {
    setComposeErr(null);
    const next: Record<string, Role> = {};
    let missing = 0;
    for (const tr of team.roles) {
      const r = roleByPath[tr.role];
      if (r) next[roleKey(r)] = r;
      else missing++;
    }
    setSelected(next);
    setTeamName(team.name);
    setTeamMsg(missing > 0 ? `${missing} ${t.studio.roles.teamLoadedMissing}` : null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // 存当前阵容为团队，返回 null = 成功，否则返回错误文案。供 tray 与 ComposePreview 复用。
  const saveTeamNamed = async (name: string): Promise<string | null> => {
    if (count < 2) return t.studio.roles.teamSaveNeedName;
    if (!name.trim()) return t.studio.roles.teamSaveNeedName;
    try {
      await api.saveTeam({
        name: name.trim(),
        roles: selectedList.map((r) => ({ role: roleKey(r), name: r.name })),
        provider: provider || undefined,
        lang,
      });
      refreshTeams();
      return null;
    } catch (e: any) {
      return e?.message || t.studio.roles.teamSaveFailed;
    }
  };

  const saveAsTeam = async () => {
    setSavingTeam(true);
    setTeamMsg(null);
    const err = await saveTeamNamed(teamName);
    setTeamMsg(err ?? `✅ ${t.studio.roles.teamSaved}`);
    setSavingTeam(false);
  };

  const deleteTeam = async (team: Team, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.deleteTeam(team.slug);
      refreshTeams();
    } catch {
      /* ignore */
    }
  };

  const doSingleChat = () => {
    const r = selectedList[0];
    if (!r || !task.trim()) return;
    if (demo) {
      onInstallPrompt?.();
      return;
    }
    onRun({ kind: "role", title: `${t.studio.roles.singleChat} · ${r.name}`, role: roleKey(r), emoji: undefined, name: r.name, task: task.trim(), provider, lang });
  };

  // auto=true：不锁定阵容，传空 roles 让后端 LLM 自动组队（对应 CLI `ao compose "一句话"`）。
  // auto=false：手动锁定已勾选的 ≥2 个角色。
  const doComposeRun = async (auto = false) => {
    if (!task.trim()) return;
    if (!auto && count < 2) return;
    if (demo) {
      onInstallPrompt?.();
      return;
    }
    setComposing(true);
    setComposeErr(null);
    const mode = auto ? "auto" : "manual";
    track("compose_start", { mode, role_count: auto ? 0 : count });
    try {
      const res = await api.compose({
        description: task.trim(),
        roles: auto ? [] : selectedList.map(roleKey),
        name: auto ? undefined : teamName.trim() || undefined,
        provider: provider || undefined,
        lang,
      });
      track("compose_success", { mode });
      // Preview the composed team before running (not a black box).
      setPreview({ result: res, meta: null, loading: true });
      try {
        const wfs = await api.workflows();
        const meta = wfs.find((w) => w.file === res.file) ?? null;
        setPreview({ result: res, meta, loading: false });
      } catch {
        setPreview({ result: res, meta: null, loading: false });
      }
    } catch (e: any) {
      track("compose_error", { mode });
      setComposeErr(e?.message || t.studio.roles.composeFailed);
    } finally {
      setComposing(false);
    }
  };

  if (loading)
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> {t.studio.roles.loading}
      </div>
    );
  if (err) return <p className="py-20 text-center text-sm text-red-500">{t.studio.roles.loadFailed}{err}</p>;

  return (
    <div className="pb-40">
      {/* AI 自动组队 —— 核心入口：不用手选角色，一句话让 LLM 从全量专家里自动挑人组队并运行 */}
      <div className="mb-5 rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
        <div className="mb-1 flex items-center gap-2">
          <Sparkles className="size-5 text-primary" />
          <h3 className="text-base font-semibold">{t.studio.roles.autoTitle}</h3>
        </div>
        <p className="mb-3 text-sm text-muted-foreground">{t.studio.roles.autoHint}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={task}
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) doComposeRun(true);
            }}
            placeholder={t.studio.roles.autoTaskPlaceholder}
            className="h-11 flex-1 rounded-xl border border-border/70 bg-card/80 px-3.5 text-sm outline-none focus:border-primary/50"
          />
          <Button onClick={() => doComposeRun(true)} disabled={composing || !task.trim()} size="lg" className="shrink-0">
            {composing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {t.studio.roles.autoComposeBtn}
          </Button>
        </div>
        {composeErr && count === 0 && <p className="mt-2 text-xs text-red-500">{composeErr}</p>}
        <p className="mt-2.5 text-xs text-muted-foreground/80">{t.studio.roles.autoOrManual}</p>
      </div>

      {/* onboarding hint */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border/60 bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
        <span>💡 {t.studio.roles.hintLabel}</span>
        <span><b className="text-foreground">{t.studio.roles.hintPickOneBold}</b> {t.studio.roles.hintPickOneRest}</span>
        <span><b className="text-foreground">{t.studio.roles.hintPickManyBold}</b> {t.studio.roles.hintPickManyRest}</span>
        <span>{t.studio.roles.hintAvatarPre}<b className="text-foreground">{t.studio.roles.hintAvatarBold}</b>{t.studio.roles.hintAvatarPost}</span>
      </div>

      {/* my teams / loadouts — 一键载入整队，套新任务 */}
      {!demo && teams.length > 0 && (
        <div className="mb-4 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Bookmark className="size-3.5" />
            {t.studio.roles.myTeams}
            <span className="font-normal text-muted-foreground/70">· {t.studio.roles.myTeamsHint}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {teams.map((team) => (
              <button
                key={team.slug}
                onClick={() => loadTeam(team)}
                title={team.description || team.name}
                className="group flex items-center gap-2 rounded-full border border-border/70 bg-card/70 py-1 pl-3 pr-1.5 text-xs transition-colors hover:border-primary/50 hover:bg-card"
              >
                <span className="font-medium">{team.name}</span>
                <span className="text-muted-foreground/70">
                  {team.roles.slice(0, 6).map((r) => r.emoji || "•").join("")}
                  {" "}{team.roles.length}{t.studio.roles.teamMembersSuffix}
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  title={t.studio.roles.deleteTeam}
                  onClick={(e) => deleteTeam(team, e)}
                  className="grid size-5 place-items-center rounded-full text-muted-foreground/50 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                >
                  <Trash2 className="size-3" />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.studio.roles.searchPlaceholder}
            className="h-10 w-full rounded-xl border border-border/70 bg-card/60 pl-9 pr-3 text-sm outline-none focus:border-primary/50"
          />
        </div>
        <span className="text-sm text-muted-foreground">{filtered.length} {t.studio.roles.rolesCountSuffix}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <button
          onClick={() => setCat("all")}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            cat === "all" ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:text-foreground",
          )}
        >
          {t.studio.roles.categoryAll}
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setCat(c.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              cat === c.id ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:text-foreground",
            )}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* role grid */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((r) => {
          const key = roleKey(r);
          const on = !!selected[key];
          return (
            <button
              key={key}
              onClick={() => toggle(r)}
              className={cn(
                "group relative flex flex-col rounded-2xl border bg-card/60 p-4 text-left transition-all hover:-translate-y-0.5",
                on ? "border-primary ring-1 ring-primary/40" : "border-border/70 hover:border-primary/40",
              )}
            >
              <span
                className={cn(
                  "absolute right-3 top-3 grid size-5 place-items-center rounded-md border transition-colors",
                  on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
                )}
              >
                {on && <Check className="size-3.5" />}
              </span>
              <div className="flex items-center gap-3">
                <span
                  role="button"
                  tabIndex={0}
                  title={t.studio.roles.viewDetail}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDetail(r);
                  }}
                  className="rounded-full ring-offset-2 ring-offset-card transition-shadow hover:ring-2 hover:ring-primary/50"
                >
                  <RoleAvatar seed={key} name={r.name} color={r.color} className="size-12" />
                </span>
                <div className="min-w-0 pr-5">
                  <span className="block text-xs font-medium text-primary">{r.categoryName}</span>
                  <span className="block truncate font-semibold">{r.name}</span>
                </div>
              </div>
              <span className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{r.description}</span>
            </button>
          );
        })}
      </div>

      {/* selection tray */}
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur-xl">
          <div className="container-page py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-sm font-semibold text-primary">
                  {count >= 2 ? <Users className="size-4" /> : <MessageSquare className="size-4" />}
                  {t.studio.roles.selectedPrefix} {count}
                </span>
                <div className="hidden min-w-0 gap-1.5 overflow-x-auto sm:flex">
                  {selectedList.map((r) => (
                    <span
                      key={roleKey(r)}
                      className="flex shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-muted/50 py-1 pl-1 pr-2.5 text-xs"
                    >
                      <RoleAvatar seed={roleKey(r)} name={r.name} color={r.color} className="size-5" />
                      {r.name}
                    </span>
                  ))}
                </div>
              </div>
              <button onClick={clearSel} className="shrink-0 text-xs text-muted-foreground hover:text-foreground">
                <X className="mr-1 inline size-3.5" />
                {t.studio.roles.clear}
              </button>
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
              {count >= 2 && (
                <input
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder={t.studio.roles.teamNamePlaceholder}
                  className="h-10 rounded-xl border border-border/70 bg-card/60 px-3 text-sm outline-none focus:border-primary/50 sm:w-56"
                />
              )}
              <input
                value={task}
                onChange={(e) => setTask(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) (count >= 2 ? doComposeRun(false) : doSingleChat());
                }}
                placeholder={count >= 2 ? t.studio.roles.teamTaskPlaceholder : t.studio.roles.roleTaskPlaceholder}
                className="h-10 flex-1 rounded-xl border border-border/70 bg-card/60 px-3 text-sm outline-none focus:border-primary/50"
              />
              {count >= 2 ? (
                <>
                  <Button variant="outline" onClick={saveAsTeam} disabled={savingTeam} title={t.studio.roles.saveAsTeam}>
                    {savingTeam ? <Loader2 className="size-4 animate-spin" /> : <Bookmark className="size-4" />}
                    {t.studio.roles.saveAsTeam}
                  </Button>
                  <Button onClick={() => doComposeRun(false)} disabled={composing || !task.trim()}>
                    {composing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                    {t.studio.roles.composeAndRun}
                  </Button>
                </>
              ) : (
                <Button onClick={doSingleChat} disabled={!task.trim()}>
                  <MessageSquare className="size-4" />
                  {t.studio.roles.singleChat}
                </Button>
              )}
            </div>
            {teamMsg && <p className="mt-2 text-xs text-muted-foreground">{teamMsg}</p>}
            {composeErr && <p className="mt-2 text-xs text-red-500">{composeErr}</p>}
          </div>
        </div>
      )}

      {detail && <RoleDetail role={detail} provider={provider} onClose={() => setDetail(null)} onRun={onRun} demo={demo} onInstallPrompt={onInstallPrompt} />}
      {preview && (
        <ComposePreview
          result={preview.result}
          meta={preview.meta}
          loadingMeta={preview.loading}
          provider={provider}
          onRun={onRun}
          onSaveTeam={saveTeamNamed}
          defaultTeamName={teamName.trim() || preview.meta?.name}
          onClose={() => setPreview(null)}
          onGoToWorkflows={
            onGoToWorkflows
              ? () => {
                  setPreview(null);
                  onGoToWorkflows();
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
