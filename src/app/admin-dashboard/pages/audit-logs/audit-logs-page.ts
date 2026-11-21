import { ChangeDetectorRef, Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { supabase } from '../../../../environments/supabase.config';

interface AuditRow {
  id: string;
  action_type: 'create' | 'update' | 'delete';
  table_name: string;
  record_id: string;
  old_values: any;
  new_values: any;
  performed_by: string | null;
  performed_at: string;
  actor_name: string | null;
}

type ActionFilter = 'all' | 'create' | 'update' | 'delete';

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

/** Human-friendly table label. */
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

/** Icon badge style for an action type. */
function actionBadge(action: string): string {
  switch (action) {
    case 'create':
      return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    case 'update':
      return 'bg-amber-50 text-amber-700 border-amber-100';
    case 'delete':
      return 'bg-rose-50 text-rose-700 border-rose-100';
    default:
      return 'bg-slate-50 text-slate-600 border-slate-100';
  }
}

/** Action label. */
function actionLabel(action: string): string {
  const map: Record<string, string> = { create: 'Added', update: 'Updated', delete: 'Deleted' };
  return map[action] || action;
}

/** Short, readable description of changed fields with old → new values.
 *  Example: "status: under-review → approved; admin_notes: — → Documents verified"
 */
function changesSummary(row: AuditRow): string {
  const oldVals = row.old_values || {};
  const newVals = row.new_values || {};
  const changed: string[] = [];
  const allKeys = new Set([...Object.keys(oldVals), ...Object.keys(newVals)]);
  allKeys.forEach((k) => {
    const oldV = oldVals[k];
    const newV = newVals[k];
    if (String(oldV) !== String(newV)) {
      const oldStr = oldV === undefined || oldV === null ? '—' : String(oldV);
      const newStr = newV === undefined || newV === null ? '—' : String(newV);
      // Truncate long values so the table cell stays readable.
      const truncatedOld = oldStr.length > 35 ? oldStr.slice(0, 35) + '…' : oldStr;
      const truncatedNew = newStr.length > 35 ? newStr.slice(0, 35) + '…' : newStr;
      changed.push(`${k}: ${truncatedOld} → ${truncatedNew}`);
    }
  });
  if (changed.length === 0) {
    if (row.action_type === 'create') return 'new record created';
    if (row.action_type === 'delete') return 'record deleted';
    return '—';
  }
  return changed.join('; ');
}

@Component({
  selector: 'app-admin-audit-logs-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './audit-logs-page.html',
  styleUrl: './audit-logs-page.css'
})
export class AdminAuditLogsPageComponent implements OnInit, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private logsSubscription: any = null;

  actors = new Map<string, string>(); // performed_by -> full_name
  logs = signal<AuditRow[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);

  // Filters
  actionFilter = signal<ActionFilter>('all');
  tableFilter = signal('');
  searchQuery = signal('');
  dateFrom = signal('');
  dateTo = signal('');

  // Pagination
  pageSize = 20;
  currentPage = signal(1);

  trackByLog = (_: number, l: AuditRow): string => l.id;

  /** Tables available for the filter dropdown. */
  readonly tableOptions = [
    { key: '', label: 'All tables' },
    { key: 'contract_categories', label: 'Contract Category' },
    { key: 'contracts_moas', label: 'Contract' },
    { key: 'internship_applications', label: 'Application' },
    { key: 'forms_templates', label: 'Form Template' },
    { key: 'countries', label: 'Country' },
    { key: 'companies', label: 'Company / Agency' },
  ];

  /** Action filter chips. */
  readonly actionOptions: { key: ActionFilter; label: string }[] = [
    { key: 'all', label: 'All actions' },
    { key: 'create', label: 'Added' },
    { key: 'update', label: 'Updated' },
    { key: 'delete', label: 'Deleted' },
  ];

  /** Logs after applying all filters. */
  readonly filteredLogs = computed(() => {
    const action = this.actionFilter();
    const table = this.tableFilter();
    const q = (this.searchQuery() || '').toLowerCase();
    const from = this.dateFrom() ? new Date(this.dateFrom()) : null;
    const to = this.dateTo() ? new Date(this.dateTo()) : null;

    return this.logs().filter((l) => {
      if (action !== 'all' && l.action_type !== action) return false;
      if (table && l.table_name !== table) return false;
      if (q) {
        const haystack = [
          l.table_name,
          l.record_id,
          l.actor_name || '',
          actionLabel(l.action_type),
          changesSummary(l),
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      const d = new Date(l.performed_at);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  });

  /** Paged logs for display. */
  readonly pagedLogs = computed(() => {
    const list = this.filteredLogs();
    const start = (this.currentPage() - 1) * this.pageSize;
    return list.slice(start, start + this.pageSize);
  });

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filteredLogs().length / this.pageSize)));

  /** Stat counts. */
  readonly stats = computed(() => {
    const list = this.filteredLogs();
    return {
      total: list.length,
      creates: list.filter((l) => l.action_type === 'create').length,
      updates: list.filter((l) => l.action_type === 'update').length,
      deletes: list.filter((l) => l.action_type === 'delete').length,
    };
  });

  async ngOnInit(): Promise<void> {
    await this.loadLogs();
    this.subscribeToUpdates();
  }

  ngOnDestroy(): void {
    if (this.logsSubscription) {
      supabase.removeChannel(this.logsSubscription);
      this.logsSubscription = null;
    }
  }

  /** Load audit logs + actor names from profiles. */
  async loadLogs(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const { data: rows, error: logsError } = await supabase
        .from('admin_activity_logs')
        .select('id, action_type, table_name, record_id, old_values, new_values, performed_by, performed_at')
        .order('performed_at', { ascending: false })
        .limit(200);

      if (logsError) throw logsError;

      const rawLogs = (rows || []) as any[];

      // Resolve actor names from profiles.
      const actorIds = [...new Set(rawLogs.map((r) => r.performed_by).filter(Boolean))] as string[];
      const actorMap = new Map<string, string>();
      if (actorIds.length > 0) {
        const { data: profiles, error: profError } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', actorIds);
        if (!profError) {
          (profiles || []).forEach((p: any) => actorMap.set(p.id, p.full_name || '—'));
        }
      }

      const mapped: AuditRow[] = rawLogs.map((r) => ({
        id: r.id,
        action_type: r.action_type,
        table_name: r.table_name,
        record_id: r.record_id,
        old_values: r.old_values,
        new_values: r.new_values,
        performed_by: r.performed_by ?? null,
        performed_at: r.performed_at,
        actor_name: r.performed_by ? actorMap.get(r.performed_by) ?? '—' : 'System',
      }));

      this.logs.set(mapped);
      this.actors = actorMap;
      this.cdr.markForCheck();
    } catch (err) {
      console.error('[AuditLogs] Error loading logs:', err);
      this.error.set(err instanceof Error ? err.message : 'Failed to load audit logs.');
    } finally {
      this.loading.set(false);
      this.cdr.markForCheck();
    }
  }

  /** Reset to page 1 whenever filters change. */
  private resetPage(): void {
    this.currentPage.set(1);
    this.cdr.markForCheck();
  }

  setActionFilter(action: ActionFilter): void {
    this.actionFilter.set(action);
    this.resetPage();
  }

  setTableFilter(table: string): void {
    this.tableFilter.set(table);
    this.resetPage();
  }

  onSearchChange(): void {
    this.resetPage();
  }

  onDateChange(): void {
    this.resetPage();
  }

  clearFilters(): void {
    this.actionFilter.set('all');
    this.tableFilter.set('');
    this.searchQuery.set('');
    this.dateFrom.set('');
    this.dateTo.set('');
    this.resetPage();
  }

  previousPage(): void {
    if (this.currentPage() > 1) this.currentPage.update((p) => p - 1);
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages()) this.currentPage.update((p) => p + 1);
  }

  /** Subscribe to real-time inserts so new audit entries appear live. */
  private subscribeToUpdates(): void {
    this.logsSubscription = supabase
      .channel('admin-audit-logs-page-updates')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'admin_activity_logs' },
        () => {
          console.log('[AuditLogs] Realtime event (admin_activity_logs): refreshing.');
          void this.loadLogs();
        }
      )
      .subscribe((status: any) => {
        console.log('[AuditLogs] Realtime channel status:', status);
      });
  }

  /** Actor name for a row (fallback). */
  actor(performedBy: string | null, actorName: string | null): string {
    return actorName || (performedBy ? performedBy.slice(0, 8) + '…' : '—');
  }

  tableLabel = tableLabel;
  actionBadge = actionBadge;
  actionLabel = actionLabel;
  changesSummary = changesSummary;
  timeAgo = timeAgo;
}
