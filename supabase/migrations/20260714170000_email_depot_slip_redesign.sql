-- Redesign the transactional emails: "the depot slip".
--
-- The emails were coral (#f75757) on Helvetica with a dark footer slab whose QR
-- outweighed the content — a different visual language from the Dispatch console
-- they come from. This restyles all four seeded templates onto the app's own
-- palette (cargo orange #ea6600, warm paper, ink) with the reference leading the
-- email as a mono waybill strip, and demotes the footer to quiet small print.
-- Green (#3b9555) appears on package_completed only, where the order is actually
-- delivered.
--
-- body_html and content are written together and both come from
-- compileBlocks(SEED_CONTENT) in src/lib/email/, so the sent email, the editor's
-- structured doc, and the in-code fallback in
-- supabase/functions/_shared/email-templates.ts are byte-identical. Unlike
-- 20260714120000 (which cleared content so the editor opened raw HTML), content
-- is now seeded: the block model can express this design, so templates open as
-- editable blocks rather than an HTML escape hatch.
--
-- Subject, cc, bcc and is_active are untouched. customer_invited has no DB row;
-- it is served by the in-code fallback.

update public.email_templates
   set body_html = $tpl$
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background: #f3f1ed; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background: #f3f1ed;">
    <tr><td align="center" style="padding: 24px 12px;">
    <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%; max-width: 600px; background: #fffefd; border: 1px solid #e1ddda; border-radius: 10px; overflow: hidden; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1f1915;">
      <tr><td style="padding: 18px 28px 16px; border-bottom: 1px solid #e1ddda;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
          <td align="left" valign="middle">
            <a href="https://www.rabelanimm.co.za/" style="text-decoration: none;"><img src="https://www.rabelanimm.co.za/images/logo.png" alt="Rabelani MM Trading Enterprise" height="40" style="display: block; height: 40px; width: auto; max-height: 40px; border: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 700; color: #1f1915;" /></a>
          </td>
          <td align="right" valign="middle" style="font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Order confirmation</td>
        </tr></table>
        
      </td></tr>
      <tr><td style="height: 4px; line-height: 4px; font-size: 0; background: #ea6600;">&nbsp;</td></tr>
      <tr><td style="padding: 26px 28px 22px; background: #fcfaf7; border-bottom: 1px dashed #e1ddda;">
        <span style="display: inline-block; background: #ea6600; color: #201308; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 700; line-height: 1; letter-spacing: 0.1em; text-transform: uppercase; padding: 6px 10px; border-radius: 4px;">Registered</span>
        <p style="margin: 16px 0 4px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 500; line-height: 1; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Package reference</p>
        <p style="margin: 0; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 26px; font-weight: 600; line-height: 1.15; color: #1f1915;">{{reference}}</p>
        {{#po_number}}<p style="margin: 10px 0 0; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 12px; color: #6e6762;">Purchase order · {{po_number}}</p>{{/po_number}}
      </td></tr>
      <tr><td style="height: 22px; line-height: 22px; font-size: 0;">&nbsp;</td></tr>
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 14px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1f1915;">A package has been registered for you and is being prepared. We will email you again when it is ready to collect.</p></td></tr>
{{#notes}}      <tr><td style="padding: 0 28px; "><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 0 0 14px; background: #f3f1ed; border-radius: 6px;"><tr><td style="padding: 12px 14px;">
          <p style="margin: 0 0 8px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 600; line-height: 1; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Notes</p>
          <p style="margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; line-height: 1.6; color: #1f1915;">{{notes}}</p>
        </td></tr></table></td></tr>{{/notes}}
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 8px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 600; line-height: 1; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Contents</p>{{#has_items}}<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse: collapse; margin: 0 0 18px;"><thead><tr><th align="left" width="44" style="padding: 0 0 8px; border-bottom: 1px solid #e1ddda; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #6e6762;">Qty</th><th align="left" style="padding: 0 0 8px; border-bottom: 1px solid #e1ddda; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Description</th></tr></thead><tbody>{{#items}}<tr><td style="padding: 10px 0; border-bottom: 1px solid #f3f1ed; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 14px; font-weight: 500; font-variant-numeric: tabular-nums; color: #1f1915;">{{quantity}}</td><td style="padding: 10px 0; border-bottom: 1px solid #f3f1ed; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #1f1915;">{{description}}</td></tr>{{/items}}</tbody></table>{{/has_items}}</td></tr>
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 8px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 600; line-height: 1; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Collection point</p></td></tr>
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 14px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1f1915;"><strong>{{location_name}}</strong></p></td></tr>
{{#location_address}}      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 14px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1f1915;">{{location_address}}</p></td></tr>{{/location_address}}
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 14px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1f1915;">Contact {{collection_contact}}</p></td></tr>
      <tr><td style="height: 6px; line-height: 6px; font-size: 0;">&nbsp;</td></tr>
      <tr><td style="padding: 18px 28px 22px; background: #fcfaf7; border-top: 1px solid #e1ddda;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
          <td valign="middle">
            <p style="margin: 0 0 6px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; line-height: 1.5; color: #6e6762;">Questions? <a href="mailto:{{support_email}}" style="color: #ea6600; text-decoration: none; font-weight: 600;">{{support_email}}</a></p>
            <p style="margin: 0 0 10px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.5; color: #6e6762;">Automated message &middot; please do not reply directly to this email.</p>
            {{#review_form_url}}<p style="margin: 0 0 12px;"><a href="{{review_form_url}}" style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; color: #6e6762; text-decoration: underline;">Review our service</a></p>{{/review_form_url}}
            <p style="margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.5; color: #a49d97;">&copy; {{current_year}} Rabelani MM Trading Enterprise &middot; <a href="https://www.rabelanimm.co.za/" style="color: #a49d97; text-decoration: none;">rabelanimm.co.za</a></p>
          </td>
          {{#review_qr_code_url}}
        <td align="right" valign="middle" width="84" style="padding-left: 12px;">
          <img src="{{review_qr_code_url}}" alt="Scan to review our service" width="72" height="72" style="display: block; width: 72px; height: 72px; border: 1px solid #e1ddda; border-radius: 4px;" />
        </td>
        {{/review_qr_code_url}}
        </tr></table>
      </td></tr>
    </table>
    </td></tr>
  </table>
</body>
</html>
$tpl$,
       content   = $json$
{
  "version": 1,
  "banner": {
    "title": "Order confirmation",
    "bg": "#ea6600",
    "lines": []
  },
  "blocks": [
    {
      "id": "seed-1",
      "kind": "reference_strip",
      "status": "Registered",
      "accent": "#ea6600",
      "label": "Package reference",
      "value": "{{reference}}",
      "meta": "Purchase order · {{po_number}}",
      "metaShowWhen": "po_number"
    },
    {
      "id": "seed-2",
      "kind": "paragraph",
      "text": "A package has been registered for you and is being prepared. We will email you again when it is ready to collect."
    },
    {
      "id": "seed-3",
      "kind": "note",
      "label": "Notes",
      "text": "{{notes}}",
      "showWhen": "notes"
    },
    {
      "id": "seed-4",
      "kind": "items_table",
      "heading": "Contents",
      "flag": "has_items",
      "source": "items",
      "columns": [
        {
          "header": "Qty",
          "field": "quantity"
        },
        {
          "header": "Description",
          "field": "description"
        }
      ]
    },
    {
      "id": "seed-5",
      "kind": "heading",
      "level": 3,
      "text": "Collection point"
    },
    {
      "id": "seed-6",
      "kind": "paragraph",
      "text": "**{{location_name}}**"
    },
    {
      "id": "seed-7",
      "kind": "paragraph",
      "text": "{{location_address}}",
      "showWhen": "location_address"
    },
    {
      "id": "seed-8",
      "kind": "paragraph",
      "text": "Contact {{collection_contact}}"
    }
  ],
  "footerSupportVar": "support_email"
}
$json$::jsonb
 where key = 'package_registered';

update public.email_templates
   set body_html = $tpl$
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background: #f3f1ed; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background: #f3f1ed;">
    <tr><td align="center" style="padding: 24px 12px;">
    <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%; max-width: 600px; background: #fffefd; border: 1px solid #e1ddda; border-radius: 10px; overflow: hidden; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1f1915;">
      <tr><td style="padding: 18px 28px 16px; border-bottom: 1px solid #e1ddda;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
          <td align="left" valign="middle">
            <a href="https://www.rabelanimm.co.za/" style="text-decoration: none;"><img src="https://www.rabelanimm.co.za/images/logo.png" alt="Rabelani MM Trading Enterprise" height="40" style="display: block; height: 40px; width: auto; max-height: 40px; border: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 700; color: #1f1915;" /></a>
          </td>
          <td align="right" valign="middle" style="font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Collection notice</td>
        </tr></table>
        
      </td></tr>
      <tr><td style="height: 4px; line-height: 4px; font-size: 0; background: #ea6600;">&nbsp;</td></tr>
      <tr><td style="padding: 26px 28px 22px; background: #fcfaf7; border-bottom: 1px dashed #e1ddda;">
        <span style="display: inline-block; background: #ea6600; color: #201308; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 700; line-height: 1; letter-spacing: 0.1em; text-transform: uppercase; padding: 6px 10px; border-radius: 4px;">Ready for collection</span>
        <p style="margin: 16px 0 4px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 500; line-height: 1; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Package reference</p>
        <p style="margin: 0; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 26px; font-weight: 600; line-height: 1.15; color: #1f1915;">{{reference}}</p>
        {{#po_number}}<p style="margin: 10px 0 0; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 12px; color: #6e6762;">Purchase order · {{po_number}}</p>{{/po_number}}
      </td></tr>
      <tr><td style="height: 22px; line-height: 22px; font-size: 0;">&nbsp;</td></tr>
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 14px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1f1915;">Your package is ready for collection at <strong>{{location_name}}</strong>. Bring the reference above, a valid staff card, and a witness to sign with.</p></td></tr>
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 8px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 600; line-height: 1; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Contents</p>{{#has_items}}<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse: collapse; margin: 0 0 18px;"><thead><tr><th align="left" width="44" style="padding: 0 0 8px; border-bottom: 1px solid #e1ddda; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #6e6762;">Qty</th><th align="left" style="padding: 0 0 8px; border-bottom: 1px solid #e1ddda; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Description</th></tr></thead><tbody>{{#items}}<tr><td style="padding: 10px 0; border-bottom: 1px solid #f3f1ed; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 14px; font-weight: 500; font-variant-numeric: tabular-nums; color: #1f1915;">{{quantity}}</td><td style="padding: 10px 0; border-bottom: 1px solid #f3f1ed; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #1f1915;">{{description}}</td></tr>{{/items}}</tbody></table>{{/has_items}}</td></tr>
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 8px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 600; line-height: 1; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Collection point</p></td></tr>
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 14px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1f1915;"><strong>{{location_name}}</strong></p></td></tr>
{{#location_address}}      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 14px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1f1915;">{{location_address}}</p></td></tr>{{/location_address}}
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 14px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1f1915;">Contact {{collection_contact}}</p></td></tr>
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 8px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 600; line-height: 1; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Collection hours</p></td></tr>
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 14px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1f1915;">{{collection_hours_weekday}}</p></td></tr>
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 14px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1f1915;">{{collection_hours_saturday}}</p></td></tr>
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 14px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1f1915;">{{collection_hours_sunday}}</p></td></tr>
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 14px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1f1915;">{{collection_hours_holidays}}</p></td></tr>
      <tr><td style="height: 6px; line-height: 6px; font-size: 0;">&nbsp;</td></tr>
      <tr><td style="padding: 18px 28px 22px; background: #fcfaf7; border-top: 1px solid #e1ddda;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
          <td valign="middle">
            <p style="margin: 0 0 6px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; line-height: 1.5; color: #6e6762;">Questions? <a href="mailto:{{support_email}}" style="color: #ea6600; text-decoration: none; font-weight: 600;">{{support_email}}</a></p>
            <p style="margin: 0 0 10px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.5; color: #6e6762;">Automated message &middot; please do not reply directly to this email.</p>
            {{#review_form_url}}<p style="margin: 0 0 12px;"><a href="{{review_form_url}}" style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; color: #6e6762; text-decoration: underline;">Review our service</a></p>{{/review_form_url}}
            <p style="margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.5; color: #a49d97;">&copy; {{current_year}} Rabelani MM Trading Enterprise &middot; <a href="https://www.rabelanimm.co.za/" style="color: #a49d97; text-decoration: none;">rabelanimm.co.za</a></p>
          </td>
          {{#review_qr_code_url}}
        <td align="right" valign="middle" width="84" style="padding-left: 12px;">
          <img src="{{review_qr_code_url}}" alt="Scan to review our service" width="72" height="72" style="display: block; width: 72px; height: 72px; border: 1px solid #e1ddda; border-radius: 4px;" />
        </td>
        {{/review_qr_code_url}}
        </tr></table>
      </td></tr>
    </table>
    </td></tr>
  </table>
</body>
</html>
$tpl$,
       content   = $json$
{
  "version": 1,
  "banner": {
    "title": "Collection notice",
    "bg": "#ea6600",
    "lines": []
  },
  "blocks": [
    {
      "id": "seed-9",
      "kind": "reference_strip",
      "status": "Ready for collection",
      "accent": "#ea6600",
      "label": "Package reference",
      "value": "{{reference}}",
      "meta": "Purchase order · {{po_number}}",
      "metaShowWhen": "po_number"
    },
    {
      "id": "seed-10",
      "kind": "paragraph",
      "text": "Your package is ready for collection at **{{location_name}}**. Bring the reference above, a valid staff card, and a witness to sign with."
    },
    {
      "id": "seed-11",
      "kind": "items_table",
      "heading": "Contents",
      "flag": "has_items",
      "source": "items",
      "columns": [
        {
          "header": "Qty",
          "field": "quantity"
        },
        {
          "header": "Description",
          "field": "description"
        }
      ]
    },
    {
      "id": "seed-12",
      "kind": "heading",
      "level": 3,
      "text": "Collection point"
    },
    {
      "id": "seed-13",
      "kind": "paragraph",
      "text": "**{{location_name}}**"
    },
    {
      "id": "seed-14",
      "kind": "paragraph",
      "text": "{{location_address}}",
      "showWhen": "location_address"
    },
    {
      "id": "seed-15",
      "kind": "paragraph",
      "text": "Contact {{collection_contact}}"
    },
    {
      "id": "seed-16",
      "kind": "heading",
      "level": 3,
      "text": "Collection hours"
    },
    {
      "id": "seed-17",
      "kind": "paragraph",
      "text": "{{collection_hours_weekday}}"
    },
    {
      "id": "seed-18",
      "kind": "paragraph",
      "text": "{{collection_hours_saturday}}"
    },
    {
      "id": "seed-19",
      "kind": "paragraph",
      "text": "{{collection_hours_sunday}}"
    },
    {
      "id": "seed-20",
      "kind": "paragraph",
      "text": "{{collection_hours_holidays}}"
    }
  ],
  "footerSupportVar": "support_email"
}
$json$::jsonb
 where key = 'package_ready_for_collection';

update public.email_templates
   set body_html = $tpl$
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background: #f3f1ed; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background: #f3f1ed;">
    <tr><td align="center" style="padding: 24px 12px;">
    <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%; max-width: 600px; background: #fffefd; border: 1px solid #e1ddda; border-radius: 10px; overflow: hidden; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1f1915;">
      <tr><td style="padding: 18px 28px 16px; border-bottom: 1px solid #e1ddda;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
          <td align="left" valign="middle">
            <a href="https://www.rabelanimm.co.za/" style="text-decoration: none;"><img src="https://www.rabelanimm.co.za/images/logo.png" alt="Rabelani MM Trading Enterprise" height="40" style="display: block; height: 40px; width: auto; max-height: 40px; border: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 700; color: #1f1915;" /></a>
          </td>
          <td align="right" valign="middle" style="font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Completion notice</td>
        </tr></table>
        
      </td></tr>
      <tr><td style="height: 4px; line-height: 4px; font-size: 0; background: #3b9555;">&nbsp;</td></tr>
      <tr><td style="padding: 26px 28px 22px; background: #fcfaf7; border-bottom: 1px dashed #e1ddda;">
        <span style="display: inline-block; background: #3b9555; color: #201308; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 700; line-height: 1; letter-spacing: 0.1em; text-transform: uppercase; padding: 6px 10px; border-radius: 4px;">Delivered</span>
        <p style="margin: 16px 0 4px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 500; line-height: 1; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Package reference</p>
        <p style="margin: 0; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 26px; font-weight: 600; line-height: 1.15; color: #1f1915;">{{reference}}</p>
        {{#po_number}}<p style="margin: 10px 0 0; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 12px; color: #6e6762;">Purchase order · {{po_number}}</p>{{/po_number}}
      </td></tr>
      <tr><td style="height: 22px; line-height: 22px; font-size: 0;">&nbsp;</td></tr>
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 14px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1f1915;">Collection is complete. The signed proof of delivery is attached to this email as a PDF. Thank you for your order.</p></td></tr>
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 8px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 600; line-height: 1; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Contents</p>{{#has_items}}<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse: collapse; margin: 0 0 18px;"><thead><tr><th align="left" width="44" style="padding: 0 0 8px; border-bottom: 1px solid #e1ddda; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #6e6762;">Qty</th><th align="left" style="padding: 0 0 8px; border-bottom: 1px solid #e1ddda; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Description</th></tr></thead><tbody>{{#items}}<tr><td style="padding: 10px 0; border-bottom: 1px solid #f3f1ed; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 14px; font-weight: 500; font-variant-numeric: tabular-nums; color: #1f1915;">{{quantity}}</td><td style="padding: 10px 0; border-bottom: 1px solid #f3f1ed; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #1f1915;">{{description}}</td></tr>{{/items}}</tbody></table>{{/has_items}}</td></tr>
      <tr><td style="height: 6px; line-height: 6px; font-size: 0;">&nbsp;</td></tr>
      <tr><td style="padding: 18px 28px 22px; background: #fcfaf7; border-top: 1px solid #e1ddda;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
          <td valign="middle">
            <p style="margin: 0 0 6px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; line-height: 1.5; color: #6e6762;">Questions? <a href="mailto:{{support_email}}" style="color: #ea6600; text-decoration: none; font-weight: 600;">{{support_email}}</a></p>
            <p style="margin: 0 0 10px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.5; color: #6e6762;">Automated message &middot; please do not reply directly to this email.</p>
            {{#review_form_url}}<p style="margin: 0 0 12px;"><a href="{{review_form_url}}" style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; color: #6e6762; text-decoration: underline;">Review our service</a></p>{{/review_form_url}}
            <p style="margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.5; color: #a49d97;">&copy; {{current_year}} Rabelani MM Trading Enterprise &middot; <a href="https://www.rabelanimm.co.za/" style="color: #a49d97; text-decoration: none;">rabelanimm.co.za</a></p>
          </td>
          {{#review_qr_code_url}}
        <td align="right" valign="middle" width="84" style="padding-left: 12px;">
          <img src="{{review_qr_code_url}}" alt="Scan to review our service" width="72" height="72" style="display: block; width: 72px; height: 72px; border: 1px solid #e1ddda; border-radius: 4px;" />
        </td>
        {{/review_qr_code_url}}
        </tr></table>
      </td></tr>
    </table>
    </td></tr>
  </table>
</body>
</html>
$tpl$,
       content   = $json$
{
  "version": 1,
  "banner": {
    "title": "Completion notice",
    "bg": "#3b9555",
    "lines": []
  },
  "blocks": [
    {
      "id": "seed-21",
      "kind": "reference_strip",
      "status": "Delivered",
      "accent": "#3b9555",
      "label": "Package reference",
      "value": "{{reference}}",
      "meta": "Purchase order · {{po_number}}",
      "metaShowWhen": "po_number"
    },
    {
      "id": "seed-22",
      "kind": "paragraph",
      "text": "Collection is complete. The signed proof of delivery is attached to this email as a PDF. Thank you for your order."
    },
    {
      "id": "seed-23",
      "kind": "items_table",
      "heading": "Contents",
      "flag": "has_items",
      "source": "items",
      "columns": [
        {
          "header": "Qty",
          "field": "quantity"
        },
        {
          "header": "Description",
          "field": "description"
        }
      ]
    }
  ],
  "footerSupportVar": "support_email"
}
$json$::jsonb
 where key = 'package_completed';

update public.email_templates
   set body_html = $tpl$
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background: #f3f1ed; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background: #f3f1ed;">
    <tr><td align="center" style="padding: 24px 12px;">
    <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%; max-width: 600px; background: #fffefd; border: 1px solid #e1ddda; border-radius: 10px; overflow: hidden; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1f1915;">
      <tr><td style="padding: 18px 28px 16px; border-bottom: 1px solid #e1ddda;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
          <td align="left" valign="middle">
            <a href="https://www.rabelanimm.co.za/" style="text-decoration: none;"><img src="https://www.rabelanimm.co.za/images/logo.png" alt="Rabelani MM Trading Enterprise" height="40" style="display: block; height: 40px; width: auto; max-height: 40px; border: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 700; color: #1f1915;" /></a>
          </td>
          <td align="right" valign="middle" style="font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Amendment notice</td>
        </tr></table>
        
      </td></tr>
      <tr><td style="height: 4px; line-height: 4px; font-size: 0; background: #ea6600;">&nbsp;</td></tr>
      <tr><td style="padding: 26px 28px 22px; background: #fcfaf7; border-bottom: 1px dashed #e1ddda;">
        <span style="display: inline-block; background: #ea6600; color: #201308; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 700; line-height: 1; letter-spacing: 0.1em; text-transform: uppercase; padding: 6px 10px; border-radius: 4px;">Contents updated</span>
        <p style="margin: 16px 0 4px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 500; line-height: 1; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Package reference</p>
        <p style="margin: 0; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 26px; font-weight: 600; line-height: 1.15; color: #1f1915;">{{reference}}</p>
        {{#po_number}}<p style="margin: 10px 0 0; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 12px; color: #6e6762;">Purchase order · {{po_number}}</p>{{/po_number}}
      </td></tr>
      <tr><td style="height: 22px; line-height: 22px; font-size: 0;">&nbsp;</td></tr>
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 14px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1f1915;">The contents of your package have been amended. The current contents are below.</p></td></tr>
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 8px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 600; line-height: 1; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Updated contents</p>{{#has_updated_items}}<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse: collapse; margin: 0 0 18px;"><thead><tr><th align="left" width="44" style="padding: 0 0 8px; border-bottom: 1px solid #e1ddda; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #6e6762;">Qty</th><th align="left" style="padding: 0 0 8px; border-bottom: 1px solid #e1ddda; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Description</th></tr></thead><tbody>{{#updated_items}}<tr><td style="padding: 10px 0; border-bottom: 1px solid #f3f1ed; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 14px; font-weight: 500; font-variant-numeric: tabular-nums; color: #1f1915;">{{quantity}}</td><td style="padding: 10px 0; border-bottom: 1px solid #f3f1ed; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #1f1915;">{{description}}</td></tr>{{/updated_items}}</tbody></table>{{/has_updated_items}}{{^has_updated_items}}<p style="margin: 0 0 18px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; color: #6e6762;">No items.</p>{{/has_updated_items}}</td></tr>
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 8px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 600; line-height: 1; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Previous contents</p>{{#has_previous_items}}<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse: collapse; margin: 0 0 18px;"><thead><tr><th align="left" width="44" style="padding: 0 0 8px; border-bottom: 1px solid #e1ddda; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #6e6762;">Qty</th><th align="left" style="padding: 0 0 8px; border-bottom: 1px solid #e1ddda; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Description</th></tr></thead><tbody>{{#previous_items}}<tr><td style="padding: 10px 0; border-bottom: 1px solid #f3f1ed; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 14px; font-weight: 500; font-variant-numeric: tabular-nums; color: #1f1915;">{{quantity}}</td><td style="padding: 10px 0; border-bottom: 1px solid #f3f1ed; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #1f1915;">{{description}}</td></tr>{{/previous_items}}</tbody></table>{{/has_previous_items}}{{^has_previous_items}}<p style="margin: 0 0 18px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; color: #6e6762;">No items.</p>{{/has_previous_items}}</td></tr>
{{#notes}}      <tr><td style="padding: 0 28px; "><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 0 0 14px; background: #f3f1ed; border-radius: 6px;"><tr><td style="padding: 12px 14px;">
          <p style="margin: 0 0 8px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 600; line-height: 1; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Notes</p>
          <p style="margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; line-height: 1.6; color: #1f1915;">{{notes}}</p>
        </td></tr></table></td></tr>{{/notes}}
      <tr><td style="height: 6px; line-height: 6px; font-size: 0;">&nbsp;</td></tr>
      <tr><td style="padding: 18px 28px 22px; background: #fcfaf7; border-top: 1px solid #e1ddda;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
          <td valign="middle">
            <p style="margin: 0 0 6px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; line-height: 1.5; color: #6e6762;">Questions? <a href="mailto:{{support_email}}" style="color: #ea6600; text-decoration: none; font-weight: 600;">{{support_email}}</a></p>
            <p style="margin: 0 0 10px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.5; color: #6e6762;">Automated message &middot; please do not reply directly to this email.</p>
            {{#review_form_url}}<p style="margin: 0 0 12px;"><a href="{{review_form_url}}" style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; color: #6e6762; text-decoration: underline;">Review our service</a></p>{{/review_form_url}}
            <p style="margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.5; color: #a49d97;">&copy; {{current_year}} Rabelani MM Trading Enterprise &middot; <a href="https://www.rabelanimm.co.za/" style="color: #a49d97; text-decoration: none;">rabelanimm.co.za</a></p>
          </td>
          {{#review_qr_code_url}}
        <td align="right" valign="middle" width="84" style="padding-left: 12px;">
          <img src="{{review_qr_code_url}}" alt="Scan to review our service" width="72" height="72" style="display: block; width: 72px; height: 72px; border: 1px solid #e1ddda; border-radius: 4px;" />
        </td>
        {{/review_qr_code_url}}
        </tr></table>
      </td></tr>
    </table>
    </td></tr>
  </table>
</body>
</html>
$tpl$,
       content   = $json$
{
  "version": 1,
  "banner": {
    "title": "Amendment notice",
    "bg": "#ea6600",
    "lines": []
  },
  "blocks": [
    {
      "id": "seed-24",
      "kind": "reference_strip",
      "status": "Contents updated",
      "accent": "#ea6600",
      "label": "Package reference",
      "value": "{{reference}}",
      "meta": "Purchase order · {{po_number}}",
      "metaShowWhen": "po_number"
    },
    {
      "id": "seed-25",
      "kind": "paragraph",
      "text": "The contents of your package have been amended. The current contents are below."
    },
    {
      "id": "seed-26",
      "kind": "items_table",
      "heading": "Updated contents",
      "flag": "has_updated_items",
      "source": "updated_items",
      "columns": [
        {
          "header": "Qty",
          "field": "quantity"
        },
        {
          "header": "Description",
          "field": "description"
        }
      ],
      "emptyText": "No items."
    },
    {
      "id": "seed-27",
      "kind": "items_table",
      "heading": "Previous contents",
      "flag": "has_previous_items",
      "source": "previous_items",
      "columns": [
        {
          "header": "Qty",
          "field": "quantity"
        },
        {
          "header": "Description",
          "field": "description"
        }
      ],
      "emptyText": "No items."
    },
    {
      "id": "seed-28",
      "kind": "note",
      "label": "Notes",
      "text": "{{notes}}",
      "showWhen": "notes"
    }
  ],
  "footerSupportVar": "support_email"
}
$json$::jsonb
 where key = 'package_contents_updated';
