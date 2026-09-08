# Claude Code Implementation Prompt — Mood-Based AI Voice Companion

You are going to build a complete personal AI companion web application from scratch.

The application is a simple conversational AI companion that allows a user to select their current mood and then communicate with the AI through both text and voice. The AI must adapt its personality, emotional tone, and response style according to the mood selected by the user.

This is a personal MVP, not a multi-user SaaS product. Do not introduce authentication, persistent user accounts, databases, long-term memory, multiple conversation management, file uploads, or unnecessary infrastructure.

## Core Product

The application should provide a friendly AI companion experience.

When the user opens the application, they should first be able to select how they currently feel. The available moods must include:

Happy, Sad, Angry, Stressed, Anxious, Excited, Lonely, and Neutral.

After selecting a mood, the user enters the conversation screen. The selected mood becomes the emotional context for the entire conversation and controls how the AI communicates.

The AI should remain a friendly conversational companion rather than presenting itself as a therapist, medical professional, psychologist, or mental-health expert.

The AI should not simply mention the selected mood in every response. Instead, the mood should influence the underlying system prompt and therefore naturally influence vocabulary, empathy, energy, sentence structure, enthusiasm, warmth, and conversational behavior.

For example, a user selecting "Happy" should receive an energetic and positive conversational style, while a user selecting "Sad" should receive a gentle, patient, warm, supportive style. An "Angry" mood should produce a calm and non-confrontational personality. "Excited" should produce a more energetic and enthusiastic personality. "Neutral" should use a balanced friendly personality.

Do not make the responses excessively therapeutic or repetitive. The application should feel like talking to a friendly AI companion.

## Important Hugging Face Constraint

The AI functionality must use Hugging Face-hosted inference rather than running the models locally.

The local development machine should not need to run the LLM, STT, or TTS models.

The application must use a Hugging Face access token stored securely as an environment variable and must never expose that token to the frontend.

Use Hugging Face's current Inference Providers/API architecture rather than implementing an outdated Hugging Face API integration.

Hugging Face currently provides free monthly inference credits for Free users, but those credits are limited and usage beyond the included credits requires payment. Therefore, implement the application as a no-paid-API MVP: it must never automatically purchase credits, and it must gracefully report an appropriate error when the free Hugging Face allowance or provider availability is exhausted.

Do not claim or implement unlimited free Hugging Face inference.

The model selection must be based on models that are currently suitable and available through Hugging Face's inference infrastructure at implementation time.

Do not blindly hard-code an old model merely because it appears in an example or tutorial. Verify the current Hugging Face model/provider availability before finalizing the model configuration.

## LLM Requirements

Select the most appropriate currently available Hugging Face conversational/instruction model for this application.

The model must prioritize:

1. Good conversational quality.
2. Good instruction following.
3. Natural and friendly responses.
4. Reasonable latency.
5. Suitability for short conversational interactions.
6. Availability through Hugging Face Inference Providers.
7. Compatibility with the project's no-paid-API MVP constraint.
8. Reasonable request/response size so the limited free allowance is not wasted unnecessarily.

Do not select a huge model simply because it has higher benchmark performance.

The user is developing on approximately:

16 GB RAM
Intel i5 11th generation CPU

However, the LLM will be remotely hosted through Hugging Face, so these hardware specifications must not be used as a reason to run the model locally.

Keep the selected model configurable through environment variables so that it can be replaced later without changing the application architecture.

## Speech-to-Text

The application must support voice input.

The user should be able to press a microphone button, speak, stop recording, and send the recorded audio to the backend.

The backend should send the audio to a suitable Hugging Face Automatic Speech Recognition model.

Use a current, suitable model such as OpenAI Whisper if it is available through the selected Hugging Face inference provider at implementation time. Hugging Face currently documents `openai/whisper-large-v3` as an available/recommended ASR model, but verify actual provider availability before final configuration.

The frontend must not directly communicate with Hugging Face for STT.

The flow must be:

Browser microphone → frontend audio recording → FastAPI backend → Hugging Face STT → transcribed text → conversational pipeline.

The implementation should use a browser-compatible recording format and ensure the backend can correctly process the uploaded audio.

Do not require the user to install any desktop application or browser extension.

