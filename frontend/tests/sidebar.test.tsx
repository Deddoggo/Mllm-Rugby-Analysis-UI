// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppSidebar } from "@/components/layout/app-sidebar";

vi.mock("@/components/ui/app-scroll-area", () => ({
  AppScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("sidebar animation regression", () => {
  afterEach(() => {
    cleanup();
    document.documentElement.className = "";
    document.head.querySelector("[data-sidebar-test-css]")?.remove();
  });

  it("keeps one transition-bearing sidebar with numeric widths in light and dark mode", () => {
    const css = readFileSync(`${process.cwd()}/app/globals.css`, "utf8");
    const baseRule = css.match(/\.sidebar\s*\{[^}]+\}/)?.[0] ?? "";
    const collapsedRule = css.match(/\.sidebar\.collapsed\s*\{[^}]+\}/)?.[0] ?? "";
    const style = document.createElement("style");
    style.dataset.sidebarTestCss = "true";
    style.textContent = `${baseRule}\n${collapsedRule}`;
    document.head.append(style);

    const { container } = render(<AppSidebar />);
    const sidebar = container.querySelector(".sidebar") as HTMLElement;
    expect(getComputedStyle(sidebar).width).toBe("252px");
    expect(getComputedStyle(sidebar).transition).toContain("width");

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(container.querySelector(".sidebar")).toBe(sidebar);
    expect(getComputedStyle(sidebar).width).toBe("76px");

    document.documentElement.classList.add("dark");
    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(container.querySelector(".sidebar")).toBe(sidebar);
    expect(getComputedStyle(sidebar).width).toBe("252px");
    expect(getComputedStyle(sidebar).transition).toContain("width");

    expect(css).not.toMatch(/\.dark\s+\.sidebar[^{}]*\{[^}]*transition\s*:/s);
  });
});
