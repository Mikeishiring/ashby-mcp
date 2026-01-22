# Ashby Recruiting Assistant 🤖

**Your AI teammate for managing candidates in Ashby - 52 tools covering core recruiter workflows**

---

## What Is This?

An AI-powered recruiting assistant that lives in Slack and connects to your Ashby ATS. Think of it as a smart teammate who can instantly search candidates, schedule interviews, manage offers, track pipeline health, and handle routine recruiting tasks—all through natural conversation.

**No technical knowledge required to use it.** Just chat like you would with a coworker.

---

## For Recruiters 👋

**New to the bot?** Start here:
- 📖 **[Quick Start Guide](docs/RECRUITER-QUICK-START.md)** - Get started in 5 minutes
- 💬 **[Full Recruiter Guide](RECRUITER-GUIDE.md)** - Complete capabilities and examples
- ❓ **[FAQ](docs/FAQ.md)** - Common questions answered

**What you can do:**
- Search and research candidates instantly
- Check pipeline status and find bottlenecks
- Schedule, reschedule, and cancel interviews
- Create, update, and send offers
- Apply candidates to multiple roles
- Tag candidates for organization
- See hiring teams and track sources
- View full application histories
- Access detailed interview feedback
- ...and much more!

---

## For IT/Admins 🔧

**Setting up the bot?** Start here:
- 🚀 **[Setup Guide](docs/SETUP-GUIDE.md)** - Complete installation instructions
- 🔐 **[Security Guide](docs/SECURITY.md)** - Best practices and compliance
- 📊 **[Monitoring Guide](docs/MONITORING.md)** - Health checks and alerts

**Quick setup overview:**
1. Get API keys (Ashby, Anthropic, Slack)
2. Install via Docker or Node.js
3. Configure environment variables
4. Invite bot to Slack channel
5. Done! (~15 minutes)

---

## What's New in Version 3.0 🎉

### Multi-Role Hiring
- Apply candidates to multiple positions simultaneously
- Transfer applications between roles
- See hiring team members for each role

### Organization & Tracking
- Tag candidates for better organization
- Track candidate sources (LinkedIn, Indeed, etc.)
- View full application histories

### Team Collaboration
- Search for team members
- See who's on hiring committees
- Access locations and departments

### Enhanced Data
- Get detailed interview feedback
- Access custom fields
- View complete candidate journeys

**Total capabilities:** 52 tools (37 read, 15 write), 45 API endpoints covered

---

## Core Capabilities

### 📊 Pipeline Management
Monitor your recruiting pipeline health
- Check overall pipeline status
- Find stale candidates (14+ days in stage)
- Track recent applications
- See candidates needing decisions
- Get source analytics

### 🔍 Candidate Research
Deep dive into candidate information
- Search by name or email
- Get complete candidate profiles
- View interview scorecards
- Compare multiple candidates
- See application timeline
- Access detailed feedback

### 👥 Multi-Role Hiring
Manage candidates across multiple positions
- Apply to multiple jobs
- Transfer between roles
- Check hiring teams
- Track who's involved

### 📅 Interview Management
Schedule and coordinate interviews
- Schedule new interviews
- Reschedule existing ones
- Cancel interviews
- See upcoming schedule
- View all interview events

### 💼 Offer Management
Create and track job offers
- Create new offers
- Update offer details
- Approve offers
- Send to candidates
- Track pending offers
- See offer history

### ✍️ Quick Actions
Handle routine tasks instantly
- Add notes (auto-tagged)
- Move candidates between stages
- Add new candidates
- Reject applications
- Set reminders

### 🔮 Proactive Analysis
AI-powered status insights
- Analyze individual candidate status with blocker detection
- Batch analyze candidates to identify who's stuck and why
- Priority rankings and suggested next actions
- Intelligent grouping by blocker type

### 🏷️ Organization
Keep candidates organized
- Tag candidates
- List available tags
- Track sources
- Access custom fields
- View locations/departments

---

## Example Conversations

### Morning Check-In
```
You: "Morning! What needs my attention?"

Bot: "Hey! Here's what's happening:

📊 Pipeline: 47 active candidates across 12 stages
⚠️ 5 stale candidates need action (14+ days in stage)
📅 3 interviews scheduled this week
💼 2 offers pending approval

Want me to show you the stale candidates first?"
```

### Candidate Research
```
You: "Tell me about Sarah Chen"

Bot: "Found *Sarah Chen* (sarah.chen@email.com)

Current Status: Technical Interview (Day 8)
Job: Senior Backend Engineer
Source: LinkedIn

Recent Activity:
✅ Phone Screen completed (4/5 rating)
✅ Take-home completed (strong submission)
📅 Technical interview scheduled for tomorrow 2pm

She's moving well - shall I send you the interview prep packet?"
```

