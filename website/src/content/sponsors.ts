import type { Language } from "@/i18n/translations";

/**
 * 赞助商数据。
 *
 * 当前赞助商：APINEBULA（旗舰，银河录像局旗下 AI 聚合平台）、优云智算（UCloud 旗下 AI 云平台）。
 * 均为真实付费赞助，非占位样例。新增赞助商时按 Sponsor 结构追加即可。
 */

export type SponsorTier = "flagship" | "standard";

export type LocalizedText = Record<Language, string>;

export interface Sponsor {
  id: string;
  name: string;
  /** 没有 logo 时用作头像的文字/emoji */
  badge: string;
  /** 头像底色（tailwind 渐变类），可选 */
  accent?: string;
  /** 小 logo 图（public 目录下的路径），优先于 badge 作为头像 */
  logo?: string;
  /** 大屏 banner 图（public 目录下的路径）。旗舰赞助商用,全宽展示 */
  banner?: string;
  url: string;
  tier: SponsorTier;
  tagline: LocalizedText;
  description: LocalizedText;
  perk?: LocalizedText;
  /** 旗舰大屏卡片的 CTA 按钮文案，缺省时退回 tagline */
  perkCta?: LocalizedText;
  couponCode?: string;
  since?: string;
  featured?: boolean;
  /** 占位/推荐样例数据，非真实付费赞助 */
  placeholder?: boolean;
}

export const sponsors: Sponsor[] = [
  {
    id: "apinebula",
    name: "APINEBULA",
    badge: "🌌",
    accent: "from-violet-600 to-indigo-500",
    logo: "/sponsors/logo-apinebula-icon.png",
    banner: "/sponsors/banner-apinebula.jpeg",
    url: "https://apinebula.com/V6ekjG",
    tier: "flagship",
    since: "2026-06",
    featured: true,
    tagline: {
      zh: "银河录像局旗下企业级 AI 聚合平台 · Claude / GPT / Gemini 满血模型低至 1 折",
      en: "Enterprise AI aggregation platform · Claude / GPT / Gemini at up to 90% off",
    },
    description: {
      zh: "感谢 APINEBULA 大屏赞助本项目！APINEBULA 是银河录像局旗下的企业级 AI 聚合平台，背靠大平台资源，面向开发者、团队与企业用户提供稳定、高性价比的大模型 API 接入服务。平台聚合 Claude、GPT、Gemini 等主流满血模型，一个接口接入全球顶尖 AI 大模型，各大模型价格低至 1 折起，支持企业级高并发、正式合同、对公打款与开票服务，适合 AI 编程、Agent 开发、业务系统集成等多种场景！",
      en: "Thanks to APINEBULA for sponsoring this project! APINEBULA is an enterprise-grade AI aggregation platform under Galaxy Video Bureau, backed by strong platform resources. It provides developers, teams and enterprises with stable, cost-effective large-model API access. The platform aggregates full-capability mainstream models including Claude, GPT and Gemini — with one unified API, access top global AI models at prices as low as 10% of the official rate. It also supports enterprise-grade high concurrency, formal contracts, corporate payments and invoicing, making it suitable for AI coding, Agent development, business-system integration and more.",
    },
    perk: {
      zh: "注册并在充值时填写优惠码 agent，可享九折优惠",
      en: "Use coupon code agent at recharge for a 10% discount",
    },
    perkCta: {
      zh: "使用专属优惠访问",
      en: "Get the exclusive offer",
    },
    couponCode: "agent",
  },
  {
    id: "youyun",
    name: "优云智算",
    badge: "☁️",
    accent: "from-sky-500 to-indigo-500",
    logo: "/sponsors/logo-compshare-icon.png",
    url: "https://passport.compshare.cn/register?referral_code=ETD3L5JBM13CtKARkMORot&ytag=GPU_YY_YX_git_agency-agents",
    tier: "standard",
    since: "2026-06",
    featured: false,
    tagline: {
      zh: "UCloud 旗下 AI 云平台 · 高性价比国产模型 Agent Plan",
      en: "AI cloud platform by UCloud · cost-effective Agent Plans",
    },
    description: {
      zh: "感谢优云智算赞助了本项目！优云智算是 UCloud 旗下 AI 云平台，主打包月、按次的高性价比国产模型 Agent Plan 套餐，低至 49 元/月起。同时提供官转稳定海外模型，支持接入 Claude Code、Codex 及 API 调用。企业级高并发、7×24 技术支持、自助开票。",
      en: "Thanks to CompShare (优云智算) for sponsoring this project! CompShare is UCloud's AI cloud platform, offering cost-effective monthly / pay-per-call Agent Plans for Chinese models from ¥49/mo, plus stable official relays for overseas models. Works with Claude Code, Codex and direct API calls — with enterprise-grade concurrency, 24/7 support and self-service invoicing.",
    },
    perk: {
      zh: "新用户注册立得 5 元平台体验金",
      en: "¥5 free platform credit for new sign-ups",
    },
  },
];

export function sponsorsByTier(tier: SponsorTier) {
  return sponsors.filter((s) => s.tier === tier);
}
