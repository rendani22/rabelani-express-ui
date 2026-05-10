-- email_templates table + RLS + seed
--
-- Stores the branded HTML emails sent by the create-package and
-- update-package edge functions. Admins can edit subject/body_html via the
-- Email Templates page; edge functions load by `key` at send time and fall
-- back to in-code HTML if the row is missing.
--
-- Placeholder syntax (mustache-flavoured, implemented by
-- supabase/functions/_shared/email-templates.ts):
--   {{var}}            HTML-escaped scalar
--   {{{var}}}          raw scalar (no escape)
--   {{#var}}…{{/var}}  section: iterates arrays, renders once if truthy
--   {{^var}}…{{/var}}  inverted section: renders if falsy/empty

SET search_path = public;

CREATE TABLE IF NOT EXISTS public.email_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text,
  subject     text NOT NULL,
  body_html   text NOT NULL,
  variables   jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active   boolean NOT NULL DEFAULT true,
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- Read: any active staff member can list templates (powers the admin page).
DROP POLICY IF EXISTS "email_templates_read_staff" ON public.email_templates;
CREATE POLICY "email_templates_read_staff"
  ON public.email_templates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.user_id = auth.uid() AND sp.is_active
    )
  );

-- Write: admins only (UPDATE). Edge functions use the service role and bypass RLS.
DROP POLICY IF EXISTS "email_templates_update_admin" ON public.email_templates;
CREATE POLICY "email_templates_update_admin"
  ON public.email_templates
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.user_id = auth.uid() AND sp.role = 'admin' AND sp.is_active
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.user_id = auth.uid() AND sp.role = 'admin' AND sp.is_active
    )
  );

-- Bump updated_at + version on every UPDATE
CREATE OR REPLACE FUNCTION public.bump_email_template_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  IF (TG_OP = 'UPDATE') AND (
       NEW.subject IS DISTINCT FROM OLD.subject
    OR NEW.body_html IS DISTINCT FROM OLD.body_html
  ) THEN
    NEW.version := COALESCE(OLD.version, 1) + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS email_templates_bump_version ON public.email_templates;
CREATE TRIGGER email_templates_bump_version
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_email_template_version();

-- ---------------------------------------------------------------------------
-- Seed: the four templates currently inlined in create-package / update-package.
-- HTML is verbatim except for the substitutions described above.
-- Use dollar-quoted strings so the embedded apostrophes need no escaping.
-- ON CONFLICT keeps re-running migrations idempotent without clobbering edits;
-- to force-resync run `UPDATE … SET body_html = …` manually or bump the
-- migration timestamp on a new file.
-- ---------------------------------------------------------------------------

