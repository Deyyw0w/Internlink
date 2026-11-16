import { ChangeDetectorRef, Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { supabase } from '../../../../environments/supabase.config';
import { ProfileService } from '../../../auth/profile.service';

interface AccountSettingsForm {
  full_name: string;
  email: string;
  student_id: string;
  mobile: string;
  role: string;
}

interface PasswordChangeForm {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

@Component({
  selector: 'app-admin-account-settings-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './account-settings-page.html',
  styleUrl: './account-settings-page.css'
})
export class AdminAccountSettingsPageComponent implements OnInit {
  private readonly profileService = inject(ProfileService);
  private readonly cdr = inject(ChangeDetectorRef);

  profile = this.profileService.profile;
  profileLoading = this.profileService.loading;

  editForm = signal<AccountSettingsForm>({
    full_name: '',
    email: '',
    student_id: '',
    mobile: '',
    role: '',
  });
  editErrors = signal<Record<string, string>>({});
  editSubmitError = signal('');
  isSavingProfile = signal(false);

  passwordForm = signal<PasswordChangeForm>({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  passwordErrors = signal<Record<string, string>>({});
  passwordSubmitError = signal('');
  isSavingPassword = signal(false);

  showProfilePopup = signal(false);
  profilePopupSuccess = signal(true);
  profilePopupMessage = signal('');

  showPasswordPopup = signal(false);
  passwordPopupSuccess = signal(true);
  passwordPopupMessage = signal('');

  ngOnInit(): void {
    this.loadProfile();
  }

  private loadProfile(): void {
    const profile = this.profileService.profile();
    if (profile) {
      this.editForm.set({
        full_name: profile.full_name || '',
        email: profile.email || '',
        student_id: profile.student_id || '',
        mobile: profile.mobile || '',
        role: profile.role || '',
      });
    }
    this.cdr.markForCheck();
  }

  // ── Profile editing ──────────────────────────────────────────────

  clearEditErrors(): void {
    this.editErrors.set({});
    this.editSubmitError.set('');
  }

  saveProfile(): void {
    this.clearEditErrors();

    const profile = this.profileService.profile();
    if (!profile) {
      this.editSubmitError.set('No admin profile found to update.');
      return;
    }

    const { full_name, email, student_id, mobile, role } = this.editForm();

    let valid = true;
    const errors: Record<string, string> = {};

    if (!String(full_name).trim()) {
      errors['full_name'] = 'Full name is required.';
      valid = false;
    }
    if (!String(email).trim() || !String(email).includes('@')) {
      errors['email'] = 'A valid email address is required.';
      valid = false;
    }
    if (!String(student_id).trim()) {
      errors['student_id'] = 'Staff ID is required.';
      valid = false;
    }
    if (!String(mobile).trim()) {
      errors['mobile'] = 'Mobile number is required.';
      valid = false;
    }

    if (!valid) {
      this.editErrors.set(errors);
      return;
    }

    this.isSavingProfile.set(true);

    void supabase
      .from('profiles')
      .update({
        full_name: String(full_name).trim(),
        email: String(email).trim().toLowerCase(),
        student_id: String(student_id).trim(),
        mobile: String(mobile).trim(),
        role: String(role).trim(),
      })
      .eq('id', profile.id)
      .then(({ error }) => {
        this.isSavingProfile.set(false);

        if (error) {
          console.error('[AdminAccountSettings] Profile update error:', error);
          this.editSubmitError.set(error.message || 'Failed to update profile.');
          return;
        }

        void this.profileService.loadProfile(profile.id).then(() => {
          this.loadProfile();
          this.cdr.markForCheck();
        });

        this.profilePopupSuccess.set(true);
        this.profilePopupMessage.set('Your admin account information has been updated successfully.');
        this.showProfilePopup.set(true);
        this.cdr.markForCheck();
      });
  }

  closeProfilePopup(): void {
    this.showProfilePopup.set(false);
    this.profilePopupMessage.set('');
  }

  // ── Password change ──────────────────────────────────────────────

  clearPasswordErrors(): void {
    this.passwordErrors.set({});
    this.passwordSubmitError.set('');
  }

  savePassword(): void {
    this.clearPasswordErrors();

    const profile = this.profileService.profile();
    const email = profile?.email || '';

    const { current_password, new_password, confirm_password } = this.passwordForm();

    let valid = true;
    const errors: Record<string, string> = {};

    if (!String(current_password).trim()) {
      errors['current_password'] = 'Current password is required.';
      valid = false;
    }
    if (!String(new_password).trim()) {
      errors['new_password'] = 'New password is required.';
      valid = false;
    } else if (String(new_password).length < 6) {
      errors['new_password'] = 'New password must be at least 6 characters.';
      valid = false;
    }
    if (!String(confirm_password).trim()) {
      errors['confirm_password'] = 'Please confirm your new password.';
      valid = false;
    } else if (String(new_password) !== String(confirm_password)) {
      errors['confirm_password'] = 'Passwords do not match.';
      valid = false;
    }

    if (!valid) {
      this.passwordErrors.set(errors);
      return;
    }

    this.isSavingPassword.set(true);

    void supabase.auth
      .signInWithPassword({ email, password: current_password })
      .then(({ error: signInError }) => {
        if (signInError) {
          console.error('[AdminAccountSettings] Current password verification failed:', signInError);
          this.isSavingPassword.set(false);
          this.passwordSubmitError.set('Current password is incorrect. Please try again.');
          this.passwordErrors.set({ current_password: 'Current password is incorrect.' });
          return;
        }

        return supabase.auth.updateUser({ password: new_password });
      })
      .then((res) => {
        this.isSavingPassword.set(false);

        const authError = res?.error;
        if (authError) {
          console.error('[AdminAccountSettings] Password change error:', authError);
          this.passwordSubmitError.set(authError.message || 'Failed to change password.');
          return;
        }

        this.passwordPopupSuccess.set(true);
        this.passwordPopupMessage.set('Your admin password has been changed successfully.');
        this.showPasswordPopup.set(true);

        this.passwordForm.set({
          current_password: '',
          new_password: '',
          confirm_password: '',
        });

        this.cdr.markForCheck();
      })
      .catch((err) => {
        this.isSavingPassword.set(false);
        this.passwordSubmitError.set(err instanceof Error ? err.message : 'Failed to change password.');
        this.cdr.markForCheck();
      });
  }

  closePasswordPopup(): void {
    this.showPasswordPopup.set(false);
    this.passwordPopupMessage.set('');
  }

  // ── Helpers ──────────────────────────────────────────────────────

  profileInitials(): string {
    const profile = this.profileService.profile();
    return profile?.full_name
      ? profile.full_name
          .split(' ')
          .map((part) => part.charAt(0).toUpperCase())
          .slice(0, 2)
          .join('')
      : '?';
  }

  memberSince(): string {
    const profile = this.profileService.profile();
    if (!profile?.created_at) return '—';
    return new Date(profile.created_at).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
    });
  }

  lastUpdated(): string {
    const profile = this.profileService.profile();
    if (!profile?.updated_at) return '—';
    return new Date(profile.updated_at).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
}
