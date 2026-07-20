import { describe, expect, it } from 'vitest'
import { buildIngestFailureEmail } from './coupa-failure-email'
import type { CoupaPo } from './coupa-po'

const PO: CoupaPo = {
  poNumber: 'GG80700992',
  poDate: '2026-07-15',
  total: 4873.26,
  currency: 'ZAR',
  lines: [
    { code: '37869', name: 'VOUCHER:OVERTIME MEAL,TICKET', quantity: 49, uom: 'PKT' },
    { code: '37865', name: 'VOUCHER:OVERTIME MEAL ,TICKET', quantity: 14, uom: 'PKT' },
  ],
}

describe('buildIngestFailureEmail', () => {
  it('identifies the PO in the subject when it parsed', () => {
    const { subject } = buildIngestFailureEmail({ reason: 'r', details: 'd', po: PO })
    expect(subject).toBe('[Dispatch] Global PO not created — GG80700992')
  })

  it('falls back to the email subject when the PO did not parse', () => {
    // The subject line carries the number too, so it is the only handle left.
    const { subject } = buildIngestFailureEmail({
      reason: 'r',
      details: 'd',
      emailSubject: 'Exxaro Resources Purchase Order #GG80700992',
    })
    expect(subject).toBe('[Dispatch] Global PO not created — Exxaro Resources Purchase Order #GG80700992')
  })

  it('falls back again when there is no subject either', () => {
    const { subject } = buildIngestFailureEmail({ reason: 'r', details: 'd' })
    expect(subject).toBe('[Dispatch] Global PO not created — unknown PO')
  })

  it('states the reason, the detail and the next action', () => {
    const { html } = buildIngestFailureEmail({
      reason: 'The email could not be read',
      details: 'No "PO ID" field found',
      action: 'Create this purchase order by hand.',
    })
    expect(html).toContain('The email could not be read')
    expect(html).toContain('No &quot;PO ID&quot; field found')
    expect(html).toContain('Create this purchase order by hand.')
  })

  it('omits the action block when there is nothing useful to say', () => {
    const { html } = buildIngestFailureEmail({ reason: 'r', details: 'd' })
    expect(html).not.toContain('What to do:')
  })

  it('renders every PO line so support can key the order in by hand', () => {
    const { html } = buildIngestFailureEmail({ reason: 'r', details: 'd', po: PO })
    expect(html).toContain('GG80700992')
    expect(html).toContain('2026-07-15')
    expect(html).toContain('4873.26 ZAR')
    expect(html).toContain('37869')
    expect(html).toContain('49 PKT')
    expect(html).toContain('37865')
    expect(html).toContain('14 PKT')
  })

  it('says so when the PO carries no date', () => {
    const { html } = buildIngestFailureEmail({ reason: 'r', details: 'd', po: { ...PO, poDate: null } })
    expect(html).toContain('not stated')
  })

  it('lists the unknown codes when that was the failure', () => {
    const { html } = buildIngestFailureEmail({
      reason: 'Some item codes are not in the inventory',
      details: 'd',
      po: PO,
      unknownCodes: ['37869', '37865'],
    })
    expect(html).toContain('37869, 37865')
  })

  it('includes the original email so support need not hunt for it', () => {
    const { html } = buildIngestFailureEmail({ reason: 'r', details: 'd', body: 'PO ID  GG80700992' })
    expect(html).toContain('Original email')
    expect(html).toContain('PO ID GG80700992'.replace(' GG', '  GG'))
  })

  it('omits the original-email block when the body is empty', () => {
    expect(buildIngestFailureEmail({ reason: 'r', details: 'd', body: '   ' }).html).not.toContain('Original email')
    expect(buildIngestFailureEmail({ reason: 'r', details: 'd' }).html).not.toContain('Original email')
  })

  it('escapes the email body rather than letting it inject markup', () => {
    // The body is third-party input rendered into an HTML mail.
    const { html } = buildIngestFailureEmail({
      reason: 'r',
      details: 'd',
      body: '<script>alert(1)</script> & "quoted" \'single\'',
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('&amp;')
    expect(html).toContain('&quot;quoted&quot;')
    expect(html).toContain('&#39;single&#39;')
  })

  it('escapes markup coming through the PO lines and metadata', () => {
    const { html } = buildIngestFailureEmail({
      reason: '<b>r</b>',
      details: 'd',
      from: '<script>x</script>',
      emailSubject: '<i>s</i>',
      po: { ...PO, lines: [{ code: '<a>', name: '<img src=x>', quantity: 1, uom: '<u>' }] },
    })
    expect(html).not.toContain('<b>r</b>')
    expect(html).not.toContain('<script>x</script>')
    expect(html).not.toContain('<i>s</i>')
    expect(html).not.toContain('<img src=x>')
    expect(html).toContain('&lt;img src=x&gt;')
  })
})
