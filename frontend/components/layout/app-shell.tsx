"use client";

import { AppSidebar } from "./app-sidebar";
import { AppTopbar } from "./app-topbar";

export function AppShell({
  children,
  search,
  onSearch,
}: {
  children: React.ReactNode;
  search: string;
  onSearch: (value: string) => void;
}) {
  return (
    <div className="application">
      <AppSidebar />
      <div className="app-main">
        <AppTopbar search={search} onSearch={onSearch} />
        <main className="workspace">{children}</main>
      </div>
    </div>
  );
}
