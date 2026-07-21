import { useState, useEffect } from 'react';

// A live HH:MM:SS clock that owns its own state + interval, so the 1Hz tick
// re-renders ONLY this text node. Previously the clock lived in App state and
// setState({clock}) every second rebuilt all nine view-model builders and
// reconciled the whole tree — constant main-thread work that stole frames from
// scrolling and animation. Two screens show the time; each renders its own.
const now = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

export function Clock() {
  const [t, setT] = useState(now);
  useEffect(() => {
    const iv = setInterval(() => setT(now()), 1000);
    return () => clearInterval(iv);
  }, []);
  return <>{t}</>;
}
