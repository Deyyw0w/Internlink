import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { supabase } from '../../../../environments/supabase.config';
import { ProfileService } from '../../../auth/profile.service';

type DocStatus = 'pending' | 'verified' | 'rejected';

interface DocumentItem {
  id: string;
  student_id: string;
  name: string;
  subtitle: string;
  file: string | null;
  fileUrl: string | null;
  status: DocStatus;
  admin_notes: string | null;
  updated_at: string;
}

interface StudentApplication {
  id: string;
  student_id: string;
  host_company: string;
  position_role: string;
  status: string;
  submitted_at: string;
}

const STORAGE_BUCKET = 'internship-documents';

@Component({
  selector: 'app-document-checklist-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <main class="w-full px-8 py-6 space-y-6">

      <!-- Header Banner -->
      <section class="bg-[#1E3A5F] border-l-4 border-amber-500 text-white rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <svg class="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 .087.586l2.977-7.937A1 1 0 0 1 6 10h12V9a2 2 0 0 0-2-2h-4.532l-1.9-2.28A2 2 0 0 0 8.032 4H4Zm2.693 8H6.5l-3 8H18l3-8H6.693Z" clip-rule="evenodd"/></svg>
          <div class="flex flex-col gap-0.5">
            <h1 class="text-xl font-bold tracking-tight text-white">Mandatory Internship Document Checklist</h1>
            <p class="text-slate-300 text-sm leading-relaxed">Upload verified university requirements prior to official endorsement and deployment.</p>
          </div>
        </div>
        <div class="inline-flex items-center gap-2 border border-amber-400/50 bg-amber-500/15 text-amber-300 text-xs font-medium px-4 py-2 rounded-full">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 8v5m0 1.5V16m-7.25-4a7.25 7.25 0 1 1 14.5 0a7.25 7.25 0 0 1-14.5 0Z"/></svg>
          <span>Keep total uploads under 20 MB per file</span>
        </div>
      </section>

      <!-- Removal-pending state (student requested removal, awaiting admin approval) -->
      <section *ngIf="application()?.status === 'removal-requested'"
        class="bg-white border border-slate-200 rounded-2xl shadow-sm divide-y divide-slate-200 space-y-8 pb-8">
        <div class="text-center py-12">
          <p class="text-xs font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-4 py-2 rounded-lg inline-block">
            Removal Requested — Awaiting Admin Approval
          </p>
          <p class="text-sm text-slate-700 mt-2 max-w-md mx-auto">
            You have requested removal of your internship application. Your document checklist is hidden until the admin
            approves or dismisses the request.
          </p>
        </div>
      </section>

      <!-- Main Container -->
      <section class="bg-white border border-slate-200 rounded-2xl shadow-sm divide-y divide-slate-200 space-y-8 pb-8" *ngIf="application()?.status !== 'removal-requested' && documents().length > 0; else emptyState">

        <!-- Requirement Rows -->
        <div *ngFor="let doc of documents(); trackBy: trackByDoc">
          <div class="p-6 flex items-start justify-between gap-4">
            <div class="flex-col gap-1">
              <div class="flex items-center gap-2">
                <div class="w-10 h-10 rounded-xl bg-blue-50 text-[#1E3A5F] flex items-center justify-center">
                  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16v-3h.375a.626.626 0 0 1 .625.626v1.749a.626.626 0 0 1-.626.625H6Zm6-2.5a.5.5 0 1 1 1 0v2a.5.5 0 0 1-1 0v-2Z"/><path fill-rule="evenodd" d="M11 7V2h7a2 2 0 0 1 2 2v5h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-1a2 2 0 0 1-2 2H6a2 2 0 0 1-2 2H3a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h6a2 2 0 0 0 2-2Zm7.683 6.006 1.335-.024-.037-2-1.327.024a2.647 2.647 0 0 0-2.636 2.647v1.706a2.647 2.647 0 0 0 2.647 2.647H20v-2h-1.335a.647.647 0 0 1-.647-.647v-1.706a.647.647 0 0 1 .647-.647h.018ZM5 11a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h1.376A2.626 2.626 0 0 0 9 15.375v-1.75A2.626 2.626 0 0 0 6.375 11H5Zm7.5 0a2.5 2.5 0 0 0-2.5 2.5v2a2.5 2.5 0 0 0 5 0v-2a2.5 2.5 0 0 0-2.5-2.5Z" clip-rule="evenodd"/><path d="M9 7V2.221a2 2 0 0 0-.5.365L4.586 6.5a2 2 0 0 0-.365.5H9Z"/></svg>
                </div>
                <div>
                  <p class="text-base font-bold text-slate-900">{{ doc.name }}</p>
                  <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase bg-rose-100 text-rose-700">Required</span>
                </div>
              </div>
              <p class="text-xs text-slate-500 mt-0.5">{{ doc.subtitle }}</p>
            </div>
            <span [ngClass]="statusBadgeClass(doc.status)" class="px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-2">
              <span [class]="statusDotClass(doc.status)" class="h-1.5 w-1.5 rounded-full"></span>
              {{ statusLabel(doc.status) }}
            </span>
          </div>

          <!-- Admin verification comment (shown when coordinator verified/rejected with notes) -->
          <div *ngIf="doc.admin_notes" class="mt-3 max-w-[95%] mx-auto flex items-start gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50">
            <svg class="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 12h6m-6 4h6m-6 4h6m-6 4h6M9 16l2 2M12 14l2-2M9 8l2-2M12 10l2-2" stroke-linecap="round" stroke-linejoin="round" /></svg>
            <p class="text-xs text-amber-800 leading-relaxed flex-1"><span class="font-bold text-amber-700 uppercase text-[10px] tracking-wider">Admin comment:</span> {{ doc.admin_notes }}</p>
          </div>

          <!-- Bottom Upload Bar -->
          <div class="mt-4 max-w-[95%] mx-auto bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
            <input type="file" #fileInput (change)="onFileUpload($event, doc)" class="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" />

            <!-- Left: uploaded file chip or empty state -->
            <div class="flex items-center gap-2 flex-1">
              <span *ngIf="doc.file" class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600">
                <svg class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <span class="truncate">{{ doc.file }}</span>
              </span>
              <span *ngIf="!doc.file" class="text-xs text-slate-500 italic">No document uploaded yet.</span>
            </div>

            <!-- Upload File: student can submit or re-upload; status is set by admin -->
            <button type="button" class="inline-flex items-center gap-2 bg-[#1E3A5F] hover:bg-[#162C49] text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm shrink-0" (click)="fileInput.click()">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5m0 0l5-5m-5 5V3"/></svg>
              <span *ngIf="doc.status === 'rejected'">Resubmit File</span>
              <span *ngIf="doc.status !== 'rejected'">Upload File</span>
            </button>
          </div>
        </div>

      </section>

      <ng-template #emptyState>
        <div class="text-center py-12">
          <p *ngIf="application()?.status === 'removal-requested'" class="text-xs font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-4 py-2 rounded-lg inline-block">
            Removal Requested — Awaiting Admin Approval
          </p>
          <p *ngIf="!application()?.status || application()?.status !== 'removal-requested'" class="text-xs text-slate-500 italic">No requirements found. Contact your coordinator to get started.</p>
        </div>
      </ng-template>

    </main>
  `,
})
export class DocumentChecklistPageComponent implements OnInit, OnDestroy {
  private readonly profileService = inject(ProfileService);
  private readonly cdr = inject(ChangeDetectorRef);

  private requirementsSubscription: any = null;

  documents = signal<DocumentItem[]>([]);
  application = signal<StudentApplication | null>(null);

  trackByDoc = (_: number, item: DocumentItem) => item.id;

  statusLabel(status: DocStatus) {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  statusBadgeClass(status: DocStatus) {
    const base = 'px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-2';
    if (status === 'verified') return `${base} border border-emerald-100 bg-emerald-100 text-emerald-700`;
    if (status === 'rejected') return `${base} border border-rose-100 bg-rose-100 text-rose-700`;
    return `${base} border border-amber-100 bg-amber-100 text-amber-800`;
  }

  statusDotClass(status: DocStatus) {
    if (status === 'verified') return 'h-1.5 w-1.5 rounded-full bg-emerald-500';
    if (status === 'rejected') return 'h-1.5 w-1.5 rounded-full bg-rose-500';
    return 'h-1.5 w-1.5 rounded-full bg-amber-500';
  }

  async ngOnInit(): Promise<void> {
    await this.loadData();
    this.subscribeToUpdates();
  }

  ngOnDestroy(): void {
    if (this.requirementsSubscription) {
      supabase.removeChannel(this.requirementsSubscription);
      this.requirementsSubscription = null;
    }
  }

  /** Re-fetch the student's document requirements from Supabase. */
  async loadData(): Promise<void> {
    const profile = this.profileService.profile();
    const studentId = profile?.student_id;

    if (!studentId) {
      console.log('[DocumentChecklist] No student ID available');
      return;
    }

    try {
      // Fetch the student's latest application to check for removal-requested status.
      const { data: apps, error: appError } = await supabase
        .from('internship_applications')
        .select('id, student_id, host_company, position_role, status, submitted_at')
        .eq('student_id', String(studentId))
        .order('submitted_at', { ascending: false })
        .limit(1);

      if (appError) throw appError;
      this.application.set(apps?.[0] || null);

      // Hide document requirements when removal is requested — admin must approve first.
      if (apps?.[0]?.status === 'removal-requested') {
        this.documents.set([]);
        this.cdr.markForCheck();
        return;
      }

      const { data: reqs, error } = await supabase
        .from('student_requirements')
        .select('*')
        .eq('student_id', String(studentId))
        .order('requirement_name');

      if (error) throw error;

      this.documents.set((reqs || []).map((r) => ({
        id: r.id,
        student_id: r.student_id,
        name: r.requirement_name,
        subtitle: `Requirement for ${r.requirement_name}`,
        file: r.file_name ?? null,
        fileUrl: r.file_url ?? null,
        status: (r.status as DocStatus) || 'pending',
        admin_notes: r.admin_notes ?? null,
        updated_at: r.updated_at,
      })));
    } catch (err) {
      console.error('[DocumentChecklist] Error loading requirements:', err);
    } finally {
      this.cdr.markForCheck();
    }
  }

  /** Subscribe to real-time changes so verification/rejection and removal reflect live. */
  private subscribeToUpdates(): void {
    const profile = this.profileService.profile();
    const studentId = profile?.student_id;
    if (!studentId) return;

    const studentIdText = String(studentId);

    this.requirementsSubscription = supabase
      .channel('document-checklist-updates')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'student_requirements' },
        async (payload) => {
          const updated = payload.new as any;
          if (updated?.student_id === studentIdText) {
            void this.loadData();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'student_requirements' },
        async (payload) => {
          const deleted = payload.old as any;
          if (deleted?.student_id === studentIdText) {
            void this.loadData();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'internship_applications' },
        async (payload) => {
          const newApp = payload.new as any;
          const oldApp = payload.old as any;
          // Application deleted (admin approved removal) or status changed to removal-requested
          if (
            (!newApp && oldApp?.student_id === studentIdText) ||
            (newApp?.student_id === studentIdText && newApp.status === 'removal-requested')
          ) {
            void this.loadData();
          }
        }
      )
      .subscribe((status) => {
        console.log('[DocumentChecklist] Realtime channel status:', status);
      });
  }

  async onFileUpload(event: Event, doc: DocumentItem) {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;

    // Enforce the per-file size limit advertised in the banner (10 MB).
    const MAX_BYTES = 20 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      alert(`File "${file.name}" is too large. Please keep uploads under 10 MB.`);
      return;
    }

    const profile = this.profileService.profile();
    const studentId = profile?.student_id;
    if (!studentId) {
      alert('Unable to identify your account. Please log in again.');
      return;
    }

    const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
    const storagePath = `${studentId}/${fileName}`;

    try {
      // 1. Upload to Storage bucket at path <student_id>/<filename>
      const { error: uploadError } = await supabase
        .storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // 2. Get a public URL for the uploaded object
      const { data: urlData } = supabase
        .storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(storagePath);

      const publicUrl = urlData?.publicUrl || null;

      // 3. Update the student_requirements row with file_url, file_name, status = 'pending'
      const { error: updateError } = await supabase
        .from('student_requirements')
        .update({
          file_name: file.name,
          file_url: publicUrl,
          status: 'pending',
          updated_at: new Date().toISOString(),
        })
        .eq('id', doc.id);

      if (updateError) throw updateError;

      // 4. Refresh the local signal so the UI reflects the new file chip
      this.documents.update((items) =>
        items.map((d) =>
          d.id === doc.id
            ? { ...d, file: file.name, fileUrl: publicUrl, status: 'pending', updated_at: new Date().toISOString() }
            : d
        )
      );

      this.cdr.markForCheck();
    } catch (err) {
      console.error('[DocumentChecklist] Upload failed:', err);
      alert('Upload failed. Please try again.');
    }
  }
}
