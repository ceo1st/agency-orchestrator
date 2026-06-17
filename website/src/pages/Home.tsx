import { Features } from "@/components/home/Features";
import { FinalCta } from "@/components/home/FinalCta";
import { Hero } from "@/components/home/Hero";
import { OneLinerDemo } from "@/components/home/OneLinerDemo";
import { Providers } from "@/components/home/Providers";
import { SiteFooter } from "@/components/layout/SiteFooter";

export default function Home() {
  return (
    <>
      <main>
        <Hero />
        <OneLinerDemo />
        <Features />
        <Providers />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
