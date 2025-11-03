import type { ReactNode } from "react";

interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

export function PageContainer({ children, className }: PageContainerProps) {
  const baseClassName = "mx-auto min-h-screen w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8 lg:py-16";
  return <main className={className ? `${baseClassName} ${className}` : baseClassName}>{children}</main>;
}
