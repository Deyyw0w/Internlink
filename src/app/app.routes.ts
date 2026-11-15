import { Routes } from '@angular/router';

import { AdminDashboardComponent } from './admin-dashboard/admin-dashboard';
import { ContractsMoasPageComponent } from './admin-dashboard/pages/contracts-moas/contracts-moas-page';
import { Dashboard } from './dashboard/dashboard';
import { DocumentChecklistPageComponent as AdminDocumentChecklistPageComponent } from './admin-dashboard/pages/document-checklist/document-checklist-page';
import { FormsTemplatesPageComponent } from './admin-dashboard/pages/forms-templates/forms-templates-page';
import { Login } from './login/login';
import { RegisterComponent } from './register/register.component';
import { NotificationLogsPageComponent } from './admin-dashboard/pages/notification-logs/notification-logs-page';
import { PartnerAgenciesPageComponent } from './admin-dashboard/pages/partner-agencies/partner-agencies-page';
import { DashboardPageComponent } from './dashboard/pages/dashboard/dashboard-page';
import { InternshipPostingsPageComponent } from './dashboard/pages/internship-postings/internship-postings-page';
import { MyApplicationPageComponent } from './dashboard/pages/my-application/my-application-page';
import { DocumentChecklistPageComponent as StudentDocumentChecklistPageComponent } from './dashboard/pages/document-checklist/document-checklist-page';
import { NotificationsPageComponent } from './dashboard/pages/notifications/notifications-page';
import { StudentProfilePageComponent } from './dashboard/pages/student-profile/student-profile-page';
import { ReportsAnalyticsPageComponent } from './admin-dashboard/pages/reports-analytics/reports-analytics-page';
import { AdminAccountSettingsPageComponent } from './admin-dashboard/pages/account-settings/account-settings-page';
import { StudentApplicantsPageComponent } from './admin-dashboard/pages/student-applicants/student-applicants-page';
import { AdminDashboardPageComponent } from './admin-dashboard/pages/dashboard/dashboard-page';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: Login },
  { path: 'register', component: RegisterComponent },
  { path: 'dashboard', component: Dashboard, children: [
    { path: '', redirectTo: 'overview', pathMatch: 'full' },
    { path: 'overview', component: DashboardPageComponent },
    { path: 'internship-postings', component: InternshipPostingsPageComponent },
    { path: 'my-application', component: MyApplicationPageComponent },
    { path: 'document-checklist', component: StudentDocumentChecklistPageComponent },
    { path: 'notifications', component: NotificationsPageComponent },
    { path: 'student-profile', component: StudentProfilePageComponent },
  ],
},
  {
    path: 'admin-dashboard',
    component: AdminDashboardComponent,
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: AdminDashboardPageComponent },
      { path: 'student-applicants', component: StudentApplicantsPageComponent },
      { path: 'document-checklist', component: AdminDocumentChecklistPageComponent },
      { path: 'partner-agencies', component: PartnerAgenciesPageComponent },
      { path: 'contracts-moas', component: ContractsMoasPageComponent },
      { path: 'forms-templates', component: FormsTemplatesPageComponent },
      { path: 'reports-analytics', component: ReportsAnalyticsPageComponent },
      { path: 'notification-logs', component: NotificationLogsPageComponent },
      { path: 'account-settings', component: AdminAccountSettingsPageComponent },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
