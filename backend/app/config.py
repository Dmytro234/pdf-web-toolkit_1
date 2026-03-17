from __future__ import annotations

import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BASE_DIR.parent


def _get_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _get_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return int(raw)


def _get_list(name: str, default: list[str]) -> list[str]:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return list(default)
    return [item.strip() for item in raw.split(",") if item.strip()]


class BaseConfig:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-me")

    SESSION_COOKIE_NAME = os.getenv("SESSION_COOKIE_NAME", "pdf_web_toolkit_session")
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = os.getenv("SESSION_COOKIE_SAMESITE", "Lax")
    SESSION_COOKIE_SECURE = _get_bool("SESSION_COOKIE_SECURE", False)
    PERMANENT_SESSION_LIFETIME = _get_int("PERMANENT_SESSION_LIFETIME_SECONDS", 60 * 60 * 6)

    JSON_SORT_KEYS = False

    MAX_CONTENT_LENGTH = _get_int("MAX_CONTENT_LENGTH_MB", 100) * 1024 * 1024
    MAX_FILE_SIZE_MB = _get_int("MAX_FILE_SIZE_MB", 50)

    MAX_SESSION_SIZE_MB = _get_int("MAX_SESSION_SIZE_MB", 1000)
    MAX_FILES_PER_SESSION = _get_int("MAX_FILES_PER_SESSION", 200)

    TEMP_DIR = str((BASE_DIR / "temp").resolve())
    UPLOAD_DIR = str((BASE_DIR / "uploads").resolve())
    THUMBNAIL_DIR = str((BASE_DIR / "thumbnails").resolve())
    JOBS_DIR = str((BASE_DIR / "jobs").resolve())

    RATE_LIMIT_STORAGE_URI = os.getenv("RATE_LIMIT_STORAGE_URI", "memory://")

    CORS_ORIGINS = _get_list(
        "CORS_ORIGINS",
        [
            "http://localhost:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:5174",
        ],
    )

    PDF_THUMBNAIL_WIDTH = _get_int("PDF_THUMBNAIL_WIDTH", 150)
    PDF_THUMBNAIL_HEIGHT = _get_int("PDF_THUMBNAIL_HEIGHT", 200)

    SESSION_TYPE = os.getenv("SESSION_TYPE", "filesystem")
    SESSION_PERMANENT = False
    SESSION_USE_SIGNER = True
    SESSION_FILE_DIR = str((BASE_DIR / "flask_session").resolve())
    SESSION_FILE_THRESHOLD = _get_int("SESSION_FILE_THRESHOLD", 500)

    TESTING = False
    DEBUG = False

    @classmethod
    def init_app(cls, app) -> None:
        Path(cls.TEMP_DIR).mkdir(parents=True, exist_ok=True)
        Path(cls.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
        Path(cls.THUMBNAIL_DIR).mkdir(parents=True, exist_ok=True)
        Path(cls.JOBS_DIR).mkdir(parents=True, exist_ok=True)
        Path(cls.SESSION_FILE_DIR).mkdir(parents=True, exist_ok=True)


class DevelopmentConfig(BaseConfig):
    DEBUG = True
    ENV = "development"


class ProductionConfig(BaseConfig):
    DEBUG = False
    ENV = "production"
    SESSION_COOKIE_SECURE = _get_bool("SESSION_COOKIE_SECURE", True)


class TestingConfig(BaseConfig):
    TESTING = True
    DEBUG = True
    ENV = "testing"
    SECRET_KEY = "testing-secret-key"

    TEMP_DIR = str((BASE_DIR / "temp_test").resolve())
    UPLOAD_DIR = str((BASE_DIR / "uploads_test").resolve())
    THUMBNAIL_DIR = str((BASE_DIR / "thumbnails_test").resolve())
    JOBS_DIR = str((BASE_DIR / "jobs_test").resolve())
    SESSION_FILE_DIR = str((BASE_DIR / "flask_session_test").resolve())

    MAX_FILE_SIZE_MB = 50
    MAX_SESSION_SIZE_MB = 50
    MAX_FILES_PER_SESSION = 5


config_by_name = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
}