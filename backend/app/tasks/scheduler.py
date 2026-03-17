from __future__ import annotations

import atexit
from threading import Lock

import structlog
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from flask import Flask

from app.utils.cleanup import CleanupManager

logger = structlog.get_logger(__name__)

_scheduler: BackgroundScheduler | None = None
_scheduler_lock = Lock()


def _run_cleanup(app: Flask) -> None:
    """
    Execute scheduled cleanup inside Flask app context.
    """
    with app.app_context():
        manager = CleanupManager()
        ttl_hours = int(app.config["FILE_TTL_HOURS"])
        stats = manager.delete_expired_sessions(ttl_hours=ttl_hours)
        logger.info("scheduler.cleanup_completed", **stats)


def start_scheduler(app: Flask) -> BackgroundScheduler:
    """
    Start APScheduler with cleanup task and graceful shutdown.
    """
    global _scheduler

    with _scheduler_lock:
        if _scheduler is not None and _scheduler.running:
            return _scheduler

        scheduler = BackgroundScheduler(timezone="UTC")
        cleanup_interval = int(app.config["CLEANUP_INTERVAL_MINUTES"])

        scheduler.add_job(
            func=_run_cleanup,
            trigger=IntervalTrigger(minutes=cleanup_interval),
            args=[app],
            id="cleanup_expired_sessions",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
            misfire_grace_time=60,
        )

        scheduler.start()
        logger.info(
            "scheduler.started",
            cleanup_interval_minutes=cleanup_interval,
        )

        def _shutdown_scheduler() -> None:
            global _scheduler
            with _scheduler_lock:
                if _scheduler is not None and _scheduler.running:
                    _scheduler.shutdown(wait=False)
                    logger.info("scheduler.stopped")
                    _scheduler = None

        atexit.register(_shutdown_scheduler)
        _scheduler = scheduler
        return scheduler