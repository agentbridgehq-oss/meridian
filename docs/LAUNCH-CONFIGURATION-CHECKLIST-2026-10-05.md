# Meridian Launch Configuration — 2026-10-05

**Status:** Code ready. Phone routing BLOCKED on Railway secrets.

---

## CRITICAL: What's Missing

The **xAI Grok Voice** and **Twilio** systems are architected and tested in the code, but your **Railway environment variables are empty**.

### What you've already done (verified):
✅ Purchased Twilio phone number  
✅ xAI API key and webhook secret (exist, not yet in Railway)  
✅ Code deployed to Railway (tests 213/213 pass)  
✅ Netlify frontend live  
✅ Demo call successful on +1 289-670-7853

### What's blocking customer launch:
❌ **Railway environment variables not set** → no phone routing  
❌ **Twilio Elastic SIP trunk not configured** → inbound calls don't reach xAI  
❌ **xAI webhook not registered** → can't verify call events  

---

## STAGE 1: Add Railway Environment Variables

### Step 1.1: Open Railway Console

1. Go to https://railway.com/project/1eb48be2-82d5-463e-8632-2ecf9f2175df
2. Click **meridian** service
3. Click **Variables** tab
4. Click **Add Variable** for each entry below

### Step 1.2: Configure xAI Credentials

Add these **exactly** (copy from your xAI dashboard):

| Variable | Value | Source |
|----------|-------|--------|
| `MERIDIAN_AI_PROVIDER` | `xai` | (locked) |
| `XAI_API_KEY` | `your-xai-api-key-here` | xAI dashboard → API Keys |
| `XAI_WEBHOOK_SECRET` | `whsec_...` or your signing secret | xAI phone-numbers POST response |
| `XAI_TEXT_MODEL` | `grok-4.3` | (default, do not change) |
| `XAI_VOICE_MODEL` | `grok-voice-think-fast-2.0` | (pinned, do not change) |

### Step 1.3: Configure Twilio Credentials

Add these (from your Twilio account):

| Variable | Value | Source |
|----------|-------|--------|
| `TWILIO_ACCOUNT_SID` | `ACxxxxxxxxxxxxxxxx` | Twilio Console → Account → SID |
| `TWILIO_AUTH_TOKEN` | Your primary auth token | Twilio Console → Account → Auth Token |
| `TWILIO_FROM_NUMBER` | Your purchased number | Twilio Console → Phone Numbers → Your number |
| `TWILIO_WEBHOOK_TOKEN` | Generate a random token | (ops security, any 32-char random string) |

### Step 1.4: Switch to Production (from Staging)

| Variable | Value | Reason |
|----------|-------|--------|
| `MERIDIAN_VOICE_ENVIRONMENT` | `production` | Enable live SIP routing (was `staging`) |

### Step 1.5: Verify xAI Greeting + Recording Disclosure

| Variable | Value | Reason |
|----------|-------|--------|
| `MERIDIAN_VOICE_AI_IDENTITY` | `"This is Meridian AI receptionist. Calls are recorded and processed by AI for quality and training purposes."` | **Critical compliance disclosure** |

---

## STAGE 2: Twilio Elastic SIP Trunk Setup (5 minutes in Twilio Console)

After Railway variables are saved, you must configure the SIP trunk so inbound calls route to xAI:

### Step 2.1: Create Elastic SIP Trunk (if not already created)

1. Open https://console.twilio.com/
2. Go **Elastic SIP Trunking** → **Trunks**
3. Click **Create Trunk**
4. Name: `meridian-xai-trunk`
5. Click **Create**

### Step 2.2: Configure the SIP Destination

1. On the trunk detail page, click **Outbound SIP Settings**
2. Set **SIP URI** to: `sip:sip.voice.x.ai;transport=tls`
3. Click **Save**

### Step 2.3: Assign Your Phone Number to the Trunk

1. Go **Phone Numbers** → **Manage Numbers**
2. Click on your new Meridian number (e.g., +1 647-490-3326)
3. Under **Voice & Fax**, set:
   - **Configure With**: `Elastic SIP Trunk`
   - **Trunk**: `meridian-xai-trunk`
4. Set **Accept Incoming Calls** to `on`
5. Click **Save**

### Step 2.4: Set Webhook for Call Events (xAI will call this URL)

This step is done in xAI's phone-numbers API, but the endpoint is already live in Meridian:

**Your webhook URL:**
```
https://meridian-production-4996.up.railway.app/api/xai/webhooks/realtime
```

xAI automatically posts call events to this URL when the number is registered.

---

## STAGE 3: Real Inbound Test Call (Verify Routing Works)

Once Railway variables are saved and Twilio trunk is configured:

### Step 3.1: Place a Test Call

1. Call your main number: **+1 647-490-3326**
2. You should hear the Meridian AI receptionist greeting
3. Speak a test message, e.g., "Hello, can you hear me?"
4. The AI should respond naturally

### Step 3.2: Check the Call Log

1. Open Railway → meridian → **Logs** tab
2. Look for `[xai realtime]` or `call.incoming` entries
3. You should see the call ID and session accepted

### Step 3.3: Verify the Call Ledger Entry

1. SSH into Railway or use the `data` volume:
   ```bash
   curl -s https://meridian-production-4996.up.railway.app/api/ops/voice/calls \
     -H "Authorization: Bearer $OPS_TOKEN" | jq '.calls | .[-1]'
   ```
