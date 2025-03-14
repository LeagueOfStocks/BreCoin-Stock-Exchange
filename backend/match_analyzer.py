import os
import requests
from dotenv import load_dotenv
import json
from datetime import datetime

# Load environment variables
load_dotenv()
API_KEY = os.getenv("RIOT_API_KEY")

class MatchAnalyzer:
    def __init__(self):
        self.headers = {
            "X-Riot-Token": API_KEY
        }
        
    def get_account_by_riot_id(self, game_name, tag_line):
        """Get account info using Riot ID (game name + tag)"""
        url = f"https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/{game_name}/{tag_line}"
        response = requests.get(url, headers=self.headers)
        response.raise_for_status()
        return response.json()

    def get_match_data(self, match_id, summoner_name):
        """Get all data for a specific player in a match"""
        try:
            # Split summoner name into game name and tag
            game_name, tag_line = summoner_name.split('#')
            
            # Get PUUID
            account_data = self.get_account_by_riot_id(game_name, tag_line)
            puuid = account_data['puuid']
            
            # Get match details
            url = f"https://americas.api.riotgames.com/lol/match/v5/matches/{match_id}"
            response = requests.get(url, headers=self.headers)
            response.raise_for_status()
            match_data = response.json()
            
            # Find player in participants
            player_data = None
            for participant in match_data['info']['participants']:
                if participant['puuid'] == puuid:
                    player_data = participant
                    break
            
            if not player_data:
                return {"error": f"Player {summoner_name} not found in match {match_id}"}
            
            # Format game duration
            duration_mins = match_data['info']['gameDuration'] // 60
            duration_secs = match_data['info']['gameDuration'] % 60
            
            # Calculate additional metrics
            kda = (player_data['kills'] + player_data['assists']) / max(1, player_data['deaths'])
            cs_per_min = (player_data['totalMinionsKilled'] + player_data.get('neutralMinionsKilled', 0)) / (match_data['info']['gameDuration'] / 60)
            
            # Format timestamps
            game_start = datetime.fromtimestamp(match_data['info']['gameStartTimestamp'] / 1000)
            game_end = datetime.fromtimestamp(match_data['info']['gameEndTimestamp'] / 1000)
            
            # Prepare detailed player stats
            formatted_data = {
                "match_info": {
                    "match_id": match_id,
                    "queue_type": match_data['info']['queueId'],
                    "game_version": match_data['info']['gameVersion'],
                    "game_duration": f"{duration_mins}:{duration_secs:02d}",
                    "game_start": game_start.strftime("%Y-%m-%d %H:%M:%S"),
                    "game_end": game_end.strftime("%Y-%m-%d %H:%M:%S")
                },
                "player_info": {
                    "summoner_name": player_data['summonerName'],
                    "champion": player_data['championName'],
                    "position": player_data['teamPosition'],
                    "team": "Blue" if player_data['teamId'] == 100 else "Red",
                    "win": player_data['win']
                },
                "performance": {
                    "kills": player_data['kills'],
                    "deaths": player_data['deaths'],
                    "assists": player_data['assists'],
                    "kda": round(kda, 2),
                    "cs": player_data['totalMinionsKilled'] + player_data.get('neutralMinionsKilled', 0),
                    "cs_per_min": round(cs_per_min, 1),
                    "vision_score": player_data['visionScore'],
                    "damage_dealt": {
                        "total": player_data['totalDamageDealt'],
                        "to_champions": player_data['totalDamageDealtToChampions'],
                        "physical": player_data['physicalDamageDealtToChampions'],
                        "magical": player_data['magicDamageDealtToChampions'],
                        "true": player_data['trueDamageDealtToChampions']
                    },
                    "damage_taken": player_data['totalDamageTaken'],
                    "gold_earned": player_data['goldEarned'],
                    "items": [
                        player_data['item0'],
                        player_data['item1'],
                        player_data['item2'],
                        player_data['item3'],
                        player_data['item4'],
                        player_data['item5'],
                        player_data['item6']  # trinket
                    ],
                    "multikills": {
                        "doubles": player_data['doubleKills'],
                        "triples": player_data['tripleKills'],
                        "quadras": player_data['quadraKills'],
                        "pentas": player_data['pentaKills']
                    }
                },
                "objectives": {
                    "turrets_destroyed": player_data['turretKills'],
                    "inhibitors_destroyed": player_data['inhibitorKills'],
                    "dragon_kills": player_data.get('dragonKills', 0),
                    "baron_kills": player_data.get('baronKills', 0),
                    "objective_damage": player_data['damageDealtToObjectives']
                }
            }
            
            return formatted_data
            
        except requests.exceptions.RequestException as e:
            return {"error": f"API Error: {str(e)}"}
        except Exception as e:
            return {"error": f"Error: {str(e)}"}

if __name__ == "__main__":
    # Example usage
    analyzer = MatchAnalyzer()
    
    MATCH_ID = "NA1_5243019918"  
    SUMMONER_NAME = "ProbablyCheating#NA1"  
    
    result = analyzer.get_match_data(MATCH_ID, SUMMONER_NAME)
    
    # Pretty print the results
    print(json.dumps(result, indent=2))