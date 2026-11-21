import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ProfileService } from '../../../auth/profile.service';
import { supabase } from '../../../../environments/supabase.config';

export interface StudentProfile {
  id: string;
  full_name: string;
  email: string;
  student_id: string;
  degree_program: string;
  department_name: string;
  department_abbreviation: string;
  practicum_hours: number;
  mobile: string;
  role: string;
  created_at: string;
  updated_at: string;
}

export interface InternshipApplication {
  id: string;
  student_id: string;
  reference_number: string;
  host_company: string;
  position_role: string;
  status: string;
  submitted_at: string;
  location: string;
}

export interface StudentRequirement {
  id: string;
  student_id: string;
  requirement_name: string;
  file_name: string | null;
  file_url: string | null;
  status: string;
  updated_at: string;
}

export interface InternshipPosting {
  id: string;
  company_id: string;
  company_name: string;
  company_email: string;
  position_title: string;
  description: string | null;
  requirements: string | null;
  available_slots: number;
  application_deadline: string | null;
  status: string;
  created_at: string;
  // Derived from company.industry for program-based filtering
  degree: string;
  tags: string[];
  location: string; // from company.address
}

function industryToDegreeTags(industry: string | null, knownDegrees: Set<string>): string[] {
  if (!industry) return [];
  const lower = industry.toLowerCase();
  const candidateTags: string[] = [];
  if (lower.includes('technology') || lower.includes('software') || lower.includes('computer')) {
    candidateTags.push('BS in Computer Science', 'BS in Information Technology');
  }
  if (lower.includes('engineering') || lower.includes('infrastructure') || lower.includes('automation')) {
    candidateTags.push('BS in Electrical Engineering', 'BS in Civil Engineering');
  }
  if (
    lower.includes('accounting') ||
    lower.includes('accountancy') ||
    lower.includes('business') ||
    lower.includes('professional services')
  ) {
    candidateTags.push('BS in Accountancy', 'BS in Business Administration');
  }
  if (
    lower.includes('healthcare') ||
    lower.includes('medical') ||
    lower.includes('hospital') ||
    lower.includes('pharmaceutical')
  ) {
    candidateTags.push('BS in Nursing');
  }
  if (lower.includes('hospitality') || lower.includes('hotel')) {
    candidateTags.push('BS in Hospitality Management');
  }
  if (lower.includes('education') || lower.includes('international development')) {
    candidateTags.push('Bachelor of Secondary Education');
  }
  // Keep only tags that exist in the degree_programs table (dynamic from DB — no hardcoded degree names)
  const matched = candidateTags.filter((t) => knownDegrees.has(t));
  return matched.length > 0 ? matched : [industry];
}

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.css'
})
export class DashboardPageComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly profileService = inject(ProfileService);

  studentPills = [
    { label: 'Student ID', value: '', accent: false },
    { label: 'Program', value: '', accent: false },
    { label: 'Required Hours', value: '', accent: true },
  ];

  studentName = '';
  studentEmail = '';
  studentId = '';
  degreeProgram = '';
  departmentName = '';
  departmentAbbreviation = '';
  practicumHours = 0;
  profileInitials = '';
  loading = true;

  internshipApplication: InternshipApplication | null = null;
  studentRequirements: StudentRequirement[] = [];
  internshipPostings: InternshipPosting[] = [];
  loadingAppData = false;

  // Dynamic set of degree program names from the degree_programs table (no hardcoding).
  knownDegrees = new Set<string>();

  private authSubscription: any = null;
  private applicationsSubscription: any = null;

  async ngOnInit(): Promise<void> {
    console.log('[Dashboard] ngOnInit started');

    // Check current session first
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    console.log('[Dashboard] Initial session:', { session: session?.user?.id, sessionError });

    if (sessionError || !session?.user) {
      console.log('[Dashboard] No authenticated user — redirecting to login');
      this.profileService.profile.set(null);
      this.profileService.loading.set(false);
      this.loading = false;
      this.cdr.markForCheck();
      void this.router.navigate(['/login']);
      return;
    }

    await this.loadProfile(session.user);
    await this.subscribeToApplicationUpdates();

    // Listen to auth state changes (covers page refreshes and redirects)
    this.authSubscription = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[Dashboard] Auth state changed:', event, session?.user?.id);

      if (!session?.user) {
        console.log('[Dashboard] No authenticated user — clearing shared state');
        this.profileService.profile.set(null);
        this.profileService.loading.set(false);
        this.loading = false;
        this.cdr.markForCheck();
        // Navigation to /login is handled by TopbarComponent.signOut(),
        // so two components never race over redirects.
        return;
      }

      await this.loadProfile(session.user);
    });
  }

  ngOnDestroy(): void {
    if (typeof this.authSubscription?.unsubscribe === 'function') {
      this.authSubscription.unsubscribe();
    }
    if (typeof this.applicationsSubscription?.unsubscribe === 'function') {
      this.applicationsSubscription.unsubscribe();
      this.applicationsSubscription = null;
    }
  }

  /** Subscribe to real-time application changes so the student dashboard
   *  reflects admin approvals/rejections/removals instantly without a page refresh. */
  private subscribeToApplicationUpdates(): void {
    const studentId = this.studentId;
    if (!studentId) return;

    const studentIdText = String(studentId);

    this.applicationsSubscription = supabase
      .channel('student-dashboard-application-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'internship_applications' },
        (payload) => {
          const newApp = payload.new as any;
          const oldApp = payload.old as any;

          // Admin deleted this application (= approved removal request)
          if (!newApp && oldApp?.student_id === studentIdText) {
            this.internshipApplication = null;
            this.cdr.markForCheck();
            return;
          }

          if (newApp?.student_id === studentIdText) {
            this.internshipApplication = newApp;
            this.cdr.markForCheck();
          }
        }
      )
      .subscribe((status) => {
        console.log('[Dashboard] Realtime channel (internship_applications) status:', status);
      });
  }

  private async loadProfile(user: any): Promise<void> {
    console.log('[Dashboard] Loading profile for user:', user.id);

    try {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      console.log('[Dashboard] Profile result:', { profile: profile?.full_name, profileError });

      if (profileError || !profile) {
        console.log('[Dashboard] No profile found for user:', user.id);
        this.profileService.profile.set(null);
        this.profileService.loading.set(false);
        this.loading = false;
        this.cdr.markForCheck();
        void this.router.navigate(['/login']);
        return;
      }

      this.studentName = profile.full_name;
      this.studentEmail = profile.email;
      this.studentId = profile.student_id;
      this.degreeProgram = profile.degree_program;
      this.departmentName = profile.department_name;
      this.departmentAbbreviation = profile.department_abbreviation;
      this.practicumHours = profile.practicum_hours ?? 0;
      this.profileInitials = this.computeInitials(profile.full_name);

      // Expose to the topbar (and any other component) via shared service
      this.profileService.profile.set(profile);
      this.profileService.loading.set(false);

      await this.loadDashboardData(profile.student_id);

      this.studentPills = [
        { label: 'Student ID', value: this.studentId, accent: false },
        { label: 'Program', value: this.degreeProgram, accent: false },
        { label: 'Required Hours', value: `${this.practicumHours} hrs`, accent: true },
      ];

      console.log('[Dashboard] Profile loaded:', this.studentName, this.studentId);
    } catch (err) {
      console.error('[Dashboard] Error loading profile:', err);
      this.profileService.profile.set(null);
    } finally {
      this.loading = false;
      this.profileService.loading.set(false);
      this.cdr.markForCheck();
    }
  }

  private computeInitials(fullName: string): string {
    return fullName
      .split(' ')
      .map(part => part.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('');
  }

  /** Fetch live Supabase data for the dashboard cards. */
  private async loadDashboardData(studentId: string): Promise<void> {
    this.loadingAppData = true;
    this.cdr.markForCheck();

    try {
      // 1. Latest internship application for this student
      const { data: apps, error: appError } = await supabase
        .from('internship_applications')
        .select('*')
        .eq('student_id', studentId)
        .order('submitted_at', { ascending: false })
        .limit(1);

      if (appError) throw appError;
      this.internshipApplication = apps?.[0] || null;

      // 2. Student requirements / documents
      const { data: reqs, error: reqError } = await supabase
        .from('student_requirements')
        .select('*')
        .eq('student_id', studentId)
        .order('requirement_name');

      if (reqError) throw reqError;
      this.studentRequirements = reqs || [];

      // 3. Open internship postings (with company info embedded)
      const { data: postings, error: postError } = await supabase
        .from('internship_postings')
        .select('*')
        .eq('status', 'open')
        .order('created_at', { ascending: false });

      if (postError) throw postError;

      // Load degree programs dynamically from the DB so degree names are never hardcoded.
      try {
        const { data: degreePrograms } = await supabase
          .from('degree_programs')
          .select('name')
          .eq('is_active', true);

        (degreePrograms || []).forEach((d: any) => {
          if (d.name) this.knownDegrees.add(d.name);
        });
      } catch (degErr) {
        console.error('[Dashboard] Failed to load degree programs:', degErr);
      }

      // Fetch companies separately to derive degree tags for program-based filtering
      // (nested company join is ambiguous on internship_postings — see PGRST201 fix)
      const { data: companiesData } = await supabase
        .from('companies')
        .select('id, industry, address');

      const companyMap = new Map<string, any>();
      (companiesData || []).forEach((c: any) => {
        companyMap.set(c.id, c);
      });

      // Build a name -> address map so we can show company location on the application card
      const companyNameMap = new Map<string, string>();
      (companiesData || []).forEach((c: any) => {
        companyNameMap.set(c.name, c.address || '—');
      });

      this.internshipPostings = (postings || []).map((p: any) => {
        const company = companyMap.get(p.company_id) || {};
        const tags = industryToDegreeTags(company.industry || null, this.knownDegrees);
        return {
          ...p,
          degree: company.industry || '—',
          tags,
          location: company.address || '—',
        };
      });

      // Attach company location to the student's application (no company name shown)
      if (this.internshipApplication) {
        this.internshipApplication.location = companyNameMap.get(this.internshipApplication.host_company) || '—';
      }
    } catch (err) {
      console.error('[Dashboard] Error loading dashboard data:', err);
    } finally {
      this.loadingAppData = false;
      this.cdr.markForCheck();
    }
  }

  /** Application lifecycle steps computed from live application + requirements data. */
  get lifecycle() {
    const app = this.internshipApplication;
    const hasUploads = this.studentRequirements.some((r) => !!r.file_url);
    const allUploaded = this.studentRequirements.length > 0 && this.studentRequirements.every((r) => !!r.file_url);
    const allVerified = this.studentRequirements.length > 0 && this.studentRequirements.every((r) => r.status === 'verified');
    const anyRejected = this.studentRequirements.some((r) => r.status === 'rejected');

    const hasApplication = !!app;
    const appStatus = (app?.status || '').toLowerCase();

    const draftState = hasApplication ? 'completed' : 'active';
    const submittedState = hasApplication ? 'completed' : 'pending';
    const reviewState = anyRejected
      ? 'rejected'
      : allVerified && allUploaded
        ? 'completed'
        : appStatus === 'pending' || appStatus === 'under_review'
          ? 'active'
          : 'pending';
    const approvedState = appStatus === 'approved'
      ? 'completed'
      : anyRejected
        ? 'rejected'
        : 'pending';

    return [
      { label: 'Draft', state: draftState },
      { label: 'Submitted', state: submittedState },
      { label: 'Under Review', state: reviewState },
      { label: 'Approved', state: approvedState },
    ];
  }

  /** Requirements completion percentage computed from live student_requirements data.
   * Counts only requirements that actually have a file uploaded, so a fresh account
   * (with nothing uploaded) shows 0% rather than inheriting pre-seeded statuses.
   * Strictly evaluates to 0% when total is 0 or nothing is uploaded yet. */
  get requirementsProgress(): number {
    const total = this.studentRequirements.length;
    const uploaded = this.studentRequirements.filter((r) => !!r.file_url).length;
    if (total === 0 || uploaded === 0) return 0;
    return Math.round((uploaded / total) * 100);
  }

  /** Requirements summary computed from live student_requirements data. */
  get checklist() {
    const verified = this.studentRequirements.filter((r) => r.status === 'verified').length;
    const pending = this.studentRequirements.filter((r) => r.status === 'pending').length;
    const rejected = this.studentRequirements.filter((r) => r.status === 'rejected').length;
    return [
      { label: 'Verified Documents', value: String(verified), tone: 'success' },
      { label: 'Pending Review', value: String(pending), tone: 'info' },
      { label: 'Rejected', value: String(rejected), tone: 'error' },
    ];
  }

  /** Recommended opportunities computed from live internship_postings data.
   * Postings are filtered to those relevant to the student's degree program
   * (matching the posting's degree tags derived from company industry),
   * then limited to 3 postings on the dashboard. All postings are on the
   * Internship Postings page. Falls back to all open postings when no
   * program match is found or the student has no program on file. */
  get opportunities() {
    const all = this.internshipPostings;
    const program = (this.degreeProgram || '').trim();

    const matchesProgram = program
      ? all.filter((p) =>
          p.tags.some(
            (tag) =>
              tag.toLowerCase() === program.toLowerCase() ||
              tag.toLowerCase().includes(program.toLowerCase()) ||
              program.toLowerCase().includes(tag.toLowerCase())
          )
        )
      : [];

    const filtered = program && matchesProgram.length > 0 ? matchesProgram : all;

    return filtered
      .slice(0, 3)
      .map((p) => ({
        id: p.id,
        title: p.position_title,
        description: p.description || '',
        slots: p.available_slots,
        deadline: p.application_deadline,
        location: p.location,
        tags: p.tags,
        company: p.company_name,
      }));
  }
}
