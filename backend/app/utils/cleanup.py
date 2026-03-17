from __future__ import annotations

import shutil
from datetime import UTC, datetime, timedelta
from pathlib import Path

import structlog
from flask import current_app

logger = structlog.get_logger(__name__)


class CleanupManager:
    """
    Handles cleanup of expired sessions, job results, and temp storage stats.
    """

    def __init__(self, temp_dir: str | Path | None = None) -> None:
        self.temp_dir = Path(
            temp_dir or current_app.config["TEMP_DIR"]
        ).resolve()
        self.sessions_root = self.temp_dir / "sessions"
        self.jobs_root = self.temp_dir / "jobs"

    def delete_expired_sessions(self, ttl_hours: int) -> dict[str, int]:
        """
        Delete expired session directories based on last modified time.
        """
        now = datetime.now(UTC)
        threshold = now - timedelta(hours=ttl_hours)

        deleted_sessions = 0
        deleted_files = 0
        freed_bytes = 0
        errors = 0

        self.sessions_root.mkdir(parents=True, exist_ok=True)

        for session_dir in self.sessions_root.iterdir():
            if not session_dir.is_dir():
                continue

            try:
                modified_at = datetime.fromtimestamp(
                    session_dir.stat().st_mtime,
                    tz=UTC,
                )
                if modified_at >= threshold:
                    continue

                dir_size = self._get_dir_size(session_dir)
                file_count = sum(
                    1 for item in session_dir.rglob("*") if item.is_file()
                )

                shutil.rmtree(session_dir, ignore_errors=False)

                deleted_sessions += 1
                deleted_files += file_count
                freed_bytes += dir_size

                logger.info(
                    "cleanup.session_deleted",
                    session_id=session_dir.name,
                    freed_bytes=dir_size,
                    file_count=file_count,
                )
            except Exception as exc:
                errors += 1
                logger.exception(
                    "cleanup.session_delete_failed",
                    session_id=session_dir.name,
                    error=str(exc),
                )

        stats = {
            "deleted_sessions": deleted_sessions,
            "deleted_files": deleted_files,
            "freed_bytes": freed_bytes,
            "errors": errors,
        }
        logger.info("cleanup.expired_sessions_finished", **stats)
        return stats

    def delete_job_result(self, job_id: str) -> bool:
        """
        Delete job result directory and all related files.
        """
        job_dir = self.jobs_root / job_id
        if not job_dir.exists():
            return False

        try:
            shutil.rmtree(job_dir, ignore_errors=False)
            logger.info("cleanup.job_deleted", job_id=job_id)
            return True
        except Exception as exc:
            logger.exception(
                "cleanup.job_delete_failed",
                job_id=job_id,
                error=str(exc),
            )
            return False

    def get_temp_dir_size(self) -> int:
        """
        Return total temp directory size in bytes.
        """
        if not self.temp_dir.exists():
            return 0
        size = self._get_dir_size(self.temp_dir)
        logger.info(
            "cleanup.temp_dir_size",
            size_bytes=size,
            path=str(self.temp_dir),
        )
        return size

    def _get_dir_size(self, directory: Path) -> int:
        total = 0
        for item in directory.rglob("*"):
            if item.is_file():
                try:
                    total += item.stat().st_size
                except OSError:
                    continue
        return total
