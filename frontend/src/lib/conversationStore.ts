import { MESSAGE_LIMIT, mergeMessages } from "@/lib/messaging";
import type { Conversation, Message, MessagingAPI } from "@/lib/messaging";

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
const errorText = (error: unknown) => error instanceof Error ? error.message : "Couldn't load messages. Please try again.";

/** One store per account and application. Obsolete requests cannot update a new view. */
export class ConversationStore {
  private state: ConversationState = {
    status: "loading", conversation: null, messages: [], hasOlder: false, loadingOlder: false,
    refreshing: false, draft: "", outgoing: [], error: null, readError: false,
  };
  private listeners = new Set<() => void>();
  private generation = 0;
  private active = false;
  private sending = new Set<string>();
  private refreshing = false;
  private reading = false;
  private lastRead = "0";
  // Only history responses advance this cursor. A send acknowledgement can
  // arrive ahead of incoming messages that have not been fetched yet.
  private syncedThrough = "0";
  private oldestFetched: string | null = null;
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
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private patch(update: Partial<ConversationState>) {
    this.state = { ...this.state, ...update };
    this.listeners.forEach(listener => listener());
  }
  private current(generation: number) { return this.active && generation === this.generation; }
  private persist() {
    try {
      if (!this.state.draft && !this.state.outgoing.length) this.storage?.removeItem(this.key);
      else this.storage?.setItem(this.key, JSON.stringify({ draft: this.state.draft, outgoing: this.state.outgoing }));
    } catch { /* Drafts still remain in memory if browser storage is unavailable. */ }
  }
  private restore() {
    try {
      const saved = JSON.parse(this.storage?.getItem(this.key) ?? "null");
      if (!saved) return;
      this.patch({
        draft: typeof saved.draft === "string" ? saved.draft : "",
        outgoing: Array.isArray(saved.outgoing) ? saved.outgoing.filter((item: Outgoing) =>
          typeof item?.clientId === "string" && typeof item.body === "string" && item.body.trim() && item.body.length <= MESSAGE_LIMIT,
        ).map((item: Outgoing) => ({ ...item, state: "failed" })) : [],
      });
    } catch { /* Ignore invalid stored data. */ }
  }

  async start() {
    this.active = true;
    const generation = ++this.generation;
    this.refreshing = false;
    this.reading = false;
    this.sending.clear();
    this.syncedThrough = "0";
    this.oldestFetched = null;
    this.restore();
    this.patch({ status: "loading", error: null });
    try {
      const conversation = await this.api.open(this.applicationId);
      if (!this.current(generation)) return;
      const page = await this.api.history(conversation.id);
      if (!this.current(generation)) return;
      this.patch({ status: "ready", conversation, messages: mergeMessages([], page.messages), hasOlder: page.has_more });
      this.syncedThrough = this.state.messages.at(-1)?.sequence ?? "0";
      this.oldestFetched = this.state.messages[0]?.sequence ?? null;
      this.reconcile();
      await this.markRead();
    } catch (error) {
      if (this.current(generation)) this.patch({ status: "error", error: errorText(error) });
    }
  }
  stop() { this.active = false; this.generation++; }

  setDraft(draft: string) {
    this.patch({ draft });
    this.persist();
  }

  private reconcile() {
    const acknowledged = new Set(this.state.messages.filter(message => message.sender_id === this.userId).map(message => message.client_id));
    this.patch({ outgoing: this.state.outgoing.filter(item => !acknowledged.has(item.clientId)) });
    this.persist();
  }

  async send() {
    const body = this.state.draft.trim();
    if (!this.active || !this.state.conversation?.can_send || this.sending.size || !body || body.length > MESSAGE_LIMIT) return;
    const outgoing: Outgoing = { clientId: this.createId(), body, state: "sending" };
    this.patch({ draft: "", outgoing: [...this.state.outgoing, outgoing], error: null });
    this.persist();
    await this.deliver(outgoing);
  }

