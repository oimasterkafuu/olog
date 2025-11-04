'use client';

import { useState } from 'react';
import { NavLink } from './nav-link';

interface NavItem {
  name: string;
  href: string;
}

interface MobileNavProps {
  navItems: NavItem[];
}

export function MobileNav({ navItems }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* 汉堡菜单按钮 */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="rounded p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
        aria-label="导航菜单"
      >
        <svg
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {isOpen ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          )}
        </svg>
      </button>

      {/* 折叠菜单面板 */}
      {isOpen && (
        <>
          {/* 遮罩层 */}
          <div
            className="fixed inset-0 z-40 bg-slate-900/20"
            onClick={() => setIsOpen(false)}
          />
          
          {/* 菜单内容 */}
          <div className="fixed left-0 top-[57px] z-50 w-full border-b border-slate-200 bg-white shadow-lg">
            <nav className="space-y-1 px-4 py-3">
              {navItems.map((item) => (
                <div key={item.href} onClick={() => setIsOpen(false)}>
                  <NavLink href={item.href}>
                    {item.name}
                  </NavLink>
                </div>
              ))}
            </nav>
          </div>
        </>
      )}
    </>
  );
}

