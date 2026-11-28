import { Buffer } from "node:buffer";

export function createSmsSender({accountSid=process.env.TWILIO_ACCOUNT_SID,authToken=process.env.TWILIO_AUTH_TOKEN,from=process.env.TWILIO_FROM_NUMBER,fetchImpl=fetch}={}) {
  const isConfigured=()=>Boolean(accountSid&&authToken&&from);
  return {
    isConfigured,
    async send(to,body) {
      if(!isConfigured()) return {sent:false,skipped:true,reason:"sms_not_configured"};
      if(!/^\+[1-9]\d{7,14}$/.test(String(to??""))) throw new TypeError("SMS destination must be an E.164 phone number");
      const text=String(body??"").trim();
      if(!text||text.length>1500) throw new TypeError("SMS body must contain 1 to 1500 characters");
      const credentials=Buffer.from(accountSid+":"+authToken).toString("base64");
      const response=await fetchImpl("https://api.twilio.com/2010-04-01/Accounts/"+encodeURIComponent(accountSid)+"/Messages.json",{
        method:"POST",headers:{authorization:"Basic "+credentials,"content-type":"application/x-www-form-urlencoded"},
        body:new URLSearchParams({To:to,From:from,Body:text}).toString()
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok){const error=new Error(result.message||"SMS provider rejected the message");error.status=response.status;throw error;}
      return {sent:true,messageId:result.sid??null,status:result.status??"accepted"};
    }
  };
}
