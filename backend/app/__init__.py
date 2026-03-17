from __future__ import annotations

import os
from typing import Optional

import structlog
from flask import Flask, jsonify
from flask.typing import ResponseReturnValue

from .config import DevelopmentConfig, ProductionConfig, TestingConfig
from .extensions import cors, limiter, server_session


log = structlog.get_logger(__name__)


def _pick_config() -> type:
    flask_env = os.getenv("FLASK_ENV", "development").strip().lower()

    if flask_env == "production":
        return ProductionConfig

    if flask_env == "testing":
        return TestingConfig

    return DevelopmentConfig


def _safe_register_blueprint(app: Flask, module_path: str, blueprint_name: str) -> None:
    try:
        module = __import__(module_path, fromlist=[blueprint_name])
        blueprint = getattr(module, blueprint_name)
        app.register_blueprint(blueprint)

        log.info(
            "blueprint.registered",
            module=module_path,
            blueprint=blueprint_name,
        )
    except Exception as error:
        log.warning(
            "blueprint.missing_or_failed",
            module=module_path,
            blueprint=blueprint_name,
            error=str(error),
        )


def create_app(config_class: Optional[type] = None) -> Flask:
    app = Flask(__name__)

    selected_config = config_class or _pick_config()
    app.config.from_object(selected_config)

    structlog.configure(
        processors=[
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.add_log_level,
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ]
    )

    selected_config.init_app(app)

    allowed_origins = app.config.get(
        "CORS_ORIGINS",
        [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5174",
        ],
    )

    cors.init_app(
        app,
        resources={
            r"/api/*": {
                "origins": allowed_origins,
            }
        },
        supports_credentials=True,
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=[
            "Content-Type",
            "Authorization",
            "X-Requested-With",
            "Accept",
            "Origin",
        ],
        expose_headers=[
            "Content-Disposition",
            "Content-Type",
            "Content-Length",
        ],
    )

    server_session.init_app(app)
    limiter.init_app(app)

    @app.get("/api/health")
    def health() -> ResponseReturnValue:
        return jsonify(
            {
                "ok": True,
                "env": os.getenv("FLASK_ENV", "development"),
                "cors_origins": allowed_origins,
            }
        )

    @app.errorhandler(413)
    def handle_file_too_large(_error: Exception) -> ResponseReturnValue:
        return (
            jsonify(
                {
                    "ok": False,
                    "error": {
                        "code": "FILE_TOO_LARGE",
                        "message": "File exceeds max size",
                    },
                }
            ),
            413,
        )

    @app.errorhandler(429)
    def handle_rate_limited(_error: Exception) -> ResponseReturnValue:
        return (
            jsonify(
                {
                    "ok": False,
                    "error": {
                        "code": "RATE_LIMITED",
                        "message": "Too many requests",
                    },
                }
            ),
            429,
        )

    @app.errorhandler(404)
    def handle_not_found(_error: Exception) -> ResponseReturnValue:
        return (
            jsonify(
                {
                    "ok": False,
                    "error": {
                        "code": "NOT_FOUND",
                        "message": "Endpoint not found",
                    },
                }
            ),
            404,
        )

    @app.errorhandler(500)
    def handle_internal_server_error(_error: Exception) -> ResponseReturnValue:
        return (
            jsonify(
                {
                    "ok": False,
                    "error": {
                        "code": "INTERNAL_SERVER_ERROR",
                        "message": "Unexpected server error",
                    },
                }
            ),
            500,
        )

    _safe_register_blueprint(app, "app.routes.session", "session_bp")
    _safe_register_blueprint(app, "app.routes.merge", "merge_bp")
    _safe_register_blueprint(app, "app.routes.split", "split_bp")
    _safe_register_blueprint(app, "app.routes.edit", "edit_bp")
    _safe_register_blueprint(app, "app.routes.compress", "compress_bp")
    _safe_register_blueprint(app, "app.routes.extract", "extract_bp")
    _safe_register_blueprint(app, "app.routes.delete_pages", "delete_pages_bp")
    _safe_register_blueprint(app, "app.routes.convert", "convert_bp")
    _safe_register_blueprint(app, "app.routes.crop", "crop_bp")
    _safe_register_blueprint(app, "app.routes.align", "align_bp")

    log.info(
        "app.created",
        environment=os.getenv("FLASK_ENV", "development"),
        cors_origins=allowed_origins,
    )

    return app