import test from "node:test";
import assert from "node:assert/strict";
import { createSupportService } from "./support-service.mjs";

function mockPool() {
  const calls=[];
  return {calls,async query(sql,args) {
    calls.push({sql,args});
    if(sql.startsWith("INSERT INTO support_tickets")) return {rows:[{id:"ticket-id",status:"open",subject:args[1]}]};
    if(sql.includes("FROM support_tickets WHERE user_id")) return {rows:[{id:"ticket-id",status:"open"}]};
    if(sql.includes("JOIN users")) return {rows:[{id:"ticket-id",status:"open"}]};
    if(sql.startsWith("UPDATE support_tickets")) return {rowCount:1,rows:[{id:"ticket-id",status:args[3]}]};
    return {rows:[]};
  }};
}
const passenger={id:"passenger",role:"passenger"};
const owner={id:"owner",role:"owner"};

test("passenger creates support ticket with validated content",async()=>{
 const pool=mockPool();const result=await createSupportService(pool).createTicket(passenger,{subject:"Payment issue",message:"My payment did not complete",category:"payment"});
 assert.equal(result.ticket.status,"open");assert.equal(pool.calls[0].args[3],"payment");
});
test("ticket content length validated",async()=>{
 await assert.rejects(()=>createSupportService(mockPool()).createTicket(passenger,{subject:"x",message:"short"}),/length is invalid/);
});
test("support tickets are owner-only to review/respond",async()=>{
 const service=createSupportService(mockPool());
 await assert.rejects(()=>service.listOwnerTickets(passenger),/Owner account required/);
 await assert.rejects(()=>service.respondToTicket(passenger,"ticket-id",{reply:"We will help"}),/Owner account required/);
});
test("owner responds and updates status",async()=>{
 const pool=mockPool();const result=await createSupportService(pool).respondToTicket(owner,"ticket-id",{reply:"We are investigating",status:"in_progress"});
 assert.equal(result.ticket.status,"in_progress");
});
