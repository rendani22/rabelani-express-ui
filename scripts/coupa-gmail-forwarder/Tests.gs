/**
 * Manual tests for the forwarder. Paste alongside Code.gs, pick a function in
 * the Apps Script editor's dropdown, hit Run, read Execution log.
 *
 * These work because `handleMessage` is duck-typed: it only ever calls
 * getFrom/getSubject/getPlainBody/getBody on the message and addLabel on the
 * thread. Apps Script has no type checking, so plain objects stand in for the
 * real Gmail classes and nothing touches the mailbox.
 *
 * ---------------------------------------------------------------------------
 * THESE POST FOR REAL.
 *
 * `handleMessage` calls the ingestion function, which audits every attempt.
 * A test run therefore lands in the audit log and on the Executive dashboard's
 * processed/failed card, and a rejection emails support -- exactly as a real
 * email would, because as far as the function is concerned it IS one.
 *
 * So: point INGEST_URL at the int project while testing, and use the throwaway
 * PO number below rather than a real one -- a successful test creates a real
 * draft purchase order, and PO numbers are UNIQUE, so testing with a genuine
 * number burns it (the real email would then 409 as a duplicate).
 * ---------------------------------------------------------------------------
 */

/** A throwaway PO number. Never reuse a real one -- see the header. */
var TEST_PO_NUMBER = 'ZZTEST0001'

/**
 * The GG80700992 notification, trimmed to what the parser reads, with a
 * throwaway PO number. Mirrors the SAMPLE in _shared/coupa-po.test.ts.
 */
function sampleCoupaBody() {
  return [
    'Exxaro Resources Purchase Order #' + TEST_PO_NUMBER,
    '',
    'Submitted By    Ramadimetja Maria Mochaki',
    'On Behalf Of    Ramadimetja Maria Mochaki',
    'Supplier    100092635 - Rabelani MM Trading Enterprise CC',
    'Total    4,873.26 ZAR',
    '',
    'More Detail',
    'PO ID    ' + TEST_PO_NUMBER + '        Department    None',
    'Order Date    07/15/2026        Acknowledged At    None',
    '',
    'Lines',
    '49 PKT 37869 - VOUCHER:OVERTIME MEAL,TICKET for 3,628.94 ZAR',
    'Supplier 100092635 • Need By 07/17/2026',
    '',
    '14 PKT 37865 - VOUCHER:OVERTIME MEAL ,TICKET for 1,244.32 ZAR',
    'Supplier 100092635 • Need By 07/17/2026',
    '',
    'Total    4,873.26    ZAR',
  ].join('\n')
}

/** A stand-in GmailMessage. Only the four getters handleMessage calls. */
function fakeMessage(from, subject, text) {
  return {
    getFrom: function () {
      return from
    },
    getSubject: function () {
      return subject
    },
    getPlainBody: function () {
      return text
    },
    getBody: function () {
      return '<pre>' + text + '</pre>'
    },
  }
}

/**
 * A stand-in GmailThread that records the label instead of applying it, so a
 * test can assert the routing decision without mutating the mailbox.
 */
function fakeThread() {
  var applied = []
  return {
    addLabel: function (label) {
      applied.push(String(label))
    },
    applied: applied,
  }
}

/** Labels are only ever stringified into the log here, so a name will do. */
function fakeLabel(name) {
  return name
}

/** Reads the same Script Properties the real run uses. */
function testConfig() {
  var props = PropertiesService.getScriptProperties()
  var url = props.getProperty(PROP_URL)
  var secret = props.getProperty(PROP_SECRET)
  if (!url || !secret) throw new Error('Set ' + PROP_URL + ' and ' + PROP_SECRET + ' first.')
  return { url: url, secret: secret }
}

/** Runs handleMessage against a fake message and reports which label it chose. */
function runCase(name, message) {
  var cfg = testConfig()
  var thread = fakeThread()
  handleMessage(message, thread, cfg.url, cfg.secret, fakeLabel(LABEL_DONE), fakeLabel(LABEL_EXCEPTION))
  var outcome = thread.applied.length ? thread.applied.join(', ') : '(none — will retry next run)'
  console.log('[' + name + '] label: ' + outcome)
  return thread.applied
}

// ── the cases ───────────────────────────────────────────────────────────────

/**
 * The happy path: a well-formed Coupa email.
 *
 * Expect `Coupa/Ingested` once the customer and both item SKUs exist, and
 * `Coupa/Exception` before that (422 — the customer or the codes are unknown).
 * Both are correct; the second is the system refusing to guess. Run it twice
 * and the second run should be Exception (409, already recorded) — which is
 * also the duplicate path working.
 */
