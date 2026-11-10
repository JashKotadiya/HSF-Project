import { MESSAGE_LIMIT, mergeMessages, messageCursor } from "@/lib/messaging";
import type { Conversation, Message, MessageCursor, MessagingAPI } from "@/lib/messaging";

type Outgoing = { clientId: string; body: string; state: "sending" | "failed" };
export type ConversationState = {
  status: "loading" | "ready" | "error";
  conversation: Conversation | null;
  messages: Message[];
  hasOlder: boolean;
  loadingOlder: boolean;
  refreshing: boolean;
  draft: string;
  outgoing: Outgoing[];
  error: string | null;
  readError: boolean;
};
type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Couldn't load messages. Please try again.";

/** One store per account and application. Obsolete requests cannot update a new view. */
export class ConversationStore {
  private state: ConversationState = {
    status: "loading",
    conversation: null,
    messages: [],
    hasOlder: false,
    loadingOlder: false,
    refreshing: false,
    draft: "",
    outgoing: [],
    error: null,
    readError: false,
  };
  private listeners = new Set<() => void>();
  private generation = 0;
  private active = false;
  private sending = new Set<string>();
  private refreshing = false;
  private reading = false;
  private lastReadId: string | null = null;
  private oldestFetched: MessageCursor | null = null;
  private readonly key: string;

  constructor(
    private readonly userId: string,
    private readonly applicationId: string,
    private readonly api: MessagingAPI,
    private readonly storage: DraftStorage | null,
    private readonly createId: () => string,
    private readonly onRead: () => void = () => {},
    private readonly isVisible: () => boolean = () => true,
  ) {
    this.key = `hsf-message-draft:${userId}:${applicationId}`;
  }

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private patch(update: Partial<ConversationState>) {
    this.state = { ...this.state, ...update };
    this.listeners.forEach((listener) => listener());
  }
  private current(generation: number) {
    return this.active && generation === this.generation;
  }
  private persist() {
    try {
      if (!this.state.draft && !this.state.outgoing.length) this.storage?.removeItem(this.key);
      else this.storage?.setItem(this.key, JSON.stringify({ draft: this.state.draft, outgoing: this.state.outgoing }));
    } catch {
      /* Drafts still remain in memory if browser storage is unavailable. */
    }
  }
  private restore() {
    try {
      const saved = JSON.parse(this.storage?.getItem(this.key) ?? "null");
      if (!saved) return;
      this.patch({
        draft: typeof saved.draft === "string" ? saved.draft : "",
        outgoing: Array.isArray(saved.outgoing)
          ? saved.outgoing
              .filter(
                (item: Outgoing) =>
                  typeof item?.clientId === "string" &&
                  typeof item.body === "string" &&
                  item.body.trim() &&
                  item.body.length <= MESSAGE_LIMIT,
              )
              .map((item: Outgoing) => ({ ...item, state: "failed" as const }))
          : [],
      });
    } catch {
      /* Ignore invalid stored data. */
    }
  }

  async start() {
    this.active = true;
    const generation = ++this.generation;
    this.refreshing = false;
    this.reading = false;
    this.sending.clear();
    this.lastReadId = null;
    this.oldestFetched = null;
    this.restore();
    this.patch({ status: "loading", error: null });
    try {
      const conversation = await this.api.open(this.applicationId);
      if (!this.current(generation)) return;
      const page = conversation.id
        ? await this.api.history(conversation.id)
        : { messages: [], has_more: false };
      if (!this.current(generation)) return;
      this.patch({
        status: "ready",
        conversation,
        messages: mergeMessages([], page.messages),
        hasOlder: page.has_more,
      });
      this.oldestFetched = page.messages[0] ? messageCursor(page.messages[0]) : null;
      this.reconcile();
      await this.markRead();
    } catch (error) {
      if (this.current(generation)) this.patch({ status: "error", error: errorText(error) });
    }
  }
  stop() {
    this.active = false;
    this.generation++;
  }

  setDraft(draft: string) {
    this.patch({ draft });
    this.persist();
  }

  private reconcile() {
    const acknowledged = new Set(
      this.state.messages
        .filter((message) => message.sender_id === this.userId)
        .map((message) => message.client_id),
    );
    this.patch({ outgoing: this.state.outgoing.filter((item) => !acknowledged.has(item.clientId)) });
    this.persist();
  }

  async send() {
    const body = this.state.draft.trim();
    if (!this.active || !this.state.conversation?.can_send || this.sending.size || !body || body.length > MESSAGE_LIMIT)
      return;
    const outgoing: Outgoing = { clientId: this.createId(), body, state: "sending" };
    this.patch({ draft: "", outgoing: [...this.state.outgoing, outgoing], error: null });
    this.persist();
    await this.deliver(outgoing);
  }

