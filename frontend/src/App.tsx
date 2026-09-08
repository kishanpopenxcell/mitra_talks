import { useCallback, useEffect, useState } from 'react';
import { MoodSelectionScreen } from './components/MoodSelection';
import { ConversationScreen } from './components/Conversation';
import { checkHealth } from './services/healthService';
import { getMoodMeta, moodStyle } from './mood/moods';
import type { MoodId } from './types';

type Screen = 'mood' | 'conversation';

function App() {
  const [screen, setScreen] = useState<Screen>('mood');
  const [mood, setMood] = useState<MoodId | null>(null);
  /** The mood currently colouring the scene: a hover preview on the picker, the chosen mood in conversation. */
  const [themeMood, setThemeMood] = useState<MoodId>('neutral');
  const [backendUnreachable, setBackendUnreachable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    checkHealth(controller.signal)
      .then(() => setBackendUnreachable(false))
      .catch(() => setBackendUnreachable(true));
    return () => controller.abort();
  }, []);

  const handleStart = (selectedMood: MoodId) => {
    setMood(selectedMood);
    setThemeMood(selectedMood);
    setScreen('conversation');
  };

  const handleChangeMood = () => {
    setScreen('mood');
  };

  const handlePreview = useCallback((previewMood: MoodId) => {
    setThemeMood(previewMood);
  }, []);

  return (
    <div
      className="mood-vars relative min-h-dvh overflow-hidden bg-bg text-fg"
      style={moodStyle(getMoodMeta(themeMood))}
    >
      <div className="mood-backdrop" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 bg-noise opacity-[0.035]" aria-hidden="true" />
      <div className="relative">
        {screen === 'mood' || !mood ? (
          <MoodSelectionScreen
            key="mood"
            initialMood={mood}
            onStart={handleStart}
            onPreview={handlePreview}
            backendUnreachable={backendUnreachable}
          />
        ) : (
          <ConversationScreen key="conversation" mood={mood} onChangeMood={handleChangeMood} />
        )}
      </div>
    </div>
  );
}

export default App;