function test_happyPath() {
  runCase('happy path', fakeMessage(
    'Coupa <do_not_reply@exxaro.coupahost.com>',
    'Purchase Order #' + TEST_PO_NUMBER,
    sampleCoupaBody()
  ))
}

/**
 * A non-Coupa sender. Expect `Coupa/Ingested` (a 2xx): the function returns 202
 * "ignored", recording nothing. Labelling it is right — nothing was lost, and
 * the thread should not be looked at again.
 *
 * In practice the Gmail query never surfaces these; this covers the case where
 * someone forwards junk into the mailbox by hand.
 */
function test_ignoresNonCoupaSender() {
  runCase('non-coupa sender', fakeMessage(
    'Someone Else <someone@example.com>',
    'Lunch?',
    sampleCoupaBody()
  ))
}

/**
 * An unreadable body. Expect `Coupa/Exception` (422) and a support email —
 * this is the shape of a Coupa template change.
 */
function test_unparseableBody() {
  runCase('unparseable', fakeMessage(
    'Coupa <do_not_reply@exxaro.coupahost.com>',
    'Purchase Order #' + TEST_PO_NUMBER,
    'Hi Supplier,\n\nAn order was issued.\n'
  ))
}

/**
 * A name that is nobody's. Expect `Coupa/Exception` (422) naming the customer —
 * the case that prompted all of this.
 */
function test_unknownCustomer() {
  runCase('unknown customer', fakeMessage(
    'Coupa <do_not_reply@exxaro.coupahost.com>',
    'Purchase Order #' + TEST_PO_NUMBER,
    sampleCoupaBody().replace(/Ramadimetja Maria Mochaki/g, 'Nobody Atall')
  ))
}

/**
 * A deliberately wrong secret. Expect NO label — the function 401s, records
 * nothing, and the email must stay queued for a retry once the config is fixed.
 *
 * This is the one test that proves the retry/terminal split, which is the part
 * of the script most likely to be got wrong.
 */
function test_badSecretIsRetriedNotDropped() {
  var cfg = testConfig()
  var thread = fakeThread()
  handleMessage(
    fakeMessage('Coupa <do_not_reply@exxaro.coupahost.com>', 'Purchase Order #' + TEST_PO_NUMBER, sampleCoupaBody()),
    thread,
    cfg.url,
    'definitely-not-the-secret',
    fakeLabel(LABEL_DONE),
    fakeLabel(LABEL_EXCEPTION)
  )
  console.log(
    thread.applied.length === 0
      ? '[bad secret] PASS — unlabelled, will retry'
      : '[bad secret] FAIL — labelled ' + thread.applied.join(', ') + ', the email would be dropped'
  )
}

/**
 * An unreachable endpoint. Expect NO label and a logged error: nothing reached
 * the function, so the email must stay queued.
 */
function test_unreachableEndpointIsRetried() {
  var cfg = testConfig()
  var thread = fakeThread()
  handleMessage(
    fakeMessage('Coupa <do_not_reply@exxaro.coupahost.com>', 'Purchase Order #' + TEST_PO_NUMBER, sampleCoupaBody()),
    thread,
    'https://127.0.0.1:9/nope',
    cfg.secret,
    fakeLabel(LABEL_DONE),
    fakeLabel(LABEL_EXCEPTION)
  )
  console.log(
    thread.applied.length === 0
      ? '[unreachable] PASS — unlabelled, will retry'
      : '[unreachable] FAIL — labelled ' + thread.applied.join(', ')
  )
}

/**
 * The real-mail check, once a genuine Coupa email is in the mailbox.
 *
 * Uses a real GmailMessage — so it exercises getPlainBody() against Coupa's
 * actual layout, which the fakes above cannot — but a fake thread, so nothing
 * is labelled and `forwardCoupaEmails` will still pick the email up normally.
 *
 * It WILL post it. On success that creates the real PO; the trigger then skips
 * the thread only if the real run also labels it, so expect a 409 from the
 * scheduled run afterwards.
 */
function test_againstRealMail() {
  var threads = GmailApp.search('from:' + COUPA_SENDER, 0, 1)
  if (!threads.length) {
    console.log('No Coupa mail in this mailbox. If you expected some, the script is on the wrong account.')
    return
  }
  var message = threads[0].getMessages()[0]
  console.log('Using: ' + message.getSubject() + ' from ' + message.getFrom())
  runCase('real mail', message)
}

/**
 * Proves the script is bound to the right mailbox — the failure this whole
 * setup is most likely to hit, because a wrong account looks identical to a
 * quiet week: no mail found, no errors, nothing ingested.
 */
function test_mailboxIsCorrect() {
  console.log('Running as: ' + Session.getActiveUser().getEmail())
  console.log('Coupa threads visible: ' + GmailApp.search('from:' + COUPA_SENDER).length)
}
