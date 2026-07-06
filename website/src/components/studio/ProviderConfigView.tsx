import { ArrowLeft, Check, Download, ExternalLink, Eye, EyeOff, Loader2, Plug, Plus, TriangleAlert, XCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/i18n/LanguageProvider";
import { api, CLI_RELAY_PRESETS, CUSTOM_PROVIDER_PRESETS, type ConfigResponse } from "@/lib/studio";
import { cn } from "@/lib/utils";

/**
 * 全屏"配置供应商"视图（CC Switch 风格的独立页）：主列表只留紧凑行,所有输入
 * （key/base_url/模型/测试连接/CLI 中转/添加自定义）都收进这里。
 * 四种形态共用一个视图,按 target.kind 渲染对应表单;字段按「基本信息/连接配置/模型」
 * 分区成卡片,底部固定操作栏。
 */
export type ConfigTarget =
  | { kind: "api"; id: string; name: string; hint?: string; defaultBaseUrl?: string; suggestions?: string[]; isCustom?: boolean; customMeta?: { note?: string; homepageUrl?: string } }
  // initialBaseUrl：从主列表的中转商行进来时预填该中转商的端点
  | { kind: "cli-relay"; id: string; name: string; globalWrite?: boolean; initialBaseUrl?: string }
  | { kind: "ollama" }
  | { kind: "add-custom" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card/40 p-4 sm:p-5">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function ProviderConfigView({
  target,
  status,
  onClose,
  onSaved,
}: {
  target: ConfigTarget;
  status?: ConfigResponse["providers"][string];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const p = t.studio.providers;
  const isAdd = target.kind === "add-custom";
  const isRelay = target.kind === "cli-relay";
  const isOllama = target.kind === "ollama";
  const isEditCustom = target.kind === "api" && !!target.isCustom;

  // 通用字段（中转商行进来时 initialBaseUrl 优先——用户点的就是"用这家"，即使之前存过别家）
  const [key, setKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(
    (isRelay && (target as { initialBaseUrl?: string }).initialBaseUrl) || status?.baseUrl || (isOllama ? "http://localhost:11434" : ""),
  );
  const [model, setModel] = useState(status?.model ?? "");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backups, setBackups] = useState<string[] | null>(null);

  // add-custom / edit-custom 共用的元数据字段（编辑内置供应商时这些是只读展示,不用 state）
  const [customId, setCustomId] = useState("");
  const [customName, setCustomName] = useState(isEditCustom ? (target as { name: string }).name : "");
  const [note, setNote] = useState(isEditCustom ? ((target as { customMeta?: { note?: string } }).customMeta?.note ?? "") : "");
  const [homepageUrl, setHomepageUrl] = useState(isEditCustom ? ((target as { customMeta?: { homepageUrl?: string } }).customMeta?.homepageUrl ?? "") : "");

  // 模型列表拉取
  const [fetchedModels, setFetchedModels] = useState<string[] | null>(null);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // 测试连接
  const [test, setTest] = useState<{ status: "idle" | "testing" | "ok" | "fail"; msg?: string }>({ status: "idle" });

  const providerId = target.kind === "api" || target.kind === "cli-relay" ? target.id : target.kind === "ollama" ? "ollama" : customId.trim();
  const displayTitle = isAdd ? p.addCustomProvider : target.kind === "ollama" ? "Ollama" : (target as { name: string }).name;
  const avatarChar = (isAdd ? (customName || "+") : displayTitle).slice(0, 1).toUpperCase();
  // base_url 输入的 placeholder：内置供应商显示真实默认端点,一眼知道留空会用什么
  const baseUrlPlaceholder =
    target.kind === "api" && target.defaultBaseUrl ? target.defaultBaseUrl
    : isOllama ? "http://localhost:11434"
    : p.customProviderBaseUrlPlaceholder;
  // claude 走原生 SDK,不支持自定义 base_url(后端 KEY_ENV base: null),隐藏该输入
  const supportsBaseUrl = target.kind === "api" ? status?.supportsBaseUrl !== false : true;
  const hintIsUrl = target.kind === "api" && !!target.hint && /^https?:\/\//.test(target.hint);

  const applyPreset = (preset: (typeof CUSTOM_PROVIDER_PRESETS)[number]) => {
    setCustomName(preset.name);
    setBaseUrl(preset.baseUrl);
    if (!customId.trim()) {
      const suggested = preset.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
      if (/^[a-z]/.test(suggested)) setCustomId(suggested);
    }
  };

  const fetchModels = async () => {
    setFetchingModels(true);
    setFetchError(null);
    try {
      const r = await api.providerModels({
        provider: isAdd ? undefined : providerId,
        baseUrl: baseUrl.trim() || undefined,
        apiKey: key.trim() || undefined,
      });
      if (r.ok && r.models) setFetchedModels(r.models);
      else setFetchError(r.error || "failed");
    } catch (e: any) {
      setFetchError(e?.message || String(e));
    } finally {
      setFetchingModels(false);
    }
  };

  const runTest = async () => {
    setTest({ status: "testing" });
    try {
      const r = await api.testProvider(providerId);
      setTest(r.ok ? { status: "ok", msg: r.note || `${r.latencyMs}ms` } : { status: "fail", msg: r.error });
    } catch (e: any) {
      setTest({ status: "fail", msg: e?.message });
    }
  };

  const save = async () => {
    setError(null);
    if (isAdd) {
      if (!customId.trim()) return setError(p.customProviderIdRequired);
      if (!customName.trim()) return setError(p.customProviderNameRequired);
      if (!baseUrl.trim()) return setError(p.customProviderBaseUrlRequired);
      setSaving(true);
      try {
        await api.createCustomProvider({
          id: customId.trim(),
          name: customName.trim(),
          note: note.trim() || undefined,
          homepageUrl: homepageUrl.trim() || undefined,
          baseUrl: baseUrl.trim(),
          apiKey: key.trim() || undefined,
          model: model.trim() || undefined,
        });
        onSaved();
        onClose();
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setSaving(false);
      }
      return;
    }
    if (isRelay && (target as { globalWrite?: boolean }).globalWrite && !window.confirm(p.cliRelayGlobalConfirm)) return;
    setSaving(true);
    try {
      // 编辑自定义供应商时,名称/官网/备注这些元数据也一起保存
      if (isEditCustom) {
        if (!customName.trim()) { setError(p.customProviderNameRequired); setSaving(false); return; }
        await api.updateCustomProvider(providerId, { name: customName.trim(), note, homepageUrl });
      }
      const r = await api.saveConfig(
        isOllama ? { provider: "ollama", baseUrl, model } : { provider: providerId, apiKey: key, baseUrl, model: isRelay ? undefined : model },
      );
      setKey("");
      setBackups(r.backups && r.backups.length > 0 ? r.backups : null);
      onSaved();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setSaving(true);
    try {
      await api.saveConfig({ provider: providerId, apiKey: "" });
      setKey("");
      setBaseUrl("");
      setModel("");
      setBackups(null);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "h-10 w-full rounded-xl border border-border/70 bg-background px-3 text-sm outline-none focus:border-primary/50";
  const labelCls = "mb-1 block text-xs font-medium text-muted-foreground";
  const modelChips = fetchedModels ?? (target.kind === "api" ? target.suggestions ?? [] : []);

  return (
    <div className="fixed inset-0 z-[58] overflow-auto bg-background">
      {/* 顶栏：返回 + 头像 + 标题 */}
      <div className="sticky top-0 z-10 border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <button onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-xl border border-border/70 text-muted-foreground hover:text-foreground" title={p.backToList}>
            <ArrowLeft className="size-4" />
          </button>
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary/80 to-fuchsia-500/80 text-sm font-bold text-white">
            {avatarChar}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold leading-tight">{isAdd ? p.addCustomProvider : `${p.editProviderTitle} · ${displayTitle}`}</h2>
            {target.kind === "api" && target.hint && (
              hintIsUrl ? (
                <a href={target.hint} target="_blank" rel="noreferrer" className="flex items-center gap-1 truncate text-[11px] text-primary hover:underline">
                  {target.hint} <ExternalLink className="size-2.5 shrink-0" />
                </a>
              ) : (
                <p className="truncate text-[11px] text-muted-foreground">{target.hint}</p>
              )
            )}
          </div>
        </div>
      </div>

      {/* 内容区 */}
      <div>
        <div className="mx-auto max-w-2xl space-y-4 px-4 py-5">
          {/* 基本信息：内置=只读展示,自定义=可编辑 */}
          {target.kind === "api" && !isAdd && (
            <Section title={p.sectionBasicInfo}>
              {isEditCustom ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>{p.customProviderIdLabel}</label>
                      <input value={target.id} disabled className={cn(inputCls, "cursor-not-allowed opacity-60")} />
                      <p className="mt-1 text-[11px] text-muted-foreground">{p.idImmutableHint}</p>
                    </div>
                    <div>
                      <label className={labelCls}>{p.customProviderNameLabel} *</label>
                      <input value={customName} onChange={(e) => setCustomName(e.target.value)} className={inputCls} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>{p.customProviderHomepageLabel}</label>
                      <input value={homepageUrl} onChange={(e) => setHomepageUrl(e.target.value)} placeholder="https://example.com" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>{p.customProviderNoteLabel}</label>
                      <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
                    </div>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className={labelCls}>{p.customProviderIdLabel}</span>
                    <code className="text-xs">{target.id}</code>
                  </div>
                  {target.defaultBaseUrl && (
                    <div className="min-w-0">
                      <span className={labelCls}>{p.defaultEndpointLabel}</span>
                      <code className="block truncate text-xs">{target.defaultBaseUrl}</code>
                    </div>
                  )}
                </div>
              )}
            </Section>
          )}
          {/* add-custom：预设图库 + 基本信息 */}
          {isAdd && (
            <>
              <Section title={p.customProviderPresetsLabel}>
                <div className="flex flex-wrap gap-1.5">
                  {CUSTOM_PROVIDER_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs transition-colors",
                        baseUrl === preset.baseUrl ? "border-primary bg-primary/10 text-primary" : "border-border/70 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                      )}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </Section>
              <Section title={p.sectionBasicInfo}>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>{p.customProviderIdLabel} *</label>
                    <input value={customId} onChange={(e) => setCustomId(e.target.value)} placeholder={p.customProviderIdPlaceholder} className={inputCls} />
                    <p className="mt-1 text-[11px] text-muted-foreground">{p.customProviderIdHint}</p>
                  </div>
                  <div>
                    <label className={labelCls}>{p.customProviderNameLabel} *</label>
                    <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder={p.customProviderNamePlaceholder} className={inputCls} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>{p.customProviderHomepageLabel}</label>
                    <input value={homepageUrl} onChange={(e) => setHomepageUrl(e.target.value)} placeholder="https://example.com" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>{p.customProviderNoteLabel}</label>
                    <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
                  </div>
                </div>
              </Section>
            </>
          )}

          {/* CLI 中转说明 + codex 全局警告 + 中转商预设 */}
          {isRelay && (
            <Section title={p.cliRelayToggle}>
              <p className="text-xs text-muted-foreground">{p.cliRelayHint}</p>
              {(target as { globalWrite?: boolean }).globalWrite && (
                <p className="flex items-start gap-1 text-xs text-amber-600 dark:text-amber-400">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> {p.cliRelayGlobalWarning}
                </p>
              )}
              {backups && (
                <p className="text-[11px] text-muted-foreground">
                  {p.cliRelayBackedUp} {backups.map((b) => b.split("/").pop()).join(", ")}
                </p>
              )}
              {CLI_RELAY_PRESETS.some((r) => r.baseUrls[providerId]) && (
                <div>
                  <label className={labelCls}>{p.cliRelayPresetsLabel}</label>
                  <div className="flex flex-wrap gap-1.5">
                    {CLI_RELAY_PRESETS.filter((r) => r.baseUrls[providerId]).map((r) => (
                      <button
                        key={r.name}
                        type="button"
                        onClick={() => setBaseUrl(r.baseUrls[providerId])}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
                          baseUrl === r.baseUrls[providerId]
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border/70 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                        )}
                      >
                        {r.name}
                        {r.sponsor && (
                          <span className="rounded-full bg-muted px-1 py-px text-[9px] font-medium text-muted-foreground">
                            {p.sponsorTag}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Section>
          )}

          {/* 连接配置：base_url + key */}
          <Section title={p.sectionConnection}>
            {supportsBaseUrl && (
              <div>
                <label className={labelCls}>
                  {isRelay ? p.cliRelayBaseUrlPlaceholder : p.customProviderBaseUrlLabel}
                  {isAdd && " *"}
                  {target.kind === "api" && target.defaultBaseUrl && (
                    <span className="ml-2 font-normal text-muted-foreground/70">{p.baseUrlDefaultHint}</span>
                  )}
                </label>
                <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={baseUrlPlaceholder} className={cn(inputCls, "font-mono")} />
              </div>
            )}
            {!isOllama && (
              <div>
                <label className={labelCls}>
                  {isRelay ? p.cliRelayTokenPlaceholder : "API Key"}
                  {status?.hasKey && <span className="ml-2 text-emerald-500">{p.keySet}{status.fromEnv ? p.fromEnv : ""}</span>}
                </label>
                <div className="relative">
                  <input
                    type={show ? "text" : "password"}
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder={status?.hasKey ? p.pasteNewKey : p.pasteKey}
                    className={cn(inputCls, "pr-9 font-mono")}
                  />
                  <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
            )}
          </Section>

          {/* 模型（中转不需要——中转商用 CLI 自己的模型协商） */}
          {!isRelay && (
            <Section title={p.sectionModel}>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className={labelCls + " mb-0"}>{isOllama ? p.ollamaModelPlaceholder : p.modelPlaceholder}</label>
                  {!isOllama && (
                    <button
                      type="button"
                      onClick={fetchModels}
                      disabled={fetchingModels}
                      title={p.fetchModelsHint}
                      className="flex items-center gap-1 rounded-lg border border-border/70 px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                    >
                      {fetchingModels ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}
                      {p.fetchModels}
                    </button>
                  )}
                </div>
                <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={p.customProviderModelPlaceholder} autoComplete="off" className={inputCls} />
                {fetchError && <p className="mt-1 text-[11px] text-red-500">{fetchError}</p>}
                {fetchedModels && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {p.modelsFetchedPre}{fetchedModels.length}{p.modelsFetchedPost}
                  </p>
                )}
                {modelChips.length > 0 && (
                  <div className="mt-1.5 flex max-h-44 flex-wrap gap-1.5 overflow-auto">
                    {modelChips.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setModel(m)}
                        className={cn(
                          "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                          model === m ? "border-primary bg-primary/10 text-primary" : "border-border/70 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Section>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}

          {/* 操作行：跟在内容后面,不悬空 */}
          <div className="flex items-center gap-3 pt-1">
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : isAdd ? <Plus className="size-4" /> : null}
              {isAdd ? p.customProviderSubmit : p.save}
            </Button>
            {!isAdd && (
              <Button size="sm" variant="outline" onClick={runTest} disabled={test.status === "testing" || (!isOllama && !status?.hasKey)}>
                {test.status === "testing" ? <Loader2 className="size-3.5 animate-spin" /> : <Plug className="size-3.5" />}
                {p.testConnection}
              </Button>
            )}
            {test.status === "ok" && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-500">
                <Check className="size-3.5" /> {p.ok} · {test.msg}
              </span>
            )}
            {test.status === "fail" && (
              <span className="inline-flex min-w-0 items-center gap-1 text-xs text-red-500">
                <XCircle className="size-3.5 shrink-0" /> <span className="truncate">{test.msg}</span>
              </span>
            )}
            {!isAdd && !isOllama && status?.hasKey && !status.fromEnv && (
              <button onClick={clear} className="ml-auto text-xs text-muted-foreground hover:text-red-500">
                {p.clear}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
