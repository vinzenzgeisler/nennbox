import { createContext, useContext } from 'react';

/** Open state of the "Das entsteht" sheet on narrow screens; owned by the shell. */
export const EmergingContext = createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
  id: string;
}>({ open: false, setOpen: () => undefined, id: 'nb-emerging' });
export const useEmerging = () => useContext(EmergingContext);
