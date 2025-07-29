import os
import string
import random
import hmac
import hashlib
import base64
from datetime import datetime, timedelta, timezone

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, status, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from lib.database import get_dict_connection
from services.stock_tracker import PlayerStockTracker

# --- Initial Setup ---
load_dotenv()
app = FastAPI()

# --- Environment Variables ---
RIOT_API_KEY = os.getenv("RIOT_API_KEY")
QSTASH_URL = os.getenv("QSTASH_URL", "https://qstash.upstash.io/v2/publish/")
QSTASH_TOKEN = os.getenv("QSTASH_TOKEN")
QSTASH_CURRENT_SIGNING_KEY = os.getenv("QSTASH_CURRENT_SIGNING_KEY")
QSTASH_NEXT_SIGNING_KEY = os.getenv("QSTASH_NEXT_SIGNING_KEY")
APP_BASE_URL = os.getenv("APP_BASE_URL")

# --- CORS Middleware (Corrected and Explicit) ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://brecoin-stock-exchange.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS", "DELETE", "PUT", "PATCH"],
    allow_headers=["*"],
)

# --- Pydantic Models ---
class MarketCreate(BaseModel): name: str; creator_id: str
class MarketJoin(BaseModel): invite_code: str; user_id: str
class PlayerAdd(BaseModel): player_tag: str; user_id: str; initial_champion: str
class ChampionAdd(BaseModel): champion_name: str
class PlayerInMarket(BaseModel): id: int; player_tag: str; champions: list[str]
class MarketDetails(BaseModel): id: int; name: str; invite_code: str; creator_id: str; tier: str; player_limit: int; champions_per_player_limit: int; players: list[PlayerInMarket]

# --- Global Tracker Instance & Startup Event ---
tracker = PlayerStockTracker(RIOT_API_KEY)
@app.on_event("startup")
async def startup_event():
    await tracker.load_models_async()

# --- Helper Functions & Security ---
def _generate_invite_code(length=8):
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))

async def verify_qstash_signature(request: Request):
    signature = request.headers.get("Upstash-Signature")
    if not signature: raise HTTPException(status_code=401, detail="Signature header is missing")
    body = await request.body()
    h_current = hmac.new(QSTASH_CURRENT_SIGNING_KEY.encode(), body, hashlib.sha256)
    if hmac.compare_digest(base64.b64encode(h_current.digest()).decode(), signature): return True
    h_next = hmac.new(QSTASH_NEXT_SIGNING_KEY.encode(), body, hashlib.sha256)
    if hmac.compare_digest(base64.b64encode(h_next.digest()).decode(), signature): return True
    raise HTTPException(status_code=401, detail="Invalid signature")

# --- NEW: Health Check Endpoint for Render ---
@app.get("/")
async def health_check():
    return {"status": "ok"}

# --- QStash Task Endpoint (Internal) ---
@app.post("/api/tasks/update-market", status_code=status.HTTP_202_ACCEPTED, include_in_schema=False)
async def task_update_market(payload: dict, _=Depends(verify_qstash_signature)):
    market_id = payload.get("market_id")
    if not market_id: raise HTTPException(status_code=400, detail="market_id missing")
    await tracker.update_market_stocks(market_id)
    return {"status": "success"}

# --- User-Facing API Endpoints ---
@app.post("/api/markets/{market_id}/refresh")
async def refresh_market(market_id: int):
    conn = get_dict_connection()
    try:
        with conn.cursor() as c:
            c.execute("SELECT last_refreshed_at, tier FROM markets WHERE id = %s", (market_id,))
            market = c.fetchone()
            if not market: raise HTTPException(status_code=404, detail="Market not found")
            cooldown_minutes = 5 if market['tier'] in ['premium', 'pro'] else 10
            if market['last_refreshed_at'] and (datetime.now(timezone.utc) - market['last_refreshed_at'] < timedelta(minutes=cooldown_minutes)):
                raise HTTPException(status_code=429, detail="This market was refreshed recently.")
            c.execute("UPDATE markets SET last_refreshed_at = %s WHERE id = %s", (datetime.now(timezone.utc), market_id))
            conn.commit()
    finally:
        if conn: conn.close()
    
    destination_url = f"{APP_BASE_URL}/api/tasks/update-market"
    headers = {"Authorization": f"Bearer {QSTASH_TOKEN}", "Upstash-Callback": destination_url}
    payload = {"market_id": market_id}
    try:
        response = requests.post(QSTASH_URL, headers=headers, json=payload)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(f"!!! ERROR dispatching to QStash: {e}")
        if e.response is not None: print(f"!!! QStash Response: {e.response.text}")
        raise HTTPException(status_code=500, detail="Failed to schedule background task.")
    
    return {"status": "success", "message": "Refresh initiated."}

