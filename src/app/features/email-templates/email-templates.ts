import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  tablerMail,
  tablerEdit,
  tablerDeviceFloppy,
  tablerEye,
  tablerCode,
  tablerRefresh,
} from '@ng-icons/tabler-icons';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { LayoutComponent } from '../../shared/components/layout/layout.component';
import { ToastService } from '../../shared/components/toast/toast.service';
import { SupabaseService } from '../../shared/services/supabase.service';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  html_body: string;
  description?: string;
  updated_at?: string;
}

/** Default built-in templates shown when none are stored in the database */
const DEFAULT_TEMPLATES: EmailTemplate[] = [
  {
    id: 'package-created',
    name: 'Package Created',
    subject: 'Your package {{reference}} has been registered',
    description: 'Sent when a new package is created for a receiver.',
    html_body: `<h2>Hello,</h2>
<p>Your package has been registered in our system.</p>
<p><strong>Reference:</strong> {{reference}}</p>
<p>We will notify you when it is ready for collection.</p>
<p>Thank you,<br/>Rabelani Express</p>`,
  },
  {
    id: 'package-ready',
    name: 'Ready for Collection',
    subject: 'Ready for Collection — PO: {{po_number}} — Ref: {{reference}}',
    description: 'Sent when a package arrives at the collection point.',
    html_body: `<div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5; max-width: 640px;">
  <h2 style="margin: 0 0 4px 0;">Ready for Collection</h2>
  <p style="margin: 0;"><strong>Purchase Order Number:</strong> {{po_number}}</p>
  <p style="margin: 0 0 16px 0;"><strong>Your Package Reference:</strong> {{reference}}</p>

  <h3 style="margin: 16px 0 8px 0;">Package Ready for Collection</h3>
  <p>Hello,</p>
  <p>Great news! A package has been registered for you and is ready for collection. Please collect it at the Collection Point.</p>

  <h4 style="margin: 16px 0 8px 0;">Package Contents</h4>
  <table style="border-collapse: collapse; width: 100%; max-width: 480px;">
    <thead>
      <tr style="background: #f3f4f6;">
        <th style="text-align: left; padding: 8px; border: 1px solid #e5e7eb;">Qty</th>
        <th style="text-align: left; padding: 8px; border: 1px solid #e5e7eb;">Description</th>
      </tr>
    </thead>
    <tbody>
      {{items_rows}}
    </tbody>
  </table>

  <h4 style="margin: 16px 0 8px 0;">Delivery Point</h4>
  <p style="margin: 0;">Exxaro Canteen, Exxaro Mine, Nelson Mandela Dr, Lephalale, 0555</p>
  <p style="margin: 0;"><strong>Contact Number:</strong> Ext 4536 and ask for Lesedi or Thato</p>

  <p style="margin: 12px 0 4px 0;"><strong>Collection Hours:</strong></p>
  <ul style="margin: 0 0 12px 20px; padding: 0;">
    <li>Monday to Friday, 7:00 AM - 16:00 PM</li>
    <li>Saturdays: Closed</li>
    <li>Sundays: Closed</li>
    <li>Holidays: Closed</li>
  </ul>

  <p style="margin: 12px 0 4px 0;"><strong>What to bring when collecting:</strong></p>
  <ul style="margin: 0 0 12px 20px; padding: 0;">
    <li>Your PO reference number (shown above)</li>
    <li>Valid Staff Employee Card for verification and a Witness to sign with</li>
  </ul>

  <p>Questions? Contact us at <a href="mailto:rabelanimm@gmail.com">rabelanimm@gmail.com</a></p>

  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
  <p style="font-size: 12px; color: #6b7280; margin: 0;">This is an automated message from the POD System. Please do not reply directly to this email.</p>
  <p style="margin-top: 16px; font-weight: bold;">PLEASE REVIEW OUR SERVICES</p>
</div>`,
  },
  {
    id: 'package-collected',
    name: 'Package Collected',
    subject: 'Package {{reference}} has been collected',
    description: 'Sent as confirmation after a package is collected.',
    html_body: `<h2>Hello,</h2>
<p>Your package <strong>{{reference}}</strong> has been marked as collected.</p>
<p>If you did not collect this package, please contact us immediately.</p>
<p>Thank you,<br/>Rabelani Express</p>`,
  },
];

