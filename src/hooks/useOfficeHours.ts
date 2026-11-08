import { useEffect, useState } from "react";
import { fetchOfficeHours, type OfficeHour } from "@/lib/office-hours";

/**
 * The next office hours, or null while loading and after a failure. A failed
 * fetch only hides the box; the empty screen works without it.
 */
export function useOfficeHours(supportUrl: string): OfficeHour[] | null {
  const [hours, setHours] = useState<OfficeHour[] | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetchOfficeHours({ supportUrl, signal: controller.signal })
      .then(setHours)
      .catch(() => {
        if (!controller.signal.aborted) setHours(null);
      });
    return () => controller.abort();
  }, [supportUrl]);
  return hours;
}
