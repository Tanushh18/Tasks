import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";
const leadSchema = new Schema({
  ownerId:{type:Schema.Types.ObjectId,ref:"User",required:true,index:true}, phone:{type:String,required:true},
  name:{type:String,default:""}, plotInFarukhNagar:{type:String,default:""}, plotManual:{type:Boolean,default:false},
  category:{type:String,default:""}, status:{type:String,default:""}, requirement:{type:String,default:""}, address:{type:String,default:""},
  budget:{type:String,default:""}, notes:{type:String,default:""}, sourceIds:{type:[Schema.Types.ObjectId],default:[]},
  // Where the lead first came from (sheet / import / contacts). Stays on the lead even if that sheet is later removed or renamed in place.
  origin:{type:String,default:""}, originId:{type:Schema.Types.ObjectId,default:null}, sheetDate:Date, archived:{type:Boolean,default:false},
  // Extra numbers / email / read-only context (tower, flat, dealer…) picked up from imported sheets.
  alternatePhones:{type:[String],default:[]}, email:{type:String,default:""}, info:{type:String,default:""},
  // Who last changed the lead and when the stage last changed; drives "Updated by X at …" on the card.
  updatedById:{type:Schema.Types.ObjectId,ref:"User",default:null}, updatedByName:{type:String,default:""}, statusUpdatedAt:{type:Date,default:null},
  // Set while the stage is "Not interested"; the cleanup job deletes the lead 30 days after this.
  notInterestedAt:{type:Date,default:null,index:true},
  // Set when the person pressed "Send" in the WhatsApp preview. We cannot verify delivery: this only records that Send was pressed.
  whatsappSentAt:{type:Date,default:null}, whatsappTemplateId:{type:Schema.Types.ObjectId,ref:"WhatsAppTemplate",default:null}
},{timestamps:true});
leadSchema.index({ownerId:1,phone:1},{unique:true}); leadSchema.index({ownerId:1,archived:1,sheetDate:-1}); leadSchema.index({archived:1,createdAt:-1}); leadSchema.index({sourceIds:1});
// The list sorts newest first inside an owner or a source: these let Mongo read a page without sorting in memory.
leadSchema.index({ownerId:1,archived:1,createdAt:-1,_id:-1}); leadSchema.index({sourceIds:1,archived:1,createdAt:-1,_id:-1});
// A sheet page is read as "unsent first, then sent" (two range reads on whatsappSentAt), each newest first.
leadSchema.index({origin:1,archived:1,whatsappSentAt:1,createdAt:-1,_id:-1});
export type LeadDocument=HydratedDocument<InferSchemaType<typeof leadSchema>>; export const Lead=model("Lead",leadSchema);
