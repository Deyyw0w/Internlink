import { Component, inject, OnInit, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { supabase } from '../../environments/supabase.config';
import { AuthService, RegisterFormData } from '../auth/auth.service';

@Component({
  selector: 'app-register-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
      <!-- Backdrop -->
      <div
        class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
        (click)="close.emit()"
      ></div>

      <!-- Modal Card -->
      <div class="relative w-full max-w-md mx-4 bg-white rounded-3xl border border-slate-200/80 shadow-2xl p-8 sm:p-10 transform transition-all">

        <div class="flex justify-between items-start mb-6">
          <div>
            <h2 class="text-2xl font-bold text-[#1E3A5F]">Create Student Account</h2>
            <p class="text-sm text-slate-500 mt-1">
              Join the InternLink GLOCAL portal as a student.
            </p>
          </div>
          <button
            type="button"
            (click)="close.emit()"
            class="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>

        <form (ngSubmit)="onSubmit()" class="flex flex-col gap-4" novalidate>

          <!-- Full Name -->
          <div class="flex flex-col gap-2">
            <label for="modal-fullName" class="text-sm font-semibold text-slate-700">Full Name</label>
            <div class="relative rounded-xl border border-slate-200 bg-slate-100/80 flex items-center">
              <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <input
                id="modal-fullName"
                type="text"
                placeholder="Juan Dela Cruz"
                [(ngModel)]="form.fullName"
                name="fullName"
                required
                class="w-full pl-10 pr-4 py-3 text-sm text-slate-900 outline-none bg-transparent border-none focus:ring-0"
              />
            </div>
          </div>

          <!-- Student ID -->
          <div class="flex flex-col gap-2">
            <label for="modal-studentId" class="text-sm font-semibold text-slate-700">Student ID</label>
            <div class="relative rounded-xl border border-slate-200 bg-slate-100/80 flex items-center">
              <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <input
                id="modal-studentId"
                type="text"
                placeholder="e.g. 2021-04892"
                [(ngModel)]="form.studentId"
                name="studentId"
                required
                class="w-full pl-10 pr-4 py-3 text-sm text-slate-900 outline-none bg-transparent border-none focus:ring-0"
              />
              <p *ngIf="errors.studentId" class="text-xs text-rose-600 mt-0.5">{{ errors.studentId }}</p>
            </div>
          </div>

          <!-- Email -->
          <div class="flex flex-col gap-2">
            <label for="modal-email" class="text-sm font-semibold text-slate-700">Email Address</label>
            <div class="relative rounded-xl border border-slate-200 bg-slate-100/80 flex items-center">
              <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2 .9-2 2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              <input
                id="modal-email"
                type="email"
                placeholder="name@uslt.edu.ph"
                [(ngModel)]="form.email"
                name="email"
                required
                class="w-full pl-10 pr-4 py-3 text-sm text-slate-900 outline-none bg-transparent border-none focus:ring-0"
              />
              <p *ngIf="errors.email" class="text-xs text-rose-600 mt-0.5">{{ errors.email }}</p>
            </div>
          </div>

          <!-- Password -->
          <div class="flex flex-col gap-2">
            <label for="modal-password" class="text-sm font-semibold text-slate-700">Password</label>
            <div class="relative rounded-xl border border-slate-200 bg-slate-100/80 flex items-center">
              <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <input
                id="modal-password"
                type="password"
                placeholder="••••••••"
                [(ngModel)]="form.password"
                name="password"
                required
                minlength="6"
                class="w-full pl-10 pr-4 py-3 text-sm text-slate-900 outline-none bg-transparent border-none focus:ring-0"
              />
              <p *ngIf="errors.password" class="text-xs text-rose-600 mt-0.5">{{ errors.password }}</p>
            </div>
          </div>

          <!-- Confirm Password -->
          <div class="flex flex-col gap-2">
            <label for="modal-confirmPassword" class="text-sm font-semibold text-slate-700">Confirm Password</label>
            <div class="relative rounded-xl border border-slate-200 bg-slate-100/80 flex items-center">
              <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <input
                id="modal-confirmPassword"
                type="password"
                placeholder="••••••••"
                [(ngModel)]="form.confirmPassword"
                name="confirmPassword"
                required
                class="w-full pl-10 pr-4 py-3 text-sm text-slate-900 outline-none bg-transparent border-none focus:ring-0"
              />
              <p *ngIf="errors.confirmPassword" class="text-xs text-rose-600 mt-0.5">{{ errors.confirmPassword }}</p>
            </div>
          </div>

          <!-- Degree Program -->
          <div class="flex flex-col gap-2">
            <label for="modal-degreeProgram" class="text-sm font-semibold text-slate-700">Degree Program</label>
            <div class="relative rounded-xl border border-slate-200 bg-slate-100/80 flex items-center">
              <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 12l2-2m0 0l2 2m-2-2l-2 2m2-2l2 2" />
                <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <select
                id="modal-degreeProgram"
                [(ngModel)]="form.degreeProgram"
                name="degreeProgram"
                required
                class="w-full pl-10 pr-10 py-3 text-sm text-slate-900 outline-none bg-transparent border-none focus:ring-0 appearance-none"
              >
                <option value="">Select your degree program</option>
                <option *ngFor="let program of availableDegreePrograms()" [value]="program">{{ program }}</option>
              </select>
              <svg class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
              <p *ngIf="errors.degreeProgram" class="text-xs text-rose-600 mt-0.5">{{ errors.degreeProgram }}</p>
            </div>
          </div>

          <!-- Mobile Number -->
          <div class="flex flex-col gap-2">
            <label for="modal-mobile" class="text-sm font-semibold text-slate-700">Mobile Number</label>
            <div class="relative rounded-xl border border-slate-200 bg-slate-100/80 flex items-center">
              <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <input
                id="modal-mobile"
                type="tel"
                placeholder="+63 912 345 6789"
                [(ngModel)]="form.mobile"
                name="mobile"
                required
                class="w-full pl-10 pr-4 py-3 text-sm text-slate-900 outline-none bg-transparent border-none focus:ring-0"
              />
              <p *ngIf="errors.mobile" class="text-xs text-rose-600 mt-0.5">{{ errors.mobile }}</p>
            </div>
          </div>

          <!-- Error Message -->
          <div *ngIf="submitError" class="bg-red-50 border-l-4 border-red-500 text-red-800 p-3 rounded-r text-sm">{{ submitError }}</div>

          <!-- Buttons -->
          <div class="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="button"
              (click)="close.emit()"
              class="flex-1 border border-slate-200 text-slate-700 font-semibold py-3 rounded-xl hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              [disabled]="isLoading"
              class="flex-1 bg-[#1E3A5F] hover:not([disabled]):bg-[#162C49] text-white font-semibold py-3 rounded-xl shadow-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <span *ngIf="!isLoading">Create Account</span>
              <span *ngIf="isLoading" class="flex items-center justify-center gap-2">
                <svg class="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Creating...
              </span>
            </button>
          </div>

        </form>

      </div>
    </div>
  `,
})
export class RegisterModalComponent implements OnInit {
  readonly availableDegreePrograms = signal<string[]>([]);

  readonly close = output<void>();

  readonly authService = inject(AuthService);

  async ngOnInit(): Promise<void> {
    await this.loadDegreePrograms();
  }

  /** Load degree programs from the database instead of a hardcoded list. */
  async loadDegreePrograms(): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('degree_programs')
        .select('name')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) throw error;

      const programs = (data || []) as { name: string }[];
      this.availableDegreePrograms.set(programs.map((p) => p.name).filter(Boolean));
    } catch (err) {
      console.error('[RegisterModal] Failed to load degree programs:', err);
    }
  }

  form: RegisterFormData = {
    fullName: '',
    studentId: '',
    email: '',
    password: '',
    confirmPassword: '',
    degreeProgram: '',
    mobile: '',
  };

  errors: {
    fullName?: string;
    studentId?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
    degreeProgram?: string;
    mobile?: string;
  } = {};

  submitError = '';
  isLoading = false;

  async onSubmit(): Promise<void> {
    this.errors = {};
    this.submitError = '';

    let valid = true;

    if (!this.form.fullName?.trim()) {
      this.errors.fullName = 'Full name is required.';
      valid = false;
    }

    if (!this.form.studentId?.trim()) {
      this.errors.studentId = 'Student ID is required.';
      valid = false;
    }

    if (!this.form.email?.trim()) {
      this.errors.email = 'Email address is required.';
      valid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.form.email)) {
      this.errors.email = 'Please enter a valid email address.';
      valid = false;
    }

    if (!this.form.password) {
      this.errors.password = 'Password is required.';
      valid = false;
    } else if (this.form.password.length < 6) {
      this.errors.password = 'Password must be at least 6 characters.';
      valid = false;
    }

    if (!this.form.confirmPassword) {
      this.errors.confirmPassword = 'Please confirm your password.';
      valid = false;
    } else if (this.form.confirmPassword !== this.form.password) {
      this.errors.confirmPassword = 'Passwords do not match.';
      valid = false;
    }

    if (!this.form.degreeProgram) {
      this.errors.degreeProgram = 'Please select a degree program.';
      valid = false;
    }

    if (!this.form.mobile?.trim()) {
      this.errors.mobile = 'Mobile number is required.';
      valid = false;
    }

    if (!valid) return;

    this.isLoading = true;
    try {
      const result = await this.authService.register({
        fullName: this.form.fullName.trim(),
        studentId: this.form.studentId.trim(),
        email: this.form.email.trim().toLowerCase(),
        password: this.form.password,
        confirmPassword: this.form.confirmPassword,
        degreeProgram: this.form.degreeProgram,
        mobile: this.form.mobile.trim(),
      });

      if (!result.success) {
        if (result.error?.includes('already registered') || result.error?.includes('already exists')) {
          this.submitError = 'An account with this email or student ID already exists.';
        } else if (result.error?.includes('weak password')) {
          this.submitError = 'Password is too weak. Please choose a stronger one.';
        } else {
          this.submitError = result.error || 'Registration failed. Please try again.';
        }
      }
      // On success, authService already navigates to /dashboard; close.emit() is handled by parent
    } finally {
      this.isLoading = false;
    }
  }
}
