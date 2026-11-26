import { ChangeDetectorRef, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { supabase } from '../../environments/supabase.config';

interface PasswordRequirements {
  length: boolean;
  number: boolean;
  special: boolean;
  uppercase: boolean;
}

@Component({
  selector: 'app-first-login-change-password',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './first-login-change-password.html',
  styleUrl: './first-login-change-password.css'
})
export class FirstLoginChangePasswordPageComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  userRole: 'student' | 'admin' | '' = '';
  newPassword = '';
  confirmPassword = '';

  showNewPassword = signal(false);
  showConfirmPassword = signal(false);
  isChangingPassword = signal(false);
  errorMessage = signal('');

  passwordRequirements = computed<PasswordRequirements>(() => {
    const pw = this.newPassword;
    return {
      length: pw.length >= 6,
      number: /\d/.test(pw),
      special: /[^a-zA-Z0-9]/.test(pw),
      uppercase: /[A-Z]/.test(pw),
    };
  });

  ngOnInit(): void {
    // The user is already logged in (Supabase session exists). Load their profile
    // so we can show their email and confirm they need a password change.
    this.loadProfile();
  }

  private async loadProfile(): Promise<void> {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        void this.router.navigate(['/login']);
        return;
      }
      this.userRole = '';

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('must_change_password, role')
        .eq('id', user.id)
        .single();

      if (error || !profile) {
        this.errorMessage.set('Unable to load your profile. Please try logging in again.');
        return;
      }

      const profileRole = (profile as { role: string }).role;
      this.userRole = profileRole === 'admin' ? 'admin' : 'student';

      if (!(profile as { must_change_password: boolean }).must_change_password) {
        // Already changed — send to correct dashboard
        const destination = profileRole === 'admin' ? '/admin-dashboard' : '/dashboard';
        void this.router.navigate([destination]);
        return;
      }
    } catch (err) {
      console.error('[FirstLogin] Error loading profile:', err);
      this.errorMessage.set(err instanceof Error ? err.message : 'Failed to load profile.');
    }
  }

  toggleNewPasswordVisibility(): void {
    this.showNewPassword.update(v => !v);
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword.update(v => !v);
  }

  checkPasswordRequirements(): void {
    // No-op; used by template to reactively show requirement states
  }

  async onSubmit(): Promise<void> {
    this.errorMessage.set('');

    const pw = this.newPassword?.trim() || '';
    const confirm = this.confirmPassword?.trim() || '';

    if (!pw) {
      this.errorMessage.set('Please enter a new password.');
      return;
    }
    if (pw.length < 6) {
      this.errorMessage.set('Password must be at least 6 characters.');
      return;
    }
    if (!/\d/.test(pw)) {
      this.errorMessage.set('Password must contain at least 1 number.');
      return;
    }
    if (!/[^a-zA-Z0-9]/.test(pw)) {
      this.errorMessage.set('Password must contain at least 1 special character.');
      return;
    }
    if (!/[A-Z]/.test(pw)) {
      this.errorMessage.set('Password must contain at least 1 uppercase letter.');
      return;
    }
    if (!confirm) {
      this.errorMessage.set('Please confirm your new password.');
      return;
    }
    if (pw !== confirm) {
      this.errorMessage.set('Passwords do not match.');
      return;
    }

    this.isChangingPassword.set(true);

    try {
      // Step 1: Update the password directly (user is already authenticated)
      const { error: updateError } = await supabase.auth.updateUser({ password: pw });
      if (updateError) {
        this.errorMessage.set(updateError.message || 'Failed to update password.');
        return;
      }

      // Step 3: Mark password as changed in profiles (non-blocking — if RLS blocks
      // the update, we still navigate since the password was already changed in Auth).
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ must_change_password: false })
          .eq('id', user.id);
        if (profileError) {
          console.error('[FirstLogin] Failed to update profile flag:', profileError);
          this.errorMessage.set('Password set, but could not clear the first-login flag. You may be asked again on next login until the DB is updated.');
        }
      }

      const destination = this.userRole === 'admin' ? '/admin-dashboard' : '/dashboard';
      await this.router.navigate([destination]);
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Failed to change password.');
    } finally {
      this.isChangingPassword.set(false);
      this.cdr.markForCheck();
    }
  }
}
