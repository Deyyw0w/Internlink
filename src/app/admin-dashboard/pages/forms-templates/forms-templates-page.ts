import { ChangeDetectorRef, Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { supabase } from '../../../../environments/supabase.config';

const STORAGE_BUCKET = 'forms-templates';

type Category =
  | 'application'
  | 'medical'
  | 'waiver'
  | 'endorsement'
  | 'evaluation'
  | 'agreement'
  | 'timesheet'
  | 'other';

interface FormTemplate {
  id: string;
  title: string;
  description: string;
  category: Category;
  sub_type?: string | null;
  file_path: string | null;
  file_url: string | null;
  file_type: string | null;
  version: number;
  is_active: boolean;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

const CATEGORY_CONFIG: Record<Category, { label: string; color: 'blue' | 'amber' | 'emerald' | 'rose' | 'blue' | 'slate' }> = {
  application: { label: 'Application', color: 'blue' },
  medical: { label: 'Medical', color: 'emerald' },
  waiver: { label: 'Waiver', color: 'amber' },
  endorsement: { label: 'Endorsement', color: 'blue' },
  evaluation: { label: 'Evaluation', color: 'emerald' },
  agreement: { label: 'Agreement', color: 'rose' },
  timesheet: { label: 'Timesheet', color: 'amber' },
  other: { label: 'Other', color: 'slate' },
};

@Component({
  selector: 'app-forms-templates-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="w-full px-8 py-6 space-y-6">

      <!-- Header Banner -->
      <section class="bg-[#1E3A5F] text-white rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div class="flex flex-col gap-1">
          <h2 class="text-xl font-extrabold tracking-tight text-white">Forms &amp; Templates</h2>
          <p class="text-sm text-slate-300 leading-relaxed max-w-xl">
            Organize blank forms and admin template files by category. Students download, fill out, and upload
            completed copies through their Document Checklist.
          </p>
        </div>

        <button
          type="button"
          (click)="openAddModal()"
          class="inline-flex items-center gap-2 bg-[#1E3A5F] hover:bg-[#162C49] text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-sm transition-colors"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Form / Template
        </button>
      </section>

      <!-- Stats Bar -->
      <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <p class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Total Forms</p>
          <p class="text-2xl font-bold text-slate-900">{{ templateStats().total }}</p>
        </div>
        <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <p class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Active</p>
          <p class="text-2xl font-bold text-slate-900">{{ templateStats().active }}</p>
        </div>
        <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <p class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Inactive</p>
          <p class="text-2xl font-bold text-slate-900">{{ templateStats().inactive }}</p>
        </div>
        <div class="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <p class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Categories</p>
          <p class="text-2xl font-bold text-slate-900">{{ templateStats().categories }}</p>
        </div>
      </section>

      <!-- Filter Bar + Table -->
      <section class="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div class="px-6 py-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h3 class="text-base font-bold text-slate-900">Template Library</h3>

          <div class="flex flex-col sm:flex-row gap-3 w-full sm:w-auto items-center">
            <!-- Search -->
            <div class="relative min-w-0 w-full sm:w-64">
              <label class="sr-only">Search forms</label>
              <input
                type="search"
                [ngModel]="searchQuery()"
                (ngModelChange)="searchQuery.set($event)"
                placeholder="Search title or description…"
                class="w-full bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 rounded-xl pl-3 pr-10 py-2 text-sm focus:ring-1 focus:ring-blue-400 focus:border-transparent outline-none transition-colors"
              />
              <svg
                class="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="m21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0Z" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </div>

            <!-- Category filter -->
            <div class="relative min-w-0 w-full sm:w-48">
              <label class="sr-only">Category filter</label>
              <select
                [ngModel]="categoryFilter()"
                (ngModelChange)="categoryFilter.set($event)"
                class="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl pr-10 pl-3 py-2 text-sm appearance-none focus:ring-1 focus:ring-blue-400 focus:border-transparent outline-none transition-colors cursor-pointer"
              >
                <option value="">All Categories</option>
                <option *ngFor="let cat of allCategories" [value]="cat">{{ categoryLabel(cat) }}</option>
              </select>
              <svg
                class="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </div>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead class="bg-slate-50 border-b border-slate-200/80">
              <tr>
                <th class="px-6 py-4 text-xs font-semibold tracking-wider uppercase text-slate-500">Title</th>
                <th class="px-6 py-4 text-xs font-semibold tracking-wider uppercase text-slate-500">Description</th>
                <th class="px-6 py-4 text-xs font-semibold tracking-wider uppercase text-slate-500">Category</th>
                <th class="px-6 py-4 text-xs font-semibold tracking-wider uppercase text-slate-500">Type</th>
                <th class="px-6 py-4 text-xs font-semibold tracking-wider uppercase text-slate-500">File Type</th>
                <th class="px-6 py-4 text-xs font-semibold tracking-wider uppercase text-slate-500">Version</th>
                <th class="px-6 py-4 text-xs font-semibold tracking-wider uppercase text-slate-500">Status</th>
                <th class="px-6 py-4 text-xs font-semibold tracking-wider uppercase text-slate-500 text-right">Actions</th>
              </tr>
            </thead>

            <tbody class="divide-y divide-slate-100 hover:bg-slate-50/50 transition-colors">
              <tr *ngFor="let item of filteredTemplates(); trackBy: trackByTemplate" class="group">
                <td class="px-6 py-4">
                  <div class="text-slate-900 font-semibold">{{ item.title }}</div>
                  <div class="text-[10px] text-slate-500 mt-0.5">Updated {{ timeAgo(item.updated_at) }}</div>
                </td>

                <td class="px-6 py-4">
                  <p class="text-slate-600 text-sm line-clamp-1">{{ item.description || '—' }}</p>
                </td>

                <td class="px-6 py-4">
                  <span
                    class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border"
                    [ngClass]="categoryClass(item.category)"
                  >
                    {{ categoryLabel(item.category) }}
                  </span>
                </td>

                <td class="px-6 py-4">
                  <span *ngIf="item.sub_type" class="text-sm text-slate-600">{{ item.sub_type }}</span>
                  <span *ngIf="!item.sub_type" class="text-xs text-slate-400 italic">—</span>
                </td>

                <td class="px-6 py-4 text-sm text-slate-600">
                  {{ item.file_type || '—' }}
                </td>

                <td class="px-6 py-4 text-sm text-slate-600 font-mono">
                  v{{ item.version }}
                </td>

                <td class="px-6 py-4">
                  <button
                    type="button"
                    (click)="toggleActive(item)"
                    class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border"
                    [ngClass]="item.is_active
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-50 text-slate-500 border border-slate-200'"
                  >
                    <span
                      class="h-1.5 w-1.5 rounded-full"
                      [ngClass]="item.is_active ? 'bg-emerald-500' : 'bg-slate-400'"
                    ></span>
                    {{ item.is_active ? 'Active' : 'Inactive' }}
                  </button>
                </td>

                <td class="px-6 py-4 text-right">
                  <div class="inline-flex gap-2">
                    <button
                      *ngIf="item.file_url"
                      type="button"
                      (click)="downloadFile(item)"
                      class="text-xs font-semibold text-[#1E3A5F] hover:text-blue-900 underline underline-offset-4 transition-colors"
                      title="Download"
                    >
                      <svg class="w-4 h-4 inline" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    </button>
                    <button
                      type="button"
                      (click)="openEditModal(item)"
                      class="text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
                      title="Edit details"
                    >
                      <svg class="w-4 h-4 inline" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button
                      type="button"
                      (click)="openReplaceModal(item)"
                      class="text-xs font-semibold text-amber-600 hover:text-amber-800 transition-colors"
                      title="Replace file"
                    >
                      <svg class="w-4 h-4 inline" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 19A2 2 0 017 21h10a2 2 0 002-2V5a2 2 0 114 0v14a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    </button>
                    <button
                      type="button"
                      (click)="confirmDelete(item)"
                      class="text-xs font-semibold text-rose-600 hover:text-rose-800 transition-colors"
                      title="Delete"
                    >
                      <svg class="w-4 h-4 inline" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div *ngIf="filteredTemplates().length === 0" class="px-6 py-12 text-center">
          <p class="text-xs text-slate-500 italic">No forms or templates found.</p>
        </div>
      </section>

    </main>

    <!-- Add / Edit Form Modal -->
    <div *ngIf="showFormModal()" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" (click)="closeFormModal()">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200" (click)="$event.stopPropagation()">
        <div class="p-6 border-b border-slate-200 flex justify-between items-start">
          <div>
            <h2 class="text-lg font-bold text-slate-900">{{ editingTemplate() ? 'Edit Form' : 'Add Form / Template' }}</h2>
            <p class="text-xs text-slate-500 mt-1">{{ editingTemplate() ? 'Update title, category, type, description, and status.' : 'Upload a blank template file.' }}</p>
          </div>
          <button
            type="button"
            (click)="closeFormModal()"
            class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div class="p-6 space-y-5">
          <form (ngSubmit)="saveFormTemplate()" novalidate>

            <!-- Title -->
            <div class="flex flex-col gap-2">
              <label class="text-xs font-bold uppercase tracking-wider text-slate-500">Title</label>
              <input
                type="text"
                [(ngModel)]="editForm.title"
                name="title"
                required
                class="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 focus:ring-1 focus:ring-[#1E3A5F] focus:border-transparent outline-none transition-colors"
                placeholder="e.g. Practicum Application Form"
              />
            </div>

            <!-- Category -->
            <div class="flex flex-col gap-2">
              <label class="text-xs font-bold uppercase tracking-wider text-slate-500">Category</label>
              <select
                [(ngModel)]="editForm.category"
                name="category"
                class="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 focus:ring-1 focus:ring-[#1E3A5F] focus:border-transparent outline-none transition-colors cursor-pointer"
              >
                <option *ngFor="let cat of allCategories" [value]="cat">{{ categoryLabel(cat) }}</option>
              </select>
            </div>

            <!-- Sub-type -->
            <div class="flex flex-col gap-2">
              <label class="text-xs font-bold uppercase tracking-wider text-slate-500">Specific Type (optional)</label>
              <input
                type="text"
                [(ngModel)]="editForm.sub_type"
                name="sub_type"
                class="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 focus:ring-1 focus:ring-[#1E3A5F] focus:border-transparent outline-none transition-colors"
                placeholder="e.g. OJT Application, Medical Clearance, Waiver of Liability"
              />
            </div>

            <!-- Description -->
            <div class="flex flex-col gap-2">
              <label class="text-xs font-bold uppercase tracking-wider text-slate-500">Description</label>
              <textarea
                [(ngModel)]="editForm.description"
                name="description"
                rows="2"
                class="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 focus:ring-1 focus:ring-[#1E3A5F] focus:border-transparent outline-none transition-colors"
                placeholder="What is this form for?"
              ></textarea>
            </div>

            <!-- File Upload (required only for new items) -->
            <div *ngIf="!editingTemplate()" class="flex flex-col gap-2">
              <label class="text-xs font-bold uppercase tracking-wider text-slate-500">Template File</label>
              <div class="relative rounded-xl border border-dashed border-slate-300 bg-slate-50/50 flex items-center justify-between p-4 cursor-pointer group hover:border-blue-400/50 transition-colors">
                <label for="form-template-upload-file" class="w-full flex flex-col items-center justify-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                  <svg class="w-6 h-6 text-slate-400 group-hover:text-blue-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Choose PDF, DOCX, or image
                </label>
                <input
                  id="form-template-upload-file"
                  type="file"
                  (change)="onEditFormFile($event)"
                  class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                />
              </div>
              <div *ngIf="editForm.fileName" class="flex items-center gap-2 px-3 py-1 mt-1">
                <svg class="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="3"/></svg>
                <span class="text-xs text-slate-600 truncate max-w-xs" [title]="editForm.fileName">{{ editForm.fileName }}</span>
              </div>
            </div>

            <!-- File Replace (only when editing existing) -->
            <div *ngIf="editingTemplate()" class="flex flex-col gap-2">
              <label class="text-xs font-bold uppercase tracking-wider text-slate-500">Replace File</label>
              <div class="relative rounded-xl border border-dashed border-amber-300 bg-amber-50/50 flex items-center justify-between p-4 cursor-pointer group hover:border-amber-500/50 transition-colors">
                <label for="form-template-replace-edit-file" class="w-full flex flex-col items-center justify-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                  <svg class="w-6 h-6 text-slate-400 group-hover:text-amber-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19A2 2 0 017 21h10a2 2 0 002-2V5a2 2 0 114 0v14a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  Upload new file to replace current
                </label>
                <input
                  id="form-template-replace-edit-file"
                  type="file"
                  (change)="onEditFormFile($event)"
                  class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                />
              </div>
            </div>

            <!-- Active Toggle -->
            <div class="flex items-center gap-3 pt-2 border-t border-slate-100">
              <input
                type="checkbox"
                [(ngModel)]="editForm.is_active"
                name="is_active"
                id="is_active"
                class="w-4 h-4 rounded border-slate-300 text-[#1E3A5F] focus:ring-[#1E3A5F] bg-slate-50"
              />
              <label for="is_active" class="text-sm font-medium text-slate-700 cursor-pointer">Active (visible to users)</label>
            </div>

            <!-- Errors -->
            <div *ngIf="formSubmitError()" class="bg-rose-50 border-l-4 border-rose-500 text-rose-800 p-3 rounded-r text-sm">
              {{ formSubmitError() }}
            </div>

            <!-- Buttons -->
            <div class="flex gap-3 pt-5 border-t border-slate-100">
              <button
                type="button"
                (click)="closeFormModal()"
                [disabled]="isSavingForm()"
                class="flex-1 border border-slate-200 text-slate-700 font-semibold py-3 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="submit"
                [disabled]="isSavingForm()"
                class="flex-1 bg-[#1E3A5F] hover:not([disabled]):bg-[#162C49] text-white font-semibold py-3 rounded-xl shadow-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <span *ngIf="!isSavingForm()" class="flex items-center justify-center gap-2">
                  {{ editingTemplate() ? 'Save Changes' : 'Create Template' }}
                </span>
                <span *ngIf="isSavingForm()" class="flex items-center justify-center gap-2">
                  <svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/><path d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
                  Saving…
                </span>
              </button>
            </div>

          </form>
        </div>
      </div>
    </div>

    <!-- Replace File Modal -->
    <div *ngIf="showReplaceModal()" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" (click)="closeReplaceModal()">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200" (click)="$event.stopPropagation()">
        <div class="p-6 border-b border-slate-200 flex justify-between items-start">
          <div>
            <h2 class="text-lg font-bold text-slate-900">Replace File</h2>
            <p class="text-xs text-slate-500 mt-1">{{ replaceTarget()?.title }}</p>
          </div>
          <button
            type="button"
            (click)="closeReplaceModal()"
            class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div class="p-6 space-y-5">
          <form (ngSubmit)="saveReplaceFile()" novalidate>

            <div class="flex flex-col gap-2">
              <label class="text-xs font-bold uppercase tracking-wider text-slate-500">New Template File</label>
              <div class="relative rounded-xl border border-dashed border-amber-300 bg-amber-50/50 flex items-center justify-between p-4 cursor-pointer group hover:border-amber-500/50 transition-colors">
                <label for="form-template-replace-file" class="w-full flex flex-col items-center justify-center gap-2 text-sm font-medium text-amber-700 cursor-pointer">
                  <svg class="w-6 h-6 text-slate-400 group-hover:text-amber-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19A2 2 0 017 21h10a2 2 0 002-2V5a2 2 0 114 0v14a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  Choose PDF, DOCX, or image
                </label>
                <input
                  id="form-template-replace-file"
                  type="file"
                  (change)="onReplaceFile($event)"
                  class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                />
              </div>
              <div *ngIf="replaceForm.fileName" class="flex items-center gap-2 px-3 py-1 mt-1">
                <svg class="w-3 h-3 text-amber-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="3"/></svg>
                <span class="text-xs text-slate-600 truncate max-w-xs" [title]="replaceForm.fileName">{{ replaceForm.fileName }}</span>
              </div>
            </div>

            <div *ngIf="replaceSubmitError()" class="bg-rose-50 border-l-4 border-rose-500 text-rose-800 p-3 rounded-r text-sm">
              {{ replaceSubmitError() }}
            </div>

            <div class="flex gap-3 pt-5 border-t border-slate-100">
              <button
                type="button"
                (click)="closeReplaceModal()"
                [disabled]="isReplacingFile()"
                class="flex-1 border border-slate-200 text-slate-700 font-semibold py-3 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="submit"
                [disabled]="isReplacingFile() || !replaceForm.file"
                class="flex-1 bg-amber-500 hover:not([disabled]):bg-amber-600 text-white font-semibold py-3 rounded-xl shadow-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <span *ngIf="!isReplacingFile()" class="flex items-center justify-center gap-2">Replace &amp; Bump Version</span>
                <span *ngIf="isReplacingFile()" class="flex items-center justify-center gap-2">
                  <svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/><path d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
                  Replacing…
                </span>
              </button>
            </div>

          </form>
        </div>
      </div>
    </div>

    <!-- Delete Confirm Modal -->
    <div *ngIf="showDeleteModal()" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" (click)="closeDeleteModal()">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200" (click)="$event.stopPropagation()">
        <div class="p-6 border-b border-slate-200">
          <h2 class="text-lg font-bold text-slate-900">Delete Template?</h2>
          <p class="text-xs text-slate-500 mt-1">
            Deleting <span class="font-semibold">{{ deleteTarget()?.title }}</span> will remove it from the library. This cannot be undone.
          </p>
        </div>

        <div class="p-6 space-y-4 flex justify-end gap-3">
          <button
            type="button"
            (click)="closeDeleteModal()"
            [disabled]="isDeletingTemplate()"
            class="border border-slate-200 text-slate-700 font-semibold px-6 py-2.5 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            (click)="deleteTemplate()"
            [disabled]="isDeletingTemplate()"
            class="bg-rose-600 hover:bg-rose-700 text-white font-semibold px-6 py-2.5 rounded-xl shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <span *ngIf="!isDeletingTemplate()" class="flex items-center justify-center gap-2">Delete</span>
            <span *ngIf="isDeletingTemplate()" class="flex items-center justify-center gap-2">
              <svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/><path d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
              Deleting…
            </span>
          </button>
        </div>
      </div>
    </div>
  `,
})
export class FormsTemplatesPageComponent implements OnInit, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);

  private templatesSubscription: any = null;

  templates = signal<FormTemplate[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);

  searchQuery = signal('');
  categoryFilter = signal<Category | ''>('');

  // Modals
  showFormModal = signal(false);
  showReplaceModal = signal(false);
  showDeleteModal = signal(false);

  editingTemplate = signal<FormTemplate | null>(null);
  editForm = {
    id: '',
    title: '',
    description: '',
    category: 'other' as Category,
    sub_type: '',
    file: null as File | null,
    fileName: '',
    is_active: true,
  };

  replaceTarget = signal<FormTemplate | null>(null);
  replaceForm = {
    id: '',
    title: '',
    file: null as File | null,
    fileName: '',
  };

  deleteTarget = signal<FormTemplate | null>(null);

  isSavingForm = signal(false);
  isReplacingFile = signal(false);
  isDeletingTemplate = signal(false);

  formSubmitError = signal('');
  replaceSubmitError = signal('');

  readonly allCategories: Category[] = [
    'application',
    'medical',
    'waiver',
    'endorsement',
    'evaluation',
    'agreement',
    'timesheet',
    'other',
  ];

  trackByTemplate = (_: number, item: FormTemplate): string => item.id;

  ngOnInit(): void {
    this.loadTemplates();
    this.subscribeToUpdates();
  }

  ngOnDestroy(): void {
    if (this.templatesSubscription) {
      supabase.removeChannel(this.templatesSubscription);
      this.templatesSubscription = null;
    }
  }

  /** Category label + color class. */
  categoryLabel(cat: Category): string {
    return CATEGORY_CONFIG[cat].label;
  }

  categoryClass(cat: Category): string {
    const config = CATEGORY_CONFIG[cat];
    const base = 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border';
    if (config.color === 'blue') return `${base} bg-blue-50 text-blue-700 border border-blue-200`;
    if (config.color === 'amber') return `${base} bg-amber-50 text-amber-700 border border-amber-200`;
    if (config.color === 'emerald') return `${base} bg-emerald-50 text-emerald-700 border border-emerald-200`;
    if (config.color === 'rose') return `${base} bg-rose-50 text-rose-700 border border-rose-200`;
    return `${base} bg-slate-50 text-slate-500 border border-slate-200`;
  }

  /** Computed stats for the stat bar. */
  templateStats() {
    const list = this.templates();
    const categories = new Set(list.map((t) => t.category));
    return {
      total: list.length,
      active: list.filter((t) => t.is_active).length,
      inactive: list.filter((t) => !t.is_active).length,
      categories: categories.size,
    };
  }

  /** Templates filtered by search + category. */
  filteredTemplates() {
    const q = (this.searchQuery() || '').toLowerCase();
    const category = this.categoryFilter();

    return this.templates().filter((t) => {
      const matchSearch =
        !q ||
        t.title.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q);
      const matchCategory = !category || t.category === category;
      return matchSearch && matchCategory;
    });
  }

  /** Friendly time-ago string for template rows. */
  timeAgo(iso: string | null): string {
    if (!iso) return '—';
    const date = new Date(iso);
    if (isNaN(date.getTime())) return '—';
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  /** Load all forms/templates from Supabase. */
  async loadTemplates(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const { data, error } = await supabase
        .from('forms_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      this.templates.set((data || []) as FormTemplate[]);
      this.cdr.markForCheck();
    } catch (err) {
      console.error('[FormsTemplates] Error loading templates:', err);
      this.error.set(err instanceof Error ? err.message : 'Failed to load forms and templates.');
    } finally {
      this.loading.set(false);
      this.cdr.markForCheck();
    }
  }

  /** Realtime: update library when templates are created/updated/deleted. */
  private subscribeToUpdates(): void {
    this.templatesSubscription = supabase
      .channel('admin-forms-templates-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'forms_templates' },
        () => {
          console.log('[FormsTemplates] Realtime event: refreshing library.');
          void this.loadTemplates();
        }
      )
      .subscribe((status) => {
        console.log('[FormsTemplates] Realtime channel status:', status);
      });
  }

  // ── Actions ─────────────────────────────────────────────────

  /** Open add form modal. */
  openAddModal(): void {
    this.editingTemplate.set(null);
    this.editForm = {
      id: '',
      title: '',
      description: '',
      category: 'other',
      sub_type: '',
      file: null as File | null,
      fileName: '',
      is_active: true,
    };
    this.formSubmitError.set('');
    this.showFormModal.set(true);
    this.cdr.markForCheck();
  }

  /** Open edit details modal for an existing template. */
  openEditModal(item: FormTemplate): void {
    this.editingTemplate.set(item);
    this.editForm = {
      id: item.id,
      title: item.title,
      description: item.description || '',
      category: item.category,
      sub_type: item.sub_type || '',
      file: null as File | null,
      fileName: '',
      is_active: item.is_active,
    };
    this.formSubmitError.set('');
    this.showFormModal.set(true);
    this.cdr.markForCheck();
  }

  /** Close add/edit form modal. */
  closeFormModal(): void {
    this.showFormModal.set(false);
    this.editingTemplate.set(null);
    this.editForm = {
      id: '',
      title: '',
      description: '',
      category: 'other',
      sub_type: '',
      file: null as File | null,
      fileName: '',
      is_active: true,
    };
    this.formSubmitError.set('');
    this.cdr.markForCheck();
  }

  /** Handle file pick for add/edit form. */
  onEditFormFile(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;

    this.editForm.file = file;
    this.editForm.fileName = file.name;
    this.cdr.markForCheck();
  }

  /** Save add or edit form (title/category/type/description/active; new file if provided). */
  async saveFormTemplate(): Promise<void> {
    const { id, title, description, category, sub_type, file, is_active } = this.editForm;

    if (!title.trim()) {
      this.formSubmitError.set('Title is required.');
      return;
    }

    this.isSavingForm.set(true);
    this.formSubmitError.set('');

    try {
      let fileUrl: string | null = null;
      let filePath: string | null = null;
      let fileType: string | null = null;

      // If a new file was uploaded, store it first
      if (file) {
        const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
        const storagePath = `forms/${fileName}`;

        const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, file, { upsert: true });
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
        fileUrl = urlData?.publicUrl || null;
        filePath = storagePath;
        fileType = file.type || null;
      }

      if (this.editingTemplate()) {
        // Update existing: only fields provided are sent
        const updates: any = {
          title: title.trim(),
          description: description.trim() || null,
          category,
          sub_type: sub_type.trim() || null,
          is_active,
          updated_at: new Date().toISOString(),
        };

        if (fileUrl) {
          updates.file_url = fileUrl;
          updates.file_path = filePath;
          updates.file_type = fileType;
          updates.version = (this.editingTemplate()!.version || 1) + 1;
        }

        const { error } = await supabase
          .from('forms_templates')
          .update(updates)
          .eq('id', id);

        if (error) throw error;
      } else {
        // Create new (file required for new templates)
        if (!fileUrl) {
          this.formSubmitError.set('Please select a template file to upload.');
          return;
        }

        const { error } = await supabase
          .from('forms_templates')
          .insert({
            title: title.trim(),
            description: description.trim() || null,
            category,
            sub_type: sub_type.trim() || null,
            file_url: fileUrl,
            file_path: filePath,
            file_type: fileType,
            version: 1,
            is_active,
            uploaded_by: 'admin',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

        if (error) throw error;
      }

      this.closeFormModal();
      await this.loadTemplates();
      this.cdr.markForCheck();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save template.';
      console.error('[FormsTemplates] Save form template failed:', message);
      this.formSubmitError.set(message);
    } finally {
      this.isSavingForm.set(false);
      this.cdr.markForCheck();
    }
  }

  /** Toggle active status of a template. */
  async toggleActive(item: FormTemplate): Promise<void> {
    try {
      const { error } = await supabase
        .from('forms_templates')
        .update({ is_active: !item.is_active, updated_at: new Date().toISOString() })
        .eq('id', item.id);

      if (error) throw error;

      await this.loadTemplates();
      this.cdr.markForCheck();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update status.';
      console.error('[FormsTemplates] Toggle active failed:', message);
      alert(message);
    }
  }

  /** Download / open a template file. */
  downloadFile(item: FormTemplate): void {
    const url = item.file_url || item.file_path;
    if (!url) {
      alert('No file URL available for this template.');
      return;
    }
    void window.open(url, '_blank');
  }

  // ── Replace file ────────────────────────────────────────────

  openReplaceModal(item: FormTemplate): void {
    this.replaceTarget.set(item);
    this.replaceForm = { id: item.id, title: item.title, file: null as File | null, fileName: '' };
    this.replaceSubmitError.set('');
    this.showReplaceModal.set(true);
    this.cdr.markForCheck();
  }

  closeReplaceModal(): void {
    this.showReplaceModal.set(false);
    this.replaceTarget.set(null);
    this.replaceForm = { id: '', title: '', file: null as File | null, fileName: '' };
    this.replaceSubmitError.set('');
    this.cdr.markForCheck();
  }

  onReplaceFile(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;
    this.replaceForm.file = file;
    this.replaceForm.fileName = file.name;
    this.cdr.markForCheck();
  }

  async saveReplaceFile(): Promise<void> {
    const item = this.replaceTarget();
    const file = this.replaceForm.file;
    if (!item || !file) return;

    this.isReplacingFile.set(true);
    this.replaceSubmitError.set('');

    try {
      const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
      const storagePath = `forms/${fileName}`;

      const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
      const fileUrl = urlData?.publicUrl || null;

      if (!fileUrl) throw new Error('Failed to generate file URL.');

      const { error } = await supabase
        .from('forms_templates')
        .update({
          file_url: fileUrl,
          file_path: storagePath,
          file_type: file.type || null,
          version: (item.version || 1) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id);

      if (error) throw error;

      this.closeReplaceModal();
      await this.loadTemplates();
      this.cdr.markForCheck();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to replace file.';
      console.error('[FormsTemplates] Replace file failed:', message);
      this.replaceSubmitError.set(message);
    } finally {
      this.isReplacingFile.set(false);
      this.cdr.markForCheck();
    }
  }

  // ── Delete ──────────────────────────────────────────────────

  confirmDelete(item: FormTemplate): void {
    this.deleteTarget.set(item);
    this.showDeleteModal.set(true);
    this.cdr.markForCheck();
  }

  closeDeleteModal(): void {
    this.showDeleteModal.set(false);
    this.deleteTarget.set(null);
    this.cdr.markForCheck();
  }

  async deleteTemplate(): Promise<void> {
    const item = this.deleteTarget();
    if (!item) return;

    this.isDeletingTemplate.set(true);

    try {
      const { error } = await supabase.from('forms_templates').delete().eq('id', item.id);
      if (error) throw error;

      this.closeDeleteModal();
      await this.loadTemplates();
      this.cdr.markForCheck();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete template.';
      console.error('[FormsTemplates] Delete template failed:', message);
      alert(message);
    } finally {
      this.isDeletingTemplate.set(false);
      this.cdr.markForCheck();
    }
  }
}
