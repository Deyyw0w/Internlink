import { ChangeDetectorRef, Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { supabase } from '../../../../environments/supabase.config';
import { ProfileService } from '../../../auth/profile.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

export interface InternshipPosting {
  id: string; // uuid
  country: string;          // extracted from companies.address
  track: string;            // position_title
  description: string;      // short description
  location: string;         // companies.address
  duration: string;
  moaValidUntil: string;    // application_deadline
  degree: string;           // companies.industry
  industry: string;         // raw companies.industry from DB
  tags: string[];           // mapped degree tags
  slots: number;            // companies.slots (admin sets this)
  applicants: number;       // derived from internship_applications
  companyName: string;      // companies.name
  companyId: string;        // companies.id
}

const DEFAULT_REQUIREMENTS = [
  'USLT Internship Endorsement Letter',
  'Parent / Guardian Consent Form',
  'Medical Certificate & Drug Test Result',
  'Student Resume / Curriculum Vitae',
];

function extractCountry(address: string | null): string {
  if (!address) return 'International';
  const parts = address.split(',').map(p => p.trim()).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : address;
}

function shortDescription(text: string | null): string {
  if (!text) return 'No description available.';
  const trimmed = text.trim();
  if (trimmed.length <= 120) return trimmed;
  return trimmed.slice(0, 120).trimEnd() + '…';
}

function industryToDegreeTags(industry: string | null): string[] {
  if (!industry) return [];
  const lower = industry.toLowerCase();
  const tags: string[] = [];
  if (lower.includes('technology') || lower.includes('software') || lower.includes('computer')) {
    tags.push('BS in Computer Science', 'BS in Information Technology');
  }
  if (lower.includes('engineering') || lower.includes('infrastructure') || lower.includes('automation')) {
    tags.push('BS in Electrical Engineering', 'BS in Civil Engineering');
  }
  if (lower.includes('accounting') || lower.includes('accountancy') || lower.includes('business') || lower.includes('professional services')) {
    tags.push('BS in Accountancy', 'BS in Business Administration');
  }
  if (lower.includes('healthcare') || lower.includes('medical') || lower.includes('hospital') || lower.includes('pharmaceutical')) {
    tags.push('BS in Nursing');
  }
  if (lower.includes('hospitality') || lower.includes('hotel')) {
    tags.push('BS in Hospitality Management');
  }
  if (lower.includes('education') || lower.includes('international development')) {
    tags.push('Bachelor of Secondary Education');
  }
  return tags.length > 0 ? tags : [industry];
}

@Component({
  selector: 'app-internship-postings-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmDialogComponent, RouterLink],
  templateUrl: './internship-postings-page.component.html',
  styleUrl: './internship-postings-page.component.css',
})
export class InternshipPostingsPageComponent implements OnInit {
  private readonly profileService = inject(ProfileService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  posts = signal<InternshipPosting[]>([]);
  searchQuery = signal('');
  selectedDegreeFilter = signal('');
  departmentFilter = signal('');
  availableDegreeFilters: string[] = [];

  readonly availableDepartments = computed(() => {
    return [...new Set(this.categories().map((c) => c.department))]
      .filter((dept) => dept !== 'GLOCAL')
      .sort();
  });

  // Dynamic categories grouped by department from degree_programs table
  categories = signal<{ department: string; abbreviation: string; degrees: string[]; borderColor: string; bgColor: string; dotColor: string }[]>([]);
  colorPalette = ['border-blue-500 bg-blue-50 text-blue-600', 'border-amber-500 bg-amber-50 text-amber-600', 'border-indigo-500 bg-indigo-50 text-indigo-600', 'border-emerald-500 bg-emerald-50 text-emerald-600'];

  degreePracticumHours = signal<Record<string, string>>({});

  selectedPost: InternshipPosting | null = null;
  modalOpen = false;
  applying = signal(false);
  confirmApplyOpen = false;
  postToApply: InternshipPosting | null = null;

  /** Result shown in a modal after a successful application (replaces alert()). */
  applyResultOpen = false;
  applyResultRef = '';
  applyResultCompany = '';
  loading = signal(true);
  loadError = signal<string | null>(null);

  private postingsSubscription: any = null;
  private companiesSubscription: any = null;

  selectedDegree = '';

  get prescribedHours(): string {
    return this.degreePracticumHours()[this.selectedDegree] || '486 hrs';
  }

  trackById = (_: number, post: InternshipPosting): string => post.id;

  openDetails(post: InternshipPosting) {
    this.selectedPost = post;
    this.modalOpen = true;
  }

  /** True when a posting carries at least one of the category's degree tags. */
  postBelongsToCategory(post: InternshipPosting, degrees: string[]): boolean {
    return degrees.some((d) => (post.tags || []).includes(d));
  }

  closeDetails() {
    this.modalOpen = false;
    this.selectedPost = null;
  }

  readonly filteredPosts = computed(() => {
    let result = this.posts();
    const q = this.searchQuery().toLowerCase().trim();
    if (q) {
      result = result.filter((post) =>
        post.country.toLowerCase().includes(q) ||
        post.track.toLowerCase().includes(q) ||
        post.degree.toLowerCase().includes(q)
      );
    }
    if (this.selectedDegreeFilter()) {
      result = result.filter((post) => post.tags.includes(this.selectedDegreeFilter()));
    }
    if (this.departmentFilter()) {
      result = result.filter((post) => {
        const cat = this.categories().find((c) => c.department === this.departmentFilter());
        return cat && cat.degrees.some((d) => post.tags.includes(d));
      });
    }
    return result;
  });

  async ngOnInit(): Promise<void> {
    await this.loadData();
    this.subscribeToSlotChanges();
  }

  /** Manually refresh data from Supabase (e.g. after admin-driven changes). */
  async refresh(): Promise<void> {
    await this.loadData();
  }

  ngOnDestroy(): void {
    if (this.postingsSubscription) {
      supabase.removeChannel(this.postingsSubscription);
      this.postingsSubscription = null;
    }
    if (this.companiesSubscription) {
      supabase.removeChannel(this.companiesSubscription);
      this.companiesSubscription = null;
    }
  }

  /** Re-fetches postings, applicant counts, and degree program metadata from Supabase. */
  async loadData(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);

    try {
      // Fetch postings
      const { data: rows, error } = await supabase
        .from('internship_postings')
        .select('*, eligible_degrees')
        .eq('status', 'open');

      console.log('[InternshipPostings] Raw Supabase response:', { rows: rows?.length, error });

      if (error) throw error;

      // Fetch companies separately (nested join ambiguous due to multiple FKs)
      const { data: companiesData, error: companiesError } = await supabase
        .from('companies')
        .select('id, name, address, industry, is_active, slots');

      if (companiesError) throw companiesError;

      const companyMap = new Map<string, any>();
      (companiesData || []).forEach((c: any) => {
        companyMap.set(c.id, c);
      });

      const rawRows = (rows || []) as any[];

      const activeRows = rawRows.filter((r: any) => {
        const company = companyMap.get(r.company_id) || {};
        return company.is_active === true;
      });

      this.posts.set(
        activeRows.map((r: any) => {
          const company = companyMap.get(r.company_id) || {};
          const country = extractCountry(company.address);
          return {
            id: r.id,
            country,
            track: r.position_title || 'Internship Position',
            description: shortDescription(r.description),
            location: company.address || '—',
            duration: r.application_deadline ? `Apply by ${new Date(r.application_deadline).toLocaleDateString()}` : '—',
            moaValidUntil: r.application_deadline || '',
            degree: company.industry || '—',
            industry: company.industry || '—',
            tags: r.eligible_degrees
              ? r.eligible_degrees.split(',').map((d: string) => d.trim()).filter(Boolean)
              : [],
            slots: Number(company.slots ?? r.available_slots ?? 0),
            applicants: 0,
            companyName: company.name || '—',
            companyId: r.company_id || '',
          } as InternshipPosting;
        })
      );

      // Derive applicant counts from internship_applications
      const { data: apps, error: appsError } = await supabase
        .from('internship_applications')
        .select('host_company');

      if (appsError) throw appsError;

      const applicantCounts: Record<string, number> = {};
      (apps || []).forEach((a: any) => {
        const host = a.host_company;
        if (host) applicantCounts[host] = (applicantCounts[host] || 0) + 1;
      });

      this.posts.set(
        this.posts().map((p) => ({
          ...p,
          applicants: applicantCounts[p.companyName] || 0,
        }))
      );

      // Load degree programs from DB for dropdown + dynamic categories + practicum hours
      try {
        const { data: degreePrograms, error: degError } = await supabase
          .from('degree_programs')
          .select('name, department, department_abbreviation, practicum_hours, is_active')
          .eq('is_active', true)
          .order('name', { ascending: true });

        if (degError) throw degError;

        const programs = (degreePrograms || []) as any[];

        // Degree filters for dropdown (exclude GLOCAL — it's an admin-only department)
        this.availableDegreeFilters = programs
          .map((d) => d.name)
          .filter((name) => Boolean(name) && name !== 'GLOCAL');

        // Practicum hours map from DB
        const hoursMap: Record<string, string> = {};
        programs.forEach((d) => {
          hoursMap[d.name] = `${d.practicum_hours} hrs`;
        });
        this.degreePracticumHours.set(hoursMap);

        // Set selected degree to first available from DB
        if (!this.selectedDegree && this.availableDegreeFilters.length > 0) {
          this.selectedDegree = this.availableDegreeFilters[0];
        }

        // Build dynamic categories grouped by department
        const deptMap = new Map<string, { department: string; abbreviation: string; degrees: string[] }>();
        programs.forEach((d) => {
          const abbr = d.department_abbreviation || 'OTHER';
          if (!deptMap.has(abbr)) {
            deptMap.set(abbr, {
              department: d.department || 'Other',
              abbreviation: abbr,
              degrees: [],
            });
          }
          deptMap.get(abbr)!.degrees.push(d.name);
        });

        const dynamicCategories = Array.from(deptMap.entries())
          .filter(([, cat]) => cat.department !== 'GLOCAL') // exclude admin-only GLOCAL department
          .map(([abbr, cat], idx) => {
            const [borderColor, bgColor, dotColor] = this.colorPalette[idx % this.colorPalette.length].split(' ');
            return { ...cat, borderColor, bgColor, dotColor };
          });

        this.categories.set(dynamicCategories);
        console.log('[InternshipPostings] Dynamic categories:', dynamicCategories.length);

        // Re-map post tags so they reference actual degree names from the DB
        // (industryToDegreeTags guesses tags; this pass keeps only tags that exist in degree_programs).
        const degreeNames = new Set(this.availableDegreeFilters.filter(Boolean));
        const remappedPosts = this.posts().map((p) => ({
          ...p,
          tags: (p.tags || []).filter((t) => degreeNames.has(t)),
        }));
        this.posts.set(remappedPosts);
      } catch (degErr) {
        console.error('[InternshipPostings] Failed to load degree programs:', degErr);
      }

      const mapped = this.posts().map((p) => ({ company: p.companyName, slots: p.slots, applicants: p.applicants }));
      console.log('[InternshipPostings] Mapped posts:', this.posts().length, mapped);
      this.cdr.markForCheck();

      if (this.posts().length === 0) {
        this.loadError.set('No active postings found. Check that internship_postings.status = "open" and companies.is_active = true.');
      }
    } catch (err) {
      console.error('[InternshipPostings] Error loading postings:', err);
      this.loadError.set(err instanceof Error ? err.message : 'Failed to load postings.');
    } finally {
      this.loading.set(false);
    }
  }

  /** Subscribe to real-time changes on the same tables the admin edits (adds, edits, removals). */
  private subscribeToSlotChanges(): void {
    // Guard against duplicate subscriptions (prevents "cannot add postgres_changes callbacks after subscribe()").
    if (this.postingsSubscription || this.companiesSubscription) {
      console.warn('[InternshipPostings] Subscriptions already exist, skipping re-subscribe.');
      return;
    }

    this.postingsSubscription = supabase
      .channel('student-internship-postings-slots')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'internship_postings' },
        (payload) => {
          console.log('[InternshipPostings] Realtime event (internship_postings):', payload.eventType, payload);
          void this.loadData();
        }
      )
      .subscribe((status) => {
        console.log('[InternshipPostings] Realtime channel (internship_postings) status:', status);
      });

    this.companiesSubscription = supabase
      .channel('student-companies-slots')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'companies' },
        (payload) => {
          console.log('[InternshipPostings] Realtime event (companies):', payload.eventType, payload);
          void this.loadData();
        }
      )
      .subscribe((status) => {
        console.log('[InternshipPostings] Realtime channel (companies) status:', status);
      });
  }

  /** Open the apply-confirm dialog for the given posting. */
  openApplyConfirm(post: InternshipPosting): void {
    if (this.applying()) return;
    if (!post || post.slots <= 0) return;
    this.postToApply = post;
    this.confirmApplyOpen = true;
  }

  /** Confirmed from the dialog — submit the application. */
  async applyConfirmed(): Promise<void> {
    const post = this.postToApply;
    this.closeApplyConfirm();
    if (!post) return;

    this.applying.set(true);

    try {
      const profile = this.profileService.profile();
      const studentId = profile?.student_id;

      if (!studentId) {
        alert('Unable to identify your student account. Please log in again.');
        return;
      }

      const { data: existing } = await supabase
        .from('internship_applications')
        .select('id')
        .eq('student_id', String(studentId))
        .eq('host_company', post.companyName)
        .limit(1);

      if (existing && existing.length > 0) {
        alert(`You have already applied to ${post.companyName}.`);
        return;
      }

      const referenceNumber = `USLT-${studentId}-${Date.now()}`;
      const now = new Date().toISOString();

      const studentProfile = this.profileService.profile();
      const studentDegree = studentProfile?.degree_program || null;
      const studentName = studentProfile?.full_name || null;

      const { error: appError } = await supabase
        .from('internship_applications')
        .insert({
          student_id: String(studentId),
          reference_number: referenceNumber,
          host_company: post.companyName,
          position_role: post.track,
          degree_program: studentDegree,
          student_name: studentName,
          status: 'submitted',
          submitted_at: now,
        });

      if (appError) throw appError;

      // Decrement slots on both tables (same tables the admin edits in Partner Agencies).
      // These are best-effort: a missing `slots` column (migration not yet applied) must not
      // block a student's application from being recorded.
      try {
        const { error: slotsError } = await supabase
          .from('companies')
          .update({ slots: post.slots - 1 })
          .eq('id', post.companyId);

        if (slotsError) {
          console.warn('[InternshipPostings] Slots decrement failed on companies:', slotsError.message);
        }
      } catch (err) {
        console.warn('[InternshipPostings] Slots decrement failed on companies:', err);
      }

      try {
        const { error: postingSlotsError } = await supabase
          .from('internship_postings')
          .update({ available_slots: post.slots - 1 })
          .eq('id', post.id);

        if (postingSlotsError) {
          console.warn('[InternshipPostings] Slots decrement failed on internship_postings:', postingSlotsError.message);
        }
      } catch (err) {
        console.warn('[InternshipPostings] Slots decrement failed on internship_postings:', err);
      }

      const requirementRows = DEFAULT_REQUIREMENTS.map((name) => ({
        student_id: String(studentId),
        requirement_name: name,
        file_name: null,
        file_url: null,
        status: 'pending',
        updated_at: now,
      }));

      const { error: reqError } = await supabase
        .from('student_requirements')
        .insert(requirementRows);

      if (reqError) throw reqError;

      this.applying.set(false);
      await this.loadData(); // refresh student catalog so slots reflect the decrement
      this.closeDetails();
      this.cdr.markForCheck();

      // Show result modal instead of a browser alert.
      this.applyResultRef = referenceNumber;
      this.applyResultCompany = post.companyName;
      this.applyResultOpen = true;

      void this.router.navigate(['/dashboard/document-checklist']);
    } catch (err: any) {
      this.applying.set(false);
      this.cdr.markForCheck();
      console.error('[InternshipPostings] Application failed:', {
        message: err?.message,
        details: err?.details,
        hint: err?.hint,
        code: err?.code,
        full: err,
      });
      alert(`Application failed: ${err?.message || err?.details || err}. Check console for details.`);
    }
  }

  /** Close the apply-confirm dialog without applying. */
  closeApplyConfirm(): void {
    this.confirmApplyOpen = false;
    this.postToApply = null;
  }
}
