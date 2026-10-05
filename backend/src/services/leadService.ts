import crypto from "node:crypto";
import { Types } from "mongoose";
import { Lead } from "../models/Lead";
import { LeadList } from "../models/LeadList";
import { LeadSource } from "../models/LeadSource";
import { LeadTombstone } from "../models/LeadTombstone";
import { logger } from "../utils/logger";
import { escapeRegex } from "./rules/text";
import { fetchSheet, fetchSheetCsv, normalizePhone, parseCsv, parseSheetUrl, parseTabs, type ParsedLead, type ParseResult } from "./leadImport";

export { normalizePhone };
export const STATUS_SUGGESTIONS=["New","Called — no answer","Interested","Site visit planned","Follow-up","Quotation sent","Not interested","Converted"];
export const NOT_INTERESTED_RE=/not\s*int[e]?rest/i;
export const isNotInterested=(status:string)=>NOT_INTERESTED_RE.test(status);
/** Leads in "Not interested" for this long are deleted by the cleanup job. */
export const NOT_INTERESTED_TTL_DAYS=30;
/** A sheet linked with every tab ("all") is re-read at most this often; single tabs every scheduler tick. */
const ALL_TABS_MIN_GAP_MS=5*60*1000;

/** Friendly names for the two sheets this app is used with, shown whatever label they were added under. */
export const KNOWN_SHEET_LABELS:Record<string,string>={
  "1Nv1japYjs6HY3_R5lJTDEMW4vPrEOdXbEvJH4aRznZs":"Meta Sheet",
  "1yJHK8tnURvrudVPt-PHYzVCtve5ScRa9uVCA6AqFM1U":"Calling Data",
};
/** The name a list is shown under (and stored as a lead's origin). */
export const sourceDisplayName=(s:{label?:string|null;sheetId?:string;kind?:string})=>
  KNOWN_SHEET_LABELS[s.sheetId??""]??(s.label||(s.kind==="manual"?"My contacts":s.kind==="import"?"Imported leads":"Google Sheet"));

const clean=(v:unknown,max=4000)=>typeof v==="string"?v.trim().slice(0,max):"";
const hash=(text:string)=>crypto.createHash("sha256").update(text).digest("hex");

/** One shared pool: every signed-in user sees and edits every list and every lead. There is no sharing. */
export async function accessibleSources(_userId:string){return LeadSource.find({})}
export async function leadAccessFilter(_userId:string):Promise<Record<string,unknown>>{return{}}

/** Sheet link -> {sheetId,gid}. A link without a gid means "every tab" (gid "all"). */
export const parseLeadSourceUrl=(url:string,allTabs=false)=>{const ref=parseSheetUrl(url);if(!ref)return null;return{sheetId:ref.sheetId,gid:allTabs||!ref.gid?"all":ref.gid}};

/** Writes parsed leads for one owner. Existing leads only get blanks filled in; nothing typed by a person is overwritten. */
async function upsertParsed(ownerId:string,sourceId:Types.ObjectId|string,items:ParsedLead[],opts:{overwriteName?:boolean;skipDeleted?:boolean;linkOnly?:boolean;restoreArchived?:boolean;origin?:string}={}){
  const owner=new Types.ObjectId(ownerId);
  const phones=items.map(l=>l.phone);
  const existing=new Map<string,any>();
  const deleted=new Set<string>();
  for(let i=0;i<phones.length;i+=1000){
    const chunk=phones.slice(i,i+1000);
    for(const l of await Lead.find({phone:{$in:chunk}}).lean())if(!existing.has(l.phone))existing.set(l.phone,l);
    if(opts.skipDeleted)for(const t of await LeadTombstone.find({phone:{$in:chunk}}).lean())deleted.add(t.phone);
  }
  const ops:any[]=[];let added=0,updated=0,skippedDeleted=0;const now=new Date();
  for(const l of items){
    const cur=existing.get(l.phone);
    if(!cur){
      if(deleted.has(l.phone)){skippedDeleted++;continue}
      ops.push({insertOne:{document:{ownerId:owner,phone:l.phone,name:l.name,email:l.email,address:l.address,notes:l.notes,info:l.info,category:l.category,plotInFarukhNagar:l.plot,alternatePhones:l.alternatePhones,sourceIds:[sourceId],origin:opts.origin??"",originId:opts.origin?sourceId:null,sheetDate:now}}});
      added++;continue;
    }
    if(opts.linkOnly){
      // The database is the source of truth: a lead that already exists is never edited by a sheet, only linked to its list.
      ops.push({updateOne:{filter:{_id:cur._id},update:{$addToSet:{sourceIds:sourceId},...(opts.restoreArchived&&cur.archived?{$set:{archived:false}}:{})}}});
      updated++;continue;
    }
    const set:Record<string,unknown>={archived:false};
    if(l.name&&(opts.overwriteName?l.name!==cur.name:!cur.name))set.name=l.name;
    if(!cur.plotManual&&l.plot&&l.plot!==cur.plotInFarukhNagar)set.plotInFarukhNagar=l.plot;
    if(!cur.category&&l.category)set.category=l.category;
    if(!cur.email&&l.email)set.email=l.email;
    if(!cur.address&&l.address)set.address=l.address;
    if(!cur.info&&l.info)set.info=l.info;
    if(!cur.notes&&l.notes)set.notes=l.notes;
    ops.push({updateOne:{filter:{_id:cur._id},update:{$set:set,$addToSet:{sourceIds:sourceId,alternatePhones:{$each:l.alternatePhones}}}}});
    updated++;
  }
  for(let i=0;i<ops.length;i+=500)await Lead.bulkWrite(ops.slice(i,i+500),{ordered:false});
  return{added,updated,skippedDeleted};
}

