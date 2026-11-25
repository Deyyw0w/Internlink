import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { supabase } from '../../../../environments/supabase.config';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { AuditLogService } from '../../../shared/services/audit-log.service';
import { UslProgramsService } from '../../../shared/services/usl-programs.service';

export interface NewsItemRow {
  id: string;
  title: string;
  excerpt: string;
  image_label: string;
  image_url: string | null;
  link_url: string | null;
  is_published: boolean;
  published_at: string;
  created_at: string;
  updated_at: string;
}

@Component({
  selector: 'app-admin-news-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ConfirmDialogComponent],
  templateUrl: './news-page.html',
})
export class AdminNewsPageComponent implements OnInit, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly supabase = supabase;
  private readonly auditLog = inject(AuditLogService);
  private readonly router = inject(Router);
  private readonly uslPrograms = inject(UslProgramsService);

  private subscription: any = null;

  news = signal<NewsItemRow[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);

  // Edit / create form state
  editMode = signal(false);
  editingId = signal<string | null>(null);
  formTitle = signal('');
  formExcerpt = signal('');
  formImageLabel = signal('News');
  formImageUrl = signal('');
  formLinkUrl = signal('');
  formIsPublished = signal(true);
  formPublishedAt = signal('');

  // USL import state
  importingUsl = signal(false);

  // Confirm dialog
  confirmOpen = signal(false);
  confirmTarget = signal<NewsItemRow | null>(null);
  confirmTitle = signal('');
  confirmMessage = signal('');
  confirmLabel = signal('Delete');
  confirmIsDeleting = signal(false);

  async ngOnInit(): Promise<void> {
    await this.loadNews();
    this.subscribeToRealtime();
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      supabase.removeChannel(this.subscription);
      this.subscription = null;
    }
  }

  async loadNews(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const { data, error } = await this.supabase
        .from('news')
        .select('*')
        .order('published_at', { ascending: false });

      if (error) throw error;
      this.news.set((data || []) as NewsItemRow[]);
    } catch (err) {
      console.error('[News] Error loading news:', err);
      this.error.set(err instanceof Error ? err.message : 'Failed to load news.');
    } finally {
      this.loading.set(false);
      this.cdr.markForCheck();
    }
  }

  private subscribeToRealtime(): void {
    this.subscription = this.supabase
      .channel('admin-news-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'news' },
        () => {
          console.log('[News] Realtime event: refreshing news.');
          void this.loadNews();
        }
      )
      .subscribe((status: any) => {
        console.log('[News] Realtime channel status:', status);
      });
  }

  openForm(item: NewsItemRow | null = null): void {
    this.editMode.set(true);
    this.editingId.set(item?.id || null);
    this.formTitle.set(item?.title || '');
    this.formExcerpt.set(item?.excerpt || '');
    this.formImageLabel.set(item?.image_label || 'News');
    this.formImageUrl.set(item?.image_url || '');
    this.formLinkUrl.set(item?.link_url || '');
    this.formIsPublished.set(item?.is_published ?? true);
    this.formPublishedAt.set(item?.published_at || new Date().toISOString());
    this.cdr.markForCheck();
  }

  closeForm(): void {
    this.editMode.set(false);
    this.editingId.set(null);
    this.formTitle.set('');
    this.formExcerpt.set('');
    this.formImageLabel.set('News');
    this.formImageUrl.set('');
    this.formLinkUrl.set('');
    this.formIsPublished.set(true);
    this.formPublishedAt.set('');
    this.cdr.markForCheck();
  }

  async saveNews(): Promise<void> {
    const title = this.formTitle().trim();
    const excerpt = this.formExcerpt().trim();
    const imageLabel = this.formImageLabel().trim() || 'News';
    const imageUrl = this.formImageUrl().trim() || null;
    const linkUrl = this.formLinkUrl().trim() || null;
    const isPublished = this.formIsPublished();
    const publishedAt = this.formPublishedAt() || new Date().toISOString();

    if (!title) {
      alert('Title is required.');
      return;
    }
    if (!excerpt) {
      alert('Excerpt is required.');
      return;
    }

    const isEdit = !!this.editingId();
    const oldValues = isEdit ? this.news().find((n) => n.id === this.editingId()) : null;

    try {
      if (isEdit) {
        const { error } = await this.supabase
          .from('news')
          .update({
            title,
            excerpt,
            image_label: imageLabel,
            image_url: imageUrl,
            link_url: linkUrl,
            is_published: isPublished,
            published_at: publishedAt,
            updated_at: new Date().toISOString(),
          })
          .eq('id', this.editingId());

        if (error) throw error;

        await this.auditLog.logActivity({
          actionType: 'update',
          tableName: 'news',
          recordId: this.editingId()!,
          oldValues: oldValues ?? null,
          newValues: { title, excerpt, image_label: imageLabel, image_url: imageUrl, link_url: linkUrl, is_published: isPublished, published_at: publishedAt },
        });
      } else {
        const { error } = await this.supabase
          .from('news')
          .insert({
            title,
            excerpt,
            image_label: imageLabel,
            image_url: imageUrl,
            link_url: linkUrl,
            is_published: isPublished,
            published_at: publishedAt,
          });

        if (error) throw error;

        await this.auditLog.logActivity({
          actionType: 'create',
          tableName: 'news',
          recordId: '',
          oldValues: null,
          newValues: { title, excerpt, image_label: imageLabel, image_url: imageUrl, link_url: linkUrl, is_published: isPublished, published_at: publishedAt },
        });
      }

      await this.loadNews();
      this.closeForm();
    } catch (err) {
      console.error('[News] Save failed:', err);
      alert('Failed to save news item. Please try again.');
    }
  }

  async importUslPrograms(): Promise<void> {
    this.importingUsl.set(true);
    this.error.set(null);
    try {
      const { imported, skipped } = await this.uslPrograms.importUslProgramsAsNews();
      await this.loadNews();
      alert(`USL import complete: ${imported} imported, ${skipped} skipped (already exist or failed).`);
    } catch (err) {
      console.error('[News] USL import failed:', err);
      this.error.set(
        err instanceof Error ? err.message : 'Failed to import from USL. The site may block cross-origin requests (CORS).'
      );
      alert('USL import failed. Check console for details — CORS may block direct browser access to usl.edu.ph.');
    } finally {
      this.importingUsl.set(false);
      this.cdr.markForCheck();
    }
  }

  deleteNews(item: NewsItemRow): void {
    this.confirmTarget.set(item);
    this.confirmTitle.set('Delete news item?');
    this.confirmMessage.set(`This will remove "<strong>${item.title}</strong>" permanently. This cannot be undone.`);
    this.confirmLabel.set('Delete');
    this.confirmOpen.set(true);
    this.cdr.markForCheck();
  }

  async handleConfirm(): Promise<void> {
    const target = this.confirmTarget();
    if (!target) return;

    this.confirmIsDeleting.set(true);
    try {
      const { error } = await this.supabase.from('news').delete().eq('id', target.id);
      if (error) throw error;

      await this.auditLog.logActivity({
        actionType: 'delete',
        tableName: 'news',
        recordId: target.id,
        oldValues: target,
        newValues: null,
      });

      await this.loadNews();
    } catch (err) {
      console.error('[News] Delete failed:', err);
      alert('Failed to delete news item. Please try again.');
    } finally {
      this.confirmIsDeleting.set(false);
      this.confirmOpen.set(false);
      this.confirmTarget.set(null);
      this.cdr.markForCheck();
    }
  }

  cancelConfirm(): void {
    this.confirmOpen.set(false);
    this.confirmTarget.set(null);
    this.cdr.markForCheck();
  }

  formatDate(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  trackByNews = (_: number, item: NewsItemRow): string => item.id;
}
