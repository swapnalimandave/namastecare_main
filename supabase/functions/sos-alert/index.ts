import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function formatPhone(phone: string) {
  if (!phone) return phone;
  phone = phone.trim();
  if (!phone.startsWith('+')) {
    if (phone.length === 10) return `+91${phone}`;
    return `+${phone}`;
  }
  return phone;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    let body;
    try {
      body = await req.json();
      console.log('Received payload contacts:', body.contacts?.length);
    } catch (e) {
      console.log('No JSON body provided.');
      body = {};
    }

    const { name, age, conditions, bloodSugar, contacts } = body;
    
    const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
    const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
    const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER');
    const FALLBACK_EMERGENCY_CONTACT = Deno.env.get('EMERGENCY_CONTACT');

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
      throw new Error('Missing Twilio credentials in environment variables.');
    }

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}`;
    const twilioAuth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
    const headers = { 'Authorization': `Basic ${twilioAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' };

    const message = `Emergency Alert: ${name || 'Unknown User'} (${age || 'N/A'}), Conditions: ${conditions || 'None'}. Possible issue: High blood sugar (${bloodSugar || 'N/A'}). Please respond immediately.`;

    let phoneList: string[] = Array.isArray(contacts) ? contacts : [];
    if (phoneList.length === 0 && FALLBACK_EMERGENCY_CONTACT) {
      phoneList = [FALLBACK_EMERGENCY_CONTACT];
    }
    
    if (phoneList.length === 0) {
      throw new Error('No emergency contacts found in request body or environment.');
    }

    // Process all contacts concurrently using Promise.allSettled so if one fake number fails, others succeed
    const results = await Promise.allSettled(phoneList.map(async (rawPhone) => {
      const formattedPhone = formatPhone(rawPhone);
      let smsWarning = '';
      let callWarning = '';

      // 1. Send SMS
      const smsData = new URLSearchParams({ To: formattedPhone, From: TWILIO_PHONE_NUMBER, Body: message });
      const smsRes = await fetch(`${twilioUrl}/Messages.json`, { method: 'POST', headers, body: smsData });
      if (!smsRes.ok) {
        smsWarning = `SMS (${JSON.parse(await smsRes.text()).message || 'Error'})`;
      }

      // 2. Trigger Call
      const twimlUrl = `http://twimlets.com/echo?Twiml=${encodeURIComponent(`<Response><Say>${message}</Say></Response>`)}`;
      const callData = new URLSearchParams({ To: formattedPhone, From: TWILIO_PHONE_NUMBER, Url: twimlUrl });
      const callRes = await fetch(`${twilioUrl}/Calls.json`, { method: 'POST', headers, body: callData });
      if (!callRes.ok) {
        callWarning = `Call (${JSON.parse(await callRes.text()).message || 'Error'})`;
      }

      if (smsWarning && callWarning) {
        throw new Error(`${formattedPhone} failed completely: ${smsWarning} | ${callWarning}`);
      } else if (smsWarning || callWarning) {
        return `${formattedPhone} partial success: ${smsWarning} ${callWarning}`.trim();
      }
      return `${formattedPhone} success!`;
    }));

    const successes = results.filter(r => r.status === 'fulfilled');
    const failures = results.filter(r => r.status === 'rejected');
    
    console.log(`SOS Results -> Successes: ${successes.length}, Failures: ${failures.length}`);

    if (successes.length === 0) {
       // Everything failed completely
       const reasons = failures.map(f => (f as PromiseRejectedResult).reason.message).join('; ');
       throw new Error(`All contacts failed. Details: ${reasons}`);
    }

    const report = successes.map(s => (s as PromiseFulfilledResult<string>).value).join(', ');
    const failReport = failures.length > 0 ? ` (+${failures.length} fake numbers failed)` : '';

    return new Response(JSON.stringify({ success: true, message: `SOS broadcast. ${report}${failReport}` }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error('Edge Function Error:', error instanceof Error ? error.message : error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "An internal error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
})
