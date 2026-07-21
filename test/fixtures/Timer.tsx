import { useEffect, useLayoutEffect, useState, useMemo, useRef } from 'react';

function Timer({ interval }: { interval: number }) {
  const [time, setTime] = useState(0);
  const [label, setLabel] = useState('');
  const doubled = useMemo(() => time * 2, [time]);
  const ref = useRef<number>(0);

  // derived-state antipattern: setLabel purely from time
  useEffect(() => {
    setLabel(`time is ${time}`);
  }, [time]);

  // scheduled setState inside setTimeout — deferred write, NOT derived state
  useEffect(() => {
    const id = setTimeout(() => {
      setTime(t => t + 1);
    }, interval);
    return () => clearTimeout(id);
  }, [interval]);

  // reactive read (doubled) missing from deps -> depsDiff
  useEffect(() => {
    console.log(`count ${doubled}`);
  }, []);

  // deps-less useLayoutEffect must be detected
  useLayoutEffect(() => {
    ref.current = time;
  });

  return null;
}

function Empty() {
  return null;
}
