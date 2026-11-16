import { Inject, Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { supabase } from '../../environments/supabase.config';

export interface RegisterFormData {
  fullName: string;
  studentId: string;
  email: string;
  password: string;
  confirmPassword: string;
  degreeProgram: string;
  mobile: string;
  role: 'student' | 'admin';
}

export interface RegisterResult {
  success: boolean;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);

  async register(data: RegisterFormData): Promise<RegisterResult> {
    try {
      // 1. Create the Supabase Auth account
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            full_name: data.fullName,
            student_id: data.studentId,
            degree_program: data.degreeProgram,
            role: data.role,
          },
        },
      });

      if (authError) {
        return { success: false, error: authError.message };
      }

      const user = authData.user;
      if (!user) {
        return { success: false, error: 'Unable to create account. Please try again.' };
      }

      // 2. Sign in so auth.uid() is available for the profile insert RLS policy
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (signInError) {
        // Clean up the orphan auth user so it doesn't block retries with the same email
        await supabase.auth.signOut();
        return { success: false, error: signInError.message };
      }

      // 3-a. Look up the degree's department info from degree_programs so the profile
      //      stores the department_name and department_abbreviation (not just the degree).
      const { data: degRow, error: degError } = await supabase
        .from('degree_programs')
        .select('department, department_abbreviation, practicum_hours')
        .eq('name', data.degreeProgram)
        .single();

      const departmentName = (degRow?.department || null) ?? null;
      const departmentAbbreviation = (degRow?.department_abbreviation || null) ?? null;
      const practicumHours = degRow?.practicum_hours ?? null;

      // 3-b. Insert the student profile (linked via Supabase Auth uid)
      const { error: profileError } = await supabase.from('profiles').insert({
        id: user.id, // Supabase Auth UUID → primary key / FK to auth.users
        student_id: data.studentId,
        full_name: data.fullName,
        email: data.email,
        degree_program: data.degreeProgram,
        department_name: departmentName,
        department_abbreviation: departmentAbbreviation,
        practicum_hours: practicumHours,
        mobile: data.mobile,
        role: data.role,
      });

      if (profileError) {
        // Profile insert failed — clean up the auth user so we don't leave an orphan
        await supabase.auth.signOut();
        return { success: false, error: profileError.message };
      }

      // Success. The caller decides where to redirect.
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'An unexpected error occurred.',
      };
    }
  }
}
