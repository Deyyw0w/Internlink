import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { StudentSidebarComponent } from './student-sidebar/student-sidebar.component';
import { TopbarComponent } from './topbar/topbar.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [StudentSidebarComponent, TopbarComponent, RouterOutlet],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {}
