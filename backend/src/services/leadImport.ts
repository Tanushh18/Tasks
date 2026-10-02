/**
 * Turns messy spreadsheets (any column order, banner rows above the header, several numbers in one
 * cell, landlines mixed with mobiles, "IN-Stock" placeholder rows) into clean lead records.
 * Pure functions only: nothing here touches the database, so it is easy to test.
 */

export interface ParsedLead {
  phone: string;
  name: string;
  alternatePhones: string[];
  email: string;
  address: string;
  notes: string;
  info: string;
  category: string;
  plot: string;
}

export interface RejectedRow {
  tab: string;
  row: number;
  name: string;
  reason: "no_valid_mobile" | "placeholder";
  raw: string;
}

export interface TabReport {
  tab: string;
  rows: number;
  valid: number;
  noPhone: number;
  placeholder: number;
  duplicates: number;
  headerRow: number | null;
}

export interface ParseResult {
  leads: ParsedLead[];
  reports: TabReport[];
  rejected: RejectedRow[];
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '"') {
      if (quoted && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** A 10-digit Indian mobile as +91XXXXXXXXXX, or null. Accepts +91 / 91 / 0 / 0091 prefixes. */
export function normalizePhone(raw: string): string | null {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 14 && digits.startsWith("0091")) digits = digits.slice(4);
  if (digits.length === 13 && digits.startsWith("091")) digits = digits.slice(3);
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits) || /^(\d)\1{9}$/.test(digits)) return null;
  return `+91${digits}`;
}

/** Every valid mobile in a cell such as "9718108484/9911183466", "+91-98293 77877" or "`09893045118". */
export function extractPhones(cell: string): string[] {
  const out: string[] = [];
  const runs = String(cell ?? "").match(/\+?\d[\d\s().-]{6,}\d/g) ?? [];
  for (const run of runs) {
    const digits = run.replace(/\D/g, "");
    const candidates =
      digits.length === 20 ? [digits.slice(0, 10), digits.slice(10)] : digits.length > 14 ? run.split(/\s+/) : [run];
    for (const c of candidates) {
      const phone = normalizePhone(c);
      if (phone && !out.includes(phone)) out.push(phone);
    }
  }
  return out;
}

const norm = (h: string) => h.toLowerCase().replace(/[._]/g, " ").replace(/\s+/g, " ").trim();
const clean = (v: unknown, max = 500) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

const PLACEHOLDER = /^(in[\s-]?stock|file missing|unsold|vacant|blocked|n\/?a|na|nil|null|none|test|-+|\.+|0)$/i;

type Role =
  | "name1"
  | "name2"
  | "phone"
  | "landline"
  | "email"
  | "address"
  | "remark"
  | "info"
  | "category"
  | "plot"
  | "skip";

/** Decides what a header means. Order matters: the first rule that matches wins. */
export function classifyHeader(raw: string): Role {
  const h = norm(raw);
  if (!h) return "remark"; // Unnamed trailing columns usually hold free-text remarks.
  if (/landline|land line|\bfax\b|\btel\b|telephone|\bstd\b/.test(h)) return "landline";
  if (/e-?mail/.test(h)) return "email";
  if (/(name|appl).*(2nd|iind|second|co-?appl|joint)|^(co-?applicant|joint)/.test(h)) return "name2";
  if (/dealer|\brm\b|broker|agent|channel partner|father|company|project|file/.test(h)) return "info";
  if (/name|^buyer$|^owner$|^customer$|^client$/.test(h)) return "name1";
  if (/mobile|\bcell\b|contact|phone|whatsapp|\bmob\b|^number$|^ph no$/.test(h)) return "phone";
  if (/address|^city$|pin ?code|pincode|^state$|locality/.test(h)) return "address";
  if (/remark|comment|note|feedback|response|follow/.test(h)) return "remark";
  if (/campaign|ad ?name|^type$|category/.test(h)) return "category";
  if (/farukh|farrukh|^plot/.test(h)) return "plot";
  if (/^(s|sr|serial)( no)?$|^s no$|^sr no$|serial no|status of buyer|^title$|salutation|country|^ph 1$/.test(h)) return "skip";
  if (/tower|apartment|flat|\bapt\b|unit|area|payment|facing|priority|as per|plan|size|block|floor/.test(h)) return "info";
  return "skip";
}

const isNameHeader = (h: string) => classifyHeader(h) === "name1";
const isPhoneHeader = (h: string) => classifyHeader(h) === "phone";

/** First row (within the top 30) that looks like a header: has both a name-ish and a phone-ish column. */
export function findHeaderRow(rows: string[][]): number | null {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const r = rows[i];
    if (r.some(isNameHeader) && r.some(isPhoneHeader)) return i;
  }
  return null;
}

