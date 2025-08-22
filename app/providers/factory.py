import os
from typing import Optional

from .base import LLMProvider
from .mock import MockLLMProvider

try:
    from .openai_provider import OpenAILLMProvider  # type: ignore
except Exception:  # pragma: no cover
    OpenAILLMProvider = None  # type: ignore


def create_provider(provider: Optional[str], model: Optional[str], role: str) -> LLMProvider:
    # role-aware env fallbacks
    prov_env = os.getenv("AI_PROVIDER") if role == "ai" else os.getenv("MC_PROVIDER")
    model_env = os.getenv("AI_MODEL") if role == "ai" else os.getenv("MC_MODEL")
    name = (provider or prov_env or "mock").lower()
    mdl = model or model_env or "gpt-4o-mini"
    if name in {"openai", "oai"} and OpenAILLMProvider is not None and os.getenv("OPENAI_API_KEY"):
        return OpenAILLMProvider(model=mdl, role=role)
    # fallback
    return MockLLMProvider()