Handle microphone permission denial gracefully.

Handle unsupported browsers and recording failures gracefully.

## Text-to-Speech

The application must also provide voice responses.

After the LLM generates a response, the backend should send the generated text to a suitable Hugging Face Text-to-Speech model.

Select the most appropriate currently available TTS model based on conversational voice quality, latency, availability, and free inference compatibility.

Keep the TTS model configurable through an environment variable.

The backend should return generated audio to the frontend in a browser-playable format.

The frontend should automatically play the AI response when voice mode is enabled.

The user must also be able to use the application without voice playback if they prefer text-only interaction during a session.

Do not require any paid TTS provider.

Do not add browser-native TTS as the primary implementation because the requirement is to use Hugging Face for TTS. A browser-native fallback may only be considered if the Hugging Face TTS service is temporarily unavailable, and it must be clearly separated from the primary Hugging Face implementation.

## Conversation Behavior

Each conversation starts fresh.

There must be no persistent conversation memory.

There must be no database.

The conversation history should exist only in the current browser session and be sent to the backend as needed for conversational context.

Do not implement long-term memory, embeddings, vector databases, RAG, ChromaDB, Redis, PostgreSQL, or any persistent storage.

The current conversation history should be kept within reasonable limits to prevent unnecessarily large Hugging Face requests.

Implement a configurable maximum conversation history/token strategy.

The system prompt containing the selected mood/personality must remain part of the conversational context.

The backend should be responsible for constructing the final LLM request rather than trusting the frontend to provide arbitrary system instructions.

## LangChain

Use LangChain from the beginning.

Do not introduce LangChain merely as decoration. Use it where it provides a clean abstraction around the conversational model/prompt pipeline.

The architecture should make it possible to replace the underlying Hugging Face model/provider later without rewriting the application's API layer.

Keep the LangChain integration isolated inside the AI/service layer.

Do not over-engineer the project with agents, tools, RAG, memory modules, vector stores, or complex chains because none of those are required for this MVP.

The initial AI pipeline should essentially be:

Selected mood → mood-specific system prompt → conversation context → Hugging Face chat model → response.

For voice:

Audio → Hugging Face STT → text → conversational pipeline → response text → Hugging Face TTS → audio.

## Streaming

Text responses should stream to the frontend progressively whenever the selected Hugging Face provider/model supports streaming.

The user should not have to wait for the complete response before seeing any text.

Use an appropriate HTTP streaming mechanism such as Server-Sent Events or another simple browser-compatible streaming approach.

Choose the implementation that works cleanly with FastAPI and the selected Hugging Face/LangChain integration.

Do not create an unnecessarily complicated WebSocket architecture unless there is a real technical requirement.

Voice generation can happen after the final response text is available unless the selected TTS architecture provides a reliable streaming mechanism.

The UI should clearly distinguish:

User is sending a message.

AI is generating a response.

AI has finished responding.

## Frontend

Use a modern frontend stack suitable for a responsive web application.

Use:

React
TypeScript
Vite
Tailwind CSS

Use a lightweight component approach and avoid unnecessary UI libraries unless there is a clear benefit.

The frontend should be designed for both desktop and mobile browsers.

The visual direction should be:

Minimal
Modern
Premium
Soft glassmorphism
Dark/futuristic but not overly cyberpunk
Clean typography
Subtle animations
Large floating AI orb/glob as the primary visual element

The orb is the central visual representation of the AI companion.

Do not use a complex 3D engine.

The orb should be achievable using normal web technologies such as CSS gradients, blur, shadows, pseudo-elements, SVG/CSS effects, or Canvas if genuinely useful.

Do not introduce WebGL/Three.js unless there is a strong reason.

The orb should have several visual states:

Idle
Listening
Thinking
Speaking
Error

The orb should subtly react to the selected mood.

Mood-based colors should be tasteful and restrained. Do not make the UI look like a generic neon cyberpunk interface.

The orb should have subtle floating/wavy animation while idle.

When listening, it should visibly react to microphone input or at least display a clear listening animation.

When thinking, it should have a subtle processing animation.

When speaking, it should have a stronger but smooth pulse/wave animation.

When an error occurs, the visual state should clearly communicate the failure without being visually aggressive.

## Initial Screen

