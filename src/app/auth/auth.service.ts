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

      // 3-a. Resolve department info. Students look up their degree's department.
      // Admin accounts are assigned to the GLOCAL degree program, so the trigger
      // (migration 006) populates department_name/abbreviation from degree_programs.
      let departmentName: string | null = null;
      let departmentAbbreviation: string | null = null;
      let practicumHours: number | null = null;

      if (data.role === 'student' && data.degreeProgram) {
        const { data: degRow, error: degError } = await supabase
          .from('degree_programs')
          .select('department, department_abbreviation, practicum_hours')
          .eq('name', data.degreeProgram)
          .single();

        if (!degError && degRow) {
          departmentName = degRow.department ?? null;
          departmentAbbreviation = degRow.department_abbreviation ?? null;
          practicumHours = degRow.practicum_hours ?? null;
        } else {
          console.warn('[AuthService] No degree_program match for department lookup:', degError?.message ?? 'not found');
        }
      }

      // 3-b. Insert the profile (linked via Supabase Auth uid)
      const { error: profileError } = await supabase.from('profiles').insert({
        id: user.id, // Supabase Auth UUID → primary key / FK to auth.users
        student_id: data.studentId,
        full_name: data.fullName,
        email: data.email,
        degree_program: data.role === 'admin' ? 'GLOCAL' : (data.role === 'student' ? data.degreeProgram : null),
        department_name: departmentName,
        department_abbreviation: departmentAbbreviation,
        practicum_hours: practicumHours,
        mobile: data.mobile,
        role: data.role,
        must_change_password: data.role === 'student', // students must change default password on first login
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