async function readSource(source:any):Promise<{text:string;parsed:ParseResult}>{
  if(source.gid==="all"){
    const sheet=await fetchSheet(`https://docs.google.com/spreadsheets/d/${source.sheetId}/edit`,{allTabs:true});
    const text=sheet.tabs.map(t=>`${t.gid}\n${t.csv}`).join("\n\u0000\n");
    return{text,parsed:parseTabs(sheet.tabs.map(t=>({tab:t.tab,rows:parseCsv(t.csv)})))};
  }
  const csv=await fetchSheetCsv(source.sheetId,source.gid);
  return{text:csv,parsed:parseTabs([{tab:source.label||"Sheet",rows:parseCsv(csv)}])};
}

export async function syncSource(source:any,ownerId:string,force=false){
  // Not connected: no sync at all. The leads and the list stay as they are.
  if(source.enabled===false)return{changed:false,added:0,updated:0,removed:0};
  const {text,parsed}=await readSource(source);
  const nextHash=hash(text);
  if(!force&&nextHash===source.lastHash){await LeadSource.updateOne({_id:source._id},{lastCheckedAt:new Date(),lastError:""});return{changed:false,added:0,updated:0,removed:0}}
  // An empty sheet (or one that failed to load) must not wipe the leads it held.
  if(parsed.reports.every(r=>r.rows===0))return{changed:false,added:0,updated:0,removed:0};
  if(!parsed.leads.length&&parsed.reports.every(r=>r.headerRow===null))throw new Error("No phone/mobile column found in this sheet");
  const leads=parsed.leads.filter(l=>!/test lead/i.test(`${l.name} ${l.notes}`));
  // A connected sheet only ever adds: new numbers become leads, existing leads are left alone, and rows
  // deleted from the sheet do not remove anything. Re-attaching a sheet (first sync) brings its hidden leads back.
  const {added,updated}=await upsertParsed(ownerId,source._id,leads,{linkOnly:true,skipDeleted:true,restoreArchived:!source.lastSyncedAt,origin:sourceDisplayName(source)});
  await LeadSource.updateOne({_id:source._id},{lastHash:nextHash,lastSyncedAt:new Date(),lastCheckedAt:new Date(),lastError:""});
  return{changed:true,added,updated,removed:0};
}

let timer:NodeJS.Timeout|undefined;
export function startLeadSyncScheduler(intervalSeconds=15){
  if(timer)clearInterval(timer);
  let busy=false;
  const tick=async()=>{
    if(busy)return;busy=true;
    try{
      const sources=await LeadSource.find({enabled:true,kind:{$nin:["manual","import"]}}).lean();
      for(const source of sources){
        if(source.gid==="all"&&source.lastCheckedAt&&Date.now()-+new Date(source.lastCheckedAt)<ALL_TABS_MIN_GAP_MS)continue;
        try{await syncSource(source,String(source.ownerId))}
        catch(err){await LeadSource.updateOne({_id:source._id},{lastCheckedAt:new Date(),lastError:err instanceof Error?err.message:String(err)})}
      }
    }catch(err){logger.error("Lead sync tick failed",{message:err instanceof Error?err.message:String(err)})}
    finally{busy=false}
  };
  void tick();timer=setInterval(()=>void tick(),intervalSeconds*1000);timer.unref?.();
}

/**
 * Deletes leads that have sat in "Not interested" for NOT_INTERESTED_TTL_DAYS. Leads marked before this
 * feature existed get their clock started now rather than being deleted on the spot.
 */
