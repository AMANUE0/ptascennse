"use client";

import { type ComponentProps } from "react";
import { Copy as CopyIcon } from "lucide-react";

export default function Copy({ onClick, ...props }: ComponentProps<typeof CopyIcon>) {
  const copy = async (
    event: Parameters<NonNullable<ComponentProps<typeof CopyIcon>["onClick"]>>[0]
  ) => {
    const parent = event.currentTarget.parentElement;
    const spans = parent
      ? Array.from(parent.querySelectorAll("span"))
          .map((span) => span.textContent?.trim())
          .filter(Boolean)
      : [];

    const value = spans.at(-1) || parent?.textContent?.replace("⧉", "").trim();

    if (value && navigator.clipboard) {
      await navigator.clipboard.writeText(value);
    }

    onClick?.(event);
  };

  return <CopyIcon {...props} role="button" tabIndex={0} onClick={copy} />;
}
