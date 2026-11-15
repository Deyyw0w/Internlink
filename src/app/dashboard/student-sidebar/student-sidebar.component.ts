import { Component } from '@angular/core';
  import { CommonModule } from '@angular/common';
  import { RouterLink, RouterLinkActive } from '@angular/router';

  export type StudentSidebarIcon =
    | 'dashboard'
    | 'building'
    | 'file'
    | 'user'
    | 'file-check'
    | 'bell'
    | 'user-profile';

  export interface StudentSidebarItem {
    label: string;
    route: string;
    icon: StudentSidebarIcon;
    badge?: string;
    suffix?: string;
  }

  @Component({
    selector: 'app-student-sidebar',
    standalone: true,
    imports: [CommonModule, RouterLink, RouterLinkActive],
    templateUrl: './student-sidebar.component.html',
  })
  export class StudentSidebarComponent {
    readonly menuItems: StudentSidebarItem[] = [
      { label: 'Dashboard',       route: '/dashboard/overview',          icon: 'dashboard' },
      { label: 'Internship Postings', route: '/dashboard/internship-postings', icon: 'file' },
      { label: 'My Application',  route: '/dashboard/my-application',     icon: 'user' },
      { label: 'Document Checklist', route: '/dashboard/document-checklist', icon: 'file-check', badge: '3' },
      { label: 'Notifications',   route: '/dashboard/notifications',      icon: 'bell', badge: '5' },
      { label: 'Student Profile', route: '/dashboard/student-profile',    icon: 'user-profile' },
    ];

    trackBySidebar = (_: number, item: StudentSidebarItem) => item.route;
  }