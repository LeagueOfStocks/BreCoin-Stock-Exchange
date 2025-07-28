''' 

import os
import redis
from rq import Worker, Queue
from dotenv import load_dotenv
from services.stock_tracker import PlayerStockTracker
import asyncio

# Load environment variables from .env file
load_dotenv()

# This is the function that will be executed by the worker.
# It represents the "job" that goes on the queue.
def run_market_update_job(market_id: int):
    """
    A synchronous wrapper that sets up and runs our async stock tracker logic.
    """
    print(f"RQ worker picked up job for market {market_id}")
    API_KEY = os.getenv("RIOT_API_KEY")
    
    # We instantiate the tracker here, inside the job, to ensure
    # it's fresh for each task and has access to loaded models.
    tracker = PlayerStockTracker(API_KEY)
    
    # Use asyncio.run() to execute the async function from our sync worker job
    # This creates a new event loop for each job, which is a robust pattern.
    asyncio.run(tracker.update_market_stocks(market_id))
    
    print(f"RQ worker finished job for market {market_id}")

# This `if __name__ == '__main__':` block is only executed
# when you run `python worker.py` from your terminal.
if __name__ == '__main__':
    # --- THIS IS THE NEW, SIMPLIFIED STARTUP LOGIC ---

    # 1. Establish the connection to Redis using the URL.
    redis_url = os.getenv('REDIS_URL')
    if not redis_url:
        raise ValueError("REDIS_URL not found in .env file. Please set it.")
    
    conn = redis.from_url(redis_url)

    # 2. Define which queues this worker will listen to.
    listen = ['default']
    
    print("RQ worker starting...")
    print(f"Listening on queues: {', '.join(listen)}")

    # 3. Create the list of Queue objects.
    queues = [Queue(name, connection=conn) for name in listen]

    # 4. Create the worker and tell it which queues to listen to and what connection to use.
    #    We no longer need the problematic 'with Connection(...)' block.
    worker = Worker(queues, connection=conn)

    # 5. Start the worker. It will now listen for jobs indefinitely.
    #    The 'burst' parameter means it will shut down after processing one job.
    #    Remove burst=True for production to have it run continuously.
    worker.work(burst=False)

'''