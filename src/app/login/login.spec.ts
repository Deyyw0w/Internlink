import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Login } from './login';

describe('Login', () => {
  let component: Login;
  let fixture: ComponentFixture<Login>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Login]
    }).compileComponents();

    fixture = TestBed.createComponent(Login);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the login component', () => {
    expect(component).toBeTruthy();
  });

  it('should default to student role', () => {
    expect(component.selectedRole).toBe('student');
  });

  it('should switch role when setRole is called', () => {
    component.setRole('admin');

    expect(component.selectedRole).toBe('admin');
    expect(component.error).toBe('');
  });

  it('should show error when submitting empty fields', () => {
    component.email = '';
    component.password = '';

    component.onSubmit();

    expect(component.error).toBe('Please enter your USLT credentials to continue.');
  });

  it('should navigate students to the student dashboard', () => {
    component.email = 'student@example.com';
    component.password = 'secret';

    const navigateSpy = vi.spyOn((component as any).router, 'navigate').mockReturnValue(Promise.resolve(true));

    component.onSubmit();

    expect(navigateSpy).toHaveBeenCalledWith(['/dashboard']);
  });

  it('should navigate admins to the admin dashboard', () => {
    component.setRole('admin');
    component.email = 'admin@example.com';
    component.password = 'secret';

    const navigateSpy = vi.spyOn((component as any).router, 'navigate').mockReturnValue(Promise.resolve(true));

    component.onSubmit();

    expect(navigateSpy).toHaveBeenCalledWith(['/admin-dashboard']);
  });
});