INSERT INTO public.email_templates (key, name, description, subject, body_html, variables)
VALUES
(
  'package_registered',
  'Package Registered (Purchase Order Confirmation)',
  'Sent by create-package after a new package is registered for a receiver.',
  $sub$Purchase Order Confirmation{{#po_number}} - {{po_number}}{{/po_number}} - {{reference}}$sub$,
  $tpl$
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
              </head>
              <body style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #242424; background: #ffffff;">
                <!-- Brand bar -->
                <div style="background: #ffffff; padding: 24px 24px 16px 24px; border: 1px solid #ededed; border-bottom: 4px solid #f75757; border-radius: 8px 8px 0 0; text-align: center;">
                  <a href="https://www.rabelanimm.co.za/" style="text-decoration: none; display: inline-block;">
                    <img src="https://www.rabelanimm.co.za/images/logo.png" alt="Rabelani MM Trading Enterprise" style="max-height: 70px; height: auto; width: auto; display: block; margin: 0 auto;" />
                  </a>
                  <p style="margin: 12px 0 0 0; font-size: 12px; color: #919194; letter-spacing: 0.08em; text-transform: uppercase;">Rabelani MM Trading Enterprise</p>
                </div>

                <!-- Title block -->
                <div style="background: #f75757; padding: 28px 24px; text-align: center;">
                  <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.01em;">Purchase Order Confirmation</h1>
                  {{#po_number}}<p style="color: #ffe7e7; margin: 14px 0 0 0; font-size: 15px;">Purchase Order Number: <strong style="font-family: 'Courier New', monospace; color: #ffffff;">{{po_number}}</strong></p>{{/po_number}}
                  <p style="color: #ffe7e7; margin: 6px 0 0 0; font-size: 15px;">Your Package Reference: <strong style="font-family: 'Courier New', monospace; color: #ffffff;">{{reference}}</strong></p>
                </div>

                <div style="background: #ffffff; padding: 30px 28px; border: 1px solid #ededed; border-top: none;">
                  <h2 style="color: #242424; font-size: 20px; margin: 0 0 15px 0; font-weight: 700;">📦 Package Being Prepared</h2>
                  <p style="margin: 0 0 12px 0; color: #4e595f;">Hello,</p>
                  <p style="margin: 0 0 20px 0; color: #4e595f; line-height: 1.6;">Great news! A package has been registered for you and is currently being prepared for delivery.</p>

                  {{#notes}}
                  <div style="background: #fff8f8; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #b99769;">
                    <p style="margin: 0; font-size: 14px; color: #242424;"><strong>📝 Notes:</strong> {{notes}}</p>
                  </div>
                  {{/notes}}

                  {{#has_items}}
                  <div style="margin: 24px 0;">
                    <h3 style="color: #242424; font-size: 16px; margin: 0 0 12px 0; font-weight: 700;">📋 Package Contents</h3>
                    <table style="width: 100%; border-collapse: collapse; border: 1px solid #ededed; border-radius: 6px; overflow: hidden;">
                      <thead>
                        <tr style="background: #fafafa;">
                          <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ededed; font-size: 12px; color: #919194; text-transform: uppercase; letter-spacing: 0.05em; width: 60px;">Qty</th>
                          <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ededed; font-size: 12px; color: #919194; text-transform: uppercase; letter-spacing: 0.05em;">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {{#items}}
                        <tr>
                          <td style="padding: 12px; border-bottom: 1px solid #ededed; font-size: 14px; color: #242424; font-weight: 600;">{{quantity}}</td>
                          <td style="padding: 12px; border-bottom: 1px solid #ededed; font-size: 14px; color: #4e595f;">{{description}}</td>
                        </tr>
                        {{/items}}
                      </tbody>
                    </table>
                  </div>
                  {{/has_items}}

                  <h3 style="color: #242424; font-size: 16px; margin: 30px 0 10px 0; font-weight: 700;">📍 Delivery Point</h3>
                  <div style="background: #fafafa; padding: 20px; border-radius: 6px; margin: 10px 0 20px 0; border-left: 4px solid #f75757;">
                    <p style="font-size: 16px; font-weight: 700; color: #242424; margin: 0;">{{location_name}}</p>
                    {{#location_address}}<p style="font-size: 14px; color: #4e595f; margin: 8px 0 0 0; line-height: 1.5;">{{location_address}}</p>{{/location_address}}
                    <p style="font-size: 14px; color: #4e595f; margin: 10px 0 0 0;"><strong style="color: #242424;">Contact Number:</strong> {{collection_contact}}</p>
                    {{#location_maps_link}}<p style="margin: 12px 0 0 0;"><a href="{{location_maps_link}}" style="color: #f75757; font-size: 14px; text-decoration: none; font-weight: 600;">📍 View on Google Maps</a></p>{{/location_maps_link}}
                  </div>

                  <div style="margin: 24px 0;">
                    <p style="margin: 0 0 8px 0; font-size: 14px; color: #242424;"><strong>Collection Hours:</strong></p>
                    <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #4e595f; line-height: 1.7;">
                      <li>{{collection_hours_weekday}}</li>
                      <li>{{collection_hours_saturday}}</li>
                      <li>{{collection_hours_sunday}}</li>
                      <li>{{collection_hours_holidays}}</li>
                    </ul>
                  </div>

                  <div style="background: #fff8f8; padding: 20px; border-radius: 6px; margin: 24px 0; border-left: 4px solid #c54041;">
                    <h3 style="color: #c54041; font-size: 16px; margin: 0 0 10px 0; font-weight: 700;">⏳ What happens next?</h3>
                    <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #4e595f; line-height: 1.7;">
                      <li style="margin-bottom: 6px;">Your package is being prepared at our warehouse</li>
                      <li style="margin-bottom: 6px;">You will receive an email when your package is on its way</li>
                      <li>Once it arrives at the collection point, you will get a final notification that it is ready for pickup</li>
                    </ul>
                  </div>

                  <div style="background: #fafafa; padding: 18px; border-radius: 6px; margin: 24px 0;">
                    <p style="margin: 0 0 8px 0; font-size: 14px; color: #242424;"><strong>What to bring when collecting:</strong></p>
                    <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #4e595f; line-height: 1.7;">
                      <li>Your PO reference number (shown above)</li>
                      <li>Valid Staff Employee Card for verification and a Witness to Sign with</li>
                    </ul>
                  </div>
                </div>

                <!-- Footer -->
                <div style="background: #242424; padding: 28px 24px; border-radius: 0 0 8px 8px; text-align: center;">
                  <p style="margin: 0 0 12px 0; font-size: 14px; color: #c9c9c9;">
                    Questions? Contact us at <a href="mailto:{{support_email}}" style="color: #f75757; text-decoration: none; font-weight: 600;">{{support_email}}</a>
                  </p>
                  <p style="margin: 0 0 18px 0; font-size: 11px; color: #919194; line-height: 1.5;">
                    This is an automated message from the POD System. Please do not reply directly to this email.
                  </p>
                  <div style="background: #ffffff; display: inline-block; padding: 14px; border-radius: 8px; margin: 0 0 14px 0;">
                    <img src="{{review_qr_code_url}}" alt="Scan to review our services" width="160" height="160" style="display: block; width: 160px; height: 160px;" />
                  </div>
                  <p style="margin: 0 0 14px 0; font-size: 12px; color: #c9c9c9; letter-spacing: 0.04em;">
                    Scan the QR code to review our services
                  </p>
                  <a href="{{review_form_url}}" style="display: inline-block; padding: 12px 28px; background: #f75757; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; border-radius: 50px;">
                    Please Review Our Services
                  </a>
                  <p style="margin: 18px 0 0 0; font-size: 11px; color: #666666;">
                    &copy; {{current_year}} Rabelani MM Trading Enterprise &middot; <a href="https://www.rabelanimm.co.za/" style="color: #919194; text-decoration: none;">www.rabelanimm.co.za</a>
                  </p>
                </div>
              </body>
              </html>
$tpl$,
  $vars$[
    {"name":"reference","kind":"scalar","description":"Package reference (e.g. PKG-20260504-71E9)"},
    {"name":"po_number","kind":"scalar","description":"Purchase order number (optional)"},
    {"name":"notes","kind":"scalar","description":"Free-text notes added when registering the package (optional)"},
    {"name":"items","kind":"list","description":"Package items: array of {quantity, description}"},
    {"name":"has_items","kind":"scalar","description":"Boolean — true when items list is non-empty"},
    {"name":"location_name","kind":"scalar","description":"Delivery point name"},
    {"name":"location_address","kind":"scalar","description":"Delivery point street address (optional)"},
    {"name":"location_maps_link","kind":"scalar","description":"Google Maps URL for the delivery point (optional)"},
    {"name":"collection_contact","kind":"scalar","description":"Phone / extension to call when collecting"},
    {"name":"collection_hours_weekday","kind":"scalar","description":"Weekday collection hours line"},
    {"name":"collection_hours_saturday","kind":"scalar","description":"Saturday collection hours line"},
    {"name":"collection_hours_sunday","kind":"scalar","description":"Sunday collection hours line"},
    {"name":"collection_hours_holidays","kind":"scalar","description":"Public holiday collection hours line"},
    {"name":"support_email","kind":"scalar","description":"Support / questions inbox shown in the footer"},
    {"name":"review_form_url","kind":"scalar","description":"URL to the review form"},
    {"name":"review_qr_code_url","kind":"scalar","description":"QR code image URL pointing to the review form"},
    {"name":"current_year","kind":"scalar","description":"Current year (footer copyright)"}
  ]$vars$::jsonb
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.email_templates (key, name, description, subject, body_html, variables)
VALUES
(
  'package_ready_for_collection',
  'Ready for Collection',
  'Sent by update-package when a package transitions to ready_for_collection.',
  $sub$Ready for Collection{{#po_number}} - {{po_number}}{{/po_number}} - {{reference}}$sub$,
  $tpl$
                <!DOCTYPE html>
                <html>
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                </head>
                <body style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #242424; background: #ffffff;">
                  <!-- Brand bar -->
                  <div style="background: #ffffff; padding: 24px 24px 16px 24px; border: 1px solid #ededed; border-bottom: 4px solid #f75757; border-radius: 8px 8px 0 0; text-align: center;">
                    <a href="https://www.rabelanimm.co.za/" style="text-decoration: none; display: inline-block;">
                      <img src="https://www.rabelanimm.co.za/images/logo.png" alt="Rabelani MM Trading Enterprise" style="max-height: 70px; height: auto; width: auto; display: block; margin: 0 auto;" />
                    </a>
                    <p style="margin: 12px 0 0 0; font-size: 12px; color: #919194; letter-spacing: 0.08em; text-transform: uppercase;">Rabelani MM Trading Enterprise</p>
                  </div>

                  <!-- Title block -->
                  <div style="background: #f75757; padding: 28px 24px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.01em;">Ready for Collection</h1>
                    {{#po_number}}<p style="color: #ffe7e7; margin: 14px 0 0 0; font-size: 15px;">Purchase Order Number: <strong style="font-family: 'Courier New', monospace; color: #ffffff;">{{po_number}}</strong></p>{{/po_number}}
                    <p style="color: #ffe7e7; margin: 6px 0 0 0; font-size: 15px;">Your Package Reference: <strong style="font-family: 'Courier New', monospace; color: #ffffff;">{{reference}}</strong></p>
                  </div>

                  <div style="background: #ffffff; padding: 30px 28px; border: 1px solid #ededed; border-top: none;">
                    <h2 style="color: #242424; font-size: 20px; margin: 0 0 15px 0; font-weight: 700;">📦 Package Ready for Collection</h2>
                    <p style="margin: 0 0 12px 0; color: #4e595f;">Hello,</p>
                    <p style="margin: 0 0 20px 0; color: #4e595f; line-height: 1.6;">Great news! A package has been registered for you and is ready for collection. Please collect it at the Collection Point.</p>

                    {{#has_items}}
                    <div style="margin: 24px 0;">
                      <h3 style="color: #242424; font-size: 16px; margin: 0 0 12px 0; font-weight: 700;">📋 Package Contents</h3>
                      <table style="width: 100%; border-collapse: collapse; border: 1px solid #ededed; border-radius: 6px; overflow: hidden;">
                        <thead>
                          <tr style="background: #fafafa;">
                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ededed; font-size: 12px; color: #919194; text-transform: uppercase; letter-spacing: 0.05em; width: 60px;">Qty</th>
                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ededed; font-size: 12px; color: #919194; text-transform: uppercase; letter-spacing: 0.05em;">Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {{#items}}
                          <tr>
                            <td style="padding: 12px; border-bottom: 1px solid #ededed; font-size: 14px; color: #242424; font-weight: 600;">{{quantity}}</td>
                            <td style="padding: 12px; border-bottom: 1px solid #ededed; font-size: 14px; color: #4e595f;">{{description}}</td>
                          </tr>
                          {{/items}}
                        </tbody>
                      </table>
                    </div>
                    {{/has_items}}

                    <h3 style="color: #242424; font-size: 16px; margin: 30px 0 10px 0; font-weight: 700;">📍 Delivery Point</h3>
                    <div style="background: #fafafa; padding: 20px; border-radius: 6px; margin: 10px 0 20px 0; border-left: 4px solid #f75757;">
                      <p style="font-size: 16px; font-weight: 700; color: #242424; margin: 0;">{{location_name}}</p>
                      {{#location_address}}<p style="font-size: 14px; color: #4e595f; margin: 8px 0 0 0; line-height: 1.5;">{{location_address}}</p>{{/location_address}}
                      <p style="font-size: 14px; color: #4e595f; margin: 10px 0 0 0;"><strong style="color: #242424;">Contact Number:</strong> {{collection_contact}}</p>
                      {{#location_maps_link}}<p style="margin: 12px 0 0 0;"><a href="{{location_maps_link}}" style="color: #f75757; font-size: 14px; text-decoration: none; font-weight: 600;">📍 View on Google Maps</a></p>{{/location_maps_link}}
                    </div>

                    <div style="margin: 24px 0;">
                      <p style="margin: 0 0 8px 0; font-size: 14px; color: #242424;"><strong>Collection Hours:</strong></p>
                      <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #4e595f; line-height: 1.7;">
                        <li>{{collection_hours_weekday}}</li>
                        <li>{{collection_hours_saturday}}</li>
                        <li>{{collection_hours_sunday}}</li>
                        <li>{{collection_hours_holidays}}</li>
                      </ul>
                    </div>

                    <div style="background: #fafafa; padding: 18px; border-radius: 6px; margin: 24px 0;">
                      <p style="margin: 0 0 8px 0; font-size: 14px; color: #242424;"><strong>What to bring when collecting:</strong></p>
                      <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #4e595f; line-height: 1.7;">
                        <li>Your PO reference number (shown above)</li>
                        <li>Valid Staff Employee Card for verification and a Witness to Sign with</li>
                      </ul>
                    </div>
                  </div>

                  <!-- Footer -->
                  <div style="background: #242424; padding: 28px 24px; border-radius: 0 0 8px 8px; text-align: center;">
                    <p style="margin: 0 0 12px 0; font-size: 14px; color: #c9c9c9;">
                      Questions? Contact us at <a href="mailto:{{support_email}}" style="color: #f75757; text-decoration: none; font-weight: 600;">{{support_email}}</a>
                    </p>
                    <p style="margin: 0 0 18px 0; font-size: 11px; color: #919194; line-height: 1.5;">
                      This is an automated message from the POD System. Please do not reply directly to this email.
                    </p>
                    <div style="background: #ffffff; display: inline-block; padding: 14px; border-radius: 8px; margin: 0 0 14px 0;">
                      <img src="{{review_qr_code_url}}" alt="Scan to review our services" width="160" height="160" style="display: block; width: 160px; height: 160px;" />
                    </div>
                    <p style="margin: 0 0 14px 0; font-size: 12px; color: #c9c9c9; letter-spacing: 0.04em;">
                      Scan the QR code to review our services
                    </p>
                    <a href="{{review_form_url}}" style="display: inline-block; padding: 12px 28px; background: #f75757; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; border-radius: 50px;">
                      Please Review Our Services
                    </a>
                    <p style="margin: 18px 0 0 0; font-size: 11px; color: #666666;">
                      &copy; {{current_year}} Rabelani MM Trading Enterprise &middot; <a href="https://www.rabelanimm.co.za/" style="color: #919194; text-decoration: none;">www.rabelanimm.co.za</a>
                    </p>
                  </div>
                </body>
                </html>
$tpl$,
  $vars$[
    {"name":"reference","kind":"scalar","description":"Package reference"},
    {"name":"po_number","kind":"scalar","description":"Purchase order number (optional)"},
    {"name":"items","kind":"list","description":"Items: array of {quantity, description}"},
    {"name":"has_items","kind":"scalar","description":"Boolean — true when items list is non-empty"},
    {"name":"location_name","kind":"scalar","description":"Collection point name"},
    {"name":"location_address","kind":"scalar","description":"Collection point address (optional)"},
    {"name":"location_maps_link","kind":"scalar","description":"Google Maps URL (optional)"},
    {"name":"collection_contact","kind":"scalar","description":"Phone / extension to call when collecting"},
    {"name":"collection_hours_weekday","kind":"scalar","description":"Weekday collection hours line"},
    {"name":"collection_hours_saturday","kind":"scalar","description":"Saturday collection hours line"},
    {"name":"collection_hours_sunday","kind":"scalar","description":"Sunday collection hours line"},
    {"name":"collection_hours_holidays","kind":"scalar","description":"Public holiday collection hours line"},
    {"name":"support_email","kind":"scalar","description":"Support inbox"},
    {"name":"review_form_url","kind":"scalar","description":"Review form URL"},
    {"name":"review_qr_code_url","kind":"scalar","description":"Review form QR code image URL"},
    {"name":"current_year","kind":"scalar","description":"Current year"}
  ]$vars$::jsonb
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.email_templates (key, name, description, subject, body_html, variables)
VALUES
(
  'package_completed',
  'Package Completed',
  'Sent by update-package when a package transitions to collected. POD PDF is attached and rabelanimm@gmail.com is CCd by the edge function (not configured here).',
  $sub$Package Completed{{#po_number}} - {{po_number}}{{/po_number}} - {{reference}}$sub$,
  $tpl$
                <!DOCTYPE html>
                <html>
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                </head>
                <body style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #242424; background: #ffffff;">
                  <!-- Brand bar -->
                  <div style="background: #ffffff; padding: 24px 24px 16px 24px; border: 1px solid #ededed; border-bottom: 4px solid #f75757; border-radius: 8px 8px 0 0; text-align: center;">
                    <a href="https://www.rabelanimm.co.za/" style="text-decoration: none; display: inline-block;">
                      <img src="https://www.rabelanimm.co.za/images/logo.png" alt="Rabelani MM Trading Enterprise" style="max-height: 70px; height: auto; width: auto; display: block; margin: 0 auto;" />
                    </a>
                    <p style="margin: 12px 0 0 0; font-size: 12px; color: #919194; letter-spacing: 0.08em; text-transform: uppercase;">Rabelani MM Trading Enterprise</p>
                  </div>

                  <!-- Title block -->
                  <div style="background: #f75757; padding: 28px 24px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.01em;">Package Completed</h1>
                    {{#po_number}}<p style="color: #ffe7e7; margin: 14px 0 0 0; font-size: 15px;">Purchase Order Number: <strong style="font-family: 'Courier New', monospace; color: #ffffff;">{{po_number}}</strong></p>{{/po_number}}
                    <p style="color: #ffe7e7; margin: 6px 0 0 0; font-size: 15px;">Your Package Reference: <strong style="font-family: 'Courier New', monospace; color: #ffffff;">{{reference}}</strong></p>
                  </div>

                  <div style="background: #ffffff; padding: 30px 28px; border: 1px solid #ededed; border-top: none;">
                    <h2 style="color: #242424; font-size: 20px; margin: 0 0 15px 0; font-weight: 700;">✅ Package Completed</h2>
                    <p style="margin: 0 0 12px 0; color: #4e595f;">Hello,</p>
                    <p style="margin: 0 0 20px 0; color: #4e595f; line-height: 1.6;">Your Package Collection/Delivery has been completed and thank you for your Order.</p>

                    {{#has_items}}
                    <div style="margin: 24px 0;">
                      <h3 style="color: #242424; font-size: 16px; margin: 0 0 12px 0; font-weight: 700;">📋 Package Contents</h3>
                      <table style="width: 100%; border-collapse: collapse; border: 1px solid #ededed; border-radius: 6px; overflow: hidden;">
                        <thead>
                          <tr style="background: #fafafa;">
                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ededed; font-size: 12px; color: #919194; text-transform: uppercase; letter-spacing: 0.05em; width: 60px;">Qty</th>
                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ededed; font-size: 12px; color: #919194; text-transform: uppercase; letter-spacing: 0.05em;">Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {{#items}}
                          <tr>
                            <td style="padding: 12px; border-bottom: 1px solid #ededed; font-size: 14px; color: #242424; font-weight: 600;">{{quantity}}</td>
                            <td style="padding: 12px; border-bottom: 1px solid #ededed; font-size: 14px; color: #4e595f;">{{description}}</td>
                          </tr>
                          {{/items}}
                        </tbody>
                      </table>
                    </div>
                    {{/has_items}}

                    <p style="margin: 24px 0 0 0; color: #4e595f; line-height: 1.6; font-size: 15px;">Thank you for your Order.</p>
                  </div>

                  <!-- Footer -->
                  <div style="background: #242424; padding: 28px 24px; border-radius: 0 0 8px 8px; text-align: center;">
                    <p style="margin: 0 0 12px 0; font-size: 14px; color: #c9c9c9;">
                      Questions? Contact us at <a href="mailto:{{support_email}}" style="color: #f75757; text-decoration: none; font-weight: 600;">{{support_email}}</a>
                    </p>
                    <p style="margin: 0 0 18px 0; font-size: 11px; color: #919194; line-height: 1.5;">
                      This is an automated message from the POD System. Please do not reply directly to this email.
                    </p>
                    <div style="background: #ffffff; display: inline-block; padding: 14px; border-radius: 8px; margin: 0 0 14px 0;">
                      <img src="{{review_qr_code_url}}" alt="Scan to review our services" width="160" height="160" style="display: block; width: 160px; height: 160px;" />
                    </div>
                    <p style="margin: 0 0 14px 0; font-size: 12px; color: #c9c9c9; letter-spacing: 0.04em;">
                      Scan the QR code to review our services
                    </p>
                    <a href="{{review_form_url}}" style="display: inline-block; padding: 12px 28px; background: #f75757; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; border-radius: 50px;">
                      Please Review Our Services
                    </a>
                    <p style="margin: 18px 0 0 0; font-size: 11px; color: #666666;">
                      &copy; {{current_year}} Rabelani MM Trading Enterprise &middot; <a href="https://www.rabelanimm.co.za/" style="color: #919194; text-decoration: none;">www.rabelanimm.co.za</a>
                    </p>
                  </div>
                </body>
                </html>
$tpl$,
  $vars$[
    {"name":"reference","kind":"scalar","description":"Package reference"},
    {"name":"po_number","kind":"scalar","description":"Purchase order number (optional)"},
    {"name":"items","kind":"list","description":"Items: array of {quantity, description}"},
    {"name":"has_items","kind":"scalar","description":"Boolean — true when items list is non-empty"},
    {"name":"support_email","kind":"scalar","description":"Support inbox"},
    {"name":"review_form_url","kind":"scalar","description":"Review form URL"},
    {"name":"review_qr_code_url","kind":"scalar","description":"Review form QR code URL"},
    {"name":"current_year","kind":"scalar","description":"Current year"}
  ]$vars$::jsonb
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.email_templates (key, name, description, subject, body_html, variables)
VALUES
(
  'package_contents_updated',
  'Package Contents Updated',
  'Sent by update-package when a package items diff actually mutates rows.',
  $sub$Package Contents Updated{{#po_number}} - {{po_number}}{{/po_number}} - {{reference}}$sub$,
  $tpl$
                <!DOCTYPE html>
                <html>
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                </head>
                <body style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #242424; background: #ffffff;">
                  <!-- Brand bar -->
                  <div style="background: #ffffff; padding: 24px 24px 16px 24px; border: 1px solid #ededed; border-bottom: 4px solid #f75757; border-radius: 8px 8px 0 0; text-align: center;">
                    <a href="https://www.rabelanimm.co.za/" style="text-decoration: none; display: inline-block;">
                      <img src="https://www.rabelanimm.co.za/images/logo.png" alt="Rabelani MM Trading Enterprise" style="max-height: 70px; height: auto; width: auto; display: block; margin: 0 auto;" />
                    </a>
                    <p style="margin: 12px 0 0 0; font-size: 12px; color: #919194; letter-spacing: 0.08em; text-transform: uppercase;">Rabelani MM Trading Enterprise</p>
                  </div>

                  <!-- Title block -->
                  <div style="background: #f75757; padding: 28px 24px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.01em;">Package Contents Updated</h1>
                    {{#po_number}}<p style="color: #ffe7e7; margin: 14px 0 0 0; font-size: 15px;">Purchase Order Number: <strong style="font-family: 'Courier New', monospace; color: #ffffff;">{{po_number}}</strong></p>{{/po_number}}
                    <p style="color: #ffe7e7; margin: 6px 0 0 0; font-size: 15px;">Your Package Reference: <strong style="font-family: 'Courier New', monospace; color: #ffffff;">{{reference}}</strong></p>
                  </div>

                  <div style="background: #ffffff; padding: 30px 28px; border: 1px solid #ededed; border-top: none;">
                    <h2 style="color: #242424; font-size: 20px; margin: 0 0 15px 0; font-weight: 700;">✏️ Your Package has been edited</h2>
                    <p style="margin: 0 0 20px 0; color: #4e595f; line-height: 1.6;">The contents of your package have been updated. Please review the changes below.</p>

                    <div style="margin: 24px 0;">
                      <h3 style="color: #242424; font-size: 16px; margin: 0 0 12px 0; font-weight: 700;">📋 Package Contents – Updated Contents</h3>
                      {{#has_updated_items}}
                      <table style="width: 100%; border-collapse: collapse; border: 1px solid #ededed; border-radius: 6px; overflow: hidden;">
                        <thead>
                          <tr style="background: #fafafa;">
                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ededed; font-size: 12px; color: #919194; text-transform: uppercase; letter-spacing: 0.05em; width: 60px;">Qty</th>
                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ededed; font-size: 12px; color: #919194; text-transform: uppercase; letter-spacing: 0.05em;">Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {{#updated_items}}
                          <tr>
                            <td style="padding: 12px; border-bottom: 1px solid #ededed; font-size: 14px; color: #242424; font-weight: 600;">{{quantity}}</td>
                            <td style="padding: 12px; border-bottom: 1px solid #ededed; font-size: 14px; color: #4e595f;">{{description}}</td>
                          </tr>
                          {{/updated_items}}
                        </tbody>
                      </table>
                      {{/has_updated_items}}
                      {{^has_updated_items}}<p style="margin: 0; color: #919194; font-size: 14px; font-style: italic;">No items.</p>{{/has_updated_items}}
                    </div>

                    <div style="margin: 24px 0;">
                      <h3 style="color: #919194; font-size: 16px; margin: 0 0 12px 0; font-weight: 700;">📦 Package Contents – Previous</h3>
                      {{#has_previous_items}}
                      <table style="width: 100%; border-collapse: collapse; border: 1px solid #ededed; border-radius: 6px; overflow: hidden;">
                        <thead>
                          <tr style="background: #fafafa;">
                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ededed; font-size: 12px; color: #919194; text-transform: uppercase; letter-spacing: 0.05em; width: 60px;">Qty</th>
                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ededed; font-size: 12px; color: #919194; text-transform: uppercase; letter-spacing: 0.05em;">Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {{#previous_items}}
                          <tr>
                            <td style="padding: 12px; border-bottom: 1px solid #ededed; font-size: 14px; color: #242424; font-weight: 600;">{{quantity}}</td>
                            <td style="padding: 12px; border-bottom: 1px solid #ededed; font-size: 14px; color: #4e595f;">{{description}}</td>
                          </tr>
                          {{/previous_items}}
                        </tbody>
                      </table>
                      {{/has_previous_items}}
                      {{^has_previous_items}}<p style="margin: 0; color: #919194; font-size: 14px; font-style: italic;">No items.</p>{{/has_previous_items}}
                    </div>

                    <p style="margin: 24px 0 0 0; color: #4e595f; line-height: 1.6; font-size: 15px;">Thank you for your Order.</p>
                  </div>

                  <!-- Footer -->
                  <div style="background: #242424; padding: 28px 24px; border-radius: 0 0 8px 8px; text-align: center;">
                    <p style="margin: 0 0 12px 0; font-size: 14px; color: #c9c9c9;">
                      Questions? Contact us at <a href="mailto:{{support_email}}" style="color: #f75757; text-decoration: none; font-weight: 600;">{{support_email}}</a>
                    </p>
                    <p style="margin: 0 0 18px 0; font-size: 11px; color: #919194; line-height: 1.5;">
                      This is an automated message from the POD System. Please do not reply directly to this email.
                    </p>
                    <div style="background: #ffffff; display: inline-block; padding: 14px; border-radius: 8px; margin: 0 0 14px 0;">
                      <img src="{{review_qr_code_url}}" alt="Scan to review our services" width="160" height="160" style="display: block; width: 160px; height: 160px;" />
                    </div>
                    <p style="margin: 0 0 14px 0; font-size: 12px; color: #c9c9c9; letter-spacing: 0.04em;">
                      Scan the QR code to review our services
                    </p>
                    <a href="{{review_form_url}}" style="display: inline-block; padding: 12px 28px; background: #f75757; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; border-radius: 50px;">
                      Please Review Our Services
                    </a>
                    <p style="margin: 18px 0 0 0; font-size: 11px; color: #666666;">
                      &copy; {{current_year}} Rabelani MM Trading Enterprise &middot; <a href="https://www.rabelanimm.co.za/" style="color: #919194; text-decoration: none;">www.rabelanimm.co.za</a>
                    </p>
                  </div>
                </body>
                </html>
$tpl$,
  $vars$[
    {"name":"reference","kind":"scalar","description":"Package reference"},
    {"name":"po_number","kind":"scalar","description":"Purchase order number (optional)"},
    {"name":"updated_items","kind":"list","description":"New items: array of {quantity, description}"},
    {"name":"has_updated_items","kind":"scalar","description":"Boolean — true when updated_items is non-empty"},
    {"name":"previous_items","kind":"list","description":"Previous items: array of {quantity, description}"},
    {"name":"has_previous_items","kind":"scalar","description":"Boolean — true when previous_items is non-empty"},
    {"name":"support_email","kind":"scalar","description":"Support inbox"},
    {"name":"review_form_url","kind":"scalar","description":"Review form URL"},
    {"name":"review_qr_code_url","kind":"scalar","description":"Review form QR code URL"},
    {"name":"current_year","kind":"scalar","description":"Current year"}
  ]$vars$::jsonb
)
ON CONFLICT (key) DO NOTHING;

