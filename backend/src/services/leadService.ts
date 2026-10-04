import crypto from "node:crypto";
import { Types } from "mongoose";
import { Lead } from "../models/Lead";
import { LeadSource } from "../models/LeadSource";
import { LeadTombstone } from "../models/LeadTombstone";
import { logger } from "../utils/logger";
import { fetchSheet, fetchSheetCsv, normalizePhone, parseCsv, parseSheetUrl, parseTabs, type ParsedLead, type ParseResult } from "./leadImport";

export { normalizePhone };
export const STATUS_SUGGESTIONS=["New","Called — no answer","Interested","Site visit planned","Follow-up","Quotation sent","Not interested","Converted"];
export const NOT_INTERESTED_RE=/not\s*int[e]?rest/i;
export const isNotInterested=(status:string)=>NOT_INTERESTED_RE.test(status);
/** Leads in "Not interested" for this long are deleted by the cleanup job. */
export const NOT_INTERESTED_TTL_DAYS=30;
/** A sheet linked with every tab ("all") is re-read at most this often; single tabs every scheduler tick. */
const ALL_TABS_MIN_GAP_MS=5*60*1000;

const clean=(v:unknown,max=4000)=>typeof v==="string"?v.trim().slice(0,max):"";
const hash=(text:string)=>crypto.createHash("sha256").update(text).digest("hex");

export async function accessibleSources(userId:string){return LeadSource.find({$or:[{ownerId:userId},{sharedWith:userId}]})}
export async function leadAccessFilter(userId:string){const ids=(await LeadSource.find({$or:[{ownerId:userId},{sharedWith:userId}]},{_id:1}).lean()).map(s=>s._id);return{$or:[{ownerId:new Types.ObjectId(userId)},{sourceIds:{$in:ids}}]}}

/** Sheet link -> {sheetId,gid}. A link without a gid means "every tab" (gid "all"). */
export const parseLeadSourceUrl=(url:string,allTabs=false)=>{const ref=parseSheetUrl(url);if(!ref)return null;return{sheetId:ref.sheetId,gid:allTabs||!ref.gid?"all":ref.gid}};

