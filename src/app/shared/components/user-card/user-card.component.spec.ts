import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DebugElement } from '@angular/core';
import { By } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { vi } from 'vitest';
import { UserCardComponent } from './user-card.component';
import { User, UserCardAction } from './user-card.interface';

describe('UserCardComponent', () => {
  let component: UserCardComponent;
  let fixture: ComponentFixture<UserCardComponent>;
  let debugElement: DebugElement;

  const mockUser: User = {
    id: '1',
    name: 'John Doe',
    avatar: 'images/user-64-01.jpg',
    country: 'United States',
    countryFlag: '🇺🇸',
    bio: 'Software Engineer, Tech Enthusiast'
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserCardComponent, BrowserAnimationsModule]
    }).compileComponents();

    fixture = TestBed.createComponent(UserCardComponent);
    component = fixture.componentInstance;
    debugElement = fixture.debugElement;
    component.user = mockUser;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('User Information Display', () => {
    it('should display user name', () => {
      const nameElement = debugElement.query(By.css('.user-card__name'));
      expect(nameElement.nativeElement.textContent).toBe(mockUser.name);
    });

    it('should display user avatar', () => {
      const avatarElement = debugElement.query(By.css('.user-card__avatar'));
      expect(avatarElement.nativeElement.src).toContain(mockUser.avatar);
      expect(avatarElement.nativeElement.alt).toBe(mockUser.name);
    });

    it('should display user bio', () => {
      const bioElement = debugElement.query(By.css('.user-card__bio-text'));
      expect(bioElement.nativeElement.textContent).toBe(mockUser.bio);
    });

    it('should display country flag', () => {
      const flagElement = debugElement.query(By.css('.user-card__country-flag'));
      expect(flagElement.nativeElement.textContent).toBe(mockUser.countryFlag);
    });


    it('should not display bio when bio is empty', () => {
      component.user = { ...mockUser, bio: '' };
      fixture.detectChanges();
      const bioElement = debugElement.query(By.css('.user-card__bio'));
      expect(bioElement).toBeFalsy();
    });
  });

  describe('Menu Functionality', () => {
    it('should toggle menu when menu button is clicked', () => {
      const menuButton = debugElement.query(By.css('.user-card__menu-button'));
      expect(component.isMenuOpen).toBe(false);

      menuButton.nativeElement.click();
      expect(component.isMenuOpen).toBe(true);

      menuButton.nativeElement.click();
      expect(component.isMenuOpen).toBe(false);
    });

    it('should display menu options when menu is open', () => {
      component.isMenuOpen = true;
      fixture.detectChanges();

      const menuItems = debugElement.queryAll(By.css('.user-card__dropdown-item'));
      expect(menuItems.length).toBe(component.menuOptions.length);
    });

    it('should close menu when closeMenu is called', () => {
      component.isMenuOpen = true;
      component.closeMenu();
      expect(component.isMenuOpen).toBe(false);
    });

    it('should emit action event when menu option is clicked', () => {
      vi.spyOn(component.actionClick, 'emit');
      const mockOption = component.menuOptions[0];
      const mockEvent = new Event('click');

      component.onMenuOptionClick(mockOption, mockEvent);

      expect(component.actionClick.emit).toHaveBeenCalledWith({
        userId: mockUser.id,
        actionType: 'menuOption',
        menuOption: mockOption.action
      });
    });

    it('should close menu when Escape key is pressed', () => {
      component.isMenuOpen = true;
      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });

      component.onMenuKeydown(escapeEvent);

      expect(component.isMenuOpen).toBe(false);
    });
  });

  describe('Action Buttons', () => {
    it('should display send email button when showSendEmail is true', () => {
      component.showSendEmail = true;
      fixture.detectChanges();

      const sendEmailButton = debugElement.query(By.css('.user-card__action--primary'));
      expect(sendEmailButton).toBeTruthy();
    });

    it('should not display send email button when showSendEmail is false', () => {
      component.showSendEmail = false;
      fixture.detectChanges();

      const sendEmailButton = debugElement.query(By.css('.user-card__action--primary'));
      expect(sendEmailButton).toBeFalsy();
    });

    it('should emit sendEmail action when send email button is clicked', () => {
      vi.spyOn(component.actionClick, 'emit');
      const mockEvent = new Event('click');

      component.onSendEmail(mockEvent);

      expect(component.actionClick.emit).toHaveBeenCalledWith({
        userId: mockUser.id,
        actionType: 'sendEmail'
      });
    });

    it('should display edit profile button when showEditProfile is true', () => {
      component.showEditProfile = true;
      fixture.detectChanges();

      const editButton = debugElement.query(By.css('.user-card__action--secondary'));
      expect(editButton).toBeTruthy();
    });

    it('should emit editProfile action when edit profile button is clicked', () => {
      vi.spyOn(component.actionClick, 'emit');
      const mockEvent = new Event('click');

      component.onEditProfile(mockEvent);

      expect(component.actionClick.emit).toHaveBeenCalledWith({
        userId: mockUser.id,
        actionType: 'editProfile'
      });
    });
  });

  describe('Card Click', () => {
    it('should emit cardClick event when card is clicked', () => {
      vi.spyOn(component.cardClick, 'emit');

      component.onCardClick();

      expect(component.cardClick.emit).toHaveBeenCalledWith(mockUser);
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels for menu button', () => {
      const menuButton = debugElement.query(By.css('.user-card__menu-button'));
      expect(menuButton.nativeElement.getAttribute('aria-haspopup')).toBe('true');
      expect(menuButton.nativeElement.getAttribute('aria-expanded')).toBe('false');
    });

    it('should update aria-expanded when menu is opened', () => {
      component.isMenuOpen = true;
      fixture.detectChanges();

      const menuButton = debugElement.query(By.css('.user-card__menu-button'));
      expect(menuButton.nativeElement.getAttribute('aria-expanded')).toBe('true');
    });

    it('should have proper alt text for avatar', () => {
      const avatar = debugElement.query(By.css('.user-card__avatar'));
      expect(avatar.nativeElement.alt).toBe(mockUser.name);
    });

    it('should have aria-label for country flag', () => {
      const flag = debugElement.query(By.css('.user-card__country-flag'));
      expect(flag.nativeElement.getAttribute('aria-label')).toBe(mockUser.country);
    });
  });

  describe('TrackBy Function', () => {
    it('should return action for trackByAction', () => {
      const option = component.menuOptions[0];
      const result = component.trackByAction(0, option);
      expect(result).toBe(option.action);
    });
  });
});