The initial screen should focus on mood selection.

Present a simple welcome message from the AI companion.

Show the available moods as visually attractive selectable options.

The user must select one mood before entering the conversation.

The selected mood should be visually highlighted.

After mood selection, provide a clear action to start the conversation.

Do not require authentication or account creation.

## Conversation Screen

The conversation screen should contain:

The floating AI orb.

The current mood indicator.

The conversation messages.

A text input field.

A send button.

A microphone button.

Voice playback state.

A way to stop/cancel an active recording or response where technically appropriate.

Keep the interface visually clean.

Do not add unnecessary settings, dashboards, profiles, sidebars, conversation history panels, or account menus.

The application should feel like a focused AI companion rather than a full productivity application.

## Responsive Design

The application must work properly on:

Desktop browsers
Tablet-sized screens
Mobile browsers

Do not simply shrink the desktop UI.

Design the conversation controls specifically so that they remain comfortable to use with touch interaction.

The microphone button should be large enough for mobile interaction.

The orb should scale responsively without taking over the entire screen.

The message area should remain readable and usable on small screens.

## Backend

Use Python with FastAPI.

Use a clean production-oriented structure.

Separate:

API routes
Configuration
AI/LangChain logic
Hugging Face integration
Mood/personality logic
STT service
TTS service
Schemas
Error handling
Utilities

Do not put the entire application into one `main.py`.

Use Pydantic models for request/response validation.

Use environment variables for secrets and configurable model/provider settings.

At minimum, support environment variables similar to:

HF_TOKEN
HF_LLM_MODEL
HF_STT_MODEL
HF_TTS_MODEL
HF_PROVIDER
FRONTEND_ORIGIN
MAX_CONVERSATION_MESSAGES

Use appropriate names and structure if you determine better naming conventions.

Never commit `.env` files containing real secrets.

Provide a `.env.example`.

## API Design

Create clean APIs for:

Starting/initializing a conversation with a selected mood if required by the architecture.

Sending a text message and receiving a streamed AI response.

Uploading audio for STT.

Processing a voice conversation through STT → LLM → TTS.

Health checking the backend.

The exact endpoint structure is up to you, but keep it simple, RESTful where appropriate, and easy for the React frontend to consume.

Provide request and response schemas.

FastAPI's automatic OpenAPI/Swagger documentation should work correctly.

Do not expose the Hugging Face token through any API response.

## Mood System

Create a centralized mood configuration rather than scattering mood-specific logic throughout the application.

Each mood should define a consistent personality profile.

The configuration should contain the mood name and behavioral instructions for the AI.

For example, the configuration should be able to define things such as:

Overall emotional tone
Energy level
Communication style
Empathy level
Response pacing
Preferred conversational behavior
Things to avoid

The LLM should receive these instructions through a properly constructed system prompt.

Do not hard-code completely separate chatbot implementations for every mood.

The same underlying model should be used, with the system prompt adapting its behavior.

The mood configuration should be easy to modify later.

## Safety and Personality Boundaries

The AI is a friendly general conversational companion.

It must not claim to be a therapist, psychologist, doctor, or mental-health professional.

It should not diagnose the user.

It should not make medical claims.

It should not encourage harmful behavior.

If a user discusses serious emotional distress or self-harm, the AI should respond safely and encourage seeking appropriate real-world help rather than pretending it can provide professional treatment.

Do not make the entire product feel like a mental-health application. This is a general friendly AI companion whose conversational tone adapts to the user's selected mood.

## Error Handling

Implement proper error handling throughout the application.

Handle:

Missing Hugging Face token
Invalid Hugging Face token
Unavailable model
Unavailable provider
Hugging Face rate limits
Free-credit exhaustion
Hugging Face API failures
LLM timeout
STT failure
TTS failure
Invalid audio
Microphone permission failure
Network failure
Malformed requests
Empty messages
Unexpected backend errors

The frontend should show simple, human-readable messages.

Do not expose raw stack traces, Hugging Face internals, API tokens, or sensitive backend details to the user.

Log useful technical information on the backend for debugging.

Do not log the Hugging Face token.

## Environment and Configuration

Use environment-based configuration.

The application must be runnable locally without modifying source code to insert secrets.

Create:

