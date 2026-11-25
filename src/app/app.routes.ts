import { Routes } from '@angular/router';

import { AdminDashboardComponent } from './admin-dashboard/admin-dashboard';
import { ContractsMoasPageComponent } from './admin-dashboard/pages/contracts-moas/contracts-moas-page';
import { Dashboard } from './dashboard/dashboard';
import { DocumentChecklistPageComponent as AdminDocumentChecklistPageComponent } from './admin-dashboard/pages/document-checklist/document-checklist-page';
import { FormsTemplatesPageComponent } from './admin-dashboard/pages/forms-templates/forms-templates-page';
import { Login } from './login/login';
import { FirstLoginChangePasswordPageComponent } from './login/first-login-change-password';
import { AdminAuditLogsPageComponent } from './admin-dashboard/pages/audit-logs/audit-logs-page';
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
import { AccountsManagementPageComponent } from './admin-dashboard/pages/accounts-management/accounts-management-page';
import { requireAuth, requireGuest, requireRole } from './auth/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: Login, canActivate: [requireGuest] },
  { path: 'first-login-change-password', component: FirstLoginChangePasswordPageComponent, canActivate: [requireAuth] },
  { path: 'dashboard', component: Dashboard, canActivate: [requireAuth, requireRole(['student'])], children: [
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
    canActivate: [requireAuth, requireRole(['admin'])],
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
      { path: 'audit-logs', component: AdminAuditLogsPageComponent },
      { path: 'account-settings', component: AdminAccountSettingsPageComponent },
      { path: 'accounts-management', component: AccountsManagementPageComponent, canActivate: [requireAuth, requireRole(['admin'])] },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