function inferCategory(hint: string) {
  const s = hint.toLowerCase();
  if (/construct/.test(s)) return "Construction";
  if (/interior/.test(s)) return "Interior";
  if (/sale|purchase|buy|sell/.test(s)) return "Sale / Purchase";
  return "";
}

function titleCaseIfShouting(name: string) {
  return name === name.toUpperCase() && /[A-Z]{3}/.test(name)
    ? name.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase())
    : name;
}

/** Parses one tab. `seen` carries phones across tabs so the same person is only kept once. */
export function parseTab(tab: string, rows: string[][], seen: Map<string, ParsedLead>, rejected: RejectedRow[]): TabReport {
  const report: TabReport = { tab, rows: 0, valid: 0, noPhone: 0, placeholder: 0, duplicates: 0, headerRow: null };
  const headerIdx = findHeaderRow(rows);
  report.headerRow = headerIdx;

  // Without a header, fall back to "first text cell is the name, any mobile anywhere is the phone".
  const headers = headerIdx === null ? [] : rows[headerIdx].map((h) => h ?? "");
  const roles = headers.map(classifyHeader);
  const context =
    headerIdx === null
      ? ""
      : rows
          .slice(0, headerIdx)
          .map((r) => r.filter((c) => c && c.trim()))
          .filter((r) => r.length === 1)
          .map((r) => clean(r[0], 80))
          .filter((t) => t && !/^buyers?$/i.test(t))
          .join(" · ");

  const body = headerIdx === null ? rows : rows.slice(headerIdx + 1);
  body.forEach((row, offset) => {
    const rowNumber = (headerIdx === null ? 0 : headerIdx + 1) + offset + 1;
    if (!row.some((c) => c && c.trim())) return;
    // A repeated header row in the middle of a tab.
    if (headerIdx !== null && row.some(isNameHeader) && row.some(isPhoneHeader)) return;
    report.rows++;

    const names: string[] = [];
    let second = "";
    const phones: string[] = [];
    const landlinePhones: string[] = [];
    const emails: string[] = [];
    const address: string[] = [];
    const remarks: string[] = [];
    const info: string[] = [];
    let category = "";
    let plot = "";

    if (headerIdx === null) {
      for (const cell of row) {
        const found = extractPhones(cell);
        if (found.length) phones.push(...found);
        else if (!names.length && /[a-z]{2}/i.test(cell)) names.push(clean(cell, 120));
      }
    } else {
      row.forEach((cellRaw, col) => {
        const cell = clean(cellRaw, 1000);
        if (!cell) return;
        const role = roles[col] ?? "remark";
        switch (role) {
          case "name1":
            if (!names.length) names.push(clean(cell, 120));
            break;
          case "name2":
            second = clean(cell, 120);
            break;
          case "phone":
            phones.push(...extractPhones(cell));
            break;
          case "landline":
            landlinePhones.push(...extractPhones(cell));
            break;
          case "email":
            for (const e of cell.split(/[;,\s]+/)) if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e)) emails.push(e.toLowerCase());
            break;
          case "address":
            if (!/^india$/i.test(cell) && !address.includes(cell)) address.push(cell);
            break;
          case "remark":
            if (!/^\d+$/.test(cell)) remarks.push(cell);
            break;
          case "category":
            category = category || inferCategory(cell);
            break;
          case "plot":
            plot = clean(cell, 120);
            break;
          case "info":
            if (!/^0+$/.test(cell)) info.push(`${clean(headers[col], 40).replace(/\s*\.$/, "")}: ${cell}`);
            break;
        }
      });
    }

    let name = titleCaseIfShouting(names[0] ?? "");
    if (PLACEHOLDER.test(name)) name = "";
    if (second && !PLACEHOLDER.test(second) && second.toLowerCase() !== name.toLowerCase()) {
      name = name ? `${name} & ${titleCaseIfShouting(second)}` : titleCaseIfShouting(second);
    }

    // Mobiles typed into the landline column still count, but only after the real mobile columns.
    const allPhones = [...new Set([...phones, ...landlinePhones])];
    if (!allPhones.length) {
      const placeholder = PLACEHOLDER.test(clean(names[0] ?? "")) || (!name && !emails.length);
      if (placeholder) report.placeholder++;
      else report.noPhone++;
      if (rejected.length < 500) {
        rejected.push({
          tab,
          row: rowNumber,
          name,
          reason: placeholder ? "placeholder" : "no_valid_mobile",
          raw: row.filter(Boolean).join(" | ").slice(0, 200),
        });
      }
      return;
    }

    const [phone, ...alternatePhones] = allPhones;
    const infoLine = [context, ...info].filter(Boolean).join(" · ").slice(0, 600);
    const existing = seen.get(phone);
    if (existing) {
      report.duplicates++;
      // Same person in two rows/tabs (e.g. owns two flats): keep the first, but keep the extra detail.
      if (infoLine && !existing.info.includes(infoLine)) existing.info = `${existing.info} | ${infoLine}`.slice(0, 1500);
      if (!existing.name && name) existing.name = name;
      if (!existing.email && emails[0]) existing.email = emails[0];
      for (const p of alternatePhones) if (!existing.alternatePhones.includes(p) && p !== existing.phone) existing.alternatePhones.push(p);
      return;
    }

    const lead: ParsedLead = {
      phone,
      name: name.slice(0, 120),
      alternatePhones: alternatePhones.slice(0, 5),
      email: emails[0] ?? "",
      address: address.join(", ").slice(0, 500),
      notes: remarks.length ? `Remark: ${remarks.join("; ")}`.slice(0, 1000) : "",
      info: infoLine,
      category,
      plot,
    };
    seen.set(phone, lead);
    report.valid++;
  });

  return report;
}

