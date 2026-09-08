import { useEffect, useState } from 'react';
import { MoodSelectionScreen } from './components/MoodSelection';
import { ConversationScreen } from './components/Conversation';
import { checkHealth } from './services/healthService';
import type { MoodId } from './types';

type Screen = 'mood' | 'conversation';

function App() {
  const [screen, setScreen] = useState<Screen>('mood');
  const [mood, setMood] = useState<MoodId | null>(null);
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
    setScreen('conversation');
  };

  const handleChangeMood = () => {
    setScreen('mood');
  };

  return (
    <div className="relative min-h-dvh overflow-hidden bg-app-gradient text-white">
      <div className="pointer-events-none absolute inset-0 bg-noise opacity-[0.03]" />
      {screen === 'mood' || !mood ? (
        <MoodSelectionScreen onStart={handleStart} backendUnreachable={backendUnreachable} />
      ) : (
        <ConversationScreen mood={mood} onChangeMood={handleChangeMood} />
      )}
    </div>
  );
}

export default App;
