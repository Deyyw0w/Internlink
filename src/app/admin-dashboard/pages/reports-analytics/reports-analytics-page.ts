import { ChangeDetectorRef, Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { supabase } from '../../../../environments/supabase.config';

export interface ApplicationRow {
  id: string;
  reference_number: string | null;
  host_company: string | null;
  position_role: string | null;
  status: string | null;
  student_name: string | null;
  submitted_at: string | null;
  created_at: string | null;
}

export interface StatCard {
  label: string;
  value: string;
  delta: string | null;
  deltaUp: boolean | null;
  tone: 'blue' | 'orange' | 'green' | 'red' | 'purple';
  icon: 'users' | 'clock' | 'check' | 'building' | 'file-text';
}

type DateRangePreset = '7d' | '30d' | '90d' | 'ytd' | 'custom' | 'all';

@Component({
  selector: 'app-reports-analytics-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reports-analytics-page.html',
  styleUrl: './reports-analytics-page.css'
})
export class ReportsAnalyticsPageComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);

  // Raw data from Supabase (fetched once, filtered client-side)
  applications = signal<ApplicationRow[]>([]);
  profiles = signal<any[]>([]);
  companies = signal<any[]>([]);
  requirements = signal<any[]>([]);

  loading = signal(false);
  error = signal<string | null>(null);

  private analyticsSubscription: any = null;

  // Date range controls
  dateRange = signal<DateRangePreset>('30d');
  customFrom = signal<string>('');
  customTo = signal<string>('');

  trackByApp = (_: number, a: ApplicationRow): string => a.id;

  // Pagination
  pageSize = 15;
  currentPage = signal(1);

  /** Date range preset options for the selector. */
  readonly datePresets: { key: DateRangePreset; label: string }[] = [
    { key: '7d', label: 'Last 7 days' },
    { key: '30d', label: 'Last 30 days' },
    { key: '90d', label: 'Last 3 months' },
    { key: 'ytd', label: 'This year' },
    { key: 'custom', label: 'Custom' },
    { key: 'all', label: 'All time' },
  ];

  ngOnInit(): void {
    this.loadData();
    this.subscribeToUpdates();
  }

  ngOnDestroy(): void {
    if (this.analyticsSubscription) {
      supabase.removeChannel(this.analyticsSubscription);
      this.analyticsSubscription = null;
    }
  }

  /** Load all raw data from Supabase. No realtime subscriptions — analytics are snapshots. */
  async loadData(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const [appsRes, profilesRes, companiesRes, reqsRes] = await Promise.all([
        supabase
          .from('internship_applications')
          .select('id, reference_number, host_company, position_role, status, student_name, submitted_at, created_at')
          .order('submitted_at', { ascending: false }),
        supabase.from('profiles').select('id, role, degree_program, email').eq('role', 'student'),
        supabase.from('companies').select('id, name, is_active'),
        supabase.from('student_requirements').select('id, status, updated_at'),
      ]);

      if (appsRes.error) throw appsRes.error;
      if (profilesRes.error) throw profilesRes.error;
      if (companiesRes.error) throw companiesRes.error;
      if (reqsRes.error) throw reqsRes.error;

      this.applications.set((appsRes.data || []) as ApplicationRow[]);
      this.profiles.set(profilesRes.data || []);
      this.companies.set(companiesRes.data || []);
      this.requirements.set(reqsRes.data || []);

      this.cdr.markForCheck();
    } catch (err) {
      console.error('[ReportsAnalytics] Error loading data:', err);
      this.error.set(err instanceof Error ? err.message : 'Failed to load analytics data.');
    } finally {
      this.loading.set(false);
      this.cdr.markForCheck();
    }
  }

  /** Change the date range preset. */
  setDateRange(preset: DateRangePreset): void {
    this.dateRange.set(preset);
    if (preset !== 'custom') {
      this.customFrom.set('');
      this.customTo.set('');
    }
    this.resetPage();
  }

  /** Apply the custom From/To date range. Keeps dateRange on 'custom' so the
   *  reactive filteredApps computed picks up the new customFrom/customTo values. */
  applyCustomRange(): void {
    this.dateRange.set('custom');
    this.resetPage();
    this.cdr.markForCheck();
  }

  /** Compute the start/end date for the selected range. */
  private rangeBounds(): { start: Date | null; end: Date | null } {
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    const preset = this.dateRange();

    if (preset === 'all') {
      return { start: null, end: null };
    }

    if (preset === 'custom') {
      const from = this.customFrom() ? new Date(this.customFrom()) : null;
      const to = this.customTo() ? new Date(this.customTo()) : null;
      return { start: from, end: to || now };
    }

    let start = new Date();
    start.setHours(0, 0, 0, 0);

    switch (preset) {
      case '7d':
        start.setDate(start.getDate() - 6);
        break;
      case '30d':
        start.setDate(start.getDate() - 29);
        break;
      case '90d':
        start.setDate(start.getDate() - 89);
        break;
      case 'ytd':
        start = new Date(now.getFullYear(), 0, 1);
        break;
    }

    return { start, end: now };
  }

  /** Compute the previous period (same length, immediately before current range). */
  private prevRangeBounds(): { start: Date | null; end: Date | null } {
    const cur = this.rangeBounds();
    if (!cur.start || !cur.end) return { start: null, end: null };

    const durationMs = cur.end.getTime() - cur.start.getTime();
    const prevEnd = new Date(cur.start.getTime() - 1);
    prevEnd.setHours(23, 59, 59, 999);
    const prevStart = new Date(prevEnd.getTime() - durationMs);
    prevStart.setHours(0, 0, 0, 0);

    return { start: prevStart, end: prevEnd };
  }

  private inRange(iso: string | null, start: Date | null, end: Date | null): boolean {
    if (!iso) return false;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return false;
    // 'All time' (no start/end) includes everything
    if (!start || !end) return true;
    return d >= start && d <= end;
  }

  /** Applications within the selected date range. */
  readonly filteredApps = computed(() => {
    const { start, end } = this.rangeBounds();
    return this.applications().filter((a) =>
      this.inRange(a.submitted_at || a.created_at, start, end)
    );
  });

  /** Paged applications for display. */
  readonly pagedApps = computed(() => {
    const list = this.filteredApps();
    const start = (this.currentPage() - 1) * this.pageSize;
    return list.slice(start, start + this.pageSize);
  });

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredApps().length / this.pageSize))
  );

  /** Reset to page 1 whenever filters change. */
  private resetPage(): void {
    this.currentPage.set(1);
    this.cdr.markForCheck();
  }

  previousPage(): void {
    if (this.currentPage() > 1) this.currentPage.update((p) => p - 1);
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages()) this.currentPage.update((p) => p + 1);
  }

  /** Applications within the previous period (for deltas). */
  readonly prevApps = computed(() => {
    const { start, end } = this.prevRangeBounds();
    return this.applications().filter((a) =>
      this.inRange(a.submitted_at || a.created_at, start, end)
    );
  });

  /** Status distribution for the current range. */
  readonly statusCounts = computed(() => {
    const apps = this.filteredApps();
    const counts: Record<string, number> = {};
    (apps || []).forEach((a) => {
      const s = (a.status || 'unknown').toLowerCase();
      counts[s] = (counts[s] || 0) + 1;
    });
    return counts;
  });

  /** Previous period status counts (for deltas). */
  readonly prevStatusCounts = computed(() => {
    const apps = this.prevApps();
    const counts: Record<string, number> = {};
    (apps || []).forEach((a) => {
      const s = (a.status || 'unknown').toLowerCase();
      counts[s] = (counts[s] || 0) + 1;
    });
    return counts;
  });

  /** Stat cards with period-over-period deltas. */
  readonly statCards = computed<StatCard[]>(() => {
    const cur = this.statusCounts();
    const prev = this.prevStatusCounts();

    const totalCur = Object.values(cur).reduce((a, b) => a + b, 0);
    const totalPrev = Object.values(prev).reduce((a, b) => a + b, 0);
    const totalDelta = this.pctDelta(totalCur, totalPrev);

    const pendingCur = (cur['pending'] || 0) + (cur['under-review'] || 0);
    const pendingPrev = (prev['pending'] || 0) + (prev['under-review'] || 0);
    const pendingDelta = this.pctDelta(pendingCur, pendingPrev);

    const approvedCur = cur['approved'] || 0;
    const approvedPrev = prev['approved'] || 0;
    const approvedDelta = this.pctDelta(approvedCur, approvedPrev);

    const rejectedCur = cur['rejected'] || 0;
    const rejectedPrev = prev['rejected'] || 0;
    const rejectedDelta = this.pctDelta(rejectedCur, rejectedPrev);

    const deltaUp = (d: string | null): boolean | null => {
      if (d === null || d === '—') return null;
      return d === '∞' || !d.startsWith('-');
    };

    return [
      {
        label: 'TOTAL APPLICATIONS',
        value: String(totalCur),
        delta: totalDelta,
        deltaUp: deltaUp(totalDelta),
        tone: 'blue',
        icon: 'users',
      },
      {
        label: 'PENDING REVIEW',
        value: String(pendingCur),
        delta: pendingDelta,
        deltaUp: deltaUp(pendingDelta),
        tone: 'orange',
        icon: 'clock',
      },
      {
        label: 'APPROVED',
        value: String(approvedCur),
        delta: approvedDelta,
        deltaUp: deltaUp(approvedDelta),
        tone: 'green',
        icon: 'check',
      },
      {
        label: 'REJECTED',
        value: String(rejectedCur),
        delta: rejectedDelta,
        deltaUp: deltaUp(rejectedDelta),
        tone: 'red',
        icon: 'file-text',
      },
    ];
  });

  private pctDelta(cur: number, prev: number): string | null {
    if (prev === 0) return cur > 0 ? '∞' : '—';
    const pct = Math.round(((cur - prev) / prev) * 100);
    return pct >= 0 ? `+${pct}%` : `${pct}%`;
  }

  /** Monthly application counts for the last 6 months (for bar chart). */
  readonly monthlyChart = computed(() => {
    const now = new Date();
    const months: { label: string; value: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleDateString(undefined, { month: 'short' });
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      const count = this.applications().filter((a) =>
        this.inRange(a.submitted_at || a.created_at, start, end)
      ).length;
      months.push({ label, value: count });
    }
    return months;
  });

  /** Top companies by application count (for horizontal bar chart). */
  readonly companyChart = computed(() => {
    const counts: Record<string, number> = {};
    this.applications().forEach((a) => {
      const host = a.host_company || 'Unknown';
      counts[host] = (counts[host] || 0) + 1;
    });
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([name, value]) => ({ name, value }));
  });

  /** Students by degree program. */
  readonly degreeChart = computed(() => {
    const counts: Record<string, number> = {};
    this.profiles().forEach((p) => {
      const deg = p.degree_program || 'Unknown';
      counts[deg] = (counts[deg] || 0) + 1;
    });
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6)
      .map(([name, value]) => ({ name, value }));
  });

  /** Document verification status breakdown. */
  readonly docStatusCounts = computed(() => {
    const counts: Record<string, number> = {};
    this.requirements().forEach((r) => {
      const s = (r.status || 'pending').toLowerCase();
      counts[s] = (counts[s] || 0) + 1;
    });
    return counts;
  });

  /** Max value across monthly chart (for bar height scaling). */
  readonly monthlyMax = computed(() => {
    const vals = this.monthlyChart().map((m) => m.value);
    return vals.length > 0 ? Math.max(...vals) : 0;
  });

  /** Max value across company chart. */
  readonly companyMax = computed(() => {
    const vals = this.companyChart().map((c) => c.value);
    return vals.length > 0 ? Math.max(...vals) : 0;
  });

  /** Max value across degree chart (for bar height scaling). */
  readonly degreeMax = computed(() => {
    const vals = this.degreeChart().map((d) => d.value);
    return vals.length > 0 ? Math.max(...vals) : 0;
  });

  /** Document status types for the verification breakdown cards. */
  docStatusTypes(): string[] {
    return ['pending', 'verified', 'rejected'];
  }

  /** Donut segment percentages. */
  readonly donutSegments = computed(() => {
    const cur = this.statusCounts();
    const total = Object.values(cur).reduce((a, b) => a + b, 0);
    if (total === 0) return [];
    const order = ['pending', 'under-review', 'approved', 'rejected'];
    return order
      .filter((s) => (cur[s] || 0) > 0)
      .map((s) => ({
        status: s,
        value: cur[s] || 0,
        pct: Math.round(((cur[s] || 0) / total) * 100),
      }));
  });

  /** Insight summary text. */
  readonly insight = computed(() => {
    const total = this.statCards()[0]?.value || '0';
    const companies = this.companyChart().length;
    const topCompany = this.companyChart()[0];
    const months = this.monthlyChart();
    const peakMonth = months.reduce((a, b) => (b.value > a.value ? b : a), { label: '—', value: 0 });

    let insight = `Over the selected period, there were ${total} applications across ${companies} companies.`;
    if (topCompany) {
      insight += ` ${topCompany.name} had the most (${topCompany.value}).`;
    }
    if (peakMonth.value > 0) {
      insight += ` The busiest month was ${peakMonth.label} with ${peakMonth.value} applications.`;
    }
    return insight;
  });

  /** Export the currently filtered applications to CSV. */
  exportCSV(): void {
    const apps = this.filteredApps();
    if (apps.length === 0) {
      alert('No data to export.');
      return;
    }

    const headers = ['ID', 'Reference Number', 'Company', 'Position', 'Status', 'Student Name', 'Submitted At'];
    const rows = apps.map((a) =>
      [a.id, a.reference_number ?? '', a.host_company ?? '', a.position_role ?? '', a.status ?? '', a.student_name ?? '', a.submitted_at ?? '']
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    );

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reports-analytics-${this.dateRange()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  /** Track by function for stat cards. */
  trackByStat = (_: number, c: StatCard): string => c.label;

  /** Background color class for stat card icons. */
  statIconBg(tone: StatCard['tone']): Record<string, boolean> {
    const map: Record<StatCard['tone'], string> = {
      blue: 'bg-[#1E3A5F]',
      orange: 'bg-orange-500',
      green: 'bg-emerald-500',
      red: 'bg-rose-500',
      purple: 'bg-purple-500',
    };
    return { [map[tone]]: true };
  }

  /** Text color class for stat card icons. */
  statIconColor(tone: StatCard['tone']): string {
    return 'text-white';
  }

  /** Stroke color for a donut segment. */
  donutColor(status: string): string {
    const map: Record<string, string> = {
      pending: '#f59e0b',
      'under-review': '#f59e0b',
      approved: '#10b981',
      rejected: '#ef4444',
    };
    return map[status] || '#6b7280';
  }

  /** Tailwind color class for a donut segment dot. */
  donutColorClass(status: string): string {
    const map: Record<string, string> = {
      pending: 'bg-orange-500',
      'under-review': 'bg-orange-500',
      approved: 'bg-emerald-500',
      rejected: 'bg-rose-500',
    };
    return map[status] || 'bg-slate-400';
  }

  /** Short status label for display. */
  statusLabel(status: string | null): string {
    return (status || 'unknown').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /** Color tone class for a status. */
  statusTone(status: string | null): string {
    const s = (status || 'unknown').toLowerCase();
    if (s === 'pending' || s === 'under-review') return 'text-orange-700 bg-orange-50 border-orange-100';
    if (s === 'approved') return 'text-emerald-700 bg-emerald-50 border-emerald-100';
    if (s === 'rejected') return 'text-rose-700 bg-rose-50 border-rose-100';
    return 'text-slate-700 bg-slate-50 border-slate-100';
  }

  /** Subscribe to real-time changes so analytics refresh live when students apply,
   *  documents are verified, or companies are updated. */
  private subscribeToUpdates(): void {
    this.analyticsSubscription = supabase
      .channel('admin-reports-analytics-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'internship_applications' },
        () => {
          console.log('[ReportsAnalytics] Realtime event (internship_applications): refreshing data.');
          void this.loadData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          console.log('[ReportsAnalytics] Realtime event (profiles): refreshing data.');
          void this.loadData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'companies' },
        () => {
          console.log('[ReportsAnalytics] Realtime event (companies): refreshing data.');
          void this.loadData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'student_requirements' },
        () => {
          console.log('[ReportsAnalytics] Realtime event (student_requirements): refreshing data.');
          void this.loadData();
        }
      )
      .subscribe((status) => {
        console.log('[ReportsAnalytics] Realtime channel status:', status);
      });
  }
}
