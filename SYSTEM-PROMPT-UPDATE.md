# System Prompt Update

**Date:** 2026-01-19
**File Modified:** `src/ai/agent.ts` (lines 20-37)
**Purpose:** Make Slack bot responses more casual and colleague-like

---

## What Changed

### Before (Formal, Structured)
```
You are a recruiting assistant that helps manage an Ashby ATS pipeline through Slack...

## Your Capabilities
- **Pipeline Management**: View pipeline overview, find stale candidates, track recent applications
- **Candidate Search**: Search by name/email, get detailed candidate info, view notes and feedback
...

## Guidelines
1. **Be concise** - Keep Slack messages brief and scannable
2. **Use formatting** - Use bullet points and *bold* for key info
...
```

### After (Casual, Conversational)
```
You're a recruiting assistant helping manage the Ashby ATS pipeline through Slack.
Think of yourself as a helpful teammate who can quickly look up candidate info,
track pipeline status, and handle routine recruiting tasks.

What you can do:
You can search for candidates, check pipeline status, find stale candidates who need
attention, look up job details, manage interviews (schedule, reschedule, cancel),
handle offers (create, update, approve, send), add candidates to the system...

How to communicate:
Talk like a colleague, not a robot. Keep it casual and conversational...
```

---

## Key Improvements

### 1. Tone Change
- **Before**: Formal, robotic ("You are a recruiting assistant")
- **After**: Friendly, human ("You're a recruiting assistant... Think of yourself as a helpful teammate")

### 2. Structure
- **Before**: Formal sections with bullets (## Your Capabilities, ## Guidelines)
- **After**: Conversational paragraphs with natural section headers

### 3. Communication Style
- **Before**: "Be concise - Keep Slack messages brief and scannable"
- **After**: "Talk like a colleague, not a robot. Keep it casual and conversational."

### 4. Added Phase 1 Capabilities
Now explicitly mentions the new tools:
- **Interviews**: "manage interviews (schedule, reschedule, cancel)"
- **Offers**: "handle offers (create, update, approve, send)"
- **Candidates**: "add candidates to the system"

### 5. Examples of Tone Shift

| Before | After |
|--------|-------|
| "You have comprehensive access to tools" | "Basically, if it's in Ashby, you can probably help with it" |
| "**Be concise** - Keep Slack messages brief" | "Keep responses short unless someone asks for details" |
| "**Confirm writes** - Always describe exactly what you're about to do" | "just explain what you're about to do and ask for a ✅" |
| "**Handle ambiguity** - If multiple candidates match, ask for clarification" | "Always include the candidate's email... so there's no confusion" |

---

## Expected Impact

The bot should now respond more like this:

**Before:**
```
## Current Functionality

**Pipeline & Candidate Management:**
• View overall pipeline status and candidate distribution
• Find stale candidates (stuck >14 days in stages)
• Track recent applications and candidates needing decisions
```

**After:**
```
Right now I can help you check on the pipeline, find candidates who've been
sitting in a stage too long (stale = more than 14 days), search for specific
people, manage interviews and offers, and keep things moving through the process.
```

---

## Build Status

✅ **Build Passing** - No TypeScript errors

```bash
npm run build
# ✅ Build successful
```

---

## Related Files

- `src/ai/agent.ts` - Updated SYSTEM_PROMPT (lines 20-37)
- `PHASE-1-IMPLEMENTATION-SUMMARY.md` - Phase 1 capabilities the prompt now references

---

## Testing Recommendations

Test the bot's responses to these prompts to verify the casual tone:

1. "What can you help me with?"
2. "Show me all pending offers"
3. "Who are the stale candidates?"
4. "Schedule an interview for John Doe"

Expected: Responses should feel conversational, not like a formal report.
