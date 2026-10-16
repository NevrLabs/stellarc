import { Grip, Sparkles, X } from "lucide-react";
import { type PointerEvent, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Message, MessageContent, MessageGroup } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { getApiUrl } from "@/fetchers/get-api-url";
import useGetAiSettings from "@/hooks/queries/ai/use-get-ai-settings";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import {
  clampAiChatSize,
  DEFAULT_AI_CHAT_SIZE,
  parseAiChatSize,
} from "@/lib/ai-chat-size";

type ChatEntry = { id: string; role: "user" | "assistant"; text: string };

export function describeAiActions(actions?: Array<{ type: string }>) {
  return actions
    ?.map((action) => {
      if (action.type === "assign_task") return "Ticket assignment updated.";
      if (action.type === "create_task") return "Ticket created.";
      return "Ticket label added.";
    })
    .join(" ");
}

/** Entries are append-only, so a creation-time id is a stable React key. */
const entryId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

export function AiChatBubble() {
  const { data: organization } = useActiveOrganization();
  const { data: settings } = useGetAiSettings(organization?.id);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [history, setHistory] = useState<ChatEntry[]>([]);

  const storageKey = organization?.id
    ? `kaneo:ai-chat-size:${organization.id}`
    : null;
  const [size, setSize] = useState(DEFAULT_AI_CHAT_SIZE);

  // Drag listeners are registered imperatively in startResize. Without an
  // unmount cleanup they outlive the component whenever it disappears
  // mid-drag (organization switch, navigation), keeping the handle alive.
  const dragCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => dragCleanup.current?.(), []);

  useEffect(() => {
    if (!storageKey) {
      return;
    }
    const saved = parseAiChatSize(window.localStorage.getItem(storageKey));
    setSize(
      clampAiChatSize(saved ?? DEFAULT_AI_CHAT_SIZE, {
        width: window.innerWidth,
        height: window.innerHeight,
      }),
    );
  }, [storageKey]);

  const startResize = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const start = { x: event.clientX, y: event.clientY, size };
    const controller = new AbortController();

    // Pointer events fire faster than frames; committing each one re-renders
    // the whole panel (including chat history) several times per frame.
    // Coalesce to one setSize per animation frame.
    let frame = 0;
    let latest = start.size;

    const move = (moveEvent: globalThis.PointerEvent) => {
      latest = clampAiChatSize(
        {
          width: start.size.width + start.x - moveEvent.clientX,
          height: start.size.height + start.y - moveEvent.clientY,
        },
        { width: window.innerWidth, height: window.innerHeight },
      );
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setSize(latest);
      });
    };

    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      controller.abort();
      dragCleanup.current = null;
      setSize(latest);
      if (storageKey) {
        window.localStorage.setItem(storageKey, JSON.stringify(latest));
      }
    };

    const { signal } = controller;
    handle.addEventListener("pointermove", move, { signal });
    handle.addEventListener("pointerup", stop, { signal });
    handle.addEventListener("pointercancel", stop, { signal });

    dragCleanup.current = () => {
      if (frame) cancelAnimationFrame(frame);
      controller.abort();
    };
  };

  if (!organization || !settings?.enabled || !settings.configured) return null;
  const over = message.length > settings.effectiveCharacterLimit;

  const send = async () => {
    const text = message.trim();
    if (!text || over || pending) return;
    setMessage("");
    setHistory((old) => [...old, { id: entryId(), role: "user", text }]);
    setPending(true);
    try {
      const taskId = window.location.pathname.match(/\/task\/([^/]+)/)?.[1];
      const response = await fetch(
        getApiUrl(`/ai/organization/${organization.id}/chat`),
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, taskId }),
        },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "AI request failed");
      const actionText = describeAiActions(
        payload.actions as Array<{ type: string }> | undefined,
      );
      setHistory((old) => [
        ...old,
        {
          id: entryId(),
          role: "assistant",
          text: [payload.message, actionText].filter(Boolean).join("\n"),
        },
      ]);
    } catch (error) {
      setHistory((old) => [
        ...old,
        {
          id: entryId(),
          role: "assistant",
          text: error instanceof Error ? error.message : "AI request failed",
        },
      ]);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open ? (
        <section
          className="relative flex max-h-[calc(100vh-2.5rem)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl max-sm:h-[calc(100vh-2.5rem)] max-sm:w-[calc(100vw-2rem)]"
          aria-label="Organization AI assistant"
          data-testid="ai-chat-panel"
          style={{ width: size.width, height: size.height }}
        >
          <Button
            aria-label="Resize AI assistant"
            className="absolute left-0 top-0 z-10 size-7 cursor-nwse-resize touch-none rounded-br-md text-muted-foreground max-sm:hidden"
            data-testid="ai-chat-resize-handle"
            onPointerDown={startResize}
            size="icon"
            variant="ghost"
          >
            <Grip className="size-3.5 rotate-90" />
          </Button>
          <header className="flex items-center justify-between border-b p-3">
            <div className="flex items-center gap-2 pl-5 font-medium">
              <Sparkles className="size-4" /> {organization.name} AI
              <Badge variant="warning" size="sm">
                Alpha
              </Badge>
            </div>
            <Button
              aria-label="Close organization AI assistant"
              onClick={() => setOpen(false)}
              size="icon"
              variant="ghost"
            >
              <X className="size-4" />
            </Button>
          </header>
          <MessageScrollerProvider autoScroll>
            <MessageScroller
              className="min-h-0 flex-1"
              data-testid="ai-chat-history"
            >
              <MessageScrollerViewport className="p-3">
                <MessageScrollerContent>
                  {history.length === 0 && !pending && (
                    <p className="text-sm text-muted-foreground">
                      Ask about this organization or tell me to assign a task or
                      add a label.
                    </p>
                  )}
                  <MessageGroup>
                    {history.map((entry) => (
                      <MessageScrollerItem
                        key={entry.id}
                        messageId={entry.id}
                        scrollAnchor
                      >
                        <Message
                          align={entry.role === "user" ? "end" : "start"}
                        >
                          <MessageContent>
                            <Bubble
                              align={entry.role === "user" ? "end" : "start"}
                              variant={
                                entry.role === "user" ? "default" : "muted"
                              }
                            >
                              <BubbleContent
                                className={
                                  entry.role === "assistant"
                                    ? "typeset typeset-chat whitespace-pre-wrap"
                                    : "whitespace-pre-wrap"
                                }
                              >
                                {entry.text}
                              </BubbleContent>
                            </Bubble>
                          </MessageContent>
                        </Message>
                      </MessageScrollerItem>
                    ))}
                  </MessageGroup>
                  {pending && (
                    <MessageScrollerItem messageId="pending" scrollAnchor>
                      <Message align="start">
                        <MessageContent>
                          <Bubble variant="muted">
                            <BubbleContent>Thinking…</BubbleContent>
                          </Bubble>
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                  )}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton
                aria-label="Jump to latest message"
                data-testid="ai-chat-jump-latest"
              />
            </MessageScroller>
          </MessageScrollerProvider>
          <div className="border-t p-3">
            <textarea
              aria-label="Message organization AI assistant"
              className="min-h-20 w-full resize-none rounded-md border bg-background p-2 text-sm"
              maxLength={settings.effectiveCharacterLimit + 1}
              onChange={(e) => setMessage(e.target.value)}
              value={message}
            />
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span className={over ? "text-destructive" : ""}>
                {message.length}/{settings.effectiveCharacterLimit}
              </span>
              <Button
                disabled={!message.trim() || over || pending}
                onClick={() => void send()}
                size="sm"
              >
                Send
              </Button>
            </div>
          </div>
        </section>
      ) : (
        <Button
          aria-label="Open organization AI assistant"
          className="size-12 rounded-full shadow-lg"
          onClick={() => setOpen(true)}
          size="icon"
        >
          <Sparkles className="size-5" />
        </Button>
      )}
    </div>
  );
}

export default AiChatBubble;
