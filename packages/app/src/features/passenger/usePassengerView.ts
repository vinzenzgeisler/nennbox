import { useEffect, useState } from 'react';
import {
  PassengerLinkViewSchema,
  type PassengerLinkView,
} from '@nennbox/contracts';

export type PassengerLinkState =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'error' }
  | { kind: 'ready'; view: PassengerLinkView }
  | { kind: 'done'; language: 'de' | 'en' };

/** Resolves the personal link; a 4xx means the link is gone, anything else can be retried. */
export function usePassengerView(token: string | null) {
  const [state, setState] = useState<PassengerLinkState>(
    token ? { kind: 'loading' } : { kind: 'unavailable' },
  );
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    fetch('/public/passenger-links/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (controller.signal.aborted) return;
        if (response.status >= 400 && response.status < 500) {
          setState({ kind: 'unavailable' });
          return;
        }
        if (!response.ok) throw new Error('Request failed');
        const view = PassengerLinkViewSchema.safeParse(await response.json());
        setState(
          view.success ? { kind: 'ready', view: view.data } : { kind: 'error' },
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: 'error' });
      });
    return () => controller.abort();
  }, [token, attempt]);
  const reload = () => {
    setState({ kind: 'loading' });
    setAttempt((value) => value + 1);
  };
  return { state, setState, reload };
}
