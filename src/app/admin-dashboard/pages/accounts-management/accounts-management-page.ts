import { ChangeDetectorRef, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { supabase } from '../../../../environments/supabase.config';
import { AuthService, RegisterFormData } from '../../../auth/auth.service';

interface Account {
  id: string;
  full_name: string;
  email: string;
  student_id: string;
  mobile: string;
  role: string;
  created_at: string;
  degree_program?: string;
}

@Component({
  selector: 'app-accounts-management-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './accounts-management-page.html',
  styleUrl: './accounts-management-page.css'
})
export class AccountsManagementPageComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly authService = inject(AuthService);

  accounts = signal<Account[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  isDeleting = signal<string | null>(null);

  // Search
  searchQuery = signal('');

  // Edit account modal
  editingAccount = signal<Account | null>(null);
  showEditAccount = signal(false);
  editForm = signal<RegisterFormData>({
    fullName: '',
    studentId: '',
    email: '',
    password: '',
    confirmPassword: '',
    degreeProgram: '',
    mobile: '',
    role: 'student',
  });
  editErrors = signal<Record<string, string>>({});
  editSubmitError = signal('');
  isUpdatingAccount = signal(false);

  // Add account form
  showAddAccount = signal(false);
  addForm = signal<RegisterFormData>({
    fullName: '',
    studentId: '',
    email: '',
    password: '',
    confirmPassword: '',
    degreeProgram: '',
    mobile: '',
    role: 'student',
  });
  addErrors = signal<Record<string, string>>({});
  addSubmitError = signal('');
  isAddingAccount = signal(false);

  availableDegreePrograms = signal<string[]>([]);

  /** Accounts filtered by the search query (name, email, or student/staff ID). */
  filteredAccounts = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return this.accounts();
    return this.accounts().filter((a) =>
      a.full_name.toLowerCase().includes(q) ||
      a.email.toLowerCase().includes(q) ||
      a.student_id.toLowerCase().includes(q)
    );
  });

  ngOnInit(): void {
    this.loadAccounts();
    this.loadDegreePrograms();
  }

  async loadAccounts(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, student_id, mobile, role, degree_program, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      this.accounts.set((data || []) as Account[]);
      this.cdr.markForCheck();
    } catch (err) {
      console.error('[AccountsManagement] Error loading accounts:', err);
      this.error.set(err instanceof Error ? err.message : 'Failed to load accounts.');
    } finally {
      this.loading.set(false);
      this.cdr.markForCheck();
    }
  }

  async loadDegreePrograms(): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('degree_programs')
        .select('name')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) throw error;

      const programs = (data || []) as { name: string }[];
      this.availableDegreePrograms.set(programs.map((p) => p.name).filter(Boolean));
    } catch (err) {
      console.error('[AccountsManagement] Failed to load degree programs:', err);
    }
  }

  async deleteAccount(account: Account): Promise<void> {
    if (!window.confirm(`Delete account for ${account.full_name} (${account.email})? This cannot be undone.`)) {
      return;
    }

    this.isDeleting.set(account.id);

    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', account.id);

      if (error) throw error;

      await this.loadAccounts();
      this.cdr.markForCheck();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete account.';
      console.error('[AccountsManagement] Delete account failed:', message);
      alert(`Failed to delete account: ${message}`);
    } finally {
      this.isDeleting.set(null);
    }
  }

  toggleAddAccount(): void {
    this.showAddAccount.set(!this.showAddAccount());
    if (this.showAddAccount()) {
      this.addForm.set({
        fullName: '',
        studentId: '',
        email: '',
        password: '',
        confirmPassword: '',
        degreeProgram: '',
        mobile: '',
        role: 'student',
      });
      this.addErrors.set({});
      this.addSubmitError.set('');
    }
  }

  setAddRole(role: 'student' | 'admin'): void {
    this.addForm.update(f => ({ ...f, role, degreeProgram: '' }));
    this.addErrors.set({});
    this.addSubmitError.set('');
  }

  onFieldChange(field: string, value: string): void {
    this.addForm.update(f => ({ ...f, [field]: value }));
    this.addErrors.update(e => {
      const { [field]: _, ...rest } = e;
      return rest;
    });
    this.addSubmitError.set('');
  }

  clearAddErrors(): void {
    this.addErrors.set({});
    this.addSubmitError.set('');
  }

  // ---- Edit account ----

  openEditAccount(account: Account): void {
    this.editingAccount.set(account);
    this.editForm.set({
      fullName: account.full_name,
      studentId: account.student_id,
      email: account.email,
      password: '',
      confirmPassword: '',
      degreeProgram: account.role === 'student' ? account.degree_program ?? '' : '',
      mobile: account.mobile,
      role: account.role as 'student' | 'admin',
    });
    this.editErrors.set({});
    this.editSubmitError.set('');
    this.showEditAccount.set(true);
  }

  closeEditAccount(): void {
    this.showEditAccount.set(false);
    this.editingAccount.set(null);
    this.editForm.set({
      fullName: '',
      studentId: '',
      email: '',
      password: '',
      confirmPassword: '',
      degreeProgram: '',
      mobile: '',
      role: 'student',
    });
    this.editErrors.set({});
    this.editSubmitError.set('');
  }

  onEditFieldChange(field: string, value: string): void {
    this.editForm.update(f => ({ ...f, [field]: value }));
    this.editErrors.update(e => {
      const { [field]: _, ...rest } = e;
      return rest;
    });
    this.editSubmitError.set('');
  }

  clearEditErrors(): void {
    this.editErrors.set({});
    this.editSubmitError.set('');
  }

  async updateAccount(): Promise<void> {
    const account = this.editingAccount();
    if (!account) return;

    this.clearEditErrors();

    if (!this.editForm().fullName?.trim()) {
      this.editErrors.update(e => ({ ...e, fullName: 'Full name is required.' }));
      return;
    }

    if (!this.editForm().studentId?.trim()) {
      this.editErrors.update(e => ({ ...e, studentId: this.editForm().role === 'admin' ? 'Staff ID is required.' : 'Student ID is required.' }));
      return;
    }

    if (!this.editForm().email?.trim()) {
      this.editErrors.update(e => ({ ...e, email: 'Email address is required.' }));
      return;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.editForm().email)) {
      this.editErrors.update(e => ({ ...e, email: 'Please enter a valid email address.' }));
      return;
    }

    if (!this.editForm().mobile?.trim()) {
      this.editErrors.update(e => ({ ...e, mobile: 'Mobile number is required.' }));
      return;
    }

    if (this.editForm().role === 'student' && !this.editForm().degreeProgram) {
      this.editErrors.update(e => ({ ...e, degreeProgram: 'Please select a degree program.' }));
      return;
    }

    this.isUpdatingAccount.set(true);

    try {
      // Prevent changing the email/ID to one already taken by another account
      const { data: existingProfiles, error: checkError } = await supabase
        .from('profiles')
        .select('id, email, student_id')
        .or(`email.eq.${this.editForm().email.trim().toLowerCase()},student_id.eq.${this.editForm().studentId.trim()}`);

      if (checkError) throw checkError;

      const conflict = existingProfiles?.find(p => p.id !== account.id);
      if (conflict) {
        const match =
          conflict.email?.toLowerCase() === this.editForm().email.trim().toLowerCase()
            ? 'email'
            : 'student/staff ID';
        this.editSubmitError.set(`An account with this ${match} already exists.`);
        this.isUpdatingAccount.set(false);
        this.cdr.markForCheck();
        return;
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          full_name: this.editForm().fullName.trim(),
          student_id: this.editForm().studentId.trim(),
          email: this.editForm().email.trim().toLowerCase(),
          mobile: this.editForm().mobile.trim(),
          role: this.editForm().role,
          degree_program: this.editForm().role === 'student' ? this.editForm().degreeProgram : null,
        })
        .eq('id', account.id);

      if (updateError) throw updateError;

      this.editSubmitError.set('');
      this.showEditAccount.set(false);
      this.editingAccount.set(null);
      await this.loadAccounts();
      this.cdr.markForCheck();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update account.';
      console.error('[AccountsManagement] Update account error:', message);
      this.editSubmitError.set(message);
      this.isUpdatingAccount.set(false);
      this.cdr.markForCheck();
    } finally {
      this.isUpdatingAccount.set(false);
      this.cdr.markForCheck();
    }
  }

  async onAddAccountSubmit(): Promise<void> {
    // Safety: reset loading state first in case it's stuck from a previous attempt
    this.isAddingAccount.set(false);
    this.cdr.markForCheck();

    this.clearAddErrors();

    let valid = true;

    if (!this.addForm().fullName?.trim()) {
      this.addErrors.update(e => ({ ...e, fullName: 'Full name is required.' }));
      valid = false;
    }

    if (!this.addForm().studentId?.trim()) {
      this.addErrors.update(e => ({ ...e, studentId: this.addForm().role === 'admin' ? 'Staff ID is required.' : 'Student ID is required.' }));
      valid = false;
    }

    if (!this.addForm().email?.trim()) {
      this.addErrors.update(e => ({ ...e, email: 'Email address is required.' }));
      valid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.addForm().email)) {
      this.addErrors.update(e => ({ ...e, email: 'Please enter a valid email address.' }));
      valid = false;
    }

    if (!this.addForm().password) {
      this.addErrors.update(e => ({ ...e, password: 'Password is required.' }));
      valid = false;
    } else if (this.addForm().password.length < 6) {
      this.addErrors.update(e => ({ ...e, password: 'Password must be at least 6 characters.' }));
      valid = false;
    }

    if (!this.addForm().confirmPassword) {
      this.addErrors.update(e => ({ ...e, confirmPassword: 'Please confirm your password.' }));
      valid = false;
    } else if (this.addForm().confirmPassword !== this.addForm().password) {
      this.addErrors.update(e => ({ ...e, confirmPassword: 'Passwords do not match.' }));
      valid = false;
    }

    if (this.addForm().role === 'student' && !this.addForm().degreeProgram) {
      this.addErrors.update(e => ({ ...e, degreeProgram: 'Please select a degree program.' }));
      valid = false;
    }

    if (!this.addForm().mobile?.trim()) {
      this.addErrors.update(e => ({ ...e, mobile: 'Mobile number is required.' }));
      valid = false;
    }

    if (!valid) return;

    this.isAddingAccount.set(true);

    try {
      // Pre-check: don't attempt Supabase Auth signUp if a profile already exists
      // with this email or student/staff ID. This avoids creating an orphaned Auth
      // user (signUp succeeds but a later step fails) that blocks retries with the
      // same email — signOut() only clears the local session, it cannot delete
      // the user from Supabase Auth.
      const { data: existingProfiles, error: checkError } = await supabase
        .from('profiles')
        .select('id, email, student_id')
        .or(`email.eq.${this.addForm().email.trim().toLowerCase()},student_id.eq.${this.addForm().studentId.trim()}`);

      if (checkError) throw checkError;

      if (existingProfiles && existingProfiles.length > 0) {
        const existing = existingProfiles[0];
        const match =
          existing.email?.toLowerCase() === this.addForm().email.trim().toLowerCase()
            ? 'email'
            : existing.student_id === this.addForm().studentId.trim()
              ? 'student/staff ID'
              : 'email or ID';
        this.addSubmitError.set(`An account with this ${match} already exists.`);
        this.cdr.markForCheck();
        return;
      }

      const result = await this.authService.register({
        fullName: this.addForm().fullName.trim(),
        studentId: this.addForm().studentId.trim(),
        email: this.addForm().email.trim().toLowerCase(),
        password: this.addForm().password,
        confirmPassword: this.addForm().confirmPassword,
        degreeProgram: this.addForm().degreeProgram,
        mobile: this.addForm().mobile.trim(),
        role: this.addForm().role,
      });

      if (!result.success) {
        console.error('[AccountsManagement] Register result error:', result.error);
        if (result.error?.includes('already registered') || result.error?.includes('already exists')) {
          this.addSubmitError.set('An account with this email or ID already exists.');
        } else if (result.error?.includes('weak password')) {
          this.addSubmitError.set('Password is too weak. Please choose a stronger one.');
        } else {
          this.addSubmitError.set(result.error || 'Account creation failed. Please try again.');
        }
        this.cdr.markForCheck();
        return;
      }

      this.addSubmitError.set('');
      this.showAddAccount.set(false);
      await this.loadAccounts();
      this.cdr.markForCheck();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Account creation failed. Please try again.';
      console.error('[AccountsManagement] Add account error:', message);
      this.addSubmitError.set(message);
      this.isAddingAccount.set(false);
      this.cdr.markForCheck();
    } finally {
      this.isAddingAccount.set(false);
      this.cdr.markForCheck();
    }
  }

  trackByAccount = (_: number, account: Account): string => account.id;

  roleBadgeClass(role: string): string {
    const base = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border';
    if (role === 'admin') return `${base} border-amber-100 bg-amber-50 text-amber-700`;
    return `${base} border-slate-100 bg-slate-50 text-slate-500`;
  }
}
