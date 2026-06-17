import type { ReactNode } from "react";

/**
 * 渲染赞助商优惠文案，并把优惠码（couponCode）放大 + 高亮，避免用户漏看。
 * 例：「注册并在充值时填写优惠码 agent，可享九折优惠」→ agent 高亮成徽章。
 */
export function PerkText({ text, code }: { text: string; code?: string }) {
  if (!code || !text.includes(code)) return <>{text}</>;
  const i = text.indexOf(code);
  const before = text.slice(0, i);
  const after = text.slice(i + code.length);
  const badge: ReactNode = (
    <code className="mx-1 inline-block rounded-md bg-gold px-2 py-0.5 align-middle text-sm font-bold tracking-wide text-gold-foreground">
      {code}
    </code>
  );
  return (
    <>
      {before}
      {badge}
      {after}
    </>
  );
}
