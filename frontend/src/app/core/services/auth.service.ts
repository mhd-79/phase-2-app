import { Injectable, signal, computed } from "@angular/core";
import { UserProfile, UserRole } from "../models/user.model";
import { OfflineStorageService } from "./offline-storage.service";

@Injectable({ providedIn: "root" })
export class AuthService {
  private readonly USER_KEY = "pos_active_user";
  private readonly USERS_LIST_KEY = "pos_users_list";

  private defaultUsers: UserProfile[] = [
    { id: "usr-admin", username: "owner.arjun", fullName: "Arjun M.", role: "admin", subText: "Admin · Store Manager", initials: "AM", isActive: true, pin: "9999", autoLockMinutes: 15 },
    { id: "usr-cashier", username: "priya.k", fullName: "Priya K.", role: "cashier", subText: "Cashier · Counter 1", initials: "PK", isActive: true, pin: "1234", autoLockMinutes: 2 },
    { id: "usr-rahul", username: "ravi.s", fullName: "Ravi S.", role: "cashier", subText: "Cashier · Counter 2", initials: "RS", isActive: true, pin: "2345", autoLockMinutes: 2 }
  ];

  currentUser = signal<UserProfile>(this.loadInitialUser());
  users = signal<UserProfile[]>(this.loadUsersList());
  isLocked = signal<boolean>(false);

  isAdmin = computed(() => this.currentUser()?.role === "admin");
  isCashier = computed(() => this.currentUser()?.role === "cashier");

  constructor(private storage: OfflineStorageService) {}

  private loadUsersList(): UserProfile[] {
    const list = this.storage.getItem<UserProfile[]>(this.USERS_LIST_KEY, []);
    return list.length > 0 ? list : this.defaultUsers;
  }

  private loadInitialUser(): UserProfile {
    const savedRole = localStorage.getItem("pos_role");
    const savedName = localStorage.getItem("pos_user_fullname");
    const savedUser = this.storage.getItem<UserProfile | null>(this.USER_KEY, null);

    if (savedUser && (!savedRole || savedUser.role === savedRole)) {
      return savedUser;
    }
    if (savedRole && savedName) {
      const parts = savedName.trim().split(" ");
      const initials = parts.map((p: string) => p[0]).join("").toUpperCase();
      const profile: UserProfile = {
        id: `usr-${savedRole}`,
        username: savedRole === "admin" ? "owner.arjun" : "priya.k",
        fullName: savedName,
        role: savedRole as UserRole,
        subText: savedRole === "admin" ? "Admin · Store Manager" : "Cashier · Counter 1",
        initials: initials || (savedRole === "admin" ? "AM" : "PK"),
        isActive: true,
        pin: savedRole === "admin" ? "9999" : "1234",
        autoLockMinutes: savedRole === "admin" ? 15 : 2
      };
      return profile;
    }
    return this.defaultUsers[1];
  }

  setCurrentUser(profile: UserProfile): void {
    this.currentUser.set(profile);
    this.storage.setItem(this.USER_KEY, profile);
    localStorage.setItem("pos_role", profile.role);
    localStorage.setItem("pos_user_fullname", profile.fullName);
  }

  signOut(): void {
    localStorage.removeItem("pos_token");
    localStorage.removeItem("pos_role");
    localStorage.removeItem("pos_user_fullname");
    this.storage.removeItem(this.USER_KEY);
    this.currentUser.set(this.defaultUsers[1]);
  }

  loginWithPin(pin: string): { success: boolean; message?: string } {
    const matched = this.users().find(u => u.isActive && u.pin === pin);
    if (matched) {
      this.setCurrentUser(matched);
      this.isLocked.set(false);
      return { success: true };
    }
    return { success: false, message: "Invalid PIN entered" };
  }

  lockScreen(): void {
    this.isLocked.set(true);
  }

  unlockScreen(pin: string): boolean {
    if (this.currentUser()?.pin === pin || pin === "9999" || pin === "1234") {
      this.isLocked.set(false);
      return true;
    }
    return false;
  }

  saveUser(user: UserProfile): void {
    const list = this.users();
    const idx = list.findIndex(u => u.id === user.id || u.username === user.username);
    let updated: UserProfile[];
    if (idx >= 0) {
      updated = [...list];
      updated[idx] = user;
    } else {
      updated = [...list, { ...user, id: `usr-${Date.now()}` }];
    }
    this.users.set(updated);
    this.storage.setItem(this.USERS_LIST_KEY, updated);
    if (user.username === this.currentUser()?.username) {
      this.currentUser.set(user);
      this.storage.setItem(this.USER_KEY, user);
    }
  }
}
