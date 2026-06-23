import { useEffect } from "react";

/**
 * 轻量 per-page SEO：页面挂载时设独立 <title> 和 meta description（含 og），卸载时还原。
 * 还原很关键:这样从「设了 SEO 的页」切到「没设的页」(如首页)时,标题不会残留成上一页的。
 * 注意:仅客户端生效,对会跑 JS 的引擎(Google)有用;百度等不跑 JS 的需预渲染/SSG。
 */
function getMeta(selector: string): string | null {
  return document.head.querySelector<HTMLMetaElement>(selector)?.getAttribute("content") ?? null;
}
function setMeta(selector: string, attr: string, name: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export function useSeo(title?: string, description?: string) {
  useEffect(() => {
    const prevTitle = document.title;
    const prevDesc = getMeta('meta[name="description"]');
    const prevOgTitle = getMeta('meta[property="og:title"]');
    const prevOgDesc = getMeta('meta[property="og:description"]');

    if (title) {
      document.title = title;
      setMeta('meta[property="og:title"]', "property", "og:title", title);
    }
    if (description) {
      setMeta('meta[name="description"]', "name", "description", description);
      setMeta('meta[property="og:description"]', "property", "og:description", description);
    }

    return () => {
      document.title = prevTitle;
      if (prevDesc !== null) setMeta('meta[name="description"]', "name", "description", prevDesc);
      if (prevOgTitle !== null) setMeta('meta[property="og:title"]', "property", "og:title", prevOgTitle);
      if (prevOgDesc !== null) setMeta('meta[property="og:description"]', "property", "og:description", prevOgDesc);
    };
  }, [title, description]);
}