/** Parses several tabs; a phone that appears in more than one tab is kept once (first tab wins). */
export function parseTabs(tabs: { tab: string; rows: string[][] }[]): ParseResult {
  const seen = new Map<string, ParsedLead>();
  const rejected: RejectedRow[] = [];
  const reports = tabs.map((t) => parseTab(t.tab, t.rows, seen, rejected));
  return { leads: [...seen.values()], reports, rejected };
}

/** Rows sent as JSON objects (e.g. [{ name, phone }]) are treated like a CSV with those keys as headers. */
export function objectsToRows(items: Record<string, unknown>[]): string[][] {
  const keys: string[] = [];
  for (const it of items) for (const k of Object.keys(it ?? {})) if (!keys.includes(k)) keys.push(k);
  return [keys, ...items.map((it) => keys.map((k) => (it?.[k] == null ? "" : String(it[k]))))];
}

export function parseSheetUrl(url: string): { sheetId: string; gid: string | null } | null {
  const m = url.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) return null;
  const gid = (url.match(/[#?&]gid=(\d+)/) || [])[1] ?? null;
  return { sheetId: m[1], gid };
}

const decodeJsString = (s: string) =>
  s.replace(/\\x([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\\//g, "/").replace(/\\"/g, '"');

/** Lists the tabs of a sheet shared as "anyone with the link can view" (no API key needed). */
export async function listSheetTabs(sheetId: string): Promise<{ gid: string; name: string }[]> {
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/htmlview`);
  if (!res.ok) throw new Error(`Google Sheet returned HTTP ${res.status}. Is it shared as "Anyone with the link"?`);
  const html = await res.text();
  const tabs: { gid: string; name: string }[] = [];
  const re = /\{name:\s*"((?:[^"\\]|\\.)*)",\s*pageUrl:\s*"[^"]*?gid(?:=|\\x3d)(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (!tabs.some((t) => t.gid === m![2])) tabs.push({ gid: m[2], name: decodeJsString(m[1]).trim() });
  }
  return tabs;
}

export async function fetchSheetCsv(sheetId: string, gid: string): Promise<string> {
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`);
  if (!res.ok) throw new Error(`Google Sheet returned HTTP ${res.status}. Is it shared as "Anyone with the link"?`);
  const text = await res.text();
  if (/^\s*<!doctype html|^\s*<html/i.test(text)) throw new Error('Google returned a sign-in page. Share the sheet as "Anyone with the link can view".');
  return text;
}

/**
 * Downloads a sheet. With a gid in the URL only that tab is read; otherwise every tab is.
 * `only` limits it to tabs whose name or gid is listed.
 */
export async function fetchSheet(url: string, opts: { allTabs?: boolean; only?: string[] } = {}) {
  const ref = parseSheetUrl(url);
  if (!ref) throw new Error("That is not a Google Sheets link");
  let tabs: { gid: string; name: string }[];
  if (ref.gid && !opts.allTabs) tabs = [{ gid: ref.gid, name: `gid ${ref.gid}` }];
  else {
    tabs = await listSheetTabs(ref.sheetId).catch(() => []);
    if (!tabs.length) tabs = [{ gid: ref.gid ?? "0", name: "Sheet" }];
    if (ref.gid && !opts.allTabs) tabs = tabs.filter((t) => t.gid === ref.gid);
  }
  if (opts.only?.length) {
    const wanted = opts.only.map((s) => s.trim().toLowerCase());
    tabs = tabs.filter((t) => wanted.includes(t.gid) || wanted.includes(t.name.toLowerCase()));
  }
  const out: { tab: string; gid: string; csv: string }[] = [];
  for (const t of tabs) out.push({ tab: t.name, gid: t.gid, csv: await fetchSheetCsv(ref.sheetId, t.gid) });
  return { sheetId: ref.sheetId, tabs: out };
}
