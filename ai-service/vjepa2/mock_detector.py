"""Deterministic mock proposals used until the rugby V-JEPA2 model is available."""

import hashlib
import random

from vjepa2.contracts import EventProposal


class MockVJEPA2Detector:
    """Generate stable, non-overlapping rugby proposals within video duration."""

    name = "mock-vjepa2"
    labels = ("Scrum", "Lineout", "Maul", "Goal Kick")

    def detect_events(
        self,
        video_path: str,
        video_id: str,
        duration: float,
    ) -> list[EventProposal]:
        del video_path  # The real adapter will inspect this processed video path.
        if duration <= 0:
            return []

        seed = int.from_bytes(hashlib.sha256(video_id.encode("utf-8")).digest()[:8])
        randomizer = random.Random(seed)
        maximum_count = min(6, int(duration // 10))
        if maximum_count == 0:
            return []
        count = maximum_count if maximum_count < 3 else randomizer.randint(3, maximum_count)
        slot = duration / count
        events: list[EventProposal] = []

        for index in range(count):
            preferred_length = randomizer.uniform(10, 20)
            event_length = min(preferred_length, slot, duration)
            event_length = max(min(event_length, 60), min(2, duration))
            slot_start = index * slot
            available_offset = max(0, slot - event_length)
            start = slot_start + randomizer.uniform(0.15, 0.85) * available_offset
            end = min(duration, start + event_length)
            start = round(max(0, start), 3)
            end = round(max(start + 0.001, end), 3)
            label = self.labels[(index + randomizer.randrange(len(self.labels))) % len(self.labels)]
            confidence = round(randomizer.uniform(0.80, 0.96), 3)
            events.append(
                {
                    "id": f"event_{index + 1:03d}",
                    "video_id": video_id,
                    "label": label,
                    "start": start,
                    "end": end,
                    "confidence": confidence,
                    "detected_start": start,
                    "detected_end": end,
                    "adjusted": False,
                }
            )
        return events
