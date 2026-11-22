import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { supabase } from '../../../environments/supabase.config';
import { ProfileService } from '../../auth/profile.service';
import { NotificationsDropdownComponent } from '../../shared/components/notifications-dropdown/notifications-dropdown.component';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule, NotificationsDropdownComponent],
  templateUrl: './topbar.component.html',
})
export class TopbarComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  readonly profileService = inject(ProfileService);

  isProfileMenuOpen = false;
  private authSubscription: any = null;

  /* Computed signals — react to ProfileService signal changes so the template
     re-renders when the profile loads or clears (e.g. on sign out). */
  readonly userName = computed(() => this.profileService.profile()?.full_name ?? null);
  readonly userEmail = computed(() => this.profileService.profile()?.email ?? null);
  readonly userId = computed(() => this.profileService.profile()?.student_id ?? null);
  readonly userInitials = computed(() => {
    const profile = this.profileService.profile();
    return profile?.full_name ? this.profileService.computeInitials(profile.full_name) : '';
  });

  async ngOnInit(): Promise<void> {
    // Load profile for the current session user. Skip only when the cached
    // profile already belongs to this user (prevents admin/student profile
    // leaking across role switches on the shared ProfileService singleton).
    const { data: { session } } = await supabase.auth.getSession();
    const current = this.profileService.profile();
    if (session?.user && (!current || current.id !== session.user.id)) {
      await this.profileService.loadProfile(session.user.id);
    }

    // React to auth state changes (sign out from another tab, session expiry, etc.)
    // NOTE: only clears shared state — navigation is handled by signOut() below,
    // so two components never fight over redirects.
    this.authSubscription = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[Topbar] Auth state changed:', event);

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
      console.error('[Topbar] Supabase signOut error:', error);
    }

    await this.router.navigate(['/login']);
  }
}
