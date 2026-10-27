import { Router, type Request, type Response } from "express";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { ServerList } from "../models/ServerList";
import { User } from "../models/User";
import { ApiError } from "../utils/ApiError";

const MAX_URLS = 20;

/** https (or http on localhost) only, no credentials or query; a bare host gets the /api path the apps expect. */
export function cleanServerUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value ?? "").trim());
    const local = ["localhost", "127.0.0.1", "10.0.2.2"].includes(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    const path = url.pathname.replace(/\/+$/, "") || "/api";
    return url.origin + path;
  } catch {
    return null;
  }
}

async function currentUrls(): Promise<string[]> {
  const doc = await ServerList.findById("global").lean();
  return doc?.urls ?? [];
}

/** /api/servers: the apps read the list (public); an admin replaces it. */
export const serverApiRouter = Router();

serverApiRouter.get("/", (_req: Request, res: Response, next) => {
  currentUrls()
    .then((urls) => {
      res.set("Cache-Control", "no-store");
      res.json({ urls });
    })
    .catch(next);
});

serverApiRouter.put("/", requireAuth, requireAdmin, (req: Request, res: Response, next) => {
  void (async () => {
    const raw: unknown = req.body?.urls;
    if (!Array.isArray(raw)) throw ApiError.badRequest("Send { urls: [...] }.");
    if (raw.length > MAX_URLS) throw ApiError.badRequest(`Save at most ${MAX_URLS} server URLs.`);
    const urls: string[] = [];
    for (const item of raw) {
      const cleaned = cleanServerUrl(item);
      if (!cleaned) throw ApiError.badRequest(`"${String(item)}" is not a valid server URL (use https://...).`);
      if (!urls.includes(cleaned)) urls.push(cleaned);
    }
    const user = await User.findById(req.userId).select("name mobileNumber");
    await ServerList.findByIdAndUpdate(
      "global",
      { $set: { urls, updatedBy: user?.name ?? "" } },
      { upsert: true, setDefaultsOnInsert: true }
    );
    res.json({ urls });
  })().catch(next);
});

/** The admin page. Scripts are served as a file because helmet's CSP blocks inline ones. */
export const serverAdminPageRouter = Router();

serverAdminPageRouter.get("/", (_req, res) => {
  res.type("html").send(ADMIN_HTML);
});
serverAdminPageRouter.get("/app.js", (_req, res) => {
  res.type("application/javascript").send(ADMIN_JS);
});

const ADMIN_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Server URLs</title>
<style>
body{font:15px system-ui,sans-serif;margin:0;background:#f4f5f7;color:#1c1e21}
main{max-width:640px;margin:0 auto;padding:20px 16px 60px}
h1{font-size:20px}.card{background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 3px #0002;margin-bottom:16px}
input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #c9ccd1;border-radius:8px;font:inherit;margin:4px 0 10px}
button{padding:9px 14px;border:0;border-radius:8px;background:#2563eb;color:#fff;font:inherit;cursor:pointer}
button.ghost{background:#e5e7eb;color:#111}button.danger{background:#dc2626}
.row{display:flex;gap:6px;align-items:center;margin-bottom:8px}.row input{margin:0;flex:1}
.status{font-size:12px;min-width:64px;text-align:center}.ok{color:#15803d}.bad{color:#b91c1c}.muted{color:#6b7280;font-size:13px}
#msg{margin-top:10px;font-size:14px}[hidden]{display:none}
</style></head><body><main>
<h1>Server URLs</h1>
<p class="muted">The app reads this list every time it starts and uses the first server that answers. Save several for automatic fallback.</p>
<section class="card" id="login">
  <label>Mobile number<input id="mobile" inputmode="numeric" autocomplete="username"></label>
  <label>MPIN<input id="mpin" type="password" inputmode="numeric" autocomplete="current-password"></label>
  <button id="signin">Sign in (admin)</button>
</section>
<section class="card" id="panel" hidden>
  <div id="list"></div>
  <div class="row"><button class="ghost" id="add">+ Add URL</button><button class="ghost" id="checkAll">Check all</button><button id="save">Save</button><button class="ghost" id="signout">Sign out</button></div>
</section>
<div id="msg"></div>
</main><script src="/admin/servers/app.js"></script></body></html>`;

const ADMIN_JS = `(function(){
var $=function(id){return document.getElementById(id)};
var token=null;try{token=sessionStorage.getItem("srvtoken")}catch(e){}
function say(t,bad){var m=$("msg");m.textContent=t;m.className=bad?"bad":"ok"}
function api(path,opts){opts=opts||{};opts.headers=Object.assign({"Content-Type":"application/json"},token?{Authorization:"Bearer "+token}:{},opts.headers||{});
  return fetch(path,opts).then(function(r){return r.json().catch(function(){return{}}).then(function(b){if(!r.ok)throw new Error((b.error&&b.error.message)||b.message||("Error "+r.status));return b})})}
function row(url){var d=document.createElement("div");d.className="row";
  d.innerHTML='<input placeholder="https://your-server.onrender.com/api"><span class="status muted"></span><button class="ghost up" title="Move up">↑</button><button class="danger rm" title="Remove">✕</button>';
  d.querySelector("input").value=url||"";
  d.querySelector(".rm").onclick=function(){d.remove()};
  d.querySelector(".up").onclick=function(){if(d.previousElementSibling)d.parentNode.insertBefore(d,d.previousElementSibling)};
  d.querySelector("input").onchange=function(){check(d)};
  $("list").appendChild(d)}
function urls(){return Array.prototype.map.call($("list").querySelectorAll("input"),function(i){return i.value.trim()}).filter(Boolean)}
function check(d){var s=d.querySelector(".status"),v=d.querySelector("input").value.trim().replace(/\\/+$/,"").replace(/\\/api$/,"");
  if(!v){s.textContent="";return}s.textContent="…";s.className="status muted";
  var c=new AbortController(),t=setTimeout(function(){c.abort()},60000);
  fetch(v+"/health",{signal:c.signal}).then(function(r){s.textContent=r.ok?"up":"down";s.className="status "+(r.ok?"ok":"bad")}).catch(function(){s.textContent="down";s.className="status bad"}).then(function(){clearTimeout(t)})}
function show(){$("login").hidden=!!token;$("panel").hidden=!token}
function load(){$("list").innerHTML="";return api("/api/servers").then(function(b){(b.urls.length?b.urls:[""]).forEach(row);$("list").querySelectorAll(".row").forEach(check)})}
$("add").onclick=function(){row("")};
$("checkAll").onclick=function(){$("list").querySelectorAll(".row").forEach(check)};
$("save").onclick=function(){api("/api/servers",{method:"PUT",body:JSON.stringify({urls:urls()})}).then(function(b){say("Saved "+b.urls.length+" server(s). Apps pick this up the next time they start.");return load()}).catch(function(e){say(e.message,true);if(/token|Unauthorized|expired/i.test(e.message)){token=null;show()}})};
$("signin").onclick=function(){api("/api/auth/login",{method:"POST",body:JSON.stringify({mobileNumber:$("mobile").value.trim(),mpin:$("mpin").value})}).then(function(b){token=b.accessToken;try{sessionStorage.setItem("srvtoken",token)}catch(e){}$("mpin").value="";say("");show();return load()}).catch(function(e){say(e.message,true)})};
$("signout").onclick=function(){token=null;try{sessionStorage.removeItem("srvtoken")}catch(e){}show()};
show();load().catch(function(e){say(e.message,true)});
})();`;
