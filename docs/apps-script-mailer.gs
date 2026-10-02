/**
 * Mailer web app for the Tasks backend.
 *
 * Setup:
 *  1. script.google.com -> New project -> paste this file.
 *  2. Project Settings (gear) -> Script properties -> add MAIL_SECRET = a long random string.
 *  3. Deploy -> New deployment -> type "Web app" -> Execute as: Me -> Who has access: Anyone.
 *  4. Copy the Web app URL into Render as MAIL_WEBHOOK_URL, and the same secret as MAIL_WEBHOOK_SECRET.
 *  After editing the code, use Deploy -> Manage deployments -> Edit -> New version (the URL stays the same).
 */

var MAX_RECIPIENTS = 5;

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    var secret = PropertiesService.getScriptProperties().getProperty("MAIL_SECRET");
    if (!secret || data.secret !== secret) return reply({ ok: false, error: "Unauthorized" });

    var to = (data.to || []).filter(function (a) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a); });
    if (to.length === 0) return reply({ ok: false, error: "No valid recipient" });
    if (to.length > MAX_RECIPIENTS) return reply({ ok: false, error: "Too many recipients" });

    var attachments = (data.attachments || []).map(function (a) {
      return Utilities.newBlob(Utilities.base64Decode(a.base64), a.contentType, a.filename);
    });

    MailApp.sendEmail({
      to: to.join(","),
      subject: data.subject || "Money report",
      body: data.text || "",
      name: "Tasks app",
      attachments: attachments,
    });

    return reply({ ok: true });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  }
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Run once from the editor to grant the Gmail permission before deploying.
function authorize() {
  MailApp.getRemainingDailyQuota();
}
