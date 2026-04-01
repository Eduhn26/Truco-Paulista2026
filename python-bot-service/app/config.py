from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for the Python bot service."""

    service_name: str = Field(default='truco-paulista-python-bot')
    app_env: str = Field(default='development')
    host: str = Field(default='0.0.0.0')
    port: int = Field(default=8000)

    model_config = SettingsConfigDict(
        env_file='.env',
        env_file_encoding='utf-8',
        extra='ignore',
    )


settings = Settings()