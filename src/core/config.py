from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    app_name: str = "Research Copilot"
    app_version: str = "0.1.0"
    debug: bool = False
    
    # Server configuration
    host: str = "0.0.0.0"
    port: int = 8000
    
    # SQLite Database configuration
    data_dir: Path = Path("./data")
    database_url: str = "sqlite+aiosqlite:///./data/research_copilot.db"
    
    # External API Keys & Endpoints
    openalex_email: Optional[str] = "researcher@example.com"
    arxiv_base_url: str = "https://export.arxiv.org/api/query"
    openalex_base_url: str = "https://api.openalex.org"
    europepmc_base_url: str = "https://www.ebi.ac.uk/europepmc/webservices/rest"
    crossref_base_url: str = "https://api.crossref.org"
    
    # LLM Provider Configuration
    default_llm_provider: str = "openrouter"
    openrouter_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None
    ollama_base_url: str = "http://localhost:11434"
    
    # Graph & Loop Execution limits
    max_loop_iterations: int = 10
    default_rank_limit: int = 25
    max_rank_limit: int = 100
    default_full_text_top: int = 5
    default_expand_citations: int = 2

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
# Ensure data directory exists
settings.data_dir.mkdir(parents=True, exist_ok=True)
