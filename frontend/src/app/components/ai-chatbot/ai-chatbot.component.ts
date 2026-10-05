import { Component, ElementRef, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { AiChatbotService, ChatAuthError, ChatLink, ChatTurn, SubscriptionRequiredError } from './ai-chatbot.service';
import { environment } from '../../../environments/environment';

interface Span { text: string; bold: boolean; }
interface Line { bullet: boolean; spans: Span[]; }
interface Msg {
  role: 'user' | 'assistant';
  text: string;
  lines: Line[];
  sources?: string[];
  links?: ChatLink[];
  warning?: string | null;
  error?: boolean;
  authError?: boolean;
}

const SUGGESTIONS = [
  'How are sales this week?',
  'Which items are low on stock and how much should I reorder?',
  'Which products are trending and which are slow-moving?',
  'Which vendor is the best and who is cheapest?',
  'What is the sales forecast for the next 7 days?',
  'Give me an overall business summary'
];

const WELCOME = "Hi, I'm OKUTO IQ. Ask me about sales, stock, vendors, forecasts, discounts or customers. I answer from your live data and the AI Insights engine.";

/** Floating OKUTO IQ assistant. Visible only to Phase 2 Admins and only while the module is enabled. */
@Component({
  selector: 'app-ai-chatbot',
  standalone: true,
  styles: [`
    .iq-fab { position:fixed; right:var(--space-5); bottom:var(--space-5); z-index:90; width:56px; height:56px; border-radius:50%;
      border:none; background:var(--primary); color:var(--text-on-primary); box-shadow:var(--shadow-lg); cursor:pointer;
      display:flex; align-items:center; justify-content:center; transition:transform .15s, background .15s; }
    .iq-fab:hover { background:var(--primary-hover); transform:scale(1.05); }
    .iq-fab:focus-visible { outline:3px solid var(--primary-border); outline-offset:2px; }
    .iq-panel { position:fixed; right:var(--space-5); bottom:var(--space-5); z-index:91; width:400px; max-width:calc(100vw - 2 * var(--space-4));
      height:min(640px, calc(100vh - 2 * var(--space-5))); background:var(--surface); border:1px solid var(--border);
      border-radius:var(--radius-lg); box-shadow:var(--shadow-lg); display:flex; flex-direction:column; overflow:hidden; }
    .iq-head { display:flex; align-items:center; gap:var(--space-3); padding:var(--space-3) var(--space-4);
      background:var(--primary); color:var(--text-on-primary); }
    .iq-head .title { font-weight:700; line-height:1.2; }
    .iq-head .sub { font-size:var(--text-xs); opacity:.9; display:flex; align-items:center; gap:6px; }
    .iq-dot { width:8px; height:8px; border-radius:50%; background:var(--warning-500); display:inline-block; }
    .iq-dot.on { background:#34d399; }
    .iq-head .grow { flex:1; min-width:0; }
    .iq-head .icon-btn { background:transparent; border-color:transparent; color:#fff; width:32px; height:32px; min-width:32px; }
    .iq-head .icon-btn:hover { background:rgba(255,255,255,.18); color:#fff; }
    .iq-body { flex:1; overflow-y:auto; padding:var(--space-4); background:var(--surface-alt); display:flex; flex-direction:column; gap:var(--space-3); }
    .iq-msg { max-width:88%; padding:var(--space-3) var(--space-4); border-radius:var(--radius-md); font-size:var(--text-sm);
      line-height:1.5; overflow-wrap:anywhere; box-shadow:var(--shadow-xs); }
    .iq-msg.user { align-self:flex-end; background:var(--primary); color:var(--text-on-primary); border-bottom-right-radius:2px; white-space:pre-wrap; }
    .iq-msg.assistant { align-self:flex-start; background:var(--surface); border:1px solid var(--border); border-bottom-left-radius:2px; }
    .iq-msg.error { background:var(--danger-50); border-color:var(--danger-500); color:var(--danger-700); }
    .iq-line { margin:0 0 4px; }
    .iq-line:last-child { margin-bottom:0; }
    .iq-line.bullet { padding-left:14px; position:relative; }
    .iq-line.bullet::before { content:'•'; position:absolute; left:2px; color:var(--text-muted); }
    .iq-warn { margin-top:var(--space-2); padding:6px 8px; border-radius:var(--radius-sm); background:var(--warning-50);
      border:1px solid var(--warning-500); color:var(--warning-700); font-size:var(--text-xs); }
    .iq-src { margin-top:var(--space-2); display:flex; flex-wrap:wrap; gap:4px; align-items:center; font-size:var(--text-xs); color:var(--text-muted); }
    .iq-src span.tag { border:1px solid var(--border); background:var(--slate-50); border-radius:999px; padding:1px 8px; }
    .iq-src .tag-link { cursor:pointer; font:inherit; color:var(--primary); border-color:var(--primary-border); background:var(--primary-subtle); }
    .iq-src .tag-link:hover { background:var(--primary); color:var(--text-on-primary); border-color:var(--primary); }
    .iq-src .tag-link:focus-visible { outline:2px solid var(--primary-border); outline-offset:1px; }
    .iq-fab .iq-lock { position:absolute; top:-2px; right:-2px; width:20px; height:20px; border-radius:50%; background:var(--warning-500);
      color:#fff; display:flex; align-items:center; justify-content:center; border:2px solid var(--surface); }
    .iq-locked { flex:1; overflow-y:auto; padding:var(--space-6) var(--space-5); background:var(--surface-alt); display:flex; flex-direction:column;
      align-items:center; text-align:center; gap:var(--space-3); }
    .iq-locked .ico { width:56px; height:56px; border-radius:50%; background:var(--primary-subtle); color:var(--primary);
      display:flex; align-items:center; justify-content:center; }
    .iq-locked h3 { margin:0; }
    .iq-locked p { margin:0; color:var(--text-muted); font-size:var(--text-sm); line-height:1.5; }
    .iq-locked ul { margin:0; padding:0; list-style:none; text-align:left; font-size:var(--text-sm); color:var(--text); display:flex; flex-direction:column; gap:6px; }
    .iq-locked ul li::before { content:'✓'; color:var(--success-700); font-weight:700; margin-right:8px; }
    .iq-locked .err { color:var(--danger-700); font-size:var(--text-xs); }
    .iq-chips { display:flex; flex-direction:column; gap:6px; }
    .iq-chip { text-align:left; border:1px solid var(--border); background:var(--surface); color:var(--text); border-radius:var(--radius-md);
      padding:8px 12px; font-size:var(--text-sm); cursor:pointer; font-family:inherit; }
    .iq-chip:hover { background:var(--primary-subtle); border-color:var(--primary-border); }
    .iq-typing { align-self:flex-start; display:flex; gap:4px; padding:12px 14px; background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-md); }
    .iq-typing i { width:7px; height:7px; border-radius:50%; background:var(--slate-400); animation:iq-bounce 1.2s infinite ease-in-out; }
    .iq-typing i:nth-child(2) { animation-delay:.15s; } .iq-typing i:nth-child(3) { animation-delay:.3s; }
    @keyframes iq-bounce { 0%,60%,100% { transform:translateY(0); opacity:.5; } 30% { transform:translateY(-4px); opacity:1; } }
    .iq-foot { display:flex; gap:var(--space-2); align-items:flex-end; padding:var(--space-3); border-top:1px solid var(--border); background:var(--surface); }
    .iq-foot textarea { flex:1; resize:none; max-height:96px; min-height:40px; border:1px solid var(--border-strong); border-radius:var(--radius-md);
      padding:9px 12px; font:inherit; font-size:var(--text-sm); background:var(--surface); color:var(--text); }
    .iq-foot textarea:focus { outline:2px solid var(--primary-border); border-color:var(--primary); }
    .iq-foot .btn { min-height:40px; }
    @media (max-width: 900px) {
      /* the sidebar becomes a bottom navigation strip on tablet / mobile: keep the button above it */
      .iq-fab { bottom:84px; right:var(--space-4); }
    }
    @media (max-width: 560px) {
      .iq-panel { inset:var(--space-2); width:auto; max-width:none; height:auto; }
    }
    @media (prefers-reduced-motion: reduce) { .iq-typing i, .iq-fab { animation:none; transition:none; } }
  `],
  template: `
    @if (visible()) {
      @if (!open()) {
        <button class="iq-fab" type="button" title="Ask OKUTO IQ" aria-label="Open OKUTO IQ assistant" (click)="toggle()">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4L12 3z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z"/>
          </svg>
          @if (locked()) {
            <span class="iq-lock" title="Subscription needed" aria-hidden="true">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>
            </span>
          }
        </button>
      } @else {
        <section class="iq-panel" role="dialog" aria-label="OKUTO IQ assistant" (keydown.escape)="open.set(false)">
          <header class="iq-head">
            <div class="grow">
              <div class="title">OKUTO IQ</div>
              <div class="sub"><span class="iq-dot" [class.on]="!locked() && aiReady()"></span>{{ headerText() }}</div>
            </div>
            @if (!locked()) {
              <button class="icon-btn" type="button" title="Manage OKUTO IQ subscription" aria-label="Manage OKUTO IQ subscription" (click)="manage()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3h0a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5h0a1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9v0a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>
              </button>
            }
            <button class="icon-btn" type="button" title="New conversation" aria-label="New conversation" (click)="clear()" [disabled]="busy()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12a9 9 0 109-9 9.7 9.7 0 00-6.7 2.8L3 8"/><path d="M3 3v5h5"/></svg>
            </button>
            <button class="icon-btn" type="button" title="Close" aria-label="Close" (click)="open.set(false)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </header>

          @if (locked()) {
            <div class="iq-locked">
              <div class="ico">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>
              </div>
              @if (subState() === 'expired') {
                <h3>Your OKUTO IQ subscription has expired</h3>
                <p>It ended on {{ fmt(subscription()?.expires_at) }}. Renew to ask OKUTO IQ about your sales, stock and vendors again. Your data and other features are not affected.</p>
              } @else {
                <h3>OKUTO IQ is an add-on</h3>
                <p>Please subscribe to start asking OKUTO IQ about your business.</p>
              }
              <ul>
                <li>Answers from your live sales, stock and vendor data</li>
                <li>Runs on a local AI model, so your data stays with you</li>
                <li>Reorder, forecast, vendor and discount guidance</li>
              </ul>
              <button class="btn btn-primary btn-block" type="button" (click)="activate()" [disabled]="subBusy()">
                {{ subBusy() ? 'Please wait…' : (subState() === 'expired' ? 'Renew OKUTO IQ' : 'Activate OKUTO IQ') }}
              </button>
              @if (subError()) { <div class="err" role="alert">{{ subError() }}</div> }
              <p style="font-size:var(--text-xs)">Activates for {{ subscription()?.period_days ?? 30 }} days. Online payment is not available yet.</p>
            </div>
          } @else {
          <div class="iq-body" #scroller aria-live="polite">
            <div class="iq-msg assistant">{{ welcome }}</div>
            @if (messages().length === 0) {
              <div class="iq-chips">
                @for (s of suggestions; track s) {
                  <button class="iq-chip" type="button" (click)="send(s)">{{ s }}</button>
                }
              </div>
            }
            @for (m of messages(); track $index) {
              <div class="iq-msg" [class.user]="m.role === 'user'" [class.assistant]="m.role === 'assistant'" [class.error]="m.error">
                @if (m.role === 'user') {
                  {{ m.text }}
                } @else {
                  @for (l of m.lines; track $index) {
                    <p class="iq-line" [class.bullet]="l.bullet">
                      @for (s of l.spans; track $index) {
                        @if (s.bold) { <strong>{{ s.text }}</strong> } @else { {{ s.text }} }
                      }
                    </p>
                  }
                  @if (m.authError) {
                    <button class="btn btn-primary btn-sm" type="button" style="margin-top:8px" (click)="signInAgain()">Sign in again</button>
                  }
                  @if (m.warning) { <div class="iq-warn">{{ m.warning }}</div> }
                  @if (m.sources?.length) {
                    <div class="iq-src">Based on:
                      @for (s of m.sources; track s) {
                        @if (linkFor(m, s); as l) {
                          <button type="button" class="tag tag-link" [title]="'Open ' + s" (click)="openSource(l)">{{ s }} <span aria-hidden="true">›</span></button>
                        } @else { <span class="tag">{{ s }}</span> }
                      }</div>
                  }
                }
              </div>
            }
            @if (busy()) { <div class="iq-typing" aria-label="OKUTO IQ is thinking"><i></i><i></i><i></i></div> }
          </div>

          <form class="iq-foot" (submit)="$event.preventDefault(); send()">
            <textarea #input rows="1" placeholder="Ask about sales, stock, vendors…" aria-label="Your question" maxlength="1000"
                      [value]="draft()" (input)="draft.set($any($event.target).value)"
                      (keydown.enter)="onEnter($event)" [disabled]="busy()"></textarea>
            <button class="btn btn-primary" type="submit" [disabled]="busy() || !draft().trim()" aria-label="Send">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
            </button>
          </form>
          }
        </section>
      }
    }
  `
})
export class AiChatbotComponent implements OnInit {
  private auth = inject(AuthService);
  private api = inject(AiChatbotService);
  private router = inject(Router);

  @ViewChild('scroller') scroller?: ElementRef<HTMLElement>;
  @ViewChild('input') input?: ElementRef<HTMLTextAreaElement>;

  readonly welcome = WELCOME;
  readonly suggestions = SUGGESTIONS;
  open = signal(false);
  busy = signal(false);
  draft = signal('');
  messages = signal<Msg[]>([]);
  subBusy = signal(false);
  subError = signal('');
  readonly status = this.api.status;
  readonly subscription = this.api.subscription;
  private backendEnabled = signal(true);

  /** Plug-in/plug-out: frontend flag + Phase 2 admin only + backend switch. */
  eligible = computed(() => environment.aiChatbotEnabled && this.auth.isAdmin() && this.auth.hasPhase2());
  visible = computed(() => this.eligible() && this.backendEnabled());
  /** 'unknown' until the server has answered: the chat then stays usable and any problem is explained on the first question. */
  subState = computed(() => this.subscription()?.state ?? 'unknown');
  locked = computed(() => this.subState() === 'none' || this.subState() === 'expired');
  headerText = computed(() => {
    const sub = this.subscription();
    if (sub?.state === 'none') return 'Add-on · subscription needed';
    if (sub?.state === 'expired') return 'Subscription expired';
    return sub?.state === 'active' ? `${this.statusText()} · until ${this.fmt(sub.expires_at)}` : this.statusText();
  });
  aiReady = computed(() => !!this.status()?.ollama_reachable && !!this.status()?.model_available);
  statusText = computed(() => {
    const s = this.status();
    if (!s) return 'Local AI assistant';
    if (!s.ollama_reachable) return 'Local AI offline · showing data only';
    if (!s.model_available) return 'Model not installed · showing data only';
    return `Local AI · ${s.model}`;
  });

  async ngOnInit() {
    if (!this.eligible()) return;
    try {
      const s = await this.api.refresh();
      this.backendEnabled.set(s.enabled);
    } catch (err: any) {
      // Only an explicit "not available" hides the button: an old backend without the module (404) or no permission (403).
      // A network blip or an expired session (401) must not hide it; sending a question then explains what is wrong.
      if (err?.status === 404 || err?.status === 403) this.backendEnabled.set(false);
    }
  }

  toggle() {
    this.open.set(true);
    this.refreshStatus();
    setTimeout(() => this.input?.nativeElement.focus());
  }

  private async refreshStatus() {
    try { await this.api.refresh(); } catch { /* keep the last known status */ }
  }

  fmt(iso?: string | null): string {
    return iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
  }

  /** Activate (or renew) the add-on, then drop straight into the chat. */
  async activate() {
    if (this.subBusy()) return;
    this.subBusy.set(true);
    this.subError.set('');
    try {
      await this.api.activate();
      setTimeout(() => this.input?.nativeElement.focus());
    } catch (err: any) {
      this.subError.set(err?.message || 'Could not activate OKUTO IQ. Please try again.');
    } finally {
      this.subBusy.set(false);
    }
  }

  linkFor(m: Msg, label: string): ChatLink | undefined {
    return m.links?.find(l => l.label === label);
  }

  /** Opens the page that holds the data behind an answer (the chat stays available via the floating button). */
  openSource(l: ChatLink) {
    this.open.set(false);
    this.router.navigate([l.route], l.tab ? { queryParams: { tab: l.tab } } : {});
  }

  /** Subscription settings live on the Store Settings page (the OKUTO IQ card). */
  manage() {
    this.open.set(false);
    this.router.navigate(['/store-settings']);
  }

  /** Same as the sidebar's Logout: drop the stored login and go to the sign-in page. */
  signInAgain() {
    this.open.set(false);
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  clear() {
    this.messages.set([]);
    this.draft.set('');
  }

  onEnter(ev: Event) {
    const e = ev as KeyboardEvent;
    if (e.shiftKey || e.isComposing) return;
    e.preventDefault();
    this.send();
  }

  async send(text?: string) {
    const question = (text ?? this.draft()).trim();
    if (!question || this.busy()) return;
    const history: ChatTurn[] = this.messages().filter(m => !m.error).map(m => ({ role: m.role, content: m.text }));
    this.messages.update(list => [...list, { role: 'user', text: question, lines: [] }]);
    this.draft.set('');
    this.busy.set(true);
    this.scrollDown();
    try {
      const r = await this.api.ask(question, history);
      this.messages.update(list => [...list, {
        role: 'assistant', text: r.answer, lines: this.format(r.answer), sources: r.sources, links: r.links, warning: r.warning
      }]);
      if (r.llm_used === false && r.warning) this.refreshStatus();
    } catch (err: any) {
      if (err instanceof SubscriptionRequiredError) {
        this.messages.update(list => list.slice(0, -1));
        this.draft.set(question);
        return;
      }
      const message = err?.message || 'OKUTO IQ could not answer right now.';
      this.messages.update(list => [...list, {
        role: 'assistant', text: message, lines: this.format(message), error: true, authError: err instanceof ChatAuthError
      }]);
    } finally {
      this.busy.set(false);
      this.scrollDown();
      setTimeout(() => this.input?.nativeElement.focus());
    }
  }

  /** Turns the model's light markdown (bullets, **bold**) into safe, structured lines - never raw HTML. */
  private format(text: string): Line[] {
    return text.split(/\r?\n/).map(l => l.trimEnd()).filter(l => l.trim().length > 0).map(raw => {
      const m = raw.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
      const body = (m ? m[1] : raw.trim()).replace(/^#{1,6}\s+/, '');
      const spans: Span[] = [];
      body.split(/(\*\*[^*]+\*\*)/g).forEach(part => {
        if (!part) return;
        const bold = part.startsWith('**') && part.endsWith('**') && part.length > 4;
        spans.push({ text: (bold ? part.slice(2, -2) : part).replace(/\*\*/g, ''), bold });
      });
      return { bullet: !!m, spans };
    });
  }

  private scrollDown() {
    setTimeout(() => {
      const el = this.scroller?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
}
