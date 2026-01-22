# Security Guide

## Data Handling
- Candidate data is fetched from Ashby on demand and kept in memory only.
- No candidate data is stored on disk by the bot.
- Slack messages may contain candidate data depending on what users request.

## Access Control
- The bot only responds in channels it is invited to.
- The bot’s access mirrors the Ashby API key permissions you grant.
- Hired candidates are blocked for both read and write actions.

## Secrets Management
- Store secrets in environment variables or a secrets manager.
- Never commit `.env` files or API keys to source control.
- Rotate API keys regularly (recommended quarterly).

## Slack Permissions
- Grant only required scopes (`chat:write`, `channels:read`, `channels:history`, `reactions:read`, `reactions:write`).
- Use private channels for sensitive conversations.

## Logging
- Logs include high-level request events and errors.
- Avoid logging raw candidate data in production logs.

## Recommended Hardening
- Run the bot in a private network or secured container environment.
- Enable monitoring and alerting on error logs.
- Use a dedicated Ashby API key with least-privilege scopes.
