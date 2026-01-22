# Troubleshooting

## Bot Does Not Respond
- Verify the bot is running (`docker-compose ps` or process logs).
- Confirm `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN` are set.
- Ensure Socket Mode is enabled and the app token has `connections:write`.
- Confirm the bot is invited to the channel and you @mention it.

## "Invalid auth" or Slack API Errors
- Reinstall the Slack app after changing scopes.
- Regenerate the bot token if necessary.
- Check that the correct workspace is selected.

## Ashby API Errors
- Verify `ASHBY_API_KEY` permissions.
- Confirm the API key is active in Ashby settings.
- Check for rate limit errors (429) and reduce request volume.

## Anthropic API Errors
- Verify `ANTHROPIC_API_KEY` and billing status.
- Check model name in `ANTHROPIC_MODEL`.

## Daily Summary Not Posting
- Set `DAILY_SUMMARY_ENABLED=true` and `DAILY_SUMMARY_CHANNEL`.
- Confirm timezone and time format are correct (`HH:MM` 24h).

## Pipeline Alerts Not Posting
- Set `PIPELINE_ALERTS_ENABLED=true` and `PIPELINE_ALERTS_CHANNEL`.
- Verify thresholds and timezone settings.

## Reminder Not Delivered
- Reminders are sent via Slack DMs using `chat.scheduleMessage`.
- Ensure the bot has `chat:write` and the user can receive DMs from the app.

## Triage Doesn’t Change Data
- Triage is review-only. Use explicit commands to move or reject candidates.
