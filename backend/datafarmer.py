import os
import requests
from dotenv import load_dotenv
import json
import csv
import time
from datetime import datetime

# Load environment variables
load_dotenv()
API_KEY = os.getenv("RIOT_API_KEY")

class AIDataCollector:
    def __init__(self):
        self.headers = {
            "X-Riot-Token": API_KEY
        }
        
        # Role mapping
        self.role_mapping = {
            "TOP": 1,
            "JUNGLE": 2,
            "MIDDLE": 3,
            "BOTTOM": 4,
            "UTILITY": 5
        }
        
        # Valid ranked queue types
        self.valid_queues = [420]  # Ranked Solo/Duo
        
    def get_account_by_riot_id(self, game_name, tag_line):
        """Get account info using Riot ID (game name + tag)"""
        url = f"https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/{game_name}/{tag_line}"
        response = requests.get(url, headers=self.headers)
        response.raise_for_status()
        return response.json()

    def get_match_history(self, puuid, count=100):
        """Get match history for a player"""
        url = f"https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids"
        params = {
            'queue': 420,  # Ranked Solo/Duo
            'type': 'ranked',
            'start': 0,
            'count': count
        }
        response = requests.get(url, headers=self.headers, params=params)
        response.raise_for_status()
        return response.json()

    def get_match_data(self, match_id):
        """Get basic match data"""
        url = f"https://americas.api.riotgames.com/lol/match/v5/matches/{match_id}"
        response = requests.get(url, headers=self.headers)
        response.raise_for_status()
        return response.json()

    def get_match_timeline(self, match_id):
        """Get detailed timeline data for a match"""
        url = f"https://americas.api.riotgames.com/lol/match/v5/matches/{match_id}/timeline"
        response = requests.get(url, headers=self.headers)
        response.raise_for_status()
        return response.json()

    def get_15min_differences(self, timeline_data, match_data, participant_id):
        """Calculate gold and exp differences at 15 minutes"""
        try:
            # Find player's position and opponent
            player_position = None
            opponent_participant_id = None
            
            for participant in match_data['info']['participants']:
                if participant['participantId'] == participant_id:
                    player_position = participant['teamPosition']
                    break
            
            # Find lane opponent
            for participant in match_data['info']['participants']:
                if (participant['teamPosition'] == player_position and 
                    participant['participantId'] != participant_id):
                    opponent_participant_id = participant['participantId']
                    break
            
            if not opponent_participant_id:
                return 0, 0  # No opponent found
            
            # Find 15-minute frame
            frame_15min = None
            for frame in timeline_data['info']['frames']:
                if frame['timestamp'] >= 900000:  # 15 minutes
                    frame_15min = frame
                    break
            
            if not frame_15min:
                return 0, 0  # Game too short
            
            # Get stats at 15 minutes
            player_frame = frame_15min['participantFrames'][str(participant_id)]
            opponent_frame = frame_15min['participantFrames'][str(opponent_participant_id)]
            
            gold_diff = player_frame['totalGold'] - opponent_frame['totalGold']
            exp_diff = player_frame['xp'] - opponent_frame['xp']
            
            return gold_diff, exp_diff
            
        except Exception as e:
            print(f"Error calculating 15min differences: {e}")
            return 0, 0

    def get_end_differences(self, match_data, participant_id):
        """Calculate gold and exp differences at game end"""
        try:
            # Find player's position and opponent
            player_position = None
            player_gold = 0
            player_exp = 0
            opponent_gold = 0
            opponent_exp = 0
            
            for participant in match_data['info']['participants']:
                if participant['participantId'] == participant_id:
                    player_position = participant['teamPosition']
                    player_gold = participant['goldEarned']
                    player_exp = participant['champExperience']
                    break
            
            # Find lane opponent
            for participant in match_data['info']['participants']:
                if (participant['teamPosition'] == player_position and 
                    participant['participantId'] != participant_id):
                    opponent_gold = participant['goldEarned']
                    opponent_exp = participant['champExperience']
                    break
            
            gold_diff = player_gold - opponent_gold
            exp_diff = player_exp - opponent_exp
            
            return gold_diff, exp_diff
            
        except Exception as e:
            print(f"Error calculating end differences: {e}")
            return 0, 0

    def calculate_kill_participation(self, participant_data, team_data):
        """Calculate kill participation percentage"""
        try:
            team_kills = team_data['objectives']['champion']['kills']
            player_kp = participant_data['kills'] + participant_data['assists']
            
            if team_kills == 0:
                return 0
            
            return (player_kp / team_kills) * 100
            
        except Exception as e:
            print(f"Error calculating kill participation: {e}")
            return 0

    def calculate_team_shares(self, match_data, participant_id):
        """Calculate various team share percentages"""
        try:
            # Find team participants
            team_id = None
            for participant in match_data['info']['participants']:
                if participant['participantId'] == participant_id:
                    team_id = participant['teamId']
                    break
            
            # Get team totals
            team_damage = 0
            team_gold = 0
            team_objective_damage = 0
            team_vision_score = 0
            team_damage_taken = 0
            
            player_damage = 0
            player_gold = 0
            player_objective_damage = 0
            player_vision_score = 0
            player_damage_taken = 0
            
            for participant in match_data['info']['participants']:
                if participant['teamId'] == team_id:
                    team_damage += participant['totalDamageDealtToChampions']
                    team_gold += participant['goldEarned']
                    team_objective_damage += participant['damageDealtToObjectives']
                    team_vision_score += participant['visionScore']
                    team_damage_taken += participant['totalDamageTaken']
                    
                    if participant['participantId'] == participant_id:
                        player_damage = participant['totalDamageDealtToChampions']
                        player_gold = participant['goldEarned']
                        player_objective_damage = participant['damageDealtToObjectives']
                        player_vision_score = participant['visionScore']
                        player_damage_taken = participant['totalDamageTaken']
            
            # Calculate shares as percentages
            damage_share = round((player_damage / team_damage) * 100, 1) if team_damage > 0 else 0
            gold_share = round((player_gold / team_gold) * 100, 1) if team_gold > 0 else 0
            objective_damage_share = round((player_objective_damage / team_objective_damage) * 100, 1) if team_objective_damage > 0 else 0
            vision_score_share = round((player_vision_score / team_vision_score) * 100, 1) if team_vision_score > 0 else 0
            damage_taken_share = round((player_damage_taken / team_damage_taken) * 100, 1) if team_damage_taken > 0 else 0
            
            return {
                'team_damage_share': damage_share,
                'team_gold_share': gold_share,
                'team_objective_damage_share': objective_damage_share,
                'team_vision_score_share': vision_score_share,
                'damage_taken_share': damage_taken_share
            }
            
        except Exception as e:
            print(f"Error calculating team shares: {e}")
            return {
                'team_damage_share': 0,
                'team_gold_share': 0,
                'team_objective_damage_share': 0,
                'team_vision_score_share': 0,
                'damage_taken_share': 0
            }

    def process_match(self, match_id):
        """Process a single match and return data for all participants"""
        try:
            print(f"Processing match: {match_id}")
            
            # Get match data
            match_data = self.get_match_data(match_id)
            time.sleep(1)  # Rate limiting
            
            # Skip if not ranked solo/duo
            if match_data['info']['queueId'] not in self.valid_queues:
                print(f"Skipping match {match_id} - not ranked solo/duo")
                return []
            
            # Skip if game is shorter than 10 minutes
            game_duration_seconds = match_data['info']['gameDuration']
            if game_duration_seconds < 600:  # 10 minutes
                print(f"Skipping match {match_id} - game too short ({game_duration_seconds}s)")
                return []
            
            game_duration_minutes = game_duration_seconds / 60
            
            # Get timeline data
            timeline_data = self.get_match_timeline(match_id)
            time.sleep(1)  # Rate limiting
            
            match_rows = []
            
            # Process each participant
            for participant in match_data['info']['participants']:
                participant_id = participant['participantId']
                
                # Skip if no valid position
                if not participant['teamPosition'] or participant['teamPosition'] == "":
                    continue
                
                # Calculate KDA
                kills = participant['kills']
                deaths = max(1, participant['deaths'])  # Avoid division by zero
                assists = participant['assists']
                kda = (kills + assists) / deaths
                
                # Get 15-minute differences
                gold_diff_15, exp_diff_15 = self.get_15min_differences(
                    timeline_data, match_data, participant_id
                )
                
                # Get end differences and calculate per-minute rates
                gold_diff_end, exp_diff_end = self.get_end_differences(
                    match_data, participant_id
                )
                gold_diff_per_min = gold_diff_end / game_duration_minutes if game_duration_minutes > 0 else 0
                exp_diff_per_min = exp_diff_end / game_duration_minutes if game_duration_minutes > 0 else 0
                
                # Calculate kill participation
                team_data = None
                for team in match_data['info']['teams']:
                    if team['teamId'] == participant['teamId']:
                        team_data = team
                        break
                
                kill_participation = self.calculate_kill_participation(participant, team_data)
                
                # Calculate team shares
                team_shares = self.calculate_team_shares(match_data, participant_id)
                
                # Get per-minute stats
                dmg_to_champions_per_min = participant['totalDamageDealtToChampions'] / game_duration_minutes
                objective_damage_per_min = participant['damageDealtToObjectives'] / game_duration_minutes
                vision_score_per_min = participant['visionScore'] / game_duration_minutes
                damage_taken_per_min = participant['totalDamageTaken'] / game_duration_minutes
                
                # Calculate healing + shielding to allies per minute
                healing_allies = participant.get('totalHealsOnTeammates', 0)
                shielding_allies = participant.get('totalDamageShieldedOnTeammates', 0)
                healing_shielding_allies_per_min = (healing_allies + shielding_allies) / game_duration_minutes
                
                # Get other stats
                role = self.role_mapping.get(participant['teamPosition'], 0)
                win_loss = 1 if participant['win'] else 0
                
                # Create row
                row = {
                    'match_id': match_id,
                    'summoner_name': participant['summonerName'],
                    'role': role,
                    'champion': participant['championName'],
                    'game_length_mins': round(game_duration_minutes, 1),
                    'kda': round(kda, 2),
                    'dmg_to_champions_per_min': round(dmg_to_champions_per_min, 1),
                    'team_damage_share': team_shares['team_damage_share'],
                    'team_gold_share': team_shares['team_gold_share'],
                    'gold_diff_15': gold_diff_15,
                    'exp_diff_15': exp_diff_15,
                    'kill_participation': kill_participation,
                    'objective_damage_per_min': round(objective_damage_per_min, 1),
                    'team_objective_damage_share': team_shares['team_objective_damage_share'],
                    'vision_score_per_min': round(vision_score_per_min, 2),
                    'team_vision_score_share': team_shares['team_vision_score_share'],
                    'gold_diff_per_min': round(gold_diff_per_min, 1),
                    'exp_diff_per_min': round(exp_diff_per_min, 1),
                    'damage_taken_per_min': round(damage_taken_per_min, 1),
                    'damage_taken_share': team_shares['damage_taken_share'],
                    'healing_shielding_allies_per_min': round(healing_shielding_allies_per_min, 1),
                    'win_loss': win_loss
                }
                
                match_rows.append(row)
            
            return match_rows
            
        except Exception as e:
            print(f"Error processing match {match_id}: {e}")
            return []

    def collect_data_for_summoner(self, summoner_name, games_per_summoner=100):
        """Collect data for a specific summoner"""
        try:
            print(f"\nProcessing summoner: {summoner_name}")
            
            # Get account info
            game_name, tag_line = summoner_name.split('#')
            account_data = self.get_account_by_riot_id(game_name, tag_line)
            puuid = account_data['puuid']
            
            # Get match history
            match_ids = self.get_match_history(puuid, games_per_summoner)
            print(f"Found {len(match_ids)} matches for {summoner_name}")
            
            all_data = []
            
            for i, match_id in enumerate(match_ids):
                print(f"Processing match {i+1}/{len(match_ids)}")
                
                match_data = self.process_match(match_id)
                all_data.extend(match_data)
                
                # Rate limiting
                if i % 10 == 0:
                    time.sleep(2)
            
            return all_data
            
        except Exception as e:
            print(f"Error processing summoner {summoner_name}: {e}")
            return []

    def collect_all_data(self, summoner_names, games_per_summoner=100):
        """Collect data for all summoners and save to CSV in batches"""
        all_data = []
        batch_size = 10
        
        for batch_num in range(0, len(summoner_names), batch_size):
            batch_summoners = summoner_names[batch_num:batch_num + batch_size]
            batch_data = []
            
            print(f"\n{'='*50}")
            print(f"Processing batch {batch_num//batch_size + 1} - Summoners {batch_num+1} to {min(batch_num+batch_size, len(summoner_names))}")
            print(f"{'='*50}")
            
            # Process each summoner in the batch
            for i, summoner_name in enumerate(batch_summoners):
                summoner_data = self.collect_data_for_summoner(summoner_name, games_per_summoner)
                batch_data.extend(summoner_data)
                all_data.extend(summoner_data)
                
                print(f"Collected {len(summoner_data)} data points for {summoner_name}")
                print(f"Batch total: {len(batch_data)} | Overall total: {len(all_data)}")
            
            # Save batch to CSV
            if batch_data:
                batch_filename = f"lol_ai_batch_{batch_num//batch_size + 1}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
                
                fieldnames = [
                    'match_id', 'summoner_name', 'role', 'champion', 'game_length_mins',
                    'kda', 'dmg_to_champions_per_min', 'team_damage_share', 'team_gold_share',
                    'gold_diff_15', 'exp_diff_15', 'kill_participation',
                    'objective_damage_per_min', 'team_objective_damage_share',
                    'vision_score_per_min', 'team_vision_score_share',
                    'gold_diff_per_min', 'exp_diff_per_min',
                    'damage_taken_per_min', 'damage_taken_share',
                    'healing_shielding_allies_per_min', 'win_loss'
                ]
                
                with open(batch_filename, 'w', newline='', encoding='utf-8') as csvfile:
                    writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                    writer.writeheader()
                    writer.writerows(batch_data)
                
                print(f"\n✅ Batch {batch_num//batch_size + 1} saved to {batch_filename}")
                print(f"   Batch rows: {len(batch_data)}")
                print(f"   Total progress: {len(all_data)} rows")
        
        # Save final combined CSV
        if all_data:
            final_filename = f"lol_ai_data_FINAL_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            
            fieldnames = [
                'match_id', 'summoner_name', 'role', 'champion', 'game_length_mins',
                'kda', 'dmg_to_champions_per_min', 'team_damage_share', 'team_gold_share',
                'gold_diff_15', 'exp_diff_15', 'kill_participation',
                'objective_damage_per_min', 'team_objective_damage_share',
                'vision_score_per_min', 'team_vision_score_share',
                'gold_diff_per_min', 'exp_diff_per_min',
                'damage_taken_per_min', 'damage_taken_share',
                'healing_shielding_allies_per_min', 'win_loss'
            ]
            
            with open(final_filename, 'w', newline='', encoding='utf-8') as csvfile:
                writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(all_data)
            
            print(f"\n🎉 FINAL DATA saved to {final_filename}")
            print(f"   Total rows: {len(all_data)}")
        
        return all_data

