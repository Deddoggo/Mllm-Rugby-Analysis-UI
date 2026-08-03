import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render as testingLibraryRender } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class TestIntersectionObserver {
  root = null;
  rootMargin = "0px";
  thresholds = [0];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}

if (typeof window !== "undefined" && typeof window.ResizeObserver === "undefined") {
  Object.defineProperty(window, "ResizeObserver", {
    configurable: true,
    value: TestResizeObserver,
  });
}

if (typeof window !== "undefined" && typeof window.IntersectionObserver === "undefined") {
  Object.defineProperty(window, "IntersectionObserver", {
    configurable: true,
    value: TestIntersectionObserver,
  });
}

function ChakraTestProvider({ children }: { children: ReactNode }) {
  return <ChakraProvider value={defaultSystem}>{children}</ChakraProvider>;
}

export function render(ui: ReactElement) {
  return testingLibraryRender(ui, { wrapper: ChakraTestProvider });
}