  async retry(clientId: string) {
    const item = this.state.outgoing.find(item => item.clientId === clientId);
    if (!item || !this.active || !this.state.conversation?.can_send || this.sending.size) return;
    this.patch({ outgoing: this.state.outgoing.map(value => value.clientId === clientId ? { ...value, state: "sending" } : value) });
    this.persist();
    await this.deliver(item);
  }

  private async deliver(item: Outgoing) {
    const generation = this.generation;
    const conversation = this.state.conversation!;
    this.sending.add(item.clientId);
    try {
      const sent = await this.api.send(conversation.id, item.body, item.clientId);
      if (!this.current(generation)) return;
      this.patch({ messages: mergeMessages(this.state.messages, [sent]) });
      this.reconcile();
      this.onRead();
    } catch {
      if (this.current(generation)) {
        this.patch({ outgoing: this.state.outgoing.map(value => value.clientId === item.clientId ? { ...value, state: "failed" } : value) });
        this.persist();
      }
    } finally {
      if (this.current(generation)) this.sending.delete(item.clientId);
    }
  }

  async loadOlder() {
    const { conversation, hasOlder, loadingOlder } = this.state;
    if (!this.active || !conversation || !this.oldestFetched || !hasOlder || loadingOlder) return;
    const generation = this.generation;
    this.patch({ loadingOlder: true, error: null });
    try {
      // An old failed send can be acknowledged outside the currently loaded
      // history window. It must not move the older-history cursor past a gap.
      const page = await this.api.history(conversation.id, this.oldestFetched);
      if (!this.current(generation)) return;
      this.oldestFetched = page.messages[0]?.sequence ?? this.oldestFetched;
      this.patch({ messages: mergeMessages(this.state.messages, page.messages), hasOlder: page.has_more });
      this.reconcile();
    } catch (error) {
      if (this.current(generation)) this.patch({ error: errorText(error) });
    } finally {
      if (this.current(generation)) this.patch({ loadingOlder: false });
    }
  }

  async refresh() {
    const { conversation } = this.state;
    if (!this.active || !conversation || this.refreshing || this.state.status !== "ready") return;
    const generation = this.generation;
    this.refreshing = true;
    this.patch({ refreshing: true });
    try {
      const details = await this.api.details(conversation.id);
      if (!this.current(generation)) return;
      this.patch({ conversation: details });
      // Fetch every page after the last history response, including gaps
      // before locally acknowledged sends.
      let after = this.syncedThrough;
      for (let pageNumber = 0; pageNumber < 20; pageNumber++) {
        const page = await this.api.history(conversation.id, undefined, after);
        if (!this.current(generation)) return;
        this.patch({ messages: mergeMessages(this.state.messages, page.messages) });
        this.reconcile();
        const next = page.messages.at(-1)?.sequence;
        if (next && BigInt(next) > BigInt(after)) this.syncedThrough = next;
        if (!page.has_more || !next || BigInt(next) <= BigInt(after)) break;
        after = next;
      }
      this.patch({ error: null });
      await this.markRead();
    } catch (error) {
      if (this.current(generation)) this.patch({ error: errorText(error) });
    } finally {
      if (this.current(generation)) { this.refreshing = false; this.patch({ refreshing: false }); }
    }
  }

  async markRead() {
    const conversation = this.state.conversation;
    const latest = this.syncedThrough;
    if (!this.active || !conversation || !latest || this.reading || !this.isVisible() || BigInt(latest) <= BigInt(this.lastRead)) return;
    const generation = this.generation;
    this.reading = true;
    try {
      await this.api.read(conversation.id, latest);
      if (!this.current(generation)) return;
      this.lastRead = latest;
      this.patch({ readError: false });
      this.onRead();
    } catch {
      if (this.current(generation)) this.patch({ readError: true });
    } finally {
      if (this.current(generation)) this.reading = false;
    }
  }
}