### Multi-Role Application
```
You: "Sarah is perfect for both the Senior and Staff roles. Apply her to both."

Bot: "Got it! I'll apply *Sarah Chen* to:
1. Senior Backend Engineer (already applied ✓)
2. Staff Backend Engineer (new application)

React with ✅ to confirm"

You: ✅

Bot: "Done! Sarah is now in the pipeline for both roles.
Her Staff Engineer application starts at Application Review.

Hiring teams:
- Senior: Mike (HM), Jane (Recruiter)
- Staff: Alex (HM), Jane (Recruiter)"
```

### Interview Scheduling
```
You: "Schedule John for Wednesday at 3pm with the engineering team"

Bot: "I'll schedule an interview for *John Doe* (john@email.com):
- When: Wednesday 3:00 PM
- Who: Mike Chen, Sarah Park (engineering team)
- Stage: Technical Interview

React with ✅ to confirm"
```

---

## Safety & Confirmations

The bot is designed with safety in mind:

✅ **All write operations require confirmation**
- You'll see exactly what will change
- React with ✅ to proceed
- No changes happen until you confirm

🔒 **Privacy protection**
- Hired candidates are off-limits
- You see the same data you can see in Ashby
- All notes are auto-tagged `[via Slack Bot]`

⚖️ **Batch limits**
- Max 2 candidates moved at once (configurable)
- Prevents accidental bulk changes
- Easy to override if needed

---

## Technical Details

### Architecture
```
Slack → Claude AI (Anthropic) → Ashby API → Your ATS
```

### Tech Stack
- **Backend:** TypeScript/Node.js
- **AI:** Claude Sonnet 4 (Anthropic)
- **Communication:** Slack Socket Mode
- **API:** Ashby REST API
- **Deployment:** Docker/Node.js

### Requirements
- Ashby API key (with permissions)
- Anthropic API key (for Claude)
- Slack Bot token (for messaging)
- Slack App token (for Socket Mode)
- Node.js 20+ or Docker

### API Coverage
- **52 total tools** (37 read, 15 write)
- **45 of ~145 Ashby API endpoints** (31% of API, 100% of core workflows)
- **100% TypeScript type-safe**
- See [API-ENDPOINT-REFERENCE.md](docs/API-ENDPOINT-REFERENCE.md) for full mapping

---

## Project Structure

```
ashby-mcp/
├── docs/                          # Documentation for recruiters & admins
│   ├── RECRUITER-QUICK-START.md  # 5-minute getting started guide
│   ├── SETUP-GUIDE.md             # Complete setup instructions
│   ├── FAQ.md                     # Frequently asked questions
│   └── API-ENDPOINT-REFERENCE.md  # Technical API documentation
├── src/                           # TypeScript source code
│   ├── ai/                        # Claude agent & tools (51 tools)
│   ├── ashby/                     # Ashby API client & service
│   ├── slack/                     # Slack bot integration
│   ├── safety/                    # Confirmation & safety guards
│   └── types/                     # TypeScript definitions
├── RECRUITER-GUIDE.md             # Complete user guide
├── PHASE-3-COMPLETE-SUMMARY.md    # Latest release notes
├── package.json                   # Node.js dependencies
├── tsconfig.json                  # TypeScript configuration
├── Dockerfile                     # Docker deployment
└── README.md                      # This file
```

---

## Quick Start for Admins

```bash
# 1. Clone the repository
git clone https://github.com/your-org/ashby-slack-bot.git
cd ashby-slack-bot

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.example .env
# Edit .env with your API keys

# 4. Build and run
npm run build
npm start
```

**For detailed setup instructions, see [SETUP-GUIDE.md](docs/SETUP-GUIDE.md)**

---

## Environment Variables

```bash
# Required
ASHBY_API_KEY=your_ashby_key_here
ANTHROPIC_API_KEY=your_anthropic_key_here
SLACK_BOT_TOKEN=xoxb-your-slack-token-here
SLACK_APP_TOKEN=xapp-your-app-token-here

# Optional - Customize behavior
SLACK_SIGNING_SECRET=your-signing-secret
ASHBY_BASE_URL=https://api.ashbyhq.com
ANTHROPIC_MODEL=claude-sonnet-4-20250514
ANTHROPIC_MAX_TOKENS=4096

SAFETY_MODE=CONFIRM_ALL
BATCH_LIMIT=2
CONFIRMATION_TIMEOUT_MS=300000

DAILY_SUMMARY_ENABLED=true
DAILY_SUMMARY_TIME=09:00
DAILY_SUMMARY_TIMEZONE=America/New_York
DAILY_SUMMARY_CHANNEL=C0123456789

PIPELINE_ALERTS_ENABLED=false
PIPELINE_ALERTS_TIME=09:00
PIPELINE_ALERTS_TIMEZONE=America/New_York
PIPELINE_ALERTS_CHANNEL=C0123456789
PIPELINE_ALERTS_STALE_THRESHOLD=3
PIPELINE_ALERTS_DECISION_THRESHOLD=2

STALE_DAYS=14
```

