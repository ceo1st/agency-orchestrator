import type { ReactNode } from "react";

/**
 * 即时悬浮提示：原生 title 要悬停约 1 秒才出现、且样式不可控，图标按钮的用途
 * 用户经常发现不了。纯 CSS 实现（无依赖），hover 即显示。
 * 用法：<Tip label="删除此工作流"><Button …/></Tip>
 */
export function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] font-medium text-background opacity-0 shadow-md transition-opacity duration-100 group-hover/tip:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}
