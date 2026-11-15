import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { supabase } from '../../environments/supabase.config';
import { RegisterModalComponent } from '../register/register-modal.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RegisterModalComponent],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class Login {
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  selectedRole: 'student' | 'admin' = 'student';
  email = '';
  password = '';
  isRegisterModalOpen = false;
  isSigningIn = false;
  showErrorPopup = false;
  errorPopupMessage = '';

  setRole(role: 'student' | 'admin'): void {
    this.selectedRole = role;
  }

  async onSubmit(): Promise<void> {
    console.log('[LOGIN] onSubmit called, email:', this.email);

    this.showErrorPopup = false;
    this.errorPopupMessage = '';

    if (!this.email || !this.password) {
      this.errorPopupMessage = 'Please enter your USLT credentials to continue.';
      this.showErrorPopup = true;
      this.cdr.markForCheck();
      console.log('[LOGIN] Empty fields popup shown');
      return;
    }

    this.isSigningIn = true;
    console.log('[LOGIN] Signing in...');

    try {
      const result = await supabase.auth.signInWithPassword({
        email: this.email,
        password: this.password,
      });
      console.log('[LOGIN] signInWithPassword result:', { error: result.error, hasUser: !!result.data?.user });

      // Supabase v2: always returns { data, error }
      if (result.error) {
        this.errorPopupMessage = result.error.message || 'Invalid email or password. Please try again.';
        this.showErrorPopup = true;
        this.isSigningIn = false;
        this.cdr.markForCheck();
        console.log('[LOGIN] Auth error popup shown');
        return;
      }

      if (!result.data?.user) {
        this.errorPopupMessage = 'Invalid email or password. Please try again.';
        this.showErrorPopup = true;
        this.isSigningIn = false;
        this.cdr.markForCheck();
        console.log('[LOGIN] No user popup shown');
        return;
      }

      const user = result.data.user;

      // Check if a profile exists for this user
      const profileResult = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      console.log('[LOGIN] profile query result:', { error: profileResult.error, hasProfile: !!profileResult.data });

      if (profileResult.error || !profileResult.data) {
        this.errorPopupMessage = 'No account profile found. Please register first.';
        this.showErrorPopup = true;
        this.isSigningIn = false;
        this.cdr.markForCheck();
        console.log('[LOGIN] No profile popup shown');
        return;
      }

      // Profile exists — verify the selected role matches the account's actual role
      const actualRole = (profileResult.data as { role: string }).role;

      if (this.selectedRole === 'admin' && actualRole !== 'admin') {
        this.errorPopupMessage = 'This account is not authorized for admin access.';
        this.showErrorPopup = true;
        this.isSigningIn = false;
        this.cdr.markForCheck();
        console.log('[LOGIN] Student account attempted admin login');
        return;
      }

      if (this.selectedRole === 'student' && actualRole === 'admin') {
        this.errorPopupMessage = 'Admin accounts cannot access the student dashboard.';
        this.showErrorPopup = true;
        this.isSigningIn = false;
        this.cdr.markForCheck();
        console.log('[LOGIN] Admin account attempted student login');
        return;
      }

      // Role matches — redirect based on actual role
      const destination = actualRole === 'admin' ? '/admin-dashboard' : '/dashboard';
      console.log('[LOGIN] Redirecting to:', destination);
      void this.router.navigate([destination]);
    } catch (err) {
      console.error('[LOGIN] Catch block error:', err);
      this.errorPopupMessage = err instanceof Error ? err.message : 'Login failed. Please try again.';
      this.showErrorPopup = true;
      this.isSigningIn = false;
      this.cdr.markForCheck();
    } finally {
      this.isSigningIn = false;
      this.cdr.markForCheck();
      console.log('[LOGIN] Loading stopped');
    }
  }

  closeErrorPopup(): void {
    this.showErrorPopup = false;
    this.errorPopupMessage = '';
  }

  openRegisterModal(): void {
    this.isRegisterModalOpen = true;
  }

  closeRegisterModal(): void {
    this.isRegisterModalOpen = false;
  }
}
