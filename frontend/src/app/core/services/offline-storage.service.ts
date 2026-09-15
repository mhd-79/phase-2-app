import { Injectable } from "@angular/core";

@Injectable({ providedIn: "root" })
export class OfflineStorageService {
  getItem<T>(key: string, defaultValue: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  setItem<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error("Local storage error:", e);
    }
  }

  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {}
  }
}
