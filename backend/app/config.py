from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel


PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
WEB_ROOT = Path(__file__).resolve().parent.parent.parent
BACKEND_ROOT = Path(__file__).resolve().parent.parent

load_dotenv(BACKEND_ROOT / ".env")


class ModuleConfig(BaseModel):
    key: str
    name: str
    repo: str
    workflow: str
    project_dir: Path

    class Config:
        arbitrary_types_allowed = True


class Settings(BaseModel):
    github_token: str = ""
    github_owner: str = ""
    cors_allow_origin: str = "*"
    auth_token: str = ""
    web_root: Path = WEB_ROOT
    data_dir: Path = WEB_ROOT / "data"
    runs_dir: Path = WEB_ROOT / "data" / "runs"
    modules: dict[str, ModuleConfig] = {}

    class Config:
        arbitrary_types_allowed = True


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    settings = Settings(
        github_token=os.getenv("GITHUB_TOKEN", ""),
        github_owner=os.getenv("GITHUB_OWNER", ""),
        cors_allow_origin=os.getenv("CORS_ALLOW_ORIGIN", "*"),
        auth_token=os.getenv("AUTH_TOKEN", ""),
    )

    settings.modules = {
        "trading_pal": ModuleConfig(
            key="trading_pal",
            name="Trading Pal",
            repo=os.getenv("TRADING_PAL_REPO", "trading_pal"),
            workflow=os.getenv("TRADING_PAL_WORKFLOW", "trading.yml"),
            project_dir=PROJECT_ROOT / "trading_pal",
        ),
        "option_pal": ModuleConfig(
            key="option_pal",
            name="Option Pal",
            repo=os.getenv("OPTION_PAL_REPO", "option_pay"),
            workflow=os.getenv("OPTION_PAL_WORKFLOW", "options_scanner.yml"),
            project_dir=PROJECT_ROOT / "option_pal",
        ),
        "heartbeat_pal": ModuleConfig(
            key="heartbeat_pal",
            name="Heartbeat Pal",
            repo=os.getenv("HEARTBEAT_PAL_REPO", "heartbeat_pal"),
            workflow=os.getenv("HEARTBEAT_PAL_WORKFLOW", "scan.yml"),
            project_dir=PROJECT_ROOT / "heartbeat_pal",
        ),
    }

    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.runs_dir.mkdir(parents=True, exist_ok=True)
    for key in settings.modules:
        (settings.runs_dir / key).mkdir(parents=True, exist_ok=True)

    return settings
