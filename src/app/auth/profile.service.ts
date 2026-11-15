import { Injectable, signal } from '@angular/core';
import { supabase } from '../../environments/supabase.config';

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

/**
 * Shared profile state so the dashboard page and the topbar
 * both render the same real Supabase data instead of hardcoded values.
 * Uses Angular signals so zoneless change detection picks up updates.
 */
@Injectable({ providedIn: 'root' })
export class ProfileService {
  profile = signal<StudentProfile | null>(null);
  loading = signal(true);

  async loadProfile(userId: string): Promise<void> {
    this.loading.set(true);
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error || !profile) {
        this.profile.set(null);
        return;
      }

      this.profile.set(profile);
    } catch (err) {
      console.error('[ProfileService] Error loading profile:', err);
      this.profile.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  computeInitials(fullName: string): string {
    return fullName
      .split(' ')
      .map(part => part.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('');
  }
}
