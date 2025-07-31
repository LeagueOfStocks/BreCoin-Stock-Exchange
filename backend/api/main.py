import os
import string
import random
import hmac
import hashlib
import base64
from datetime import datetime, timedelta, timezone
import json
import jwt
import base64
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
QSTASH_URL = os.getenv("QSTASH_URL")
QSTASH_TOKEN = os.getenv("QSTASH_TOKEN")
QSTASH_CURRENT_SIGNING_KEY = os.getenv("QSTASH_CURRENT_SIGNING_KEY")
QSTASH_NEXT_SIGNING_KEY = os.getenv("QSTASH_NEXT_SIGNING_KEY")
APP_BASE_URL = os.getenv("APP_BASE_URL")

# --- Temporary Middleware to Log Request Methods ---
@app.middleware("http")
async def log_request_method(request: Request, call_next):
    print(f"INCOMING REQUEST: {request.method} {request.url}")
    response = await call_next(request)
    return response

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


# --- Global Tracker Instance & Startup Event ---
tracker = PlayerStockTracker(RIOT_API_KEY)
@app.on_event("startup")
async def startup_event():
    await tracker.load_models_async()

# --- Helper Functions & Security ---
def _generate_invite_code(length=8):
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))

async def verify_qstash_signature(request: Request):
    print(f"=== JWT SIGNATURE VERIFICATION ===")
    
    # Get the JWT signature from headers
    jwt_signature = request.headers.get("Upstash-Signature")
    print(f"Received JWT signature: {jwt_signature}")
    
    if not jwt_signature:
        print("ERROR: No Upstash-Signature header found")
        raise HTTPException(status_code=401, detail="Signature header is missing")
    
    # Get the request body
    body = await request.body()
    print(f"Request body: {body}")
    
    # Check environment variables
    if not QSTASH_CURRENT_SIGNING_KEY or not QSTASH_NEXT_SIGNING_KEY:
        print("ERROR: Missing signing keys in environment")
        raise HTTPException(status_code=500, detail="Server configuration error")
    
    # Try to verify the JWT with current signing key
    try:
        print("=== Trying CURRENT signing key ===")
        # Decode and verify the JWT
        decoded = jwt.decode(
            jwt_signature, 
            QSTASH_CURRENT_SIGNING_KEY, 
            algorithms=["HS256"]
        )
        print(f"JWT decoded successfully with current key: {decoded}")
        
        # The 'body' claim contains a URL-safe base64-encoded SHA-256 hash of the request body
        expected_body_hash_b64 = decoded.get("body", "")
        
        # Compute SHA-256 hash of the actual body
        actual_body_hash = hashlib.sha256(body).digest()
        # Use URL-safe base64 encoding (with - and _ instead of + and /)
        actual_body_hash_b64 = base64.urlsafe_b64encode(actual_body_hash).decode()
        
        print(f"Expected body hash (base64): {expected_body_hash_b64}")
        print(f"Actual body hash (base64):   {actual_body_hash_b64}")
        
        if expected_body_hash_b64 == actual_body_hash_b64:
            print("SUCCESS: JWT verification and body hash match successful!")
            return True
        else:
            print("ERROR: Body hash doesn't match JWT claim")
            
    except jwt.InvalidTokenError as e:
        print(f"Current key JWT verification failed: {e}")
    except Exception as e:
        print(f"Error with current key: {e}")
    
    # Try with next signing key
    try:
        print("=== Trying NEXT signing key ===")
        # Decode and verify the JWT
        decoded = jwt.decode(
            jwt_signature, 
            QSTASH_NEXT_SIGNING_KEY, 
            algorithms=["HS256"]
        )
        print(f"JWT decoded successfully with next key: {decoded}")
        
        # The 'body' claim contains a URL-safe base64-encoded SHA-256 hash of the request body
        expected_body_hash_b64 = decoded.get("body", "")
        
        # Compute SHA-256 hash of the actual body
        actual_body_hash = hashlib.sha256(body).digest()
        # Use URL-safe base64 encoding (with - and _ instead of + and /)
        actual_body_hash_b64 = base64.urlsafe_b64encode(actual_body_hash).decode()
        
        print(f"Expected body hash (base64): {expected_body_hash_b64}")
        print(f"Actual body hash (base64):   {actual_body_hash_b64}")
        
        if expected_body_hash_b64 == actual_body_hash_b64:
            print("SUCCESS: JWT verification and body hash match successful!")
            return True
        else:
            print("ERROR: Body hash doesn't match JWT claim")
            
    except jwt.InvalidTokenError as e:
        print(f"Next key JWT verification failed: {e}")
    except Exception as e:
        print(f"Error with next key: {e}")
    
    print("ERROR: JWT verification failed with both keys")
    raise HTTPException(status_code=401, detail="Invalid signature")


