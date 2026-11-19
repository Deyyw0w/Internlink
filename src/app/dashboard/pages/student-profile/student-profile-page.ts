import { ChangeDetectorRef, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { supabase } from '../../../../environments/supabase.config';
import { ProfileService } from '../../../auth/profile.service';


@Component({
  selector: 'app-student-profile-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="w-full px-8 py-6 space-y-6">

      <!-- Profile Header Banner -->
      <section class="bg-[#1E3A5F] border-l-4 border-amber-500 text-white rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">

        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-3">
            <div class="flex-shrink-0 h-16 w-16 rounded-2xl bg-amber-900/20 border border-amber-500/30 flex items-center justify-center">
              {{ profileInitials() }}
            </div>
            <div>
              <p class="text-xs font-bold uppercase tracking-wider text-slate-300 mb-0.5">Student Identity</p>
              <h1 class="text-xl font-bold tracking-tight text-white">{{ profile()?.full_name || 'Loading…' }}</h1>
              <div class="flex items-center gap-3 text-sm text-slate-300">
                <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>Enrolled for Practicum
                </span>
                <span class="border-r border-slate-700 pr-3">{{ profile()?.student_id || '—' }}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="flex gap-2">
          <button type="button" (click)="openEditModal()" class="px-4 py-2 rounded-xl text-xs font-bold text-white bg-slate-700 hover:bg-slate-600 border border-slate-500 transition-all inline-flex items-center gap-2 active:scale-95 pointer-events-auto">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
            Edit Information
          </button>
          <button type="button" (click)="openChangePasswordModal()" class="px-4 py-2 rounded-xl text-xs font-bold text-amber-300 bg-amber-900/30 border border-amber-500/40 hover:bg-amber-900/50 hover:border-amber-500 hover:text-amber-200 transition-all inline-flex items-center gap-2 active:scale-95 pointer-events-auto">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
            Change Password
          </button>
        </div>
      </section>

      <!-- Two-Column Grid -->
      <section class="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <!-- Left Card: Academic & Department Information -->
        <section class="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-4">
          <h2 class="text-lg font-bold text-slate-900">Academic &amp; Department Information</h2>
          <div class="bg-slate-50/70 border border-slate-100 p-4 rounded-xl">
            <div class="flex justify-between items-start mb-2">
              <p class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Degree Program</p>
              <span class="text-sm font-medium text-slate-900">{{ profile()?.degree_program || '—' }}</span>
            </div>
          </div>
          <div class="bg-slate-50/70 border border-slate-100 p-4 rounded-xl">
            <div class="flex justify-between items-start mb-2">
              <p class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Collegiate Department</p>
              <span class="text-sm font-medium text-slate-900">{{ schoolForDegree(profile()?.degree_program || '') }} – {{ schoolNameForDegree(profile()?.degree_program || '') }}</span>
            </div>
          </div>
          <div class="bg-slate-50/70 border border-slate-100 p-4 rounded-xl">
            <div class="flex justify-between items-start mb-2">
              <p class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Practicum Required Hours</p>
              <span class="text-sm font-medium text-slate-900">{{ practicumHours(profile()?.degree_program || '') }}</span>
            </div>
            <div class="mt-2 pt-2 border-t border-slate-200/50">
              <div class="flex items-center gap-2">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span class="text-xs font-bold uppercase text-emerald-600">100% Eligible</span>
              </div>
            </div>
          </div>
        </section>

        <!-- Right Card: Contact & Security -->
        <section class="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-4">
          <h2 class="text-lg font-bold text-slate-900">Contact &amp; Security</h2>
          <div class="bg-slate-50/70 border border-slate-100 p-4 rounded-xl">
            <div class="flex justify-between items-start mb-2">
              <p class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Official University Email</p>
              <span class="text-sm font-medium text-slate-900">{{ profile()?.email || '—' }}</span>
            </div>
          </div>
          <div class="bg-slate-50/70 border border-slate-100 p-4 rounded-xl">
            <div class="flex justify-between items-start mb-2">
              <p class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Student ID Number</p>
              <span class="text-sm font-medium text-slate-900">{{ profile()?.student_id || '—' }}</span>
            </div>
          </div>
          <div class="bg-slate-50/70 border border-slate-100 p-4 rounded-xl">
            <div class="flex justify-between items-start mb-2">
              <p class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Account Created</p>
              <span class="text-sm font-medium text-slate-900">{{ createdAt(profile()?.created_at) }}</span>
            </div>
          </div>
          <div class="bg-slate-50/70 border border-slate-100 p-4 rounded-xl">
            <div class="flex justify-between items-start mb-2">
              <p class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Mobile Number</p>
              <span class="text-sm font-medium text-slate-900">{{ profile()?.mobile || '—' }}</span>
            </div>
          </div>
        </section>

      </section>

    </main>

    <!-- Edit Information Modal -->
    <div *ngIf="isEditModalOpen()" class="fixed inset-0 z-[60] flex items-center justify-center" role="dialog" aria-modal="true">
      <!-- Backdrop -->
      <div
        class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
        (click)="closeEditModal()"
      ></div>

      <!-- Modal Card -->
      <div class="relative w-full max-w-md mx-4 bg-white rounded-3xl border border-slate-200/80 shadow-2xl p-8 sm:p-10 transform transition-all">

        <div class="flex justify-between items-start mb-6">
          <div>
            <h2 class="text-2xl font-bold text-[#1E3A5F]">Edit Information</h2>
            <p class="text-sm text-slate-500 mt-1">
              Update your profile details below.
            </p>
          </div>
          <button
            type="button"
            (click)="closeEditModal()"
            class="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>

        <form (ngSubmit)="saveEdit()" class="flex flex-col gap-4" novalidate>

          <!-- Full Name -->
          <div class="flex flex-col gap-2">
            <label for="edit-fullName" class="text-sm font-semibold text-slate-700">Full Name</label>
            <div class="relative rounded-xl border border-slate-200 bg-slate-100/80 flex items-center">
              <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <input
                id="edit-fullName"
                type="text"
                placeholder="Juan Dela Cruz"
                [(ngModel)]="editFullName"
                name="fullName"
                required
                readonly
                class="w-full pl-10 pr-4 py-3 text-sm text-slate-500 outline-none bg-slate-100 border border-transparent cursor-not-allowed focus:ring-0"
              />
              <p *ngIf="editErrors().fullName" class="text-xs text-rose-600 mt-0.5">{{ editErrors().fullName }}</p>
            </div>
          </div>

          <!-- Student ID -->
          <div class="flex flex-col gap-2">
            <label for="edit-studentId" class="text-sm font-semibold text-slate-700">Student ID</label>
            <div class="relative rounded-xl border border-slate-200 bg-slate-100/80 flex items-center">
              <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <input
                id="edit-studentId"
                type="text"
                placeholder="e.g. 2021-04892"
                [(ngModel)]="editStudentId"
                name="studentId"
                required
                readonly
                class="w-full pl-10 pr-4 py-3 text-sm text-slate-500 outline-none bg-slate-100 border border-transparent cursor-not-allowed focus:ring-0"
              />
              <p *ngIf="editErrors().studentId" class="text-xs text-rose-600 mt-0.5">{{ editErrors().studentId }}</p>
            </div>
          </div>

          <!-- Email -->
          <div class="flex flex-col gap-2">
            <label for="edit-email" class="text-sm font-semibold text-slate-700">Email Address</label>
            <div class="relative rounded-xl border border-slate-200 bg-slate-100/80 flex items-center">
              <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2 .9-2 2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              <input
                id="edit-email"
                type="email"
                placeholder="name@uslt.edu.ph"
                [(ngModel)]="editEmail"
                name="email"
                required
                readonly
                class="w-full pl-10 pr-4 py-3 text-sm text-slate-500 outline-none bg-slate-100 border border-transparent cursor-not-allowed focus:ring-0"
              />
              <p *ngIf="editErrors().email" class="text-xs text-rose-600 mt-0.5">{{ editErrors().email }}</p>
            </div>
          </div>

          <!-- Mobile Number -->
          <div class="flex flex-col gap-2">
            <label for="edit-mobile" class="text-sm font-semibold text-slate-700">Mobile Number</label>
            <div class="relative rounded-xl border border-slate-200 bg-slate-100/80 flex items-center">
              <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <input
                id="edit-mobile"
                type="tel"
                placeholder="+63 912 345 6789"
                [(ngModel)]="editMobile"
                name="mobile"
                required
                class="w-full pl-10 pr-4 py-3 text-sm text-slate-900 outline-none bg-transparent border-none focus:ring-0"
              />
              <p *ngIf="editErrors().mobile" class="text-xs text-rose-600 mt-0.5">{{ editErrors().mobile }}</p>
            </div>
          </div>

          <!-- Degree Program -->
          <div class="flex flex-col gap-2">
            <label for="edit-degreeProgram" class="text-sm font-semibold text-slate-700">Degree Program</label>
            <div class="relative rounded-xl border border-slate-200 bg-slate-100/80 flex items-center">
              <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 12l2-2m0 0l2 2m-2-2l-2 2m2-2l2 2" />
                <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <select
                id="edit-degreeProgram"
                [(ngModel)]="editDegreeProgram"
                name="degreeProgram"
                required
                disabled
                class="w-full pl-10 pr-10 py-3 text-sm text-slate-500 outline-none bg-slate-100 border border-transparent cursor-not-allowed appearance-none"
              >
                <option value="">Select your degree program</option>
                <option *ngFor="let program of availableDegreePrograms()" [value]="program">{{ program }}</option>
              </select>
              <svg class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
              <p *ngIf="editErrors().degreeProgram" class="text-xs text-rose-600 mt-0.5">{{ editErrors().degreeProgram }}</p>
            </div>
          </div>

          <!-- Error Message -->
          <div *ngIf="editSubmitError()" class="bg-red-50 border-l-4 border-red-500 text-red-800 p-3 rounded-r text-sm">{{ editSubmitError() }}</div>

          <!-- Buttons -->
          <div class="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="button"
              (click)="closeEditModal()"
              class="flex-1 border border-slate-200 text-slate-700 font-semibold py-3 rounded-xl hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              [disabled]="isSaving()"
              class="flex-1 bg-[#1E3A5F] hover:not([disabled]):bg-[#162C49] text-white font-semibold py-3 rounded-xl shadow-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <span *ngIf="!isSaving()">Save Changes</span>
              <span *ngIf="isSaving()" class="flex items-center justify-center gap-2">
                <svg class="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Saving...
              </span>
            </button>
          </div>

        </form>

      </div>
    </div>

    <!-- Change Password Modal (separate modal) -->
    <div *ngIf="isChangePasswordModalOpen()" class="fixed inset-0 z-[60] flex items-center justify-center" role="dialog" aria-modal="true">
      <!-- Backdrop -->
      <div
        class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
        (click)="closeChangePasswordModal()"
      ></div>

      <!-- Modal Card -->
      <div class="relative w-full max-w-md mx-4 bg-white rounded-3xl border border-slate-200/80 shadow-2xl p-8 sm:p-10 transform transition-all">

        <div class="flex justify-between items-start mb-6">
          <div>
            <h2 class="text-2xl font-bold text-[#1E3A5F]">Change Password</h2>
            <p class="text-sm text-slate-500 mt-1">
              Update your account password below.
            </p>
          </div>
          <button
            type="button"
            (click)="closeChangePasswordModal()"
            class="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>

        <form (ngSubmit)="saveChangePassword()" class="flex flex-col gap-4" novalidate>

          <!-- Current Password -->
          <div class="flex flex-col gap-2">
            <label for="cp-currentPassword" class="text-sm font-semibold text-slate-700">Current Password</label>
            <div class="relative rounded-xl border border-slate-200 bg-slate-100/80 flex items-center">
              <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <input
                id="cp-currentPassword"
                [type]="showCpCurrentPassword() ? 'text' : 'password'"
                placeholder="Enter your current password"
                [(ngModel)]="cpCurrentPassword"
                name="currentPassword"
                required
                class="w-full pl-10 pr-10 py-3 text-sm text-slate-900 outline-none bg-transparent border-none focus:ring-0"
              />
              <button
                type="button"
                (click)="toggleCpCurrentPasswordVisibility()"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
                aria-label="Toggle password visibility"
              >
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><title>eye-outline</title><path d="M12 9a3 3 0 0 1 3 3a3 3 0 0 1-3 3a3 3 0 0 1-3-3a3 3 0 0 1 3-3m0-4.5c5 0 9.27 3.11 11 7.5c-1.73 4.39-6 7.5-11 7.5S2.73 16.39 1 12c1.73-4.39 6-7.5 11-7.5M3.18 12a9.821 9.821 0 0 0 17.64 0a9.821 9.821 0 0 0-17.64 0"/></svg>
              </button>
              <p *ngIf="cpErrors().currentPassword" class="text-xs text-rose-600 mt-0.5">{{ cpErrors().currentPassword }}</p>
            </div>
          </div>

          <!-- New Password -->
          <div class="flex flex-col gap-2">
            <label for="cp-newPassword" class="text-sm font-semibold text-slate-700">New Password</label>
            <div class="relative rounded-xl border border-slate-200 bg-slate-100/80 flex items-center">
              <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <input
                id="cp-newPassword"
                [type]="showCpNewPassword() ? 'text' : 'password'"
                placeholder="New password"
                autocomplete="new-password"
                [(ngModel)]="cpNewPassword"
                name="newPassword"
                required
                (input)="cpPasswordRequirements()"
                class="w-full pl-10 pr-10 py-3 text-sm text-slate-900 outline-none bg-transparent border-none focus:ring-0"
              />
              <button
                type="button"
                (click)="toggleCpNewPasswordVisibility()"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
                aria-label="Toggle password visibility"
              >
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><title>eye-outline</title><path d="M12 9a3 3 0 0 1 3 3a3 3 0 0 1-3 3a3 3 0 0 1-3-3a3 3 0 0 1 3-3m0-4.5c5 0 9.27 3.11 11 7.5c-1.73 4.39-6 7.5-11 7.5S2.73 16.39 1 12c1.73-4.39 6-7.5 11-7.5M3.18 12a9.821 9.821 0 0 0 17.64 0a9.821 9.821 0 0 0-17.64 0"/></svg>
              </button>
              <p *ngIf="cpErrors().newPassword" class="text-xs text-rose-600 mt-0.5">{{ cpErrors().newPassword }}</p>
            </div>
          </div>

          <!-- Password Requirements (standalone block between New Password and Confirm Password) -->
          <div class="mt-2 space-y-1">
            <p class="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">Password requirements</p>
            <div class="flex items-center gap-2 text-xs leading-none">
              <span class="w-1.5 h-1.5 rounded-full shrink-0"
                    [class.bg-emerald-500]="cpPasswordRequirements().length"
                    [class.bg-slate-200]="!cpPasswordRequirements().length"></span>
              <span [class.text-emerald-600]="cpPasswordRequirements().length"
                    [class.text-slate-400]="!cpPasswordRequirements().length" class="whitespace-nowrap">At least 6 characters</span>
            </div>
            <div class="flex items-center gap-2 text-xs leading-none">
              <span class="w-1.5 h-1.5 rounded-full shrink-0"
                    [class.bg-emerald-500]="cpPasswordRequirements().number"
                    [class.bg-slate-200]="!cpPasswordRequirements().number"></span>
              <span [class.text-emerald-600]="cpPasswordRequirements().number"
                    [class.text-slate-400]="!cpPasswordRequirements().number" class="whitespace-nowrap">At least 1 number</span>
            </div>
            <div class="flex items-center gap-2 text-xs leading-none">
              <span class="w-1.5 h-1.5 rounded-full shrink-0"
                    [class.bg-emerald-500]="cpPasswordRequirements().special"
                    [class.bg-slate-200]="!cpPasswordRequirements().special"></span>
              <span [class.text-emerald-600]="cpPasswordRequirements().special"
                    [class.text-slate-400]="!cpPasswordRequirements().special" class="whitespace-nowrap">At least 1 special character</span>
            </div>
            <div class="flex items-center gap-2 text-xs leading-none">
              <span class="w-1.5 h-1.5 rounded-full shrink-0"
                    [class.bg-emerald-500]="cpPasswordRequirements().uppercase"
                    [class.bg-slate-200]="!cpPasswordRequirements().uppercase"></span>
              <span [class.text-emerald-600]="cpPasswordRequirements().uppercase"
                    [class.text-slate-400]="!cpPasswordRequirements().uppercase" class="whitespace-nowrap">At least 1 uppercase letter</span>
            </div>
          </div>

          <!-- Confirm Password -->
          <div class="flex flex-col gap-2">
            <label for="cp-confirmPassword" class="text-sm font-semibold text-slate-700">Confirm New Password</label>
            <div class="relative rounded-xl border border-slate-200 bg-slate-100/80 flex items-center">
              <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <input
                id="cp-confirmPassword"
                [type]="showCpConfirmPassword() ? 'text' : 'password'"
                placeholder="Confirm your new password"
                autocomplete="new-password"
                [(ngModel)]="cpConfirmPassword"
                name="confirmPassword"
                required
                class="w-full pl-10 pr-10 py-3 text-sm text-slate-900 outline-none bg-transparent border-none focus:ring-0"
              />
              <button
                type="button"
                (click)="toggleCpConfirmPasswordVisibility()"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
                aria-label="Toggle password visibility"
              >
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><title>eye-outline</title><path d="M12 9a3 3 0 0 1 3 3a3 3 0 0 1-3 3a3 3 0 0 1-3-3a3 3 0 0 1 3-3m0-4.5c5 0 9.27 3.11 11 7.5c-1.73 4.39-6 7.5-11 7.5S2.73 16.39 1 12c1.73-4.39 6-7.5 11-7.5M3.18 12a9.821 9.821 0 0 0 17.64 0a9.821 9.821 0 0 0-17.64 0"/></svg>
              </button>
              <p *ngIf="cpErrors().confirmPassword" class="text-xs text-rose-600 mt-0.5">{{ cpErrors().confirmPassword }}</p>
            </div>
          </div>

          <!-- Error Message -->
          <div *ngIf="cpSubmitError()" class="bg-red-50 border-l-4 border-red-500 text-red-800 p-3 rounded-r text-sm">{{ cpSubmitError() }}</div>

          <!-- Buttons -->
          <div class="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="button"
              (click)="closeChangePasswordModal()"
              class="flex-1 border border-slate-200 text-slate-700 font-semibold py-3 rounded-xl hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              [disabled]="cpIsSaving()"
              class="flex-1 bg-[#1E3A5F] hover:not([disabled]):bg-[#162C49] text-white font-semibold py-3 rounded-xl shadow-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <span *ngIf="!cpIsSaving()">Change Password</span>
              <span *ngIf="cpIsSaving()" class="flex items-center justify-center gap-2">
                <svg class="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Changing...
              </span>
            </button>
          </div>

        </form>

      </div>
    </div>

    <!-- Edit / Password Success Popup -->
    <div *ngIf="showEditPopup()" class="fixed inset-0 z-[60] flex items-center justify-center">
      <!-- Backdrop -->
      <div
        class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
        (click)="closeEditPopup()"
      ></div>

      <!-- Popup Card -->
      <div class="relative w-full max-w-md mx-4 bg-white rounded-3xl border border-slate-200/80 shadow-2xl p-8 sm:p-10">
        <div class="flex items-start gap-3">
          <div
            class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
            [ngClass]="{
              'bg-emerald-100 text-emerald-600': editPopupSuccess(),
              'bg-red-100 text-red-600': !editPopupSuccess()
            }"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
              <path
                *ngIf="editPopupSuccess()"
                d="M5 13l4 4L19 7"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                *ngIf="!editPopupSuccess()"
                d="M12 8v5m0 1.5V16m-7.25-4a7.25 7.25 0 1 1 14.5 0a7.25 7.25 0 0 1-14.5 0Z"
                fill="none"
                stroke="currentColor"
                stroke-linejoin="round"
                stroke-width="1.5"
              />
            </svg>
          </div>
          <div>
            <h3 class="text-lg font-bold text-slate-900 mb-1">
              {{ editPopupSuccess() ? 'Profile Updated' : 'Update Failed' }}
            </h3>
            <p class="text-slate-600 text-sm">{{ editPopupMessage() }}</p>
          </div>
        </div>

        <div class="mt-6 flex justify-end">
          <button
            type="button"
            (click)="closeEditPopup()"
            class="bg-[#1E3A5F] hover:bg-[#162C49] text-white font-semibold px-6 py-2 rounded-xl shadow-sm transition-colors"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  `,
})
export class StudentProfilePageComponent implements OnInit {
  private readonly profileService = inject(ProfileService);
  private readonly cdr = inject(ChangeDetectorRef);

  profile = this.profileService.profile;
  profileLoaded = this.profileService.loading;

  // Degree programs loaded from the database (degree_programs table)
  availableDegreePrograms = signal<string[]>([]);
  degreeProgramsByName = signal<Record<string, { department: string; department_abbreviation: string; practicum_hours: number }>>({});

  // Edit Information modal state
  isEditModalOpen = signal(false);
  isSaving = signal(false);
  editErrors = signal<{
    fullName?: string;
    studentId?: string;
    email?: string;
    mobile?: string;
    degreeProgram?: string;
  }>({});
  editSubmitError = signal('');

  // Edit form fields
  editFullName = '';
  editEmail = '';
  editStudentId = '';
  editDegreeProgram = '';
  editMobile = '';

  // Change Password modal state
  isChangePasswordModalOpen = signal(false);
  cpIsSaving = signal(false);
  cpErrors = signal<{
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  }>({});
  cpSubmitError = signal('');

  showCpCurrentPassword = signal(false);
  showCpNewPassword = signal(false);
  showCpConfirmPassword = signal(false);

  // Change Password form fields
  cpCurrentPassword = '';
  cpNewPassword = '';
  cpConfirmPassword = '';

  /** Password requirement states for the student change-password form. */
  cpPasswordRequirements = computed(() => {
    const pw = this.cpNewPassword;
    return {
      length: pw.length >= 6,
      number: /\d/.test(pw),
      special: /[^a-zA-Z0-9]/.test(pw),
      uppercase: /[A-Z]/.test(pw),
    };
  });

  // Shared success popup
  showEditPopup = signal(false);
  editPopupSuccess = signal(true);
  editPopupMessage = signal('');


  schoolForDegree(degree: string) {
    return this.degreeProgramsByName()[degree]?.department_abbreviation || '—';
  }

  schoolNameForDegree(degree: string) {
    return this.degreeProgramsByName()[degree]?.department || '—';
  }

  practicumHours(degree: string) {
    const hours = this.degreeProgramsByName()[degree]?.practicum_hours;
    return hours ? `${hours} prescribed training hours` : '486 prescribed training hours';
  }

  /** Avatar initials computed from profile full_name. */
  profileInitials() {
    const profile = this.profileService.profile();
    return profile?.full_name ? this.profileService.computeInitials(profile.full_name) : '?';
  }

  /** Format created_at timestamp safely. */
  createdAt(value: string | null | undefined): string {
    if (!value) return '—';
    return new Date(value).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  /** Open edit modal pre-filled with current profile data. */
  async openEditModal(): Promise<void> {
    console.log('[StudentProfile] Edit Information button clicked');

    try {
      let profile = this.profileService.profile();

      if (!profile) {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        console.log('[StudentProfile] Session check:', { user: session?.user?.id, sessionError });
        if (session?.user) {
          await this.profileService.loadProfile(session.user.id);
          profile = this.profileService.profile();
        }
      }

      if (!profile) {
        // No profile available yet — still open the modal with empty fields
        // so the user can at least confirm the click is working
        this.editFullName = '';
        this.editEmail = '';
        this.editStudentId = '';
        this.editDegreeProgram = '';
        this.editMobile = '';
        this.editErrors.set({});
        this.editSubmitError.set('Profile not loaded yet. You can still edit and save.');
        this.isEditModalOpen.set(true);
        this.cdr.markForCheck();
        console.log('[StudentProfile] Edit modal opened (no profile, empty fields)');
        return;
      }

      this.fillEditForm(profile);
      this.isEditModalOpen.set(true);
      this.cdr.markForCheck();
      console.log('[StudentProfile] Edit modal opened');
    } catch (err) {
      console.error('[StudentProfile] openEditModal error:', err);
      this.editSubmitError.set(err instanceof Error ? err.message : 'Unexpected error opening edit modal.');
    }
  }

  private fillEditForm(profile: { full_name: string; email: string; student_id: string; degree_program: string; mobile: string }): void {
    this.editFullName = profile.full_name || '';
    this.editEmail = profile.email || '';
    this.editStudentId = profile.student_id || '';
    this.editDegreeProgram = profile.degree_program || '';
    this.editMobile = profile.mobile || '';
    this.editErrors.set({});
    this.editSubmitError.set('');
  }

  closeEditModal(): void {
    this.isEditModalOpen.set(false);
    this.editErrors.set({});
    this.editSubmitError.set('');
    this.isSaving.set(false);
  }

  /** Open the separate Change Password modal. */
  async openChangePasswordModal(): Promise<void> {
    console.log('[StudentProfile] Change Password button clicked');

    try {
      // Ensure a session/profile exists before opening
      let profile = this.profileService.profile();
      if (!profile) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await this.profileService.loadProfile(session.user.id);
          profile = this.profileService.profile();
        }
      }

      this.cpCurrentPassword = '';
      this.cpNewPassword = '';
      this.cpConfirmPassword = '';
      this.cpErrors.set({});
      this.cpSubmitError.set('');
      this.isChangePasswordModalOpen.set(true);
      this.cdr.markForCheck();
      console.log('[StudentProfile] Change Password modal opened');
    } catch (err) {
      console.error('[StudentProfile] openChangePasswordModal error:', err);
      this.cpSubmitError.set(err instanceof Error ? err.message : 'Unexpected error opening change password modal.');
    }
  }

  closeChangePasswordModal(): void {
    this.isChangePasswordModalOpen.set(false);
    this.cpErrors.set({});
    this.cpSubmitError.set('');
    this.cpIsSaving.set(false);
    this.cpCurrentPassword = '';
    this.cpNewPassword = '';
    this.cpConfirmPassword = '';
    this.showCpCurrentPassword.set(false);
    this.showCpNewPassword.set(false);
    this.showCpConfirmPassword.set(false);
  }

  toggleCpCurrentPasswordVisibility(): void {
    this.showCpCurrentPassword.update(v => !v);
  }

  toggleCpNewPasswordVisibility(): void {
    this.showCpNewPassword.update(v => !v);
  }

  toggleCpConfirmPasswordVisibility(): void {
    this.showCpConfirmPassword.update(v => !v);
  }

  /** Save Edit Information — only Mobile is editable. */
  async saveEdit(): Promise<void> {
    this.editErrors.set({});
    this.editSubmitError.set('');

    let valid = true;

    if (!(String(this.editMobile ?? '').trim())) {
      this.editErrors.set({ ...this.editErrors(), mobile: 'Mobile number is required.' });
      valid = false;
    }

    if (!valid) return;

    const profile = this.profileService.profile();
    if (!profile) {
      this.editSubmitError.set('No profile found to update.');
      return;
    }

    this.isSaving.set(true);
    console.log('[StudentProfile] Saving mobile:', this.editMobile);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: String(this.editFullName ?? '').trim(),
          email: String(this.editEmail ?? '').trim().toLowerCase(),
          student_id: String(this.editStudentId ?? '').trim(),
          degree_program: String(this.editDegreeProgram ?? ''),
          mobile: String(this.editMobile ?? '').trim(),
        })
        .eq('id', profile.id);

      if (error) {
        console.error('[StudentProfile] Supabase update error:', error);
        this.editSubmitError.set(error.message || 'Failed to update profile. Please try again.');
        this.isSaving.set(false);
        return;
      }

      // Refresh the shared profile so dashboard/topbar reflect changes
      await this.profileService.loadProfile(profile.id);
      this.cdr.markForCheck();

      this.closeEditModal();

      this.editPopupSuccess.set(true);
      this.editPopupMessage.set('Your profile information has been updated successfully.');
      this.showEditPopup.set(true);
    } catch (err) {
      console.error('[StudentProfile] Save exception:', err);
      this.editSubmitError.set(err instanceof Error ? err.message : 'An unexpected error occurred.');
      this.isSaving.set(false);
    }
  }

  /** Save Change Password — verifies current password first, then updates via Supabase Auth. */
  async saveChangePassword(): Promise<void> {
    this.cpErrors.set({});
    this.cpSubmitError.set('');

    let valid = true;

    const currentPassword = String(this.cpCurrentPassword ?? '').trim();
    const newPassword = String(this.cpNewPassword ?? '').trim();
    const confirmPassword = String(this.cpConfirmPassword ?? '').trim();

    if (!currentPassword) {
      this.cpErrors.set({ ...this.cpErrors(), currentPassword: 'Current password is required.' });
      valid = false;
    }

    if (!newPassword) {
      this.cpErrors.set({ ...this.cpErrors(), newPassword: 'New password is required.' });
      valid = false;
    } else {
      const req = this.cpPasswordRequirements();
      let pwError = '';
      if (!req.length) pwError = 'Password must be at least 6 characters.';
      else if (!req.number) pwError = 'Password must contain at least 1 number.';
      else if (!req.special) pwError = 'Password must contain at least 1 special character.';
      else if (!req.uppercase) pwError = 'Password must contain at least 1 uppercase letter.';

      if (pwError) {
        this.cpErrors.set({ ...this.cpErrors(), newPassword: pwError });
        valid = false;
      }
    }

    if (!confirmPassword) {
      this.cpErrors.set({ ...this.cpErrors(), confirmPassword: 'Please confirm your new password.' });
      valid = false;
    } else if (newPassword !== confirmPassword) {
      this.cpErrors.set({ ...this.cpErrors(), confirmPassword: 'Passwords do not match.' });
      valid = false;
    }

    if (!valid) return;

    this.cpIsSaving.set(true);

    try {
      const profile = this.profileService.profile();
      const email = profile?.email || '';

      // Step 1: verify the current password by signing in with it
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });

      if (signInError) {
        console.error('[StudentProfile] Current password verification failed:', signInError);
        this.cpSubmitError.set('Current password is incorrect. Please try again.');
        this.cpErrors.set({ ...this.cpErrors(), currentPassword: 'Current password is incorrect.' });
        this.cpIsSaving.set(false);
        return;
      }

      // Step 2: current password confirmed — update to the new password
      const { error: authError } = await supabase.auth.updateUser({ password: newPassword });

      if (authError) {
        console.error('[StudentProfile] Auth password change error:', authError);
        this.cpSubmitError.set(authError.message || 'Failed to change password. Please try again.');
        this.cpIsSaving.set(false);
        return;
      }

      this.cpIsSaving.set(false);

      this.closeChangePasswordModal();

      this.editPopupSuccess.set(true);
      this.editPopupMessage.set('Your password has been changed successfully.');
      this.showEditPopup.set(true);

      console.log('[StudentProfile] Password changed successfully');
    } catch (err) {
      console.error('[StudentProfile] Change password exception:', err);
      this.cpSubmitError.set(err instanceof Error ? err.message : 'An unexpected error occurred.');
      this.cpIsSaving.set(false);
    }
  }

  closeEditPopup(): void {
    this.showEditPopup.set(false);
    this.editPopupMessage.set('');
  }

  async ngOnInit(): Promise<void> {
    await this.loadDegreePrograms();
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user && !this.profileService.profile()) {
      await this.profileService.loadProfile(session.user.id);
      this.cdr.markForCheck();
    }
  }

  /** Load degree programs from the database instead of hardcoded arrays. */
  async loadDegreePrograms(): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('degree_programs')
        .select('name, department, department_abbreviation, practicum_hours')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) throw error;

      const programs = (data || []) as any[];
      this.availableDegreePrograms.set(programs.map((p) => p.name).filter(Boolean));

      const byName: Record<string, { department: string; department_abbreviation: string; practicum_hours: number }> = {};
      programs.forEach((p) => {
        byName[p.name] = {
          department: p.department || '—',
          department_abbreviation: p.department_abbreviation || '—',
          practicum_hours: Number(p.practicum_hours) || 0,
        };
      });
      this.degreeProgramsByName.set(byName);
    } catch (err) {
      console.error('[StudentProfile] Failed to load degree programs:', err);
    }
  }
}
