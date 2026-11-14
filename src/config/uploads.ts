/** Mirrors the agent's upload limits. Keep the two in step. */
export interface UploadLimits {
  /** Files in one message. */
  maxFiles: number;
  /** Bytes sent in one message, across all files. */
  maxTotalBytes: number;
  /** Per file, measured on the file the user picks (before any resize). */
  maxImageBytes: number;
  maxPdfBytes: number;
  maxTextBytes: number;
}

const KB = 1024;
const MB = 1024 * KB;

export const SIGNED_IN_LIMITS: UploadLimits = {
  maxFiles: 5,
  maxTotalBytes: 20 * MB,
  maxImageBytes: 10 * MB,
  maxPdfBytes: 10 * MB,
  maxTextBytes: 200 * KB,
};

export const ANONYMOUS_LIMITS: UploadLimits = {
  maxFiles: 2,
  maxTotalBytes: 8 * MB,
  maxImageBytes: 5 * MB,
  maxPdfBytes: 5 * MB,
  maxTextBytes: 100 * KB,
};

/** Text files are accepted by extension; browsers often report no MIME type. */
export const TEXT_FILE_EXTENSIONS = [
  "txt",
  "log",
  "out",
  "err",
  "sh",
  "bash",
  "slurm",
  "sbatch",
  "pbs",
  "py",
  "r",
  "jl",
  "m",
  "c",
  "cpp",
  "h",
  "f90",
  "yaml",
  "yml",
  "json",
  "toml",
  "cfg",
  "ini",
  "csv",
  "md",
] as const;

export const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

/** The image type a file name suggests, for files a browser gave no type. */
export const IMAGE_TYPE_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

/** Apple's photo formats, which the agent can't read. */
export const HEIC_EXTENSIONS = ["heic", "heif"] as const;

/** The image type of a file: its own, or else what its name suggests. */
export function imageType(file: { type: string; name: string }): string | null {
  if ((IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    return file.type;
  }
  if (file.type) return null;
  const dot = file.name.lastIndexOf(".");
  if (dot < 0) return null;
  return (
    IMAGE_TYPE_BY_EXTENSION[file.name.slice(dot + 1).toLowerCase()] ?? null
  );
}

/** For the file picker's `accept` attribute. */
export const UPLOAD_ACCEPT = [
  ...IMAGE_MIME_TYPES,
  "application/pdf",
  ...TEXT_FILE_EXTENSIONS.map((e) => `.${e}`),
].join(",");

/** "5 MB", "100 KB". */
export function formatLimit(bytes: number): string {
  return bytes >= MB ? `${bytes / MB} MB` : `${bytes / KB} KB`;
}
