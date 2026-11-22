import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { supabase } from '../../../../environments/supabase.config';
import { ProfileService } from '../../../auth/profile.service';

interface DropdownNotification {
  id: string;
  title: string;
  body: string;
  timeAgo: string;
  type: 'application' | 'requirement' | 'admin-action';
  status?: string;
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Just now';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '—';
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months > 1 ? 's' : ''} ago`;
}

/** Friendly label for a monitored admin table. */
function tableLabel(tableName: string): string {
  const map: Record<string, string> = {
    contract_categories: 'Contract Category',
    contracts_moas: 'Contract',
    internship_applications: 'Application',
    forms_templates: 'Form Template',
    countries: 'Country',
    companies: 'Company / Agency',
  };
  return map[tableName] || tableName;
}

/** Human-readable verb for an audit-log action. */
function actionWord(actionType: string): string {
  switch (actionType) {
    case 'create':
      return 'Added';
    case 'update':
      return 'Updated';
    case 'delete':
      return 'Deleted';
    default:
      return actionType;
  }
}

/** Build a readable body line describing what changed on an admin audit record. */
function auditBody(row: any): string {
  const label = tableLabel(row.table_name);
  const newVals = (row.new_values || {}) as any;
  const oldVals = (row.old_values || {}) as any;
  const name = newVals.name || newVals.title || oldVals.name || oldVals.title || row.record_id || '—';

  if (row.action_type === 'create') {
    return `New ${label} “${name}” was added.`;
  }
  if (row.action_type === 'delete') {
    return `${label} “${name}” was deleted.`;
  }
  const changed: string[] = [];
  const allKeys = new Set([...Object.keys(oldVals || {}), ...Object.keys(newVals || {})]);
  allKeys.forEach((k) => {
    const oldV = oldVals[k];
    const newV = newVals[k];
    if (String(oldV) !== String(newV)) changed.push(k);
  });
  const detail = changed.length > 0 ? ` (${changed.join(', ')})` : '';
  return `${label} “${name}” was updated${detail}.`;
}

@Component({
  selector: 'app-notifications-dropdown',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="relative group">
      <!-- Bell button -->
      <button
        type="button"
        (click)="toggle()"
        [attr.aria-expanded]="isOpen"
        aria-haspopup="menu"
        aria-label="Notifications"
        class="grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/20 hover:text-amber-300 focus:outline-none focus:ring-2 focus-ring-amber-400/50 focus:ring-offset-2 focus-ring-offset-[#1E3A5F]">
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M10 21a2 2 0 0 0 4 0" stroke-linecap="round" />
        </svg>
        <!-- Unread dot badge -->
        <span *ngIf="notifications().length > 0"
              class="absolute right-1 top-1 z-20 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#1E3A5F]"></span>
      </button>

      <!-- Dropdown panel (overflow-safe on mobile) -->
      <div *ngIf="isOpen"
           role="menu"
           class="absolute z-50 mt-2 w-full max-w-xs md:w-80 overflow-hidden rounded-xl border border-white/20 bg-[#1E3A5F]/95 shadow-lg backdrop-blur-sm text-white mx-auto md:mx-0 right-0 md:right-0 left-0 md:left-auto">

        <!-- Header -->
        <div class="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <p class="text-sm font-bold text-white">Notifications</p>
          <button
            type="button"
            (click)="viewAll()"
            class="text-xs font-bold text-amber-400 hover:text-white underline-offset-2 hover:underline">
            View all
          </button>
        </div>

        <div class="divide-y divide-white/10 max-h-[400px] overflow-y-auto py-2">
          <button *ngFor="let n of notifications(); trackBy: trackByNotification"
                  role="menuitem"
                  (click)="close()"
                  class="w-full px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-white/10 transition-colors border-b border-white/5 last:border-0">
            <div class="flex-col gap-0.5">
              <p class="text-sm font-semibold text-white">{{ n.title }}</p>
              <p class="text-xs text-slate-300 mt-0.5 leading-relaxed line-clamp-2">{{ n.body }}</p>
              <span class="text-[10px] text-slate-500 font-medium whitespace-nowrap">{{ n.timeAgo }}</span>
            </div>
            <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border"
                  [ngClass]="typeBadgeClass(n.type)">
              {{ typeLabel(n.type) }}
            </span>
          </button>

          <div *ngIf="notifications().length === 0"
               role="menuitem"
               class="px-4 py-6 text-center">
            <p class="text-xs text-slate-400 italic">No new notifications.</p>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class NotificationsDropdownComponent implements OnInit, OnDestroy {
  readonly profileService = inject(ProfileService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  isOpen = false;
  notifications = signal<DropdownNotification[]>([]);
  loading = signal(false);
  private sub: any = null;

  trackByNotification = (_: number, n: DropdownNotification): string => n.id;

  /** Icon badge style per notification type (bound from template). */
  typeBadgeClass(type: DropdownNotification['type']): string {
    switch (type) {
      case 'application':
        return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'requirement':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'admin-action':
        return 'bg-purple-100 text-purple-700 border-purple-200';
    }
  }

  /** Icon badge label per notification type (bound from template). */
  typeLabel(type: DropdownNotification['type']): string {
    switch (type) {
      case 'application':
        return 'Application';
      case 'requirement':
        return 'Document';
      case 'admin-action':
        return 'Admin Action';
    }
  }

  async ngOnInit(): Promise<void> {
    await this.loadNotifications();
    this.subscribeToUpdates();
  }

  ngOnDestroy(): void {
    if (this.sub) {
      supabase.removeChannel(this.sub);
      this.sub = null;
    }
  }

  toggle(): void {
    this.isOpen = !this.isOpen;
  }

  close(): void {
    this.isOpen = false;
  }

  viewAll(): void {
    this.close();
    const role = this.profileService.profile()?.role;
    if (role === 'admin') {
      this.router.navigate(['/admin-dashboard/notification-logs']);
    } else {
      this.router.navigate(['/dashboard/notifications']);
    }
  }

  /** Load up to 8 recent notifications, scoped by role. */
  async loadNotifications(): Promise<void> {
    this.loading.set(true);
    try {
      const profile = this.profileService.profile();
      const studentId = profile?.student_id;
      const role = profile?.role;
      const isAdmin = role === 'admin';

      const itemsWithDate: { item: DropdownNotification; date: Date }[] = [];

      if (isAdmin) {
        // Applications (all students)
        const { data: apps } = await supabase
          .from('internship_applications')
          .select('id, reference_number, host_company, position_role, status, student_name, submitted_at')
          .order('submitted_at', { ascending: false })
          .limit(20);

        (apps || []).forEach((a: any) => {
          const d = new Date(a.submitted_at || '');
          itemsWithDate.push({
            item: {
              id: `app-${a.id}`,
              title: 'New Internship Application',
              body: `${a.student_name || 'A student'} applied for ${a.position_role} at ${a.host_company} (Ref: ${a.reference_number || '—'})`,
              timeAgo: timeAgo(a.submitted_at),
              type: 'application',
              status: a.status || '—',
            },
            date: d,
          });
        });

        // Document requirements (all students)
        const { data: reqs } = await supabase
          .from('student_requirements')
          .select('id, requirement_name, status, student_name, updated_at')
          .order('updated_at', { ascending: false })
          .limit(20);

        (reqs || []).forEach((r: any) => {
          const d = new Date(r.updated_at || '');
          itemsWithDate.push({
            item: {
              id: `req-${r.id}`,
              title: 'Document Verification Updated',
              body: `${r.student_name || 'A student'} — ${r.requirement_name} marked as ${r.status}`,
              timeAgo: timeAgo(r.updated_at),
              type: 'requirement',
              status: r.status || '—',
            },
            date: d,
          });
        });

        // Admin audit logs
        const { data: auditLogs } = await supabase
          .from('admin_activity_logs')
          .select('id, action_type, table_name, record_id, old_values, new_values, performed_at')
          .order('performed_at', { ascending: false })
          .limit(20);

        (auditLogs || []).forEach((log: any) => {
          const d = new Date(log.performed_at || '');
          itemsWithDate.push({
            item: {
              id: `audit-${log.id}`,
              title: `${actionWord(log.action_type)} ${tableLabel(log.table_name)}`,
              body: auditBody(log),
              timeAgo: timeAgo(log.performed_at),
              type: 'admin-action',
              status: log.action_type,
            },
            date: d,
          });
        });
      } else if (studentId) {
        // Own application (latest)
        const { data: apps } = await supabase
          .from('internship_applications')
          .select('*')
          .eq('student_id', studentId)
          .order('submitted_at', { ascending: false })
          .limit(1);

        const app = apps?.[0] || null;
        if (app) {
          const d = new Date(app.submitted_at || app.updated_at || '');
          itemsWithDate.push({
            item: {
              id: `app-${app.id}`,
              title: 'Application Status Updated',
              body: `Your application for ${app.position_role} at ${app.host_company} is now ${app.status}.`,
              timeAgo: timeAgo(app.submitted_at || app.updated_at),
              type: 'application',
              status: app.status || '—',
            },
            date: d,
          });
        }

        // Own document requirements
        const { data: reqs } = await supabase
          .from('student_requirements')
          .select('*')
          .eq('student_id', studentId)
          .order('updated_at', { ascending: false });

        for (const r of (reqs || [])) {
          const d = new Date(r.updated_at || '');
          const status = (r.status || 'pending').toLowerCase();
          if (status === 'rejected') {
            itemsWithDate.push({
              item: {
                id: `req-${r.id}-rejected`,
                title: 'Document Rejected',
                body: `Your ${r.requirement_name} has been rejected. Please upload a valid document to proceed.`,
                timeAgo: timeAgo(r.updated_at),
                type: 'requirement',
                status: r.status,
              },
              date: d,
            });
          } else if (status === 'pending' && !r.file_url) {
            itemsWithDate.push({
              item: {
                id: `req-${r.id}-upload`,
                title: 'Document Upload Pending',
                body: `Please upload your ${r.requirement_name} to proceed with your application.`,
                timeAgo: timeAgo(r.updated_at),
                type: 'requirement',
                status: r.status,
              },
              date: d,
            });
          } else if (status === 'pending' && r.file_url) {
            itemsWithDate.push({
              item: {
                id: `req-${r.id}-review`,
                title: 'Document Awaiting Review',
                body: `Your ${r.requirement_name} has been uploaded and is pending verification.`,
                timeAgo: timeAgo(r.updated_at),
                type: 'requirement',
                status: r.status,
              },
              date: d,
            });
          } else if (status === 'verified') {
            itemsWithDate.push({
              item: {
                id: `req-${r.id}-verified`,
                title: 'Document Verified',
                body: `Your ${r.requirement_name} has been verified.`,
                timeAgo: timeAgo(r.updated_at),
                type: 'requirement',
                status: r.status,
              },
              date: d,
            });
          }
        }
      }

      itemsWithDate.sort((a, b) => b.date.getTime() - a.date.getTime());
      this.notifications.set(itemsWithDate.map((x) => x.item).slice(0, 8));
    } catch (err) {
      console.error('[NotificationsDropdown] Error loading notifications:', err);
      this.notifications.set([]);
    } finally {
      this.loading.set(false);
      this.cdr.markForCheck();
    }
  }

  /** Realtime refresh on relevant table changes. */
  private subscribeToUpdates(): void {
    this.sub = supabase.channel('notifications-dropdown-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'internship_applications' },
        () => void this.loadNotifications())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_requirements' },
        () => void this.loadNotifications())
      .subscribe((status) => {
        console.log('[NotificationsDropdown] Realtime channel status:', status);
      });
  }
}
