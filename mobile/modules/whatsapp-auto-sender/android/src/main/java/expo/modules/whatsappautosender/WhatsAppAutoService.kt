package expo.modules.whatsappautosender

import android.accessibilityservice.AccessibilityService
import android.content.ClipData
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Presses Send in WhatsApp for one job at a time. JS (WhatsAppAutoSenderModule) hands over a job; this service opens the
 * chat, finds the Send button and taps it, then brings We Three back to the front. It only looks at WhatsApp windows
 * (see res/xml/whatsapp_auto_accessibility.xml) and only while a job is running.
 */
class WhatsAppAutoService : AccessibilityService() {
  private val handler = Handler(Looper.getMainLooper())

  private val tick = object : Runnable {
    override fun run() {
      try {
        step()
      } catch (_: Exception) {
        // A node can disappear mid-read: the next tick tries again.
      }
      if (job != null) handler.postDelayed(this, TICK_MS)
    }
  }

  override fun onServiceConnected() {
    instance = this
  }

  override fun onDestroy() {
    if (instance === this) instance = null
    handler.removeCallbacksAndMessages(null)
    super.onDestroy()
  }

  override fun onInterrupt() {}

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    // Work happens on the tick, so a burst of events costs nothing.
  }

  private fun startJobInternal(j: Job) {
    job = j
    handler.removeCallbacks(tick)
    handler.postDelayed(tick, 1200)
    val intent = j.intent
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    startActivity(intent)
  }

  private fun finish(ok: Boolean, message: String) {
    state = if (ok) "done" else "failed"
    stateMessage = message
    job = null
    handler.removeCallbacks(tick)
    // Back to We Three so the next lead can be opened.
    handler.postDelayed({
      packageManager.getLaunchIntentForPackage(packageName)?.let {
        it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
        try { startActivity(it) } catch (_: Exception) {}
      }
    }, 600)
  }

  private fun step() {
    val j = job ?: return
    val now = System.currentTimeMillis()
    if (now - j.startedAt > JOB_TIMEOUT_MS) {
      finish(false, if (j.clicks > 0) "WhatsApp did not confirm the send" else "Timed out waiting for WhatsApp")
      return
    }
    val root = rootInActiveWindow ?: return
    val pkg = root.packageName?.toString() ?: return
    if (pkg != "com.whatsapp" && pkg != "com.whatsapp.w4b") return

    // "Phone number is not on WhatsApp" style dialogs.
    val bad = root.findAccessibilityNodeInfosByText("isn't on WhatsApp") + root.findAccessibilityNodeInfosByText("not on WhatsApp") +
      root.findAccessibilityNodeInfosByText("invalid")
    if (bad.isNotEmpty() && j.clicks == 0) {
      root.findAccessibilityNodeInfosByText("OK").firstOrNull()?.let { clickNode(it) }
      finish(false, "That number is not on WhatsApp")
      return
    }

    // Sending to a named chat from the "Send to…" list (only used for testing).
    if (j.chatName != null && !j.picked) {
      if (pickChat(root, pkg, j)) return
    }

    val send = findSend(root, pkg)
    if (send != null) {
      // Give the screen a moment to settle (and avoid double-tapping the same button).
      if (now - j.lastClickAt > 1800) {
        if (clickNode(send)) {
          j.clicks += 1
          j.lastClickAt = now
        }
      }
      return
    }

    // No Send button and we have pressed one: back in the chat means it went through.
    if (j.clicks > 0 && now - j.lastClickAt > 1500) {
      val inChat = root.findAccessibilityNodeInfosByViewId("$pkg:id/entry").isNotEmpty() ||
        root.findAccessibilityNodeInfosByViewId("$pkg:id/conversation_row_root").isNotEmpty() ||
        root.findAccessibilityNodeInfosByViewId("$pkg:id/voice_note_btn").isNotEmpty()
      if (inChat || now - j.lastClickAt > 6000) finish(true, "Sent")
    }
  }

  private fun findSend(root: AccessibilityNodeInfo, pkg: String): AccessibilityNodeInfo? {
    root.findAccessibilityNodeInfosByViewId("$pkg:id/send").firstOrNull { it.isEnabled }?.let { return it }
    return root.findAccessibilityNodeInfosByText("Send").firstOrNull {
      it.isEnabled && it.isClickable && it.className?.toString()?.contains("ImageButton") == true
    }
  }

  /** Search the "Send to…" list for the chat name and tap it. Returns true while it is still working on that. */
  private fun pickChat(root: AccessibilityNodeInfo, pkg: String, j: Job): Boolean {
    val name = j.chatName ?: return false
    // Already inside a chat or preview (Send visible): nothing to pick.
    if (findSend(root, pkg) != null && j.typedSearch) {
      j.picked = true
      return false
    }
    val box = root.findAccessibilityNodeInfosByViewId("$pkg:id/search_src_text").firstOrNull()
    if (box == null) {
      val icon = root.findAccessibilityNodeInfosByViewId("$pkg:id/menuitem_search").firstOrNull()
        ?: root.findAccessibilityNodeInfosByText("Search").firstOrNull { it.isClickable }
      if (icon != null) {
        clickNode(icon)
        return true
      }
      return false
    }
    if (!j.typedSearch) {
      val args = Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, name) }
      box.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
      j.typedSearch = true
      return true
    }
    val hit = root.findAccessibilityNodeInfosByText(name).firstOrNull { it.viewIdResourceName?.endsWith("search_src_text") != true }
    if (hit != null) {
      clickNode(hit)
      j.picked = true
      return true
    }
    return true
  }

  private fun clickNode(node: AccessibilityNodeInfo): Boolean {
    var n: AccessibilityNodeInfo? = node
    var depth = 0
    while (n != null && depth < 6) {
      if (n.isClickable && n.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true
      n = n.parent
      depth += 1
    }
    return false
  }

  class Job(val intent: Intent, val chatName: String?) {
    val startedAt = System.currentTimeMillis()
    var clicks = 0
    var lastClickAt = 0L
    var typedSearch = false
    var picked = chatName == null
  }

  companion object {
    private const val TICK_MS = 700L
    private const val JOB_TIMEOUT_MS = 75_000L

    @Volatile var instance: WhatsAppAutoService? = null
    @Volatile var job: Job? = null
    @Volatile var state: String = "idle"
    @Volatile var stateMessage: String = ""

    fun isRunning(): Boolean = instance != null

    /** Builds the intent for a chat, then opens it from the service (which may start activities from the background). */
    fun start(
      packageName: String,
      imageUri: String?,
      mime: String,
      text: String,
      digits: String?,
      chatName: String?
    ): Boolean {
      val svc = instance ?: return false
      val intent: Intent
      if (imageUri != null) {
        val uri = Uri.parse(imageUri)
        intent = Intent(Intent.ACTION_SEND).apply {
          type = mime
          setPackage(packageName)
          putExtra(Intent.EXTRA_STREAM, uri)
          if (text.isNotEmpty()) putExtra(Intent.EXTRA_TEXT, text)
          if (!digits.isNullOrEmpty()) putExtra("jid", "$digits@s.whatsapp.net")
          clipData = ClipData.newRawUri("", uri)
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
      } else {
        val url = "https://wa.me/${digits ?: ""}?text=" + Uri.encode(text)
        intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply { setPackage(packageName) }
      }
      state = "running"
      stateMessage = ""
      svc.startJobInternal(Job(intent, chatName))
      return true
    }

    fun cancel() {
      job = null
      state = "idle"
      stateMessage = ""
      instance?.handler?.removeCallbacksAndMessages(null)
    }
  }
}
