"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import {
  MessageCircle,
  Package,
  ScrollText,
  Settings,
  Warehouse,
} from "lucide-react";

const linkKeys = [
  { href: "/chat", key: "chat", icon: MessageCircle },
  { href: "/inventory", key: "inventory", icon: Package },
  { href: "/logs", key: "logs", icon: ScrollText },
  { href: "/settings", key: "settings", icon: Settings },
];

export function Nav() {
  const pathname = usePathname();
  const { t } = useT();

  return (
    <nav className="border-b border-border/50 bg-background/70 backdrop-blur-xl backdrop-saturate-150 sticky top-0 z-50 supports-[backdrop-filter]:bg-background/50">
      <div className="px-4 h-14 flex items-center gap-1">
        <Link href="/chat" className="flex items-center gap-2 mr-4">
          <Warehouse className="h-5 w-5" />
          <span className="font-semibold text-sm">Home WMS</span>
        </Link>

        <div className="flex items-center gap-1">
          {linkKeys.map(({ href, key, icon: Icon }) => (
            <Button
              key={href}
              variant={pathname.startsWith(href) ? "secondary" : "ghost"}
              size="sm"
              asChild
            >
              <Link href={href}>
                <Icon className="h-4 w-4 mr-1.5" />
                {t(key)}
              </Link>
            </Button>
          ))}
        </div>

        <div className="flex-1" />
      </div>
    </nav>
  );
}
