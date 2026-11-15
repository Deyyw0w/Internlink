import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AdminDashboardComponent } from './admin-dashboard';

describe('AdminDashboardComponent', () => {
  let component: AdminDashboardComponent;
  let fixture: ComponentFixture<AdminDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminDashboardComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the admin dashboard shell', () => {
    expect(component).toBeTruthy();
  });

  it('should render the admin shell navigation and header', () => {
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('InternLink GLOCAL');
    expect(compiled.textContent).toContain('GLOCAL ADMIN CONSOLE');
    expect(compiled.textContent).toContain('Dashboard');
    expect(compiled.textContent).toContain('Student Applicants');
  });
});
