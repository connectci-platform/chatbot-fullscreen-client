import { File, X as XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** A shared PDF or text file: its name, and its size and pages when known. */
export function FileChip({
  name,
  detail,
  removable = false,
  onRemove,
  size = "md",
  className,
}: {
  name: string;
  detail?: string;
  removable?: boolean;
  onRemove?: () => void;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex items-start gap-2 rounded-md border bg-gray-100 px-3 py-2",
        className,
      )}
    >
      <div className="flex flex-shrink-0 flex-col items-start justify-start">
        <File
          className={cn("text-teal-700", size === "sm" ? "h-5 w-5" : "h-7 w-7")}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span
          className="text-sm break-all text-gray-800"
          style={{ wordBreak: "break-all", whiteSpace: "pre-wrap" }}
        >
          {name}
        </span>
        {detail && <span className="text-xs text-gray-500">{detail}</span>}
      </div>
      {removable && (
        <button
          type="button"
          className="ml-2 self-start rounded-full bg-gray-200 p-1 text-teal-700 hover:bg-gray-300"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
        >
          <XIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
