import type { ReactNode } from "react";
import { program } from "@/config/program";

export function ChatDisclaimer(): ReactNode {
  return (
    <p className="text-muted-foreground mt-2 text-center text-xs">
      {program.disclaimer}{" "}
      <a
        href={program.privacyUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        Privacy Notice
      </a>
    </p>
  );
}
