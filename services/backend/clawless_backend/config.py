from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="CLAWLESS_")

    api_key: str = ""
    anthropic_api_key: str = ""
    haiku_model: str = "claude-haiku-4-5-20251001"
    sonnet_model: str = "claude-sonnet-4-6"

    host: str = "127.0.0.1"
    port: int = 8787

    cors_origins: list[str] = [
        "tauri://localhost",
        "http://tauri.localhost",
        "http://localhost:1420",
    ]


settings = Settings()