export async function cleanupNotInterested(now=new Date()){
  await Lead.updateMany({notInterestedAt:null,status:{$regex:NOT_INTERESTED_RE}},{$set:{notInterestedAt:now}});
  const cutoff=new Date(now.getTime()-NOT_INTERESTED_TTL_DAYS*24*60*60*1000);
  const doomed=await Lead.find({notInterestedAt:{$lte:cutoff}},{ownerId:1,phone:1}).lean();
  if(!doomed.length)return 0;
  await LeadTombstone.bulkWrite(doomed.map(d=>({updateOne:{filter:{ownerId:d.ownerId,phone:d.phone},update:{$set:{deletedAt:now}},upsert:true}})),{ordered:false});
  const res=await Lead.deleteMany({_id:{$in:doomed.map(d=>d._id)}});
  return res.deletedCount??0;
}

let cleanupTimer:NodeJS.Timeout|undefined;
export function startLeadCleanupScheduler(intervalHours=6){
  if(cleanupTimer)clearInterval(cleanupTimer);
  const run=()=>cleanupNotInterested().then(n=>{if(n)logger.info(`Deleted ${n} not-interested leads older than ${NOT_INTERESTED_TTL_DAYS} days`)}).catch(err=>logger.error("Lead cleanup failed",{message:err instanceof Error?err.message:String(err)}));
  void run();cleanupTimer=setInterval(()=>void run(),intervalHours*60*60*1000);cleanupTimer.unref?.();
}

/** The per-user source that holds leads added from phone contacts or typed in by hand; shareable like a sheet. */
/**
 * One shared "My contacts" list for everyone: leads added by hand or scanned from any phone's contacts all go into
 * the same list (the oldest one that exists), so three phones never make three lists. Lists that earlier per-user
 * versions already created are left as they are; new leads simply join the oldest.
 */
export async function manualSourceFor(userId:string){
  const existing=await LeadSource.findOne({kind:"manual"}).sort({createdAt:1,_id:1});
  if(existing)return existing;
  return LeadSource.findOneAndUpdate({ownerId:userId,sheetId:"manual",gid:"0"},{$setOnInsert:{ownerId:userId,sheetId:"manual",gid:"0",kind:"manual",label:"My contacts",url:""}},{upsert:true,new:true});
}

/** The source an import batch goes into: one per label, so re-running the same import doesn't add a second list. */
export async function importSourceFor(userId:string,label:string){
  const slug=label.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,60)||"import";
  return LeadSource.findOneAndUpdate({ownerId:userId,sheetId:`import:${slug}`,gid:"0"},{$setOnInsert:{ownerId:userId,sheetId:`import:${slug}`,gid:"0",kind:"import",url:""},$set:{label:label.slice(0,80)}},{upsert:true,new:true});
}

/** Trims a typed list name and collapses inner spaces; empty when nothing usable was typed. */
export function cleanListName(raw:unknown){
  return typeof raw==="string"?raw.replace(/\s+/g," ").trim().slice(0,80):"";
}

/**
 * Makes sure a list name exists and returns the spelling to use. "referrals" finds an existing "Referrals" (a saved
 * list name, or a name some leads already carry) instead of making a second one.
 */
export async function resolveList(name:string,createdBy?:string):Promise<{name:string;isNew:boolean}>{
  const key=name.toLowerCase();
  const saved=await LeadList.findOne({key}).lean();
  if(saved)return{name:saved.name,isNew:false};
  const used=await Lead.findOne({origin:new RegExp(`^${escapeRegex(name)}$`,"i")},{origin:1}).lean();
  const canonical=used?.origin||name;
  try{await LeadList.create({name:canonical,key:canonical.toLowerCase(),createdBy})}
  catch{/* created at the same moment by someone else: same name, nothing to do */}
  return{name:canonical,isNew:!used};
}
export async function ensureList(name:string,createdBy?:string){
  return(await resolveList(name,createdBy)).name;
}

export interface NewLead{name?:string;phone?:string;status?:string;category?:string;notes?:string;alternatePhones?:string[]}
export async function addManualLeads(userId:string,items:NewLead[],list?:string){
  const source=await manualSourceFor(userId);
  const listName=cleanListName(list);
  const origin=listName?await ensureList(listName,userId):sourceDisplayName(source);
  const access=await leadAccessFilter(userId);
  let added=0,existing=0,invalid=0;
  const seen=new Set<string>();
  const addedPhones:string[]=[];
  for(const item of items){
    const phone=normalizePhone(typeof item.phone==="string"?item.phone:"");
    if(!phone){invalid++;continue}
    if(seen.has(phone)){existing++;continue}
    seen.add(phone);
    const found=await Lead.findOne({phone,...access});
    if(found){
      // Already tracked (possibly from a sheet or by someone it is shared with): leave it as is, bring it back if archived.
      if(found.archived)await Lead.updateOne({_id:found._id},{$set:{archived:false}});
      existing++;continue;
    }
    const status=clean(item.status,200);
    const alternatePhones=[...new Set((item.alternatePhones??[]).map(p=>normalizePhone(typeof p==="string"?p:"")).filter((p):p is string=>!!p&&p!==phone))];
    await Lead.create({ownerId:userId,phone,name:clean(item.name,120),alternatePhones,status,category:clean(item.category,80),notes:clean(item.notes,4000),sourceIds:[source._id],origin,originId:source._id,sheetDate:new Date(),...(isNotInterested(status)?{notInterestedAt:new Date()}:{})});
    // Someone deliberately re-adding a number lifts the "deleted by cleanup" mark.
    await LeadTombstone.deleteOne({ownerId:userId,phone});
    addedPhones.push(phone);
    added++;
  }
  return{added,existing,invalid,addedPhones};
}

