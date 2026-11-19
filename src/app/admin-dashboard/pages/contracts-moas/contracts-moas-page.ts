import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { supabase } from '../../../../environments/supabase.config';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { AuditLogService } from '../../../shared/services/audit-log.service';

const STORAGE_BUCKET = 'contracts-moas';

interface ContractCategory {
  id: string;
  name: string;
  color: string;
  is_active: boolean;
  created_at: string;
}

interface ContractItem {
  id: string;
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
  company_id: string | null;
  company_name: string | null;
  title: string;
  description: string | null;
  contract_type: string | null;
  file_url: string | null;
  file_path: string | null;
  file_type: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

/** Computed, expiration-aware status for a contract. */
type ContractStatus = 'draft' | 'active' | 'expired' | 'pending-renewal';

@Component({
  selector: 'app-contracts-moas-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmDialogComponent],
  templateUrl: './contracts-moas-page.html',
  styleUrl: './contracts-moas-page.css'
})
export class ContractsMoasPageComponent implements OnInit, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly auditLog = inject(AuditLogService);

  private categoriesSubscription: any = null;
  private contractsSubscription: any = null;

  // Raw data from Supabase
  categories = signal<ContractCategory[]>([]);
  contracts = signal<ContractItem[]>([]);
  companies = signal<any[]>([]); // company dropdown on upload

  loading = signal(false);
  error = signal<string | null>(null);

  // Confirm dialog state (replaces native confirm() popups).
  confirmDialogOpen = signal(false);
  confirmPayload = signal<{ action: 'deleteCategory'; category: ContractCategory } | { action: 'deleteContract'; contract: ContractItem } | null>(null);
  confirmIsDeleting = signal(false);

  confirmTitle = signal('');
  confirmMessage = signal('');
  confirmLabel = signal('Delete');

  // Search + filters
  searchQuery = signal('');
  categoryFilter = signal<string>(''); // category id
  statusFilter = signal<ContractStatus | ''>('');

