import { forgetRatings } from "./answer-ratings";
import { forgetReloadCutOffs } from "./stopped-answer";
import { forgetStoredImages } from "@/hooks/use-stored-image";
import { forgetLoadedTables } from "./xdmod-table-cache";

/**
 * After a delete (D8-3126), nothing from the deleted conversations stays in
 * this page: cached ratings, stopped-answer notes, shared images and loaded
 * tables. Images and tables aren't kept by conversation, and the caches are
 * small and bounded, so those are cleared whole.
 */
export function forgetConversations(threadId?: string): void {
  forgetRatings(threadId);
  forgetReloadCutOffs(threadId);
  forgetStoredImages();
  forgetLoadedTables();
}
