import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { supabase } from '../../../../environments/supabase.config';

type DocumentStatus = 'verified' | 'pending' | 'rejected';

const STORAGE_BUCKET = 'internship-documents';

interface DocumentItem {
  id: string;
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

@Component({
  selector: 'app-document-checklist-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './document-checklist-page.component.html',
})
export class DocumentChecklistPageComponent implements OnInit, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);

  private documentsSubscription: any = null;

  documents = signal<DocumentItem[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  isDeletingDocument = signal<string | null>(null);

  searchQuery = signal('');
  statusFilter = signal<DocumentStatus | ''>('');

  /** Documents filtered by the search bar + status dropdown. */
  filteredDocuments = computed(() => {
    const items = this.sortedDocuments();
    const q = (this.searchQuery() || '').toLowerCase();
    const status = this.statusFilter();

    return items.filter((item) => {
      const matchSearch =
        !q ||
        item.studentName.toLowerCase().includes(q) ||
        item.requirementTitle.toLowerCase().includes(q) ||
        (item.fileName || '').toLowerCase().includes(q);
      const matchStatus = !status || item.status === status;
      return matchSearch && matchStatus;
    });
  });

  trackByDocument = (_: number, item: DocumentItem): string => item.id;

  // Sort state
  sortColumn = signal<keyof DocumentItem | ''>('');
  sortDirection = signal<'asc' | 'desc' | ''>('');

  sortedDocuments = computed(() => {
    const items = this.documents();
    const column = this.sortColumn();
    const direction = this.sortDirection();
    if (!column || !direction) return items;

    return [...items].sort((a, b) => {
      const aVal = column === 'uploadedDate' ? a.uploadedAtRaw : a[column];
      const bVal = column === 'uploadedDate' ? b.uploadedAtRaw : b[column];
      if (aVal === bVal) return 0;
      const cmp = String(aVal).localeCompare(String(bVal));
      return direction === 'asc' ? cmp : -cmp;
    });
  });

  setSort(column: keyof DocumentItem): void {
    if (this.sortColumn() === column) {
      this.sortDirection.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set('asc');
    }
    this.cdr.markForCheck();
  }

  // Document review modal state
  showDocumentModal = signal(false);
  reviewItem = signal<DocumentItem | null>(null);
  reviewDecision = signal<'verified' | 'rejected' | ''>('');
  reviewNotes = signal('');
  isSavingDocument = signal(false);

  async ngOnInit(): Promise<void> {
    await this.loadData();
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
      const { data: rows, error } = await supabase
        .from('student_requirements')
        .select(`
          id,
          student_id,
          requirement_name,
          file_name,
          file_url,
          status,
          updated_at,
          student_name,
          degree_program
        `)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const requirements = (rows || []) as any[];

      this.documents.set(requirements.map((r) => this.mapRequirement(r)));

      this.cdr.markForCheck();
    } catch (err) {
      console.error('[DocValidation] Error loading requirements:', err);
      this.error.set(err instanceof Error ? err.message : 'Failed to load document queue.');
    } finally {
      this.loading.set(false);
    }
  }

  /** Map a raw requirement row to the UI DocumentItem shape. */
  private mapRequirement(r: any): DocumentItem {
    const status = (r.status || 'pending') as DocumentStatus;

    return {
      id: r.id,
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

  /** Open the document review modal: show file info + let admin add a comment before deciding. */
  openDocumentModal(item: DocumentItem): void {
    this.reviewItem.set(item);
    this.reviewDecision.set('');
    this.reviewNotes.set('');
    this.showDocumentModal.set(true);
    this.cdr.markForCheck();
  }

  /** Close the document review modal. */
  closeDocumentModal(): void {
    this.showDocumentModal.set(false);
    this.reviewItem.set(null);
    this.reviewDecision.set('');
    this.reviewNotes.set('');
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

  /** Save the Verify / Reject decision + admin comment to Supabase and refresh the queue. */
  async saveDocumentDecision(): Promise<void> {
    const item = this.reviewItem();
    const decision = this.reviewDecision();
    if (!item || !decision) return;

    this.isSavingDocument.set(true);

    try {
      const { error } = await supabase
        .from('student_requirements')
        .update({
          status: decision,
          admin_notes: this.reviewNotes() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id);

      if (error) throw error;

      this.closeDocumentModal();
      this.loading.set(true);
      await this.loadData(); // refresh queue so the status pill updates live
      this.cdr.markForCheck();
    } catch (err) {
      console.error('[DocValidation] Save document decision failed:', err);
      alert('Failed to save decision. Please try again.');
    } finally {
      this.isSavingDocument.set(false);
    }
  }

  /** Delete a document requirement from Supabase. */
  async deleteDocument(item: DocumentItem): Promise<void> {
    if (!window.confirm(`Delete document "${item.fileName}" for ${item.studentName}? This cannot be undone.`)) {
      return;
    }

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