if __name__ == "__main__":
    collector = AIDataCollector()
    
    # List of 10 summoner names - replace with your actual summoner names
    summoner_names = [
        "ShempMaster#NA1",
        "arasoh#NA1", 
        "Kyizzle#NA1",
        "Birde#Na2",
        "Lembo#NA1",
        "yooner#NA1",
        "Piplup#1510",
        "Gig not lio#NA1",
        "TWGSpooky#7512",
        "T1 Keria#Tori",

        "Phus#NA1",
        "PixelatedChicken#NA1",
        "Umsorrypce#NA1",
        "why my pp green#NA1",
        "mangosmoothie#3697",
        "Sl0ppy Top#NA1",
        "monkey wit flame#black",
        "kENzY#3608",
        "Weapon of Lunari#NA1",
        "J4NautThreshVi#9323",

        "SpiritCutter#6969",   
        "xospence#4171",
        "vcastjazzwell#NA1",
        "TheWeeknd#XO99",
        "KissTwice#NA1",
        "AeDoggys#8745",
        "COMdodo974#UWUho",
        "vedd#6969",
        "Cainun#NA1",
        "Lukeham#NA1",

        "trillmik#1091",
        "Hirohito#7493",
        "Unowins#NA1",
        "Soulvaki#9320",
        "denel#twink",
        "H2Pr0#BTC",
        "iG Fenrir#GOiG",
        "DogSaysEdward#NA1",
        "Scripting#IWNL",
        "Boosted BENNY#1099",
        
        "Wttty#NA1",
        "Luckyhhh#NA1",
        "Lunala#001",
        "Tizin#NA1",
        "Mady#HER",
        "AreyBoy#Shira",
        "FatButters#NA1",
        "Rem#SSJ",
        "YN Up NEXT#001",
        "Linuz#Hello"
    ]
    
    # Collect data (100 games per summoner = 1000 games total)
    data = collector.collect_all_data(summoner_names, games_per_summoner=100)
    
    print(f"\nData collection complete! Total data points: {len(data)}")