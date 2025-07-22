import requests
import pandas as pd
from datetime import datetime
import pickle  # Switched to pickle to match our model saving format
import time
import sys
import os
import numpy as np

# Add current directory to Python path if necessary
sys.path.append('.')

# --- NEW: Define the exact feature order your new models were trained on. ---
# This is CRITICAL for ensuring the data is fed to the model correctly.
# This list must be identical to the one used in your final training script.

FEATURE_ORDER = [
    'kda', 'dmg_to_champions_per_min', 'team_damage_share', 'team_gold_share',
    'gold_diff_15', 'exp_diff_15', 'kill_participation',
    'objective_damage_per_min', 'team_objective_damage_share',
    'vision_score_per_min', 'team_vision_score_share',
    'damage_taken_per_min', 'damage_taken_share',
    'healing_shielding_allies_per_min','gold_diff_per_min',  
    'exp_diff_per_min',  'win_loss'
]


class PlayerStockTracker:
    def __init__(self, api_key):
        self.api_key = api_key
        self.headers = {"X-Riot-Token": self.api_key}
        self.base_url = "https://na1.api.riotgames.com"

        self.init_database()
        
        # --- MODIFIED: Load 5 specialist models instead of one. ---
        self.models = {}
        self.load_models()
        
        # Player-champion mapping (unchanged)
        self.players = {
            "Valyrian#NA2": {"champion": "Viktor", "puuid": None},
            "Maqmood#8397": {"champion": "Camille", "puuid": None},
            "Wasiio#NA1": {"champion": "Yasuo", "puuid": None},
            "theultimateace1#001": {"champion": "Anivia", "puuid": None},
            "Waddłes#NA1": {"champion": "Xerath", "puuid": None},
            "Hardfeat#1048": {"champion": "Nunu", "puuid": None},
            "ProbablyCheating#NA1": {"champion": "Jhin", "puuid": None},
            "SerBlackFish#TDF": {"champion": "Illaoi", "puuid": None},
            "Pabby032#NA1": {"champion": "Vel'Koz", "puuid": None}, 
            "soulcrucher49#NA1": {"champion": "Taric", "puuid": None},
            "DuMistGeburt#NA1": {"champion": "Veigar", "puuid": None},
            "Chocolate Kid#NA1": {"champion": "Vayne", "puuid": None},
            "CarryPuttar#NA1": {"champion": "Shaco", "puuid": None},
        }
        
        # --- NEW: Mapping from Riot's API role names to our model keys ---
        self.role_name_mapping = {
            "TOP": "Top",
            "JUNGLE": "Jungle",
            "MIDDLE": "Mid",
            "BOTTOM": "ADC",
            "UTILITY": "Support"
        }
        
        # Valid game types (unchanged)
        self.valid_game_types = ["RANKED_SOLO_5x5", "RANKED_FLEX_SR", "CLASH", "NORMAL_DRAFT_5x5"]

    # --- NEW: Function to load all 5 model files at startup ---
    def load_models(self):
        """Loads the 5 specialist model .pkl files into memory."""
        print("--- Loading all specialist models ---")
        roles = ['Top', 'Jungle', 'Mid', 'ADC', 'Support']
        try:
            for role in roles:
                role_lower = role.lower()
                model_filename = f'{role_lower}_model.pkl'
                with open(model_filename, 'rb') as f_model:
                    self.models[role] = pickle.load(f_model)
            print("All 5 models have been loaded successfully.")
        except FileNotFoundError as e:
            print(f"!!! CRITICAL ERROR: Could not load models. Missing file: {e.filename} !!!")
            print("!!! Please ensure all 5 `_model.pkl` files are in the same directory. !!!")
            self.models = {}


    def init_database(self):
        # Check if tables exist and create them if they don't
        from lib.database import get_connection
        conn = get_connection()
        
        try:
            with conn.cursor() as c:
                # Check if stock_values table exists
                c.execute("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_name = 'stock_values'
                    )
                """)
                table_exists = c.fetchone()[0]
                
                if not table_exists:
                    # Create stock values table
                    c.execute('''
                        CREATE TABLE stock_values (
                            player_tag TEXT,
                            champion TEXT,
                            stock_value REAL,
                            model_score REAL,
                            timestamp TIMESTAMP,
                            game_id TEXT,
                            PRIMARY KEY (player_tag, champion, timestamp)
                        )
                    ''')
                
                # Check if processed_games table exists
                c.execute("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_name = 'processed_games'
                    )
                """)
                table_exists = c.fetchone()[0]
                
                if not table_exists:
                    # Create processed games table
                    c.execute('''
                        CREATE TABLE processed_games (
                            game_id TEXT,
                            player_tag TEXT,
                            champion TEXT,
                            processed_date TIMESTAMP,
                            PRIMARY KEY (game_id, player_tag, champion)
                        )
                    ''')
                
                conn.commit()
        finally:
            conn.close()

    def is_game_processed(self, game_id, player_tag, champion):
        from lib.database import get_connection
        conn = get_connection()
        
        try:
            with conn.cursor() as c:
                c.execute('''
                    SELECT 1 FROM processed_games 
                    WHERE game_id = %s AND player_tag = %s AND champion = %s
                ''', (game_id, player_tag, champion))
                
                result = c.fetchone()
                return result is not None
        finally:
            conn.close()

    def mark_game_processed(self, game_id, player_tag, champion):
        from lib.database import get_connection
        conn = get_connection()
        
        try:
            with conn.cursor() as c:
                c.execute('''
                    INSERT INTO processed_games (game_id, player_tag, champion, processed_date)
                    VALUES (%s, %s, %s, %s)
                ''', (game_id, player_tag, champion, datetime.now()))
                
                conn.commit()
        finally:
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

    def get_match_timeline(self, match_id):
        """NEW function to get the match timeline data for accurate diff stats."""
        url = f"https://americas.api.riotgames.com/lol/match/v5/matches/{match_id}/timeline"
        try:
            response = requests.get(url, headers=self.headers)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"Error getting match timeline: {e}")
            return None

    # --- HEAVILY MODIFIED: Calculates all the new, advanced metrics ---
    def calculate_metrics(self, match_data, timeline_data, puuid):
       
        if not match_data or not timeline_data:
            return None
        info = match_data['info']
        participant = next((p for p in info['participants'] if p['puuid'] == puuid), None)
        if not participant:
            return None
        
        game_duration_min = info.get('gameDuration', 0) / 60.0
        if game_duration_min < 5:
            return None
        
        team_id = participant['teamId']
        team_participants = [p for p in info['participants'] if p['teamId'] == team_id]
        team_total_damage = max(1, sum(p.get('totalDamageDealtToChampions', 0) for p in team_participants))
        team_total_gold = max(1, sum(p.get('goldEarned', 0) for p in team_participants))
        team_total_vision = max(1, sum(p.get('visionScore', 0) for p in team_participants))
        team_total_obj_damage = max(1, sum(p.get('damageDealtToObjectives', 0) for p in team_participants))
        team_total_kills = max(1, sum(p.get('kills', 0) for p in team_participants))
        team_total_damage_taken = max(1, sum(p.get('totalDamageTaken', 0) for p in team_participants))

        participant_id = participant['participantId']
        opponent = next((p for p in info['participants'] if p['teamId'] != team_id and p['teamPosition'] == participant['teamPosition']), None)
        
        gold_diff_15 = 0
        exp_diff_15 = 0
        if opponent and len(timeline_data['info']['frames']) > 15:
            try:
                frame_15 = timeline_data['info']['frames'][15]
                player_frame = frame_15['participantFrames'][str(participant_id)]
                opponent_frame = frame_15['participantFrames'][str(opponent['participantId'])]
                gold_diff_15 = player_frame['totalGold'] - opponent_frame['totalGold']
                exp_diff_15 = player_frame['xp'] - opponent_frame['xp']
            except KeyError:
                print(f"Warning: Could not find timeline frame data at 15 mins for match {match_data['metadata']['matchId']}.")
        
        player_gpm = participant.get('challenges', {}).get('goldPerMin', 0)
        player_xpm = participant.get('challenges', {}).get('xpPerMin', 0)

        gold_diff_per_min = 0

        exp_diff_per_min = 0
        if opponent:
            # Get the final gold and XP for both players (guaranteed to exist)
            player_total_gold = participant.get('goldEarned', 0)
            opponent_total_gold = opponent.get('goldEarned', 0)
            
            player_total_exp = participant.get('champExperience', 0)
            opponent_total_exp = opponent.get('champExperience', 0)

            # Calculate the final difference
            final_gold_diff = player_total_gold - opponent_total_gold
            final_exp_diff = player_total_exp - opponent_total_exp
            
            # Divide by game length to get the average differential per minute
            gold_diff_per_min = final_gold_diff / game_duration_min
            exp_diff_per_min = final_exp_diff / game_duration_min


        
            
        metrics = {
            'role': self.role_name_mapping.get(participant['teamPosition'], 'UNKNOWN'),
            'kda': (participant.get('kills', 0) + participant.get('assists', 0)) / max(1, participant.get('deaths', 1)),
            'dmg_to_champions_per_min': participant.get('totalDamageDealtToChampions', 0) / game_duration_min,
            'team_damage_share': (participant.get('totalDamageDealtToChampions', 0) / team_total_damage) * 100,
            'team_gold_share': (participant.get('goldEarned', 0) / team_total_gold) * 100,
            'kill_participation': ((participant.get('kills', 0) + participant.get('assists', 0)) / team_total_kills) * 100,
            'team_objective_damage_share': (participant.get('damageDealtToObjectives', 0) / team_total_obj_damage) * 100,
            'team_vision_score_share': (participant.get('visionScore', 0) / team_total_vision) * 100,
            'damage_taken_share': (participant.get('totalDamageTaken', 0) / team_total_damage_taken) * 100,
            'gold_diff_15': gold_diff_15,
            'exp_diff_15': exp_diff_15,
            'objective_damage_per_min': participant.get('damageDealtToObjectives', 0) / game_duration_min,
            'vision_score_per_min': participant.get('visionScore', 0) / game_duration_min,
            'gold_diff_per_min': gold_diff_per_min,
            'exp_diff_per_min': exp_diff_per_min,
            'damage_taken_per_min': participant.get('totalDamageTaken', 0) / game_duration_min,
            'healing_shielding_allies_per_min': (participant.get('totalHealOnTeammates', 0) + participant.get('totalDamageShieldedOnTeammates', 0)) / game_duration_min,
            'win_loss': 1 if participant.get('win', False) else 0
        }
        return metrics

    def get_current_stock(self, player_tag, champion):
        from lib.database import get_connection
        conn = get_connection()
        
        try:
            with conn.cursor() as c:
                c.execute('''
                    SELECT stock_value FROM stock_values 
                    WHERE player_tag = %s AND champion = %s
                    ORDER BY timestamp DESC LIMIT 1
                ''', (player_tag, champion))
                
                result = c.fetchone()
                return result[0] if result else 10.0  # Default value
        finally:
            conn.close()

    def update_stock(self, player_tag, champion, new_value, model_score, game_id):
        from lib.database import get_connection
        conn = get_connection()
        
        # Convert NumPy types to Python native types
        if hasattr(new_value, 'item'):  # Check if it's a NumPy type
            new_value = new_value.item()
        
        if hasattr(model_score, 'item'):  # Check if it's a NumPy type
            model_score = model_score.item()
        
        try:
            with conn.cursor() as c:
                c.execute('''
                    INSERT INTO stock_values (player_tag, champion, stock_value, model_score, timestamp, game_id)
                    VALUES (%s, %s, %s, %s, %s, %s)
                ''', (player_tag, champion, float(new_value), float(model_score), datetime.now(), game_id))
                
                conn.commit()
        finally:
            conn.close()

    def calculate_new_stock(self, current_stock, model_score, alpha=0.4):
        # Existing method unchanged
        adjustment = (model_score - 5) * 2
        raw_new_stock = current_stock + adjustment
        new_stock = alpha * raw_new_stock + (1 - alpha) * current_stock
        return max(0, new_stock)

    # --- RUN METHOD FULLY RESTORED ---
    def run(self):
        """Main application loop, now using the specialist model architecture."""
        if not self.models:
            print("Models not loaded. Aborting run.")
            return

        # First, get PUUIDs for all players
        for player_tag in self.players:
            self.players[player_tag]['puuid'] = self.get_puuid(player_tag)
            time.sleep(1.5)

        # Process each player's latest match
        for player_tag, data in self.players.items():
            puuid = data['puuid']
            champion = data['champion']
            if not puuid:
                continue

            match_id = self.get_latest_match(puuid)
            time.sleep(1.5)
            if not match_id:
                continue
            
            match_data = self.get_match_details(match_id)
            time.sleep(1.5)
            timeline_data = self.get_match_timeline(match_id)
            time.sleep(1.5)
            if not match_data or not timeline_data:
                continue

            queue_to_game_type = {420: "RANKED_SOLO_5x5", 440: "RANKED_FLEX_SR", 700: "CLASH", 400: "NORMAL_DRAFT_5x5"}
            game_type = queue_to_game_type.get(match_data['info'].get('queueId', 0))
            if not game_type or game_type not in self.valid_game_types:
                print(f"\nSkipping game {match_id} - invalid game type.")
                continue

            participant_data = next((p for p in match_data['info']['participants'] if p['puuid'] == puuid), None)
            if not participant_data or participant_data['championName'] != champion:
                print(f"\n{player_tag} was not in game {match_id} on {champion}.")
                continue
                
            if self.is_game_processed(match_id, player_tag, champion):
                print(f"\nAlready processed {player_tag} on {champion} for game {match_id}.")
                continue

            print(f"\nProcessing {player_tag} on {champion} in game {match_id}")
            
            metrics = self.calculate_metrics(match_data, timeline_data, puuid)
            if not metrics:
                continue
            
            role = metrics.pop('role')
            if role not in self.models:
                print(f"Skipping prediction for unrecognized role: {role}")
                continue

            print(f"\nCollected values for {player_tag} on {champion} in role {role}:")
            # Create the DataFrame in the correct order BEFORE printing
            model_input_df = pd.DataFrame([metrics], columns=FEATURE_ORDER)
            for col in FEATURE_ORDER: 
                print(f"{col}: {model_input_df[col].iloc[0]:.2f}")

            model = self.models[role]
            raw_model_score = model.predict(model_input_df)[0]

            
            model_input_df = pd.DataFrame([metrics], columns=FEATURE_ORDER)
            
            model = self.models[role]
            
            raw_model_score = model.predict(model_input_df)[0]
            
            final_model_score = np.clip(raw_model_score, 0, 10)
            
            current_stock = self.get_current_stock(player_tag, champion)
            new_stock = self.calculate_new_stock(current_stock, final_model_score)
            self.update_stock(player_tag, champion, new_stock, final_model_score, match_id)
            
            self.mark_game_processed(match_id, player_tag, champion)
            
            print(f"\nRaw Model Score: {raw_model_score:.2f}")
            print(f"Final Clipped Score: {final_model_score:.2f}/10")
            print(f"Previous Stock: {current_stock:.2f}")
            print(f"New Stock: {new_stock:.2f}")
            print(f"Game ID: {match_id}")
            
            time.sleep(1.5)

if __name__ == "__main__":
    API_KEY = "RGAPI-96e31f4f-559c-4027-9a3e-77ae58e84a3f"
    tracker = PlayerStockTracker(API_KEY)
    tracker.run()



