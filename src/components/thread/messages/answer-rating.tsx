"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Message } from "@langchain/langgraph-sdk";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useQueryState } from "nuqs";
import { useStreamContext } from "@/providers/Stream";
import {
  isTurnAnswer,
  loadRatings,
  MAX_FEEDBACK_CHARS,
  saveRating,
  type Rating,
} from "@/lib/answer-ratings";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { TooltipIconButton } from "../tooltip-icon-button";

const THANKS = "Thanks for your feedback.";
const COMMENT_THANKS = "Thanks, we'll use your comment to improve answers.";
const SAVE_FAILED = "Couldn't save your rating. Please try again.";
const SEND_FAILED = "Couldn't send your comment. Please try again.";

/**
 * Helpful and not helpful under a finished answer. Not helpful saves at once
 * and then offers an optional comment, so closing the box still counts.
 */
export function AnswerRating({
  message,
  isLoading,
}: {
  message: Message;
  isLoading: boolean;
}) {
  const { apiUrl, messages } = useStreamContext();
  const [threadId] = useQueryState("threadId");
  const messageId = message.id;
  const streaming =
    isLoading && messages[messages.length - 1]?.id === messageId;

  if (!threadId || !messageId || streaming) return null;
  if (!isTurnAnswer(messages, messageId)) return null;
  return (
    <RatingControls
      apiUrl={apiUrl}
      threadId={threadId}
      messageId={messageId}
    />
  );
}

function RatingControls({
  apiUrl,
  threadId,
  messageId,
}: {
  apiUrl: string;
  threadId: string;
  messageId: string;
}) {
  const [selected, setSelected] = useState<Rating | null>(null);
  const [commentOpen, setCommentOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const chosen = useRef(false);
  const notHelpfulRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const boxId = useId();
  const countId = useId();

  useEffect(() => {
    let current = true;
    loadRatings(apiUrl, threadId).then((ratings) => {
      // A choice made while this loaded is newer than what it returns.
      if (current && !chosen.current) setSelected(ratings[messageId] ?? null);
    });
    return () => {
      current = false;
    };
  }, [apiUrl, threadId, messageId]);

  useEffect(() => {
    if (commentOpen) boxRef.current?.focus();
  }, [commentOpen]);

  const closeComment = () => {
    setCommentOpen(false);
    setComment("");
    notHelpfulRef.current?.focus();
  };

  // aria-disabled rather than disabled while saving, so a keyboard user keeps
  // focus on the button they pressed.
  const rate = async (rating: Rating) => {
    if (saving) return;
    if (rating === selected) {
      if (rating === "not_helpful") setCommentOpen(true);
      return;
    }
    const previous = selected;
    chosen.current = true;
    setSelected(rating);
    setStatus("");
    setSaving(true);
    const saved = await saveRating(apiUrl, threadId, messageId, rating);
    setSaving(false);
    if (!saved) {
      setSelected(previous);
      setStatus(SAVE_FAILED);
      return;
    }
    setCommentOpen(rating === "not_helpful");
    if (rating === "helpful") {
      setComment("");
      setStatus(THANKS);
    }
  };

  const sendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const text = comment.trim();
    if (!text) {
      closeComment();
      return;
    }
    setSaving(true);
    const saved = await saveRating(
      apiUrl,
      threadId,
      messageId,
      "not_helpful",
      text,
    );
    setSaving(false);
    if (!saved) {
      setStatus(SEND_FAILED);
      return;
    }
    closeComment();
    setStatus(COMMENT_THANKS);
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        role="group"
        aria-label="Rate this answer"
        className="flex items-center gap-1"
      >
        <TooltipIconButton
          tooltip="Helpful"
          aria-pressed={selected === "helpful"}
          aria-disabled={saving}
          onClick={() => rate("helpful")}
          className="[@media(hover:none)]:size-11"
        >
          <ThumbsUp
            aria-hidden="true"
            className={cn(selected === "helpful" && "fill-current")}
          />
        </TooltipIconButton>
        <TooltipIconButton
          ref={notHelpfulRef}
          tooltip="Not helpful"
          aria-pressed={selected === "not_helpful"}
          aria-expanded={selected === "not_helpful" ? commentOpen : undefined}
          aria-disabled={saving}
          onClick={() => rate("not_helpful")}
          className="[@media(hover:none)]:size-11"
        >
          <ThumbsDown
            aria-hidden="true"
            className={cn(selected === "not_helpful" && "fill-current")}
          />
        </TooltipIconButton>
        <p
          role="status"
          className="text-muted-foreground ml-2 text-sm"
        >
          {status}
        </p>
      </div>
      {commentOpen && (
        <form
          onSubmit={sendComment}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              closeComment();
            }
          }}
          className="flex max-w-xl flex-col gap-2"
        >
          <label
            htmlFor={boxId}
            className="text-sm font-medium"
          >
            What was wrong? (optional)
          </label>
          <Textarea
            ref={boxRef}
            id={boxId}
            value={comment}
            maxLength={MAX_FEEDBACK_CHARS}
            aria-describedby={countId}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
          />
          <div className="flex items-center gap-2">
            <Button
              type="submit"
              size="sm"
              aria-disabled={saving}
            >
              Send
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={closeComment}
            >
              Skip
            </Button>
            <span
              id={countId}
              className="text-muted-foreground ml-auto text-xs"
            >
              {comment.length}/{MAX_FEEDBACK_CHARS} characters
            </span>
          </div>
        </form>
      )}
    </div>
  );
}
