from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler
from services.stock_tracker import PlayerStockTracker
from datetime import datetime, timedelta
import time
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize tracker
API_KEY = os.getenv("RIOT_API_KEY")
tracker = PlayerStockTracker(API_KEY)

# Schedule updates
scheduler = BackgroundScheduler()
scheduler.add_job(tracker.run, 'interval', minutes=2)
scheduler.start()

@app.get("/api/stocks")
async def get_stocks():
    """Get all current stock prices and changes"""
    from lib.database import get_dict_connection
    conn = get_dict_connection()
    
    try:
        with conn.cursor() as c:
            stocks = []
            for player_tag, data in tracker.players.items():
                try:
                    # Get current price
                    c.execute("""
                        SELECT stock_value, timestamp 
                        FROM stock_values 
                        WHERE player_tag = %s AND champion = %s 
                        ORDER BY timestamp DESC LIMIT 1
                    """, (player_tag, data['champion']))
                    current = c.fetchone()
                    
                    # Get earliest price within the last week
                    week_ago = datetime.now() - timedelta(days=7)
                    c.execute("""
                        SELECT stock_value 
                        FROM stock_values 
                        WHERE player_tag = %s AND champion = %s AND timestamp <= %s
                        ORDER BY timestamp DESC LIMIT 1
                    """, (player_tag, data['champion'], week_ago))
                    week_ago_price = c.fetchone()
                    
                    if current:
                        current_price = current['stock_value']
                        # If no week-ago price exists, use the current price (showing 0 change)
                        week_ago_price = week_ago_price['stock_value'] if week_ago_price else current_price
                        
                        stocks.append({
                            "player_tag": player_tag,
                            "champion": data['champion'],
                            "current_price": current_price,
                            "price_change": current_price - week_ago_price,
                            "price_change_percent": ((current_price - week_ago_price) / week_ago_price * 100) if week_ago_price else 0,
                            "last_update": current['timestamp'].isoformat() if isinstance(current['timestamp'], datetime) else current['timestamp']
                        })
                    else:
                        # If no price data exists at all, add with default values
                        stocks.append({
                            "player_tag": player_tag,
                            "champion": data['champion'],
                            "current_price": 10.0,  # Default starting price
                            "price_change": 0,
                            "price_change_percent": 0,
                            "last_update": datetime.now().isoformat()
                        })
                except Exception as e:
                    print(f"Error processing stock for {player_tag}: {e}")
                    continue
        
        return stocks
    finally:
        conn.close()

@app.get("/api/stocks/{player_tag}")
async def get_stock_history(player_tag: str, period: str = "1w"):
    """Get stock history for a specific player"""
    from lib.database import get_dict_connection
    conn = get_dict_connection()
    
    try:
        # Validate that the player exists
        if player_tag not in tracker.players:
            raise HTTPException(status_code=404, detail="Player not found")
        
        # Calculate start date based on period
        now = datetime.now()
        if period == "1d":
            start_date = now - timedelta(days=1)
        elif period == "1w":
            start_date = now - timedelta(days=7)
        elif period == "1m":
            start_date = now - timedelta(days=30)
        elif period == "ytd":
            start_date = datetime(now.year, 1, 1)
        else:  # all time
            start_date = datetime(2000, 1, 1)
        
        champion = tracker.players[player_tag]['champion']
        
        with conn.cursor() as c:
            c.execute("""
                SELECT stock_value, timestamp, game_id
                FROM stock_values
                WHERE player_tag = %s AND champion = %s AND timestamp >= %s
                ORDER BY timestamp ASC
            """, (player_tag, champion, start_date))
            
            rows = c.fetchall()
        
        history = []
        for row in rows:
            try:
                # Convert to Unix timestamp (milliseconds)
                timestamp = int(row['timestamp'].timestamp() * 1000) if isinstance(row['timestamp'], datetime) else int(datetime.fromisoformat(row['timestamp']).timestamp() * 1000)
                
                history.append({
                    "value": float(row['stock_value']),
                    "timestamp": timestamp,
                    "game_id": row['game_id']
                })
            except Exception as e:
                print(f"Error processing row {row}: {e}")
                continue
        
        return history
    finally:
        conn.close()

