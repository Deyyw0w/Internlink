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

interface FieldChange {
  label: string;
  oldValue: string;
  newValue: string;
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

/** Internal/noisy fields that add no useful context for admins. */
const NOISE_FIELDS = new Set(['id']);

/** Timestamp-ish field names worth formatting as local date/time. */
const TIME_FIELDS = new Set([
  'created_at', 'updated_at', 'submitted_at', 'performed_at',
  'verify_date', 'application_deadline', 'contract_start_date', 'contract_end_date',
]);

/** Slug-ish field names worth title-casing. */
const SLUG_FIELDS = new Set([
  'status', 'action_type', 'table_name', 'verification_status',
  'contract_type', 'requirement_type', 'file_type',
]);

/** Fields worth showing first when summarizing a deleted record. */
const DELETED_LABEL_KEYS = [
  'refNumber', 'reference_number', 'host_company', 'company_name',
  'name', 'contract_title', 'form_name', 'template_name', 'country_name',
];

/** Convert a technical field name into a human-readable label. */
function fieldLabel(key: string): string {
  const map: Record<string, string> = {
    is_active: 'Active Status',
    fileName: 'File Name',
    fileUrl: 'File URL',
    updated_at: 'Last Updated',
    refNumber: 'Reference Number',
    studentId: 'Student ID',
    action_type: 'Action Type',
    table_name: 'Table',
    record_id: 'Record',
    performed_by: 'Performed By',
    performed_at: 'Performed At',
    actor_name: 'Actor',
    status: 'Status',
    admin_notes: 'Admin Notes',
    host_company: 'Host Company',
    position_role: 'Position / Role',
    location: 'Location',
    reference_number: 'Reference Number',
    submitted_at: 'Submitted At',
    company_name: 'Company Name',
    company_email: 'Company Email',
    contact_person: 'Contact Person',
    contact_email: 'Contact Email',
    contact_phone: 'Contact Phone',
    address: 'Address',
    industry: 'Industry',
    website: 'Website',
    logo_url: 'Logo URL',
    description: 'Description',
    requirements: 'Requirements',
    available_slots: 'Available Slots',
    application_deadline: 'Application Deadline',
    created_at: 'Created At',
    name: 'Name',
    country_name: 'Country Name',
    code: 'Code',
    form_name: 'Form Name',
    template_name: 'Template Name',
    file_type: 'File Type',
    file_size: 'File Size',
    requirement_name: 'Requirement Name',
    requirement_type: 'Requirement Type',
    is_required: 'Required',
    verification_status: 'Verification Status',
    verify_date: 'Verify Date',
    verified_by: 'Verified By',
    contract_title: 'Contract Title',
    contractor_name: 'Contractor Name',
    contract_value: 'Contract Value',
    contract_start_date: 'Contract Start Date',
    contract_end_date: 'Contract End Date',
    contract_type: 'Contract Type',
  };
  if (map[key]) return map[key];
  return key
    .replace(/[_\-]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** True when the field should be skipped entirely (internal/noisy). */
function isNoiseField(key: string): boolean {
  return NOISE_FIELDS.has(key);
}

/** Title-case a slug/status string: removal-requested → Removal Requested. */
function titleCase(value: string): string {
  return value
    .replace(/[_\-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Format a single value for display based on its field name and type. */
function formatValue(key: string, value: any): string {
  if (value === undefined || value === null || value === '') return '—';

  // Boolean → Active / Inactive
  if (typeof value === 'boolean') return value ? 'Active' : 'Inactive';

  // Timestamp fields → readable local date/time, e.g. Nov 21, 2026, 11:04 PM
  if (TIME_FIELDS.has(key) || /_at$|_date$/i.test(key)) {
    const d = new Date(String(value));
    if (!isNaN(d.getTime())) {
      const h12 = d.getHours() % 12 || 12;
      const minutes = d.getMinutes().toString().padStart(2, '0');
      const ampm = d.getHours() >= 12 ? 'PM' : 'AM';
      const month = d.toLocaleString(undefined, { month: 'short' });
      return `${month} ${d.getDate()}, ${d.getFullYear()}, ${h12}:${minutes} ${ampm}`;
    }
    return String(value);
  }

  // Slug / status → Title Case
  if (SLUG_FIELDS.has(key)) {
    return titleCase(String(value));
  }

  return String(value);
}

/** Returns the list of changed fields for display (create/update),
 *  or an empty array for delete (use deletedSummary instead). */
function changedFields(row: AuditRow): FieldChange[] {
  if (row.action_type === 'delete') return [];

  const oldVals = row.old_values || {};
  const newVals = row.new_values || {};
  const changes: FieldChange[] = [];
  const allKeys = new Set([...Object.keys(oldVals), ...Object.keys(newVals)]);

  allKeys.forEach((k) => {
    if (isNoiseField(k)) return;

    const oldV = oldVals[k];
    const newV = newVals[k];

    // Skip empty — → — transitions (both sides null/undefined/empty string)
    const oldEmpty = oldV === undefined || oldV === null || oldV === '';
    const newEmpty = newV === undefined || newV === null || newV === '';
    if (oldEmpty && newEmpty) return;

    // Skip if both sides stringify identically
    if (String(oldV) === String(newV)) return;

    changes.push({
      label: fieldLabel(k),
      oldValue: formatValue(k, oldV),
      newValue: formatValue(k, newV),
    });
  });

  return changes;
}

/** Concise summary of a deleted record, pulled from old_values. */
function deletedSummary(row: AuditRow): string {
  const oldVals = row.old_values || {};
  const parts: string[] = [];

  for (const k of DELETED_LABEL_KEYS) {
    const v = oldVals[k];
    if (v !== undefined && v !== null && v !== '') {
      parts.push(String(v));
      if (parts.length >= 2) break;
    }
  }

  const status = oldVals['status'];
  if (status !== undefined && status !== null && status !== '') {
    parts.push(titleCase(String(status)));
  }

  if (parts.length > 0) {
    return `Deleted record — ${parts.join(' • ')}`;
  }
  return `Deleted record (${row.record_id || '—'})`;
}

/** Inline text summary of changed fields (used for search + tooltip). */
function changesSummaryText(row: AuditRow): string {
  if (row.action_type === 'delete') return deletedSummary(row);
  const fields = changedFields(row);
  if (fields.length === 0) {
    if (row.action_type === 'create') return 'new record created';
    return '—';
  }
  return fields.map((f) => `${f.label}: ${f.oldValue} → ${f.newValue}`).join('; ');
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
  pageSize = 15;
  currentPage = signal(1);

  trackByLog = (_: number, l: AuditRow): string => l.id;

  /** Track which log row has its change-details expanded. */
  expandedLogId = signal<string | null>(null);

  /** Toggle the review-changes expansion for a given log row. */
  toggleReview(logId: string): void {
    this.expandedLogId.set(this.expandedLogId() === logId ? null : logId);
    this.cdr.markForCheck();
  }

  /** Check whether a given log row is expanded. */
  isExpanded(logId: string): boolean {
    return this.expandedLogId() === logId;
  }

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
          changesSummaryText(l),
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
  changedFields = changedFields;
  deletedSummary = deletedSummary;
  changesSummaryText = changesSummaryText;
  timeAgo = timeAgo;
}