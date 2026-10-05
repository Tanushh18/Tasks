package expo.modules.smsexpensereader

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony

/**
 * Handles each incoming SMS. If a JS runtime is alive it gets an `onSmsReceived` event and that is all.
 * Otherwise the SMS is queued natively and a headless JS task is started to save it while the app is
 * closed. Never throws: anything that fails here is picked up by the next inbox scan.
 */
class SmsReceivedReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    try {
      if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
      val parts = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
      // A long SMS arrives as several parts from the same sender: join them back into one message.
      val bySender = LinkedHashMap<String, StringBuilder>()
      var date = System.currentTimeMillis()
      for (part in parts) {
        val sender = part.originatingAddress ?: ""
        bySender.getOrPut(sender) { StringBuilder() }.append(part.messageBody ?: "")
        if (part.timestampMillis > 0) date = part.timestampMillis
      }
      var needsHeadless = false
      for ((sender, body) in bySender) {
        // Any other sender is dropped here: never emitted, never queued.
        if (!SmsExpenseReaderModule.isAcceptedMessage(sender, body.toString())) continue
        if (!SmsExpenseReaderModule.emitReceived(sender, body.toString(), date)) {
          SmsExpenseReaderModule.enqueue(context, sender, body.toString(), date)
          needsHeadless = true
        }
      }
      if (needsHeadless) SmsHeadlessTaskService.start(context)
    } catch (_: Exception) {
      // Never crash the receiver.
    }
  }
}