  /** Contracts filtered by search + category + status. */
  filteredContracts = computed(() => {
    const q = (this.searchQuery() || '').toLowerCase();
    const cat = this.categoryFilter();
    const status = this.statusFilter();

    return this.contracts().filter((c) => {
      const matchSearch =
        !q ||
        c.title.toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q) ||
        (c.company_name || '').toLowerCase().includes(q);
      const matchCategory = !cat || c.category_id === cat;
      const matchStatus = !status || this.contractStatus(c.end_date, c.status) === status;
      return matchSearch && matchCategory && matchStatus;
    });
  });

  /** Active categories (for the category dropdown on upload + category filter). */
  activeCategories = computed(() => {
    return this.categories().filter((c) => c.is_active).sort((a, b) => a.name.localeCompare(b.name));
  });

  /** All categories including inactive (for the manage-categories list). */
  allCategories = computed(() => this.categories().sort((a, b) => a.name.localeCompare(b.name)));

  // Stat cards
  totalContracts = computed(() => this.filteredContracts().length);
  activeContracts = computed(() => this.filteredContracts().filter((c) => this.contractStatus(c.end_date, c.status) === 'active').length);
  expiringSoonContracts = computed(() => this.filteredContracts().filter((c) => this.contractStatus(c.end_date, c.status) === 'pending-renewal').length);
  expiredContracts = computed(() => this.filteredContracts().filter((c) => this.contractStatus(c.end_date, c.status) === 'expired').length);

  // Modals
  showUploadModal = signal(false);
  showCategoryModal = signal(false);

  // Upload contract form state
  uploadingContract = signal<ContractItem | null>(null);
  uploadForm = {
    category_id: '',
    title: '',
    description: '',
    contract_type: 'MOA',
    company_id: '',
    file: null as File | null,
    fileName: '',
    start_date: '',
    end_date: '',
    status: 'draft' as ContractStatus,
  };
  uploadSubmitError = signal('');
  isUploadingContract = signal(false);

  // Category management form state
  editingCategory = signal<ContractCategory | null>(null);
  categoryForm = {
    id: '',
    name: '',
    color: '#1E3A5F',
    is_active: true,
  };
  categorySubmitError = signal('');
  isSavingCategory = signal(false);
  isDeletingCategory = signal<string | null>(null);

  // Contract edit/replace/delete state
  editingContract = signal<ContractItem | null>(null);
  contractEditForm = {
    id: '',
    title: '',
    description: '',
    contract_type: 'MOA',
    category_id: '',
    company_id: '',
    file: null as File | null,
    fileName: '',
    start_date: '',
    end_date: '',
    status: 'draft' as ContractStatus,
  };
  showEditContractModal = signal(false);
  showReplaceFileModal = signal(false);
  showDeleteContractModal = signal(false);
  contractSubmitError = signal('');
  replaceSubmitError = signal('');
  isSavingContract = signal(false);
  isReplacingFile = signal(false);
  isDeletingContract = signal<string | null>(null);

  trackByContract = (_: number, item: ContractItem): string => item.id;
  trackByCategory = (_: number, c: ContractCategory): string => c.id;

  ngOnInit(): void {
    this.loadData();
    this.subscribeToUpdates();
  }

  ngOnDestroy(): void {
    if (this.categoriesSubscription) {
      supabase.removeChannel(this.categoriesSubscription);
      this.categoriesSubscription = null;
    }
    if (this.contractsSubscription) {
      supabase.removeChannel(this.contractsSubscription);
      this.contractsSubscription = null;
    }
  }

  /** Load categories, companies, and contracts from Supabase. */
  async loadData(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const [catsRes, contractsRes, companiesRes] = await Promise.all([
        supabase
          .from('contract_categories')
          .select('id, name, color, is_active, created_at')
          .order('name', { ascending: true }),
        supabase
          .from('contracts_moas')
          .select(`
            id,
            category_id,
            company_id,
            title,
            description,
            contract_type,
            file_url,
            file_path,
            file_type,
            start_date,
            end_date,
            status,
            created_at,
            updated_at
          `)
          .order('created_at', { ascending: false }),
        supabase
          .from('companies')
          .select('id, name')
          .eq('is_active', true)
          .order('name', { ascending: true }),
      ]);

      if (catsRes.error) throw catsRes.error;
      if (contractsRes.error) throw contractsRes.error;
      if (companiesRes.error) throw companiesRes.error;

      this.categories.set((catsRes.data || []) as ContractCategory[]);
      this.companies.set((companiesRes.data || []) as any[]);

      const rawContracts = (contractsRes.data || []) as any[];
      // Enrich contracts with category + company names for display
      const categoryMap = new Map<string, ContractCategory>();
      (catsRes.data || []).forEach((c: ContractCategory) => categoryMap.set(c.id, c));

      const companyMap = new Map<string, { name: string }>();
      (companiesRes.data || []).forEach((co: any) => companyMap.set(co.id, co));

      const enriched = rawContracts.map((c) => {
        const cat = categoryMap.get(c.category_id ?? '');
        const co = companyMap.get(c.company_id ?? '');
        return {
          ...c,
          category_name: cat?.name || null,
          category_color: cat?.color || null,
          company_name: co?.name || null,
        } as ContractItem;
      });

      this.contracts.set(enriched);
      this.cdr.markForCheck();
    } catch (err) {
      console.error('[ContractsMoas] Error loading data:', err);
      this.error.set(err instanceof Error ? err.message : 'Failed to load contracts and categories.');
    } finally {
      this.loading.set(false);
      this.cdr.markForCheck();
    }
  }

  /** Realtime: refresh when categories or contracts change. */
  private subscribeToUpdates(): void {
    this.categoriesSubscription = supabase
      .channel('admin-contract-categories-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contract_categories' },
        () => {
          console.log('[ContractsMoas] Realtime event (contract_categories): refreshing.');
          void this.loadData();
        }
      )
      .subscribe((status: any) => {
        console.log('[ContractsMoas] Realtime channel (contract_categories) status:', status);
      });

    this.contractsSubscription = supabase
      .channel('admin-contracts-moas-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contracts_moas' },
        () => {
          console.log('[ContractsMoas] Realtime event (contracts_moas): refreshing.');
          void this.loadData();
        }
      )
      .subscribe((status: any) => {
        console.log('[ContractsMoas] Realtime channel (contracts_moas) status:', status);
      });
  }

  /** Expiration-aware status: draft / active / pending-renewal (within 30 days) / expired. */
  contractStatus(endDate: string | null, storedStatus: string): ContractStatus {
    if (storedStatus === 'draft') return 'draft';
    if (!endDate) return (storedStatus as ContractStatus) || 'active';
    const end = new Date(endDate);
    if (isNaN(end.getTime())) return (storedStatus as ContractStatus) || 'active';
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diffDays = (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays < 0) return 'expired';
    if (diffDays <= 30) return 'pending-renewal';
    return 'active';
  }

  /** Status label for display. */
  statusLabel(status: ContractStatus): string {
    const map: Record<ContractStatus, string> = {
      draft: 'Draft',
      active: 'Active',
      expired: 'Expired',
      'pending-renewal': 'Pending Renewal',
    };
    return map[status];
  }

  /** Status color classes. */
  statusClasses(status: ContractStatus): string {
    const base = 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border';
    if (status === 'draft') return `${base} bg-slate-50 text-slate-500 border border-slate-200`;
    if (status === 'active') return `${base} bg-emerald-50 text-emerald-700 border border-emerald-200`;
    if (status === 'pending-renewal') return `${base} bg-amber-50 text-amber-700 border border-amber-200`;
    return `${base} bg-rose-50 text-rose-700 border border-rose-200`;
  }

  /** Category badge classes. */
  categoryBadge(color: string | null): string {
    return 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-slate-50 text-slate-600 border border-slate-200';
  }

  // ── Search + filters ──────────────────────────────────────────────

  clearFilters(): void {
    this.searchQuery.set('');
    this.categoryFilter.set('');
    this.statusFilter.set('');
    this.cdr.markForCheck();
  }

  // ── Category management modal ─────────────────────────────────────

  /** Open the manage-categories modal. */
  openCategoryModal(): void {
    this.editingCategory.set(null);
    this.categoryForm = { id: '', name: '', color: '#1E3A5F', is_active: true };
    this.categorySubmitError.set('');
    this.showCategoryModal.set(true);
    this.cdr.markForCheck();
  }

  /** Close the manage-categories modal. */
  closeCategoryModal(): void {
    this.showCategoryModal.set(false);
    this.editingCategory.set(null);
    this.categoryForm = { id: '', name: '', color: '#1E3A5F', is_active: true };
    this.categorySubmitError.set('');
    this.cdr.markForCheck();
  }

  /** Select a category to edit. */
  editCategory(cat: ContractCategory): void {
    this.editingCategory.set(cat);
    this.categoryForm = {
      id: cat.id,
      name: cat.name,
      color: cat.color,
      is_active: cat.is_active,
    };
    this.categorySubmitError.set('');
    this.cdr.markForCheck();
  }

  /** Save add or edit category. */
  async saveCategory(): Promise<void> {
    const { name, color, is_active } = this.categoryForm;

    if (!name.trim()) {
      this.categorySubmitError.set('Category name is required.');
      return;
    }

    this.categorySubmitError.set('');
    this.isSavingCategory.set(true);

    try {
      if (this.editingCategory()) {
        const oldValues = {
          name: this.editingCategory()!.name,
          color: this.editingCategory()!.color,
          is_active: this.editingCategory()!.is_active,
        };
        const newValues = { name: name.trim(), color, is_active };

        const { error } = await supabase
          .from('contract_categories')
          .update(newValues)
          .eq('id', this.editingCategory()!.id);

        if (error) throw error;

        await this.auditLog.logActivity({
          actionType: 'update',
          tableName: 'contract_categories',
          recordId: this.editingCategory()!.id,
          oldValues,
          newValues,
        });

        this.closeCategoryModal();
        await this.loadData();
        this.cdr.markForCheck();
      } else {
        const { data: inserted, error } = await supabase
          .from('contract_categories')
          .insert({ name: name.trim(), color, is_active })
          .select('id')
          .single();

        if (error) throw error;

        await this.auditLog.logActivity({
          actionType: 'create',
          tableName: 'contract_categories',
          recordId: inserted.id,
          oldValues: null,
          newValues: { name: name.trim(), color, is_active },
        });

        this.closeCategoryModal();
        await this.loadData();
        this.cdr.markForCheck();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save category.';
      console.error('[ContractsMoas] Save category failed:', message);
      this.categorySubmitError.set(message);
    } finally {
      this.isSavingCategory.set(false);
      this.cdr.markForCheck();
    }
  }

  /** Request confirmation before deleting a contract category. */
  deleteCategory(cat: ContractCategory): void {
    this.confirmPayload.set({ action: 'deleteCategory', category: cat });
    this.confirmTitle.set('Delete category?');
    this.confirmMessage.set(`This will remove category <strong>${cat.name}</strong>. Contracts using it will have their category cleared. This cannot be undone.`);
    this.confirmLabel.set('Delete');
    this.confirmDialogOpen.set(true);
    this.cdr.markForCheck();
  }

  /** Perform the confirmed category deletion on Supabase. */
  private async performDeleteCategory(cat: ContractCategory): Promise<void> {
    this.isDeletingCategory.set(cat.id);
    try {
      const oldValues = {
        name: cat.name,
        color: cat.color,
        is_active: cat.is_active,
      };

      const { error } = await supabase.from('contract_categories').delete().eq('id', cat.id);
      if (error) throw error;

      await this.auditLog.logActivity({
        actionType: 'delete',
        tableName: 'contract_categories',
        recordId: cat.id,
        oldValues,
        newValues: null,
      });

      await this.loadData();
      this.cdr.markForCheck();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete category.';
      console.error('[ContractsMoas] Delete category failed:', message);
      alert(`Failed to delete category: ${message}`);
    } finally {
      this.isDeletingCategory.set(null);
    }
  }


  //── Upload contract modal ─────────────────────────────────────────

  /** Open the upload contract modal. User picks a category first. */
  openUploadModal(): void {
    this.uploadingContract.set(null);
    this.uploadForm = {
      category_id: '',
      title: '',
      description: '',
      contract_type: 'MOA',
      company_id: '',
      file: null as File | null,
      fileName: '',
      start_date: '',
      end_date: '',
      status: 'draft',
    };
    this.uploadSubmitError.set('');
    this.showUploadModal.set(true);
    this.cdr.markForCheck();
  }

  /** Close the upload contract modal. */
  closeUploadModal(): void {
    this.showUploadModal.set(false);
    this.uploadingContract.set(null);
    this.uploadForm = {
      category_id: '',
      title: '',
      description: '',
      contract_type: 'MOA',
      company_id: '',
      file: null as File | null,
      fileName: '',
      start_date: '',
      end_date: '',
      status: 'draft',
    };
    this.uploadSubmitError.set('');
    this.cdr.markForCheck();
  }

  /** Handle file pick for upload. */
  onUploadFile(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;
    this.uploadForm.file = file;
    this.uploadForm.fileName = file.name;
    this.cdr.markForCheck();
  }

  /** Save (create) a new contract with uploaded file. */
  async saveUploadContract(): Promise<void> {
    const { category_id, title, description, contract_type, company_id, file, start_date, end_date, status } = this.uploadForm;

    if (!category_id) {
      this.uploadSubmitError.set('Please select a category.');
      return;
    }
    if (!title.trim()) {
      this.uploadSubmitError.set('Title is required.');
      return;
    }

    this.uploadSubmitError.set('');
    this.isUploadingContract.set(true);

    try {
      let fileUrl: string | null = null;
      let filePath: string | null = null;
      let fileType: string | null = null;

      // Upload file to storage first (required)
      if (file) {
        const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
        const storagePath = `contracts/${fileName}`;

        const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, file, { upsert: true });
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
        fileUrl = urlData?.publicUrl || null;
        filePath = storagePath;
        fileType = file.type || null;
      } else {
        this.uploadSubmitError.set('Please select a contract file to upload.');
        return;
      }

      const newContractValues = {
        category_id,
        company_id: company_id || null,
        title: title.trim(),
        description: description.trim() || null,
        contract_type,
        file_url: fileUrl,
        file_path: filePath,
        file_type: fileType,
        start_date: start_date || null,
        end_date: end_date || null,
        status,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: inserted, error } = await supabase
        .from('contracts_moas')
        .insert(newContractValues)
        .select('id')
        .single();

      if (error) throw error;

      await this.auditLog.logActivity({
        actionType: 'create',
        tableName: 'contracts_moas',
        recordId: inserted.id,
        oldValues: null,
        newValues: newContractValues,
      });

      this.closeUploadModal();
      await this.loadData();
      this.cdr.markForCheck();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to upload contract.';
      console.error('[ContractsMoas] Upload contract failed:', message);
      this.uploadSubmitError.set(message);
    } finally {
      this.isUploadingContract.set(false);
      this.cdr.markForCheck();
    }
  }

  // ── Contract edit / replace / delete ──────────────────────────────

  /** Open edit contract modal. */
  openEditContractModal(item: ContractItem): void {
    this.editingContract.set(item);
    this.contractEditForm = {
      id: item.id,
      title: item.title,
      description: item.description || '',
      contract_type: item.contract_type || 'MOA',
      category_id: item.category_id || '',
      company_id: item.company_id || '',
      file: null as File | null,
      fileName: '',
      start_date: item.start_date || '',
      end_date: item.end_date || '',
      status: (item.status as ContractStatus) || 'draft',
    };
    this.contractSubmitError.set('');
    this.showEditContractModal.set(true);
    this.cdr.markForCheck();
  }

  /** Close edit contract modal. */
  closeEditContractModal(): void {
    this.showEditContractModal.set(false);
    this.editingContract.set(null);
    this.contractEditForm = {
      id: '', title: '', description: '', contract_type: 'MOA', category_id: '', company_id: '',
      file: null as File | null, fileName: '', start_date: '', end_date: '', status: 'draft',
    };
    this.contractSubmitError.set('');
    this.cdr.markForCheck();
  }

  /** Handle file pick for replace. */
  onEditContractFile(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;
    this.contractEditForm.file = file;
    this.contractEditForm.fileName = file.name;
    this.cdr.markForCheck();
  }

  /** Save edits to an existing contract (replace file if a new one was picked). */
  async saveEditContract(): Promise<void> {
    const { id, title, description, contract_type, category_id, company_id, file, start_date, end_date, status } = this.contractEditForm;

    if (!title.trim()) {
      this.contractSubmitError.set('Title is required.');
      return;
    }

    this.contractSubmitError.set('');
    this.isSavingContract.set(true);

    try {
      let fileUrl = this.editingContract()?.file_url || null;
      let filePath = this.editingContract()?.file_path || null;
      let fileType = this.editingContract()?.file_type || null;

      if (file) {
        const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
        const storagePath = `contracts/${fileName}`;

        const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, file, { upsert: true });
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
        fileUrl = urlData?.publicUrl || null;
        filePath = storagePath;
        fileType = file.type || null;
      }

      const oldValues = {
        title: this.editingContract()?.title,
        description: this.editingContract()?.description,
        contract_type: this.editingContract()?.contract_type,
        category_id: this.editingContract()?.category_id,
        company_id: this.editingContract()?.company_id,
        file_url: this.editingContract()?.file_url,
        status: this.editingContract()?.status,
      };
      const newValues = {
        title: title.trim(),
        description: description.trim() || null,
        contract_type,
        category_id: category_id || null,
        company_id: company_id || null,
        file_url: fileUrl,
        file_path: filePath,
        file_type: fileType,
        start_date: start_date || null,
        end_date: end_date || null,
        status,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('contracts_moas')
        .update(newValues)
        .eq('id', id);

      if (error) throw error;

      await this.auditLog.logActivity({
        actionType: 'update',
        tableName: 'contracts_moas',
        recordId: id,
        oldValues,
        newValues,
      });

      this.closeEditContractModal();
      await this.loadData();
      this.cdr.markForCheck();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save contract.';
      console.error('[ContractsMoas] Save contract failed:', message);
      this.contractSubmitError.set(message);
    } finally {
      this.isSavingContract.set(false);
      this.cdr.markForCheck();
    }
  }

  /** Open replace-file modal for an existing contract. */
  openReplaceFileModal(item: ContractItem): void {
    this.editingContract.set(item);
    this.contractEditForm = {
      id: item.id,
      title: item.title,
      description: item.description || '',
      contract_type: item.contract_type || 'MOA',
      category_id: item.category_id || '',
      company_id: item.company_id || '',
      file: null as File | null,
      fileName: '',
      start_date: item.start_date || '',
      end_date: item.end_date || '',
      status: (item.status as ContractStatus) || 'draft',
    };
    this.replaceSubmitError.set('');
    this.showReplaceFileModal.set(true);
    this.cdr.markForCheck();
  }

  /** Close replace-file modal. */
  closeReplaceFileModal(): void {
    this.showReplaceFileModal.set(false);
    this.contractEditForm = {
      id: '', title: '', description: '', contract_type: 'MOA', category_id: '', company_id: '',
      file: null as File | null, fileName: '', start_date: '', end_date: '', status: 'draft',
    };
    this.replaceSubmitError.set('');
    this.cdr.markForCheck();
  }

  /** Replace the file of an existing contract (bumps nothing; just swaps file + metadata). */
  async saveReplaceFile(): Promise<void> {
    const item = this.editingContract();
    const file = this.contractEditForm.file;
    if (!item || !file) return;

    this.replaceSubmitError.set('');
    this.isReplacingFile.set(true);

    try {
      const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
      const storagePath = `contracts/${fileName}`;

      const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
      const fileUrl = urlData?.publicUrl || null;

      if (!fileUrl) throw new Error('Failed to generate file URL.');

      const oldValues = {
        file_url: item.file_url,
        file_path: item.file_path,
        file_type: item.file_type,
      };
      const newValues = {
        file_url: fileUrl,
        file_path: storagePath,
        file_type: file.type || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('contracts_moas')
        .update(newValues)
        .eq('id', item.id);

      if (error) throw error;

      await this.auditLog.logActivity({
        actionType: 'update',
        tableName: 'contracts_moas',
        recordId: item.id,
        oldValues,
        newValues,
      });

      this.closeReplaceFileModal();
      await this.loadData();
      this.cdr.markForCheck();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to replace file.';
      console.error('[ContractsMoas] Replace file failed:', message);
      this.replaceSubmitError.set(message);
    } finally {
      this.isReplacingFile.set(false);
      this.cdr.markForCheck();
    }
  }

  /** Request confirmation before deleting a contract (and its storage file). */
  deleteContract(item: ContractItem): void {
    this.confirmPayload.set({ action: 'deleteContract', contract: item });
    this.confirmTitle.set('Delete contract?');
    this.confirmMessage.set(`This will remove contract <strong>${item.title}</strong> and its file. This cannot be undone.`);
    this.confirmLabel.set('Delete');
    this.confirmDialogOpen.set(true);
    this.cdr.markForCheck();
  }

  /** Perform the confirmed contract deletion on Supabase. */
  private async performDeleteContract(item: ContractItem): Promise<void> {
    this.isDeletingContract.set(item.id);
    try {
      // Remove the storage file if present
      if (item.file_path) {
        await supabase.storage.from(STORAGE_BUCKET).remove([item.file_path]);
      }

      const oldValues = {
        title: item.title,
        category_id: item.category_id,
        company_id: item.company_id,
        status: item.status,
        file_url: item.file_url,
      };

      const { error } = await supabase.from('contracts_moas').delete().eq('id', item.id);
      if (error) throw error;

      await this.auditLog.logActivity({
        actionType: 'delete',
        tableName: 'contracts_moas',
        recordId: item.id,
        oldValues,
        newValues: null,
      });

      await this.loadData();
      this.cdr.markForCheck();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete contract.';
      console.error('[ContractsMoas] Delete contract failed:', message);
      alert(`Failed to delete contract: ${message}`);
    } finally {
      this.isDeletingContract.set(null);
      this.cdr.markForCheck();
    }
  }

  /** Run the action the user confirmed in the confirm dialog. */
  async handleConfirm(): Promise<void> {
    const payload = this.confirmPayload();
    if (!payload) return;

    this.confirmIsDeleting.set(true);
    try {
      if (payload.action === 'deleteCategory') {
        await this.performDeleteCategory(payload.category);
      } else if (payload.action === 'deleteContract') {
        await this.performDeleteContract(payload.contract);
      }
    } catch (err) {
      console.error('[ContractsMoas] Confirmed action failed:', err);
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

  /** Open (signed URL) a contract file in a new tab. */
  async openFile(fileUrl: string | null, filePath: string | null): Promise<void> {
    if (!fileUrl && !filePath) {
      alert('No contract file available to open.');
      return;
    }

    try {
      let url: string | null = fileUrl || null;

      // If we only have a storage path, generate a signed URL
      if (!url && filePath) {
        const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(filePath, 300);
        if (error) throw error;
        url = data?.signedUrl || null;
      }

      if (url) {
        void window.open(url, '_blank');
      } else {
        alert('Unable to generate contract file link.');
      }
    } catch (err) {
      console.error('[ContractsMoas] Failed to open file:', err);
      alert('Could not open the contract file. Check the browser console.');
    }
  }

  /** Color tone for a category badge (uses the stored hex). */
  categoryColorStyle(color: string | null): Record<string, string> {
    const c = color || '#6b7280';
    return { '--cat-color': c };
  }
}
