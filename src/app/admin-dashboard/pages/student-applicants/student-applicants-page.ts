import { ChangeDetectorRef, Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { supabase } from '../../../../environments/supabase.config';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { AuditLogService } from '../../../shared/services/audit-log.service';

type ApplicationStatus = 'under-review' | 'approved' | 'requirements-incomplete' | 'removal-requested';

interface Applicant {
  id: string;
  refNumber: string;
  name: string;
  studentId: string;
  degreeProgram: string;
  company: string;
  role: string;
  documentsComplete: string;
  documentsStatus: 'all-verified' | 'partial' | 'rejected' | 'none';
  uploadedFiles: string[];
  status: ApplicationStatus;
  statusLabel: string;
  submittedAt: string;
}

interface RequirementRow {
  student_id: string;
  status: string;
  file_name: string | null;
  requirement_name: string;
}

interface StudentRequirements {
  total: number;
  verified: number;
  rejected: number;
  pending: number;
  uploadedFiles: string[];
}

@Component({
  selector: 'app-student-applicants-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmDialogComponent],
  templateUrl: './student-applicants-page.component.html',
})
export class StudentApplicantsPageComponent implements OnInit, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly auditLog = inject(AuditLogService);

  private applicantsSubscription: any = null;
  private requirementsSubscription: any = null;

  applicants = signal<Applicant[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  isDeletingApplicant = signal<string | null>(null);

  searchQuery = signal('');
  statusFilter = signal<ApplicationStatus | ''>('');
  departmentFilter = signal('');
  programFilter = signal('all');
  degreePrograms = signal<string[]>([]);
  degreeToDeptMap = signal<Record<string, string>>({});

  /** Applicants filtered by search + status + department + degree-program dropdowns. */
  filteredApplicants = computed(() => {
    const list = this.applicants();
    const q = (this.searchQuery() || '').toLowerCase();
    const status = this.statusFilter();
    const program = (this.programFilter() || '').toLowerCase();
    const department = this.departmentFilter();
    const deptMap = this.degreeToDeptMap();

    return list.filter((a) => {
      const matchSearch =
        !q ||
        a.refNumber.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q);
      const matchStatus = !status || a.status === status;
      const matchProgram =
        !program || program === 'all' || a.degreeProgram.toLowerCase().includes(program);
      const applicantDept = deptMap[a.degreeProgram || ''] || '';
      const matchDepartment = !department || applicantDept === department;
      return matchSearch && matchStatus && matchProgram && matchDepartment;
    });
  });

  /** Unique departments from degree_programs (excludes GLOCAL — admin-only department). */
  readonly availableDepartments = computed(() => {
    return [...new Set(Object.values(this.degreeToDeptMap()))]
      .filter((dept) => Boolean(dept) && dept !== 'GLOCAL')
      .sort();
  });

  // Review & Decision modal state
  showReviewModal = signal(false);
  reviewApplicant = signal<Applicant | null>(null);
  reviewDecision = signal<'approved' | 'rejected' | 'requirements-incomplete' | 'under-review' | 'removal-requested' | ''>('');
  reviewNotes = signal('');
  isSavingReview = signal(false);

  // Confirm dialog state (replaces native confirm() popups).
  confirmDialogOpen = signal(false);
  confirmPayload = signal<{ action: 'deleteApplicant'; applicant: Applicant } | { action: 'saveReviewDecision'; applicant: Applicant; newStatus: ApplicationStatus } | { action: 'approveRemoval'; applicant: Applicant } | { action: 'dismissRemovalRequest'; applicant: Applicant } | null>(null);
  confirmIsDeleting = signal(false);

  confirmTitle = signal('');
  confirmMessage = signal('');
  confirmLabel = signal('Delete');

  // Add applicant modal state
  showAddApplicant = signal(false);
  addForm = signal<{
    studentId: string;
    referenceNumber: string;
    hostCompany: string;
    positionRole: string;
    status: ApplicationStatus;
  }>({
    studentId: '',
    referenceNumber: '',
    hostCompany: '',
    positionRole: '',
    status: 'under-review',
  });
  isAddingApplicant = signal(false);
  addErrors = signal<Record<string, string>>({});
  addSubmitError = signal('');

  /** Student profiles (role = 'student') used for the add-applicant student dropdown. */
  availableStudents = signal<{
    id: string;
    student_id: string;
    full_name: string;
    degree_program: string | null;
  }[]>([]);

  trackByApplicant = (_: number, applicant: Applicant): string => applicant.refNumber;

  trackByString = (_: number, s: string): string => s;

  /** Open the Review & Decision modal for a specific applicant. */
  onReviewDecision(applicant: Applicant): void {
    this.reviewApplicant.set(applicant);
    this.reviewDecision.set(applicant.status);
    this.reviewNotes.set('');
    this.showReviewModal.set(true);
    this.cdr.markForCheck();
  }

  /** Close the Review & Decision modal. */
  closeReviewModal(): void {
    this.showReviewModal.set(false);
    this.reviewApplicant.set(null);
    this.reviewDecision.set('');
    this.reviewNotes.set('');
    this.cdr.markForCheck();
  }

  /** Request confirmation before saving the review decision. */
  saveReviewDecision(): void {
    const applicant = this.reviewApplicant();
    const decision = this.reviewDecision();
    if (!applicant || !decision) return;

    this.confirmPayload.set({ action: 'saveReviewDecision', applicant, newStatus: decision as any });
    this.confirmTitle.set('Confirm decision?');
    this.confirmMessage.set(`This will record the <strong>${decision}</strong> decision for <strong>${applicant.name}</strong>.`);
    this.confirmLabel.set('Confirm');
    this.confirmDialogOpen.set(true);
    this.cdr.markForCheck();
  }

  /** Perform the confirmed review decision save on Supabase. */
  private async performSaveReviewDecision(applicant: Applicant, decision: ApplicationStatus): Promise<void> {
    this.isSavingReview.set(true);
    try {
      const oldValues = {
        status: applicant.status,
        admin_notes: (applicant as any).admin_notes ?? null,
      };
      const newValues = { status: decision, admin_notes: this.reviewNotes() || null };

      const { error } = await supabase
        .from('internship_applications')
        .update(newValues)
        .eq('id', applicant.id);

      if (error) throw error;

      await this.auditLog.logActivity({
        actionType: 'update',
        tableName: 'internship_applications',
        recordId: applicant.id,
        oldValues,
        newValues,
      });

      this.closeReviewModal();
      await this.loadApplicants(); // refresh via signal + realtime will also pick it up
      this.cdr.markForCheck();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save decision.';
      console.error('[StudentApplicants] Save review decision failed:', message);
      alert(`Failed to save decision: ${message}`);
    } finally {
      this.isSavingReview.set(false);
    }
  }

  /** Request confirmation before deleting an applicant from Supabase. */
  deleteApplicant(applicant: Applicant): void {
    this.confirmPayload.set({ action: 'deleteApplicant', applicant });
    this.confirmTitle.set('Delete application?');
    this.confirmMessage.set(`This will remove <strong>${applicant.name}</strong>. This cannot be undone.`);
    this.confirmLabel.set('Delete');
    this.confirmDialogOpen.set(true);
    this.cdr.markForCheck();
  }

  /** Request admin approval to actually delete a removal-requested application. */
  approveRemoval(applicant: Applicant): void {
    this.confirmPayload.set({ action: 'approveRemoval', applicant });
    this.confirmTitle.set('Approve removal?');
    this.confirmMessage.set(`This will permanently delete the application for <strong>${applicant.name}</strong>. This cannot be undone.`);
    this.confirmLabel.set('Approve Removal');
    this.confirmDialogOpen.set(true);
    this.cdr.markForCheck();
  }

  /** Request confirmation before dismissing a removal request (revert to under-review). */
  dismissRemovalRequest(applicant: Applicant): void {
    this.confirmPayload.set({ action: 'dismissRemovalRequest', applicant });
    this.confirmTitle.set('Dismiss removal request?');
    this.confirmMessage.set(`This will reject the removal request and return <strong>${applicant.name}</strong>'s application to under review.`);
    this.confirmLabel.set('Dismiss Request');
    this.confirmDialogOpen.set(true);
    this.cdr.markForCheck();
  }

  /** Run the action the user confirmed in the confirm dialog. */
  async handleConfirm(): Promise<void> {
    const payload = this.confirmPayload();
    if (!payload) return;

    this.confirmIsDeleting.set(true);
    try {
      if (payload.action === 'deleteApplicant') {
        const applicant = payload.applicant;
        const oldValues = {
          refNumber: applicant.refNumber,
          name: applicant.name,
          studentId: applicant.studentId,
          company: applicant.company,
          role: applicant.role,
          status: applicant.status,
        };

        const { error } = await supabase.from('internship_applications').delete().eq('id', applicant.id);
        if (error) throw error;

        await this.auditLog.logActivity({
          actionType: 'delete',
          tableName: 'internship_applications',
          recordId: applicant.id,
          oldValues,
          newValues: null,
        });

        await this.loadApplicants(); // realtime will also pick up the deletion
      } else if (payload.action === 'approveRemoval') {
        const applicant = payload.applicant;
        const oldValues = {
          refNumber: applicant.refNumber,
          name: applicant.name,
          studentId: applicant.studentId,
          company: applicant.company,
          role: applicant.role,
          status: applicant.status,
        };

        const { error } = await supabase.from('internship_applications').delete().eq('id', applicant.id);
        if (error) throw error;

        await this.auditLog.logActivity({
          actionType: 'delete',
          tableName: 'internship_applications',
          recordId: applicant.id,
          oldValues,
          newValues: null,
        });

        await this.loadApplicants(); // realtime will also pick up the deletion
      } else if (payload.action === 'dismissRemovalRequest') {
        const applicant = payload.applicant;
        const oldValues = {
          status: applicant.status,
          admin_notes: (applicant as any).admin_notes ?? null,
        };
        const newValues = { status: 'under-review', admin_notes: null };

        const { error } = await supabase
          .from('internship_applications')
          .update(newValues)
          .eq('id', applicant.id);
        if (error) throw error;

        await this.auditLog.logActivity({
          actionType: 'update',
          tableName: 'internship_applications',
          recordId: applicant.id,
          oldValues,
          newValues,
        });

        await this.loadApplicants(); // realtime will also pick up the status change
      } else if (payload.action === 'saveReviewDecision') {
        this.closeReviewModal();
        await this.performSaveReviewDecision(payload.applicant, payload.newStatus);
      }
    } catch (err) {
      console.error('[StudentApplicants] Confirmed action failed:', err);
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

  /** Open the add applicant modal. */
  openAddApplicant(): void {
    this.addForm.set({
      studentId: '',
      referenceNumber: '',
      hostCompany: '',
      positionRole: '',
      status: 'under-review',
    });
    this.addErrors.set({});
    this.addSubmitError.set('');
    this.showAddApplicant.set(true);
    this.cdr.markForCheck();
  }

  /** Close the add applicant modal. */
  closeAddApplicant(): void {
    this.showAddApplicant.set(false);
    this.addForm.set({
      studentId: '',
      referenceNumber: '',
      hostCompany: '',
      positionRole: '',
      status: 'under-review',
    });
    this.addErrors.set({});
    this.addSubmitError.set('');
    this.cdr.markForCheck();
  }

  /** Handle student selection change in the add-applicant modal. */
  onAddStudentChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.addForm.update((f) => ({ ...f, studentId: (target.value || '').trim() }));
    this.clearAddErrors();
  }

  /** Handle reference number input change in the add-applicant modal. */
  onAddReferenceNumberChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.addForm.update((f) => ({ ...f, referenceNumber: (target.value || '').trim() }));
    this.clearAddErrors();
  }

  /** Handle host company input change in the add-applicant modal. */
  onAddHostCompanyChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.addForm.update((f) => ({ ...f, hostCompany: (target.value || '').trim() }));
    this.clearAddErrors();
  }

  /** Handle position role input change in the add-applicant modal. */
  onAddPositionRoleChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.addForm.update((f) => ({ ...f, positionRole: (target.value || '').trim() }));
    this.clearAddErrors();
  }

  /** Handle status select change in the add-applicant modal. */
  onAddStatusChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.addForm.update((f) => ({ ...f, status: (target.value || 'under-review') as ApplicationStatus }));
    this.clearAddErrors();
  }

  /** Clear field-level error for the given field as the user types. */
  clearAddFieldError(field: string): void {
    this.addErrors.update((e) => {
      const { [field]: _, ...rest } = e;
      return rest;
    });
    this.addSubmitError.set('');
  }

  /** Clear all field-level + submit errors for the add-applicant modal. */
  clearAddErrors(): void {
    this.addErrors.set({});
    this.addSubmitError.set('');
  }

  /** Save the new applicant: validate fields, look up student name/degree program,
   *  insert into internship_applications, audit log create, reload list. */
  async onAddApplicantSubmit(): Promise<void> {
    this.clearAddErrors();

    let valid = true;

    if (!this.addForm().studentId?.trim()) {
      this.addErrors.update((e) => ({ ...e, studentId: 'Please select a student.' }));
      valid = false;
    }

    if (!this.addForm().referenceNumber?.trim()) {
      this.addErrors.update((e) => ({ ...e, referenceNumber: 'Reference number is required.' }));
      valid = false;
    }

    if (!this.addForm().hostCompany?.trim()) {
      this.addErrors.update((e) => ({ ...e, hostCompany: 'Host company is required.' }));
      valid = false;
    }

    if (!this.addForm().positionRole?.trim()) {
      this.addErrors.update((e) => ({ ...e, positionRole: 'Position/role is required.' }));
      valid = false;
    }

    if (!valid) return;

    this.isAddingApplicant.set(true);

    try {
      // Resolve the selected student's name and degree program (stored directly on the row
      // to avoid joining profiles, which triggers RLS recursion in this codebase).
      let studentName = '—';
      let degreeProgram = (null as unknown) as string | null;

      const student = this.availableStudents().find((s) => s.student_id === this.addForm().studentId);
      if (student) {
        studentName = student.full_name;
        degreeProgram = student.degree_program ?? null;
      }

      const { error: insertError } = await supabase
        .from('internship_applications')
        .insert({
          student_id: this.addForm().studentId.trim(),
          student_name: studentName,
          degree_program: degreeProgram,
          reference_number: this.addForm().referenceNumber.trim(),
          host_company: this.addForm().hostCompany.trim(),
          position_role: this.addForm().positionRole.trim(),
          status: this.addForm().status,
          submitted_at: new Date().toISOString(),
        });

      if (insertError) throw insertError;

      // Audit log the create action (best-effort; never blocks the UI).
      try {
        const insertedId = 'new-application'; // best-effort only; record_id is informational
        await this.auditLog.logActivity({
          actionType: 'create',
          tableName: 'internship_applications',
          recordId: insertedId,
          oldValues: null,
          newValues: {
            student_id: this.addForm().studentId.trim(),
            student_name: studentName,
            degree_program: degreeProgram,
            reference_number: this.addForm().referenceNumber.trim(),
            host_company: this.addForm().hostCompany.trim(),
            position_role: this.addForm().positionRole.trim(),
            status: this.addForm().status,
            submitted_at: new Date().toISOString(),
          },
        });
      } catch (auditErr) {
        console.error('[StudentApplicants] Audit log (create) failed:', auditErr);
      }

      this.closeAddApplicant();
      await this.loadApplicants(); // refresh list so the new applicant appears
      this.cdr.markForCheck();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add applicant.';
      console.error('[StudentApplicants] Add applicant failed:', message);
      this.addSubmitError.set(message);
    } finally {
      this.isAddingApplicant.set(false);
    }
  }

  async ngOnInit(): Promise<void> {
    await this.loadApplicants();
    await this.loadDegreePrograms();
    await this.loadStudents();
    this.subscribeToUpdates();
  }

  ngOnDestroy(): void {
    if (this.applicantsSubscription) {
      supabase.removeChannel(this.applicantsSubscription);
      this.applicantsSubscription = null;
    }
    if (this.requirementsSubscription) {
      supabase.removeChannel(this.requirementsSubscription);
      this.requirementsSubscription = null;
    }
  }

  /** Fetch degree programs from the database so the filter dropdown reflects
   *  every degree actually in the system, not a hardcoded list. */
  async loadDegreePrograms(): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('degree_programs')
        .select('name, department, department_abbreviation')
        .order('name', { ascending: true });

      if (error) throw error;

      const programs = ((data || []) as { name: string; department: string | null }[])
        .map((r) => ({ name: r.name, department: r.department }))
        .filter((r) => Boolean(r.name) && r.name !== 'GLOCAL');

      this.degreePrograms.set(programs.map((p) => p.name));

      // Build degree -> department map so each applicant's department can be derived
      // from their degree program for the department filter.
      const deptMap: Record<string, string> = {};
      programs.forEach((p) => {
        deptMap[p.name] = p.department || 'Other';
      });
      this.degreeToDeptMap.set(deptMap);

      this.cdr.markForCheck();
    } catch (err) {
      console.error('[StudentApplicants] Error loading degree programs:', err);
      // Leave the dropdown with just "All USLT Programs" if the fetch fails.
    }
  }

  /** Load student profiles for the add-applicant student dropdown. */
  async loadStudents(): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, student_id, full_name, degree_program')
        .eq('role', 'student')
        .order('full_name', { ascending: true });

      if (error) throw error;

      const students = (data || []) as {
        id: string;
        student_id: string;
        full_name: string;
        degree_program: string | null;
      }[];
      this.availableStudents.set(students);
    } catch (err) {
      console.error('[StudentApplicants] Failed to load students:', err);
      // Non-blocking: the dropdown will simply be empty.
    }
  }

  /** Fetch all applications with student info, plus requirement counts per student.
   *  degree_program is read directly from the applications table (no profiles join — avoids RLS recursion). */
  async loadApplicants(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const { data: rows, error: appsError } = await supabase
        .from('internship_applications')
        .select(`
          id,
          reference_number,
          host_company,
          position_role,
          status,
          submitted_at,
          student_id,
          degree_program,
          student_name
        `)
        .order('submitted_at', { ascending: false });

      if (appsError) throw appsError;

      const applications = (rows || []) as any[];

      // Fetch requirements to compute per-student document status and uploaded files.
      const { data: reqs, error: reqsError } = await supabase
        .from('student_requirements')
        .select('student_id, status, file_name, requirement_name');

      if (reqsError) throw reqsError;

      const requirements = (reqs || []) as RequirementRow[];

      // Group requirements by student_id -> detailed status + uploaded file names.
      const studentReqs: Record<string, StudentRequirements> = {};
      requirements.forEach((r) => {
        const sid = r.student_id;
        if (!sid) return;
        if (!studentReqs[sid]) {
          studentReqs[sid] = { total: 0, verified: 0, rejected: 0, pending: 0, uploadedFiles: [] };
        }
        studentReqs[sid].total += 1;
        if (r.status === 'verified') studentReqs[sid].verified += 1;
        else if (r.status === 'rejected') studentReqs[sid].rejected += 1;
        else studentReqs[sid].pending += 1;
        if (r.file_name) studentReqs[sid].uploadedFiles.push(r.file_name);
      });

      const mapped = applications.map((a) => {
        return this.mapApplicant({ ...a, degree_program: a.degree_program || null }, null, studentReqs[a.student_id]);
      });

      // Unresolved (under-review) applications stay at the top; decided ones
      // (approved / requirements-incomplete) sink to the bottom, newest first
      // within each group.
      mapped.sort((a, b) => {
        const aNeedsDecision = a.status === 'under-review';
        const bNeedsDecision = b.status === 'under-review';
        if (aNeedsDecision && !bNeedsDecision) return -1;
        if (!aNeedsDecision && bNeedsDecision) return 1;
        return (b.submittedAt || '').localeCompare(a.submittedAt || '');
      });

      this.applicants.set(mapped);

      this.cdr.markForCheck();
    } catch (err) {
      console.error('[StudentApplicants] Error loading applicants:', err);
      this.error.set(err instanceof Error ? err.message : 'Failed to load applicants.');
    } finally {
      this.loading.set(false);
    }
  }

  /** Map a raw application row + optional profile + per-student requirements to the UI Applicant shape. */
  private mapApplicant(
    a: any,
    profile: { full_name: string | null; student_id: string | null; degree_program: string | null; email: string | null } | null,
    reqs: StudentRequirements | null
  ): Applicant {
    const appStatus = (a.status || '').toLowerCase();

    let status: ApplicationStatus;
    let statusLabel: string;

    if (appStatus === 'approved') {
      status = 'approved';
      statusLabel = 'Approved';
    } else if (appStatus === 'submitted' || appStatus === 'pending' || appStatus === 'under-review') {
      status = 'under-review';
      statusLabel = 'Under Review';
    } else if (appStatus === 'removal-requested') {
      status = 'removal-requested';
      statusLabel = 'Removal Requested';
    } else {
      status = 'requirements-incomplete';
      statusLabel = 'Requirements Incomplete';
    }

    const total = reqs?.total || 0;
    const verified = reqs?.verified || 0;
    const rejected = reqs?.rejected || 0;
    const pending = reqs?.pending || 0;

    let documentsStatus: 'all-verified' | 'partial' | 'rejected' | 'none';
    if (total === 0) {
      documentsStatus = 'none';
    } else if (rejected > 0 && verified === 0) {
      documentsStatus = 'rejected';
    } else if (verified === total) {
      documentsStatus = 'all-verified';
    } else {
      documentsStatus = 'partial';
    }

    const documentsComplete =
      total > 0
        ? `${verified}/${total} uploaded`
        : 'No documents';

    return {
      id: a.id,
      refNumber: a.reference_number || '—',
      name: a.student_name || '—',
      studentId: profile?.student_id || a.student_id || '—',
      degreeProgram: a.degree_program || profile?.degree_program || '—',
      company: a.host_company || '—',
      role: a.position_role || '—',
      documentsComplete,
      documentsStatus,
      uploadedFiles: reqs?.uploadedFiles || [],
      status,
      statusLabel,
      submittedAt: a.submitted_at || '',
    };
  }

  /** CSS classes for the documents status pill. */
  documentsPillClass(docStatus: 'all-verified' | 'partial' | 'rejected' | 'none'): string {
    const base = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[0.7rem] font-bold uppercase tracking-wider border';
    if (docStatus === 'all-verified') return `${base} border-emerald-100 bg-emerald-50 text-emerald-700`;
    if (docStatus === 'rejected') return `${base} border-rose-100 bg-rose-50 text-rose-700`;
    if (docStatus === 'partial') return `${base} border-amber-100 bg-amber-50 text-amber-700`;
    return `${base} border-slate-100 bg-slate-50 text-slate-500`;
  }

  /** Dot color for the documents status pill. */
  documentsPillDotClass(docStatus: 'all-verified' | 'partial' | 'rejected' | 'none'): string {
    if (docStatus === 'all-verified') return 'h-1.5 w-1.5 rounded-full bg-emerald-600';
    if (docStatus === 'rejected') return 'h-1.5 w-1.5 rounded-full bg-rose-600';
    if (docStatus === 'partial') return 'h-1.5 w-1.5 rounded-full bg-amber-500';
    return 'h-1.5 w-1.5 rounded-full bg-slate-400';
  }

  /** Label for the documents status pill. */
  documentsPillLabel(docStatus: 'all-verified' | 'partial' | 'rejected' | 'none'): string {
    if (docStatus === 'all-verified') return 'All Verified';
    if (docStatus === 'rejected') return 'Rejected';
    if (docStatus === 'partial') return 'Partially Uploaded';
    return 'No Documents';
  }

  /** Subscribe to real-time application and requirement changes so the list updates live. */
  private subscribeToUpdates(): void {
    // New applications and application status updates (admin approves/rejects).
    this.applicantsSubscription = supabase
      .channel('admin-student-applicants-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'internship_applications' },
        () => {
          console.log('[StudentApplicants] Realtime event (internship_applications): refreshing list.');
          void this.loadApplicants();
        }
      )
      .subscribe((status) => {
        console.log('[StudentApplicants] Realtime channel (internship_applications) status:', status);
      });

    // Requirement status changes (documents verified/rejected) affect documents-complete counts.
    this.requirementsSubscription = supabase
      .channel('admin-student-requirements-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'student_requirements' },
        () => {
          console.log('[StudentApplicants] Realtime event (student_requirements): refreshing list.');
          void this.loadApplicants();
        }
      )
      .subscribe((status) => {
        console.log('[StudentApplicants] Realtime channel (student_requirements) status:', status);
      });
  }
}
