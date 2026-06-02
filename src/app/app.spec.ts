import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    expect(app).toBeTruthy();
  });

  it('should expose the app title signal', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    expect(app['title']()).toBe('rabelani-express-ui');
  });

  it('should render the global shell containers', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('router-outlet'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('app-toast-container'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('app-notification-container'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('app-banner-container'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('app-global-search'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('app-confirm-dialog-host'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('app-onboarding-tour'))).toBeTruthy();
  });
});