# --- Helper Functions ---
def _generate_invite_code(length=8):
    """Generates a simple random alphanumeric code."""
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))

# --- Models for request bodies (Pydantic) ---
class MarketCreate(BaseModel):
    name: str
    creator_id: str

class MarketJoin(BaseModel):
    invite_code: str
    user_id: str

class PlayerAdd(BaseModel):
    player_tag: str
    user_id: str
    initial_champion: str # <-- ADD THIS LINE

class ChampionAdd(BaseModel):
    champion_name: str


@app.post("/api/markets/create", status_code=status.HTTP_201_CREATED)
async def create_market(market_data: MarketCreate):
    conn = get_dict_connection()
    try:
        with conn.cursor() as c:
            # TODO: Add logic to check user's tier and market count limit from `profiles` table
            
            invite_code = _generate_invite_code()
            # Ensure code is unique
            c.execute("SELECT 1 FROM markets WHERE invite_code = %s", (invite_code,))
            while c.fetchone():
                invite_code = _generate_invite_code()
                c.execute("SELECT 1 FROM markets WHERE invite_code = %s", (invite_code,))

            # Create the market
            c.execute("INSERT INTO markets (name, creator_id, invite_code) VALUES (%s, %s, %s) RETURNING id",
                      (market_data.name, market_data.creator_id, invite_code))
            market_id = c.fetchone()['id']
            
            # Add the creator as a member
            c.execute("INSERT INTO market_members (market_id, user_id) VALUES (%s, %s)",
                      (market_id, market_data.creator_id))
            
            conn.commit()
            return {"status": "success", "market_id": market_id, "invite_code": invite_code}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.post("/api/markets/join", status_code=status.HTTP_200_OK)
