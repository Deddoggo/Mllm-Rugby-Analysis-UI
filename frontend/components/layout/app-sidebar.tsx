"use client";

import {
  Activity,
  BarChart3,
  BookOpen,
  Bot,
  ChevronLeft,
  CircleHelp,
  FileText,
  Gauge,
  GitBranch,
  Library,
  Menu,
  Moon,
  PlaySquare,
  Settings,
  Sparkles,
  Sun,
  Target,
  Users,
  X,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { AppScrollArea } from "@/components/ui/app-scroll-area";
import { useAnalysisSettingsStore } from "@/stores/settings-store";

type NavigationItem = [LucideIcon, string, boolean?];

const groups: Array<{ label: string; items: NavigationItem[] }> = [
  {
    label: "Workspace",
    items: [
      [PlaySquare, "Analysis Workspace", true],
      [Library, "Match Library"],
      [GitBranch, "Event Timeline"],
      [FileText, "Saved Analyses"],
    ],
  },
  {
    label: "Intelligence",
    items: [
      [Gauge, "Performance Overview"],
      [Target, "Tactical Insights"],
      [Users, "Player Behavior"],
      [BarChart3, "Reports"],
    ],
  },
  {
    label: "Resources",
    items: [
      [BookOpen, "Rugby Knowledge"],
      [Activity, "Model Status"],
      [CircleHelp, "Documentation"],
    ],
  },
];

export function AppSidebar() {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const openSettings = useAnalysisSettingsStore((state) => state.openSettings);

  const toggleTheme = () => setTheme(resolvedTheme === "dark" ? "light" : "dark");

  return (
    <>
      <button className="mobile-menu" onClick={() => setOpen(true)} aria-label="Open navigation">
        <Menu size={19} />
      </button>
      {open && <button className="sidebar-backdrop" onClick={() => setOpen(false)} aria-label="Close navigation" />}
      <aside className={`sidebar ${collapsed ? "collapsed" : ""} ${open ? "mobile-open" : ""}`}>
        <div className="brand-row">
          <span className="rugby-mark" aria-hidden="true"><span /></span>
          {!collapsed && <strong>Rugby Intelligence</strong>}
          <button className="icon-button sidebar-close" onClick={() => setOpen(false)} aria-label="Close navigation"><X size={17} /></button>
        </div>

        <button className="analyze-button">
          <Bot size={17} />
          {!collapsed && <span>Analyze Match</span>}
        </button>

        <AppScrollArea className="sidebar-scroll-area" viewportClassName="sidebar-scroll-viewport" testId="sidebar-scroll-area">
          <nav aria-label="Primary navigation">
            {groups.map((group) => (
              <section className="nav-group" key={group.label}>
                {!collapsed && <p>{group.label}</p>}
                {group.items.map(([Icon, label, active]) => (
                  <button className={`nav-item ${active ? "active" : ""}`} key={String(label)} title={String(label)}>
                    <Icon size={16} />
                    {!collapsed && <span>{String(label)}</span>}
                  </button>
                ))}
              </section>
            ))}
          </nav>
        </AppScrollArea>

        <div className="sidebar-bottom">
          {!collapsed && (
            <div className="research-card">
              <div className="research-icon"><Sparkles size={15} /></div>
              <div><strong>Research Project</strong><span>Multimodal behavior lab</span></div>
            </div>
          )}
          <div className="sidebar-tools">
            <button className="sidebar-collapse-control" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed(!collapsed)}>
              <ChevronLeft size={16} />
              {!collapsed && <span>Collapse</span>}
            </button>
            {!collapsed && (
              <>
                <button aria-label="Toggle theme" onClick={toggleTheme}>
                  <span className="theme-icon theme-icon-moon"><Moon size={16} /></span>
                  <span className="theme-icon theme-icon-sun"><Sun size={16} /></span>
                </button>
                <button
                  aria-label="Analysis settings from sidebar"
                  onClick={() => {
                    openSettings();
                    setOpen(false);
                  }}
                >
                  <Settings size={16} />
                </button>
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
