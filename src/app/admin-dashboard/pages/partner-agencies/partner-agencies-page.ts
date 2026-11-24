import { ChangeDetectorRef, Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { supabase } from '../../../../environments/supabase.config';
import { ProfileService } from '../../../auth/profile.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { AuditLogService } from '../../../shared/services/audit-log.service';

export type AgencyCategory = 'partner-countries';

export interface AgencyCard {
  id: string;                  // companies.id is a UUID (text), not a number
  name: string;
  category: AgencyCategory;
  country: string;             // display name (from countries table or address derivation)
  countryId: string | null;    // FK into countries table, null when not assigned
  location: string;
  description: string | null;
  interns: number;
  slots: number;               // how many students can apply to this agency
  status: 'active' | 'inactive';
  initials: string;
}

export interface InternshipPostingRow {
  id: string;
  company_id: string;
  position_title: string;
  description: string | null;
  application_deadline: string | null;
  available_slots: number | null;
  eligible_degrees: string | null;
  status: string;
}

export interface Country {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export const AGENCY_CATEGORY_LABELS: Record<AgencyCategory, string> = {
  'partner-countries': 'Partner Agencies',
};

interface CompanyRow {
  id: string;                  // companies.id is a UUID (text), not a number
  name: string;
  address: string | null;
  industry: string | null;
  is_active: boolean;
  slots: number | null;        // requires: ALTER TABLE companies ADD COLUMN IF NOT EXISTS slots integer default 0;
  country_id: string | null;   // FK into countries table
}

@Component({
  selector: 'app-admin-partner-agencies-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmDialogComponent],
  templateUrl: './partner-agencies-page.html',
})
export class PartnerAgenciesPageComponent implements OnInit, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly auditLog = inject(AuditLogService);
  readonly profileService = inject(ProfileService);

  private agenciesSubscription: any = null;
  private companiesSubscription: any = null;

  readonly categories: AgencyCategory[] = ['partner-countries'];
  readonly categoryLabels = AGENCY_CATEGORY_LABELS;
  agencies = signal<AgencyCard[]>([]);
  countries = signal<string[]>([]);
  managedCountries = signal<Country[]>([]); // active-only, for dropdowns
  allCountries = signal<Country[]>([]);     // every country, for the Manage Countries list

  countryViewFilter = signal<string>('all');

  // Degree programs for the eligible-degrees multi-select.
  degreePrograms = signal<{ name: string; department: string }[]>([]);

  // Posting-card edit state (position title, description, deadline).
  companyPostings = new Map<string, InternshipPostingRow[]>();
  postingEditOpen = signal(false);
  postingEditAgencyId = signal<string | null>(null);
  postingEditPosition = signal('');
  postingEditDescription = signal('');
  postingEditDeadline = signal('');
  postingEditEligibleDegrees = signal<string[]>([]);

  filteredManagedCountries = computed(() => {
    const list = this.allCountries();
    const filter = this.countryViewFilter();
    if (filter === 'active') return list.filter((c) => c.is_active);
    if (filter === 'inactive') return list.filter((c) => !c.is_active);
    return list;
  });
  loading = signal(false);
  error = signal<string | null>(null);
  addingAgency = signal(false);
  savingPosting = signal(false);
  applicantsError = signal<string | null>(null);
  countryMgmtError = signal<string | null>(null);

  // Inline edit state for slots capacity.
  editingId = signal<string | null>(null);
  editSlots = signal<number | null>(null);

  // Confirm dialog state (replaces native confirm() popups).
  confirmDialogOpen = signal(false);
  confirmPayload = signal<{ action: 'deleteAgency' | 'toggleStatus'; agency: AgencyCard; newStatus: AgencyCard['status'] } | null>(null);
  confirmIsDeleting = signal(false);

  confirmTitle = signal('');
  confirmMessage = signal('');
  confirmLabel = signal('Delete');


  // Applicant list modal state (which students applied to which agency)
  showApplicantsModal = signal(false);

  selectedAgencyForApplicants = signal<string | null>(null);
  applicants = signal<{ id: string; reference_number: string; host_company: string; position_role: string; status: string; submitted_at: string | null; student_name: string | null; student_id: string | null; email: string | null }[]>([]);

  // Add form state
  showAddForm = signal(false);
  newName = signal('');
  newCountry = signal('');
  newCountryId = signal<string | null>(null);
  newLocation = signal('');
  newDescription = signal('');
  newSlots = signal('');
  newStatus = signal<'active' | 'inactive'>('active');

  searchQuery = signal('');
  countryFilter = signal<string>('');
  activeCategory = signal<AgencyCategory>('partner-countries');

  // Pagination
  pageSize = 15;
  currentPage = signal(1);

  // Manage Countries modal state
  showCountryModal = signal(false);
  showAddCountryRow = signal(false);
  confirmTarget = signal<Country | null>(null);

  async ngOnInit(): Promise<void> {
    await this.loadAgencies();
    await this.loadCountries();
    this.subscribeToApplicationChanges();
  }

  ngOnDestroy(): void {
    if (this.agenciesSubscription) {
      supabase.removeChannel(this.agenciesSubscription);
      this.agenciesSubscription = null;
    }
    if (this.companiesSubscription) {
      supabase.removeChannel(this.companiesSubscription);
      this.companiesSubscription = null;
    }
  }

  /** Subscribe to real-time application and company changes so the admin panel
   *  reflects new student applications and slot updates instantly. */
  private subscribeToApplicationChanges(): void {
    // New applications (student applies) and application status updates.
    this.agenciesSubscription = supabase
      .channel('partner-agencies-intern-counts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'internship_applications' },
        (payload) => {
          console.log('[PartnerAgencies] Realtime event (internship_applications):', payload.eventType, payload);
          void this.loadAgencies();
          // If the applicants modal is open for an agency, refresh that list too.
          if (this.showApplicantsModal() && this.selectedAgencyForApplicants()) {
            void this.loadApplicants(this.selectedAgencyForApplicants()!);
          }
        }
      )
      .subscribe((status) => {
        console.log('[PartnerAgencies] Realtime channel (internship_applications) status:', status);
      });

    // Company slot changes (e.g. student apply decrements companies.slots).
    this.companiesSubscription = supabase
      .channel('partner-agencies-company-slots')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'companies' },
        (payload) => {
          console.log('[PartnerAgencies] Realtime event (companies):', payload.eventType, payload);
          void this.loadAgencies();
        }
      )
      .subscribe((status) => {
        console.log('[PartnerAgencies] Realtime channel (companies) status:', status);
      });
  }

  statusColor(status: AgencyCard['status']) {
    return status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800';
  }

  trackByAgency = (_: number, agency: AgencyCard): string => agency.id;

  trackByCategory = (_: number, category: AgencyCategory): string => category;

  setCategory(category: AgencyCategory): void {
    this.activeCategory.set(category);
    this.resetPage();
  }

  get totalCount(): number {
    return this.agencies().length;
  }

  get activeCount(): number {
    return this.agencies().filter((a) => a.status === 'active').length;
  }

  get totalSlots(): number {
    return this.agencies().reduce((sum, a) => sum + a.slots, 0);
  }

  get filledSlots(): number {
    return this.agencies().reduce((sum, a) => sum + a.interns, 0);
  }

  readonly filteredAgencies = computed((): AgencyCard[] => {
    const query = this.searchQuery().toLowerCase().trim();
    const country = this.countryFilter();
    return this.agencies().filter((agency) => {
      const matchCategory = agency.category === this.activeCategory();
      const matchCountry = !country || agency.country === country;
      const matchSearch =
        !query ||
        agency.name.toLowerCase().includes(query) ||
        agency.location.toLowerCase().includes(query);
      return matchCategory && matchCountry && matchSearch;
    });
  });

  /** Paged agencies for display. */
  readonly pagedAgencies = computed(() => {
    const list = this.filteredAgencies();
    const start = (this.currentPage() - 1) * this.pageSize;
    return list.slice(start, start + this.pageSize);
  });

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredAgencies().length / this.pageSize))
  );

  /** Reset to page 1 whenever filters change. */
  private resetPage(): void {
    this.currentPage.set(1);
    this.cdr.markForCheck();
  }

  onSearchChange(value: string): void {
    this.searchQuery.set(value);
    this.resetPage();
  }

  onCountryChange(value: string): void {
    this.countryFilter.set(value);
    this.resetPage();
  }

  previousPage(): void {
    if (this.currentPage() > 1) this.currentPage.update((p) => p - 1);
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages()) this.currentPage.update((p) => p + 1);
  }

  /** Pull just the country segment from a full address string. */
  private extractCountry(address: string | null): string {
    if (!address) return 'International';
    const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : address;
  }

  /** Build initials from a company name (up to 2 letters). */
  private initialsFromName(name: string): string {
    return name
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('') || 'NA';
  }

  /** Load companies from Supabase and map to agency cards, with interns derived from applications. */
  async loadAgencies(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      // 1. Load active countries for country name lookup + dropdowns.
      const { data: countriesData, error: countriesError } = await supabase
        .from('countries')
        .select('id, name, is_active, created_at')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (countriesError) throw countriesError;
      const countryRows = (countriesData || []) as Country[];
      this.managedCountries.set(countryRows);

      // Build a map of country_id -> country name for display lookup.
      const countryMap = new Map<string, string>();
      countryRows.forEach((c) => countryMap.set(c.id, c.name));

      // Expose country names as strings for template compatibility.
      this.countries.set(countryRows.map((c) => c.name));

      // 2. Load companies from Supabase (now includes country_id).
      const { data: companies, error: companiesError } = await supabase
        .from('companies')
        .select('id, name, address, industry, is_active, slots, country_id')
        .order('name', { ascending: true });

      if (companiesError) throw companiesError;

      const rows = (companies || []) as CompanyRow[];

      // Derive interns per company from application host_company counts.
      const { data: apps, error: appsError } = await supabase
        .from('internship_applications')
        .select('host_company');

      if (appsError) throw appsError;

      const counts: Record<string, number> = {};
      (apps || []).forEach((a: any) => {
        const host = a.host_company;
        if (host) counts[host] = (counts[host] || 0) + 1;
      });

      this.agencies.set(
        rows.map((r) => ({
          id: r.id,
          name: r.name,
          category: 'partner-countries',
          countryId: r.country_id || null,
          country: r.country_id
            ? countryMap.get(r.country_id) ?? this.extractCountry(r.address)
            : this.extractCountry(r.address),
          location: r.address || '—',
          description: r.industry || null,
          interns: counts[r.name] || 0,
          slots: Number(r.slots) || 0,
          status: r.is_active ? 'active' : 'inactive',
          initials: this.initialsFromName(r.name),
        }))
      );

      // 3. Load degree programs for the eligible-degrees multi-select dropdown.
      const { data: degreeRows, error: degreeError } = await supabase
        .from('degree_programs')
        .select('name, department')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (degreeError) throw degreeError;

      this.degreePrograms.set(
        (degreeRows || []).map((d: any) => ({
          name: d.name,
          department: d.department,
        }))
      );

      // 4. Load postings for all companies so admins can edit posting cards.
      const companyIds = rows.map((r) => r.id);
      if (companyIds.length > 0) {
        const { data: postings, error: postingsError } = await supabase
          .from('internship_postings')
          .select('id, company_id, position_title, description, application_deadline, available_slots, eligible_degrees, status')
          .in('company_id', companyIds);

        if (postingsError) throw postingsError;

        const postingMap = new Map<string, InternshipPostingRow[]>();
        (postings || []).forEach((p: any) => {
          const list = postingMap.get(p.company_id) || [];
          list.push({
            id: p.id,
            company_id: p.company_id,
            position_title: p.position_title,
            description: p.description,
            application_deadline: p.application_deadline,
            available_slots: p.available_slots,
            eligible_degrees: p.eligible_degrees,
            status: p.status,
          });
          postingMap.set(p.company_id, list);
        });
        this.companyPostings = postingMap;
      }
    } catch (err) {
      console.error('[PartnerAgencies] Error loading agencies:', err);
      this.error.set(err instanceof Error ? err.message : 'Failed to load agencies.');
    } finally {
      this.loading.set(false);
      this.cdr.markForCheck();
    }
  }

  /** Load countries for the managed dropdowns (active-only) and full list (all). */
  async loadCountries(): Promise<void> {
    try {
      const { data: rows, error } = await supabase
        .from('countries')
        .select('id, name, is_active, created_at')
        .order('name', { ascending: true });

      if (error) throw error;

      const countryRows = (rows || []) as Country[];
      // All countries: shown in Manage Countries list with Hide/Restore.
      this.allCountries.set(countryRows);
      // Active only: used in agency dropdowns and filters.
      const activeCountries = countryRows.filter((c) => c.is_active);
      this.managedCountries.set(activeCountries);
      this.countries.set(activeCountries.map((c) => c.name));
    } catch (err) {
      console.error('[PartnerAgencies] Error loading countries:', err);
      this.countryMgmtError.set(
        err instanceof Error ? err.message : 'Failed to load countries.'
      );
    }
  }

  // Country confirm dialog state.
  confirmCountryDialogOpen = signal(false);
  confirmCountryTitle = signal('');
  confirmCountryMessage = signal('');

  /** Open the confirm dialog to hide/unhide a country. */
  setCountryViewFilter(value: string): void {
    this.countryViewFilter.set(value);
    this.cdr.markForCheck();
  }

  openCountryToggle(country: Country): void {
    this.confirmTarget.set(country);
    this.countryMgmtError.set(null);
    this.confirmCountryTitle.set(country.is_active ? 'Hide Country?' : 'Restore Country?');
    this.confirmCountryMessage.set(
      country.is_active
        ? `This will hide <strong>${country.name}</strong> from agency dropdowns.`
        : `This will restore <strong>${country.name}</strong> to agency dropdowns.`
    );
    this.confirmCountryDialogOpen.set(true);
    this.cdr.markForCheck();
  }

  /** Cancel the country toggle confirm dialog. */
  cancelCountryToggle(): void {
    this.confirmTarget.set(null);
    this.confirmCountryDialogOpen.set(false);
    this.cdr.markForCheck();
  }

  /** Toggle country visibility (hide/unhide) via is_active flag. */
  async toggleCountryVisibility(): Promise<void> {
    const country = this.confirmTarget();
    if (!country) return;

    this.countryMgmtError.set(null);
    const newIsActive = !country.is_active;

    try {
      const oldValues = { is_active: country.is_active };
      const newValues = { is_active: newIsActive };

      const { error } = await supabase
        .from('countries')
        .update(newValues)
        .eq('id', country.id);

      if (error) throw error;

      await this.auditLog.logActivity({
        actionType: 'update',
        tableName: 'countries',
        recordId: country.id,
        oldValues,
        newValues,
      });

      await this.loadCountries();
      await this.loadAgencies();
      this.confirmTarget.set(null);
      this.confirmCountryDialogOpen.set(false);
      this.cdr.markForCheck();
    } catch (err) {
      console.error('[PartnerAgencies] Toggle country visibility failed:', err);
      this.countryMgmtError.set(
        err instanceof Error ? err.message : 'Failed to update country visibility.'
      );
    }
  }

  /** Load all applicants for a specific agency (company), joined with student profile info. */
  async loadApplicants(agencyName: string): Promise<void> {
    this.selectedAgencyForApplicants.set(agencyName);

    try {
      // FK now exists: internship_applications.student_id -> profiles.student_id,
      // so a nested profiles() join works.
      const { data: rows, error } = await supabase
        .from('internship_applications')
        .select(`
          id,
          reference_number,
          host_company,
          position_role,
          status,
          submitted_at,
          student_id,
          profiles (
            full_name,
            email
          )
        `)
        .eq('host_company', agencyName)
        .order('submitted_at', { ascending: false });

      if (error) throw error;

      const applications = (rows || []) as any[];

      this.applicants.set(
        applications.map((a) => {
          const profile = (Array.isArray(a.profiles) ? a.profiles[0] : a.profiles) || {};
          return {
            id: a.id,
            reference_number: a.reference_number,
            host_company: a.host_company,
            position_role: a.position_role,
            status: a.status,
            submitted_at: a.submitted_at,
            student_id: a.student_id,
            student_name: profile.full_name || '—',
            email: profile.email || '—',
          };
        })
      );

      this.cdr.markForCheck();
    } catch (err) {
      console.error('[PartnerAgencies] Error loading applicants:', err);
      this.applicantsError.set(err instanceof Error ? err.message : 'Failed to load applicants.');
    }
  }

  /** Open the applicants modal for a specific agency. */
  openApplicants(agencyName: string): void {
    this.applicantsError.set(null);
    void this.loadApplicants(agencyName);
    this.showApplicantsModal.set(true);
    this.cdr.markForCheck();
  }

  /** Close the applicants modal. */
  closeApplicants(): void {
    this.showApplicantsModal.set(false);
    this.selectedAgencyForApplicants.set(null);
    this.applicants.set([]);
    this.cdr.markForCheck();
  }

  /** Request confirmation before toggling agency active/inactive status. */
  toggleStatus(agency: AgencyCard): void {
    const newStatus: AgencyCard['status'] = agency.status === 'active' ? 'inactive' : 'active';
    this.confirmPayload.set({ action: 'toggleStatus', agency, newStatus });
    this.confirmTitle.set('Toggle agency status?');
    this.confirmMessage.set(`This will change the status of <strong>${agency.name}</strong>.`);
    this.confirmLabel.set('Toggle');
    this.confirmDialogOpen.set(true);
    this.cdr.markForCheck();
  }

  /** Perform the confirmed status toggle on Supabase. */
  private async performToggleStatus(agency: AgencyCard, newStatus: AgencyCard['status']): Promise<void> {
    try {
      const oldValues = { is_active: agency.status === 'active' };
      const newValues = { is_active: newStatus === 'active' };

      const { error } = await supabase
        .from('companies')
        .update(newValues)
        .eq('id', agency.id);

      if (error) throw error;

      await this.auditLog.logActivity({
        actionType: 'update',
        tableName: 'companies',
        recordId: agency.id,
        oldValues,
        newValues,
      });

      this.agencies.update((items) =>
        items.map((a) => (a.id === agency.id ? { ...a, status: newStatus } : a))
      );
      this.cdr.markForCheck();
    } catch (err) {
      console.error('[PartnerAgencies] Toggle status failed:', err);
      alert('Failed to update agency status. Please try again.');
    }
  }

  /** Start inline editing for slots capacity. */
  startEdit(agency: AgencyCard): void {
    this.editingId.set(agency.id);
    this.editSlots.set(agency.slots);
  }

  /** Cancel inline editing. */
  cancelEdit(): void {
    this.editingId.set(null);
    this.editSlots.set(null);
  }

  /** Save inline slots edit to Supabase. */
  async saveEdit(agency: AgencyCard): Promise<void> {
    const slots = this.editSlots();
    if (slots === null || slots < 0) {
      alert('Slots must be zero or greater.');
      return;
    }

    try {
      const oldValues = { slots: agency.slots };
      const newValues = { slots };

      // 1. Update the company's slots capacity.
      const { error } = await supabase
        .from('companies')
        .update(newValues)
        .eq('id', agency.id);

      if (error) throw error;

      await this.auditLog.logActivity({
        actionType: 'update',
        tableName: 'companies',
        recordId: agency.id,
        oldValues,
        newValues,
      });

      // 2. Sync the slots to all linked internship postings so the student page
      //    reflects the admin-designated capacity.
      const { error: postingsError } = await supabase
        .from('internship_postings')
        .update({ available_slots: slots })
        .eq('company_id', agency.id);

      if (postingsError) throw postingsError;

      this.agencies.update((items) =>
        items.map((a) => (a.id === agency.id ? { ...a, slots } : a))
      );
      this.cancelEdit();
      this.cdr.markForCheck();
    } catch (err) {
      console.error('[PartnerAgencies] Save slots failed:', err);
      alert('Failed to update slots. Please try again.');
    }
  }

  /** Get postings linked to a specific agency (company). */
  postingsForAgency(agencyId: string): InternshipPostingRow[] {
    return this.companyPostings.get(agencyId) || [];
  }

  /** Open the edit-posting modal for a specific posting of an agency. */
  openPostingEdit(agencyId: string, posting: InternshipPostingRow): void {
    this.postingEditAgencyId.set(agencyId);
    this.postingEditPosition.set(posting.position_title);
    this.postingEditDescription.set(posting.description || '');
    this.postingEditDeadline.set(posting.application_deadline || '');
    this.postingEditEligibleDegrees.set(
      posting.eligible_degrees
        ? posting.eligible_degrees.split(',').map((d) => d.trim()).filter(Boolean)
        : []
    );
    this.postingEditOpen.set(true);
    this.cdr.markForCheck();
  }

  /** Close the edit-posting modal. */
  closePostingEdit(): void {
    this.postingEditOpen.set(false);
    this.postingEditAgencyId.set(null);
    this.postingEditPosition.set('');
    this.postingEditDescription.set('');
    this.postingEditDeadline.set('');
    this.postingEditEligibleDegrees.set([]);
    this.cdr.markForCheck();
  }

  /** Save posting-card edits to Supabase (title, description, deadline). */
  async savePostingEdit(): Promise<void> {
    const agencyId = this.postingEditAgencyId();
    if (!agencyId) return;

    const postings = this.postingsForAgency(agencyId);
    if (postings.length === 0) {
      alert('No posting found for this agency.');
      return;
    }

    // If no posting exists yet, create one; otherwise update the first linked posting.
    const target = postings[0];
    const isCreate = !target.id;

    this.savingPosting.set(true);
    try {
      if (isCreate) {
        const oldValues = null;
        const newValues = {
          company_id: agencyId,
          position_title: this.postingEditPosition(),
          description: this.postingEditDescription() || null,
          application_deadline: this.postingEditDeadline() || null,
          eligible_degrees: this.postingEditEligibleDegrees().join(', ') || null,
          status: 'open',
          available_slots: 0,
        };

        const { error } = await supabase
          .from('internship_postings')
          .insert(newValues);

        if (error) throw error;

        await this.auditLog.logActivity({
          actionType: 'create',
          tableName: 'internship_postings',
          recordId: '',
          oldValues,
          newValues,
        });
      } else {
        const oldValues = {
          position_title: target.position_title,
          description: target.description,
          application_deadline: target.application_deadline,
          eligible_degrees: target.eligible_degrees,
        };
        const newValues = {
          position_title: this.postingEditPosition(),
          description: this.postingEditDescription() || null,
          application_deadline: this.postingEditDeadline() || null,
          eligible_degrees: this.postingEditEligibleDegrees().join(', ') || null,
        };

        const { error } = await supabase
          .from('internship_postings')
          .update(newValues)
          .eq('id', target.id);

        if (error) throw error;

        await this.auditLog.logActivity({
          actionType: 'update',
          tableName: 'internship_postings',
          recordId: target.id,
          oldValues,
          newValues,
        });
      }

      await this.loadAgencies();
      this.closePostingEdit();
    } catch (err) {
      console.error('[PartnerAgencies] Save posting failed:', err);
      alert('Failed to save posting details. Please try again.');
    } finally {
      this.savingPosting.set(false);
      this.cdr.markForCheck();
    }
  }

  /** Open the Manage Countries modal. */
  openCountryModal(): void {
    this.showCountryModal.set(true);
    this.countryMgmtError.set(null);
    this.cdr.markForCheck();
  }

  /** Close the Manage Countries modal. */
  closeCountryModal(): void {
    this.showCountryModal.set(false);
    this.showAddCountryRow.set(false);
    this.cdr.markForCheck();
  }

  /** Add a new country to the managed list. */
  async addCountry(): Promise<void> {
    const name = this.newCountry().trim();
    if (!name) {
      alert('Country name is required.');
      return;
    }

    this.countryMgmtError.set(null);

    try {
      const { error } = await supabase
        .from('countries')
        .insert({ name, is_active: true });

      if (error) throw error;

      this.newCountry.set('');
      await this.loadCountries();
      await this.loadAgencies();
      this.cdr.markForCheck();
    } catch (err) {
      console.error('[PartnerAgencies] Add country failed:', err);
      this.countryMgmtError.set(
        err instanceof Error ? err.message : 'Failed to add country. It may already exist.'
      );
    }
  }

  /** Run the action the user confirmed in the confirm dialog. */
  async handleConfirm(): Promise<void> {
    const payload = this.confirmPayload();
    if (!payload) return;

    this.confirmIsDeleting.set(true);
    try {
      if (payload.action === 'deleteAgency') {
        const { error } = await supabase.from('companies').delete().eq('id', payload.agency.id);
        if (error) throw error;
        this.agencies.update((items) => items.filter((a) => a.id !== payload.agency.id));
      } else if (payload.action === 'toggleStatus') {
        await this.performToggleStatus(payload.agency, payload.newStatus);
      }
    } catch (err) {
      console.error('[PartnerAgencies] Confirmed action failed:', err);
      alert('Action failed. Please try again.');
    } finally {
      this.confirmIsDeleting.set(false);
      this.confirmDialogOpen.set(false);
      this.confirmPayload.set(null);
      this.cdr.markForCheck();
    }
  }

  /** Cancel the confirm dialog. */
  handleConfirmCancel(): void {
    this.confirmDialogOpen.set(false);
    this.confirmPayload.set(null);
    this.confirmIsDeleting.set(false);
    this.cdr.markForCheck();
  }

  /** Open the add-agency form. */
  openAddForm(): void {
    this.showAddForm.set(true);
    this.newName.set('');
    this.newCountry.set('');
    this.newCountryId.set(null);
    this.newLocation.set('');
    this.newDescription.set('');
    this.newSlots.set('');
    this.newStatus.set('active');
    this.cdr.markForCheck();
  }

  /** Close the add-agency form. */
  closeAddForm(): void {
    this.showAddForm.set(false);
    this.cdr.markForCheck();
  }

  /** Sync the country name text input when the user picks a country from the dropdown. */
  onCountryIdChange(countryId: string): void {
    this.newCountryId.set(countryId);
    const country = this.managedCountries().find((c) => c.id === countryId);
    this.newCountry.set(country?.name || '');
  }

  /** Insert a new agency into Supabase companies table. */
  async addAgency(): Promise<void> {
    const name = this.newName().trim();
    const country = this.newCountry().trim();
    const location = this.newLocation().trim();
    const description = this.newDescription().trim() || null;
    const slots = Number(this.newSlots()) || 0;
    const status = this.newStatus();

    if (!name) {
      alert('Agency name is required.');
      return;
    }

    // Build address combining location + country so extractCountry() can derive it later.
    const addressParts = [location, country].filter(Boolean);
    const address = addressParts.length > 0 ? addressParts.join(', ') : null;

    this.addingAgency.set(true);
    try {
      const { error } = await supabase.from('companies').insert({
        name,
        address,
        industry: description,
        slots,
        is_active: status === 'active',
        country_id: this.newCountryId() || null,
      });

      if (error) throw error;

      await this.loadAgencies();
      this.closeAddForm();
    } catch (err) {
      console.error('[PartnerAgencies] Add agency failed:', err);
      alert('Failed to create agency. Please try again.');
    } finally {
      this.addingAgency.set(false);
      this.cdr.markForCheck();
    }
  }

  /** Request confirmation before deleting an agency from Supabase. */
  deleteAgency(agency: AgencyCard): void {
    this.confirmPayload.set({ action: 'deleteAgency', agency, newStatus: agency.status });
    this.confirmTitle.set('Delete agency?');
    this.confirmMessage.set(`This will remove <strong>${agency.name}</strong> permanently. This cannot be undone.`);
    this.confirmLabel.set('Delete');
    this.confirmDialogOpen.set(true);
    this.cdr.markForCheck();
  }
}
