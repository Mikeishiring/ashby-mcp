import json
from pathlib import Path
from typing import Dict, Any, List
from ashby_client import AshbyClient

class AshbyMapper:
    def __init__(self, client: AshbyClient):
        self.client = client
        self.lexicon_path = Path(__file__).parent / "ashby_environment.json"

    def map_environment(self) -> Dict[str, Any]:
        """Crawl Ashby to create the environment lexicon."""
        lexicon = {
            "interview_stages": self._map_stages(),
            "open_jobs": self._map_jobs(),
            "sources": self._map_sources(),
            "user_mapping": self._map_users(), # Step 5: User Mapping
        }
        
        lexicon_path = Path(__file__).parent / "ashby_environment.json"
        with open(lexicon_path, "w", encoding="utf-8") as f:
            json.dump(lexicon, f, indent=2)
            
        return lexicon

    def _map_users(self) -> Dict[str, str]:
        """Fetch Ashby users and simulate Slack ID mapping."""
        # Mocking user fetch from Ashby API
        return {
            "Recruiter Sarah": "U12345",
            "Hiring Manager Mike": "U67890"
        }

    def _map_stages(self) -> List[Dict[str, str]]:
        """Map all interview stages and their IDs."""
        stages = self.client.get_interview_stages(refresh=True)
        return [{"id": s.get("id"), "title": s.get("title")} for s in stages]

    def _map_jobs(self) -> List[Dict[str, str]]:
        """Map open jobs."""
        jobs = self.client.get_open_jobs()
        return [{"id": j.get("id"), "title": j.get("title")} for j in jobs]

    def _map_sources(self) -> List[str]:
        """Map available sources."""
        sources = self.client.get_sources(refresh=True)
        return [s.get("title") for s in sources if s.get("title")]

if __name__ == "__main__":
    # For standalone testing
    client = AshbyClient()
    mapper = AshbyMapper(client)
    print(json.dumps(mapper.map_environment(), indent=2))
