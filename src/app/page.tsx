import type { Metadata } from "next";
import { ChatPage } from "./chat-page";

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

/**
 * A link to one conversation is someone's own thread, so search engines are
 * told not to index it. Only the start screen can appear in results.
 */
export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const { threadId } = await searchParams;
  return threadId ? { robots: { index: false, follow: false } } : {};
}

export default function Page() {
  return <ChatPage />;
}