export interface BulkImportOptions{label:string;dryRun?:boolean;includeDeleted?:boolean}
/**
 * Imports already-parsed leads into `ownerId`'s workspace under an "import" list named `label`.
 * Numbers already tracked anywhere this owner can see are not duplicated.
 */
export async function importParsedLeads(ownerId:string,parsed:ParseResult,opts:BulkImportOptions){
  const phones=parsed.leads.map(l=>l.phone);
  // Shared pool: a number someone else already added is the same lead, so it is linked, not skipped.
  const mine=parsed.leads;
  const summary={
    rows:parsed.reports.reduce((s,r)=>s+r.rows,0),
    validUnique:parsed.leads.length,
    noValidMobile:parsed.reports.reduce((s,r)=>s+r.noPhone,0),
    placeholders:parsed.reports.reduce((s,r)=>s+r.placeholder,0),
    duplicateRows:parsed.reports.reduce((s,r)=>s+r.duplicates,0),
    sharedWithYouAlready:0,
    added:0,updated:0,skippedDeleted:0,
  };
  if(opts.dryRun){
    const owned=new Set<string>();
    for(let i=0;i<phones.length;i+=1000)for(const l of await Lead.find({phone:{$in:phones.slice(i,i+1000)}},{phone:1}).lean())owned.add(l.phone);
    summary.updated=mine.filter(l=>owned.has(l.phone)).length;
    summary.added=mine.length-summary.updated;
    return{summary,source:null};
  }
  const source=await importSourceFor(ownerId,opts.label);
  const res=await upsertParsed(ownerId,source._id,mine,{skipDeleted:!opts.includeDeleted,origin:sourceDisplayName(source)});
  Object.assign(summary,res);
  await LeadSource.updateOne({_id:source._id},{lastSyncedAt:new Date(),lastCheckedAt:new Date(),lastError:""});
  return{summary,source:{id:String(source._id),label:source.label}};
}

/** Which of these numbers are already a lead this user can see (used to hide them from contact suggestions). */
export async function existingPhones(userId:string,raw:string[]){
  const phones=[...new Set(raw.map(p=>normalizePhone(p)).filter((p):p is string=>!!p))];
  if(!phones.length)return[];
  const found=await Lead.find({phone:{$in:phones},...(await leadAccessFilter(userId))},{phone:1}).lean();
  return[...new Set(found.map(f=>f.phone))];
}


/**
 * Gives every lead that has no origin yet the name of the oldest list it belongs to. Only the two new fields are
 * written (origin, originId); nothing else on a lead is touched. Safe to run on every start.
 */
export async function backfillLeadOrigins(){
  const sources=await LeadSource.find({}).sort({createdAt:1}).lean();
  let filled=0;
  for(const source of sources){
    const res=await Lead.updateMany({sourceIds:source._id,$or:[{origin:{$exists:false}},{origin:""}]},{$set:{origin:sourceDisplayName(source),originId:source._id}});
    filled+=res.modifiedCount??0;
  }
  return filled;
}


/**
 * Leads first loaded from a CSV / file import keep that import's name as their origin. When the same leads also belong to
 * a connected sheet with a friendly name (Meta Sheet, Calling Data), show that name instead. Writes only origin / originId,
 * only on leads linked to exactly one of those sheets, and only when their origin is an import list. Safe to run on every start.
 */
export async function relabelImportedLeadsToSheets(){
  const known=await LeadSource.find({sheetId:{$in:Object.keys(KNOWN_SHEET_LABELS)}}).lean();
  if(!known.length)return 0;
  const imports=await LeadSource.find({kind:"import"},{_id:1}).lean();
  if(!imports.length)return 0;
  const importIds=imports.map(i=>i._id);
  let changed=0;
  for(const source of known){
    const others=known.filter(k=>String(k._id)!==String(source._id)).map(k=>k._id);
    const res=await Lead.updateMany(
      {sourceIds:{$all:[source._id],$nin:others},originId:{$in:importIds}},
      {$set:{origin:sourceDisplayName(source),originId:source._id}}
    );
    changed+=res.modifiedCount??0;
  }
  return changed;
}
