import { useEffect, useState } from 'react';

export const STORAGE_KEY = 'talkyViewMode';
export const VIEW_MODES = { TEACHER: 'teacher', STUDENT: 'student' };
export const DEFAULT_VIEW_MODE = VIEW_MODES.STUDENT;

const VIEW_MODE_EVENT = 'talky:viewmode';

function isValidMode(mode) {
  return mode === VIEW_MODES.TEACHER || mode === VIEW_MODES.STUDENT;
}

export function getViewMode() {
  const saved = localStorage.getItem(STORAGE_KEY);
  return isValidMode(saved) ? saved : DEFAULT_VIEW_MODE;
}

export function setViewMode(mode) {
  if (!isValidMode(mode)) return;
  localStorage.setItem(STORAGE_KEY, mode);
  window.dispatchEvent(new CustomEvent(VIEW_MODE_EVENT, { detail: mode }));
}

export function useViewMode() {
  const [mode, setMode] = useState(getViewMode);

  useEffect(() => {
    const onSameTabChange = (e) => setMode(e.detail);
    const onCrossTabChange = (e) => {
      if (e.key === STORAGE_KEY) setMode(getViewMode());
    };

    window.addEventListener(VIEW_MODE_EVENT, onSameTabChange);
    window.addEventListener('storage', onCrossTabChange);
    return () => {
      window.removeEventListener(VIEW_MODE_EVENT, onSameTabChange);
      window.removeEventListener('storage', onCrossTabChange);
    };
  }, []);

  return [mode, setViewMode];
}
