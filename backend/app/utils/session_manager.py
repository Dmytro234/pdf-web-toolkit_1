from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import structlog
from flask import current_app

logger = structlog.get_logger(__name__)


@dataclass(slots=True)
class FileRecord:
    """Stored session file metadata."""

    id: str
    original_name: str
    path: str
    size: int
    page_count: int | None
    mime_type: str
    uploaded_at: str


class SessionManager:
    """
    Manages per-session temporary storage and metadata.
    """

    def __init__(self, temp_dir: str | Path | None = None) -> None:
        base_dir = Path(temp_dir or current_app.config["TEMP_DIR"]).resolve()
        self.base_dir = base_dir
        self.sessions_root = self.base_dir / "sessions"
        self.jobs_root = self.base_dir / "jobs"
        self.sessions_root.mkdir(parents=True, exist_ok=True)
        self.jobs_root.mkdir(parents=True, exist_ok=True)

    def create_session_dir(self, session_id: str) -> Path:
        """
        Create session directory structure and return the session root path.
        """
        session_dir = self.sessions_root / session_id
        (session_dir / "files").mkdir(parents=True, exist_ok=True)
        (session_dir / "thumbnails").mkdir(parents=True, exist_ok=True)
        self._metadata_file(session_id).parent.mkdir(
            parents=True,
            exist_ok=True,
        )
        if not self._metadata_file(session_id).exists():
            self._write_metadata(session_id, {})
        logger.info(
            "session.dir_created",
            session_id=session_id,
            path=str(session_dir),
        )
        return session_dir

    def register_file(
        self,
        session_id: str,
        file_id: str,
        metadata: dict[str, Any],
    ) -> FileRecord:
        """
        Register file metadata in the session index.
        """
        self.create_session_dir(session_id)
        stored = self._read_metadata(session_id)

        record = FileRecord(
            id=file_id,
            original_name=str(metadata["original_name"]),
            path=str(Path(metadata["path"]).resolve()),
            size=int(metadata["size"]),
            page_count=(
                int(metadata["page_count"])
                if metadata.get("page_count") is not None
                else None
            ),
            mime_type=str(metadata["mime_type"]),
            uploaded_at=str(
                metadata.get("uploaded_at") or datetime.now(UTC).isoformat()
            ),
        )
        stored[file_id] = asdict(record)
        self._write_metadata(session_id, stored)

        logger.info(
            "session.file_registered",
            session_id=session_id,
            file_id=file_id,
            path=record.path,
            size=record.size,
        )
        return record

    def get_file(self, session_id: str, file_id: str) -> FileRecord | None:
        """
        Get file metadata by ID.
        """
        stored = self._read_metadata(session_id)
        data = stored.get(file_id)
        if not data:
            return None
        return FileRecord(**data)

    def list_files(self, session_id: str) -> list[FileRecord]:
        """
        List all files in a session.
        """
        stored = self._read_metadata(session_id)
        files = [FileRecord(**item) for item in stored.values()]
        files.sort(key=lambda item: item.uploaded_at)
        return files

    def delete_file(self, session_id: str, file_id: str) -> bool:
        """
        Delete file and associated thumbnails from a session.
        """
        stored = self._read_metadata(session_id)
        data = stored.get(file_id)
        if not data:
            return False

        record = FileRecord(**data)
        file_path = Path(record.path)
        deleted_any = False

        try:
            if file_path.exists():
                file_path.unlink()
                deleted_any = True
        except Exception as exc:
            logger.warning(
                "session.file_delete_failed",
                session_id=session_id,
                file_id=file_id,
                path=str(file_path),
                error=str(exc),
            )

        thumbs_dir = self._thumbnails_dir(session_id) / file_id
        if thumbs_dir.exists():
            for item in thumbs_dir.glob("*"):
                try:
                    item.unlink()
                    deleted_any = True
                except Exception as exc:
                    logger.warning(
                        "session.thumbnail_delete_failed",
                        session_id=session_id,
                        file_id=file_id,
                        path=str(item),
                        error=str(exc),
                    )
            try:
                thumbs_dir.rmdir()
            except OSError:
                pass

        stored.pop(file_id, None)
        self._write_metadata(session_id, stored)

        logger.info(
            "session.file_deleted",
            session_id=session_id,
            file_id=file_id,
        )
        return deleted_any or True

    def get_session_size(self, session_id: str) -> int:
        """
        Get total session size in bytes for registered files.
        """
        total = 0
        for record in self.list_files(session_id):
            total += record.size
        return total

    def check_session_quota(self, session_id: str) -> bool:
        """
        Check whether session is within configured quota constraints.
        """
        max_session_size_bytes = (
            int(current_app.config["MAX_SESSION_SIZE_MB"]) * 1024 * 1024
        )
        max_files = int(current_app.config["MAX_FILES_PER_SESSION"])

        files = self.list_files(session_id)
        current_size = sum(item.size for item in files)

        within_quota = (
            len(files) <= max_files
            and current_size <= max_session_size_bytes
        )
        logger.info(
            "session.quota_checked",
            session_id=session_id,
            file_count=len(files),
            total_size=current_size,
            within_quota=within_quota,
        )
        return within_quota

    def session_files_dir(self, session_id: str) -> Path:
        """
        Return physical files directory for a session.
        """
        return self.create_session_dir(session_id) / "files"

    def session_thumbnail_dir(self, session_id: str, file_id: str) -> Path:
        """
        Return physical thumbnail directory for a specific file in a session.
        """
        path = self._thumbnails_dir(session_id) / file_id
        path.mkdir(parents=True, exist_ok=True)
        return path

    def _metadata_file(self, session_id: str) -> Path:
        return self.sessions_root / session_id / "metadata.json"

    def _thumbnails_dir(self, session_id: str) -> Path:
        path = self.sessions_root / session_id / "thumbnails"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def _read_metadata(self, session_id: str) -> dict[str, dict[str, Any]]:
        metadata_file = self._metadata_file(session_id)
        if not metadata_file.exists():
            return {}
        try:
            return json.loads(metadata_file.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.warning(
                "session.metadata_read_failed",
                session_id=session_id,
                path=str(metadata_file),
                error=str(exc),
            )
            return {}

    def _write_metadata(
        self,
        session_id: str,
        payload: dict[str, dict[str, Any]],
    ) -> None:
        metadata_file = self._metadata_file(session_id)
        metadata_file.parent.mkdir(parents=True, exist_ok=True)
        metadata_file.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
