import test from "node:test";
import assert from "node:assert/strict";
import {createSmsSender} from "./sms-sender.mjs";

test("missing SMS configuration safely skips delivery",async()=>{
 const sender=createSmsSender({accountSid:"",authToken:"",from:"",fetchImpl:()=>{throw new Error("unexpected");}});
 assert.equal(sender.isConfigured(),false);
 assert.deepEqual(await sender.send("+27821234567","Test"),{sent:false,skipped:true,reason:"sms_not_configured"});
});
test("configured Twilio sender submits authenticated form data",async()=>{
 let request;
 const sender=createSmsSender({accountSid:"AC123",authToken:"secret",from:"+27110000000",fetchImpl:async(url,options)=>{request={url,options};return {ok:true,json:async()=>({sid:"SM123",status:"queued"})};}});
 const result=await sender.send("+27821234567","Chaufr alert");
 assert.equal(result.sent,true);assert.equal(result.messageId,"SM123");
 assert.match(request.options.headers.authorization,/^Basic /);assert.match(request.options.body,/To=%2B27821234567/);
});
test("invalid destination and provider failures are rejected",async()=>{
 const sender=createSmsSender({accountSid:"AC123",authToken:"secret",from:"+27110000000",fetchImpl:async()=>({ok:false,status:400,json:async()=>({message:"invalid number"})})});
 await assert.rejects(()=>sender.send("0821234567","Alert"),/E.164/);
 await assert.rejects(()=>sender.send("+27821234567","Alert"),/invalid number/);
});
