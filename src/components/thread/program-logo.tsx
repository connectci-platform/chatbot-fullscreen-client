import Image from "next/image";
import { program } from "@/config/program";
import { cn } from "@/lib/utils";

export function ProgramLogo({ size = "large" }: { size?: "large" | "small" }) {
  const { src, alt, width, height } = program.logo;
  const small = size === "small";
  return (
    <span
      className={cn(
        "flex items-center",
        // Logo and name don't fit side by side on a phone, so the large
        // version stacks the name under the logo until there is room.
        small ? "gap-3" : "flex-col gap-1 sm:flex-row sm:gap-3",
      )}
    >
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={cn("w-auto", small ? "h-7" : "h-10 sm:h-12")}
      />
      <span
        className={cn(
          "text-brand font-medium",
          small ? "text-xl" : "text-2xl sm:text-3xl",
        )}
      >
        {program.siteName}
      </span>
    </span>
  );
}