/** Writes parsed leads for one owner. Existing leads only get blanks filled in; nothing typed by a person is overwritten. */
async function upsertParsed(ownerId:string,sourceId:Types.ObjectId|string,items:ParsedLead[],opts:{overwriteName?:boolean;skipDeleted?:boolean}={}){
  const owner=new Types.ObjectId(ownerId);
  const phones=items.map(l=>l.phone);
  const existing=new Map<string,any>();
  const deleted=new Set<string>();
  for(let i=0;i<phones.length;i+=1000){
    const chunk=phones.slice(i,i+1000);
    for(const l of await Lead.find({ownerId:owner,phone:{$in:chunk}}).lean())existing.set(l.phone,l);
    if(opts.skipDeleted)for(const t of await LeadTombstone.find({ownerId:owner,phone:{$in:chunk}}).lean())deleted.add(t.phone);
  }
  const ops:any[]=[];let added=0,updated=0,skippedDeleted=0;const now=new Date();
  for(const l of items){
    const cur=existing.get(l.phone);
    if(!cur){
      if(deleted.has(l.phone)){skippedDeleted++;continue}
      ops.push({insertOne:{document:{ownerId:owner,phone:l.phone,name:l.name,email:l.email,address:l.address,notes:l.notes,info:l.info,category:l.category,plotInFarukhNagar:l.plot,alternatePhones:l.alternatePhones,sourceIds:[sourceId],sheetDate:now}}});
      added++;continue;
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
  const {text,parsed}=await readSource(source);
  const nextHash=hash(text);
  if(!force&&nextHash===source.lastHash){await LeadSource.updateOne({_id:source._id},{lastCheckedAt:new Date(),lastError:""});return{changed:false,added:0,updated:0,removed:0}}
  // An empty sheet (or one that failed to load) must not wipe the leads it held.
  if(parsed.reports.every(r=>r.rows===0))return{changed:false,added:0,updated:0,removed:0};
  if(!parsed.leads.length&&parsed.reports.every(r=>r.headerRow===null))throw new Error("No phone/mobile column found in this sheet");
  const leads=parsed.leads.filter(l=>!/test lead/i.test(`${l.name} ${l.notes}`));
  const {added,updated}=await upsertParsed(ownerId,source._id,leads,{overwriteName:true,skipDeleted:true});
  const ids=leads.map(l=>l.phone);
  const pulled=await Lead.updateMany({ownerId,sourceIds:source._id,phone:{$nin:ids}},{$pull:{sourceIds:source._id}});
  await Lead.updateMany({ownerId,sourceIds:{$size:0}},{$set:{archived:true}});
  await LeadSource.updateOne({_id:source._id},{lastHash:nextHash,lastSyncedAt:new Date(),lastCheckedAt:new Date(),lastError:""});
  return{changed:true,added,updated,removed:pulled.modifiedCount??0};
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
export async function manualSourceFor(userId:string){
  return LeadSource.findOneAndUpdate({ownerId:userId,sheetId:"manual",gid:"0"},{$setOnInsert:{ownerId:userId,sheetId:"manual",gid:"0",kind:"manual",label:"My contacts",url:""}},{upsert:true,new:true});
}

/** The source an import batch goes into: one per label, so re-running the same import doesn't add a second list. */
export async function importSourceFor(userId:string,label:string){
  const slug=label.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,60)||"import";
  return LeadSource.findOneAndUpdate({ownerId:userId,sheetId:`import:${slug}`,gid:"0"},{$setOnInsert:{ownerId:userId,sheetId:`import:${slug}`,gid:"0",kind:"import",url:""},$set:{label:label.slice(0,80)}},{upsert:true,new:true});
}

export interface NewLead{name?:string;phone?:string;status?:string;category?:string;notes?:string}
export async function addManualLeads(userId:string,items:NewLead[]){
  const source=await manualSourceFor(userId);
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
    await Lead.create({ownerId:userId,phone,name:clean(item.name,120),status,category:clean(item.category,80),notes:clean(item.notes,4000),sourceIds:[source._id],sheetDate:new Date(),...(isNotInterested(status)?{notInterestedAt:new Date()}:{})});
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
  const access=await leadAccessFilter(ownerId);
  const phones=parsed.leads.map(l=>l.phone);
  const others=new Set<string>();
  for(let i=0;i<phones.length;i+=1000){
    const found=await Lead.find({phone:{$in:phones.slice(i,i+1000)},...access,ownerId:{$ne:new Types.ObjectId(ownerId)}},{phone:1}).lean();
    for(const f of found)others.add(f.phone);
  }
  const mine=parsed.leads.filter(l=>!others.has(l.phone));
  const summary={
    rows:parsed.reports.reduce((s,r)=>s+r.rows,0),
    validUnique:parsed.leads.length,
    noValidMobile:parsed.reports.reduce((s,r)=>s+r.noPhone,0),
    placeholders:parsed.reports.reduce((s,r)=>s+r.placeholder,0),
    duplicateRows:parsed.reports.reduce((s,r)=>s+r.duplicates,0),
    sharedWithYouAlready:others.size,
    added:0,updated:0,skippedDeleted:0,
  };
  if(opts.dryRun){
    const owned=new Set<string>();
    for(let i=0;i<phones.length;i+=1000)for(const l of await Lead.find({ownerId:new Types.ObjectId(ownerId),phone:{$in:phones.slice(i,i+1000)}},{phone:1}).lean())owned.add(l.phone);
    summary.updated=mine.filter(l=>owned.has(l.phone)).length;
    summary.added=mine.length-summary.updated;
    return{summary,source:null};
  }
  const source=await importSourceFor(ownerId,opts.label);
  const res=await upsertParsed(ownerId,source._id,mine,{skipDeleted:!opts.includeDeleted});
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
