package expo.modules.whatsappautosender

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.ClipData
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Path
import android.graphics.Rect
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
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
      } catch (e: Throwable) {
        // A node can disappear mid-read: the next tick tries again. Logged so a freeze can be traced.
        Log.e(TAG, "step failed", e)
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

  /** While a send runs, the on-screen keyboard is kept hidden so it can't cover or change WhatsApp's screens. */
  private fun setKeyboardHidden(hidden: Boolean) {
    try {
      softKeyboardController.showMode = if (hidden) SHOW_MODE_HIDDEN else SHOW_MODE_AUTO
    } catch (e: Throwable) {
      Log.e(TAG, "keyboard mode failed", e)
    }
  }

  private fun startJobInternal(j: Job) {
    Log.d(TAG, "job start attach=${j.attach} intent=${j.intent.data}")
    setKeyboardHidden(true)
    job = j
    handler.removeCallbacks(tick)
    handler.postDelayed(tick, 1200)
    val intent = j.intent
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    startActivity(intent)
  }

  private fun finish(ok: Boolean, message: String) {
    Log.d(TAG, "job finish ok=$ok msg=$message")
    setKeyboardHidden(false)
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
    // The active window can be the keyboard or a system sheet, so look for the WhatsApp or permission window instead.
    val active = rootInActiveWindow
    val activePkg = active?.packageName?.toString()
    val root = if (activePkg == "com.whatsapp.w4b" || activePkg == "com.google.android.permissioncontroller") active
      else findWindowRoot("com.whatsapp.w4b") ?: findWindowRoot("com.google.android.permissioncontroller") ?: active ?: return
    val pkg = root.packageName?.toString() ?: return
    // The photo permission prompt belongs to the system, not to WhatsApp: allow it once.
    if (j.attach && pkg == "com.google.android.permissioncontroller") {
      root.findAccessibilityNodeInfosByText("Allow").firstOrNull { it.isClickable || it.parent?.isClickable == true }?.let {
        if (clickNode(it) || tapAt(it)) j.stageAt = now
      }
      return
    }
    if (pkg != "com.whatsapp.w4b") return

    // "Phone number is not on WhatsApp" style dialogs.
    val bad = root.findAccessibilityNodeInfosByText("isn't on WhatsApp") + root.findAccessibilityNodeInfosByText("not on WhatsApp") +
      root.findAccessibilityNodeInfosByText("invalid")
    if (bad.isNotEmpty() && j.clicks == 0) {
      root.findAccessibilityNodeInfosByText("OK").firstOrNull()?.let { clickNode(it) }
      finish(false, "That number is not on WhatsApp")
      return
    }

    if (j.attach) {
      attachStep(root, pkg, j, now)
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

  /**
   * Lead path: the chat was opened by number (wa.me link, text already in the box). Attach the ad from the gallery
   * picker, press Send in the preview, and wait for the chat to come back. Stages: 0 attach button, 1 Gallery,
   * 2 newest photo, 3 preview Send, 4 back in the chat.
   */
  private fun attachStep(root: AccessibilityNodeInfo, pkg: String, j: Job, now: Long) {
    if (now - j.stageAt < 900) return
    Log.d(TAG, "attach stage=${j.stage} pkg=$pkg")
    if (now - j.lastDumpAt > 6000) {
      j.lastDumpAt = now
      dumpWindows()
    }
    when (j.stage) {
      0 -> {
        val att = findAcross(pkg, "input_attach_button") ?: return
        if (clickNode(att) || tapAt(att)) {
          j.stage = 1
          j.stageAt = now
        }
      }
      1 -> {
        val g = findAcross(pkg, "pickfiletype_gallery_holder") ?: return
        if (clickNode(g) || tapAt(g)) {
          j.stage = 2
          j.stageAt = now
        }
      }
      2 -> {
        val tile = findAcross(pkg, "media_item_view") ?: return
        if (clickNode(tile) || tapAt(tile)) {
          j.stage = 3
          j.stageAt = now
        }
      }
      3 -> {
        val sb = findAcross(pkg, "send_media_btn") ?: return
        if (clickNode(sb) || tapAt(sb)) {
          j.clicks += 1
          j.stage = 4
          j.stageAt = now
        }
      }
      4 -> {
        val inPreview = findAcross(pkg, "send_media_btn") != null
        val inChat = findAcross(pkg, "input_attach_button") != null
        if (inChat && !inPreview && now - j.stageAt > 2000) finish(true, "Sent")
      }
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
    // The picker row is not clickable itself (its parents aren't either), so tap where it is on screen.
    val hit = root.findAccessibilityNodeInfosByText(name).firstOrNull { it.viewIdResourceName?.endsWith("search_src_text") != true }
    if (hit != null) {
      if (clickNode(hit) || tapAt(hit)) {
        j.picked = true
      }
      return true
    }
    return true
  }

  /** Debug: what the service can see in each window (package, size, and whether the chat buttons are present). */
  private fun dumpWindows() {
    try {
      for (w in windows) {
        val r = w.root
        val pk = r?.packageName
        val attach = r?.findAccessibilityNodeInfosByViewId("com.whatsapp.w4b:id/input_attach_button")?.size
        val entry = r?.findAccessibilityNodeInfosByViewId("com.whatsapp.w4b:id/entry")?.size
        Log.d(TAG, "window id=${w.id} type=${w.type} layer=${w.layer} active=${w.isActive} pkg=$pk children=${r?.childCount} attach=$attach entry=$entry")
      }
      Log.d(TAG, "activeRoot pkg=${rootInActiveWindow?.packageName}")
    } catch (e: Throwable) {
      Log.e(TAG, "dumpWindows failed", e)
    }
  }

  /** The first node with this id in any on-screen window of WhatsApp (the chat list and the chat can be separate windows). */
  private fun findAcross(pkg: String, idName: String): AccessibilityNodeInfo? {
    for (w in windows) {
      val r = w.root ?: continue
      if (r.packageName?.toString() != pkg) continue
      r.findAccessibilityNodeInfosByViewId("$pkg:id/$idName").firstOrNull()?.let { return it }
    }
    return null
  }

  /** The root of the first on-screen window that belongs to `packageName`, or null. */
  private fun findWindowRoot(packageName: String): AccessibilityNodeInfo? {
    for (w in windows) {
      val r = w.root ?: continue
      if (r.packageName?.toString() == packageName) return r
    }
    return null
  }

  /** Taps the centre of a node on screen. Used when the node and its parents don't accept a click action. */
  private fun tapAt(node: AccessibilityNodeInfo): Boolean {
    val r = Rect()
    node.getBoundsInScreen(r)
    if (r.width() <= 0 || r.height() <= 0) return false
    val path = Path().apply { moveTo(r.exactCenterX(), r.exactCenterY()) }
    val gesture = GestureDescription.Builder()
      .addStroke(GestureDescription.StrokeDescription(path, 0, 60))
      .build()
    return dispatchGesture(gesture, null, null)
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

  class Job(val intent: Intent, val chatName: String?, val attach: Boolean = false) {
    val startedAt = System.currentTimeMillis()
    var stage = 0
    var stageAt = 0L
    var lastDumpAt = 0L
    var clicks = 0
    var lastClickAt = 0L
    var typedSearch = false
    var picked = chatName == null
  }

  companion object {
    private const val TICK_MS = 700L
    private const val SHOW_MODE_AUTO = AccessibilityService.SHOW_MODE_AUTO
    private const val SHOW_MODE_HIDDEN = AccessibilityService.SHOW_MODE_HIDDEN
    private const val JOB_TIMEOUT_MS = 75_000L

    @Volatile var instance: WhatsAppAutoService? = null
    @Volatile var job: Job? = null
    @Volatile var state: String = "idle"
    @Volatile var stateMessage: String = ""

    const val TAG = "WeThreeSend"

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
      if (!digits.isNullOrEmpty() && imageUri != null && chatName == null) {
        // Lead: open the chat by number, then attach the ad through the gallery. The ad is copied to the gallery first so
        // it is the newest photo in WhatsApp's picker.
        publishToGallery(svc, Uri.parse(imageUri), mime)
        val attachIntent = Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/$digits?text=" + Uri.encode(text)))
          .apply { setPackage(packageName) }
        state = "running"
        stateMessage = ""
        svc.startJobInternal(Job(attachIntent, null, attach = true))
        return true
      }
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

    /** Copies the ad into Pictures/WeThree under one fixed name, so each send makes it the newest photo for WhatsApp's picker. */
    private fun publishToGallery(ctx: Context, src: Uri, mime: String) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
      val resolver = ctx.contentResolver
      val name = if (mime.contains("png")) "wethree-ad.png" else if (mime.contains("webp")) "wethree-ad.webp" else "wethree-ad.jpg"
      try {
        resolver.delete(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, "${MediaStore.Images.Media.DISPLAY_NAME}=?", arrayOf(name))
        val values = ContentValues().apply {
          put(MediaStore.Images.Media.DISPLAY_NAME, name)
          put(MediaStore.Images.Media.MIME_TYPE, mime)
          put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/WeThree")
          put(MediaStore.Images.Media.IS_PENDING, 1)
        }
        val out = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: return
        resolver.openOutputStream(out)?.use { o -> resolver.openInputStream(src)?.use { it.copyTo(o) } }
        resolver.update(out, ContentValues().apply { put(MediaStore.Images.Media.IS_PENDING, 0) }, null, null)
      } catch (_: Exception) {
        // Gallery copy failed: the picker still shows the newest photo; the send may pick a different image.
      }
    }

    fun cancel() {
      Log.d(TAG, "job cancel")
      instance?.setKeyboardHidden(false)
      job = null
      state = "idle"
      stateMessage = ""
      instance?.handler?.removeCallbacksAndMessages(null)
    }
  }
}
