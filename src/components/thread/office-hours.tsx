import { cn } from "@/lib/utils";
import { formatOfficeHourStart, type OfficeHour } from "@/lib/office-hours";

/**
 * Drop-in office hours: a way to reach a person, shown on the empty screen.
 * Every session is the same series, so each is listed by its start time.
 */
export function OfficeHours({
  hours,
  description,
  supportUrl,
  className,
}: {
  hours: OfficeHour[] | null;
  description: string;
  supportUrl: string;
  className?: string;
}) {
  if (!hours?.length) return null;
  return (
    <section
      aria-labelledby="office-hours-heading"
      className={cn("border-brand border-l-2 py-1 pl-3 text-sm", className)}
    >
      <h2
        id="office-hours-heading"
        className="font-semibold"
      >
        Office hours
      </h2>
      <p className="text-muted-foreground">{description}</p>
      <ul className="mt-2 flex flex-col gap-1">
        {hours.map((hour) => (
          <li key={hour.id}>
            <a
              href={hour.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand font-medium underline-offset-2 hover:underline"
            >
              <time dateTime={hour.start.toISOString()}>
                {formatOfficeHourStart(hour.start)}
              </time>
            </a>
          </li>
        ))}
      </ul>
      <a
        href={`${supportUrl}/events`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted-foreground mt-2 inline-block underline underline-offset-2 hover:text-black"
      >
        All upcoming events
      </a>
    </section>
  );
}
