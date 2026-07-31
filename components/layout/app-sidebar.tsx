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
  Target,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";

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

        <div className="sidebar-bottom">
          {!collapsed && (
            <div className="research-card">
              <div className="research-icon"><Sparkles size={15} /></div>
              <div><strong>Research Project</strong><span>Multimodal behavior lab</span></div>
            </div>
          )}
          <div className="sidebar-tools">
            <button aria-label="Collapse sidebar" onClick={() => setCollapsed(!collapsed)}><ChevronLeft size={16} /></button>
            <button aria-label="Toggle theme"><Moon size={16} /></button>
            <button aria-label="Settings"><Settings size={16} /></button>
          </div>
        </div>
      </aside>
    </>
  );
}
