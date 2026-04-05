import { createContext, useContext, useRef, useCallback, useState } from "react";

export interface UndoEntry {
  label: string;
  undo: () => Promise<void> | void;
  redo?: () => Promise<void> | void;
  cleanup?: () => void;
}

interface HistoryCtx {
  push: (entry: UndoEntry) => void;
  pop:  () => UndoEntry | undefined;
  redo: () => UndoEntry | undefined;
  canUndo:   boolean;
  canRedo:   boolean;
  lastLabel: string;
  redoLabel: string;
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];
}

const HistoryContext = createContext<HistoryCtx>({
  push: () => {}, pop: () => undefined, redo: () => undefined,
  canUndo: false, canRedo: false,
  lastLabel: "", redoLabel: "",
  undoStack: [], redoStack: [],
});

const MAX_HISTORY = 20;

export function HistoryProvider({ children }: { children: React.ReactNode }) {
  const undoRef = useRef<UndoEntry[]>([]);
  const redoRef = useRef<UndoEntry[]>([]);
  const [, tick] = useState(0);
  const bump = () => tick((n) => n + 1);

  const push = useCallback((entry: UndoEntry) => {
    if (undoRef.current.length >= MAX_HISTORY) undoRef.current[0].cleanup?.();
    undoRef.current = [...undoRef.current.slice(-(MAX_HISTORY - 1)), entry];
    redoRef.current = [];
    bump();
  }, []);

  const pop = useCallback(() => {
    if (!undoRef.current.length) return undefined;
    const entry = undoRef.current[undoRef.current.length - 1];
    undoRef.current = undoRef.current.slice(0, -1);
    if (entry.redo) redoRef.current = [...redoRef.current.slice(-(MAX_HISTORY - 1)), entry];
    bump();
    return entry;
  }, []);

  const redo = useCallback(() => {
    if (!redoRef.current.length) return undefined;
    const entry = redoRef.current[redoRef.current.length - 1];
    redoRef.current = redoRef.current.slice(0, -1);
    undoRef.current = [...undoRef.current.slice(-(MAX_HISTORY - 1)), entry];
    bump();
    return entry;
  }, []);

  return (
    <HistoryContext.Provider value={{
      push, pop, redo,
      canUndo: undoRef.current.length > 0,
      canRedo: redoRef.current.length > 0,
      lastLabel: undoRef.current.at(-1)?.label ?? "",
      redoLabel: redoRef.current.at(-1)?.label ?? "",
      undoStack: undoRef.current,
      redoStack: redoRef.current,
    }}>
      {children}
    </HistoryContext.Provider>
  );
}

export function useHistory() { return useContext(HistoryContext); }