# --- NEW: Health Check Endpoint for Render ---
@app.get("/")
async def health_check():
    return {"status": "ok"}

# --- QStash Task Endpoint (Internal) ---
@app.post("/api/tasks/update-market", status_code=status.HTTP_202_ACCEPTED, include_in_schema=False)
async def task_update_market(request: Request, _=Depends(verify_qstash_signature)):
    print(f"=== QStash webhook received at {datetime.now()} ===")
    
    try:
        # Get the JSON payload
        body = await request.json()
        print(f"QStash payload received: {body}")
        
        market_id = body.get("market_id")
        if not market_id:
            print("ERROR: market_id missing from payload")
            raise HTTPException(status_code=400, detail="market_id missing")
        
        print(f"Starting stock update for market {market_id}")
        await tracker.update_market_stocks(market_id)
        print(f"Completed stock update for market {market_id}")
        
        return {"status": "success", "message": f"Updated market {market_id}"}
        
    except Exception as e:
        print(f"ERROR in task_update_market: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# --- User-Facing API Endpoints ---
@app.post("/api/markets/{market_id}/refresh")
async def refresh_market(market_id: int):
    # --- Cooldown logic ---
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
    
    # --- Dispatch job to QStash ---
    destination_url = f"{APP_BASE_URL}/api/tasks/update-market"
    
    # Method 1: Using destination as URL parameter (recommended)
    publish_url = f"{QSTASH_URL.rstrip('/')}/v2/publish/{destination_url}"
    
    headers = {
        "Authorization": f"Bearer {QSTASH_TOKEN}",
        "Content-Type": "application/json"
    }
    
    # The payload is just the body that will be sent to your webhook
    payload = {"market_id": market_id}

    try:
        print(f"Dispatching task to QStash publish URL: {publish_url}")
        response = requests.post(publish_url, headers=headers, json=payload)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(f"!!! ERROR dispatching task to QStash: {e}")
        if e.response is not None:
            print(f"!!! QStash Response Body: {e.response.text}")
        raise HTTPException(status_code=500, detail="Failed to schedule background task.")

    print(f"Successfully dispatched update task for market {market_id} to QStash.")
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

class MarketDelete(BaseModel):
    user_id: str

class KickUser(BaseModel):
    user_to_kick_id: str # The ID of the user being kicked
    creator_id: str      # The ID of the user performing the kick action

class MarketMember(BaseModel):
    id: str # This is the user's UUID
    username: str

@app.post("/api/markets/create", status_code=status.HTTP_201_CREATED)
async def create_market(market_data: MarketCreate):
    conn = get_dict_connection()
    try:
        with conn.cursor() as c:
         # --- NEW TIER VALIDATION LOGIC (SAME AS JOIN) ---
            c.execute("""
                SELECT 
                    p.subscription_tier, 
                    (SELECT COUNT(*) FROM market_members WHERE user_id = p.id) as market_count
                FROM profiles p WHERE id = %s
            """, (market_data.creator_id,))
            user_profile = c.fetchone()
            user_tier = user_profile['subscription_tier'] if user_profile else 'free'
            market_count = user_profile['market_count'] if user_profile else 0

            tier_limits = {'free': 1, 'premium': 1, 'pro': 3}
            limit = tier_limits.get(user_tier, 1)

            if market_count >= limit:
                raise HTTPException(status_code=403, detail=f"Your '{user_tier}' plan only allows you to create/join {limit} market(s). Upgrade to Pro for more.")

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

            # --- NEW TIER VALIDATION LOGIC ---
            # 1. Get the user's current tier and market count
            c.execute("""
                SELECT 
                    p.subscription_tier, 
                    (SELECT COUNT(*) FROM market_members WHERE user_id = p.id) as market_count
                FROM profiles p WHERE id = %s
            """, (join_data.user_id,))
            user_profile = c.fetchone()
            user_tier = user_profile['subscription_tier'] if user_profile else 'free'
            market_count = user_profile['market_count'] if user_profile else 0

            # 2. Define the limits
            tier_limits = {'free': 1, 'premium': 1, 'pro': 3}
            limit = tier_limits.get(user_tier, 1)

            # 3. Enforce the limit
            if market_count >= limit:
                raise HTTPException(status_code=403, detail=f"Your '{user_tier}' plan only allows you to join {limit} market(s). Upgrade to Pro to join more.")
            
            # Check if user is already a member
            c.execute("SELECT 1 FROM market_members WHERE market_id = %s AND user_id = %s", (market_id, join_data.user_id))
            if c.fetchone():
                return {"status": "success", "message": "Already a member.", "market_id": market_id}

            # Check if market is full
            c.execute("SELECT COUNT(*) as member_count FROM market_members WHERE market_id = %s", (market_id,))
            member_count = c.fetchone()['member_count']
            if member_count >= market['player_limit']:
                raise HTTPException(status_code=403, detail="This market is full.")


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
            market_player_id = c.fetchone()['id']  # <-- THE FIX: Use correct variable name

            c.execute(
                "INSERT INTO player_champions (market_player_id, champion_name) VALUES (%s, %s)",
                (market_player_id, player_data.initial_champion)
            )

            # Step 3: Create the initial "IPO" price entry in the stock_values table
            c.execute("""
                INSERT INTO stock_values 
                    (market_id, market_player_id, player_tag, stock_value, model_score, champion_played) 
                VALUES (%s, %s, %s, %s, %s, %s)
            """, 
            (market_id, market_player_id, player_data.player_tag, 10.0, 5.0, player_data.initial_champion))
            
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


@app.get("/api/markets/{market_id}/members", response_model=list[MarketMember])
async def get_market_members(market_id: int):
    """Gets a list of all members (users) in a specific market."""
    conn = get_dict_connection()
    try:
        with conn.cursor() as c:
            # We join market_members with profiles to get the username
            c.execute("""
                SELECT p.id, p.username
                FROM profiles p
                JOIN market_members mm ON p.id = mm.user_id
                WHERE mm.market_id = %s
            """, (market_id,))
            members = c.fetchall()
            return members
    finally:
        if conn: conn.close()



@app.delete("/api/markets/{market_id}/members", status_code=status.HTTP_204_NO_CONTENT)
async def kick_user_from_market(market_id: int, kick_data: KickUser):
    """
    Removes a member from a market. This action can only be performed by the market's creator.
    """
    conn = get_dict_connection()
    try:
        with conn.cursor() as c:
            # --- SECURITY CHECK: Verify the requester is the creator ---
            c.execute("SELECT creator_id FROM markets WHERE id = %s", (market_id,))
            market = c.fetchone()

            if not market:
                raise HTTPException(status_code=404, detail="Market not found.")

            if market['creator_id'] != kick_data.creator_id:
                raise HTTPException(status_code=403, detail="Only the market creator can remove members.")

            # Prevent the creator from kicking themselves
            if kick_data.creator_id == kick_data.user_to_kick_id:
                raise HTTPException(status_code=400, detail="The creator cannot be kicked from their own market.")

            # If checks pass, proceed with deletion
            c.execute("DELETE FROM market_members WHERE market_id = %s AND user_id = %s", (market_id, kick_data.user_to_kick_id))
            conn.commit()

            print(f"Creator {kick_data.creator_id} successfully kicked user {kick_data.user_to_kick_id} from market {market_id}.")
            return

    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()



@app.post("/api/markets/players/{player_id}/champions", status_code=status.HTTP_201_CREATED)
async def add_champion_to_player(player_id: int, champion_data: ChampionAdd):
    """Adds a new champion to a player's allowed pool, respecting tier limits."""
    conn = get_dict_connection()
    try:
        with conn.cursor() as c:
            # --- TIER VALIDATION LOGIC ---
            # 1. Get the market's tier and champion limit from the player_id
            c.execute("""
                SELECT 
                    m.champions_per_player_limit,
                    (SELECT COUNT(*) FROM player_champions WHERE market_player_id = %s) as current_champion_count
                FROM market_players mp
                JOIN markets m ON mp.market_id = m.id
                WHERE mp.id = %s
            """, (player_id, player_id))
            
            market_rules = c.fetchone()
            if not market_rules:
                raise HTTPException(status_code=404, detail="Player or market not found.")

            # 2. Enforce the limit
            if market_rules['current_champion_count'] >= market_rules['champions_per_player_limit']:
                raise HTTPException(status_code=403, detail=f"This player has reached the maximum number of champions ({market_rules['champions_per_player_limit']}) allowed by this market's tier.")

            # --- END VALIDATION ---
            
            # If validation passes, insert the new champion
            c.execute("INSERT INTO player_champions (market_player_id, champion_name) VALUES (%s, %s)",
                      (player_id, champion_data.champion_name))
            conn.commit()
            return {"status": "success", "message": f"{champion_data.champion_name} added to pool."}
    except Exception as e:
        if conn: conn.rollback()
        # Handle cases where the champion is already in the pool
        if 'duplicate key value violates unique constraint' in str(e).lower():
            raise HTTPException(status_code=409, detail="This champion is already in the player's pool.")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()

@app.delete("/api/markets/players/{player_id}/champions/{champion_name}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_champion_from_player(player_id: int, champion_name: str):
    """Removes a champion from a player's allowed pool."""
    # TODO: Add security check to ensure the user making the request is the market creator
    conn = get_dict_connection()
    try:
        with conn.cursor() as c:
            # A player must always have at least one champion
            c.execute("SELECT COUNT(*) FROM player_champions WHERE market_player_id = %s", (player_id,))
            count = c.fetchone()['count']
            if count <= 1:
                raise HTTPException(status_code=400, detail="Cannot remove the last champion from a player's pool.")

            c.execute("DELETE FROM player_champions WHERE market_player_id = %s AND champion_name = %s",
                      (player_id, champion_name))
            conn.commit()
            return
    finally:
        if conn: conn.close()

@app.delete("/api/markets/{market_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def leave_market(market_id: int, user_id: str):
    """Allows a user to leave a market they are a member of."""
    conn = get_dict_connection()
    try:
        with conn.cursor() as c:
            # Check if the user is the creator. For now, we might prevent creators from leaving.
            # A better long-term solution would be to force them to transfer ownership.
            c.execute("SELECT creator_id FROM markets WHERE id = %s", (market_id,))
            market = c.fetchone()
            if market and market['creator_id'] == user_id:
                raise HTTPException(status_code=403, detail="Market creators cannot leave their own market. Please delete it instead.")

            # Delete the user's membership record.
            # The 'RETURNING *' part is a good way to check if a row was actually deleted.
            c.execute("DELETE FROM market_members WHERE market_id = %s AND user_id = %s RETURNING *", (market_id, user_id))
            if c.fetchone() is None:
                # This means the user wasn't a member in the first place, which is fine.
                pass
            
            conn.commit()
            return
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()

@app.delete("/api/markets/{market_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_market(market_id: int, delete_data: MarketDelete):
    """
    Deletes an entire market. This action can only be performed by the market's creator.
    """
    conn = get_dict_connection()
    try:
        with conn.cursor() as c:
            # --- SECURITY CHECK: Verify the user is the creator ---
            c.execute("SELECT creator_id FROM markets WHERE id = %s", (market_id,))
            market = c.fetchone()

            if not market:
                # Market doesn't exist, which is fine. The end result is the same.
                return 

            if market['creator_id'] != delete_data.user_id:
                # If the user is not the creator, forbid the action.
                raise HTTPException(status_code=403, detail="Only the market creator can delete this market.")
            
            # If the check passes, proceed with deletion.
            # The database's ON DELETE CASCADE rules will handle the rest.
            c.execute("DELETE FROM markets WHERE id = %s", (market_id,))
            conn.commit()
            
            print(f"User {delete_data.user_id} successfully deleted market {market_id}.")
            return

    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn: conn.close()

# --- NEW: Market-aware read-only endpoints ---
@app.get("/api/markets/{market_id}/stocks")
async def get_market_stocks(market_id: int):
    """
    Gets all PLAYERS for a market, including their champion pool, 
    current price, and historical changes.
    """
    conn = get_dict_connection()
    try:
        with conn.cursor() as c:
            now = datetime.now(timezone.utc)
            day_ago = now - timedelta(days=1)
            week_ago = now - timedelta(days=7)
            
            # This complex query gets all the data we need in one go.
            c.execute("""
                WITH player_champion_list AS (
                    -- First, get every player in the market and their full champion pool
                    SELECT mp.id, mp.player_tag, array_agg(pc.champion_name) as champions
                    FROM market_players mp
                    JOIN player_champions pc ON mp.id = pc.market_player_id
                    WHERE mp.market_id = %(market_id)s
                    GROUP BY mp.id, mp.player_tag
                ),
                latest_prices AS (
                    -- Then, find the single most recent price for each player
                    SELECT DISTINCT ON (market_player_id)
                        market_player_id, stock_value, timestamp
                    FROM stock_values
                    WHERE market_id = %(market_id)s
                    ORDER BY market_player_id, timestamp DESC
                ),
                prices_24h_ago AS (
                    -- Find the latest price from before 24 hours ago
                    SELECT DISTINCT ON (market_player_id)
                        market_player_id, stock_value
                    FROM stock_values
                    WHERE market_id = %(market_id)s AND timestamp <= %(day_ago)s
                    ORDER BY market_player_id, timestamp DESC
                ),
                prices_7d_ago AS (
                    -- Find the latest price from before 7 days ago
                    SELECT DISTINCT ON (market_player_id)
                        market_player_id, stock_value
                    FROM stock_values
                    WHERE market_id = %(market_id)s AND timestamp <= %(week_ago)s
                    ORDER BY market_player_id, timestamp DESC
                )
                SELECT
                    pcl.player_tag,
                    pcl.champions,
                    lp.stock_value AS current_price,
                    lp.timestamp AS last_update,
                    -- Safely calculate price changes, defaulting to 0 if no historical data exists
                    lp.stock_value - COALESCE(p24h.stock_value, lp.stock_value) AS price_change_24h,
                    (lp.stock_value - COALESCE(p24h.stock_value, lp.stock_value)) / NULLIF(COALESCE(p24h.stock_value, lp.stock_value), 0) * 100 AS price_change_percent_24h,
                    lp.stock_value - COALESCE(p7d.stock_value, lp.stock_value) AS price_change_7d,
                    (lp.stock_value - COALESCE(p7d.stock_value, lp.stock_value)) / NULLIF(COALESCE(p7d.stock_value, lp.stock_value), 0) * 100 AS price_change_percent_7d
                FROM player_champion_list pcl
                -- Use LEFT JOINs to ensure players appear even if they only have an IPO price
                LEFT JOIN latest_prices lp ON pcl.id = lp.market_player_id
                LEFT JOIN prices_24h_ago p24h ON pcl.id = p24h.market_player_id
                LEFT JOIN prices_7d_ago p7d ON pcl.id = p7d.market_player_id;
            """, {'market_id': market_id, 'day_ago': day_ago, 'week_ago': week_ago})
            
            stocks = c.fetchall()
            # Handle nulls from the LEFT JOIN for brand new stocks
            for stock in stocks:
                if stock['current_price'] is None: stock['current_price'] = 10.0
                if stock['price_change_24h'] is None: stock['price_change_24h'] = 0
                if stock['price_change_percent_24h'] is None: stock['price_change_percent_24h'] = 0
                if stock['price_change_7d'] is None: stock['price_change_7d'] = 0
                if stock['price_change_percent_7d'] is None: stock['price_change_percent_7d'] = 0

            return stocks
    finally:
        if conn: conn.close()


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
                SELECT 
                    m.id, 
                    m.name, 
                    m.creator_id,
                    CASE WHEN m.creator_id = %s THEN m.invite_code ELSE NULL END as invite_code,
                    (SELECT COUNT(*) FROM market_members WHERE market_id = m.id) as member_count
                FROM markets m
                JOIN market_members mm ON m.id = mm.market_id
                WHERE mm.user_id = %s
            """, (user_id, user_id))
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

@app.get("/api/users/{user_id}/profile")
async def get_user_profile(user_id: str):
    """Gets user profile information including subscription tier."""
    conn = get_dict_connection()
    try:
        with conn.cursor() as c:
            c.execute("SELECT id, username, subscription_tier FROM profiles WHERE id = %s", (user_id,))
            profile = c.fetchone()
            if not profile:
                raise HTTPException(status_code=404, detail="User profile not found")
            return profile
    finally:
        conn.close()
