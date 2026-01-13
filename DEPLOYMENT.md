# Deployment Guide

## Quick Start - Deploy to Apify

### Step 1: Prepare Your Project

Ensure all files are in place:
```
linkedin-outreach-actor/
├── .actor/
│   ├── actor.json
│   ├── Dockerfile
│   ├── input_schema.json
│   └── INPUT_EXAMPLE.json
├── src/
│   └── main.js
├── package.json
├── README.md
└── .gitignore
```

### Step 2: Install Apify CLI

```bash
npm install -g apify-cli
```

### Step 3: Login to Apify

```bash
apify login
```

This will open a browser window. Login with your Apify account.

### Step 4: Initialize Actor (if needed)

If this is a new actor:
```bash
apify init
```

Choose "No template" and confirm the existing files.

### Step 5: Push to Apify

```bash
apify push
```

This will:
1. Build the Docker image
2. Upload your code
3. Deploy to Apify platform

### Step 6: Get Your LinkedIn Session Cookie

**We use session cookies instead of email/password (same as Phantombuster):**

1. Open Chrome and **login to LinkedIn** normally
2. Press **F12** to open DevTools
3. Go to **Application** tab → **Cookies** → **https://www.linkedin.com**
4. Find the cookie named **`li_at`**
5. Copy the entire **Value** (starts with `AQEDAT...`, ~200 characters)

**Benefits:**
- ✅ Bypasses 2FA
- ✅ More secure (no password stored)
- ✅ More reliable (no login failures)
- ✅ Faster (skips login flow)

### Step 7: Configure Input

In the Apify Console:

1. Go to your actor page
2. Click "Input" tab
3. Fill in:
   - **LinkedIn Session Cookie (li_at)**: Paste the cookie value from Step 6
   - **Gemini API Key**: Get from https://aistudio.google.com/app/apikey
   - Messages Per Run: **4**
   - Max Messages Per Day: **30**
   - **Voice AI Demo URL**: https://voicecallai.netlify.app/
   - Min Delay: **5**
   - Max Delay: **15**

### Step 8: Test Run

1. Click "Start" button
2. Watch the logs
3. Verify it:
   - Injects session cookie
   - Navigates to connections
   - Scrapes connections
   - Evaluates with AI
   - Sends messages
   - Stops after 4 messages

### Step 9: Schedule It

1. Go to "Schedule" tab
2. Click "Create schedule"
3. Configure:
   - **Cron expression**: `*/20 * * * *` (every 20 minutes)
   - Or use simple scheduler: "Every 20 minutes"
4. Enable the schedule

## Important Notes

### First Run
- The first run will take longer (needs to evaluate all connections)
- Subsequent runs are faster (skips already-processed connections)

### State Storage
- State is saved in Apify Key-Value Store
- Key name: `STATE`
- Persists across runs
- Contains all connection data + stats

### Monitoring

Check these in Apify Console:
- **Runs tab**: View all executions
- **Logs**: Real-time logging
- **Storage**: View state data
- **Dataset**: (not used currently, but could export data here)

### Cost Optimization

**Apify costs:**
- Free tier: 5 actor hours/month (won't be enough)
- Paid tier: $49/month for 100 actor hours
- Each run takes ~5-10 minutes
- Running every 20 minutes = 72 runs/day
- ~6-12 hours/day = ~180-360 hours/month
- **Recommendation**: Use $49 or $99 plan

**Gemini API costs:**
- ~$0.001 per API call
- 2 calls per decision-maker (evaluate + message)
- ~$3-5/month for 3,600 connections

### Troubleshooting

**"Actor failed to start"**
- Check Dockerfile syntax
- Verify all dependencies in package.json
- Check actor.json format

**"Session cookie invalid" or "Not authenticated"**
- Cookie may have expired - get a fresh one
- Make sure you copied the entire `li_at` cookie value
- Try logging into LinkedIn manually again and extracting a new cookie
- Cookies typically last 1-2 months

**"Gemini API error"**
- Check API key is valid
- Check quota limits (free tier = 60 requests/minute)
- Verify billing is enabled

**"Message button not found"**
- Some profiles don't allow direct messages
- This is expected - actor will skip and continue

## Advanced: Running Locally

For development/testing:

1. Create `.env` file:
```
LINKEDIN_SESSION_COOKIE=your-li_at-cookie-value
GEMINI_API_KEY=your-key
```

2. Modify main.js to read from .env (add at top):
```javascript
import dotenv from 'dotenv';
dotenv.config();
```

3. Run locally:
```bash
npm start
```

**Warning**: Running locally uses your IP. Use proxies for production.

## Maintenance

### Weekly:
- Check message success rate
- Review AI evaluation accuracy
- Monitor account health

### Monthly:
- Update message templates based on responses
- Review connection quality
- Optimize AI prompts

## Scaling Up

Once stable:
1. Increase messagesPerRun to 5-6
2. Increase maxMessagesPerDay to 40-50
3. Test different template styles
4. Track which messages get responses
5. Refine AI evaluation criteria

## Security Best Practices

1. **Never commit credentials** - use Apify secrets
2. **Use app-specific password** for LinkedIn (if available)
3. **Enable IP whitelisting** in Apify (optional)
4. **Monitor for unusual activity** on LinkedIn account
5. **Backup state regularly** - export from Apify storage

## Support

If you encounter issues:
1. Check Apify logs first
2. Review LinkedIn account for restrictions
3. Test Gemini API separately
4. Try reducing rate limits

Good luck! 🚀