@app.get("/api/stocks/{player_tag}/scores")
async def get_player_scores(player_tag: str, limit: int = 5):
    """Get the most recent model scores for a specific player/champion combination"""
    from lib.database import get_dict_connection
    conn = get_dict_connection()
    
    try:
        # Validate that the player exists
        if player_tag not in tracker.players:
            raise HTTPException(status_code=404, detail="Player not found")
        
        champion = tracker.players[player_tag]['champion']
        
        with conn.cursor() as c:
            # Get the most recent scores
            c.execute("""
                SELECT sv1.model_score, sv1.timestamp, sv1.game_id, sv1.stock_value,
                       (SELECT stock_value FROM stock_values sv2 
                        WHERE sv2.player_tag = sv1.player_tag 
                        AND sv2.champion = sv1.champion 
                        AND sv2.timestamp < sv1.timestamp 
                        ORDER BY sv2.timestamp DESC LIMIT 1) as previous_stock_value
                FROM stock_values sv1
                WHERE sv1.player_tag = %s AND sv1.champion = %s AND sv1.model_score IS NOT NULL
                ORDER BY sv1.timestamp DESC
                LIMIT %s
            """, (player_tag, champion, limit))
            
            rows = c.fetchall()
        
        scores = []
        for row in rows:
            try:
                model_score = row['model_score']
                stock_value = row['stock_value']
                prev_stock_value = row['previous_stock_value']
                
                # Fall back to stock_value if no previous value is found (first game)
                prev_stock_value = prev_stock_value if prev_stock_value is not None else stock_value
                price_change = stock_value - prev_stock_value
                
                # Handle timestamp
                dt = row['timestamp'] if isinstance(row['timestamp'], datetime) else datetime.fromisoformat(row['timestamp'])
                timestamp = int(dt.timestamp() * 1000)
                
                scores.append({
                    "score": float(model_score) if model_score is not None else None,
                    "stock_value": float(stock_value),
                    "previous_stock_value": float(prev_stock_value),
                    "price_change": float(price_change),
                    "timestamp": timestamp,
                    "formatted_time": dt.strftime("%Y-%m-%d %H:%M"),
                    "game_id": row['game_id']
                })
            except Exception as e:
                print(f"Error processing row {row}: {e}")
                continue
        
        # Get player's summoner name for display
        summoner_name = player_tag.split('#')[0]
        
        return {
            "player_tag": player_tag,
            "summoner_name": summoner_name,
            "champion": champion,
            "scores": scores
        }
    finally:
        conn.close()

@app.get("/api/top-performers")
async def get_top_performers():
    """Get top 5 and bottom 5 performers over the past month"""
    from lib.database import get_dict_connection
    conn = get_dict_connection()
    
    try:
        with conn.cursor() as c:
            month_ago = datetime.now() - timedelta(days=30)
            performers = []
            
            for player_tag, data in tracker.players.items():
                # Get current price
                c.execute("""
                    SELECT stock_value 
                    FROM stock_values 
                    WHERE player_tag = %s AND champion = %s 
                    ORDER BY timestamp DESC LIMIT 1
                """, (player_tag, data['champion']))
                current = c.fetchone()
                
                # Get price from a month ago or earliest available price
                c.execute("""
                    SELECT stock_value 
                    FROM stock_values 
                    WHERE player_tag = %s AND champion = %s
                    ORDER BY timestamp ASC LIMIT 1
                """, (player_tag, data['champion']))
                earliest_price = c.fetchone()
                
                if current and earliest_price:
                    current_price = current['stock_value']
                    earliest_price_value = earliest_price['stock_value']
                    change_percent = (current_price - earliest_price_value) / earliest_price_value * 100
                    performers.append({
                        "player_tag": player_tag,
                        "champion": data['champion'],
                        "current_price": current_price,
                        "price_change": current_price - earliest_price_value,
                        "price_change_percent": change_percent
                    })
        
        # Sort by percentage change
        performers.sort(key=lambda x: x['price_change_percent'], reverse=True)
        
        # If we have less than 10 performers total, adjust the return
        if len(performers) <= 10:
            mid_point = len(performers) // 2
            return {
                "top_performers": performers[:mid_point],
                "bottom_performers": performers[mid_point:]
            }
        
        return {
            "top_performers": performers[:5],
            "bottom_performers": performers[-5:]
        }
    finally:
        conn.close()

@app.get("/api/market-volatility")
async def get_market_volatility():
    """Get daily price changes for volatility calculation"""
    from lib.database import get_dict_connection
    conn = get_dict_connection()
    
    try:
        with conn.cursor() as c:
            today = datetime.now()
            yesterday = today - timedelta(days=1)
            
            daily_changes = []
            # Get all unique player_tag and champion combinations
            c.execute("""
                SELECT DISTINCT player_tag, champion 
                FROM stock_values
            """)
            stocks = c.fetchall()
            
            for stock in stocks:
                player_tag = stock['player_tag']
                champion = stock['champion']
                
                # Get today's and yesterday's prices
                c.execute("""
                    SELECT stock_value 
                    FROM stock_values 
                    WHERE player_tag = %s AND champion = %s AND timestamp > %s
                    ORDER BY timestamp ASC
                """, (player_tag, champion, yesterday))
                
                prices = c.fetchall()
                if len(prices) >= 2:
                    daily_change = prices[-1]['stock_value'] - prices[0]['stock_value']
                    daily_changes.append({
                        "player_tag": player_tag,
                        "champion": champion,
                        "daily_change": daily_change
                    })
        
        return daily_changes
    finally:
        conn.close()

# Endpoint to manually trigger an update
@app.post("/api/update")
async def trigger_update():
    """Manually trigger a stock update"""
    try:
        tracker.run()
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

