import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { RouterModule } from '@angular/router';

import { NewsCarouselComponent, NewsItem } from '../../news-carousel/news-carousel.component';
import { supabase } from '../../../../environments/supabase.config';

type StatTone = 'blue' | 'orange' | 'green' | 'purple';
type StatIcon = 'file-text' | 'clock' | 'users' | 'building';

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
  imports: [CommonModule, RouterModule, NewsCarouselComponent],
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
  statRoute(card: StatCard): string {
    switch (card.label) {
      case 'PENDING DOCUMENTS':
        return '/admin-dashboard/document-checklist';
      case 'APPLICATIONS TODAY':
        return '/admin-dashboard/student-applicants';
      case 'ACTIVE AGENCIES':
        return '/admin-dashboard/partner-agencies';
      case 'NEW STUDENTS THIS MONTH':
        return '/admin-dashboard/accounts-management';
      default:
        return '/admin-dashboard/dashboard';
    }
  }
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
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      // Documents pending verification (requires admin action)
      const { data: reqs, error: reqsError } = await supabase
        .from('student_requirements')
        .select('id, status');

      if (reqsError) throw reqsError;

      const requirements = (reqs || []) as any[];
      const pendingDocs = requirements.filter(
        (r) => (r.status || 'pending').toLowerCase() === 'pending'
      ).length;

      // Applications submitted today
      const { data: apps, error: appsError } = await supabase
        .from('internship_applications')
        .select('id, submitted_at');

      if (appsError) throw appsError;

      const applications = (apps || []) as any[];
      const appsToday = applications.filter((a) => {
        const d = new Date(a.submitted_at || '');
        return !isNaN(d.getTime()) && d >= todayStart && d <= todayEnd;
      }).length;

      // New students this month
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, role, created_at');

      if (profilesError) throw profilesError;

      const profileRows = (profiles || []) as any[];
      const newStudents = profileRows.filter((p) => {
        if (p.role?.toLowerCase() !== 'student') return false;
        const d = new Date(p.created_at || '');
        return !isNaN(d.getTime()) && d >= monthStart;
      }).length;

      // Active partner agencies
      const { data: companies, error: companiesError } = await supabase
        .from('companies')
        .select('id, is_active');

      if (companiesError) throw companiesError;

      const companyRows = (companies || []) as any[];
      const activeAgencies = companyRows.filter((c) => c.is_active === true).length;
      const totalAgencies = companyRows.length;

      this.statCards.set([
        {
          label: 'PENDING DOCUMENTS',
          value: String(pendingDocs),
          subtext: 'Awaiting Verification',
          tone: 'orange',
          icon: 'file-text',
        },
        {
          label: 'APPLICATIONS TODAY',
          value: String(appsToday),
          subtext: 'Submitted Today',
          tone: 'blue',
          icon: 'clock',
        },
        {
          label: 'NEW STUDENTS THIS MONTH',
          value: String(newStudents),
          subtext: 'Joined This Month',
          tone: 'green',
          icon: 'users',
        },
        {
          label: 'ACTIVE AGENCIES',
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
    // News carousel reads from news table only — no external fetching.
    // Direct browser fetch from usl.edu.ph is blocked by CORS (browser security).
    // If you want live USL program data, route it through a backend proxy first.
    this.newsItems.set([]);
  }

  /** Subscribe to real-time changes so stats refresh live when students apply or admins verify documents. */
  private subscribeToUpdates(): void {
    this.adminSubscription = supabase
      .channel('admin-dashboard-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'internship_applications' },
        () => {
          console.log('[AdminDashboard] Realtime event (internship_applications): refreshing stats.');
          void this.loadStats();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'student_requirements' },
        () => {
          console.log('[AdminDashboard] Realtime event (student_requirements): refreshing stats.');
          void this.loadStats();
        }
      )
      .subscribe((status) => {
        console.log('[AdminDashboard] Realtime channel status:', status);
      });
  }
}
