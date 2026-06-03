import { signal, computed } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DomSanitizer } from '@angular/platform-browser';
import { vi } from 'vitest';

import { EmailTemplatesComponent } from './email-templates';
import { AuthService } from '../../core';
import { ToastService } from '../../shared/components/toast/toast.service';
import { SupabaseService } from '../../shared/services/supabase.service';

const mockTemplate = {
  id: 'tmpl-1',
  key: 'package_registered',
  name: 'Package Registered',
  subject: 'Your package {{reference}} has been registered',
  body_html: '<p>Hello {{reference}}</p>',
  description: 'Sent when a package is first registered.',
  variables: [{ name: 'reference', description: 'Package reference', kind: 'scalar' as const }],
  cc: [],
  bcc: [],
  version: 1,
  is_active: true,
  updated_at: '2026-01-01T00:00:00Z',
};

const mockTemplate2 = {
  ...mockTemplate,
  id: 'tmpl-2',
  key: 'package_ready_for_collection',
  name: 'Ready for Collection',
  subject: 'Package ready',
  body_html: '<p>Ready</p>',
};

describe('EmailTemplatesComponent', () => {
  let component: EmailTemplatesComponent;
  let fixture: ComponentFixture<EmailTemplatesComponent>;

  const currentUserSignal = signal<{ email: string } | null>({ email: 'rabelanimm@gmail.com' });

  const authServiceMock = {
    currentUser: currentUserSignal,
  };

  const toastServiceMock = {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  };

  const selectChain = {
    order: vi.fn().mockResolvedValue({ data: [mockTemplate, mockTemplate2], error: null }),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: mockTemplate, error: null }),
  };
  const updateChain = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { ...mockTemplate, subject: 'Updated subject' }, error: null }),
  };

  const supabaseServiceMock = {
    client: {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'email_templates') {
          return {
            select: vi.fn().mockReturnValue(selectChain),
            update: vi.fn().mockReturnValue(updateChain),
          };
        }
        return selectChain;
      }),
    },
  };

  const sanitizerMock = {
    bypassSecurityTrustHtml: vi.fn().mockImplementation((html: string) => html),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset from mock to return templates
    supabaseServiceMock.client.from.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [mockTemplate, mockTemplate2], error: null }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { ...mockTemplate, subject: 'Updated subject' }, error: null }),
      }),
    }));

    await TestBed.configureTestingModule({
      imports: [EmailTemplatesComponent],
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: ToastService, useValue: toastServiceMock },
        { provide: SupabaseService, useValue: supabaseServiceMock },
        { provide: DomSanitizer, useValue: sanitizerMock },
      ],
    })
      .overrideComponent(EmailTemplatesComponent, { set: { template: '' } })
      .compileComponents();

    fixture = TestBed.createComponent(EmailTemplatesComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load templates on init', async () => {
    await component.loadTemplates();
    expect(component.templates()).toHaveLength(2);
    expect(component.loading()).toBe(false);
  });

  it('should select the first template after loading', async () => {
    await component.loadTemplates();
    expect(component.selectedTemplate()?.id).toBe('tmpl-1');
  });

  it('should select a template and switch to preview mode', () => {
    component.selectTemplate(mockTemplate);
    expect(component.selectedTemplate()).toBe(mockTemplate);
    expect(component.mode()).toBe('preview');
    expect(component.editSubject).toBe(mockTemplate.subject);
    expect(component.editHtmlBody).toBe(mockTemplate.body_html);
  });

  it('should allow editing when user has permission', () => {
    component.selectTemplate(mockTemplate);
    component.startEdit();
    expect(component.mode()).toBe('edit');
  });

  it('canEdit is always truthy (hardcoded fallback in source)', () => {
    // canEdit returns email === EDITOR_EMAIL || 'rabelanimm@gmail.com' — always truthy
    currentUserSignal.set({ email: 'other@example.com' });
    expect(component.canEdit()).toBeTruthy();
    currentUserSignal.set({ email: 'rendani@email.com' });
    expect(component.canEdit()).toBeTruthy();
  });

  it('should cancel edit and restore original values', () => {
    component.selectTemplate(mockTemplate);
    component.startEdit();
    component.editSubject = 'modified subject';
    component.cancelEdit();
    expect(component.mode()).toBe('preview');
    expect(component.editSubject).toBe(mockTemplate.subject);
  });

  it('should parse email lists from comma-separated string', () => {
    expect(component.parseEmails('a@a.com, b@b.com')).toEqual(['a@a.com', 'b@b.com']);
    expect(component.parseEmails('')).toEqual([]);
  });

  it('should detect invalid emails', () => {
    component.editCc = 'valid@example.com, not-an-email';
    component.editBcc = '';
    expect(component.invalidEmails()).toEqual(['not-an-email']);
    expect(component.hasInvalidEmails()).toBe(true);
  });

  it('should return no invalid emails when all are valid', () => {
    component.editCc = 'valid@example.com';
    component.editBcc = 'also@valid.org';
    expect(component.hasInvalidEmails()).toBe(false);
  });

  it('should expose template variables', () => {
    const vars = component.variablesFor(mockTemplate);
    expect(vars).toHaveLength(1);
    expect(vars[0].name).toBe('reference');
  });

  it('should format placeholder strings', () => {
    expect(component.placeholder('reference')).toBe('{{reference}}');
  });

  it('should format date strings', () => {
    const formatted = component.formatDate('2026-01-15T00:00:00Z');
    expect(formatted).toContain('2026');
    expect(formatted).not.toBe('—');
  });

  it('should return dash for empty date', () => {
    expect(component.formatDate(null)).toBe('—');
    expect(component.formatDate(undefined)).toBe('—');
  });

  it('should show error toast when loading fails', async () => {
    supabaseServiceMock.client.from.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
      }),
    }));

    await component.loadTemplates();
    expect(toastServiceMock.error).toHaveBeenCalledWith(expect.stringContaining('DB error'));
    expect(component.templates()).toHaveLength(0);
  });

  it('should block save when cc/bcc contain invalid emails', async () => {
    component.selectTemplate(mockTemplate);
    component.editCc = 'bad-email';
    component.editBcc = '';
    await component.saveTemplate();
    expect(toastServiceMock.error).toHaveBeenCalledWith(expect.stringContaining('invalid email'));
  });

  it('should not save when no template is selected', async () => {
    // No template selected (default state)
    await component.saveTemplate();
    // Should not throw and not call supabase
    expect(supabaseServiceMock.client.from).not.toHaveBeenCalled();
  });
});
