"""Decide whether a transcript is something Mitra should act on.

Whisper never says "I don't know": on silence, noise or mumbling it returns
either a well-known hallucination ("Thank you.", "you") or a fragment in some
other script. Mitra must not feed those to the LLM as if the user said them.
This module flags such transcripts so the voice route can ask the user to
repeat themselves instead.
"""

from __future__ import annotations

import random
import re
import unicodedata

# Phrases Whisper is known to produce for near-silent or unintelligible audio.
_HALLUCINATIONS = {
    "thank you",
    "thank you very much",
    "thanks for watching",
    "thank you for watching",
    "please subscribe",
    "subscribe",
    "you",
    "bye",
    "the end",
    "so",
    "oh",
    "hmm",
    "hm",
    "uh",
    "um",
}

# Whole-transcript stage directions and noise markers: "[Music]", "(laughs)", "*sigh*".
_ONLY_MARKERS_RE = re.compile(r"^[\s\[\]\(\)\*♪♫.,!?…-]*(?:\[[^\]]*\]|\([^)]*\)|\*[^*]*\*|♪+)?[\s\[\]\(\)\*♪♫.,!?…-]*$")

# Spoken when we could not make out what the user said. Rotated so it never
# sounds like an error message; keep every line short and warm.
REPEAT_REQUESTS = (
    "Sorry, I didn't quite catch that. Could you say it again?",
    "I missed that — could you repeat it for me?",
    "Sorry, that didn't come through clearly. One more time?",
    "I didn't get that. Could you say it once more?",
)

# Ratio of letters outside the Latin script above which we assume Whisper
# decoded the wrong language rather than the user having said something.
_MAX_NON_LATIN_RATIO = 0.3


def _letters(text: str) -> list[str]:
    return [ch for ch in text if ch.isalpha()]


def _is_latin(ch: str) -> bool:
    try:
        return "LATIN" in unicodedata.name(ch)
    except ValueError:
        return False


def is_intelligible(text: str) -> bool:
    """True if `text` looks like real English speech worth sending to the model."""
    cleaned = text.strip()
    if not cleaned or _ONLY_MARKERS_RE.match(cleaned):
        return False

    letters = _letters(cleaned)
    if len(letters) < 2:
        return False

    non_latin = sum(1 for ch in letters if not _is_latin(ch))
    if non_latin / len(letters) > _MAX_NON_LATIN_RATIO:
        return False

    normalized = re.sub(r"[^a-z\s]", "", cleaned.lower())
    normalized = re.sub(r"\s+", " ", normalized).strip()
    if normalized in _HALLUCINATIONS:
        return False

    return True


def repeat_request() -> str:
    """A random, polite request to say it again."""
    return random.choice(REPEAT_REQUESTS)
