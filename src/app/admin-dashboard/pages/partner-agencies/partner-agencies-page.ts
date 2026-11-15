import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { supabase } from '../../../../environments/supabase.config';
import { ProfileService } from '../../../auth/profile.service';

export type AgencyCategory = 'partner-countries';

export interface AgencyCard {
  id: string;                  // companies.id is a UUID (text), not a number
  name: string;
  category: AgencyCategory;
  country: string;
  location: string;
  description: string | null;
  interns: number;
  slots: number;               // how many students can apply to this agency
  status: 'active' | 'inactive';
  initials: string;
}

export const AGENCY_CATEGORY_LABELS: Record<AgencyCategory, string> = {
  'partner-countries': 'Partner Countries',
};

interface CompanyRow {
  id: string;                  // companies.id is a UUID (text), not a number
  name: string;
  address: string | null;
  industry: string | null;
  is_active: boolean;
  slots: number | null;        // requires: ALTER TABLE companies ADD COLUMN IF NOT EXISTS slots integer default 0;
}

@Component({
  selector: 'app-admin-partner-agencies-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './partner-agencies-page.html',
})
export class PartnerAgenciesPageComponent implements OnInit, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  readonly profileService = inject(ProfileService);

  private agenciesSubscription: any = null;
  private companiesSubscription: any = null;

  readonly categories: AgencyCategory[] = ['partner-countries'];
  readonly categoryLabels = AGENCY_CATEGORY_LABELS;

  agencies = signal<AgencyCard[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  applicantsError = signal<string | null>(null);

  // Inline edit state for slots capacity. Status toggles directly via button.
  editingId = signal<string | null>(null);
  editSlots = signal<number | null>(null);


  // Applicant list modal state (which students applied to which agency)
  showApplicantsModal = signal(false);
  selectedAgencyForApplicants = signal<string | null>(null);
  applicants = signal<{ id: string; reference_number: string; host_company: string; position_role: string; status: string; submitted_at: string | null; student_name: string | null; student_id: string | null; email: string | null }[]>([]);

  // Add form state
  showAddForm = signal(false);
  newName = signal('');
  newCountry = signal('');
  newLocation = signal('');
  newDescription = signal('');
  newSlots = signal('');
  newStatus = signal<'active' | 'inactive'>('active');

  searchQuery = '';
  activeCategory: AgencyCategory = 'partner-countries';

  async ngOnInit(): Promise<void> {
    await this.loadAgencies();
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
    this.activeCategory = category;
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

  get filteredAgencies(): AgencyCard[] {
    const query = this.searchQuery.toLowerCase().trim();
    return this.agencies().filter((agency) => {
      const matchCategory = agency.category === this.activeCategory;
      const matchSearch =
        !query ||
        agency.name.toLowerCase().includes(query) ||
        agency.location.toLowerCase().includes(query);
      return matchCategory && matchSearch;
    });
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
      const { data: companies, error: companiesError } = await supabase
        .from('companies')
        .select('id, name, address, industry, is_active, slots')
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
          country: this.extractCountry(r.address),
          location: r.address || '—',
          description: r.industry || null,
          interns: counts[r.name] || 0,
          slots: Number(r.slots) || 0,
          status: r.is_active ? 'active' : 'inactive',
          initials: this.initialsFromName(r.name),
        }))
      );
    } catch (err) {
      console.error('[PartnerAgencies] Error loading agencies:', err);
      this.error.set(err instanceof Error ? err.message : 'Failed to load agencies.');
    } finally {
      this.loading.set(false);
      this.cdr.markForCheck();
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

  /** Toggle agency active/inactive status in Supabase. */
  async toggleStatus(agency: AgencyCard): Promise<void> {
    const newStatus: AgencyCard['status'] = agency.status === 'active' ? 'inactive' : 'active';

    try {
      const { error } = await supabase
        .from('companies')
        .update({ is_active: newStatus === 'active' })
        .eq('id', agency.id);

      if (error) throw error;

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
      // 1. Update the company's slots capacity.
      const { error } = await supabase
        .from('companies')
        .update({ slots })
        .eq('id', agency.id);

      if (error) throw error;

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

  /** Open the add-agency form. */
  openAddForm(): void {
    this.showAddForm.set(true);
    this.newName.set('');
    this.newCountry.set('');
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

    try {
      const { error } = await supabase.from('companies').insert({
        name,
        address: location || null,
        industry: description,
        slots,
        is_active: status === 'active',
      });

      if (error) throw error;

      await this.loadAgencies();
      this.closeAddForm();
    } catch (err) {
      console.error('[PartnerAgencies] Add agency failed:', err);
      alert('Failed to create agency. Please try again.');
    }
  }

  /** Delete an agency from Supabase companies table. */
  async deleteAgency(agency: AgencyCard): Promise<void> {
    if (!confirm(`Remove agency "${agency.name}"?`)) {
      return;
    }

    try {
      const { error } = await supabase.from('companies').delete().eq('id', agency.id);

      if (error) throw error;

      this.agencies.update((items) => items.filter((a) => a.id !== agency.id));
      this.cdr.markForCheck();
    } catch (err) {
      console.error('[PartnerAgencies] Delete failed:', err);
      alert('Failed to delete agency. Please try again.');
    }
  }
}
