import json
from datetime import datetime

class AshbyWebhookListener:
    """Simulated Webhook Listener for Ashby Events."""
    
    def handle_event(self, payload: dict):
        event_type = payload.get("type")
        timestamp = datetime.now().isoformat()
        
        if event_type == "candidate.moved_stage":
            data = payload.get("data", {})
            message = f"🔔 Candidate {data.get('candidateName')} moved to Stage: {data.get('targetStageName')}"
            self._notify_slack(message)
        elif event_type == "application.created":
            data = payload.get("data", {})
            message = f"🆕 New Application for {data.get('jobTitle')}: {data.get('candidateName')}"
            self._notify_slack(message)
        
        return {"status": "success", "received_at": timestamp}

    def _notify_slack(self, text: str):
        # Simulation: In production, this would call Slack's chat.postMessage API
        print(f"WEBHOOK_LOG [{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}]: {text}")

if __name__ == "__main__":
    # Example usage for testing
    listener = AshbyWebhookListener()
    test_payload = {
        "type": "candidate.moved_stage",
        "data": {
            "candidateName": "Alice Smith",
            "targetStageName": "Technical Interview"
        }
    }
    listener.handle_event(test_payload)
