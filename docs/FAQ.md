# FAQ

## Do recruiters need to know commands?
No. The bot understands natural language in Slack channels where it is invited.

## Does the bot store candidate data?
No. Candidate data is fetched from Ashby on demand and kept in memory only.

## Can the bot operate in DMs?
Not currently. The bot responds to @mentions in channels.

## What happens when a candidate is hired?
Read and write operations are blocked for hired candidates to protect privacy.

## How do confirmations work?
By default, every write action requires emoji confirmation. You can change this with `SAFETY_MODE` and `BATCH_LIMIT` in `.env`.

## How do I enable daily summaries or pipeline alerts?
Set `DAILY_SUMMARY_ENABLED=true` and `DAILY_SUMMARY_CHANNEL`, or enable `PIPELINE_ALERTS_ENABLED` and its channel/time settings.

## What if multiple candidates match a name?
Use email whenever possible. The bot currently uses the first match, so precise identifiers reduce mistakes.

## Does the bot ever change data without confirmation?
Only if `SAFETY_MODE=BATCH_LIMIT` and the action is under the configured batch limit.

## Can I choose a different Claude model?
Yes. Set `ANTHROPIC_MODEL` and `ANTHROPIC_MAX_TOKENS` in `.env`.
