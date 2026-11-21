import { Component, ChangeDetectorRef, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { supabase } from '../../../../environments/supabase.config';
import { ProfileService } from '../../../auth/profile.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { AuditLogService } from '../../../shared/services/audit-log.service';

export interface AppRequirement {
  id: string;
  student_id: string;
  requirement_name: string;
  file_name: string | null;
  file_url: string | null;
  status: string;
  updated_at: string;
}

export interface AppHistoryEntry {
  status: string;
  date: string;
  person: string;
  remarks: string;
  done: boolean;
  current?: boolean;
}

@Component({
  selector: 'app-my-application-page',
  standalone: true,
  imports: [CommonModule, RouterLink, ConfirmDialogComponent],
  template: `
    <main class="w-full px-8 py-6 space-y-6">

      <!-- Admin decision notification (removal-request outcomes) -->
      <div *ngIf="notification()" class="rounded-xl p-4 mb-6 shadow-sm"
           [ngClass]="{
             'bg-emerald-50 border border-emerald-200 text-emerald-800': notification()?.type === 'success',
             'bg-amber-50 border border-amber-200 text-amber-800': notification()?.type === 'info',
             'bg-rose-50 border border-rose-200 text-rose-800': notification()?.type === 'warn'
           }">
        {{ notification()?.message }}
      </div>

      <!-- Two-column responsive grid: left 8/12, right 4/12 -->
      <section class="grid grid-cols-1 lg:grid-cols-12 gap-6">

        <!-- LEFT SECTION: 8 columns -->
        <div class="lg:col-span-8 space-y-6">

          <!-- 1. Application Header -->
          <section class="bg-[#1E3A5F] border-l-4 border-amber-500 rounded-2xl p-6 shadow-sm">
            <div class="flex justify-between items-start gap-4 mb-4">
              <div class="flex-1">
                <p class="text-xs font-bold uppercase tracking-wider text-amber-400 mb-1">Internship Application</p>
                <h2 class="text-2xl font-bold text-white leading-tight">My Internship Application</h2>
                <p class="text-sm text-slate-300 mt-1">
                  Application Ref: <span class="text-amber-300 font-bold">{{ appRef || '—' }}</span>
                </p>
              </div>
              <span *ngIf="appStatus" class="px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/40">
                {{ appStatus | uppercase }}
              </span>
            </div>

            <div class="flex items-center gap-3">
              <button type="button" class="px-4 py-2 rounded-xl text-xs font-bold bg-[#1E3A5F] text-white hover:bg-blue-900 inline-flex items-center gap-2">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015-1.837-2.175a48.041 48.055 0 0 1 1.913-.247m10.5 0a8.505 8.505 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z" /></svg>
                Print Application Form
              </button>
              <button
                type="button"
                (click)="requestRemoval()"
                [disabled]="confirmIsDeleting() || !application || application.status === 'removal-requested'"
                class="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 active:bg-amber-800 hover:shadow-[0_0_12px_rgba(217,119,6,0.3)] disabled:opacity-50 disabled:border-amber-300 disabled:text-amber-200 disabled:cursor-not-allowed inline-flex items-center gap-2 transition-all duration-200"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
                <span *ngIf="!confirmIsDeleting()">Request Removal</span>
                <span *ngIf="confirmIsDeleting()">Submitting request…</span>
              </button>
            </div>

          </section>

          <!-- 2. Target Host Training Establishment -->
          <section *ngIf="application" class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="bg-[#1E3A5F]/80 rounded-xl p-4">
              <p class="text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-1">Company / Agency</p>
              <p class="text-sm font-semibold text-white">{{ application.host_company }}</p>
            </div>
            <div class="bg-[#1E3A5F]/80 rounded-xl p-4">
              <p class="text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-1">Target Internship Position</p>
              <p class="text-sm font-semibold text-white">{{ application.position_role }}</p>
            </div>
            <div class="bg-[#1E3A5F]/80 rounded-xl p-4">
              <p class="text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-1">Application Status</p>
              <p class="text-sm font-semibold text-white">{{ application.status }}</p>
            </div>
            <div class="bg-[#1E3A5F]/80 rounded-xl p-4">
              <p class="text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-1">Reference Number</p>
              <p class="text-sm font-semibold text-white">{{ application.reference_number }}</p>
            </div>
          </section>

          <!-- 3. Submitted Requirements & Verification -->
          <section class="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
            <div class="flex justify-between items-end gap-4 mb-6">
              <h2 class="text-lg font-bold text-slate-900">Submitted Requirements &amp; Verification</h2>
              <a routerLink="/dashboard/document-checklist" class="text-sm font-bold text-[#1E3A5F] hover:text-blue-900 inline-flex items-center gap-1">Go to Document Manager →</a>
            </div>
            <div class="space-y-3" *ngIf="requirements().length > 0; else noRequirements">
              <div *ngFor="let doc of requirements()" class="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50">
                <div class="flex-col gap-0.5">
                  <p class="text-sm font-semibold text-slate-800">{{ doc.requirement_name }}</p>
                  <p class="text-xs text-slate-500">{{ doc.file_name || 'No file uploaded' }} • {{ doc.status | titlecase }}</p>
                </div>
                <span [ngClass]="getStatusBadge(doc.status)" class="px-2.5 py-1 rounded-full text-[10px] font-bold">{{ doc.status | uppercase }}</span>
              </div>
            </div>
            <ng-template #noRequirements>
              <p class="text-sm text-slate-500 text-center py-4">No requirements found. Upload your documents in the Document Manager.</p>
            </ng-template>
          </section>

        </div>

        <!-- RIGHT SECTION: 4 columns -->
        <div class="lg:col-span-4 space-y-6">

          <!-- 4. Admin Review Notes -->
          <section *ngIf="adminNotes()" class="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
            <div class="flex items-start gap-3 mb-4">
              <div class="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg class="w-5 h-5 text-amber-600" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12c5.16-1.26 9-6.45 9-12V5Zm0 3.9a3 3 0 1 1-3 3a3 3 0 0 1 3-3m0 7.9c2 0 6 1.09 6 3.08a7.2 7.2 0 0 1-12 0c0-1.99 4-3.08 6-3.08"/></svg>
              </div>
              <div class="flex-1">
                <p class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-0.5">Admin Review Notes</p>
                <p class="text-sm text-slate-900 leading-relaxed whitespace-pre-wrap">{{ adminNotes() }}</p>
                <p class="text-xs text-slate-400 mt-2">From Internship Coordinator</p>
              </div>
            </div>
          </section>

          <!-- 5. Audit History & Status Log -->
          <section class="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
            <h2 class="text-lg font-bold text-slate-900 mb-6">Audit History &amp; Status Log</h2>
            <div class="relative space-y-6" *ngIf="history().length > 0; else noHistory">
              <div class="absolute left-2.5 top-0 bottom-0 w-0.5 bg-slate-200"></div>
              <div *ngFor="let entry of history(); let last = last" class="relative pl-8 pb-6" [class.pb-0]="last">
                <div class="absolute left-0 top-2.5 w-4 h-4 rounded-full border-2" [ngClass]="entry.done ? 'bg-[#1E3A5F] border-[#1E3A5F]' : entry.current ? 'bg-amber-500 border-amber-500' : 'bg-slate-200 border-slate-200'"></div>
                <div class="flex justify-between items-start gap-3 mb-1">
                  <span class="text-sm font-bold text-slate-800">{{ entry.status }}</span>
                  <span class="text-xs text-slate-500 font-mono">{{ entry.date }}</span>
                </div>
                <p class="text-xs text-slate-500 mb-2">{{ entry.person }}</p>
                <p class="text-sm text-slate-600 leading-relaxed">{{ entry.remarks }}</p>
              </div>
            </div>
            <ng-template #noHistory>
              <p class="text-sm text-slate-500 text-center py-4">No history yet. Your application activity will appear here.</p>
            </ng-template>
          </section>

        </div>

      </section>

    <!-- Confirm Dialog (remove application) -->
    <app-confirm-dialog
      [open]="confirmDialogOpen()"
      [title]="confirmTitle()"
      [message]="confirmMessage()"
      [confirmLabel]="confirmLabel()"
      [cancelLabel]="'Cancel'"
      [loading]="confirmIsDeleting()"
      [loadingLabel]="'Submitting request…'"
      (confirm)="handleConfirm()"
      (cancel)="handleConfirmCancel()"
    ></app-confirm-dialog>

    </main>
  `,
})
export class MyApplicationPageComponent implements OnInit, OnDestroy {
  private readonly profileService = inject(ProfileService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly auditLog = inject(AuditLogService);

  private applicationsSubscription: any = null;
  private requirementsSubscription: any = null;

  appRef = '';
  appStatus = 'Requirements';

  requirements = signal<AppRequirement[]>([]);
  history = signal<AppHistoryEntry[]>([]);
  adminNotes = signal<string | null>(null);

  application: any = null;

  // Remove application confirm dialog state.
  confirmDialogOpen = signal(false);
  confirmPayload = signal<{ action: 'requestRemoval'; application: any } | null>(null);
  confirmIsDeleting = signal(false);

  confirmTitle = signal('');
  confirmMessage = signal('');
  confirmLabel = signal('Request Removal');

  // In-app notification shown when the admin approves/dismisses a removal request.
  notification = signal<{ type: 'success' | 'info' | 'warn'; message: string } | null>(null);

  clearNotification(): void {
    this.notification.set(null);
    this.cdr.markForCheck();
  }

  getStatusBadge(status: string) {
    const s = (status || '').toLowerCase();
    if (s === 'verified') return 'bg-[#1E3A5F]/10 text-[#1E3A5F] border-[#1E3A5F]/20';
    if (s === 'pending') return 'bg-amber-100 text-amber-700 border-amber-200';
    if (s === 'rejected') return 'bg-slate-100 text-slate-600 border-slate-200';
    return 'bg-slate-100 text-slate-600 border-slate-200';
  }

  async ngOnInit(): Promise<void> {
    await this.loadData();
    this.subscribeToUpdates();
  }

  ngOnDestroy(): void {
    if (this.applicationsSubscription) {
      supabase.removeChannel(this.applicationsSubscription);
      this.applicationsSubscription = null;
    }
    if (this.requirementsSubscription) {
      supabase.removeChannel(this.requirementsSubscription);
      this.requirementsSubscription = null;
    }
  }

  /** Re-fetch the student's application, requirements, and rebuild history. */
  async loadData(): Promise<void> {
    const profile = this.profileService.profile();
    const studentId = profile?.student_id;

    if (!studentId) {
      console.log('[MyApplication] No student ID available');
      return;
    }

    try {
      // Fetch the latest application for this student
      const { data: apps, error: appError } = await supabase
        .from('internship_applications')
        .select('*')
        .eq('student_id', String(studentId))
        .order('submitted_at', { ascending: false })
        .limit(1);

      if (appError) throw appError;
      this.application = apps?.[0] || null;

      if (this.application) {
        this.appRef = this.application.reference_number || '—';
        this.appStatus = this.application.status || 'Requirements';
        this.adminNotes.set(this.application.admin_notes || null);
      } else {
        this.adminNotes.set(null);
      }

      // Fetch requirements for this student
      const { data: reqs, error: reqError } = await supabase
        .from('student_requirements')
        .select('*')
        .eq('student_id', String(studentId))
        .order('requirement_name');

      if (reqError) throw reqError;
      this.requirements.set(reqs || []);

      this.buildHistory();
      this.cdr.markForCheck();
    } catch (err) {
      console.error('[MyApplication] Error loading data:', err);
    }
  }

  /** Build the audit history from the current application + requirements. */
  buildHistory(): void {
    const entries: AppHistoryEntry[] = [];

    if (this.application) {
      entries.push({
        status: 'Application Submitted',
        date: this.application.submitted_at || '',
        person: 'Student',
        remarks: `Application for ${this.application.position_role} at ${this.application.host_company} submitted with reference ${this.application.reference_number}.`,
        done: true,
      });
    }

    const reqsArr = this.requirements();
    const verifiedCount = reqsArr.filter(r => r.status === 'verified').length;
    const pendingCount = reqsArr.filter(r => r.status === 'pending').length;
    const rejectedCount = reqsArr.filter(r => r.status === 'rejected').length;

    if (reqsArr.length > 0) {
      entries.push({
        status: 'Documents Uploaded',
        date: reqsArr[0]?.updated_at || '',
        person: 'Student',
        remarks: `${verifiedCount} verified, ${pendingCount} pending, ${rejectedCount} rejected out of ${reqsArr.length} requirements.`,
        done: verifiedCount > 0,
        current: pendingCount > 0 || rejectedCount > 0,
      });
    }

    if (!this.application || this.application.status === 'pending') {
      entries.push({
        status: 'Under Review',
        date: '',
        person: 'Internship Coordinator',
        remarks: 'Final review in progress before approval decision.',
        done: false,
        current: true,
      });
    }

    // Admin review notes appear as a timeline entry when a coordinator has saved them.
    if (this.application && this.adminNotes()) {
      entries.push({
        status: 'Admin Review',
        date: this.application.updated_at || '',
        person: 'Internship Coordinator',
        remarks: this.adminNotes() || '',
        done: true,
      });
    }

    this.history.set(entries);
  }

  /** Request confirmation before the student requests removal of their own application. */
  requestRemoval(): void {
    if (!this.application || this.confirmIsDeleting() || this.application.status === 'removal-requested') return;

    this.confirmPayload.set({ action: 'requestRemoval', application: this.application });
    this.confirmTitle.set('Request removal?');
    this.confirmMessage.set(`Your removal request for <strong>${this.application.host_company}</strong> (${this.application.reference_number || '—'}) will be sent to the admin for approval. This cannot be undone while pending.`);
    this.confirmLabel.set('Request Removal');
    this.confirmDialogOpen.set(true);
    this.cdr.markForCheck();
  }

  /** Run the action the user confirmed in the confirm dialog. */
  async handleConfirm(): Promise<void> {
    const payload = this.confirmPayload();
    if (!payload) return;

    this.confirmIsDeleting.set(true);
    try {
      if (payload.action === 'requestRemoval') {
        const application = payload.application;
        const oldValues = {
          id: application.id,
          status: application.status,
          admin_notes: application.admin_notes ?? null,
        };

        // Request removal: set status to removal-requested (admin must approve the actual delete).
        // updated_at is intentionally omitted — it's managed by the DB trigger / PostgREST schema cache.
        const { error } = await supabase
          .from('internship_applications')
          .update({
            status: 'removal-requested',
            admin_notes: null,
          })
          .eq('id', application.id);
        if (error) throw error;

        // Best-effort audit log; never blocks the UI.
        try {
          await this.auditLog.logActivity({
            actionType: 'update',
            tableName: 'internship_applications',
            recordId: application.id,
            oldValues,
            newValues: { status: 'removal-requested', admin_notes: null },
          });
        } catch (auditErr) {
          console.error('[MyApplication] Audit log (update) failed:', auditErr);
        }

        // Clear local state so the page reflects the removal request without a reload.
        this.application = null;
        this.appRef = '—';
        this.appStatus = 'Requirements';
        this.adminNotes.set(null);
        this.buildHistory();
        this.cdr.markForCheck();

        console.log('[MyApplication] Removal request submitted.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit removal request.';
      console.error('[MyApplication] Request removal failed:', err);
      alert(`Failed to submit removal request: ${message}`);
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

  /** Subscribe to real-time updates so the page reflects admin changes instantly. */
  private subscribeToUpdates(): void {
    const profile = this.profileService.profile();
    const studentId = profile?.student_id;
    if (!studentId) return;

    const studentIdText = String(studentId);

    // Realtime: application changes (admin edits or deletes the application)
    this.applicationsSubscription = supabase
      .channel('my-application-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'internship_applications' },
        (payload) => {
          const newApp = payload.new as any;
          const oldApp = payload.old as any;

          // Admin deleted this application (= approved the removal request)
          if (!newApp && oldApp?.student_id === studentIdText) {
            this.application = null;
            this.appRef = '—';
            this.appStatus = 'Requirements';
            this.adminNotes.set(null);
            this.buildHistory();
            this.notification.set({
              type: 'success',
              message: 'Your removal request has been approved by the admin. Your application has been removed.',
            });
            this.cdr.markForCheck();
            return;
          }

          if (newApp?.student_id === studentIdText) {
            // Admin dismissed the removal request (status reverted back to under-review)
            const wasRemovalRequested = oldApp?.status === 'removal-requested';
            const backToReview = newApp.status === 'under-review';
            if (wasRemovalRequested && backToReview) {
              this.notification.set({
                type: 'info',
                message: 'The admin dismissed your removal request. Your application is back under review.',
              });
            }

            this.application = newApp;
            this.appRef = newApp.reference_number || '—';
            this.appStatus = newApp.status || 'Requirements';
            this.adminNotes.set(newApp.admin_notes || null);
            this.buildHistory();
            this.cdr.markForCheck();
          }
        }
      )
      .subscribe((status) => {
        console.log('[MyApplication] Realtime channel (internship_applications) status:', status);
      });

    // Realtime: requirement changes (admin verifies/rejects/deletes a document)
    this.requirementsSubscription = supabase
      .channel('my-requirements-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'student_requirements' },
        (payload) => {
          const updated = payload.new as any;
          const deleted = payload.old as any;

          // Admin deleted this document requirement
          if (!updated && deleted?.student_id === studentIdText) {
            this.requirements.update(items => items.filter(r => r.id !== deleted.id));
            this.buildHistory();
            this.cdr.markForCheck();
            return;
          }

          if (updated?.student_id === studentIdText) {
            // Patch the single changed row instead of re-fetching everything
            this.requirements.update(items =>
              items.map(r => r.id === updated.id ? { ...updated } : r)
            );
            this.buildHistory();
            this.cdr.markForCheck();
          }
        }
      )
      .subscribe((status) => {
        console.log('[MyApplication] Realtime channel (student_requirements) status:', status);
      });
  }
}
