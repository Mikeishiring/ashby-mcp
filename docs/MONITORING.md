# Monitoring Guide

## What to Monitor
- Process uptime and restarts
- Slack connectivity errors
- Ashby API errors or rate limits
- Anthropic API errors or billing issues
- Daily summary and pipeline alert delivery

## Logs
Common log prefixes:
- `[Ashby]` API requests and errors
- `Slack app error` for Slack client issues
- `Failed to post daily summary` for scheduler failures

### Docker
```
docker-compose logs -f
```

### Node.js
```
npm start
```

## Suggested Alerts
- Error rate spikes (Ashby or Slack errors)
- Repeated restart loops
- Missing daily summaries during business hours

## Health Checks
There is no HTTP health endpoint. Use process supervision:
- Docker `restart: unless-stopped`
- Systemd or a process manager in production
