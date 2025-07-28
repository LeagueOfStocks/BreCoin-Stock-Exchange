import requests
import pandas as pd
from datetime import datetime
import pickle  # Switched to pickle to match our model saving format
import time
import sys
import os
import numpy as np
import asyncio
import aiohttp
import aiofiles


# Add current directory to Python path if necessary
sys.path.append('.')

# --- NEW: Define the exact feature order your new models were trained on. ---
# This is CRITICAL for ensuring the data is fed to the model correctly.
# This list must be identical to the one used in your final training script.

FEATURE_ORDER = [
    'kda', 'dmg_to_champions_per_min', 'team_damage_share', 'team_gold_share',
    'gold_diff_15', 'exp_diff_15', 'kill_participation',
    'objective_damage_per_min', 'team_objective_damage_share',
    'vision_score_per_min', 'team_vision_score_share', 'gold_diff_per_min',  
    'exp_diff_per_min',
    'damage_taken_per_min', 'damage_taken_share',
    'healing_shielding_allies_per_min',  'win_loss'
]


class PlayerStockTracker:
    def __init__(self, api_key):
        self.api_key = api_key
        self.headers = {"X-Riot-Token": self.api_key}
        self.base_url = "https://na1.api.riotgames.com"

 
        # --- MODIFIED: Load 5 specialist models instead of one. ---
        self.models = {}

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
    async def load_models_async(self):
        """Asynchronously loads the 5 specialist model .pkl files into memory."""
        if self.models: # Don't load if already loaded
            return
        print("--- Asynchronously loading all specialist models ---")
        try:
            for role in ['Top', 'Jungle', 'Mid', 'ADC', 'Support']:
                model_filename = f'{role.lower()}_model.pkl'
                async with aiofiles.open(model_filename, 'rb') as f:
                    content = await f.read()
                    self.models[role] = pickle.loads(content)
            print("All 5 models have been loaded successfully.")
        except FileNotFoundError as e:
            print(f"!!! CRITICAL ERROR: Could not load models. Missing file: {e.filename} !!!")
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

    def is_game_processed(self, market_id, game_id, player_tag, champion): # Add market_id
            from lib.database import get_connection
            conn = get_connection()
            try:
                with conn.cursor() as c:
                    c.execute('''
                        SELECT 1 FROM processed_games 
                        WHERE market_id = %s AND game_id = %s AND player_tag = %s AND champion = %s
                    ''', (market_id, game_id, player_tag, champion)) # Add market_id
                    result = c.fetchone()
                    return result is not None
            finally:
                conn.close()


    def mark_game_processed(self, market_player_id, game_id, player_tag, champion):
        from lib.database import get_connection
        conn = get_connection()
        try:
            with conn.cursor() as c:
                c.execute("""
                    INSERT INTO processed_games (market_player_id, game_id, player_tag, champion)
                    VALUES (%s, %s, %s, %s)
                """, (market_player_id, game_id, player_tag, champion))
                conn.commit()
        finally:
            conn.close()


    async def _api_request(self, session, url):
        """A helper to handle requests and potential rate limiting."""
        async with session.get(url, headers=self.headers) as response:
            if response.status == 429:
                print("Rate limit hit, waiting...")
                retry_after = int(response.headers.get("Retry-After", 10))
                await asyncio.sleep(retry_after)
                return await self._api_request(session, url) # Retry the request
            response.raise_for_status()
            return await response.json()

    async def get_puuid(self, session, player_tag):
        gameName, tagLine = player_tag.split('#')
        url = f"https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}"
        data = await self._api_request(session, url)
        return data['puuid']

    async def get_match_ids(self, session, puuid, count=20):
        """Gets a list of recent matches, not just the latest one."""
        url = f"https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids?count={count}"
        return await self._api_request(session, url)

    async def get_match_data(self, session, match_id):
        """Fetches match details and timeline concurrently."""
        details_url = f"https://americas.api.riotgames.com/lol/match/v5/matches/{match_id}"
        timeline_url = f"https://americas.api.riotgames.com/lol/match/v5/matches/{match_id}/timeline"
        
        details_task = asyncio.create_task(self._api_request(session, details_url))
        timeline_task = asyncio.create_task(self._api_request(session, timeline_url))
        
        match_data, timeline_data = await asyncio.gather(details_task, timeline_task)
        return match_data, timeline_data

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

    def get_current_stock(self, market_id, player_tag, champion): # Add market_id
        from lib.database import get_connection
        conn = get_connection()
        try:
            with conn.cursor() as c:
                c.execute('''
                    SELECT stock_value FROM stock_values 
                    WHERE market_id = %s AND player_tag = %s AND champion = %s
                    ORDER BY timestamp DESC LIMIT 1
                ''', (market_id, player_tag, champion)) # Add market_id
                result = c.fetchone()
                return result[0] if result else 10.0
        finally:
            conn.close()


    def update_stock(self, market_player_id, player_tag, champion, new_value, model_score, game_id):
            from lib.database import get_connection
            conn = get_connection()
            try:
                # ... (your numpy conversion logic) ...
                with conn.cursor() as c:
                    c.execute("""
                        INSERT INTO stock_values (market_player_id, player_tag, champion, stock_value, model_score, game_id)
                        VALUES (%s, %s, %s, %s, %s, %s)
                    """, (market_player_id, player_tag, champion, new_value, model_score, game_id))
                    conn.commit()
            finally:
                conn.close()




    def calculate_new_stock(self, current_stock, model_score, market_config, alpha=0.4): # Add market_config
        # Incorporate multipliers from market config
        # This is a simple example; you can make the logic more complex
        multiplier = market_config.get('config_multipliers', {}).get('default', 1.0)
        adjusted_score = model_score * multiplier
        
        adjustment = (adjusted_score - 5) * 2
        raw_new_stock = current_stock + adjustment
        new_stock = alpha * raw_new_stock + (1 - alpha) * current_stock
        return max(0.1, new_stock) # Set a floor price


    # --- RUN METHOD FULLY RESTORED ---
    def get_market_config_and_players(self, market_id: int):
        conn = get_dict_connection()
        try:
            with conn.cursor() as c:
                c.execute("SELECT tier, config_multipliers FROM markets WHERE id = %s", (market_id,))
                market_config = c.fetchone()
                if not market_config: return None, None

                # NEW: Also select the market_player ID (mp.id)
                c.execute("""
                    SELECT mp.id, mp.player_tag, array_agg(pc.champion_name) as champions
                    FROM market_players mp
                    JOIN player_champions pc ON mp.id = pc.market_player_id
                    WHERE mp.market_id = %s
                    GROUP BY mp.id, mp.player_tag
                """, (market_id,))
                players = c.fetchall()
                # NEW: The map now stores the ID as well as the champions
                player_map = {p['player_tag']: {'id': p['id'], 'champions': p['champions']} for p in players}
                return market_config, player_map
        finally:
            conn.close()

    async def process_player(self, session, market_id, market_config, player_tag, allowed_champions):
        """The core async logic for updating a single player within a market."""
        try:
            print(f"Processing {player_tag} for market {market_id}...")
            puuid = await self.get_puuid(session, player_tag)
            if not puuid: return

            match_ids = await self.get_match_ids(session, puuid)
            
            for match_id in match_ids:
                match_data, timeline_data = await self.get_match_data(session, match_id)
                participant_data = next((p for p in match_data['info']['participants'] if p['puuid'] == puuid), None)
                
                if not participant_data: continue
                champion_played = participant_data['championName']
                
                if champion_played not in allowed_champions:
                    continue
                
                if self.is_game_processed(market_id, match_id, player_tag, champion_played):
                    # We have found the most recent game that's already been processed.
                    # This means we don't need to look any further back in their history.
                    return

                # If we are here, this is the newest, unprocessed game on an allowed champion.
                print(f"Found new game {match_id} for {player_tag} on {champion_played}.")
                
                metrics = self.calculate_metrics(match_data, timeline_data, puuid)
                if not metrics: continue
                
                role = metrics.pop('role')
                if role not in self.models: continue

                model_input_df = pd.DataFrame([metrics], columns=FEATURE_ORDER)
                raw_model_score = self.models[role].predict(model_input_df)[0]
                final_model_score = np.clip(raw_model_score, 0, 10)
                
                current_stock = self.get_current_stock(market_id, player_tag, champion_played)
                new_stock = self.calculate_new_stock(current_stock, final_model_score, market_config)
                
                self.update_stock(market_id, player_tag, champion_played, new_stock, final_model_score, match_id)
                self.mark_game_processed(market_id, match_id, player_tag, champion_played)
                
                print(f"Successfully processed and updated stock for {player_tag} from game {match_id}.")
                return # We only process ONE game per player per refresh cycle.

        except Exception as e:
            print(f"!!! FAILED to process {player_tag} for market {market_id}: {e}")

    async def update_market_stocks(self, market_id: int):
        """The main entry point for a background worker to call."""
        print(f"--- Starting background stock update for market {market_id} ---")
        await self.load_models_async()
        
        market_config, players_to_update = self.get_market_config_and_players(market_id)
        if not players_to_update:
            print(f"No players found for market {market_id}. Aborting update.")
            return

        async with aiohttp.ClientSession() as session:
            tasks = [
                self.process_player(session, market_id, market_config, player_tag, data['champions'])
                for player_tag, data in players_to_update.items()
            ]
            await asyncio.gather(*tasks)
        
        print(f"--- Finished background update for market {market_id} ---")

if __name__ == "__main__":
    API_KEY = "RGAPI-96e31f4f-559c-4027-9a3e-77ae58e84a3f"
    tracker = PlayerStockTracker(API_KEY)
    tracker.run()



