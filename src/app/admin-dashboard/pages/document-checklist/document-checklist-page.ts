import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { supabase } from '../../../../environments/supabase.config';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { AuditLogService } from '../../../shared/services/audit-log.service';

type DocumentStatus = 'verified' | 'pending' | 'rejected';

const STORAGE_BUCKET = 'internship-documents';

interface DocumentItem {
  id: string;
  studentId: string;
  requirementTitle: string;
  requirementType: string;
  studentName: string;
  degreeProgram: string;
  fileName: string;
  fileSize: string;
  fileUrl: string | null;
  uploadedDate: string;
  uploadedAtRaw: string;
  status: DocumentStatus;
  statusLabel: string;
}

/** All document requirements belonging to a single student — shown as one table row. */
interface StudentDocumentGroup {
  studentId: string;
  studentName: string;
  degreeProgram: string;
  requirements: DocumentItem[];
}

@Component({
  selector: 'app-document-checklist-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmDialogComponent],
  templateUrl: './document-checklist-page.component.html',
})
export class DocumentChecklistPageComponent implements OnInit, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly auditLog = inject(AuditLogService);

  private documentsSubscription: any = null;

  students = signal<StudentDocumentGroup[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  isDeletingDocument = signal<string | null>(null);

  // Confirm dialog state (replaces native confirm() popups).
  confirmDialogOpen = signal(false);
  confirmPayload = signal<{ action: 'deleteDocument'; item: DocumentItem } | null>(null);
  confirmIsDeleting = signal(false);

  confirmTitle = signal('');
  confirmMessage = signal('');
  confirmLabel = signal('Delete');

  searchQuery = signal('');
  statusFilter = signal<DocumentStatus | ''>('');

  // Pagination
  pageSize = 15;
  currentPage = signal(1);

  // Add document requirement modal state
  showAddDocument = signal(false);
  addForm = signal<{ studentId: string; requirementName: string }>({
    studentId: '',
    requirementName: '',
  });
  addFile = signal<File | null>(null);
  isAddingDocument = signal(false);
  addErrors = signal<Record<string, string>>({});
  addSubmitError = signal('');

  /** Student profiles (role = 'student') used for the add-document student dropdown. */
  availableStudents = signal<{
    id: string;
    student_id: string;
    full_name: string;
    degree_program: string | null;
  }[]>([]);

  /** Students grouped by student, each with their document requirements, filtered by search + status. */
  filteredStudents = computed(() => {
    const groups = this.sortedStudents();
    const q = (this.searchQuery() || '').toLowerCase();
    const status = this.statusFilter();

    return groups.filter((g) => {
      const matchSearch = !q || g.studentName.toLowerCase().includes(q);
      const matchStatus = !status || g.requirements.some((r) => r.status === status);
      return matchSearch && matchStatus;
    });
  });

  /** Paged students for display. */
  readonly pagedStudents = computed(() => {
    const list = this.filteredStudents();
    const start = (this.currentPage() - 1) * this.pageSize;
    return list.slice(start, start + this.pageSize);
  });

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filteredStudents().length / this.pageSize)));

  trackByStudent = (_: number, group: StudentDocumentGroup): string => group.studentId;

  trackByRequirement = (_: number, req: DocumentItem): string => req.id;

  // Sort state
  sortColumn = signal<keyof StudentDocumentGroup | ''>('');
  sortDirection = signal<'asc' | 'desc' | ''>('');

  sortedStudents = computed(() => {
    const items = this.students();
    const column = this.sortColumn();
    const direction = this.sortDirection();
    if (!column || !direction) return items;

    return [...items].sort((a, b) => {
      const aVal = a[column];
      const bVal = b[column];
      if (aVal === bVal) return 0;
      const cmp = String(aVal).localeCompare(String(bVal));
      return direction === 'asc' ? cmp : -cmp;
    });
  });

  setSort(column: keyof StudentDocumentGroup): void {
    if (this.sortColumn() === column) {
      this.sortDirection.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set('asc');
    }
    this.resetPage();
    this.cdr.markForCheck();
  }

  /** Reset to page 1 whenever filters change. */
  private resetPage(): void {
    this.currentPage.set(1);
    this.cdr.markForCheck();
  }

  onSearchChange(value: string): void {
    this.searchQuery.set(value);
    this.resetPage();
  }

  onStatusChange(value: string): void {
    this.statusFilter.set(value as DocumentStatus | '');
    this.resetPage();
  }

  previousPage(): void {
    if (this.currentPage() > 1) this.currentPage.update((p) => p - 1);
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages()) this.currentPage.update((p) => p + 1);
  }


  // Document review modal state (per student)
  showDocumentModal = signal(false);
  reviewStudent = signal<StudentDocumentGroup | null>(null);
  reviewNotes = signal<Record<string, string>>({});
  isSavingDocument = signal(false);

  /** Get the comment for a specific requirement. */
  getCommentForRequirement(req: DocumentItem): string {
    return this.reviewNotes()[req.id] || '';
  }

  /** Requirements shown in the review modal — excludes rejected ones
   *  so a rejected file requirement drops out of admin view. */
  reviewRequirements = computed(() => {
    const group = this.reviewStudent();
    return group ? group.requirements.filter((r) => r.status !== 'rejected') : [];
  });

  async ngOnInit(): Promise<void> {
    await this.loadData();
    await this.loadStudents();
    this.subscribeToUpdates();
  }

  ngOnDestroy(): void {
    if (this.documentsSubscription) {
      supabase.removeChannel(this.documentsSubscription);
      this.documentsSubscription = null;
    }
  }

  /** Fetch all student requirements for the admin validation queue.
   *  student_name / degree_program are read directly (no profiles join — avoids RLS recursion). */
  async loadData(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      // Fetch requirements for all students.
      const { data: rows, error } = await supabase
        .from('student_requirements')
        .select(`
          id,
          student_id,
          requirement_name,
          file_name,
          file_url,
          status,
          updated_at
        `)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const requirements = (rows || []) as any[];

      // Fetch student names / degree programs from internship_applications so
      // the admin queue can display them (avoids the profiles self-join RLS recursion).
      // Also exclude students whose application is removal-requested — they are
      // being removed and shouldn't appear in the validation queue.
      const studentIds = [...new Set(requirements.map((r) => r.student_id).filter(Boolean))];
      const appMap = new Map<string, { student_name?: string | null; degree_program?: string | null; status?: string | null }>();
      if (studentIds.length > 0) {
        const { data: apps } = await supabase
          .from('internship_applications')
          .select('student_id, student_name, degree_program, status')
          .in('student_id', studentIds);
        (apps || []).forEach((a: any) => {
          const key = a.student_id;
          // Keep the latest application row per student.
          if (!appMap.has(key)) appMap.set(key, { student_name: a.student_name, degree_program: a.degree_program, status: a.status });
        });
      }

      // Filter out students whose application is removal-requested, and also
      // filter out orphaned requirement rows whose internship_applications row
      // no longer exists (e.g. standalone delete removed the application but
      // left requirement rows behind).
      const removalRequestedIds = new Set(
        [...appMap.entries()].filter(([, app]) => app.status === 'removal-requested').map(([sid]) => sid)
      );

      // Group requirements by student so each admin table row = one student.
      const groupMap = new Map<string, StudentDocumentGroup>();
      requirements.forEach((r) => {
        const key = r.student_id;
        const app = appMap.get(key);

        // Skip students whose application is removal-requested — they are being removed.
        if (removalRequestedIds.has(key)) return;

        // Skip orphaned requirements (application row was standalone-deleted).
        if (!app) return;

        if (!groupMap.has(key)) {
          groupMap.set(key, {
            studentId: r.student_id,
            studentName: app?.student_name || '—',
            degreeProgram: app?.degree_program || '—',
            requirements: [],
          });
        }
        groupMap.get(key)!.requirements.push(this.mapRequirement(r));
      });

      // Only show students who have actually uploaded at least one document file.
      // Students with requirement rows but no file yet stay hidden until they upload.
      const grouped = Array.from(groupMap.values())
        .filter((g) => g.requirements.some((r) => Boolean(r.fileName) && r.fileName !== 'No file'))
        .sort((a, b) => a.studentName.localeCompare(b.studentName));
      this.students.set(grouped);

      this.cdr.markForCheck();
    } catch (err) {
      console.error('[DocValidation] Error loading requirements:', err);
      this.error.set(err instanceof Error ? err.message : 'Failed to load document queue.');
    } finally {
      this.loading.set(false);
    }
  }

  /** Load student profiles for the add-document student dropdown. */
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
      console.error('[DocValidation] Failed to load students:', err);
      // Non-blocking: the dropdown will simply be empty.
    }
  }

  /** Map a raw requirement row to the UI DocumentItem shape. */
  private mapRequirement(r: any): DocumentItem {
    const status = (r.status || 'pending') as DocumentStatus;

    return {
      id: r.id,
      studentId: r.student_id,
      requirementTitle: r.requirement_name || '—',
      requirementType: r.requirement_name || '—',
      studentName: r.student_name || '—',
      degreeProgram: r.degree_program || '—',
      fileName: r.file_name || 'No file',
      fileSize: '',
      fileUrl: r.file_url || null,
      uploadedDate: r.updated_at ? new Date(r.updated_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—',
      uploadedAtRaw: r.updated_at || '',
      status,
      statusLabel: status.charAt(0).toUpperCase() + status.slice(1),
    };
  }

  /** Open the document review modal for a single student, listing all their requirements. */
  openReviewStudent(group: StudentDocumentGroup): void {
    this.reviewStudent.set(group);
    this.reviewNotes.set('');
    this.showDocumentModal.set(true);
    // Lock background scroll so the backdrop covers a static full screen.
    document.body.style.overflow = 'hidden';
    this.cdr.markForCheck();
  }

  /** Close the per-student document review modal. */
  closeReviewDocumentModal(): void {
    this.showDocumentModal.set(false);
    this.reviewStudent.set(null);
    this.reviewNotes.set('');
    document.body.style.overflow = '';
    this.cdr.markForCheck();
  }

  /** Open the document file in a new tab. Always generates a signed URL from Supabase storage
   *  so it works for both public and private buckets. */
  async openFile(url: string | null, fileName: string | null): Promise<void> {
    console.log('[DocValidation] Open file requested:', { url, fileName });

    if (!url) {
      console.warn('[DocValidation] No file URL stored — student may not have uploaded yet.');
      alert('No document file available to open.');
      return;
    }

    try {
      // Extract storage path from public URL: .../object/public/<bucket>/<path>
      const bucketMarker = `/object/public/${STORAGE_BUCKET}/`;
      const idx = url.indexOf(bucketMarker);
      if (idx === -1) {
        alert('Could not resolve document storage path.');
        return;
      }
      const storagePath = url.substring(idx + bucketMarker.length);

      const { data, error } = await supabase
        .storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(storagePath, 300); // 5 minutes expiry

      if (error) {
        console.error('[DocValidation] Signed URL failed:', error);
        alert('Could not generate document access link.');
        return;
      }

      const signedUrl = data?.signedUrl;
      if (signedUrl) {
        void window.open(signedUrl, '_blank');
      } else {
        alert('Unable to generate document access link.');
      }
    } catch (err) {
      console.error('[DocValidation] Failed to open file:', err);
      alert('Could not open the document. Please check the browser console.');
    }
  }

  /** Persist a single requirement's Verify / Reject decision + admin comment, then reload.
   *  When rejecting, the file is removed from storage and file_url/file_name are cleared
   *  so the student can resubmit a fresh file. */
  async decideRequirement(req: DocumentItem, decision: DocumentStatus): Promise<void> {
    const group = this.reviewStudent();
    if (!group || this.isSavingDocument()) return;

    this.isSavingDocument.set(true);

    try {
      const oldValues = {
        status: req.status,
        admin_notes: (req as any).admin_notes ?? null,
        fileUrl: req.fileUrl,
        fileName: req.fileName,
      };

      const updateValues: any = {
        status: decision,
        admin_notes: this.getCommentForRequirement(req) || null,
        updated_at: new Date().toISOString(),
      };

      // When rejecting, remove the file from storage and clear file info so student can resubmit.
      if (decision === 'rejected' && req.fileUrl) {
        try {
          const bucketMarker = `/object/public/${STORAGE_BUCKET}/`;
          const idx = req.fileUrl.indexOf(bucketMarker);
          if (idx !== -1) {
            const storagePath = req.fileUrl.substring(idx + bucketMarker.length);
            const { error: removeError } = await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
            if (removeError) {
              console.error('[DocValidation] Failed to delete rejected file from storage:', removeError);
            }
          }
        } catch (storageErr) {
          console.error('[DocValidation] Storage delete error on rejection:', storageErr);
          // Non-blocking — continue with the DB update even if storage delete fails.
        }
        updateValues.file_url = null;
        updateValues.file_name = null;
      }

      const { error } = await supabase
        .from('student_requirements')
        .update(updateValues)
        .eq('id', req.id);

      if (error) throw error;

      // Update the modal state instantly so the Verify/Reject pill flips without a reload.
      const currentGroup = this.reviewStudent();
      if (currentGroup) {
        this.reviewStudent.set({
          ...currentGroup,
          requirements: currentGroup.requirements.map((r) => {
            if (r.id !== req.id) return r;
            const statusLabel =
              decision === 'verified'
                ? 'Verified'
                : decision === 'rejected'
                  ? 'Rejected'
                  : decision.charAt(0).toUpperCase() + decision.slice(1);
            return { ...r, status: decision as DocumentStatus, statusLabel };
          }),
        });
        this.cdr.markForCheck();
      }

      // Clear the rejected requirement from the review modal immediately
      // so the admin doesn't need to reopen the modal or reload the page.
      if (decision === 'rejected') {
        const updatedGroup = this.reviewStudent();
        if (updatedGroup) {
          this.reviewStudent.set({
            ...updatedGroup,
            requirements: updatedGroup.requirements.filter((r) => r.id !== req.id),
          });
          this.cdr.markForCheck();
        }
      }

      // Audit log the per-requirement decision (best-effort).
      try {
        await this.auditLog.logActivity({
          actionType: 'update',
          tableName: 'student_requirements',
          recordId: req.id,
          oldValues,
          newValues: updateValues,
        });
      } catch (auditErr) {
        console.error('[DocValidation] Audit log (update) failed:', auditErr);
      }

      await this.loadData(); // refresh so status pills update live
      this.cdr.markForCheck();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save decision.';
      console.error('[DocValidation] Decide requirement failed:', message);
      alert(`Failed to save decision: ${message}`);
    } finally {
      this.isSavingDocument.set(false);
    }
  }  /** Clear field-level error for the given field as the user types. */
  clearAddFieldError(field: string): void {
    this.addErrors.update((e) => {
      const { [field]: _, ...rest } = e;
      return rest;
    });
    this.addSubmitError.set('');
  }

  /** Clear all field-level + submit errors for the add-document modal. */
  clearAddErrors(): void {
    this.addErrors.set({});
    this.addSubmitError.set('');
  }

  /** Handle student selection change in the add-document modal. */
  onAddStudentChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.addForm.update((f) => ({ ...f, studentId: (target.value || '').trim() }));
    this.clearAddErrors();
  }

  /** Handle requirement name input change in the add-document modal. */
  onAddRequirementChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.addForm.update((f) => ({ ...f, requirementName: (target.value || '').trim() }));
    this.clearAddErrors();
  }

  /** Open the add document requirement modal. */
  openAddDocument(): void {
    this.addForm.set({ studentId: '', requirementName: '' });
    this.addFile.set(null);
    this.addErrors.set({});
    this.addSubmitError.set('');
    this.showAddDocument.set(true);
    // Lock background scroll so the backdrop covers a static full screen.
    document.body.style.overflow = 'hidden';
    this.cdr.markForCheck();
  }

  /** Close the add document requirement modal. */
  closeAddDocument(): void {
    this.showAddDocument.set(false);
    this.addForm.set({ studentId: '', requirementName: '' });
    this.addFile.set(null);
    this.addErrors.set({});
    this.addSubmitError.set('');
    document.body.style.overflow = '';
    this.cdr.markForCheck();
  }

  /** Handle file selection for the add-document modal. */
  onAddFileSelected(event: Event): void {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0] ?? null;
    this.addFile.set(file);
    this.addErrors.update((e) => {
      const { file: _, ...rest } = e;
      return rest;
    });
    this.addSubmitError.set('');
  }

  /** Save the new document requirement: upload optional file, insert row, audit log, refresh queue. */
  async onAddDocumentSubmit(): Promise<void> {
    this.clearAddErrors();

    let valid = true;

    if (!this.addForm().studentId?.trim()) {
      this.addErrors.update((e) => ({ ...e, studentId: 'Please select a student.' }));
      valid = false;
    }

    if (!this.addForm().requirementName?.trim()) {
      this.addErrors.update((e) => ({ ...e, requirementName: 'Requirement name is required.' }));
      valid = false;
    }

    if (!valid) return;

    this.isAddingDocument.set(true);

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

      // Optional: upload file to the internship-documents storage bucket.
      let fileUrl: string | null = null;
      let fileName: string | null = null;

      if (this.addFile()) {
        const file = this.addFile()!;
        const safeName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
        const storagePath = `document_requirements/${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from('internship-documents')
          .upload(storagePath, file);

        if (uploadError) throw uploadError;

        const { data: pubData } = supabase.storage
          .from('internship-documents')
          .getPublicUrl(storagePath);

        fileUrl = pubData?.publicUrl ?? null;
        fileName = file.name;
      }

      const { error: insertError } = await supabase
        .from('student_requirements')
        .insert({
          student_id: this.addForm().studentId.trim(),
          student_name: studentName,
          degree_program: degreeProgram,
          requirement_name: this.addForm().requirementName.trim(),
          file_name: fileName,
          file_url: fileUrl,
          status: 'pending',
          updated_at: new Date().toISOString(),
        });

      if (insertError) throw insertError;

      // Audit log the create action (best-effort; never blocks the UI).
      try {
        const insertedId = 'new-requirement'; // best-effort only; record_id is informational
        await this.auditLog.logActivity({
          actionType: 'create',
          tableName: 'student_requirements',
          recordId: insertedId,
          oldValues: null,
          newValues: {
            student_id: this.addForm().studentId.trim(),
            student_name: studentName,
            degree_program: degreeProgram,
            requirement_name: this.addForm().requirementName.trim(),
            file_name: fileName,
            file_url: fileUrl,
            status: 'pending',
          },
        });
      } catch (auditErr) {
        console.error('[DocValidation] Audit log (create) failed:', auditErr);
      }

      this.closeAddDocument();
      await this.loadData(); // refresh queue so the new requirement appears
      this.cdr.markForCheck();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add document requirement.';
      console.error('[DocValidation] Add document requirement failed:', message);
      this.addSubmitError.set(message);
    } finally {
      this.isAddingDocument.set(false);
    }
  }

  /** Request confirmation before deleting a document requirement. */
  deleteDocument(item: DocumentItem): void {
    this.confirmPayload.set({ action: 'deleteDocument', item });
    this.confirmTitle.set('Delete document?');
    this.confirmMessage.set(`This will delete <strong>${item.fileName}</strong> for ${item.studentName}. This cannot be undone.`);
    this.confirmLabel.set('Delete');
    this.confirmDialogOpen.set(true);
    this.cdr.markForCheck();
  }

  /** Perform the confirmed document deletion on Supabase. */
  private async performDeleteDocument(item: DocumentItem): Promise<void> {
    this.isDeletingDocument.set(item.id);
    try {
      const { error } = await supabase
        .from('student_requirements')
        .delete()
        .eq('id', item.id);

      if (error) throw error;

      await this.loadData(); // realtime will also pick up the deletion
      this.cdr.markForCheck();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete document.';
      console.error('[DocValidation] Delete document failed:', message);
      alert(`Failed to delete: ${message}`);
    } finally {
      this.isDeletingDocument.set(null);
    }
  }

  /** Run the action the user confirmed in the confirm dialog. */
  async handleConfirm(): Promise<void> {
    const payload = this.confirmPayload();
    if (!payload) return;

    this.confirmIsDeleting.set(true);
    try {
      if (payload.action === 'deleteDocument') {
        await this.performDeleteDocument(payload.item);
      }
    } catch (err) {
      console.error('[DocValidation] Confirmed action failed:', err);
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

  /** Subscribe to real-time requirement status changes so the validation queue updates live. */
  private subscribeToUpdates(): void {
    this.documentsSubscription = supabase
      .channel('admin-document-validation-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'student_requirements' },
        () => {
          console.log('[DocValidation] Realtime event (student_requirements): refreshing queue.');
          void this.loadData();
        }
      )
      .subscribe((status) => {
        console.log('[DocValidation] Realtime channel (student_requirements) status:', status);
      });
  }
}
