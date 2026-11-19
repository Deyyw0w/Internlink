import { ChangeDetectorRef, Component, computed, inject, OnInit, signal } from '@angular/core';
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
  degree_program: string;
}

interface PasswordChangeForm {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

@Component({
  selector: 'app-account-settings-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './account-settings-page.html',
  styleUrl: './account-settings-page.css'
})
export class AccountSettingsPageComponent implements OnInit {
  private readonly profileService = inject(ProfileService);
  private readonly cdr = inject(ChangeDetectorRef);

  // Profile state
  profile = this.profileService.profile;
  profileLoading = this.profileService.loading;

  // Edit form state
  editForm = signal<AccountSettingsForm>({
    full_name: '',
    email: '',
    student_id: '',
    mobile: '',
    degree_program: '',
  });
  editErrors = signal<Record<string, string>>({});
  editSubmitError = signal('');
  isSavingProfile = signal(false);

  // Password change state
  passwordForm = signal<PasswordChangeForm>({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  showCurrentPassword = signal(false);
  showNewPassword = signal(false);
  showConfirmPassword = signal(false);
  passwordErrors = signal<Record<string, string>>({});
  passwordSubmitError = signal('');
  isSavingPassword = signal(false);

  /** Password requirement checks for the new password field. */
  passwordRequirements = computed(() => {
    const pw = this.passwordForm().new_password;
    return {
      length: pw.length >= 6,
      number: /\d/.test(pw),
      special: /[^a-zA-Z0-9]/.test(pw),
      uppercase: /[A-Z]/.test(pw),
    };
  });

  // Success popups
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
        degree_program: profile.degree_program || '',
      });
    }
    this.cdr.markForCheck();
  }

  // ── Profile editing ──────────────────────────────────────────────

  clearEditErrors(): void {
    this.editErrors.set({});
    this.editSubmitError.set('');
  }

  async saveProfile(): Promise<void> {
    this.clearEditErrors();

    const profile = this.profileService.profile();
    if (!profile) {
      this.editSubmitError.set('No profile found to update.');
      return;
    }

    const { full_name, email, student_id, mobile, degree_program } = this.editForm();

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
      errors['student_id'] = 'Student ID is required.';
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

    try {
      // Resolve department info from degree_programs so the profile stays consistent.
      let departmentName: string | null = null;
      let departmentAbbreviation: string | null = null;
      let practicumHours: number | null = null;

      const degProgram = String(degree_program).trim();
      if (degProgram) {
        const { data: degRow, error: degError } = await supabase
          .from('degree_programs')
          .select('department, department_abbreviation, practicum_hours')
          .eq('name', degProgram)
          .single();

        if (!degError && degRow) {
          departmentName = degRow.department ?? null;
          departmentAbbreviation = degRow.department_abbreviation ?? null;
          practicumHours = degRow.practicum_hours ?? null;
        } else {
          console.warn('[AccountSettings] No degree_program match for department lookup:', degError?.message ?? 'not found');
        }
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: String(full_name).trim(),
          email: String(email).trim().toLowerCase(),
          student_id: String(student_id).trim(),
          mobile: String(mobile).trim(),
          degree_program: degProgram,
          department_name: departmentName,
          department_abbreviation: departmentAbbreviation,
          practicum_hours: practicumHours,
        })
        .eq('id', profile.id);

      this.isSavingProfile.set(false);

      if (error) {
        console.error('[AccountSettings] Profile update error:', error);
        this.editSubmitError.set(error.message || 'Failed to update profile.');
        return;
      }

      // Refresh the shared profile so dashboard/topbar reflect changes
      await this.profileService.loadProfile(profile.id);
      this.loadProfile();
      this.cdr.markForCheck();

      this.profilePopupSuccess.set(true);
      this.profilePopupMessage.set('Your account information has been updated successfully.');
      this.showProfilePopup.set(true);
      this.cdr.markForCheck();
    } catch (err) {
      this.isSavingProfile.set(false);
      console.error('[AccountSettings] Profile update failed:', err);
      this.editSubmitError.set(err instanceof Error ? err.message : 'Failed to update profile.');
    }
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
    const req = this.passwordRequirements();

    if (!String(current_password).trim()) {
      errors['current_password'] = 'Current password is required.';
      valid = false;
    }
    if (!String(new_password).trim()) {
      errors['new_password'] = 'New password is required.';
      valid = false;
    } else {
      if (!req.length) {
        errors['new_password'] = 'Password must be at least 6 characters.';
        valid = false;
      }
      if (!req.number) {
        errors['new_password'] = 'Password must contain at least 1 number.';
        valid = false;
      }
      if (!req.special) {
        errors['new_password'] = 'Password must contain at least 1 special character.';
        valid = false;
      }
      if (!req.uppercase) {
        errors['new_password'] = 'Password must contain at least 1 uppercase letter.';
        valid = false;
      }
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

    // Step 1: Verify current password by signing in with it
    void supabase.auth
      .signInWithPassword({ email, password: current_password })
      .then(({ error: signInError }) => {
        if (signInError) {
          console.error('[AccountSettings] Current password verification failed:', signInError);
          this.isSavingPassword.set(false);
          this.passwordSubmitError.set('Current password is incorrect. Please try again.');
          this.passwordErrors.set({ current_password: 'Current password is incorrect.' });
          return;
        }

        // Step 2: Current password confirmed — update to the new password
        return supabase.auth.updateUser({ password: new_password });
      })
      .then((res) => {
        this.isSavingPassword.set(false);

        const authError = res?.error;
        if (authError) {
          console.error('[AccountSettings] Password change error:', authError);
          this.passwordSubmitError.set(authError.message || 'Failed to change password.');
          return;
        }

        this.passwordPopupSuccess.set(true);
        this.passwordPopupMessage.set('Your password has been changed successfully.');
        this.showPasswordPopup.set(true);

        // Clear the password form
        this.passwordForm.set({
          current_password: '',
          new_password: '',
          confirm_password: '',
        });

        this.cdr.markForCheck();
      });
  }

  closePasswordPopup(): void {
    this.showPasswordPopup.set(false);
    this.passwordPopupMessage.set('');
  }

  toggleCurrentPasswordVisibility(): void {
    this.showCurrentPassword.update(v => !v);
  }

  toggleNewPasswordVisibility(): void {
    this.showNewPassword.update(v => !v);
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword.update(v => !v);
  }

  checkPasswordRequirements(): void {
    this.passwordErrors.update(e => {
      const { new_password: _, ...rest } = e;
      return rest;
    });
    this.passwordSubmitError.set('');
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
