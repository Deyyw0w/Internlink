import { CommonModule } from '@angular/common';
import { Component, HostListener, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { StudentSidebarComponent } from './student-sidebar/student-sidebar.component';
import { TopbarComponent } from './topbar/topbar.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [StudentSidebarComponent, TopbarComponent, RouterOutlet, CommonModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  /** Sidebar open/closed state (mobile overlay). */
  readonly isSidebarOpen = signal(false);

  /** True below the md breakpoint where the sidebar becomes a mobile overlay. */
  readonly isMobile = signal(window.innerWidth < 768);

  @HostListener('window:resize')
  onResize(): void {
    this.isMobile.set(window.innerWidth < 768);
    if (!this.isMobile()) this.isSidebarOpen.set(false);
  }

  toggleSidebar(): void {
    this.isSidebarOpen.update((v) => !v);
  }

  closeSidebar(): void {
    this.isSidebarOpen.set(false);
  }
}
