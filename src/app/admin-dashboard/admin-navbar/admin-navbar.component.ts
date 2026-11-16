import { Component, computed, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { supabase } from '../../../environments/supabase.config';
import { ProfileService } from '../../auth/profile.service';

@Component({
  selector: 'app-admin-navbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-navbar.component.html',
})
export class AdminNavbarComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  readonly profileService = inject(ProfileService);

  isProfileMenuOpen = false;
  private authSubscription: any = null;

  /** Computed signals — react to ProfileService signal changes so the template
     re-renders when the profile loads or clears (e.g. on sign out). */
  readonly adminName = computed(() => this.profileService.profile()?.full_name ?? 'Administrator');
  readonly adminEmail = computed(() => this.profileService.profile()?.email ?? '—');
  readonly adminInitials = computed(() => {
    const profile = this.profileService.profile();
    return profile?.full_name ? this.profileService.computeInitials(profile.full_name) : 'SA';
  });

  async ngOnInit(): Promise<void> {
    // Load profile if this page hasn't already (e.g. refresh on a child route).
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user && !this.profileService.profile()) {
      await this.profileService.loadProfile(session.user.id);
    }

    // React to auth state changes (sign out from another tab, session expiry, etc.)
    this.authSubscription = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[AdminNavbar] Auth state changed:', event);

      if (!session?.user) {
        this.profileService.profile.set(null);
        this.profileService.loading.set(false);
        this.closeProfileMenu();
        return;
      }

      if (!this.profileService.profile()) {
        await this.profileService.loadProfile(session.user.id);
      }
    });
  }

  ngOnDestroy(): void {
    if (typeof this.authSubscription?.unsubscribe === 'function') {
      this.authSubscription.unsubscribe();
    }
  }

  toggleProfileMenu(): void {
    this.isProfileMenuOpen = !this.isProfileMenuOpen;
  }

  closeProfileMenu(): void {
    this.isProfileMenuOpen = false;
  }

  async signOut(): Promise<void> {
    this.closeProfileMenu();

    // Clear shared profile state immediately so the UI updates on the first click
    this.profileService.profile.set(null);
    this.profileService.loading.set(false);

    // Sign out FIRST, then navigate. Navigating before signOut completes lets
    // the login guard (requireGuest) see an active session and bounce the user
    // back to the dashboard, which is why sign out appeared to do nothing
    // until the next click.
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('[AdminNavbar] Supabase signOut error:', error);
    }

    await this.router.navigate(['/login']);
  }
}
