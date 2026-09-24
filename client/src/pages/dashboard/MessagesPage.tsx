/**
 * Real-time messaging. Two panes on desktop (inbox + thread), single pane
 * on mobile. Messages are sent over socket.io with an ack (optimistic UI)
 * and fall back to REST when the socket is unavailable.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import clsx from "clsx";
import toast from "react-hot-toast";
import { format, isSameDay, isToday, isYesterday } from "date-fns";
import { AlertCircle, ArrowLeft, Check, CheckCheck, ChevronRight, EyeOff, Loader2, MessageCircle, RotateCcw, Search, Send, ShieldAlert } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { fmtRange, fmtTime } from "@/lib/format";
import { getSocket } from "@/lib/socket";
import type { Message } from "@/lib/types";
import { useAuth } from "@/stores/auth";
import { useSocketEvent } from "@/hooks/useSocketEvent";
import { Seo } from "@/components/Seo";
import { StatusBadge } from "@/components/StatusBadge";
import { Avatar, ButtonLink, EmptyState, Skeleton } from "@/components/ui";
import { ErrorState } from "@/components/dashboard/common";
import type { ConversationDetail, ConversationSummary } from "@/components/dashboard/types";

type LocalMessage = Message & { pending?: boolean; failed?: boolean };
type MessagesPage = { messages: LocalMessage[]; hasMore: boolean };
type MessagesData = InfiniteData<MessagesPage, string | undefined>;

const dayLabel = (d: Date) => (isToday(d) ? "Today" : isYesterday(d) ? "Yesterday" : format(d, "EEE, d MMM yyyy"));
const shortTime = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isToday(d) ? format(d, "h:mm a") : isYesterday(d) ? "Yesterday" : format(d, "d MMM");
};

export default function MessagesPage() {
  const { id } = useParams();
  const [filter, setFilter] = useState("");
  const qc = useQueryClient();

  const convs = useQuery({
    queryKey: ["conversations"],
    queryFn: async () => (await api.get<{ conversations: ConversationSummary[] }>("/chat/conversations")).data.conversations,
  });

  // Keep the inbox fresh when messages arrive for any conversation.
  useSocketEvent<Message>(
    "chat:message",
    useCallback(
      (m) => {
        qc.setQueryData<ConversationSummary[]>(["conversations"], (list) => {
          if (!list) return list;
          const idx = list.findIndex((c) => c.id === m.conversationId);
          if (idx === -1) {
            qc.invalidateQueries({ queryKey: ["conversations"] });
            return list;
          }
          const c = list[idx];
          if (c.lastMessage?.id === m.id) return list;
          const updated: ConversationSummary = { ...c, lastMessage: { id: m.id, body: m.body, senderId: m.senderId, createdAt: m.createdAt, wasMasked: m.wasMasked }, lastMessageAt: m.createdAt, unread: m.conversationId === id || m.senderId !== c.counterparty.id ? c.unread : c.unread + 1 };
          return [updated, ...list.filter((_, i) => i !== idx)];
        });
      },
      [qc, id],
    ),
  );

  const list = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (convs.data ?? []).filter((c) => !f || c.counterparty.name.toLowerCase().includes(f) || c.listing?.title.toLowerCase().includes(f));
  }, [convs.data, filter]);

  return (
    <div>
      <Seo title="Messages" noindex />
      <h1 className={clsx("mb-4 text-2xl font-bold text-slate-900 sm:text-3xl", id && "hidden lg:block")}>Messages</h1>
      <div className="card flex h-[calc(100dvh-13rem)] min-h-[480px] overflow-hidden md:h-[calc(100dvh-11rem)]">
        {/* Inbox */}
        <aside className={clsx("flex w-full flex-col border-r border-slate-100 lg:w-80 lg:shrink-0", id && "hidden lg:flex")}>
          <div className="border-b border-slate-100 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9" placeholder="Search conversations" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Search conversations" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {convs.isLoading ? (
              <div className="space-y-1 p-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex gap-3 p-2">
                    <Skeleton className="h-11 w-11 rounded-full" />
                    <div className="flex-1 space-y-2 py-1">
                      <Skeleton className="h-3 w-1/2" />
                      <Skeleton className="h-3 w-3/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : convs.isError ? (
              <ErrorState error={convs.error} onRetry={() => convs.refetch()} className="m-3" />
            ) : !list.length ? (
              <div className="p-6 text-center text-sm text-slate-500">{filter ? "No matches." : "No conversations yet. Message an owner from any listing page to ask questions before booking."}</div>
            ) : (
              <ul>
                {list.map((c) => (
                  <li key={c.id}>
                    <Link to={`/dashboard/messages/${c.id}`} className={clsx("flex gap-3 border-l-2 px-3 py-3 transition", c.id === id ? "border-brand-600 bg-brand-50/70" : "border-transparent hover:bg-slate-50")}>
                      <div className="relative shrink-0">
                        <Avatar name={c.counterparty.name} src={c.counterparty.avatarUrl} size={44} />
                        {c.listing?.image && <img src={c.listing.image} alt="" className="absolute -bottom-1 -right-1 h-5 w-5 rounded-md object-cover ring-2 ring-white" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className={clsx("truncate text-sm", c.unread ? "font-bold text-slate-900" : "font-semibold text-slate-800")}>{c.counterparty.name}</p>
                          <span className="shrink-0 text-[11px] text-slate-400">{shortTime(c.lastMessageAt)}</span>
                        </div>
                        <p className="truncate text-xs text-slate-500">{c.listing?.title ?? "General enquiry"}</p>
                        <div className="flex items-center justify-between gap-2">
                          <p className={clsx("truncate text-sm", c.unread ? "font-medium text-slate-900" : "text-slate-500")}>
                            {c.lastMessage ? `${c.lastMessage.senderId === c.counterparty.id ? "" : "You: "}${c.lastMessage.body}` : "No messages yet"}
                          </p>
                          {c.unread > 0 && <span className="shrink-0 rounded-full bg-brand-600 px-1.5 text-[11px] font-bold text-white">{c.unread}</span>}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Thread */}
        <section className={clsx("min-w-0 flex-1 flex-col", id ? "flex" : "hidden lg:flex")}>
          {id ? (
            <Thread key={id} id={id} />
          ) : (
            <div className="flex flex-1 items-center justify-center p-6">
              <EmptyState icon={<MessageCircle className="h-6 w-6" />} title="Select a conversation" description="Chat with owners and renters. Keep payments on the platform to stay protected." className="border-none" />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Thread                                                              */
/* ------------------------------------------------------------------ */

function Thread({ id }: { id: string }) {
  const { user } = useAuth();
  const me = user!.id;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const prevHeight = useRef<number | null>(null);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>();
  const lastTypingSent = useRef(0);

  const detail = useQuery({
    queryKey: ["conversation", id],
    queryFn: async () => (await api.get<ConversationDetail>(`/chat/conversations/${id}`)).data,
  });
  const msgs = useInfiniteQuery({
    queryKey: ["messages", id],
    queryFn: async ({ pageParam }) => (await api.get<MessagesPage>(`/chat/conversations/${id}/messages`, { params: { before: pageParam, limit: 40 } })).data,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.messages[0]?.id : undefined),
    staleTime: Infinity,
  });
  const messages = useMemo(() => [...(msgs.data?.pages ?? [])].reverse().flatMap((p) => p.messages), [msgs.data]);

  /** Upsert helper for the messages cache. */
  const mutateMessages = useCallback(
    (fn: (list: LocalMessage[]) => LocalMessage[]) => {
      qc.setQueryData<MessagesData>(["messages", id], (d) => {
        if (!d) return d;
        const pages = [...d.pages];
        pages[0] = { ...pages[0], messages: fn(pages[0].messages) };
        return { ...d, pages };
      });
    },
    [qc, id],
  );

  /* ----- mark read ----- */
  const markRead = useCallback(() => {
    api.post(`/chat/conversations/${id}/read`).then(() => qc.invalidateQueries({ queryKey: ["chat", "unread"] })).catch(() => undefined);
    qc.setQueryData<ConversationSummary[]>(["conversations"], (list) => list?.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
  }, [id, qc]);
  useEffect(() => {
    markRead();
  }, [markRead]);

  /* ----- join/leave the socket room (and re-join after reconnects) ----- */
  useEffect(() => {
    const s = getSocket();
    const join = () => s.emit("chat:join", id);
    if (s.connected) join();
    s.on("connect", join);
    return () => {
      s.off("connect", join);
      s.emit("chat:leave", id);
    };
  }, [id]);

  /* ----- realtime events ----- */
  useSocketEvent<Message>(
    "chat:message",
    useCallback(
      (m) => {
        if (m.conversationId !== id) return;
        mutateMessages((list) => {
          if (list.some((x) => x.id === m.id)) return list;
          // Replace our own optimistic copy if the broadcast beats the ack.
          if (m.senderId === me) {
            const tmp = list.findIndex((x) => x.pending && x.senderId === me);
            if (tmp !== -1) return list.map((x, i) => (i === tmp ? m : x));
          }
          return [...list, m];
        });
        if (m.senderId !== me) {
          setTyping(false);
          if (document.visibilityState === "visible") markRead();
        }
      },
      [id, me, mutateMessages, markRead],
    ),
  );
  useSocketEvent<{ conversationId: string; userId: string }>(
    "chat:typing",
    useCallback(
      (p) => {
        if (p.conversationId !== id || p.userId === me) return;
        setTyping(true);
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setTyping(false), 3500);
      },
      [id, me],
    ),
  );
  useSocketEvent<{ conversationId: string; userId: string; at: string }>(
    "chat:read",
    useCallback(
      (p) => {
        if (p.conversationId !== id || p.userId === me) return;
        mutateMessages((list) => list.map((x) => (x.senderId === me && !x.readAt ? { ...x, readAt: p.at } : x)));
      },
      [id, me, mutateMessages],
    ),
  );
  useEffect(() => () => clearTimeout(typingTimer.current), []);

  /* ----- scrolling ----- */
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (prevHeight.current != null) {
      // Keep position after prepending older messages.
      el.scrollTop = el.scrollHeight - prevHeight.current;
      prevHeight.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, typing]);
  const onScroll = () => {
    const el = scrollRef.current!;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };
  const loadOlder = () => {
    prevHeight.current = scrollRef.current?.scrollHeight ?? null;
    msgs.fetchNextPage();
  };

  /* ----- sending ----- */
  const deliver = useCallback(
    async (tmpId: string, body: string) => {
      const s = getSocket();
      const viaSocket = () =>
        new Promise<Message>((resolve, reject) => {
          if (!s.connected) return reject(new Error("offline"));
          s.timeout(8000).emit("chat:send", { conversationId: id, body }, (err: Error | null, res: { ok: boolean; message?: Message; error?: string }) => {
            if (err) reject(err);
            else if (res?.ok && res.message) resolve(res.message);
            else reject(Object.assign(new Error(res?.error ?? "Couldn't send"), { fatal: true }));
          });
        });
      try {
        let m: Message;
        try {
          m = await viaSocket();
        } catch (err) {
          if ((err as { fatal?: boolean }).fatal) throw err;
          m = (await api.post<{ message: Message }>(`/chat/conversations/${id}/messages`, { body })).data.message;
        }
        mutateMessages((list) => {
          const withoutDup = list.filter((x) => x.id !== m.id);
          return withoutDup.some((x) => x.id === tmpId) ? withoutDup.map((x) => (x.id === tmpId ? m : x)) : [...withoutDup, m];
        });
        qc.setQueryData<ConversationSummary[]>(["conversations"], (list) =>
          list ? [...list.filter((c) => c.id === id).map((c) => ({ ...c, lastMessage: { id: m.id, body: m.body, senderId: m.senderId, createdAt: m.createdAt, wasMasked: m.wasMasked }, lastMessageAt: m.createdAt })), ...list.filter((c) => c.id !== id)] : list,
        );
      } catch (err) {
        mutateMessages((list) => list.map((x) => (x.id === tmpId ? { ...x, pending: false, failed: true } : x)));
        toast.error(err instanceof Error && err.message !== "offline" ? err.message : apiError(err));
      }
    },
    [id, mutateMessages, qc],
  );

  const send = (e?: FormEvent) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body) return;
    const tmpId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimistic: LocalMessage = { id: tmpId, conversationId: id, senderId: me, body, wasMasked: false, attachments: [], readAt: null, createdAt: new Date().toISOString(), pending: true };
    stickToBottom.current = true;
    mutateMessages((list) => [...list, optimistic]);
    setText("");
    void deliver(tmpId, body);
  };
  const retry = (m: LocalMessage) => {
    mutateMessages((list) => list.map((x) => (x.id === m.id ? { ...x, pending: true, failed: false } : x)));
    void deliver(m.id, m.body);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };
  const onType = (v: string) => {
    setText(v);
    const now = Date.now();
    if (v && now - lastTypingSent.current > 2500) {
      lastTypingSent.current = now;
      getSocket().emit("chat:typing", id);
    }
  };

  if (detail.isError) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
      </div>
    );
  }

  const c = detail.data?.conversation;
  const other = c ? (c.viewerRole === "RENTER" ? c.owner : c.renter) : null;
  const bookings = detail.data?.bookings ?? [];
  const lastMineIdx = messages.map((m) => m.senderId).lastIndexOf(me);

  return (
    <>
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-slate-100 px-3 py-2.5 sm:px-4">
        <button onClick={() => navigate("/dashboard/messages")} className="rounded-full p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Back to conversations">
          <ArrowLeft className="h-5 w-5" />
        </button>
        {other ? (
          <>
            <Avatar name={other.name} src={other.avatarUrl} size={40} />
            <div className="min-w-0 flex-1">
              <Link to={`/users/${other.id}`} className="block truncate font-semibold text-slate-900 hover:text-brand-700">{other.name}</Link>
              {c?.listing ? (
                <Link to={`/listing/${c.listing.id}`} className="block truncate text-xs text-slate-500 hover:text-brand-700">{c.listing.title}</Link>
              ) : (
                <span className="text-xs text-slate-500">{c?.viewerRole === "RENTER" ? "Owner" : "Renter"}</span>
              )}
            </div>
            {c?.listing?.images[0] && <img src={c.listing.images[0].thumbUrl} alt="" className="hidden h-10 w-10 rounded-lg object-cover sm:block" />}
          </>
        ) : (
          <div className="flex flex-1 items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
        )}
      </header>

      {/* Related bookings */}
      {bookings.length > 0 && (
        <div className="scrollbar-none flex gap-2 overflow-x-auto border-b border-slate-100 bg-slate-50/70 px-3 py-2">
          {bookings.map((b) => (
            <Link key={b.id} to={`/dashboard/bookings/${b.id}`} className="flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs hover:border-brand-300">
              <StatusBadge status={b.status} />
              <span className="text-slate-600">{fmtRange(b.startAt, b.endAt)}</span>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            </Link>
          ))}
        </div>
      )}

      {/* Contact-sharing banner */}
      {c && !c.contactSharingAllowed && (
        <div className="flex items-start gap-2 border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Phone numbers and emails are hidden until a booking is confirmed. Keep chats and payments on the platform — off-platform deals aren't protected.</p>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto bg-slate-50/50 px-3 py-4 sm:px-5" aria-live="polite">
        {msgs.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className={clsx("h-10 rounded-2xl", i % 2 ? "ml-auto w-1/2" : "w-2/3")} />
            ))}
          </div>
        ) : msgs.isError ? (
          <ErrorState error={msgs.error} onRetry={() => msgs.refetch()} />
        ) : (
          <>
            {msgs.hasNextPage && (
              <div className="mb-4 text-center">
                <button onClick={loadOlder} disabled={msgs.isFetchingNextPage} className="chip text-xs">
                  {msgs.isFetchingNextPage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Load older messages
                </button>
              </div>
            )}
            {!messages.length && (
              <div className="py-10 text-center text-sm text-slate-500">
                Say hello 👋 Ask about availability, condition or pickup — but never share payment details outside the platform.
              </div>
            )}
            <ol className="space-y-1.5">
              {messages.map((m, i) => {
                const mine = m.senderId === me;
                const prev = messages[i - 1];
                const newDay = !prev || !isSameDay(new Date(prev.createdAt), new Date(m.createdAt));
                const grouped = prev && !newDay && prev.senderId === m.senderId;
                return (
                  <li key={m.id}>
                    {newDay && (
                      <div className="my-4 text-center">
                        <span className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200">{dayLabel(new Date(m.createdAt))}</span>
                      </div>
                    )}
                    <div className={clsx("flex", mine ? "justify-end" : "justify-start", !grouped && "mt-3")}>
                      <div className={clsx("max-w-[85%] sm:max-w-[70%]")}>
                        <div
                          className={clsx(
                            "whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                            mine ? "rounded-br-md bg-brand-600 text-white" : "rounded-bl-md bg-white text-slate-800 ring-1 ring-slate-200",
                            m.failed && "bg-red-100 text-red-900 ring-1 ring-red-300",
                            m.pending && "opacity-70",
                          )}
                        >
                          {m.body}
                        </div>
                        {m.wasMasked && (
                          <p className={clsx("mt-0.5 flex items-center gap-1 text-[11px] text-slate-500", mine && "justify-end")}>
                            <EyeOff className="h-3 w-3" /> Contact details were hidden for safety
                          </p>
                        )}
                        <p className={clsx("mt-0.5 flex items-center gap-1 text-[11px] text-slate-400", mine && "justify-end")}>
                          {m.failed ? (
                            <button onClick={() => retry(m)} className="inline-flex items-center gap-1 font-semibold text-red-600">
                              <AlertCircle className="h-3 w-3" /> Not sent · <RotateCcw className="h-3 w-3" /> Retry
                            </button>
                          ) : m.pending ? (
                            "Sending…"
                          ) : (
                            <>
                              {fmtTime(m.createdAt)}
                              {mine && (m.readAt ? <CheckCheck className="h-3.5 w-3.5 text-brand-500" aria-label="Seen" /> : <Check className="h-3.5 w-3.5" aria-label="Sent" />)}
                              {mine && i === lastMineIdx && m.readAt && <span>Seen</span>}
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
            {typing && other && (
              <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                <span className="flex gap-0.5 rounded-2xl bg-white px-3 py-2.5 ring-1 ring-slate-200">
                  {[0, 1, 2].map((d) => <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${d * 150}ms` }} />)}
                </span>
                {other.name.split(" ")[0]} is typing…
              </div>
            )}
          </>
        )}
      </div>

      {/* Composer */}
      <form onSubmit={send} className="flex items-end gap-2 border-t border-slate-100 bg-white p-3">
        <textarea
          value={text}
          onChange={(e) => onType(e.target.value)}
          onKeyDown={onKey}
          rows={1}
          maxLength={2000}
          placeholder="Write a message…"
          className="input max-h-32 min-h-[44px] resize-none"
          aria-label="Message"
          style={{ height: Math.min(128, 44 + Math.max(0, text.split("\n").length - 1) * 20) }}
        />
        <button type="submit" disabled={!text.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white transition hover:bg-brand-700 disabled:opacity-50" aria-label="Send">
          <Send className="h-4 w-4" />
        </button>
      </form>
      {!detail.isLoading && bookings.length === 0 && c?.listing && c.viewerRole === "RENTER" && (
        <div className="border-t border-slate-100 bg-white px-3 pb-3 text-center">
          <ButtonLink to={`/listing/${c.listing.id}`} size="sm" variant="secondary">Check dates & book</ButtonLink>
        </div>
      )}
    </>
  );
}
