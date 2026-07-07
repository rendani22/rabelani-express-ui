import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { tablerCode, tablerDeviceFloppy, tablerEdit, tablerEye, tablerMail, tablerRefresh } from '@ng-icons/tabler-icons';
import { renderTemplate, AuthService } from '../../core';
import { LayoutComponent } from '../../shared/components/layout/layout.component';
import { ToastService } from '../../shared/components/toast';
import { SupabaseService } from '../../shared/services/supabase.service';
interface TemplateVariable {
  name: string;
  description: string;
  kind: 'scalar' | 'list';
}
interface EmailTemplate {
  id: string;
  key: string;
  name: string;
  subject: string;
  body_html: string;
  description?: string | null;
  variables?: TemplateVariable[] | null;
  cc?: string[] | null;
  bcc?: string[] | null;
  version?: number | null;
  is_active?: boolean | null;
  updated_at?: string | null;
}
const commonPreviewVars = {
  reference: 'PKG-20260504-71E9',
  po_number: 'GG80666810',
  support_email: 'rabelanimm@gmail.com',
  review_form_url: 'https://example.com/review',
  review_qr_code_url: 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=https://example.com/review',
  current_year: String(new Date().getFullYear()),
};
const collectionPreviewVars = {
  ...commonPreviewVars,
  items: [{ quantity: 2, description: 'Card Box' }],
  has_items: true,
  location_name: 'Exxaro Canteen, Exxaro Mine',
  location_address: 'Nelson Mandela Dr, Lephalale, 0555',
  location_maps_link: 'https://maps.google.com/?q=Exxaro+Canteen',
  collection_contact: 'Ext 4536 and ask for Lesedi or Thato',
  collection_hours_weekday: 'Monday to Friday, 7:00 AM - 16:00 PM',
  collection_hours_saturday: 'Saturdays: Closed',
  collection_hours_sunday: 'Sundays: Closed',
  collection_hours_holidays: 'Holidays: Closed',
};
const previewVarsByTemplate: Record<string, Record<string, unknown>> = {
  package_registered: {
    ...collectionPreviewVars,
    notes: '',
    items: [
      { quantity: 2, description: 'Card Box' },
      { quantity: 1, description: 'Bubble Wrap Roll' },
    ],
  },
  package_ready_for_collection: collectionPreviewVars,
  package_completed: { ...commonPreviewVars, items: [{ quantity: 2, description: 'Card Box' }], has_items: true },
  package_contents_updated: {
    ...commonPreviewVars,
    updated_items: [{ quantity: 2, description: 'Card Box' }],
    has_updated_items: true,
    previous_items: [{ quantity: 1, description: 'Card Box' }],
    has_previous_items: true,
  },
};
@Component({
  selector: 'app-email-templates',
  standalone: true,
  imports: [CommonModule, FormsModule, LayoutComponent, NgIcon],
  viewProviders: [provideIcons({ tablerCode, tablerDeviceFloppy, tablerEdit, tablerEye, tablerMail, tablerRefresh })],
  templateUrl: './email-templates.html',
  styleUrl: './email-templates.css',
})
export class EmailTemplatesComponent implements OnInit {
  private readonly supabaseService = inject(SupabaseService);
  private readonly toastService = inject(ToastService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly authService = inject(AuthService);

  /** Email of the only user allowed to edit email templates. */
  private static readonly EDITOR_EMAIL = 'rendani@email.com';

  /** Whether the current user is permitted to edit templates. */
  readonly canEdit = computed(() => {
    const email = this.authService.currentUser()?.email?.toLowerCase().trim();
    return email === EmailTemplatesComponent.EDITOR_EMAIL || 'rabelanimm@gmail.com';
  });

  readonly templates = signal<EmailTemplate[]>([]);
  readonly loading = signal(false);
  readonly selectedTemplate = signal<EmailTemplate | null>(null);
  readonly mode = signal<'preview' | 'edit'>('preview');
  readonly isSaving = signal(false);
  editSubject = '';
  editHtmlBody = '';
  editCc = '';
  editBcc = '';
  ngOnInit(): void {
    void this.loadTemplates();
  }
  async loadTemplates(): Promise<void> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabaseService.client
        .from('email_templates')
        .select('id, key, name, description, subject, body_html, variables, cc, bcc, version, is_active, updated_at')
        .order('name', { ascending: true });
      if (error) {
        this.toastService.error(`Failed to load templates: ${error.message}`);
        this.templates.set([]);
        return;
      }
      const templates = (data ?? []) as EmailTemplate[];
      this.templates.set(templates);
      if (!this.selectedTemplate() && templates.length > 0) this.selectTemplate(templates[0]);
    } catch {
      this.toastService.error('Failed to load email templates.');
      this.templates.set([]);
    } finally {
      this.loading.set(false);
    }
  }
  selectTemplate(template: EmailTemplate): void {
    this.selectedTemplate.set(template);
    this.mode.set('preview');
    this.editSubject = template.subject;
    this.editHtmlBody = template.body_html;
    this.editCc = (template.cc ?? []).join(', ');
    this.editBcc = (template.bcc ?? []).join(', ');
  }
  startEdit(): void {
    if (!this.canEdit()) {
      this.toastService.error('You do not have permission to edit email templates.');
      return;
    }
    this.mode.set('edit');
  }
  cancelEdit(): void {
    const template = this.selectedTemplate();
    if (!template) return;
    this.editSubject = template.subject;
    this.editHtmlBody = template.body_html;
    this.editCc = (template.cc ?? []).join(', ');
    this.editBcc = (template.bcc ?? []).join(', ');
    this.mode.set('preview');
  }
  async saveTemplate(): Promise<void> {
    const template = this.selectedTemplate();
    if (!template) return;
    if (!this.canEdit()) {
      this.toastService.error('You do not have permission to edit email templates.');
      return;
    }
    if (this.hasInvalidEmails()) {
      const invalids = this.invalidEmails().join(', ');
      this.toastService.error(`Cannot save: invalid email address(es): ${invalids}`);
      return;
    }
    this.isSaving.set(true);
    try {
      const { data, error } = await this.supabaseService.client
        .from('email_templates')
        .update({ subject: this.editSubject, body_html: this.editHtmlBody, cc: this.editCc ? this.editCc.split(',').map(s => s.trim()).filter(Boolean) : [], bcc: this.editBcc ? this.editBcc.split(',').map(s => s.trim()).filter(Boolean) : [] })
        .eq('id', template.id)
        .select('id, key, name, description, subject, body_html, variables, cc, bcc, version, is_active, updated_at')
        .single();
      if (error) {
        this.toastService.error(`Save failed: ${error.message}`);
        return;
      }
      const updated = data as EmailTemplate;
      this.templates.update(list => list.map(item => item.id === updated.id ? updated : item));
      this.selectedTemplate.set(updated);
      this.editSubject = updated.subject;
      this.editHtmlBody = updated.body_html;
      this.mode.set('preview');
      this.toastService.success(`Template "${updated.name}" saved.`);
    } catch {
      this.toastService.error('Failed to save template.');
    } finally {
      this.isSaving.set(false);
    }
  }
  private readonly EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  parseEmails(input: string): string[] {
    if (!input) return []
    return input.split(',').map(s => s.trim()).filter(Boolean)
  }

  invalidEmails(input?: string): string[] {
    const ccList = this.parseEmails(input ?? this.editCc)
    const bccList = this.parseEmails(input ?? this.editBcc)
    // If input arg provided, treat it as a single list; otherwise combine both
    const list = input !== undefined ? this.parseEmails(input) : [...ccList, ...bccList]
    return list.filter(e => !this.EMAIL_RE.test(e))
  }

  hasInvalidEmails(): boolean {
    return this.invalidEmails().length > 0
  }
  previewSubject = computed((): string => {
    const template = this.selectedTemplate();
    if (!template) return '';
    return renderTemplate(this.mode() === 'edit' ? this.editSubject : template.subject, this.previewVars(template));
  });
  previewHtml = computed((): SafeHtml => {
    const template = this.selectedTemplate();
    if (!template) return '';
    const source = this.mode() === 'edit' ? this.editHtmlBody : template.body_html;
    return this.sanitizer.bypassSecurityTrustHtml(renderTemplate(source, this.previewVars(template)));
  });
  variablesFor(template: EmailTemplate): TemplateVariable[] {
    return template.variables ?? [];
  }
  placeholder(name: string): string {
    return `{{${name}}}`;
  }
  formatDate(dateString: string | null | undefined): string {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  private previewVars(template: EmailTemplate): Record<string, unknown> {
    return previewVarsByTemplate[template.key] ?? commonPreviewVars;
  }
}
