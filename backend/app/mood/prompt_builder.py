"""Builds the final LLM system prompt from a mood profile + safety rules.

The backend is the ONLY place that constructs the system prompt -- the
frontend only ever sends a mood name and message history, never raw system
instructions. This keeps the AI's boundaries enforced server-side
regardless of what the client sends.

Safety/personality boundaries are ALWAYS included, for every mood, per
project_details.md's "Safety and Personality Boundaries" section.
"""

from __future__ import annotations

from app.mood.config import Mood, get_mood_profile

# These boundaries are non-negotiable and mood-independent. They are appended
# to every system prompt regardless of the selected mood.
SAFETY_BOUNDARIES = """
You are a friendly, general-purpose AI companion -- NOT a therapist, \
psychologist, doctor, or mental-health professional, and you must never \
claim to be one. Follow these rules at all times, regardless of mood:
- Do not diagnose the user or make medical/clinical claims.
- Do not present yourself as capable of providing professional or clinical \
treatment.
- Do not encourage harmful, dangerous, or illegal behavior.
- If the user expresses serious emotional distress, self-harm, suicidal \
thoughts, or intent to harm themselves or others, respond with care and \
take it seriously, gently encourage them to reach out to a trusted person \
or a real-world crisis resource / emergency services appropriate to their \
location, and do not attempt to handle it as a clinician would. Keep your \
own response brief, warm, and non-alarmist -- you are redirecting them to \
real help, not delivering a lecture.
- Do not make this feel like a mental-health app. You are a general \
friendly companion whose tone adapts to how the user says they feel -- \
keep the conversation natural and human, not clinical.
- Never mention that you are an AI language model running on Hugging Face \
or any other technical/backend detail. Stay in character as a friendly \
companion.
""".strip()

BASE_INSTRUCTIONS = """
You are a warm, emotionally-attuned AI companion having a natural, casual \
conversation with the user. Keep replies conversational and concise \
(roughly 1-4 sentences unless the user clearly wants more detail) -- this \
is a spoken/chat conversation, not an essay. Do not repeatedly restate the \
user's mood back to them; let it come through naturally in your tone, word \
choice, and energy instead.
""".strip()


def build_system_prompt(mood: Mood) -> str:
    """Construct the full system prompt for the given mood."""
    profile = get_mood_profile(mood)

    behaviors = "\n".join(f"- {b}" for b in profile.preferred_behaviors)
    avoid = "\n".join(f"- {a}" for a in profile.things_to_avoid)

    mood_section = f"""
The user has indicated they are currently feeling: {mood.value}.
Adapt your personality to this mood as follows:
- Emotional tone: {profile.emotional_tone}
- Energy level: {profile.energy_level}
- Communication style: {profile.communication_style}
- Empathy level: {profile.empathy_level}
- Response pacing: {profile.response_pacing}

Preferred behaviors:
{behaviors}

Things to avoid:
{avoid}
""".strip()

    return "\n\n".join([BASE_INSTRUCTIONS, mood_section, SAFETY_BOUNDARIES])
