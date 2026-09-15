"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "cn";

/**
 * Scroll reveal wrapper. Opacity + translateY entrance only, staggered
 * via `delay`. Uses IntersectionObserver, fires once, and renders
 * statically visible when reduced motion is preferred or IO is missing.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: 0 | 75 | 150 | 225;
  as?: "div" | "li" | "section" | "ul";
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(
    () =>
      typeof window !== "undefined" &&
      (window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
        typeof IntersectionObserver === "undefined")
  );

  useEffect(() => {
    if (visible) return;
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  const delayClass =
    delay === 75
      ? "delay-75"
      : delay === 150
        ? "delay-150"
        : delay === 225
          ? "delay-[225ms]"
          : "";

  return (
    <Tag
      // @ts-expect-error — Tag is a narrow union of valid hosts for ref
      ref={ref}
      className={cn(
        "transition-all duration-700 ease-out motion-reduce:transition-none",
        visible
          ? "translate-y-0 opacity-100 motion-reduce:translate-y-0"
          : "translate-y-5 opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100",
        delayClass,
        className
      )}
    >
      {children}
    </Tag>
  );
}