/**
 * Email Template Preview/Editor page.
 *
 * Lists email templates (fetched from the email_templates Supabase table,
 * or defaulting to built-in templates) and allows previewing and editing.
 */
@Component({
  selector: 'app-email-templates',
  standalone: true,
  imports: [CommonModule, FormsModule, LayoutComponent, NgIcon],
  viewProviders: [
    provideIcons({
      tablerMail,
      tablerEdit,
      tablerDeviceFloppy,
      tablerEye,
      tablerCode,
      tablerRefresh,
    }),
  ],
  templateUrl: './email-templates.html',
  styleUrl: './email-templates.css',
})
export class EmailTemplatesComponent implements OnInit {
  private readonly supabaseService = inject(SupabaseService);
  private readonly toastService = inject(ToastService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly templates = signal<EmailTemplate[]>([]);
  readonly loading = signal(false);
  readonly selectedTemplate = signal<EmailTemplate | null>(null);
  readonly mode = signal<'preview' | 'edit'>('preview');
  readonly isSaving = signal(false);

  // Edit buffer
  editSubject = '';
  editHtmlBody = '';

  ngOnInit(): void {
    void this.loadTemplates();
  }

  async loadTemplates(): Promise<void> {
    this.loading.set(true);
    try {
      const { data } = await this.supabaseService.client
        .from('email_templates')
        .select('*')
        .order('name', { ascending: true });

      this.templates.set(data && data.length > 0 ? (data as EmailTemplate[]) : DEFAULT_TEMPLATES);
    } catch {
      this.templates.set(DEFAULT_TEMPLATES);
    } finally {
      this.loading.set(false);
    }
  }

  selectTemplate(tmpl: EmailTemplate): void {
    this.selectedTemplate.set(tmpl);
    this.mode.set('preview');
    this.editSubject = tmpl.subject;
    this.editHtmlBody = tmpl.html_body;
  }

  startEdit(): void {
    this.mode.set('edit');
  }

  cancelEdit(): void {
    const t = this.selectedTemplate();
    if (t) {
      this.editSubject = t.subject;
      this.editHtmlBody = t.html_body;
    }
    this.mode.set('preview');
  }

  async saveTemplate(): Promise<void> {
    const t = this.selectedTemplate();
    if (!t) return;

    this.isSaving.set(true);
    try {
      const updated: EmailTemplate = {
        ...t,
        subject: this.editSubject,
        html_body: this.editHtmlBody,
        updated_at: new Date().toISOString(),
      };

      // Attempt to upsert into the email_templates table.
      // If the table doesn't exist it will throw – handled below.
      const { error } = await this.supabaseService.client
        .from('email_templates')
        .upsert(updated, { onConflict: 'id' });

      if (error) {
        this.toastService.warning('Could not persist to database; changes saved locally only.');
      } else {
        this.toastService.success(`Template "${t.name}" saved successfully!`);
      }

      // Update in-memory list
      this.templates.update(list =>
        list.map(item => item.id === updated.id ? updated : item)
      );
      this.selectedTemplate.set(updated);
      this.mode.set('preview');
    } catch {
      this.toastService.error('Failed to save template.');
    } finally {
      this.isSaving.set(false);
    }
  }

  /** Rendered preview with placeholder substitutions for display, sanitized for safe binding */
  previewHtml = computed((): SafeHtml => {
    const t = this.selectedTemplate();
    if (!t) return '';
    const sampleItemsRows = `
      <tr>
        <td style="padding: 8px; border: 1px solid #e5e7eb;">1</td>
        <td style="padding: 8px; border: 1px solid #e5e7eb;">Card Box</td>
      </tr>`;
    const html = t.html_body
      .replace(/\{\{reference\}\}/g, 'PKG-20260504-71E9')
      .replace(/\{\{po_number\}\}/g, 'GG80666810')
      .replace(/\{\{items_rows\}\}/g, sampleItemsRows)
      .replace(/\{\{name\}\}/g, 'John Doe');
    return this.sanitizer.bypassSecurityTrustHtml(html);
  });

  formatDate(dateString: string | undefined): string {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  }
}
