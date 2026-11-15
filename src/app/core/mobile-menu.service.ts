import { inject, Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class MobileMenuService {
  /** Admin dashboard mobile menu open state. */
  readonly adminMenuOpen = signal(false);

  /** Student dashboard mobile menu open state. */
  readonly studentMenuOpen = signal(false);

  toggleAdmin(): void {
    this.adminMenuOpen.update((v) => !v);
  }

  closeAdmin(): void {
    this.adminMenuOpen.set(false);
  }

  toggleStudent(): void {
    this.studentMenuOpen.update((v) => !v);
  }

  closeStudent(): void {
    this.studentMenuOpen.set(false);
  }
}
