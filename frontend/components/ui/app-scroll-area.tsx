"use client";

import { ScrollArea } from "@chakra-ui/react";
import type { Ref } from "react";

export type AppScrollAreaOrientation = "vertical" | "horizontal" | "both";

interface AppScrollAreaProps {
  children: React.ReactNode;
  className?: string;
  viewportClassName?: string;
  contentClassName?: string;
  orientation?: AppScrollAreaOrientation;
  viewportRef?: Ref<HTMLDivElement>;
  testId?: string;
}

export function AppScrollArea({
  children,
  className,
  viewportClassName,
  contentClassName,
  orientation = "vertical",
  viewportRef,
  testId,
}: AppScrollAreaProps) {
  const vertical = orientation === "vertical" || orientation === "both";
  const horizontal = orientation === "horizontal" || orientation === "both";

  return (
    <ScrollArea.Root
      className={className}
      data-orientation-mode={orientation}
      data-scroll-size="xs"
      data-scroll-variant="hover"
      data-testid={testId}
      size="xs"
      variant="hover"
    >
      <ScrollArea.Viewport ref={viewportRef} className={viewportClassName}>
        <ScrollArea.Content className={contentClassName}>{children}</ScrollArea.Content>
      </ScrollArea.Viewport>
      {vertical && (
        <ScrollArea.Scrollbar orientation="vertical">
          <ScrollArea.Thumb />
        </ScrollArea.Scrollbar>
      )}
      {horizontal && (
        <ScrollArea.Scrollbar orientation="horizontal">
          <ScrollArea.Thumb />
        </ScrollArea.Scrollbar>
      )}
      {vertical && horizontal && <ScrollArea.Corner />}
    </ScrollArea.Root>
  );
}