  async retry(clientId: string) {
    const item = this.state.outgoing.find((item) => item.clientId === clientId);
    if (!item || !this.active || !this.state.conversation?.can_send || this.sending.size) return;
    this.patch({
      outgoing: this.state.outgoing.map((value) =>
        value.clientId === clientId ? { ...value, state: "sending" } : value,
      ),
    });
    this.persist();
    await this.deliver(item);
  }

  private async deliver(item: Outgoing) {
    const generation = this.generation;
    this.sending.add(item.clientId);
    try {
      const sent = await this.api.send(this.applicationId, item.body, item.clientId);
      if (!this.current(generation)) return;
      const conversation = this.state.conversation;
      this.patch({
        conversation: conversation
          ? { ...conversation, id: sent.conversation_id || conversation.id }
          : conversation,
        messages: mergeMessages(this.state.messages, [sent]),
      });
      this.reconcile();
      this.onRead();
    } catch {
      if (this.current(generation)) {
        this.patch({
          outgoing: this.state.outgoing.map((value) =>
            value.clientId === item.clientId ? { ...value, state: "failed" } : value,
          ),
        });
        this.persist();
      }
    } finally {
      if (this.current(generation)) this.sending.delete(item.clientId);
    }
  }

  async loadOlder() {
    const { conversation, hasOlder, loadingOlder } = this.state;
    if (!this.active || !conversation?.id || !this.oldestFetched || !hasOlder || loadingOlder) return;
    const generation = this.generation;
    this.patch({ loadingOlder: true, error: null });
    try {
      // An old failed send can be acknowledged outside the currently loaded
      // history window. It must not move the older-history cursor past a gap.
      const page = await this.api.history(conversation.id, this.oldestFetched);
      if (!this.current(generation)) return;
      if (page.messages[0]) this.oldestFetched = messageCursor(page.messages[0]);
      this.patch({
        messages: mergeMessages(this.state.messages, page.messages),
        hasOlder: page.has_more,
      });
      this.reconcile();
    } catch (error) {
      if (this.current(generation)) this.patch({ error: errorText(error) });
    } finally {
      if (this.current(generation)) this.patch({ loadingOlder: false });
    }
  }

  async refresh() {
    if (!this.active || !this.state.conversation || this.refreshing || this.state.status !== "ready") return;
    const generation = this.generation;
    this.refreshing = true;
    this.patch({ refreshing: true });
    try {
      const conversation = await this.api.open(this.applicationId);
      if (!this.current(generation)) return;
      this.patch({ conversation });
      if (!conversation.id) {
        this.patch({ messages: [], hasOlder: false, error: null });
        return;
      }

      const knownIds = new Set(this.state.messages.map((message) => message.id));
      let before: MessageCursor | null = null;
      let firstPage = true;
      for (let pageNumber = 0; pageNumber < 20; pageNumber++) {
        const page = await this.api.history(conversation.id, before);
        if (!this.current(generation)) return;
        this.patch({ messages: mergeMessages(this.state.messages, page.messages) });
        this.reconcile();
        if (firstPage) {
          firstPage = false;
          if (knownIds.size === 0) this.patch({ hasOlder: page.has_more });
        }
        const overlap = page.messages.some((message) => knownIds.has(message.id));
        if (knownIds.size === 0 || overlap || !page.has_more || page.messages.length === 0) break;
        before = messageCursor(page.messages[0]);
      }
      this.patch({ error: null });
      await this.markRead();
    } catch (error) {
      if (this.current(generation)) this.patch({ error: errorText(error) });
    } finally {
      if (this.current(generation)) {
        this.refreshing = false;
        this.patch({ refreshing: false });
      }
    }
  }

  async markRead() {
    const conversation = this.state.conversation;
    const latest = this.state.messages.at(-1);
    if (
      !this.active ||
      !conversation?.id ||
      !latest ||
      this.reading ||
      !this.isVisible() ||
      latest.id === this.lastReadId
    ) {
      return;
    }
    const generation = this.generation;
    this.reading = true;
    try {
      await this.api.read(conversation.id, latest.id);
      if (!this.current(generation)) return;
      this.lastReadId = latest.id;
      this.patch({ readError: false });
      this.onRead();
    } catch {
      if (this.current(generation)) this.patch({ readError: true });
    } finally {
      if (this.current(generation)) this.reading = false;
    }
  }
}
