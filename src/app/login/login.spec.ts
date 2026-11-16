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

  it('should show error when submitting empty fields', async () => {
    component.email = '';
    component.password = '';

    await component.onSubmit();

    expect(component.errorPopupMessage).toBe('Please enter your USLT credentials to continue.');
    expect(component.showErrorPopup).toBe(true);
  });
});
