import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;
  let document: Document;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [ThemeService],
    });

    service = TestBed.inject(ThemeService);
    document = TestBed.inject(DOCUMENT);
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = '';
  });

  describe('Initial state', () => {
    it('should default to light theme when no stored preference', () => {
      expect(service.currentTheme()).toBe('light');
    });

    it('should default isDarkMode to false when no stored preference', () => {
      expect(service.isDarkMode()).toBe(false);
    });

    it('should initialize to dark theme when stored preference is dark', () => {
      localStorage.setItem('dark-mode', 'true');
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [ThemeService] });
      const darkService = TestBed.inject(ThemeService);
      expect(darkService.currentTheme()).toBe('dark');
      expect(darkService.isDarkMode()).toBe(true);
    });
  });

  describe('setTheme', () => {
    it('should update currentTheme signal to dark', () => {
      service.setTheme('dark');
      expect(service.currentTheme()).toBe('dark');
    });

    it('should update currentTheme signal to light', () => {
      service.setTheme('dark');
      service.setTheme('light');
      expect(service.currentTheme()).toBe('light');
    });

    it('should update isDarkMode signal to true when setting dark', () => {
      service.setTheme('dark');
      expect(service.isDarkMode()).toBe(true);
    });

    it('should update isDarkMode signal to false when setting light', () => {
      service.setTheme('dark');
      service.setTheme('light');
      expect(service.isDarkMode()).toBe(false);
    });

    it('should add dark class to html element when setting dark theme', () => {
      service.setTheme('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('should remove dark class from html element when setting light theme', () => {
      service.setTheme('dark');
      service.setTheme('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('should set colorScheme to dark on the html element', () => {
      service.setTheme('dark');
      expect(document.documentElement.style.colorScheme).toBe('dark');
    });

    it('should set colorScheme to light on the html element', () => {
      service.setTheme('light');
      expect(document.documentElement.style.colorScheme).toBe('light');
    });

    it('should persist dark theme to localStorage', () => {
      service.setTheme('dark');
      expect(localStorage.getItem('dark-mode')).toBe('true');
    });

    it('should persist light theme to localStorage', () => {
      service.setTheme('dark');
      service.setTheme('light');
      expect(localStorage.getItem('dark-mode')).toBe('false');
    });
  });

  describe('toggleTheme', () => {
    it('should switch from light to dark', () => {
      service.setTheme('light');
      service.toggleTheme();
      expect(service.currentTheme()).toBe('dark');
    });

    it('should switch from dark to light', () => {
      service.setTheme('dark');
      service.toggleTheme();
      expect(service.currentTheme()).toBe('light');
    });

    it('should add dark class when toggling from light', () => {
      service.setTheme('light');
      service.toggleTheme();
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('should remove dark class when toggling from dark', () => {
      service.setTheme('dark');
      service.toggleTheme();
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });

  describe('initializeTheme', () => {
    it('should apply light theme from storage when stored as false', () => {
      localStorage.setItem('dark-mode', 'false');
      service.initializeTheme();
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('should apply dark theme from storage when stored as true', () => {
      localStorage.setItem('dark-mode', 'true');
      service.initializeTheme();
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('should apply light theme when no preference is stored', () => {
      localStorage.clear();
      service.initializeTheme();
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });
});
