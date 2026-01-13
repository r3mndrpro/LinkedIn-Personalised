# LinkedIn AI Outreach Actor

A stealth LinkedIn automation tool that scrapes your connections, uses AI to identify decision-makers, and sends personalized messages safely and humanly.

## Features

- **Stealth Browser**: Uses Playwright with anti-detection measures
- **AI-Powered Filtering**: Gemini AI identifies business owners, founders, C-level executives, and decision-makers
- **Smart Personalization**: AI generates personalized messages based on profile data
- **Human-Like Behavior**: Random delays, scrolling, and timing patterns
- **Safe Rate Limiting**: 3-5 messages per run, 20-40 per day (configurable)
- **State Management**: Remembers processed connections across runs
- **Resume Capability**: Picks up where it left off

## How It Works

1. **Logs into LinkedIn** with your session cookie (no email/password needed!)
2. **Navigates to your connections** page (supports 3,600+ connections)
3. **Processes each connection**:
   - Visits profile
   - Extracts key info (name, headline, company, about, location)
   - Checks state - if already processed, skips
   - Uses Gemini AI to evaluate if they're a decision-maker
   - If YES: generates personalized message and sends it
   - Saves everything to state
4. **Stops after sending 3-5 messages** (configurable)
5. **Scheduled to run every 20 minutes** (you configure in Apify)
6. **Automatically resets daily counter** at midnight

## Setup Instructions

### 1. Install Dependencies Locally (for testing)

```bash
npm install
```

### 2. Get Your LinkedIn Session Cookie

**IMPORTANT**: We use session cookies instead of email/password for better security and reliability (same as Phantombuster).

1. Open Chrome and login to LinkedIn normally
2. Press **F12** to open DevTools
3. Go to **Application** tab → **Cookies** → **https://www.linkedin.com**
4. Find the cookie named **`li_at`**
5. Copy the entire **Value** (starts with `AQEDAT...`, around 200 characters)
6. Save this for later

**Why use cookies?**
- ✅ Bypasses 2FA completely
- ✅ No login automation (more secure)
- ✅ Faster runs (skip login flow)
- ✅ More reliable (no login failures)
- ✅ Industry standard (what the pros use)

### 3. Get Your Gemini API Key

1. Go to https://aistudio.google.com/app/apikey
2. Create a new API key
3. Copy it for later

### 4. Test Locally (Optional)

Create a `.env` file or test input:

```bash
npm start
```

### 5. Deploy to Apify

1. Create an Apify account at https://apify.com
2. Install Apify CLI:
   ```bash
   npm install -g apify-cli
   ```
3. Login:
   ```bash
   apify login
   ```
4. Deploy:
   ```bash
   apify push
   ```

### 6. Configure the Actor

In Apify Console, set these inputs:

- **LinkedIn Session Cookie (li_at)**: The cookie value you copied earlier
- **Gemini API Key**: Your Google Gemini API key
- **Messages Per Run**: 3-5 (recommended 4)
- **Max Messages Per Day**: 20-40 (recommended 30)
- **Voice AI Demo URL**: https://voicecallai.netlify.app/ (or your custom URL)
- **Min/Max Delay**: Random delay range between actions (5-15 seconds recommended)

### 7. Schedule the Actor

In Apify Console:
1. Go to "Schedule" tab
2. Create new schedule
3. Set to run **every 20 minutes**
4. Enable schedule

## State Structure

The actor maintains state across runs:

```json
{
  "connections": {
    "linkedin.com/in/john-doe": {
      "name": "John Doe",
      "headline": "CEO at Company",
      "company": "Company Inc",
      "evaluated": true,
      "isDecisionMaker": true,
      "category": "C-Level",
      "confidence": 0.95,
      "messageSent": true,
      "message": "Hi John...",
      "sentDate": "2026-01-13T10:30:00Z"
    }
  },
  "stats": {
    "totalEvaluated": 150,
    "totalDecisionMakers": 45,
    "totalMessagesSent": 38,
    "todayCount": 5,
    "lastResetDate": "2026-01-13"
  }
}
```

## Safety Features

- **Profile URL as unique key** - avoids duplicates
- **State checking** - skips already processed connections
- **Daily counter reset** - automatically resets at midnight
- **Rate limiting** - stops after X messages per run and per day
- **Random delays** - mimics human behavior
- **Human scrolling** - smooth scrolling patterns
- **Error handling** - graceful failures, continues processing

## AI Message Generation

The system uses **4 intelligent messaging styles** - no rigid templates! Gemini AI picks the best approach for each person and crafts personalized messages.

### The 4 Styles:

**1. Problem-Aware (Direct)**
- Identifies their industry/role
- Points out voice AI opportunity
- Emphasizes control + cost benefits
- Short and punchy

**2. Cost/ROI Focus (Numbers)**
- Leads with 70% savings ($0.08/min vs $0.25/min)
- Shows scale benefits
- Emphasizes ownership vs subscription
- Quantitative value

**3. Builder/Technical (Control)**
- Appeals to technical decision-makers
- Emphasizes full control, no black boxes
- Mentions sub-1s latency, easy deployment
- Collaborative tone

**4. Curiosity/Demo (Soft)**
- Shows working demo upfront
- Non-pushy, value-first
- "Built something cool, check it out"
- Easy CTA

### What You're Promoting:

**Voice AI Platform** (https://voicecallai.netlify.app/)
- Build custom voice agents with full control
- 70% cost savings vs traditional platforms
- Sub-1s response time, production-ready
- No black boxes, easy deployment

The AI automatically:
- Picks the best style for each recipient
- Personalizes based on their profile
- Includes the demo link naturally
- Keeps messages under 300 characters
- Sounds human, not robotic

## Monitoring

Check the actor runs in Apify Console:
- View logs for each run
- Monitor messages sent
- Check evaluation results
- Review state data

## Cost Estimates

- **Apify**: ~$49/month for basic plan (plenty for this use case)
- **Gemini API**: ~$0.001 per call (very cheap, ~$3-5/month for 3,600 connections)

## Troubleshooting

### "Message button not found"
- Some connections may not allow direct messaging
- Actor will log and skip these

### "Daily limit reached"
- Working as intended
- Wait until midnight for reset

### "Login failed"
- Check LinkedIn credentials
- LinkedIn may require 2FA - disable or use app-specific password

### "AI evaluation failed"
- Check Gemini API key
- Check API quota limits

## Best Practices

1. **Start slow**: 3-4 messages per run, 20-30 per day max
2. **Monitor responses**: Track which AI styles get the most replies
3. **Check message quality**: Review generated messages in logs
4. **Don't be aggressive**: This is a marathon, not a sprint
5. **Use during business hours**: Schedule runs between 9am-5pm your timezone
6. **Update your demo**: Keep your voice AI demo fresh and working

## Future Enhancements

- Reply detection
- Lead qualification scoring
- CRM integration
- A/B testing dashboard
- Response tracking
- Multi-account support

## Disclaimer

Use responsibly and in accordance with LinkedIn's Terms of Service. This tool is for educational purposes. Excessive automation may result in account restrictions.
