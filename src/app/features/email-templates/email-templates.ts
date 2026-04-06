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
    subject: 'Package {{reference}} is ready for collection',
    description: 'Sent when a package arrives at the collection point.',
    html_body: `<h2>Hello,</h2>
<p>Your package <strong>{{reference}}</strong> is now ready for collection.</p>
<p>Please visit the collection point with your employee ID.</p>
<p>Thank you,<br/>Rabelani Express</p>`,
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

  /** Rendered preview with placeholder substitutions for display */
  previewHtml = computed(() => {
    const t = this.selectedTemplate();
    if (!t) return '';
    return t.html_body
      .replace(/\{\{reference\}\}/g, 'PKG-001234')
      .replace(/\{\{name\}\}/g, 'John Doe');
  });

  formatDate(dateString: string | undefined): string {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  }
}
