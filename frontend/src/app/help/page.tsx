"use client";

import PageHeader from "@/components/layout/PageHeader";
import HelpAssistant from "@/components/help/HelpAssistant";

export default function HelpPage() {
  return (
    <main className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        title="Help"
        subtitle="Get quick answers about using Human Service Forum."
      />
      <div className="mx-auto max-w-3xl px-6 py-12">
        <HelpAssistant />
      </div>
    </main>
  );
}
