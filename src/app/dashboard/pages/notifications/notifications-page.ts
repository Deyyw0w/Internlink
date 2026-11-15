import { ChangeDetectorRef, Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { supabase } from '../../../../environments/supabase.config';
import { ProfileService } from '../../../auth/profile.service';

interface AppNotification {
  id: string;
  title: string;
  body: string;
  timeAgo: string;
  type: 'application' | 'requirement';
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Just now';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '—';
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months > 1 ? 's' : ''} ago`;
}

@Component({
  selector: 'app-notifications-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <main class="w-full px-8 py-6 space-y-6">

      <!-- Notifications Main Card -->
      <section class="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
        <div class="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
          <h2 class="text-lg font-bold text-slate-900">Student Notifications Log</h2>
          <span *ngIf="notifications().length > 0" class="text-xs font-bold text-[#1E3A5F] bg-[#1E3A5F]/10 px-2 py-1 rounded">{{ notifications().length }} new</span>
        </div>

        <!-- Notification Items List -->
        <div class="divide-y divide-slate-100 space-y-0" *ngIf="notifications().length > 0; else emptyState">

          <div *ngFor="let n of notifications()" class="py-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div class="flex-col gap-0.5">
              <p class="text-sm font-semibold text-slate-900">{{ n.title }}</p>
              <p class="text-xs text-slate-600 mt-0.5 leading-relaxed">{{ n.body }}</p>
            </div>
            <span class="text-xs text-slate-400 font-medium whitespace-nowrap">{{ n.timeAgo }}</span>
          </div>

        </div>

        <ng-template #emptyState>
          <div class="py-8 text-center">
            <p class="text-xs text-slate-500 italic">No notifications yet. Activity from your application and documents will appear here.</p>
          </div>
        </ng-template>
      </section>

    </main>
  `,
})
export class NotificationsPageComponent implements OnInit {
  private readonly profileService = inject(ProfileService);
  private readonly cdr = inject(ChangeDetectorRef);

  notifications = signal<AppNotification[]>([]);

  async ngOnInit(): Promise<void> {
    const profile = this.profileService.profile();
    const studentId = profile?.student_id;

    if (!studentId) {
      console.log('[Notifications] No student ID available');
      this.cdr.markForCheck();
      return;
    }

    try {
      const items: AppNotification[] = [];

      // 1. Application-based notification (latest application)
      const { data: apps, error: appError } = await supabase
        .from('internship_applications')
        .select('*')
        .eq('student_id', studentId)
        .order('submitted_at', { ascending: false })
        .limit(1);

      if (appError) throw appError;
      const app = apps?.[0] || null;

      if (app) {
        items.push({
          id: `app-${app.id}`,
          title: 'Application Status Updated',
          body: `Your application for ${app.position_role} at ${app.host_company} is now ${app.status}.`,
          timeAgo: timeAgo(app.submitted_at || app.updated_at),
          type: 'application',
        });
      }

      // 2. Requirement-based notifications
      const { data: reqs, error: reqError } = await supabase
        .from('student_requirements')
        .select('*')
        .eq('student_id', studentId)
        .order('updated_at', { ascending: false });

      if (reqError) throw reqError;

      for (const r of (reqs || [])) {
        const status = (r.status || 'pending').toLowerCase();

        if (status === 'rejected') {
          items.push({
            id: `req-${r.id}-rejected`,
            title: 'Document Rejected',
            body: `Your ${r.requirement_name} has been rejected. Please upload a valid document to proceed.`,
            timeAgo: timeAgo(r.updated_at),
            type: 'requirement',
          });
        } else if (status === 'pending' && !r.file_url) {
          items.push({
            id: `req-${r.id}-upload`,
            title: 'Document Upload Pending',
            body: `Please upload your ${r.requirement_name} to proceed with your application.`,
            timeAgo: timeAgo(r.updated_at),
            type: 'requirement',
          });
        } else if (status === 'pending' && r.file_url) {
          items.push({
            id: `req-${r.id}-review`,
            title: 'Document Awaiting Review',
            body: `Your ${r.requirement_name} has been uploaded and is pending verification.`,
            timeAgo: timeAgo(r.updated_at),
            type: 'requirement',
          });
        } else if (status === 'verified') {
          items.push({
            id: `req-${r.id}-verified`,
            title: 'Document Verified',
            body: `Your ${r.requirement_name} has been verified.`,
            timeAgo: timeAgo(r.updated_at),
            type: 'requirement',
          });
        }
      }

      // Sort newest first
      items.sort((a, b) => {
        return b.timeAgo.localeCompare(a.timeAgo) || 0;
      });

      this.notifications.set(items);
    } catch (err) {
      console.error('[Notifications] Error loading notifications:', err);
    } finally {
      this.cdr.markForCheck();
    }
  }
}
