import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { supabase } from '../../environments/supabase.config';

/** Redirects unauthenticated users to /login. */
export const requireAuth: CanActivateFn = async () => {
  const router = inject(Router);
  const { data: { session }, error } = await supabase.auth.getSession();
  if (session?.user && !error) return true;
  return router.createUrlTree(['/login']);
};

/** Lets only unauthenticated users through (login page). */
export const requireGuest: CanActivateFn = async () => {
  const router = inject(Router);
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return true;
  return router.createUrlTree(['/dashboard']);
};

/** Requires auth + one of the allowed roles; otherwise sends user to their correct dashboard. */
export const requireRole = (allowedRoles: string[]): CanActivateFn => async () => {
  const router = inject(Router);
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return router.createUrlTree(['/login']);

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single();

  if (profile && allowedRoles.includes(profile.role)) return true;

  const destination = profile?.role === 'admin' ? '/admin-dashboard' : '/dashboard';
  return router.createUrlTree([destination]);
};
