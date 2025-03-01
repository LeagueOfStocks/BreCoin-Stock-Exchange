import requests
import pandas as pd
import sqlite3
from datetime import datetime
import joblib
import time

def adapt_datetime(dt):
    return dt.isoformat()

sqlite3.register_adapter(datetime, adapt_datetime)

class PlayerStockTracker:
    def __init__(self, api_key):
        self.api_key = api_key
        self.headers = {
            "X-Riot-Token": self.api_key
        }
        self.base_url = "https://na1.api.riotgames.com"

        # Initialize database
        self.init_database()
        
        # Load ML model
        self.model = joblib.load('lr_model.joblib')
        
        # Player-champion mapping
        self.players = {
            "Maqmood#8397": {"champion": "Camille", "puuid": None},
            "Wasiio#NA1": {"champion": "Yasuo", "puuid": None},
            "theultimateace1#001": {"champion": "Anivia", "puuid": None},
            "Waddłes#NA1": {"champion": "Ekko", "puuid": None},
            "Hardfeat#1048": {"champion": "Jax", "puuid": None},
            "ProbablyCheating#NA1": {"champion": "Jhin", "puuid": None},
            "Valyrian#NA2": {"champion": "Syndra", "puuid": None},
            "SerBlackFish#TDF": {"champion": "Illaoi", "puuid": None},
            "Pabby032#NA1": {"champion": "Velkoz", "puuid": None}, 
        }
        
        # Role mapping
        self.role_mapping = {
            "TOP": 1,
            "JUNGLE": 2,
            "MIDDLE": 3,
            "BOTTOM": 4,
            "UTILITY": 5
        }
        
        # Valid game types
        self.valid_game_types = [
            "RANKED_SOLO_5x5",
            "RANKED_FLEX_SR",
            "CLASH",
            "NORMAL_DRAFT_5x5"
        ]

    def init_database(self):
        conn = sqlite3.connect('player_stocks.db')
        c = conn.cursor()
        
        # Create stock values table
        c.execute('''
            CREATE TABLE IF NOT EXISTS stock_values (
                player_tag TEXT,
                champion TEXT,
                stock_value REAL,
                model_score REAL,
                timestamp DATETIME,
                game_id TEXT,
                PRIMARY KEY (player_tag, champion, timestamp)
            )
        ''')
        
        # Modify processed games table to use composite primary key
        c.execute('''
            CREATE TABLE IF NOT EXISTS processed_games (
                game_id TEXT,
                player_tag TEXT,
                champion TEXT,
                processed_date DATETIME,
                PRIMARY KEY (game_id, player_tag, champion)
            )
        ''')
        
        conn.commit()
        conn.close()

    def is_game_processed(self, game_id, player_tag, champion):
        conn = sqlite3.connect('player_stocks.db')
        c = conn.cursor()
        
        c.execute('''
            SELECT 1 FROM processed_games 
            WHERE game_id = ? AND player_tag = ? AND champion = ?
        ''', (game_id, player_tag, champion))
        
        result = c.fetchone()
        conn.close()
        
        return result is not None

    def mark_game_processed(self, game_id, player_tag, champion):
        conn = sqlite3.connect('player_stocks.db')
        c = conn.cursor()
        
        c.execute('''
            INSERT INTO processed_games (game_id, player_tag, champion, processed_date)
            VALUES (?, ?, ?, ?)
        ''', (game_id, player_tag, champion, datetime.now()))
        
        conn.commit()
        conn.close()

    def get_puuid(self, player_tag):
        gameName, tagLine = player_tag.split('#')
        url = f"https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}"
        
        try:
            response = requests.get(url, headers=self.headers)
            response.raise_for_status()
            return response.json()['puuid']
        except Exception as e:
            print(f"Error getting PUUID for {player_tag}: {e}")
            return None

    def get_latest_match(self, puuid):
        url = f"https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids"
        params = {"count": 1}
        
        try:
            response = requests.get(url, headers=self.headers)
            response.raise_for_status()
            match_ids = response.json()
            return match_ids[0] if match_ids else None
        except Exception as e:
            print(f"Error getting match history: {e}")
            return None

    def get_match_details(self, match_id):
        url = f"https://americas.api.riotgames.com/lol/match/v5/matches/{match_id}"
        
        try:
            response = requests.get(url, headers=self.headers)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"Error getting match details: {e}")
            return None

    def calculate_metrics(self, match_data, puuid):
        if not match_data:
            return None
            
        # Find participant data
        participant = None
        for p in match_data['info']['participants']:
            if p['puuid'] == puuid:
                participant = p
                break
                
        if not participant:
            return None
            
        # Calculate team objective damage
        team_obj_damage = sum(
            p['damageDealtToObjectives'] 
            for p in match_data['info']['participants'] 
            if p['teamId'] == participant['teamId']
        )
        
        # Calculate team total kills
        team_total_kills = sum(
            p['kills']
            for p in match_data['info']['participants']
            if p['teamId'] == participant['teamId']
        )
        
        # Calculate average gold and exp
        avg_gold = sum(p['goldEarned'] for p in match_data['info']['participants']) / 10
        avg_exp = sum(p['champExperience'] for p in match_data['info']['participants']) / 10
        
        # Convert role to number
        role_num = self.role_mapping.get(participant['teamPosition'], 0)
        
        # Convert win/loss to 1/2
        win_value = 1 if participant['win'] else 0
        
        # Calculate kill participation as a decimal
        kill_participation = (participant['kills'] + participant['assists']) / max(1, team_total_kills)
        
        metrics = {
            'Role': role_num,
            'KDA': (participant['kills'] + participant['assists']) / max(1, participant['deaths']),
            'GoldDifference': participant['goldEarned'] - avg_gold,
            'ExpDifference': participant['champExperience'] - avg_exp,
            'VisionScore': participant['visionScore'],
            'DamageToChampions': participant['totalDamageDealtToChampions'],
            'ObjectiveDamageShare': participant['damageDealtToObjectives'] / max(1, team_obj_damage),
            'KillParticipation': kill_participation,
            'WIN_LOSS': win_value
        }
        
        return metrics

    def get_current_stock(self, player_tag, champion):
        conn = sqlite3.connect('player_stocks.db')
        c = conn.cursor()
        
        c.execute('''
            SELECT stock_value FROM stock_values 
            WHERE player_tag = ? AND champion = ?
            ORDER BY timestamp DESC LIMIT 1
        ''', (player_tag, champion))
        
        result = c.fetchone()
        conn.close()
        
        return result[0] if result else 10.0  # Default value

    def update_stock(self, player_tag, champion, new_value, model_score, game_id):
        conn = sqlite3.connect('player_stocks.db')
        c = conn.cursor()
        
        c.execute('''
            INSERT INTO stock_values (player_tag, champion, stock_value, model_score, timestamp, game_id)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (player_tag, champion, new_value, model_score, datetime.now(), game_id))
        
        conn.commit()
        conn.close()

    """
    Calculate new stock value using Exponential Moving Average (EMA).
    Alpha controls how much weight to give to recent scores vs historical prices.
    Alpha of 0.4 means 40% weight to new score, 60% to historical prices.
    """
    def calculate_new_stock(self, current_stock, model_score, alpha=0.4):
        adjustment = (model_score - 5) * 2
        raw_new_stock = current_stock + adjustment
        new_stock = alpha * raw_new_stock + (1 - alpha) * current_stock
        return max(0, new_stock)

    def run(self):
        # First, get PUUIDs for all players
        for player_tag in self.players:
            self.players[player_tag]['puuid'] = self.get_puuid(player_tag)
            time.sleep(3)  # Increased from 1 to 3 seconds

        # Process each player's latest match
        for player_tag, data in self.players.items():
            puuid = data['puuid']
            if not puuid:
                continue
                
            # Get latest match
            match_id = self.get_latest_match(puuid)
            time.sleep(3)  # Added delay after getting match ID
            if not match_id:
                continue
            
            # Get match details
            match_data = self.get_match_details(match_id)
            time.sleep(3)  # Added delay after getting match details
            if not match_data:
                continue

            # Get all participants in this game
            participants = match_data['info']['participants']
            
            # Find all tracked players who were actually in this game
            for curr_player_tag, curr_data in self.players.items():
                curr_puuid = curr_data['puuid']
                if not curr_puuid:
                    continue
                    
                # Find this player in the match participants
                participant_data = next(
                    (p for p in participants if p['puuid'] == curr_puuid),
                    None
                )
                
                # Skip if player wasn't in this game
                if not participant_data:
                    print(f"\n{curr_player_tag} was not in game {match_id}")
                    continue
                    
                # Skip if player wasn't on their tracked champion
                if participant_data['championName'] != curr_data['champion']:
                    print(f"\n{curr_player_tag} was in game but not on {curr_data['champion']}")
                    continue
                    
                # Skip if already processed
                if self.is_game_processed(match_id, curr_player_tag, curr_data['champion']):
                    print(f"\nAlready processed {curr_player_tag} on {curr_data['champion']} for game {match_id}")
                    continue

                print(f"\nProcessing {curr_player_tag} on {curr_data['champion']} in game {match_id}")
                
                # Process this player's performance
                metrics = self.calculate_metrics(match_data, curr_puuid)
                if not metrics:
                    continue
                
                print(f"\nCollected values for {curr_player_tag} on {curr_data['champion']}:")
                print("Values being input to LR model in order:")
                for key, value in metrics.items():
                    print(f"{key}: {value:.2f}")
                
                model_input = pd.DataFrame([list(metrics.values())], columns=list(metrics.keys()))
                model_score = min(10, self.model.predict(model_input)[0])
                
                current_stock = self.get_current_stock(curr_player_tag, curr_data['champion'])
                new_stock = self.calculate_new_stock(current_stock, model_score)
                self.update_stock(curr_player_tag, curr_data['champion'], new_stock, model_score, match_id)
                
                self.mark_game_processed(match_id, curr_player_tag, curr_data['champion'])
                
                print(f"\nModel Score: {model_score:.2f}")
                print(f"Previous Stock: {current_stock:.2f}")
                print(f"New Stock: {new_stock:.2f}")
                print(f"Game ID: {match_id}")
                
                time.sleep(3)  # Increased from 1 to 3 seconds

if __name__ == "__main__":
    API_KEY = "RGAPI-96e31f4f-559c-4027-9a3e-77ae58e84a3f"
    tracker = PlayerStockTracker(API_KEY)
    tracker.run()