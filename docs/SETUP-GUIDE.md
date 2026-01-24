# Ashby Assistant Setup Guide

**For IT/Admin: Get the recruiting assistant running in 15 minutes**

---

## Overview

This guide helps you set up the Ashby recruiting assistant Slack bot for your team. The bot connects Ashby ATS with Slack, allowing recruiters to manage candidates through conversational AI.

**Time Required:** 15-20 minutes
**Technical Level:** Basic (API key management, environment variables)
**Prerequisites:** Access to Ashby admin, Slack workspace admin, Node.js 20+ installed

---

## What You're Setting Up

```
Slack Channel → Bot → Ashby API → Your ATS Data
```

Recruiters message the bot in Slack, and it talks to Ashby's API to fetch/update candidate information.

---

## Step 1: Get API Keys

### Ashby API Key

1. Log into Ashby as an admin
2. Go to **Settings** → **API Keys**
3. Click **Create API Key**
4. Name it: `Slack Bot - Production`
5. Copy the key (you won't see it again!)
6. Save it somewhere secure

**Required Permissions:**
- `candidates:read`
- `candidates:write`
- `applications:read`
- `applications:write`
- `jobs:read`
- `interviews:read`
- `interviews:write`
- `offers:read`
- `offers:write`
- `users:read`
- `feedback:read`

### Anthropic (Claude) API Key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign up or log in
3. Navigate to **API Keys**
4. Click **Create Key**
5. Name it: `Ashby Recruiting Bot`
6. Copy the key
7. **Important:** Add credits to your account (usage-based pricing)

**Estimated Cost:** ~$5-20/month depending on usage

### Slack Bot Token

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App** → **From scratch**
3. Name: `Ashby Recruiting Assistant`
4. Choose your workspace
5. In **OAuth & Permissions**, add these scopes:
   - `chat:write`
   - `channels:read`
   - `channels:history`
   - `reactions:read`
   - `reactions:write`
6. Install the app to your workspace
7. Copy the **Bot User OAuth Token** (starts with `xoxb-`)

### Slack App Token (Socket Mode)

1. In your Slack app settings, go to **Socket Mode**
2. Enable Socket Mode
3. Create an **App-Level Token** with the `connections:write` scope
4. Copy the **App Token** (starts with `xapp-`)

---

## Step 2: Install the Bot

### Option A: Using Docker (Recommended)

```bash
# 1. Clone the repository
git clone https://github.com/your-org/ashby-slack-bot.git
cd ashby-slack-bot

# 2. Create environment file
cp .env.example .env

# 3. Edit .env with your API keys (see below)
nano .env

# 4. Build and run
docker-compose up -d

# 5. Check logs
docker-compose logs -f
```

### Option B: Direct Node.js

```bash
# 1. Clone the repository
git clone https://github.com/your-org/ashby-slack-bot.git
cd ashby-slack-bot

# 2. Install dependencies
npm install

# 3. Create environment file
cp .env.example .env

# 4. Edit .env with your API keys
nano .env

# 5. Build
npm run build

# 6. Start
npm start
```

---

## Step 3: Configure Environment

Edit your `.env` file with the API keys you collected:

```bash
# Ashby API
ASHBY_API_KEY=your_ashby_api_key_here

# Anthropic (Claude)
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Slack
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token-here
SLACK_APP_TOKEN=xapp-your-app-token-here
SLACK_SIGNING_SECRET=your-signing-secret  # Optional for Socket Mode

# Optional: Customize behavior
SAFETY_MODE=CONFIRM_ALL
BATCH_LIMIT=2
CONFIRMATION_TIMEOUT_MS=300000
STALE_DAYS=14

DAILY_SUMMARY_ENABLED=true
DAILY_SUMMARY_TIME=09:00
DAILY_SUMMARY_TIMEZONE=America/New_York
DAILY_SUMMARY_CHANNEL=C1234567890

PIPELINE_ALERTS_ENABLED=false
PIPELINE_ALERTS_TIME=09:00
PIPELINE_ALERTS_TIMEZONE=America/New_York
PIPELINE_ALERTS_CHANNEL=C1234567890
PIPELINE_ALERTS_STALE_THRESHOLD=3
PIPELINE_ALERTS_DECISION_THRESHOLD=2

ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

### Finding a Slack Channel ID

1. Open Slack
2. Right-click the channel where you want the bot
3. Click **View channel details**
4. Scroll down - the Channel ID is at the bottom
5. Use it for `DAILY_SUMMARY_CHANNEL` or `PIPELINE_ALERTS_CHANNEL` if you enable those features

---

## Step 4: Invite the Bot to Slack

1. In Slack, go to the channel where you want the bot
2. Type `/invite @Ashby Recruiting Assistant`
3. The bot should appear as a member

---

## Step 5: Test the Bot

Send a message in the channel:

```
"Hi! What can you help me with?"
```

Expected response:
```
Hey! I'm your recruiting assistant. I can help you search for candidates,
check pipeline status, schedule interviews, manage offers, and a lot more.

Try asking me something like:
• "What's the pipeline looking like?"
• "Find Sarah Chen"
• "Show me stale candidates"

What would you like to know?
```

If you see this, **you're done!** ✅

---

## Step 6: Grant Team Access

The bot works in any channel it's invited to. Common setups:

### Option A: Dedicated Bot Channel
```
Create #ashby-bot
Invite entire recruiting team
Invite @Ashby Recruiting Assistant
```

### Option B: Integration with Existing Channels
```
Invite bot to #recruiting
Invite bot to #hiring-engineering
Invite bot to #talent-team
```

### Option C: Private Channels
```
Create private #recruiting-confidential
Invite specific recruiters
Invite @Ashby Recruiting Assistant
```

The bot sees only channels it's invited to.

---

## Troubleshooting

### Bot doesn't respond

**Check 1:** Is the bot running?
```bash
# Docker
docker-compose ps

# Node.js
ps aux | grep node
```

**Check 2:** Check logs
```bash
# Docker
docker-compose logs -f

# Node.js
npm run start  # Look for errors in console
```

**Check 3:** Verify API keys
```bash
# Test Ashby API
curl -u YOUR_ASHBY_API_KEY: https://api.ashbyhq.com/job.list

# Test Anthropic API
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: YOUR_ANTHROPIC_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-4-20250514","max_tokens":1024,"messages":[{"role":"user","content":"Hello"}]}'
```

### Bot responds but can't find candidates

**Issue:** Ashby API permissions

**Fix:**
1. Go to Ashby admin → API Keys
2. Edit your API key
3. Ensure all permissions are enabled (see Step 1)
4. Restart the bot

### "Rate limit exceeded" errors

**Issue:** Too many API calls

**Fix:**
1. The bot caches data to avoid this
2. If persistent, check if multiple bots are using the same key
3. Contact Ashby support to increase rate limits

### Anthropic API errors

**Issue:** Usually billing-related

**Fix:**
1. Log into console.anthropic.com
2. Check your billing page
3. Add credits if needed
4. Verify API key is active

---

## Security Best Practices

### 1. Protect API Keys
- Never commit `.env` to git
- Use environment variables or secrets manager
- Rotate keys every 90 days

### 2. Limit Bot Access
- Only invite bot to necessary channels
- Use private channels for sensitive discussions
- Regularly audit bot membership

### 3. Monitor Usage
```bash
# Check bot logs regularly
docker-compose logs | grep ERROR

# Monitor Anthropic costs
# Check console.anthropic.com monthly
```

### 4. Restrict Ashby Permissions
The bot only needs:
- Read access to candidates, jobs, interviews
- Write access for scheduling, notes, offers
- No admin access required

---

## Maintenance

### Monthly Tasks
- [ ] Review Anthropic API usage/costs
- [ ] Check error logs for issues
- [ ] Verify bot is responding in all channels
- [ ] Update to latest version if available

### Quarterly Tasks
- [ ] Rotate API keys
- [ ] Review and update team access
- [ ] Check for new Ashby API features
- [ ] Update documentation for team

---

## Advanced Configuration

### Customize Behavior

Edit `.env` to tune the bot:

```bash
# How long before someone is "stale"
STALE_DAYS=21  # Default: 14

# Max candidates to move at once (safety)
BATCH_LIMIT=5  # Default: 2

# Safety mode: CONFIRM_ALL or BATCH_LIMIT
SAFETY_MODE=CONFIRM_ALL

# AI model (faster = cheaper, but less capable)
ANTHROPIC_MODEL=claude-haiku-20250306  # Cheaper option
ANTHROPIC_MODEL=claude-sonnet-4-20250514  # Default (best)
ANTHROPIC_MODEL=claude-opus-4-20241120  # Most capable (expensive)

# Response length
ANTHROPIC_MAX_TOKENS=4096  # Longer responses
```

### Multiple Environments

Create separate configs for staging/production:

```bash
# .env.production
ASHBY_API_KEY=prod_key_here
DAILY_SUMMARY_CHANNEL=C_PROD_CHANNEL

# .env.staging
ASHBY_API_KEY=staging_key_here
DAILY_SUMMARY_CHANNEL=C_STAGING_CHANNEL
```

Run with:
```bash
NODE_ENV=production npm start
NODE_ENV=staging npm start
```

---

## Scaling

### For Large Teams (100+ recruiters)

1. **Use Docker/Kubernetes** for reliability
2. **Set up monitoring** (Datadog, Sentry)
3. **Configure rate limiting** in Ashby
4. **Consider dedicated Anthropic plan** (contact their sales)
5. **Set up log aggregation** (ELK stack, Splunk)

---

## Cost Estimation

### Anthropic API
- **Light usage** (1-2 recruiters): $5-10/month
- **Medium usage** (5-10 recruiters): $20-50/month
- **Heavy usage** (20+ recruiters): $100-200/month

Usage depends on:
- Number of daily interactions
- Complexity of queries
- Model choice (Haiku < Sonnet < Opus)

### Infrastructure
- **Cloud hosting** (AWS/GCP): $10-30/month
- **Docker hosting** (DigitalOcean): $10-20/month
- **Self-hosted**: Free (just electricity)

**Total Est:** $20-100/month for most teams

---

## Getting Help

### Common Issues

| Issue | Solution |
|-------|----------|
| Bot offline | Check logs, verify process running |
| No response | Check API keys, verify Slack token |
| Can't find candidates | Check Ashby API permissions |
| Rate limited | Add caching, spread out requests |
| High costs | Switch to Haiku model, review usage |

### Support Resources

- **Documentation:** See `/docs` folder
- **Logs:** Check bot logs for error details
- **Ashby API Docs:** https://developers.ashbyhq.com
- **Anthropic Docs:** https://docs.anthropic.com
- **Slack API Docs:** https://api.slack.com

---

## Success Checklist

Before considering setup complete:

- [ ] Bot responds to messages in Slack
- [ ] Can search for candidates by name
- [ ] Can view pipeline overview
- [ ] Can schedule an interview (test with fake data)
- [ ] Can create a test offer
- [ ] Team members can access the bot channel
- [ ] API keys are securely stored
- [ ] Monitoring/logging is set up
- [ ] Team has been trained (see RECRUITER-QUICK-START.md)

---

**Once everything is checked, your Ashby assistant is production-ready! Share RECRUITER-QUICK-START.md with your team to get them started.**

---

*Last Updated: 2026-01-24*
*Questions? Check the FAQ or create an issue in the repository.*
