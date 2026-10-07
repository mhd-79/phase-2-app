import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ACCESS_MODULES, AuthService, ModulePermissions, PERMISSION_ACTIONS, PermissionAction } from '../../services/auth.service';
import { ApiService } from '../../services/api.service';

interface AccessModule { key: string; label: string; group: string; }

const NONE: ModulePermissions = { view: false, create: false, edit: false, delete: false };
const FULL: ModulePermissions = { view: true, create: true, edit: true, delete: true };
const CASHIER_DEFAULTS = ['billing', 'hold_recall', 'returns'];

/** Admin picks one user of this business and sets, module by module, what that user may View, Create, Edit and Delete. The APIs enforce it too. */
@Component({
  selector: 'app-user-access',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styles: [`
    .pm-table { width: 100%; min-width: 0; }
    .pm-table th.pm-c, .pm-table td.pm-c { text-align: center; width: 76px; }
    .pm-table td { padding-top: var(--space-2); padding-bottom: var(--space-2); }
    .pm-group td { background: var(--surface-alt); font-weight: 700; padding-top: var(--space-2); padding-bottom: var(--space-2); }
    .pm-box { width: 16px; height: 16px; accent-color: var(--primary); cursor: pointer; vertical-align: middle; }
    .pm-box:disabled { cursor: not-allowed; opacity: 0.35; }
  `],
  template: `
    <main class="main">
      <div class="page-header">
        <div>
          <span class="eyebrow">Administration</span>
          <h1>User Access</h1>
          <p>Choose what each user of your business can do in each area: view, create, edit or delete. Changes apply to that user only and are enforced on the server as well as in the menu.</p>
        </div>
      </div>

      <div class="card" style="max-width:820px">
        <div class="field">
          <label for="uaUser">User</label>
          <select class="select" id="uaUser" [ngModel]="selected()" (ngModelChange)="selectUser($event)">
            <option value="">Select a user…</option>
            @for (u of users(); track u.username) { <option [value]="u.username">{{ u.full_name }} ({{ u.username }}) · {{ u.role }}</option> }
          </select>
          <span class="hint">Your own access cannot be changed here.</span>
        </div>

        @if (loading()) { <p class="text-sm text-muted" style="margin-top:var(--space-4)">Loading…</p> }
        @if (selected() && !loading() && loaded()) {
          <div class="row-between wrap" style="margin-top:var(--space-5);gap:var(--space-2)">
            <h4 style="margin:0">Permissions <span class="badge badge-neutral" style="margin-left:6px">Custom role</span></h4>
            <span class="row" style="gap:var(--space-2)">
              <button type="button" class="btn btn-ghost btn-xs" (click)="setAll(true)">Allow all</button>
              <button type="button" class="btn btn-ghost btn-xs" (click)="setAll(false)">Disable all</button>
            </span>
          </div>

          <div class="table-scroll" style="margin-top:var(--space-2);border:1px solid var(--border);border-radius:var(--radius-md)">
            <table class="table pm-table">
              <thead>
                <tr>
                  <th>Module</th>
                  @for (a of actions; track a) { <th class="pm-c">{{ label(a) }}</th> }
                </tr>
              </thead>
              <tbody>
                @for (g of groups(); track g.name) {
                  <tr class="pm-group">
                    <td>{{ g.name }}</td>
                    <td colspan="4" style="text-align:right">
                      <button type="button" class="btn btn-ghost btn-xs" (click)="setGroup(g.name, true)">Allow all</button>
                      <button type="button" class="btn btn-ghost btn-xs" (click)="setGroup(g.name, false)">Disable all</button>
                    </td>
                  </tr>
                  @for (m of g.items; track m.key) {
                    <tr>
                      <td>{{ m.label }}</td>
                      @for (a of actions; track a) {
                        <td class="pm-c">
                          <input type="checkbox" class="pm-box" [checked]="perm(m.key, a)" [disabled]="a !== 'view' && !perm(m.key, 'view')"
                                 (change)="toggle(m.key, a, $any($event.target).checked)" [attr.aria-label]="label(a) + ' ' + m.label">
                        </td>
                      }
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
          <p class="text-xs text-muted" style="margin-top:var(--space-2)">Create, Edit and Delete need View. Unticking View turns the other three off.</p>

          @if (error()) { <div class="text-sm" style="color:var(--danger-700);margin-top:var(--space-4)" role="alert">{{ error() }}</div> }
          <div class="row" style="justify-content:flex-end;gap:var(--space-3);margin-top:var(--space-6)">
            <button type="button" class="btn btn-secondary" (click)="roleDefaults()">Role defaults</button>
            <button type="button" class="btn btn-primary" [disabled]="saving()" (click)="save()">{{ saving() ? 'Saving...' : 'Save access' }}</button>
          </div>
        }
        @if (error() && !loaded()) { <div class="text-sm" style="color:var(--danger-700);margin-top:var(--space-4)" role="alert">{{ error() }}</div> }
      </div>

      @if (toast()) { <div class="toast-stack"><div class="toast"><span class="dot dot-success"></span><span>{{ toast() }}</span></div></div> }
    </main>
  `
})
export class UserAccessComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);

  readonly actions: PermissionAction[] = PERMISSION_ACTIONS;
  users = signal<any[]>([]);
  selected = signal('');
  modules = signal<AccessModule[]>(ACCESS_MODULES);
  choices = signal<Record<string, ModulePermissions>>({});
  loading = signal(false);
  loaded = signal(false);
  saving = signal(false);
  error = signal('');
  toast = signal('');
  private role = 'cashier';

  async ngOnInit() {
    const me = this.auth.currentUser().username;
    this.users.set((await this.api.getUsers()).filter(u => u.username !== me));
    const wanted = this.route.snapshot.queryParamMap.get('user');           // e.g. the Access button on Users & Roles
    if (wanted && this.users().some(u => u.username === wanted)) await this.selectUser(wanted);
  }

  label(a: PermissionAction): string { return a.charAt(0).toUpperCase() + a.slice(1); }

  perm(module: string, action: PermissionAction): boolean { return !!this.choices()[module]?.[action]; }

  groups(): { name: string; items: AccessModule[] }[] {
    const out: { name: string; items: AccessModule[] }[] = [];
    for (const m of this.modules()) {
      let g = out.find(x => x.name === m.group);
      if (!g) { g = { name: m.group, items: [] }; out.push(g); }
      g.items.push(m);
    }
    return out;
  }

  async selectUser(username: string) {
    this.selected.set(username);
    this.loaded.set(false);
    this.error.set('');
    if (!username) return;
    this.loading.set(true);
    try {
      const res = await this.api.getUserAccess(username);
      this.role = res.role;
      if (res.available?.length) this.modules.set(res.available);
      const next: Record<string, ModulePermissions> = {};
      for (const m of this.modules()) {
        const p = res.permissions?.[m.key];
        next[m.key] = p ? { ...NONE, ...p } : (res.modules?.[m.key] ? { ...FULL } : { ...NONE });       // an older server only sends on / off
      }
      this.choices.set(next);
      this.loaded.set(true);
    } catch (err: any) {
      this.error.set(typeof err?.error?.detail === 'string' ? err.error.detail : 'Could not load this user\'s access.');
    } finally {
      this.loading.set(false);
    }
  }

  toggle(module: string, action: PermissionAction, on: boolean) {
    const cur = { ...(this.choices()[module] ?? NONE) };
    cur[action] = on;
    if (action === 'view' && !on) Object.assign(cur, NONE);       // Create / Edit / Delete need View
    this.choices.set({ ...this.choices(), [module]: cur });
  }

  setGroup(group: string, allowed: boolean) {
    const next = { ...this.choices() };
    for (const m of this.modules()) if (m.group === group) next[m.key] = allowed ? { ...FULL } : { ...NONE };
    this.choices.set(next);
  }

  setAll(allowed: boolean) {
    this.choices.set(Object.fromEntries(this.modules().map(m => [m.key, allowed ? { ...FULL } : { ...NONE }])));
  }

  roleDefaults() {
    this.choices.set(Object.fromEntries(this.modules().map(m => [m.key, this.role === 'admin' || CASHIER_DEFAULTS.includes(m.key) ? { ...FULL } : { ...NONE }])));
  }

  async save() {
    if (!this.selected() || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    try {
      await this.api.saveUserAccess(this.selected(), this.choices());
      this.toast.set('Access updated');
      setTimeout(() => this.toast.set(''), 2500);
    } catch (err: any) {
      this.error.set(typeof err?.error?.detail === 'string' ? err.error.detail : 'Could not save the access. Please try again.');
    } finally {
      this.saving.set(false);
    }
  }
}
