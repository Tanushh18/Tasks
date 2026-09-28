import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";
const leadSchema = new Schema({
  ownerId:{type:Schema.Types.ObjectId,ref:"User",required:true,index:true}, phone:{type:String,required:true},
  name:{type:String,default:""}, plotInFarukhNagar:{type:String,default:""}, plotManual:{type:Boolean,default:false},
  category:{type:String,default:""}, status:{type:String,default:""}, requirement:{type:String,default:""}, address:{type:String,default:""},
  budget:{type:String,default:""}, notes:{type:String,default:""}, sourceIds:{type:[Schema.Types.ObjectId],default:[]}, sheetDate:Date, archived:{type:Boolean,default:false}
},{timestamps:true});
leadSchema.index({ownerId:1,phone:1},{unique:true}); leadSchema.index({ownerId:1,archived:1,sheetDate:-1});
export type LeadDocument=HydratedDocument<InferSchemaType<typeof leadSchema>>; export const Lead=model("Lead",leadSchema);