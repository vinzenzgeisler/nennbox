import { createContext, useContext } from 'react';

/** Lets a choice group name itself after the question it belongs to. */
export const QuestionContext = createContext<{ titleId: string } | null>(null);
export const useQuestionTitleId = () => useContext(QuestionContext)?.titleId;
