# ============================================================
# backend/ai/cache.py — AI Response Caching
# ============================================================
# Caches Gemini responses by prompt hash to avoid duplicate
# API calls (and save money). Uses MongoDB for persistence.
# ============================================================

import hashlib
from datetime import datetime, timedelta, timezone

from motor.motor_asyncio import AsyncIOMotorCollection

from core.database import get_database


class AiCache:
    """
    Simple hash-based cache for AI responses.
    Stored in the 'ai_cache' MongoDB collection.

    Schema:
        {
            "_id": "<sha256 of prompt>",
            "response": "<AI response text>",
            "created_at": datetime,
            "ttl": datetime   # MongoDB TTL index auto-deletes after 7 days
        }
    """

    TTL_DAYS = 7

    def _collection(self) -> AsyncIOMotorCollection:
        return get_database()["ai_cache"]

    @staticmethod
    def _hash(prompt: str) -> str:
        return hashlib.sha256(prompt.encode()).hexdigest()

    async def get(self, prompt: str) -> str | None:
        doc = await self._collection().find_one({"_id": self._hash(prompt)})
        if doc:
            return doc.get("response")
        return None

    async def set(self, prompt: str, response: str) -> None:
        await self._collection().update_one(
            {"_id": self._hash(prompt)},
            {
                "$set": {
                    "response": response,
                    "created_at": datetime.now(timezone.utc),
                    "ttl": datetime.now(timezone.utc) + timedelta(days=self.TTL_DAYS),
                }
            },
            upsert=True,
        )

    async def ensure_indexes(self) -> None:
        """Create a TTL index so old cache entries auto-expire."""
        await self._collection().create_index("ttl", expireAfterSeconds=0)
