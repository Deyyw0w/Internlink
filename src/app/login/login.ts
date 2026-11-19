import { ChangeDetectorRef, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { supabase } from '../../environments/supabase.config';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class Login {
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  email = '';
  password = '';
  showPasswordVisibility = signal(false);
  isSigningIn = false;
  showErrorPopup = false;
  errorPopupMessage = '';

  togglePasswordVisibility(): void {
    this.showPasswordVisibility.update((v) => !v);
  }

  async onSubmit(): Promise<void> {
    console.log('[LOGIN] onSubmit called, email:', this.email);

    this.showErrorPopup = false;
    this.errorPopupMessage = '';

    if (!this.email || !this.password) {
      this.errorPopupMessage = 'Please enter your USLT credentials to continue.';
      this.showErrorPopup = true;
      this.cdr.markForCheck();
      console.log('[LOGIN] Empty fields popup shown');
      return;
    }

    this.isSigningIn = true;
    console.log('[LOGIN] Signing in...');

    try {
      const result = await supabase.auth.signInWithPassword({
        email: this.email,
        password: this.password,
      });
      console.log('[LOGIN] signInWithPassword result:', { error: result.error, hasUser: !!result.data?.user });

      // Supabase v2: always returns { data, error }
      if (result.error) {
        this.errorPopupMessage = result.error.message || 'Invalid email or password. Please try again.';
        this.showErrorPopup = true;
        this.isSigningIn = false;
        this.cdr.markForCheck();
        console.log('[LOGIN] Auth error popup shown');
        return;
      }

      if (!result.data?.user) {
        this.errorPopupMessage = 'Invalid email or password. Please try again.';
        this.showErrorPopup = true;
        this.isSigningIn = false;
        this.cdr.markForCheck();
        console.log('[LOGIN] No user popup shown');
        return;
      }

      const user = result.data.user;

      // Check if a profile exists for this user
      const profileResult = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      console.log('[LOGIN] profile query result:', { error: profileResult.error, hasProfile: !!profileResult.data });

      if (profileResult.error || !profileResult.data) {
        this.errorPopupMessage = 'No account profile found. Please register first.';
        this.showErrorPopup = true;
        this.isSigningIn = false;
        this.cdr.markForCheck();
        console.log('[LOGIN] No profile popup shown');
        return;
      }

      // Profile exists — check if password change is required on first login
      const profile = profileResult.data as {
        role: string;
        must_change_password: boolean;
      };
      const actualRole = profile.role;

      if (profile.must_change_password) {
        console.log('[LOGIN] First login detected — redirecting to change-password page');
        void this.router.navigate(['/first-login-change-password']);
        return;
      }

      // Proceed to the user's role-based dashboard
      const destination = actualRole === 'admin' ? '/admin-dashboard' : '/dashboard';
      console.log('[LOGIN] Redirecting to:', destination);
      void this.router.navigate([destination]);
    } catch (err) {
      console.error('[LOGIN] Catch block error:', err);
      this.errorPopupMessage = err instanceof Error ? err.message : 'Login failed. Please try again.';
      this.showErrorPopup = true;
      this.isSigningIn = false;
      this.cdr.markForCheck();
    } finally {
      this.isSigningIn = false;
      this.cdr.markForCheck();
      console.log('[LOGIN] Loading stopped');
    }
  }

  closeErrorPopup(): void {
    this.showErrorPopup = false;
    this.errorPopupMessage = '';
  }
}
