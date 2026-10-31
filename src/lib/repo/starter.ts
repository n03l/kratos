import { SNAPSHOT_VERSION, isGymSpecificEquipment, type Exercise, type Snapshot } from '../model';
import library from './library.json';

/**
 * The built-in exercise library: the exercises actually used, named movement first ("Curl (dumbbell, seated)").
 * `library.json` also lists each exercise's FitNotes names, for tools/fitnotes_to_kratos.py.
 */
export function libraryExercises(): Exercise[] {
  return library.map((e) => ({
    id: e.id,
    name: e.name,
    equipment: e.equipment as Exercise['equipment'],
    muscles: e.muscles as Exercise['muscles'],
    gymSpecific: isGymSpecificEquipment(e.equipment as Exercise['equipment']),
    ...('restSec' in e ? { restSec: e.restSec } : {}),
    ...('measure' in e && e.measure === 'time' ? { measure: 'time' as const } : {}),
  }));
}

/** First launch: one gym and the exercise library, no history. */
export function starter(): Snapshot {
  return {
    version: SNAPSHOT_VERSION,
    gyms: [{ id: 'gym', name: 'My gym', color: 'red', bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25], stackIncrement: 5 }],
    exercises: libraryExercises(),
    setups: [],
    routines: [],
    sessions: [],
    body: [],
    settings: { defaultGymId: 'gym', defaultRestSec: 120, sound: true, soundVolume: 0.8, pauseMusic: true, vibrate: true, detectGym: true, keepScreenOn: false },
  };
}
