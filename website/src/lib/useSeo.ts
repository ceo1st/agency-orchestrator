import { useEffect } from "react";

/**
 * 轻量 per-page SEO：在页面挂载时设置独立的 <title> 和 meta description（含 og）。
 * 注意：这是客户端设置,对会跑 JS 的搜索引擎(Google)有效;百度等不跑 JS 的引擎仍需「预渲染/SSG」才能看到。
 */
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
    if (title) document.title = title;
    if (description) {
      setMeta('meta[name="description"]', "name", "description", description);
      setMeta('meta[property="og:description"]', "property", "og:description", description);
    }
    if (title) setMeta('meta[property="og:title"]', "property", "og:title", title);
  }, [title, description]);
}
