import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, OnInit, OnDestroy, signal } from '@angular/core';

import { NewsCarouselComponent, NewsItem } from '../../news-carousel/news-carousel.component';
import { supabase } from '../../../../environments/supabase.config';

type StatTone = 'blue' | 'orange' | 'green' | 'purple';
type StatIcon = 'users' | 'clock' | 'check' | 'building';

interface StatCard {
  label: string;
  value: string;
  subtext: string;
  tone: StatTone;
  icon: StatIcon;
}

@Component({
  selector: 'app-admin-dashboard-page',
  standalone: true,
  imports: [CommonModule, NewsCarouselComponent],
  templateUrl: './dashboard-page.html',
})
export class AdminDashboardPageComponent implements OnInit, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private adminSubscription: any = null;

  statCards = signal<StatCard[]>([]);
  newsItems = signal<NewsItem[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);

  trackByStat = (_: number, item: StatCard): string => item.label;
  trackByNews = (_: number, item: NewsItem): string => item.title;

  async ngOnInit(): Promise<void> {
    await this.loadStats();
    await this.loadNews();
    this.subscribeToUpdates();
  }

  ngOnDestroy(): void {
    if (this.adminSubscription) {
      supabase.removeChannel(this.adminSubscription);
      this.adminSubscription = null;
    }
  }

  async loadStats(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      // Total applicants + pending + approved from applications
      const { data: apps, error: appsError } = await supabase
        .from('internship_applications')
        .select('id, status');

      if (appsError) throw appsError;

      const applications = (apps || []) as any[];
      const totalApps = applications.length;
      const pendingApps = applications.filter((a) =>
        a.status?.toLowerCase() === 'under-review' || a.status?.toLowerCase() === 'pending'
      ).length;
      const approvedApps = applications.filter((a) =>
        a.status?.toLowerCase() === 'approved'
      ).length;

      // Partner agencies (active + total)
      const { data: companies, error: companiesError } = await supabase
        .from('companies')
        .select('id, is_active');

      if (companiesError) throw companiesError;

      const companyRows = (companies || []) as any[];
      const activeAgencies = companyRows.filter((c) => c.is_active === true).length;
      const totalAgencies = companyRows.length;

      this.statCards.set([
        {
          label: 'TOTAL APPLICANTS',
          value: String(totalApps),
          subtext: 'AY 2026-2027 Cohort',
          tone: 'blue',
          icon: 'users',
        },
        {
          label: 'PENDING REVIEW',
          value: String(pendingApps),
          subtext: 'Requires Action',
          tone: 'orange',
          icon: 'clock',
        },
        {
          label: 'APPROVED PLACEMENTS',
          value: String(approvedApps),
          subtext: 'Cleared for Deployment',
          tone: 'green',
          icon: 'check',
        },
        {
          label: 'PARTNER AGENCIES (HTE)',
          value: String(activeAgencies),
          subtext: `${totalAgencies} Total`,
          tone: 'purple',
          icon: 'building',
        },
      ]);
    } catch (err) {
      console.error('[AdminDashboard] Error loading stats:', err);
      this.error.set(err instanceof Error ? err.message : 'Failed to load dashboard stats.');
    } finally {
      this.loading.set(false);
      this.cdr.markForCheck();
    }
  }

  async loadNews(): Promise<void> {
    try {
      // Derive news items from recent application and requirement activity
      const { data: apps, error: appsError } = await supabase
        .from('internship_applications')
        .select('id, reference_number, host_company, position_role, status, submitted_at')
        .order('submitted_at', { ascending: false })
        .limit(5);

      if (appsError) throw appsError;

      const { data: reqs, error: reqsError } = await supabase
        .from('student_requirements')
        .select('id, requirement_name, status, updated_at')
        .order('updated_at', { ascending: false })
        .limit(5);

      if (reqsError) throw reqsError;

      const items: NewsItem[] = [];

      (apps || []).forEach((a: any) => {
        items.push({
          title: 'New Internship Application',
          excerpt: `Application for ${a.position_role} at ${a.host_company} submitted (${a.reference_number || '—'})`,
          date: a.submitted_at
            ? new Date(a.submitted_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
            : 'Recent',
          imageLabel: 'Application',
        });
      });

      (reqs || []).forEach((r: any) => {
        items.push({
          title: 'Document Status Updated',
          excerpt: `${r.requirement_name} marked as ${r.status}`,
          date: r.updated_at
            ? new Date(r.updated_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
            : 'Recent',
          imageLabel: 'Document',
        });
      });

      // Sort newest first, take top 4
      items.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      this.newsItems.set(items.slice(0, 4));
    } catch (err) {
      console.error('[AdminDashboard] Error loading news:', err);
      this.newsItems.set([]);
    }
  }

  /** Subscribe to real-time changes so stats and news refresh live when students apply or admins verify documents. */
  private subscribeToUpdates(): void {
    this.adminSubscription = supabase
      .channel('admin-dashboard-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'internship_applications' },
        () => {
          console.log('[AdminDashboard] Realtime event (internship_applications): refreshing stats + news.');
          void this.loadStats();
          void this.loadNews();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'student_requirements' },
        () => {
          console.log('[AdminDashboard] Realtime event (student_requirements): refreshing stats + news.');
          void this.loadStats();
          void this.loadNews();
        }
      )
      .subscribe((status) => {
        console.log('[AdminDashboard] Realtime channel status:', status);
      });
  }
}
