export function ChatBubbleIcon({
  width = 24,
  height = 24,
  className,
}: {
  width?: number | string;
  height?: number | string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={width}
      height={height}
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M21 11.5c0 4.694-4.03 8.5-9 8.5a10.07 10.07 0 0 1-2.555-.326L4 21l1.474-3.684A8.31 8.31 0 0 1 3 11.5C3 6.806 7.03 3 12 3s9 3.806 9 8.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
