import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { supabase } from '../../../../environments/supabase.config';

interface AdminNotification {
  id: string;
  title: string;
  body: string;
  timeAgo: string;
  type: 'application' | 'requirement' | 'admin-action';
  status?: string;
}

/** Friendly label for a monitored table. */
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
      return 'Removed';
    default:
      return actionType;
  }
}

/** Friendly column names for audit-log changes (plain language). */
function friendlyColumn(key: string): string {
  const map: Record<string, string> = {
    id: 'record ID',
    reference_number: 'application number',
    student_id: 'student',
    host_company: 'company',
    position_role: 'position',
    status: 'status',
    requirement_name: 'document',
    file_name: 'file',
    file_url: 'document link',
    name: 'name',
    title: 'title',
    description: 'description',
    performed_by: 'admin user',
    updated_at: 'updated at',
    submitted_at: 'submitted at',
  };
  return map[key] || key;
}

/** Build a plain-language body line describing what changed on a record. */
function auditBody(row: any): string {
  const label = tableLabel(row.table_name);
  const newVals = (row.new_values || {}) as any;
  const oldVals = (row.old_values || {}) as any;
  const name = newVals.name || newVals.title || oldVals.name || oldVals.title || 'this record';

  if (row.action_type === 'create') {
    return `New ${label} “${name}” was added.`;
  }
  if (row.action_type === 'delete') {
    return `${label} “${name}” was removed.`;
  }
  // update — describe which fields changed in plain language (no raw UUIDs)
  const changed: string[] = [];
  const allKeys = new Set([...Object.keys(oldVals || {}), ...Object.keys(newVals || {})]);
  allKeys.forEach((k) => {
    const oldV = oldVals[k];
    const newV = newVals[k];
    if (String(oldV) !== String(newV)) changed.push(k);
  });
  const detail = changed.length > 0 ? ` — ${changed.map(friendlyColumn).join(', ')} changed` : '';
  return `${label} “${name}” was updated${detail}.`;
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

@Component({
  selector: 'app-admin-notification-logs-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <main class="w-full px-8 py-6 space-y-6">

      <!-- Header -->
      <section class="bg-[#1E3A5F] border-l-4 border-amber-500 text-white rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div class="flex flex-col gap-1">
          <h2 class="text-xl font-extrabold tracking-tight">Admin Notification Logs</h2>
          <p class="text-sm text-slate-300 leading-relaxed max-w-xl">
            Monitor student application submissions, document verification events, admin CRUD changes, and approval actions in real time.
          </p>
        </div>
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-[0.7rem] font-bold text-slate-600 border border-slate-200">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          Live
        </div>
      </section>

      <!-- Stats Bar -->
      <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm transition-all duration-150 hover:-translate-y-1 hover:border-blue-200/60">
          <p class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Total Logs</p>
          <p class="text-2xl font-bold text-slate-900">{{ notificationStats().total }}</p>
        </div>
        <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm transition-all duration-150 hover:-translate-y-1 hover:border-blue-200/60">
          <p class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Applications</p>
          <p class="text-2xl font-bold text-slate-900">{{ notificationStats().applications }}</p>
        </div>
        <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm transition-all duration-150 hover:-translate-y-1 hover:border-blue-200/60">
          <p class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Documents</p>
          <p class="text-2xl font-bold text-slate-900">{{ notificationStats().requirements }}</p>
        </div>
        <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm transition-all duration-150 hover:-translate-y-1 hover:border-blue-200/60">
          <p class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Admin Actions</p>
          <p class="text-2xl font-bold text-slate-900">{{ notificationStats().adminActions }}</p>
        </div>
        <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm transition-all duration-150 hover:-translate-y-1 hover:border-blue-200/60">
          <p class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Latest Activity</p>
          <p class="text-2xl font-bold text-slate-900">{{ notificationStats().latest }}</p>
        </div>
      </section>

      <!-- Notification Logs List -->
      <section class="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div class="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <h3 class="text-base font-bold text-slate-900">Activity Feed</h3>
          <span
            class="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border"
            [ngClass]="{
              'bg-emerald-50 text-emerald-700 border-emerald-200': notificationStats().total > 0,
              'bg-slate-50 text-slate-500 border-slate-100': notificationStats().total === 0
            }"
          >
            {{ notificationStats().total }} events
          </span>
        </div>

        <div class="divide-y divide-slate-100" *ngIf="notifications().length > 0; else emptyState">
          <button *ngFor="let n of notifications(); trackBy: trackByNotification"
            class="w-full px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-slate-50 transition-colors border-b border-slate-50/50 last:border-0"
          >
            <div class="flex-col gap-0.5">
              <div class="flex items-center gap-2">
                <p class="text-sm font-semibold text-slate-900">{{ n.title }}</p>
                <span
                  class="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                  [ngClass]="{
                    'bg-amber-100 text-amber-700': n.type === 'application',
                    'bg-blue-100 text-blue-700': n.type === 'requirement',
                    'bg-purple-100 text-purple-700': n.type === 'admin-action'
                  }"
                >
                  {{ n.type === 'application' ? 'Application' : n.type === 'requirement' ? 'Document' : 'Admin Action' }}
                </span>
              </div>
              <p class="text-xs text-slate-600 mt-0.5 leading-relaxed">{{ n.body }}</p>
              <span class="text-xs text-slate-400 font-medium whitespace-nowrap">{{ n.timeAgo }}</span>
            </div>
            <span
              class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[0.7rem] font-bold uppercase tracking-wider border"
              [ngClass]="{
                'bg-emerald-50 text-emerald-700 border-emerald-200': n.status === 'approved' || n.status === 'verified',
                'bg-amber-50 text-amber-700 border-amber-200': n.status === 'under-review' || n.status === 'pending',
                'bg-rose-50 text-rose-700 border-rose-200': n.status === 'rejected',
                'bg-slate-50 text-slate-500 border-slate-100': !n.status
              }"
            >
              {{ (n.status || '—') | uppercase }}
            </span>
          </button>
        </div>

        <ng-template #emptyState>
          <div class="px-6 py-12 text-center">
            <p class="text-xs text-slate-500 italic">No notification events yet. Activity will appear here as students apply and documents are verified.</p>
          </div>
        </ng-template>
      </section>

    </main>
  `,
})
export class NotificationLogsPageComponent implements OnInit, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private logsSubscription: any = null;
  private auditLogsSubscription: any = null;

  notifications = signal<AdminNotification[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);

  trackByNotification = (_: number, n: AdminNotification): string => n.id;

  async ngOnInit(): Promise<void> {
    await this.loadLogs();
    this.subscribeToUpdates();
  }

  async loadLogs(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      // Fetch recent applications
      const { data: apps, error: appsError } = await supabase
        .from('internship_applications')
        .select('id, reference_number, host_company, position_role, status, student_name, submitted_at')
        .order('submitted_at', { ascending: false })
        .limit(20);

      if (appsError) throw appsError;

      // Fetch recent requirement changes
      const { data: reqs, error: reqsError } = await supabase
        .from('student_requirements')
        .select('id, requirement_name, status, student_name, updated_at')
        .order('updated_at', { ascending: false })
        .limit(20);

      if (reqsError) throw reqsError;

      // Fetch recent admin audit-log entries
      const { data: auditLogs, error: auditError } = await supabase
        .from('admin_activity_logs')
        .select('id, action_type, table_name, record_id, old_values, new_values, performed_by, performed_at')
        .order('performed_at', { ascending: false })
        .limit(20);

      if (auditError) throw auditError;

      const itemsWithDate: { item: AdminNotification; date: Date }[] = [];

      (apps || []).forEach((a: any) => {
        const appDate = new Date(a.submitted_at || '');
        itemsWithDate.push({
          item: {
            id: `app-${a.id}`,
            title: 'New Internship Application',
            body: `${a.student_name || 'A student'} applied for ${a.position_role} at ${a.host_company} (Ref: ${a.reference_number || '—'})`,
            timeAgo: timeAgo(a.submitted_at),
            type: 'application',
            status: a.status || '—',
          },
          date: appDate,
        });
      });

      (reqs || []).forEach((r: any) => {
        const reqDate = new Date(r.updated_at || '');
        itemsWithDate.push({
          item: {
            id: `req-${r.id}`,
            title: 'Document Verification Updated',
            body: `${r.student_name || 'A student'} — ${r.requirement_name} marked as ${r.status}`,
            timeAgo: timeAgo(r.updated_at),
            type: 'requirement',
            status: r.status || '—',
          },
          date: reqDate,
        });
      });

      (auditLogs || []).forEach((log: any) => {
        const logDate = new Date(log.performed_at || '');
        itemsWithDate.push({
          item: {
            id: `audit-${log.id}`,
            title: `${actionWord(log.action_type)} ${tableLabel(log.table_name)}`,
            body: auditBody(log),
            timeAgo: timeAgo(log.performed_at),
            type: 'admin-action',
            status: log.action_type,
          },
          date: logDate,
        });
      });

      itemsWithDate.sort((a, b) => b.date.getTime() - a.date.getTime());
      this.notifications.set(itemsWithDate.map((x) => x.item).slice(0, 20));
    } catch (err) {
      console.error('[AdminNotificationLogs] Error loading logs:', err);
      this.error.set(err instanceof Error ? err.message : 'Failed to load notification logs.');
    } finally {
      this.loading.set(false);
      this.cdr.markForCheck();
    }
  }

  /** Computed stats for the stat bar. */
  notificationStats() {
    const list = this.notifications();
    return {
      total: list.length,
      applications: list.filter((n) => n.type === 'application').length,
      requirements: list.filter((n) => n.type === 'requirement').length,
      adminActions: list.filter((n) => n.type === 'admin-action').length,
      latest: list.length > 0 ? list[0].timeAgo : '—',
    };
  }

  /** Subscribe to real-time changes so the log feed updates live. */
  private subscribeToUpdates(): void {
    this.logsSubscription = supabase
      .channel('admin-notification-logs-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'internship_applications' },
        () => {
          console.log('[AdminNotificationLogs] Realtime event (internship_applications): refreshing logs.');
          void this.loadLogs();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'student_requirements' },
        () => {
          console.log('[AdminNotificationLogs] Realtime event (student_requirements): refreshing logs.');
          void this.loadLogs();
        }
      )
      .subscribe((status) => {
        console.log('[AdminNotificationLogs] Realtime channel status:', status);
      });

    // Admin audit-log entries (INSERT only — the trail is append-only).
    this.auditLogsSubscription = supabase
      .channel('admin-audit-logs-updates')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'admin_activity_logs' },
        () => {
          console.log('[AdminNotificationLogs] Realtime event (admin_activity_logs): refreshing logs.');
          void this.loadLogs();
        }
      )
      .subscribe((status) => {
        console.log('[AdminNotificationLogs] Realtime channel (admin_activity_logs) status:', status);
      });
  }

  ngOnDestroy(): void {
    if (this.logsSubscription) {
      supabase.removeChannel(this.logsSubscription);
      this.logsSubscription = null;
    }
    if (this.auditLogsSubscription) {
      supabase.removeChannel(this.auditLogsSubscription);
      this.auditLogsSubscription = null;
    }
  }
}
