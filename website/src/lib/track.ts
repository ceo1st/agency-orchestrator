// 极简埋点:把关键激活漏斗事件发给已配置的 GA4(window.gtag,见 index.html)。
// 目的——发布后用真实数据决策(哪些功能真被用、激活率多少),而不是拍脑袋。
// gtag 缺失(本地无网 / 被拦 / 演示站未配)时静默跳过,绝不报错。
export function track(event: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const gtag = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag;
  if (typeof gtag === "function") {
    try { gtag("event", event, params ?? {}); } catch { /* 埋点失败绝不影响功能 */ }
  }
}
