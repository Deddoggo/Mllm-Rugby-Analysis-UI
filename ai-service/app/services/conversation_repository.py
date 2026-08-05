"""Atomic filesystem persistence for clip-scoped analysis conversations."""

import json
import os
import re
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from pydantic import ValidationError

from app.core.config import settings
from app.schemas.analysis import (
    AnswerMode,
    ConversationMessage,
    ConversationMessageMetadata,
    ConversationRecord,
    ProviderMetadata,
)


SAFE_ID = re.compile(r"^[A-Za-z0-9_-]+$")


class ConversationRepositoryError(RuntimeError):
    """Raised when persisted conversation data is invalid or unavailable."""


class ConversationRepository:
    """Store one conversation document per video and persistent clip."""

    def __init__(self, conversations_dir: Path = settings.conversations_dir) -> None:
        self.conversations_dir = conversations_dir.resolve()
        self._lock = threading.RLock()

    def get(
        self,
        video_id: str,
        event_id: str,
        clip_id: str,
    ) -> ConversationRecord | None:
        self._validate_id(event_id)
        path = self._path(video_id, clip_id)
        with self._lock:
            if not path.is_file():
                return None
            try:
                conversation = ConversationRecord.model_validate_json(
                    path.read_text(encoding="utf-8")
                )
            except (OSError, ValueError, ValidationError) as error:
                raise ConversationRepositoryError(
                    "Conversation history is malformed or unavailable."
                ) from error
            if (
                conversation.video_id != video_id
                or conversation.event_id != event_id
                or conversation.clip_id != clip_id
            ):
                raise ConversationRepositoryError(
                    "Conversation history does not match the requested clip."
                )
            return conversation

    def append_turn(
        self,
        *,
        video_id: str,
        event_id: str,
        clip_id: str,
        question: str,
        answer: str,
        provider: str,
        provider_metadata: ProviderMetadata,
        mode: AnswerMode = "detailed",
    ) -> ConversationRecord:
        with self._lock:
            conversation = self.get(video_id, event_id, clip_id)
            if conversation is None:
                conversation = ConversationRecord(
                    conversation_id=f"conv_{uuid.uuid4().hex[:12]}",
                    video_id=video_id,
                    event_id=event_id,
                    clip_id=clip_id,
                    messages=[],
                )
            created_at = datetime.now(timezone.utc)
            conversation.messages.extend([
                ConversationMessage(
                    role="user",
                    content=question,
                    created_at=created_at,
                ),
                ConversationMessage(
                    role="assistant",
                    content=answer,
                    provider=provider,
                    provider_metadata=provider_metadata,
                    metadata=ConversationMessageMetadata(mode=mode),
                    created_at=datetime.now(timezone.utc),
                ),
            ])
            self._write_atomic(self._path(video_id, clip_id), conversation)
            return conversation

    def delete(self, video_id: str, event_id: str, clip_id: str) -> bool:
        """Delete only the selected clip's conversation; missing files are success."""
        self._validate_id(event_id)
        path = self._path(video_id, clip_id)
        with self._lock:
            if not path.exists():
                return False
            conversation = self.get(video_id, event_id, clip_id)
            if conversation is None:
                return False
            try:
                path.unlink()
            except OSError as error:
                raise ConversationRepositoryError(
                    "Conversation history could not be deleted."
                ) from error
            return True

    def empty(
        self,
        video_id: str,
        event_id: str,
        clip_id: str,
    ) -> ConversationRecord:
        self._validate_id(video_id)
        self._validate_id(event_id)
        self._validate_id(clip_id)
        return ConversationRecord(
            conversation_id="",
            video_id=video_id,
            event_id=event_id,
            clip_id=clip_id,
            messages=[],
        )

    def _path(self, video_id: str, clip_id: str) -> Path:
        self._validate_id(video_id)
        self._validate_id(clip_id)
        path = (self.conversations_dir / video_id / f"{clip_id}.json").resolve()
        if not path.is_relative_to(self.conversations_dir):
            raise ValueError("Invalid conversation path.")
        return path

    def _write_atomic(self, path: Path, conversation: ConversationRecord) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
        try:
            temporary.write_text(
                json.dumps(
                    conversation.model_dump(mode="json"),
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding="utf-8",
            )
            os.replace(temporary, path)
        except OSError as error:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass
            raise ConversationRepositoryError(
                "Conversation history could not be saved."
            ) from error

    @staticmethod
    def _validate_id(value: str) -> None:
        if not SAFE_ID.fullmatch(value):
            raise ValueError("Invalid conversation identifier.")
