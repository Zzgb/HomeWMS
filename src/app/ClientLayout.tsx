"use client";

import { LanguageProvider } from "@/lib/i18n";
import type { ReactNode } from "react";

export default function ClientLayout({ children }: { children: ReactNode }) {
  return <LanguageProvider>{children}</LanguageProvider>;
}