`.env.example`

`.gitignore`

Clear setup instructions.

Document how to create a Hugging Face token and where it should be configured.

Document which Hugging Face models are selected and why.

If model availability changes, the model IDs must be easy to replace through environment variables.

## Deployment

The target is a publicly deployed web application.

The frontend should be deployable to Vercel.

The FastAPI backend can also be deployed to Vercel if the final architecture is compatible with Vercel's current Python/FastAPI runtime, otherwise use a suitable free backend deployment option and keep the frontend/backend separation clean.

Do not assume that Vercel provides a traditional persistent server.

Verify the current Vercel deployment capabilities before finalizing the deployment configuration.

The architecture must work correctly with serverless/request-based execution.

Do not depend on local filesystem persistence.

Do not depend on background processes remaining alive between requests.

Do not require a persistent database.

Configure CORS correctly when frontend and backend are deployed separately.

For local development, make it possible to run frontend and backend independently.

## Project Structure

Create a clean monorepo-style project structure similar in principle to:

project-root/

frontend/

backend/

README.md

.env.example

.gitignore

The exact internal structure should follow standard conventions for React/TypeScript and FastAPI projects.

Keep frontend and backend dependencies independent.

Do not create unnecessary packages or infrastructure.

## Documentation

Create a useful README that explains:

What the application does.

Architecture.

Technology stack.

Required prerequisites.

How to create a Hugging Face account/token.

How to configure environment variables.

How to start the backend locally.

How to start the frontend locally.

How voice input works.

How voice output works.

How mood adaptation works.

How to change the Hugging Face models.

How to deploy the frontend.

How to deploy the backend.

Known limitations of the Hugging Face free inference allowance.

Troubleshooting common problems.

Do not claim that Hugging Face inference is unlimited or permanently free.

## API Documentation

FastAPI's OpenAPI documentation must be usable.

Add clear endpoint descriptions and Pydantic schemas so that `/docs` provides meaningful API documentation.

The API documentation should explain the expected input/output for text chat, voice chat, health checks, and any other public endpoint.

## Code Quality

Write clean, maintainable code.

Use type hints throughout the Python backend.

Use TypeScript types throughout the frontend.

Avoid `any` unless there is a genuine unavoidable reason.

Keep business logic out of route handlers where possible.

Keep Hugging Face calls behind service abstractions.

Keep mood configuration separate from API routes.

Keep frontend API communication in a dedicated service/client layer.

Do not duplicate API request logic throughout React components.

Use reusable UI components where appropriate.

Do not over-engineer the application.

## Performance

Minimize unnecessary API requests because the application depends on limited free Hugging Face inference usage.

Do not send duplicate LLM requests.

Do not regenerate TTS unnecessarily.

Do not send an entire oversized conversation history indefinitely.

Keep default response lengths reasonable.

Avoid unnecessary polling.

Prefer streaming for text responses.

Do not preload large assets.

Keep the frontend lightweight.

## Important Implementation Rule

Before writing the implementation, inspect the current Hugging Face documentation and verify the selected LLM, STT model, TTS model, provider availability, API behavior, and LangChain integration.

Do not rely on outdated examples.

If the originally selected model is unavailable through the required Hugging Face inference route, select the closest suitable currently available alternative and update the configuration/documentation accordingly.

The architecture must make model replacement easy.

## Final Deliverable

Build the complete working application, not just a prototype UI.

The final result should allow me to:

Open the application.

Select my mood.

Enter the AI companion.

Type a message and receive a streamed response.

Press the microphone button and speak.

Have my speech converted to text through Hugging Face STT.

Have the text processed by the mood-aware conversational AI.

Receive the response as text.

Receive the response through Hugging Face TTS.

See the floating AI orb visually react to idle, listening, thinking, speaking, and error states.

Use the application comfortably on desktop and mobile browsers.

Run the project locally using documented commands.

Deploy the frontend publicly.

Deploy the FastAPI backend using a compatible deployment architecture.

Do not add features outside this scope unless they are technically necessary for the requested functionality.

Before considering the work complete, verify that the frontend, backend, Hugging Face integration, mood system, text conversation, STT, TTS, streaming, error handling, environment configuration, and deployment configuration work together as one coherent application.