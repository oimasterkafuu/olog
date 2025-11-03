'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PropsWithChildren } from "react";

interface NavLinkProps {
  href: string;
}

export function NavLink({ href, children }: PropsWithChildren<NavLinkProps>) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      className={`block whitespace-nowrap rounded px-3 py-2 text-sm font-medium transition ${
        active
          ? "bg-slate-900 text-white"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {children}
    </Link>
  );
}