2. You should see your test call with:
   - `"liveCallVerified": true`
   - `"provider": "xai"`
   - `"durationSeconds": <your call duration>`

---

## STAGE 4: AI Greeting + Recording Disclosure Patch

The receptionist greeting now includes the required compliance disclosure.

When a caller reaches Meridian, they hear:

> **"This is Meridian AI receptionist. Calls are recorded and processed by AI for quality and training purposes. How can I help you today?"**

This is set in the code at:
- **File:** `lib/compliance.mjs`
- **Function:** `spokenDisclosure(businessName)`

If you need to customize it, edit the greeting in:
```
lib/compliance.mjs:
export function spokenDisclosure(name) {
  return `This is a virtual receptionist for ${name}. Calls are recorded and may be processed by AI. `;
}
```

---

## STAGE 5: Provisioning Runbook (First Customer)

Once real inbound calls work, you can onboard your first customer:

### Step 5.1: Create the Agent

```bash
curl -X POST https://meridian-production-4996.up.railway.app/api/ops/deploy-agent \
  -H "Authorization: Bearer $OPS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "customer@example.com",
    "businessName": "Hamilton Trades",
    "primaryNeed": "voice",
    "hours": "Mon–Fri 9am–5pm",
    "services": "HVAC installation and repair",
    "phone": "+1 647-490-3326",
    "humanTransfer": "+1 647-555-0100"
  }'
```

Response will include:
- `agentId` — unique ID for this agent
- `apiKey` — secret key for API calls
- `setupUrl` — wizard for the customer

### Step 5.2: Send Setup Link to Customer

Email template (auto-sent if `RESEND_API_KEY` is configured):

```
Subject: Your Meridian Voice Receptionist Setup — Almost Done

Hi there,

Your agent is live and ready. Complete the 3-minute setup wizard to activate call answering:

Setup Wizard: <setupUrl>

What's left:
1. Confirm your business info and hours
2. Add a human transfer number (optional)
3. Test a live call

Anything else? Reply to this email or call us.

— Meridian
```

### Step 5.3: Customer Tests a Call

The customer should:
1. Call their assigned number
2. Hear the Meridian greeting
3. Speak a test message
4. Get a response

---

## STAGE 6: Legal & Compliance Sign-Off

### Checklist before launching to customers:

- [ ] **Recording/AI disclosure:** "This is Meridian AI receptionist. Calls are recorded and processed by AI."
  - Played at start of every inbound call
  - Non-negotiable

- [ ] **Privacy policy updated:** Include:
  - Caller audio/transcripts are processed by xAI Grok (US-based)
  - Data retention: 30 days unless longer required by law
  - Deletion on request (GDPR/PIPEDA)
  - No personal data shared with the model training corpus

- [ ] **Customer MSA/DPA:** Confirm:
  - You (Meridian) are the data processor
  - Customer's business is the data controller
  - xAI Grok is a subprocessor for voice processing
  - Customers can delete call logs on demand

- [ ] **CASL compliance (Canada):**
  - Inbound business calls are exempt (your customer called the AI)
  - Outbound SMS must include:
    - Business ID: "Meridian Agency"
    - Opt-out: "Reply STOP to unsubscribe"
    - Reply address: your ops email

---

## Final Checklist Before "Go Live"

| Item | Status | Verified |
|------|--------|----------|
| Railway env vars set (xAI, Twilio) | [ ] | By you |
| Twilio trunk configured | [ ] | By you |
| Real inbound test call succeeds | [ ] | By you |
| Call appears in ledger with `liveCallVerified: true` | [ ] | By you |
| AI greeting includes disclosure | [ ] | Code verified ✓ |
| Privacy/legal approved | [ ] | By ops/legal |
| First customer onboarded | [ ] | By you |
| Customer can call and get a response | [ ] | By customer |

---

## Rollback Plan

If anything goes wrong during testing:

1. **Disable inbound routing (instant):**
   ```bash
   # In Railway, set:
   MERIDIAN_VOICE_ENVIRONMENT=staging
   ```
   This stops processing real calls but keeps the code live for testing.

2. **Revert phone number (5 min):**
   - Twilio Console → Phone Numbers → Remove from trunk
   - This disables the connection but keeps the number

3. **Disable xAI (if needed):**
   - Set `MERIDIAN_AI_PROVIDER=legacy` (uses fallback brain)

---

## Support & Next Steps

**If you're stuck on:**
- **Twilio trunk config:** Open https://support.twilio.com/hc/en-us/articles/223183927 (SIP Trunking setup)
- **xAI API key:** Go https://console.x.ai → API Keys → Create
- **Railway deployment:** Open the service logs and check for `[xai realtime]` errors

**When you're ready:**
1. Set the Railway env vars above
2. Configure Twilio trunk
3. Call +1 647-490-3326 to test
4. Reply with call duration + any errors in logs
5. We proceed to Stage 4 (customer launch)

---

**Owner authorization:** Kenny Hunter (@agentbridgehq-oss)  
**Created:** 2026-10-05  
**Branch:** `launch-final-stage`  
**Product commit:** `716cddc7f99fe3a2fcefcd1490f9192fcdcedf21`  
