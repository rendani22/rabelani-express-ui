import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { vi } from 'vitest';

import { UserCardComponent } from './user-card.component';
import { UserCardMenuOption, User } from './user-card.interface';

describe('UserCardComponent', () => {
  let component: UserCardComponent;
  let fixture: ComponentFixture<UserCardComponent>;

  const mockUser: User = {
    id: '1',
    name: 'John Doe',
    avatar: 'https://example.com/avatar.jpg',
    country: 'Engineering',
    countryFlag: '👑',
    bio: 'Software Engineer',
    role: 'admin',
    email: 'john@example.com',
    phone: '+27123456789',
    isActive: true,
  };

  const menuOptions: UserCardMenuOption[] = [
    { label: 'View Profile', action: 'viewProfile' },
    { label: 'Deactivate', action: 'deactivate', isDanger: true },
  ];

  const createEvent = () => ({
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  }) as unknown as Event;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserCardComponent, BrowserAnimationsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(UserCardComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('user', mockUser);
    fixture.componentRef.setInput('menuOptions', menuOptions);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render the user details', () => {
    const cardText = fixture.nativeElement.textContent;
    const avatar = fixture.debugElement.query(By.css('img'));

    expect(cardText).toContain('John Doe');
    expect(cardText).toContain('Engineering');
    expect(cardText).toContain('john@example.com');
    expect(cardText).toContain('+27123456789');
    expect(cardText).toContain('admin');
    expect(avatar.nativeElement.src).toContain(mockUser.avatar);
    expect(avatar.nativeElement.alt).toBe('John Doe');
  });

  it('should use role-based banner and badge classes', () => {
    expect(component.bannerGradientClass).toContain('violet');
    expect(component.roleBadgeClass).toContain('violet');
  });

  it('should fall back to the default styles for unknown roles', () => {
    fixture.componentRef.setInput('user', { ...mockUser, role: 'unknown' });
    fixture.detectChanges();

    expect(component.bannerGradientClass).toContain('emerald');
    expect(component.roleBadgeClass).toContain('emerald');
  });

  it('should emit send email and edit profile actions', () => {
    const emitSpy = vi.spyOn(component.actionClick, 'emit');

    component.onSendEmail(createEvent());
    component.onEditProfile(createEvent());

    expect(emitSpy).toHaveBeenCalledWith({ userId: '1', actionType: 'sendEmail' });
    expect(emitSpy).toHaveBeenCalledWith({ userId: '1', actionType: 'editProfile' });
  });

  it('should toggle the menu and emit menu option clicks', () => {
    const emitSpy = vi.spyOn(component.actionClick, 'emit');

    component.toggleMenu(createEvent());
    fixture.detectChanges();
    expect(component.isMenuOpen()).toBe(true);

    component.onMenuOptionClick(menuOptions[0], createEvent());

    expect(component.isMenuOpen()).toBe(false);
    expect(emitSpy).toHaveBeenCalledWith({
      userId: '1',
      actionType: 'menuOption',
      menuOption: 'viewProfile',
    });
  });

  it('should close the menu from backdrop clicks and the escape key', () => {
    component.isMenuOpen.set(true);

    component.onBackdropClick(createEvent());
    expect(component.isMenuOpen()).toBe(false);

    component.isMenuOpen.set(true);
    component.onMenuKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.isMenuOpen()).toBe(false);
  });

  it('should emit the clicked user from the card', () => {
    const emitSpy = vi.spyOn(component.cardClick, 'emit');

    component.onCardClick();

    expect(emitSpy).toHaveBeenCalledWith(mockUser);
  });

  it('should hide optional actions when disabled', () => {
    fixture.componentRef.setInput('showSendEmail', false);
    fixture.componentRef.setInput('showEditProfile', false);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Email');
    expect(fixture.nativeElement.textContent).not.toContain('Edit');
  });

  it('should render the dropdown menu and backdrop while open', () => {
    component.isMenuOpen.set(true);
    fixture.detectChanges();

    const menu = fixture.debugElement.query(By.css('[role="menu"]'));
    const backdrop = fixture.debugElement.query(By.css('.fixed.inset-0.z-20'));
    const button = fixture.debugElement.query(By.css('button[aria-haspopup="true"]'));

    expect(menu).toBeTruthy();
    expect(backdrop).toBeTruthy();
    expect(button.nativeElement.getAttribute('aria-expanded')).toBe('true');
  });

  it('should render fallback bio text when email and phone are missing', () => {
    fixture.componentRef.setInput('user', {
      ...mockUser,
      email: undefined,
      phone: undefined,
      bio: 'Only bio visible',
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Only bio visible');
  });
});
