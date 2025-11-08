import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { LogoutButton } from "@/components/logout-button";
import { NavLink } from "@/components/nav-link";
import { MobileNav } from "@/components/mobile-nav";

interface NavItem {
  name: string;
  href: string;
}

const navItems: NavItem[] = [
  { name: "仪表盘", href: "/admin" },
  { name: "日记管理", href: "/admin/diary" },
  { name: "文章管理", href: "/admin/posts" },
  { name: "系列管理", href: "/admin/series" },
  { name: "附件管理", href: "/admin/attachments" },
  { name: "AI 调用记录", href: "/admin/ai-reviews" },
  { name: "系统配置", href: "/admin/config" },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session.userId) {
    redirect("/admin/login");
  }

  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside className="hidden w-60 flex-shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="px-6 py-6">
          <p className="text-lg font-semibold">后台</p>
          <p className="mt-1 text-sm text-slate-500">你好，{session.username}</p>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {navItems.map((item) => (
            <NavLink key={item.href} href={item.href}>
              {item.name}
            </NavLink>
          ))}
        </nav>
        <div className="px-6 py-4">
          <LogoutButton />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <div className="flex items-center gap-3">
            <MobileNav navItems={navItems} />
            <div>
              <p className="text-base font-semibold">后台</p>
              <p className="text-xs text-slate-500">{session.username}</p>
            </div>
          </div>
          <LogoutButton />
        </header>
        <main className="flex-1 overflow-x-auto px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
