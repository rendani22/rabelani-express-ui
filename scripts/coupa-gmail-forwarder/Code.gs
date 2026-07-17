/**
 * Coupa PO email -> Dispatch ingestion forwarder.
 *
 * Runs in Google Apps Script, bound to the mailbox Coupa sends purchase-order
 * notifications to. It is the "inbound mail provider" in the ingestion design:
 * `supabase/functions/ingest-coupa-po` is a webhook that holds no mail
 * credentials and polls nothing, so something has to hand it the mail. This is
 * that something.
 *
 * It lives in this repo so it is reviewable and version-controlled, but it does
 * NOT run from here -- paste it into the Apps Script project (see
 * docs/coupa-po-ingestion.md, "Monitoring the mailbox").
 *
 * ---------------------------------------------------------------------------
 * WHY LABELS AND NOT UNREAD-STATE
 *
 * A human opening the mailbox would mark mail read and this would stop
 * forwarding it. Labels are the script's own state, invisible to normal
 * mailbox use, and they are applied on EVERY terminal outcome -- success and
 * failure alike.
 *
 * WHY A FAILED INGESTION IS STILL "HANDLED"
 *
 * This is the important one. When the function rejects an email (422/409) it
 * has already done everything a retry would do: written an audit row, queued
 * the email for an admin, and emailed support. Re-posting the same mail a
 * minute later would email support again and re-count the same failure. So a
 * rejection is terminal here: labelled, left alone, and visible in Gmail under
 * the exception label.
 *
 * Retrying is NOT this script's job. The email is queued in
 * `coupa_ingestion_failures` and an admin replays it from the Global PO page,
 * which re-runs ingestion against the stored copy. Removing the Gmail label
 * would also work, but it is the slower, blunter path -- and it will stop
 * working if the mailbox ever moves.
 *
 * Only outcomes where the function did NOT record anything are retried: it was
 * unreachable, or it is misconfigured (503) and will start working once the
 * secret is set.
 * ---------------------------------------------------------------------------
 */

/** Set in Project Settings -> Script Properties. Never hard-code the secret. */
var PROP_SECRET = 'COUPA_INGEST_SECRET'
var PROP_URL = 'INGEST_URL'

/** Only this sender's mail is forwarded, matching the function's own selector. */
var COUPA_SENDER = 'do_not_reply@exxaro.coupahost.com'

var LABEL_DONE = 'Coupa/Ingested'
var LABEL_EXCEPTION = 'Coupa/Exception'

/**
 * Threads handled per run. The trigger fires every minute, so this is a
 * throughput cap, not a limit on the backlog -- it only bounds how much one
 * execution does, keeping it inside the Apps Script runtime quota.
 */
var BATCH_SIZE = 10

/** The trigger entry point. */
function forwardCoupaEmails() {
  var props = PropertiesService.getScriptProperties()
  var secret = props.getProperty(PROP_SECRET)
  var url = props.getProperty(PROP_URL)

  if (!secret || !url) {
    // Fail loudly: a silent no-op here looks identical to "no POs arrived".
    throw new Error('Set ' + PROP_SECRET + ' and ' + PROP_URL + ' in Script Properties.')
  }

  var done = getOrCreateLabel(LABEL_DONE)
  var exception = getOrCreateLabel(LABEL_EXCEPTION)

  // -label: excludes anything already handled, so a thread is never posted
  // twice. This is the whole idempotency story on this side of the wire.
  var query =
    'from:' + COUPA_SENDER + ' -label:"' + LABEL_DONE + '" -label:"' + LABEL_EXCEPTION + '"'

  var threads = GmailApp.search(query, 0, BATCH_SIZE)

  for (var i = 0; i < threads.length; i++) {
    var messages = threads[i].getMessages()
    for (var j = 0; j < messages.length; j++) {
      handleMessage(messages[j], threads[i], url, secret, done, exception)
    }
  }
}

/** Posts one message and labels its thread according to the outcome. */
function handleMessage(message, thread, url, secret, done, exception) {
  var payload = {
    from: message.getFrom(),
    subject: message.getSubject(),
    // The function prefers text/plain and only falls back to flattening HTML.
    // getPlainBody() is Gmail's own text part, so the parser gets its best
    // input -- the column runs the layout depends on survive.
    text: message.getPlainBody(),
    html: message.getBody(),
  }

  var response
  try {
    response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'X-Ingest-Secret': secret },
      payload: JSON.stringify(payload),
      // Without this, any non-2xx throws and the status code is unreadable --
      // and every outcome below would collapse into "retry forever".
      muteHttpExceptions: true,
    })
  } catch (err) {
    // Network-level failure: nothing reached the function, so nothing was
    // recorded. Leave the thread unlabelled and let the next run retry it.
    console.error('Could not reach the ingestion function: ' + err)
    return
  }

  var status = response.getResponseCode()
  var body = response.getContentText()

  if (status >= 200 && status < 300) {
    // 200 = a Global PO exists. 202 = not a Coupa PO after all; the function
    // ignored it and recorded nothing, which is correct and not an exception.
    thread.addLabel(done)
    console.log('Ingested: ' + message.getSubject() + ' -> ' + body)
    return
  }

  if (status === 503 || status === 401) {
    // The function is misconfigured (secret unset, or ours is wrong). It
    // recorded nothing and emailed nobody, so retrying is free and will start
    // working the moment the config is fixed. Left unlabelled deliberately.
    console.error('Ingestion is not accepting mail (' + status + '): ' + body)
    return
  }

  // 400/409/422/500: the function has already audited this attempt and emailed
  // support. Retrying would duplicate both. Terminal -- see the header note.
  thread.addLabel(exception)
  console.warn('Not ingested (' + status + '): ' + message.getSubject() + ' -> ' + body)
}

function getOrCreateLabel(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name)
}

/**
 * Run once, by hand, from the Apps Script editor to install the trigger.
 * Removes its own duplicates first so re-running cannot stack up triggers that
 * would each forward the same mail.
 */
function installTrigger() {
  var triggers = ScriptApp.getProjectTriggers()
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'forwardCoupaEmails') {
      ScriptApp.deleteTrigger(triggers[i])
    }
  }
  ScriptApp.newTrigger('forwardCoupaEmails').timeBased().everyMinutes(1).create()
}
