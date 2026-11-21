import { ChangeDetectorRef, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { supabase } from '../../../../environments/supabase.config';
import { AuthService, RegisterFormData } from '../../../auth/auth.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

interface Account {
  id: string;
  full_name: string;
  email: string;
  student_id: string;
  mobile: string;
  role: string;
  created_at: string;
  degree_program?: string;
  department_name?: string;
  department_abbreviation?: string;
}

interface PasswordRequirements {
  length: boolean;
  number: boolean;
  special: boolean;
  uppercase: boolean;
}

@Component({
  selector: 'app-accounts-management-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmDialogComponent],
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

  // Confirm dialog state (replaces native confirm() popups).
  confirmDialogOpen = signal(false);
  confirmPayload = signal<{ action: 'deleteAccount'; account: Account } | null>(null);
  confirmIsDeleting = signal(false);

  confirmTitle = signal('');
  confirmMessage = signal('');
  confirmLabel = signal('Delete');

  // Search
  searchQuery = signal('');

  // Filters
  departmentFilter = signal<string>('');
  courseFilter = signal<string>('');

  // Pagination
  pageSize = 15;
  currentPage = signal(1);

  /** Unique departments derived from loaded accounts, used for the department filter dropdown. */
  availableDepartments = signal<string[]>([]);

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
  showAddPassword = signal(false);
  showAddConfirmPassword = signal(false);
  addForm = signal<RegisterFormData>({
    fullName: '',
    studentId: '',
    email: '',
    password: 'Internlink.1',
    confirmPassword: 'Internlink.1',
    degreeProgram: '',
    mobile: '',
    role: 'student',
  });
  addErrors = signal<Record<string, string>>({});
  addSubmitError = signal('');
  isAddingAccount = signal(false);


  availableDegreePrograms = signal<string[]>([]);

  /** Accounts filtered by search query (name, email, or student/staff ID) plus department and course filters. */
  readonly filteredAccounts = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const dept = this.departmentFilter().trim().toLowerCase();
    const course = this.courseFilter().trim().toLowerCase();

    return this.accounts().filter((a) => {
      if (q) {
        const matchesQuery =
          a.full_name.toLowerCase().includes(q) ||
          a.email.toLowerCase().includes(q) ||
          a.student_id.toLowerCase().includes(q);
        if (!matchesQuery) return false;
      }
      if (dept && (a.department_name ?? '').toLowerCase() !== dept) return false;
      if (course && (a.degree_program ?? '').toLowerCase() !== course) return false;
      return true;
    });
  });

  /** Paged accounts for display. */
  readonly pagedAccounts = computed(() => {
    const list = this.filteredAccounts();
    const start = (this.currentPage() - 1) * this.pageSize;
    return list.slice(start, start + this.pageSize);
  });

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filteredAccounts().length / this.pageSize)));

  ngOnInit(): void {
    this.loadAccounts();
    this.loadDegreePrograms();
    this.loadDepartments();
  }

  async loadAccounts(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, student_id, mobile, role, degree_program, department_name, department_abbreviation, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = (data || []) as Account[];
      this.accounts.set(rows);
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

  /** Load all distinct departments from the degree_programs catalog so the
   *  department filter shows every available department, not just the ones
   *  already assigned to loaded accounts. */
  async loadDepartments(): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('degree_programs')
        .select('department')
        .not('department', 'is', null);

      if (error) throw error;

      const departments = [...new Set((data || []).map((d: any) => d.department).filter(Boolean))].sort();
      this.availableDepartments.set(departments);
    } catch (err) {
      console.error('[AccountsManagement] Failed to load departments:', err);
    }
  }

  deleteAccount(account: Account): void {
    this.confirmPayload.set({ action: 'deleteAccount', account });
    this.confirmTitle.set('Delete account?');
    this.confirmMessage.set(`This will remove <strong>${account.full_name}</strong>. This cannot be undone.`);
    this.confirmLabel.set('Delete');
    this.confirmDialogOpen.set(true);
    this.cdr.markForCheck();
  }

  /** Perform the confirmed account deletion on Supabase. Deletes the profile row.
   *  The matching Supabase Auth account is left behind but cannot log in without
   *  a profile (harmless orphan). Edge Function/service-role setup can be added
   *  later if you want full Auth deletion too. */
  private async performDeleteAccount(account: Account): Promise<void> {
    this.isDeleting.set(account.id);
    try {
      const { error } = await supabase.from('profiles').delete().eq('id', account.id);
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

  /** Run the action the user confirmed in the confirm dialog. */
  async handleConfirm(): Promise<void> {
    const payload = this.confirmPayload();
    if (!payload) return;

    this.confirmIsDeleting.set(true);
    try {
      if (payload.action === 'deleteAccount') {
        await this.performDeleteAccount(payload.account);
      }
    } catch (err) {
      console.error('[AccountsManagement] Confirmed action failed:', err);
      alert('Action failed. Please try again.');
    } finally {
      this.confirmIsDeleting.set(false);
      this.confirmDialogOpen.set(false);
      this.confirmPayload.set(null);
      this.cdr.markForCheck();
    }
  }

  /** Cancel the confirm dialog. */
  handleConfirmCancel(): void {
    this.confirmDialogOpen.set(false);
    this.confirmPayload.set(null);
    this.confirmIsDeleting.set(false);
    this.cdr.markForCheck();
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
      this.showAddPassword.set(false);
      this.showAddConfirmPassword.set(false);
      this.addErrors.set({});
      this.addSubmitError.set('');
      this.addDeptName.set(null);
      this.addDeptAbbrev.set(null);
    }
  }

  setAddRole(role: 'student' | 'admin'): void {
    this.addForm.update(f => ({ ...f, role, degreeProgram: '', password: '', confirmPassword: '' }));
    this.showAddPassword.set(false);
    this.showAddConfirmPassword.set(false);
    this.addErrors.set({});
    this.addSubmitError.set('');
    this.addDeptName.set(null);
    this.addDeptAbbrev.set(null);
  }

  toggleAddPasswordVisibility(): void {
    this.showAddPassword.update(v => !v);
  }

  toggleAddConfirmPasswordVisibility(): void {
    this.showAddConfirmPassword.update(v => !v);
  }

  /** Department name for the currently selected add-account degree program. */
  addDeptName = signal<string | null>(null);

  /** Department abbreviation for the currently selected add-account degree program. */
  addDeptAbbrev = signal<string | null>(null);

  /** Password requirement states for the add-account admin password field. */
  passwordRequirements = computed<PasswordRequirements>(() => {
    const pw = this.addForm().password;
    return {
      length: pw.length >= 6,
      number: /\d/.test(pw),
      special: /[^a-zA-Z0-9]/.test(pw),
      uppercase: /[A-Z]/.test(pw),
    };
  });

  /** Trigger department lookup when degree program changes. */
  onAddDegreeProgramChange(prog: string): void {
    this.addForm.update(f => ({ ...f, degreeProgram: prog }));
    this.addDeptName.set(null);
    this.addDeptAbbrev.set(null);
    this.lookupAddDegreeDept(prog);
  }

  private async lookupAddDegreeDept(program: string): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('degree_programs')
        .select('department, department_abbreviation')
        .eq('name', program)
        .single();
      if (!error && data) {
        this.addDeptName.set(data.department ?? null);
        this.addDeptAbbrev.set(data.department_abbreviation ?? null);
      } else {
        this.addDeptName.set(null);
        this.addDeptAbbrev.set(null);
      }
    } catch {
      this.addDeptName.set(null);
      this.addDeptAbbrev.set(null);
    }
  }

  onFieldChange(field: string, value: string): void {
    this.addForm.update(f => ({ ...f, [field]: value }));
    this.addErrors.update(e => {
      const { [field]: _, ...rest } = e;
      return rest;
    });
    this.addSubmitError.set('');
  }

  /** Strip non-digits and cap at 11 digits as the user types. Only clean digits are stored and shown. */
  onAddMobileInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const digits = target.value.replace(/\D/g, '').slice(0, 11);
    target.value = digits;
    this.addForm.update(f => ({ ...f, mobile: digits }));
    this.addErrors.update(e => {
      const { mobile: _, ...rest } = e;
      return rest;
    });
    this.addSubmitError.set('');
  }

  /** Strip non-digits from pasted text so only clean digits (max 11) are stored. */
  onAddMobilePaste(event: ClipboardEvent): void {
    event.preventDefault();
    const clipboard = event.clipboardData;
    if (!clipboard) return;
    const digits = clipboard.getData('text').replace(/\D/g, '').slice(0, 11);
    if (!digits) return;

    const target = event.target as HTMLInputElement;
    target.value = digits;

    const inputEvent = new Event('input', { bubbles: true });
    target.dispatchEvent(inputEvent);
  }

  formatEditMobile(raw: string): void {
    this.editForm.update(f => ({ ...f, mobile: this.formatMobileValue(raw) }));
    this.editErrors.update(e => {
      const { mobile: _, ...rest } = e;
      return rest;
    });
    this.editSubmitError.set('');
  }

  private formatMobileValue(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    // Cap at 11 digits (PH mobile max: 09XXXXXXXXX) before stripping prefixes
    let d = digits.slice(0, 11);
    if (d.startsWith('63')) d = d.slice(2);
    else if (d.startsWith('0')) d = d.slice(1);

    if (!d) return '';

    const p1 = d.slice(0, 3);
    const p2 = d.slice(3, 6);
    const p3 = d.slice(6, 10);

    let out = '';
    if (p1) out += '(' + p1;
    if (p2) out += ') ' + p2;
    if (p3) out += '-' + p3;
    return out;
  }

  /** Strip all non-digits so the value fits an integer mobile column. */
  private sanitizeMobile(raw: string): string {
    return raw.replace(/\D/g, '');
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
      // Resolve department info from degree_programs (mirrors auth.service.ts registration logic).
      let departmentName: string | null = null;
      let departmentAbbreviation: string | null = null;
      let practicumHours: number | null = null;

      if (this.editForm().role === 'student' && this.editForm().degreeProgram) {
        const { data: degRow, error: degError } = await supabase
          .from('degree_programs')
          .select('department, department_abbreviation, practicum_hours')
          .eq('name', this.editForm().degreeProgram)
          .single();

        if (!degError && degRow) {
          departmentName = degRow.department ?? null;
          departmentAbbreviation = degRow.department_abbreviation ?? null;
          practicumHours = degRow.practicum_hours ?? null;
        } else {
          console.warn('[AccountsManagement] No degree_program match for department lookup:', degError?.message ?? 'not found');
        }
      }

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
          mobile: this.sanitizeMobile(this.editForm().mobile),
          role: this.editForm().role,
          degree_program: this.editForm().role === 'admin' ? 'GLOCAL' : (this.editForm().role === 'student' ? this.editForm().degreeProgram : null),
          department_name: departmentName,
          department_abbreviation: departmentAbbreviation,
          practicum_hours: practicumHours,
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

    // Students get the default password Internlink.1 when no password is entered.
    // Admin accounts require the admin to type their own password.
    if (this.addForm().role === 'student' && !this.addForm().password?.trim()) {
      this.addForm.update(f => ({ ...f, password: 'Internlink.1', confirmPassword: 'Internlink.1' }));
    }

    if (!this.addForm().password) {
      this.addErrors.update(e => ({ ...e, password: 'Password is required.' }));
      valid = false;
    } else {
      const req = this.passwordRequirements();
      let pwError = '';
      if (!req.length) pwError = 'Password must be at least 6 characters.';
      else if (!req.number) pwError = 'Password must contain at least 1 number.';
      else if (!req.special) pwError = 'Password must contain at least 1 special character.';
      else if (!req.uppercase) pwError = 'Password must contain at least 1 uppercase letter.';

      if (pwError) {
        this.addErrors.update(e => ({ ...e, password: pwError }));
        valid = false;
      }
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
        mobile: this.sanitizeMobile(this.addForm().mobile),
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

  /** Reset to page 1 whenever filters change. */
  private resetPage(): void {
    this.currentPage.set(1);
    this.cdr.markForCheck();
  }

  onSearchChange(value: string): void {
    this.searchQuery.set(value);
    this.resetPage();
  }

  onDepartmentChange(value: string): void {
    this.departmentFilter.set(value);
    this.resetPage();
  }

  onCourseChange(value: string): void {
    this.courseFilter.set(value);
    this.resetPage();
  }

  previousPage(): void {
    if (this.currentPage() > 1) this.currentPage.update((p) => p - 1);
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages()) this.currentPage.update((p) => p + 1);
  }

  roleBadgeClass(role: string): string {
    const base = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border';
    if (role === 'admin') return `${base} border-amber-100 bg-amber-50 text-amber-700`;
    return `${base} border-slate-100 bg-slate-50 text-slate-500`;
  }
}