---

## Cost Estimate

### Typical Monthly Costs
- **Anthropic API (Claude):** $20-100/month
  - Light usage (1-2 recruiters): ~$10-20
  - Medium usage (5-10 recruiters): ~$30-60
  - Heavy usage (20+ recruiters): ~$80-150
- **Infrastructure:** $10-30/month (cloud hosting)
- **Total:** $30-130/month for most teams

Cost depends on:
- Number of daily interactions
- Complexity of queries
- Model choice (Haiku = cheaper, Opus = expensive)

---

## Support & Documentation

### For Recruiters
- 📖 [Quick Start](docs/RECRUITER-QUICK-START.md) - Get started in minutes
- 💬 [Full Guide](RECRUITER-GUIDE.md) - Complete capabilities
- 💡 [Use Cases](docs/USE-CASES.md) - Real-world examples

### For Admins
- 🚀 [Setup Guide](docs/SETUP-GUIDE.md) - Installation & configuration
- 🔐 [Security](docs/SECURITY.md) - Best practices
- 🐛 [Troubleshooting](docs/TROUBLESHOOTING.md) - Common issues

### For Developers
- 🏗️ [Architecture](docs/ARCHITECTURE.md) - System design
- 🛠️ [Contributing](docs/CONTRIBUTING.md) - Development guide
- 📊 [API Reference](docs/API-ENDPOINT-REFERENCE.md) - Technical details

---

## Security & Privacy

### Data Protection
- API keys stored securely in environment
- No candidate data stored locally
- All data fetched from Ashby in real-time
- Bot only sees what users can see in Ashby

### Access Control
- Bot works only in channels it's invited to
- Same permissions as your Ashby account
- Hired candidates are protected (privacy rules)
- All bot actions are auditable (tagged notes)

### Compliance
- No personal data stored by the bot
- Data processed in memory only
- Complies with your Ashby security policies
- GDPR/SOC2 compatible (follows Ashby's compliance)

---

## Roadmap

### Recently Shipped ✅
- Multi-role hiring workflows
- Application transfers
- Candidate tagging system
- Hiring team visibility
- Source tracking
- Application history
- Detailed feedback access
- Custom fields support

### Coming Soon 🚀
- Automated testing suite
- Performance dashboards
- Usage analytics
- Custom workflows
- Bulk operations
- Advanced analytics
- Mobile notifications

---

## FAQ

**Q: Do I need to know how to code?**
No! Recruiters just chat with the bot in Slack. Setup requires basic technical skills (API keys, environment variables).

**Q: How much does it cost?**
~$30-130/month for most teams (see Cost Estimate section).

**Q: Is my data secure?**
Yes. The bot doesn't store any data - it fetches everything from Ashby in real-time. You have the same security as your Ashby account.

**Q: Can it accidentally mess up my pipeline?**
No. All write operations require confirmation, and there are safety limits on bulk actions.

**Q: What if multiple recruiters use it at once?**
That's fine! The bot handles multiple conversations simultaneously.

**Q: Can I customize what it does?**
Yes. You can adjust stale thresholds, batch limits, and behavior through environment variables.

---

## License

MIT License - See LICENSE file for details

---

## Credits

Built with:
- [Anthropic Claude](https://anthropic.com) - AI capabilities
- [Ashby API](https://developers.ashbyhq.com) - ATS integration
- [Slack API](https://api.slack.com) - Team communication

---

## Getting Help

- 📖 **Documentation:** Check the `/docs` folder
- 🐛 **Issues:** Create an issue on GitHub
- 💬 **Questions:** Ask in your Slack channel where the bot lives

---

**Ready to get started?**
- **Recruiters:** See [RECRUITER-QUICK-START.md](docs/RECRUITER-QUICK-START.md)
- **Admins:** See [SETUP-GUIDE.md](docs/SETUP-GUIDE.md)
- **Developers:** See [ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

*Last Updated: 2026-01-22 | Version 3.0 | 52 tools | 45/145 API endpoints (31%)*
