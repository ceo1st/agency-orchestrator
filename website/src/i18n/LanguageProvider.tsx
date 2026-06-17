import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { LANGUAGES, translations, type Language, type Translation } from "./translations";

interface LanguageContextValue {
  lang: Language;
  t: Translation;
  setLang: (lang: Language) => void;
  toggle: () => void;
  prefix: (path: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function detectLang(): Language {
  if (typeof window === "undefined") return "zh";
  // 1. URL path segment (public site /en routes)
  const seg = window.location.pathname.split("/").filter(Boolean)[0];
  if (LANGUAGES.includes(seg as Language)) return seg as Language;
  // 2. 用户显式切换过 → 持久化优先（即使下面 launcher 传了 ?lang= 也尊重用户选择）
  const stored = window.localStorage.getItem("ao-lang");
  if (LANGUAGES.includes(stored as Language)) return stored as Language;
  // 3. launcher 提示（桌面端 / `ao web` 按其语言带上 ?lang=zh|en）
  const qp = new URLSearchParams(window.location.search).get("lang");
  if (LANGUAGES.includes(qp as Language)) return qp as Language;
  // 4. 浏览器语言兜底
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(detectLang);

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    window.localStorage.setItem("ao-lang", lang);
  }, [lang]);

  const setLang = useCallback((next: Language) => setLangState(next), []);
  const toggle = useCallback(() => setLangState((p) => (p === "zh" ? "en" : "zh")), []);
  const prefix = useCallback((path: string) => (lang === "zh" ? path : `/en${path === "/" ? "" : path}`), [lang]);

  const value = useMemo<LanguageContextValue>(
    () => ({ lang, t: translations[lang], setLang, toggle, prefix }),
    [lang, setLang, toggle, prefix],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
