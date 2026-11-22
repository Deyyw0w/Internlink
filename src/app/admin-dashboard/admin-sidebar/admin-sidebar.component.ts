import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

interface SidebarItem {
  label: string;
  route: string;
  icon: 'dashboard' | 'users' | 'file-check' | 'building' | 'file-contract' | 'file-text' | 'chart' | 'bell' | 'cog' | 'admin-panel-settings' | 'agency-office' | 'activity-log';
}

@Component({
  selector: 'app-admin-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './admin-sidebar.component.html',
  styleUrl: './admin-sidebar.component.css'
})
export class AdminSidebarComponent {
  readonly menuItems: SidebarItem[] = [
    { label: 'Dashboard', route: '/admin-dashboard/dashboard', icon: 'dashboard' },
    { label: 'Student Applicants', route: '/admin-dashboard/student-applicants', icon: 'users' },
    { label: 'Document Verification', route: '/admin-dashboard/document-checklist', icon: 'file-check' },
    { label: 'Partner Agencies', route: '/admin-dashboard/partner-agencies', icon: 'agency-office' },
    { label: 'Contracts & MOAs', route: '/admin-dashboard/contracts-moas', icon: 'file-contract' },
    { label: 'Forms & Templates', route: '/admin-dashboard/forms-templates', icon: 'file-text' },
    { label: 'Reports & Analytics', route: '/admin-dashboard/reports-analytics', icon: 'chart' },
    { label: 'Notification Logs', route: '/admin-dashboard/notification-logs', icon: 'bell' },
    { label: 'Audit Logs', route: '/admin-dashboard/audit-logs', icon: 'activity-log' },
    { label: 'Account Manage', route: '/admin-dashboard/accounts-management', icon: 'users' },
    { label: 'Account Settings', route: '/admin-dashboard/account-settings', icon: 'admin-panel-settings' },
  ];

  /** Passed from the shell: true below the md breakpoint. */
  readonly isMobile = input.required<boolean>();

  /** Passed from the shell: whether the mobile overlay is open. */
  readonly isSidebarOpen = input.required<boolean>();

  trackBySidebar = (_: number, item: SidebarItem): string => item.label;
}
