from apscheduler.schedulers.background import BackgroundScheduler
from .stock_tracker import PlayerStockTracker

class UpdateScheduler:
    def __init__(self, api_key):
        self.tracker = PlayerStockTracker(api_key)
        self.scheduler = BackgroundScheduler()

    def start(self):
        # Schedule updates every 30 minutes
        self.scheduler.add_job(self.tracker.run, 'interval', minutes=2)
        self.scheduler.start()

    def get_tracker(self):
        return self.tracker

    