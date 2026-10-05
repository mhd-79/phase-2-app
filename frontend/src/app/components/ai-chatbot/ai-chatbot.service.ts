import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment';

export interface ChatTurn { role: 'user' | 'assistant'; content: string; }

export interface ChatLink { label: string; route: string; tab: string | null; }

export interface ChatReply {
  answer: string;
  sources: string[];
  links?: ChatLink[];
  topics: string[];
  llm_used: boolean;
  model: string;
  as_of: string | null;
  warning: string | null;
}

export interface Subscription {
  state: 'none' | 'active' | 'expired';
  started_at: string | null;
  expires_at: string | null;
  days_left: number | null;
  period_days: number;
}

export interface ChatbotStatus {
  enabled: boolean;
  subscription?: Subscription;
  model?: string;
  ollama_reachable?: boolean;
  model_available?: boolean;
}

/** The server rejected the stored login (401). The UI offers a "Sign in again" action for this error. */
export class ChatAuthError extends Error {
  readonly code = 'auth';
}

/** The add-on is not active (never subscribed, removed or expired). The UI shows the subscribe / renew view. */
export class SubscriptionRequiredError extends Error {
  readonly code = 'subscription';
}

/** API client for the OKUTO IQ chatbot. Self-contained so the module can be removed without touching ApiService. */
@Injectable({ providedIn: 'root' })
export class AiChatbotService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private baseUrl = `${environment.apiUrl}/ai-chatbot`;

  private headers(): HttpHeaders {
    const token = this.auth.token();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  /** Shared by the chat panel and the Store Settings card so both always show the same subscription. */
  readonly status = signal<ChatbotStatus | null>(null);
  readonly subscription = signal<Subscription | null>(null);

  getStatus(): Promise<ChatbotStatus> {
    return firstValueFrom(this.http.get<ChatbotStatus>(`${this.baseUrl}/status`, { headers: this.headers() }));
  }

  /** Reloads status + subscription into the shared signals. Throws the HTTP error so callers can decide what it means. */
  async refresh(): Promise<ChatbotStatus> {
    const s = await this.getStatus();
    this.status.set(s);
    if (s.subscription) this.subscription.set(s.subscription);
    return s;
  }

  /** Activate OKUTO IQ, or renew it. (No payment step yet: a gateway would plug in here.) */
  async activate(): Promise<Subscription> {
    return this.changeSubscription(() => this.http.post<Subscription>(`${this.baseUrl}/subscription`, {}, { headers: this.headers() }));
  }

  /** Plug OKUTO IQ out. Only the add-on is switched off; no other feature or data is touched. */
  async removeSubscription(): Promise<Subscription> {
    return this.changeSubscription(() => this.http.delete<Subscription>(`${this.baseUrl}/subscription`, { headers: this.headers() }));
  }

  private async changeSubscription(call: () => import('rxjs').Observable<Subscription>): Promise<Subscription> {
    try {
      const sub = await firstValueFrom(call());
      this.subscription.set(sub);
      this.status.update(s => (s ? { ...s, subscription: sub } : s));
      return sub;
    } catch (err: any) {
      const status: number = err?.status ?? 0;
      const detail: string | null = typeof err?.error?.detail === 'string' ? err.error.detail : null;
      if (!status) throw new Error('Cannot reach the server. Check your connection and that the backend is running.');
      if (status === 401) throw new ChatAuthError('Your login is no longer valid. Please sign out and sign in again.');
      if (status === 403) throw new Error('Only a Phase 2 Admin can manage OKUTO IQ.');
      throw new Error(detail || 'The OKUTO IQ subscription could not be changed. Please try again.');
    }
  }

  async ask(message: string, history: ChatTurn[]): Promise<ChatReply> {
    try {
      return await firstValueFrom(this.http.post<ChatReply>(`${this.baseUrl}/chat`, { message, history }, { headers: this.headers() }));
    } catch (err: any) {
      const status: number = err?.status ?? 0;
      const detail: string | null = err?.error && typeof err.error === 'object' && typeof err.error.detail === 'string' ? err.error.detail : null;
      if (!status) throw new Error('Cannot reach the server. Check your connection and that the backend is running.');
      if (status === 401) {
        const offline = (this.auth.token() || '').startsWith('offline-token-');
        throw new ChatAuthError(offline
          ? 'You signed in while the server was unreachable, so this login is not valid for the server. Please sign out and sign in again.'
          : 'Your login is no longer valid. Please sign out and sign in again.');
      }
      if (status === 403) throw new Error('OKUTO IQ is available to Phase 2 Admins only.');
      if (status === 402) {
        this.refresh().catch(() => {});          // pick up the real state (none / expired) for the subscribe / renew view
        throw new SubscriptionRequiredError(detail || 'OKUTO IQ needs an active subscription.');
      }
      throw new Error(detail || 'OKUTO IQ could not answer right now. Please try again.');
    }
  }
}
