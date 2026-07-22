from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for the Python bot service."""

    service_name: str = Field(default='truco-paulista-python-bot', min_length=1)
    service_version: str = Field(default='0.2.0', min_length=1)

    app_env: Literal['development', 'test', 'production'] = Field(default='development')
    host: str = Field(default='0.0.0.0', min_length=1)
    port: int = Field(default=8000, ge=1, le=65535)

    log_level: Literal['DEBUG', 'INFO', 'WARNING', 'ERROR'] = Field(default='INFO')
    expose_docs: bool = Field(default=True)

    ml_shadow_enabled: bool = Field(
        default=False
    )
    ml_model_path: str = Field(
        default=(
            'ml-artifacts/'
            'candidate-v1/'
            'truco-hand-win-random-forest.joblib'
        ),
        min_length=1,
    )

    model_config = SettingsConfigDict(
        env_file='.env',
        env_file_encoding='utf-8',
        extra='ignore',
    )

    @property
    def docs_enabled(self) -> bool:
        return self.app_env != 'production' and self.expose_docs


settings = Settings()