async def join_market(join_data: MarketJoin):
    conn = get_dict_connection()
    try:
        with conn.cursor() as c:
            # Find the market by invite code
            c.execute("SELECT id, player_limit FROM markets WHERE invite_code = %s", (join_data.invite_code,))
            market = c.fetchone()
            if not market:
                raise HTTPException(status_code=404, detail="Invalid invite code.")
            market_id = market['id']
            
            # Check if user is already a member
            c.execute("SELECT 1 FROM market_members WHERE market_id = %s AND user_id = %s", (market_id, join_data.user_id))
            if c.fetchone():
                return {"status": "success", "message": "Already a member.", "market_id": market_id}

            # Check if market is full
            c.execute("SELECT COUNT(*) as member_count FROM market_members WHERE market_id = %s", (market_id,))
            member_count = c.fetchone()['member_count']
            if member_count >= market['player_limit']:
                raise HTTPException(status_code=403, detail="This market is full.")

            # TODO: Add logic to check user's tier and market join limit

            # Add user to the market
            c.execute("INSERT INTO market_members (market_id, user_id) VALUES (%s, %s)", (market_id, join_data.user_id))
            conn.commit()
            return {"status": "success", "message": "Successfully joined market.", "market_id": market_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.post("/api/markets/{market_id}/players", status_code=status.HTTP_201_CREATED)
async def add_player_to_market(market_id: int, player_data: PlayerAdd):
    conn = get_dict_connection()
    try:
        with conn.cursor() as c:
            # 1. Get the tier of the USER making the request.
            c.execute("SELECT subscription_tier FROM profiles WHERE id = %s", (player_data.user_id,))
            user_profile = c.fetchone()
            user_tier = user_profile['subscription_tier'] if user_profile else 'free'
            
            # 2. Define tier limits
            tier_limits = {'free': 1, 'premium': 1, 'pro': 3} # Pro tier can add a player to 3 markets
            limit = tier_limits.get(user_tier, 1)

            # 3. Check how many times this player has been listed across ALL markets
            c.execute("SELECT COUNT(*) FROM market_players WHERE player_tag = %s", (player_data.player_tag,))
            current_count = c.fetchone()['count']
            
            if current_count >= limit:
                raise HTTPException(
                    status_code=403, 
                    detail=f"This player is in the max number of markets ({limit}) allowed by your subscription tier."
                )

            # 4. Add the player and record WHO added them
            c.execute(
                "INSERT INTO market_players (market_id, player_tag, listed_by_user_id) VALUES (%s, %s, %s) RETURNING id",
                (market_id, player_data.player_tag, player_data.user_id)
            )
            player_id = c.fetchone()['id']

            # Step 3: Create the initial "IPO" price entry in the stock_values table
            # --- THIS IS THE CORRECTED SQL INSERT ---
            c.execute("""
                INSERT INTO stock_values 
                    (market_id, market_player_id, player_tag, champion, stock_value, model_score) 
                VALUES 
                    (%s, %s, %s, %s, %s, %s)
            """, 
            (
                market_id, 
                market_player_id, # <-- THE FIX: Pass the ID we just created
                player_data.player_tag, 
                player_data.initial_champion, 
                10.0, # Default price
                5.0   # Default score
            ))
            
            conn.commit()
            return {"status": "success", "player_id": market_player_id}
            
    except Exception as e:
        if conn: conn.rollback()
        if 'duplicate key value violates unique constraint' in str(e).lower():
             raise HTTPException(status_code=409, detail="This player is already in the market.")
        print(f"!!! ERROR in add_player_to_market: {e}") # Added logging
        raise HTTPException(status_code=500, detail="An internal server error occurred.")
    finally:
        if conn:
            conn.close()


@app.post("/api/markets/players/{player_id}/champions", status_code=status.HTTP_201_CREATED)
async def add_champion_to_player(player_id: int, champion_data: ChampionAdd):
    # TODO: Implement validation against market's champions_per_player_limit
    conn = get_dict_connection()
    try:
        with conn.cursor() as c:
            c.execute("INSERT INTO player_champions (market_player_id, champion_name) VALUES (%s, %s)",
                      (player_id, champion_data.champion_name))
            conn.commit()
            return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# --- NEW: Market-aware read-only endpoints ---
@app.get("/api/markets/{market_id}/stocks")
async def get_market_stocks(market_id: int):
    """
    Gets all stocks for a market, including current price and 24h/7d changes.
    This is now a powerful query to feed the main market overview table.
    """
    conn = get_dict_connection()
    try:
        with conn.cursor() as c:
            now = datetime.now(timezone.utc)
            day_ago = now - timedelta(days=1)
            week_ago = now - timedelta(days=7)

            # This complex query uses Common Table Expressions (CTEs) to get everything in one go.
            c.execute("""
                WITH latest_prices AS (
                    SELECT 
                        player_tag, 
                        champion, 
                        stock_value,
                        timestamp,
                        ROW_NUMBER() OVER(PARTITION BY player_tag, champion ORDER BY timestamp DESC) as rn
                    FROM stock_values
                    WHERE market_id = %(market_id)s
                ),
                prices_24h_ago AS (
                    SELECT DISTINCT ON (player_tag, champion)
                        player_tag, champion, stock_value
                    FROM stock_values
                    WHERE market_id = %(market_id)s AND timestamp <= %(day_ago)s
                    ORDER BY player_tag, champion, timestamp DESC
                ),
                prices_7d_ago AS (
                    SELECT DISTINCT ON (player_tag, champion)
                        player_tag, champion, stock_value
                    FROM stock_values
                    WHERE market_id = %(market_id)s AND timestamp <= %(week_ago)s
                    ORDER BY player_tag, champion, timestamp DESC
                )
                SELECT 
                    lp.player_tag,
                    lp.champion,
                    lp.stock_value AS current_price,
                    lp.stock_value - COALESCE(p24h.stock_value, lp.stock_value) AS price_change_24h,
                    (lp.stock_value - COALESCE(p24h.stock_value, lp.stock_value)) / COALESCE(p24h.stock_value, lp.stock_value) * 100 AS price_change_percent_24h,
                    lp.stock_value - COALESCE(p7d.stock_value, lp.stock_value) AS price_change_7d,
                    (lp.stock_value - COALESCE(p7d.stock_value, lp.stock_value)) / COALESCE(p7d.stock_value, lp.stock_value) * 100 AS price_change_percent_7d,
                    lp.timestamp AS last_update
                FROM latest_prices lp
                LEFT JOIN prices_24h_ago p24h ON lp.player_tag = p24h.player_tag AND lp.champion = p24h.champion
                LEFT JOIN prices_7d_ago p7d ON lp.player_tag = p7d.player_tag AND lp.champion = p7d.champion
                WHERE lp.rn = 1;
            """, {'market_id': market_id, 'day_ago': day_ago, 'week_ago': week_ago})
            
            stocks = c.fetchall()
            return stocks
    finally:
        conn.close()

@app.get("/api/markets/{market_id}/stocks/{player_tag}/{champion}/history")
async def get_stock_history(market_id: int, player_tag: str, champion: str, period: str = "1w"):
    """Gets stock price history for a specific stock within a market."""
    conn = get_dict_connection()
    try:
        now = datetime.now()
        if period == "1d": start_date = now - timedelta(days=1)
        elif period == "1w": start_date = now - timedelta(days=7)
        elif period == "1m": start_date = now - timedelta(days=30)
        elif period == "ytd": start_date = datetime(now.year, 1, 1)
        else: start_date = datetime(2000, 1, 1)
        
        with conn.cursor() as c:
            c.execute("""
                SELECT stock_value, timestamp
                FROM stock_values
                WHERE market_id = %s AND player_tag = %s AND champion = %s AND timestamp >= %s
                ORDER BY timestamp ASC
            """, (market_id, player_tag, champion, start_date))
            return c.fetchall()
    finally:
        conn.close()

@app.get("/api/markets/{market_id}/performers")
async def get_top_performers(market_id: int, period: str = "1m"):
    """Gets top and bottom performers for a specific market over a variable period."""
    conn = get_dict_connection()
    try:
        now = datetime.now(timezone.utc)
        if period == "1d": start_date = now - timedelta(days=1)
        elif period == "1w": start_date = now - timedelta(days=7)
        elif period == "ytd": start_date = datetime(now.year, 1, 1, tzinfo=timezone.utc)
        else: start_date = now - timedelta(days=30) # Default to 1 month

        with conn.cursor() as c:
            # A single, powerful query to get all performance data at once
            c.execute("""
                WITH stock_list AS (
                    SELECT DISTINCT player_tag, champion FROM stock_values WHERE market_id = %(market_id)s
                ),
                latest_prices AS (
                    SELECT DISTINCT ON (player_tag, champion)
                        player_tag, champion, stock_value
                    FROM stock_values
                    WHERE market_id = %(market_id)s
                    ORDER BY player_tag, champion, timestamp DESC
                ),
                historical_prices AS (
                    SELECT DISTINCT ON (player_tag, champion)
                        player_tag, champion, stock_value
                    FROM stock_values
                    WHERE market_id = %(market_id)s AND timestamp >= %(start_date)s
                    ORDER BY player_tag, champion, timestamp ASC
                )
                SELECT
                    sl.player_tag,
                    sl.champion,
                    lp.stock_value as current_price,
                    (lp.stock_value - hp.stock_value) / hp.stock_value * 100 AS price_change_percent
                FROM stock_list sl
                JOIN latest_prices lp ON sl.player_tag = lp.player_tag AND sl.champion = lp.champion
                JOIN historical_prices hp ON sl.player_tag = hp.player_tag AND sl.champion = hp.champion
                WHERE hp.stock_value > 0;
            """, {'market_id': market_id, 'start_date': start_date})

            performers = c.fetchall()

        if not performers:
            return {"top_performers": [], "bottom_performers": []}

        performers.sort(key=lambda x: x['price_change_percent'], reverse=True)
        
        # Handle cases with few performers
        if len(performers) < 5:
             return {"top_performers": performers, "bottom_performers": []}

        return {
            "top_performers": performers[:5],
            "bottom_performers": performers[-5:]
        }
    finally:
        conn.close()

@app.get("/api/markets/{market_id}/stocks/{player_tag}/{champion}/scores")
async def get_player_scores(market_id: int, player_tag: str, champion: str, limit: int = 5):
    """Gets the most recent game scores for a specific stock within a market."""
    conn = get_dict_connection()
    try:
        with conn.cursor() as c:
            c.execute("""
                SELECT sv1.model_score, sv1.timestamp, sv1.game_id, sv1.stock_value,
                       (SELECT sv2.stock_value FROM stock_values sv2 
                        WHERE sv2.market_id = sv1.market_id AND sv2.player_tag = sv1.player_tag 
                        AND sv2.champion = sv1.champion AND sv2.timestamp < sv1.timestamp 
                        ORDER BY sv2.timestamp DESC LIMIT 1) as previous_stock_value
                FROM stock_values sv1
                WHERE sv1.market_id = %s AND sv1.player_tag = %s AND sv1.champion = %s AND sv1.model_score IS NOT NULL
                ORDER BY sv1.timestamp DESC
                LIMIT %s
            """, (market_id, player_tag, champion, limit))
            return c.fetchall()
    finally:
        conn.close()

@app.get("/api/users/{user_id}/markets")
async def get_user_markets(user_id: str):
    """Gets a list of all markets a specific user is a member of."""
    print(f"--- Backend received request for markets for user: {user_id} ---")
    
    conn = None  # Ensure conn is defined in the outer scope
    try:
        conn = get_dict_connection()
        if conn is None:
            print("!!! FATAL: Could not get database connection. !!!")
            raise HTTPException(status_code=500, detail="Database connection could not be established.")

        with conn.cursor() as c:
            print("[DB] Executing query to find markets...")
            c.execute("""
                SELECT m.id, m.name
                FROM markets m
                JOIN market_members mm ON m.id = mm.market_id
                WHERE mm.user_id = %s
            """, (user_id,))
            markets = c.fetchall()
            # This is correct. If the user is in no markets, fetchall() will return an empty list: []
            print(f"[DB] Query finished. Found {len(markets)} markets.")
            return markets

    except Exception as e:
        print(f"!!! ERROR in get_user_markets: {e}")
        # This will catch any errors, including connection errors, and report them.
        raise HTTPException(status_code=500, detail="An internal server error occurred while fetching markets.")
    
    finally:
        # This block GUARANTEES that the connection is closed,
        # which is the most critical part for preventing deadlocks.
        if conn:
            conn.close()
            print("--- Backend request finished, connection closed. ---")


class PlayerInMarket(BaseModel):
    id: int
    player_tag: str
    champions: list[str]

class MarketDetails(BaseModel):
    id: int
    name: str
    invite_code: str
    creator_id: str
    tier: str
    player_limit: int
    champions_per_player_limit: int
    players: list[PlayerInMarket]

@app.get("/api/markets/{market_id}/manage", response_model=MarketDetails)
async def get_market_management_details(market_id: int):
    """Gets all the details needed to manage a market."""
    conn = get_dict_connection()
    try:
        with conn.cursor() as c:
            # Get market details
            c.execute("SELECT * FROM markets WHERE id = %s", (market_id,))
            market = c.fetchone()
            if not market:
                raise HTTPException(status_code=404, detail="Market not found")
            
            # Get players and their champions in that market
            c.execute("""
                SELECT 
                    mp.id, 
                    mp.player_tag, 
                    COALESCE(array_agg(pc.champion_name) FILTER (WHERE pc.champion_name IS NOT NULL), '{}') as champions
                FROM market_players mp
                LEFT JOIN player_champions pc ON mp.id = pc.market_player_id
                WHERE mp.market_id = %s
                GROUP BY mp.id, mp.player_tag
            """, (market_id,))
            players = c.fetchall()

            market['players'] = players
            return market
    finally:
        conn.close()

# You will also need an endpoint to remove a player
@app.delete("/api/markets/players/{player_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_player_from_market(player_id: int):
    conn = get_dict_connection()
    try:
        with conn.cursor() as c:
            # ON DELETE CASCADE will handle deleting their champions
            c.execute("DELETE FROM market_players WHERE id = %s", (player_id,))
            conn.commit()
            return
    finally:
        conn.close()
