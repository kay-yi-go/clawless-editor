from anthropic import AsyncAnthropic

from .config import settings


def _client() -> AsyncAnthropic:
    if not settings.anthropic_api_key:
        raise RuntimeError("CLAWLESS_ANTHROPIC_API_KEY not configured")
    return AsyncAnthropic(api_key=settings.anthropic_api_key)


async def haiku_complete(system: str, user: str, max_tokens: int = 256) -> str:
    client = _client()
    msg = await client.messages.create(
        model=settings.haiku_model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    parts = [b.text for b in msg.content if getattr(b, "type", None) == "text"]
    return "".join(parts).strip()


async def sonnet_complete(system: str, user: str, max_tokens: int = 1024) -> str:
    client = _client()
    msg = await client.messages.create(
        model=settings.sonnet_model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    parts = [b.text for b in msg.content if getattr(b, "type", None) == "text"]
    return "".join(parts).strip()
