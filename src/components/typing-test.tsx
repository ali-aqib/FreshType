
"use client";

import React, { useState, useEffect, useMemo, useRef, forwardRef, useImperativeHandle, useLayoutEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
// (Removed unused Button import)

type CharState = "untouched" | "correct" | "incorrect";

export interface TypingTestHandle {
  restartTest: () => void;
}

interface TypingTestProps {
  text: string;
  disabled?: boolean;
  isDark?: boolean;
}

// Normalize characters so visually equivalent punctuation matches during comparison.
function normalizeCharForCompare(char: string): string {
  if (!char) return char;
  const map: Record<string, string> = {
    // spaces
    "\u00A0": " ", // non-breaking space → space
  "\n": " ", // treat newline as space so Enter isn't required
  "\r": " ", // carriage return as space (Windows newlines)
    // single quotes / apostrophes
    "\u2019": "'", // right single quotation mark
    "\u2018": "'", // left single quotation mark
    "\u2032": "'", // prime
    // double quotes
    "\u201C": '"', // left double quotation mark
    "\u201D": '"', // right double quotation mark
    // dashes
    "\u2013": "-", // en dash
    "\u2014": "-", // em dash
    // miscellaneous similar punctuation
    "\u02BC": "'", // modifier letter apostrophe
  };
  const replaced = map[char];
  return (replaced ?? char);
}

const TextDisplay = forwardRef<HTMLDivElement, { text: string; charStates: CharState[], currentIndex: number, showMistakes: boolean, isDark: boolean }>(({ text, charStates, currentIndex: _currentIndex, showMistakes, isDark }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // Track per-glyph elements to compute scroll positions without a visible caret
  const glyphRefs = useRef<(HTMLSpanElement | null)[]>([]);

  // Expose the scroll container to parent for scroll syncing
  useImperativeHandle(ref, () => (containerRef.current ?? document.createElement('div')) as HTMLDivElement, []);

  // Maintain refs array length
  useEffect(() => {
    glyphRefs.current = glyphRefs.current.slice(0, text.length);
  }, [text]);

  // Auto-scroll: when typing reaches near the bottom, keep the active line at the second last line
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || text.length === 0) return;
    const idx = Math.max(0, Math.min(_currentIndex, text.length - 1));
    const el = glyphRefs.current[idx];
    if (!el) return;
    const elRect = el.getBoundingClientRect();
    const contRect = container.getBoundingClientRect();

    const lineHeight = elRect.height || 20;
    // Element top relative to container content
    const elTop = (elRect.top - contRect.top) + container.scrollTop;
    const elBottom = elTop + lineHeight;
    const viewportTop = container.scrollTop;
    const viewportBottom = viewportTop + container.clientHeight;

    // If the active line would fall into the last line, scroll so it lands on the second-last line
    const threshold = viewportBottom - lineHeight; // last line bottom threshold
    if (elBottom > threshold) {
      const desiredTop = elTop - (container.clientHeight - 2 * lineHeight);
      const nextScrollTop = Math.max(0, Math.min(desiredTop, container.scrollHeight - container.clientHeight));
      if (nextScrollTop > container.scrollTop + 1) {
        container.scrollTop = nextScrollTop;
      }
    }
  }, [_currentIndex, text]);

  // percent reserved for future use (removed to satisfy lint)

  return (
  <Card ref={containerRef} className="relative h-44 overflow-y-auto overflow-x-hidden p-0 border-primary/60 bg-card/80 themed-scrollbar kerning-off">
  <div className="p-4 text-base leading-relaxed tracking-normal sm:tracking-wide select-none">
         {text.split('\n').map((line, lineIdx, linesArr) => {
           // Calculate the start index of this line in the full text
           const startIdx = linesArr.slice(0, lineIdx).reduce((acc, l) => acc + l.length + 1, 0); // +1 for '\n'
           return (
             <div key={lineIdx} style={{ display: 'block', width: '100%' }}>
               {line.split('').map((char, charIdx) => {
                 const index = startIdx + charIdx;
                 const isSpace = char === ' ';
                 const showSpaceBox = isSpace && showMistakes && charStates[index] === 'incorrect';
                 return (
                   <span key={index}>
                     <span
                       ref={el => { glyphRefs.current[index] = el; }}
                       className={cn(
                         charStates[index] === "untouched" && "text-muted-foreground",
                         charStates[index] === "correct" && (showMistakes ? (isDark ? "text-emerald-400 font-bold" : "text-correct-light font-bold") : "text-foreground font-bold"),
                         (charStates[index] === "incorrect" && (showMistakes ? "text-red-500 bg-red-500/20 rounded font-bold" : "text-foreground font-bold")),
                       )}
                     >
                       {showSpaceBox ? (
                         <span style={{ display: 'inline-block', width: '1ch', height: '1em' }} aria-hidden="true">{'\u00A0'}</span>
                       ) : (
                         char
                       )}
                     </span>
                   </span>
                 );
               })}
             </div>
           );
         })}
       </div>
    </Card>
  );
});

TextDisplay.displayName = 'TextDisplay';


export const TypingTest = forwardRef<TypingTestHandle, TypingTestProps>(({ text, disabled = false, isDark = true }, ref) => {
  const [charStates, setCharStates] = useState<CharState[]>(Array(text.length).fill("untouched"));
  const [userInput, setUserInput] = useState<string>("");
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const textDisplayContainerRef = useRef<HTMLDivElement>(null);
  const [displayHasOverflow, setDisplayHasOverflow] = useState(false);
  const desiredSelectionRef = useRef<number | null>(null);
  const syncScroll = React.useCallback(() => {
    const display = textDisplayContainerRef.current;
    const input = inputRef.current;
    if (!display || !input) return;
    input.scrollTop = display.scrollTop;
  }, []);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [hasStarted, setHasStarted] = useState<boolean>(false);
  const pausedAtRef = useRef<number | null>(null);
  const totalPausedMsRef = useRef<number>(0);
  const [showMistakes, setShowMistakes] = useState<boolean>(true);
  
  const currentIndex = userInput.length;

  // Helper to resume from pause and refocus the textarea
  const resumeFromPause = useCallback(() => {
    // Prevent resuming timer if typing is complete
    if (currentIndex >= text.length) {
      setIsPaused(false);
      return;
    }
    const now = Date.now();
    if (pausedAtRef.current) {
      totalPausedMsRef.current += (now - pausedAtRef.current);
      pausedAtRef.current = null;
    }
    setIsPaused(false);
    if (!isTyping && hasStarted) setIsTyping(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [currentIndex, text.length, isTyping, hasStarted]);

  const restartTest = () => {
    setIsTyping(false);
    setStartTime(null);
    setElapsedTime(0);
    setUserInput("");
    setCharStates(Array(text.length).fill("untouched"));
    if (textDisplayContainerRef.current) {
      try { textDisplayContainerRef.current.scrollTop = 0; } catch {}
    }
    if (inputRef.current) {
        inputRef.current.value = "";
        inputRef.current.focus();
    }
  };
  
  useImperativeHandle(ref, () => ({
    restartTest,
  }));

  useEffect(() => {
    if (!disabled) {
        inputRef.current?.focus();
    }
  }, [disabled, text]);

  // Keep the textarea scrollbar state in sync with display overflow
  useEffect(() => {
    const display = textDisplayContainerRef.current;
    const input = inputRef.current;
    if (!display || !input) return;

    const checkOverflow = () => {
      requestAnimationFrame(() => {
        const hasOverflow = display.scrollHeight > display.clientHeight + 1;
        setDisplayHasOverflow(hasOverflow);
      });
    };

    const onScroll = () => syncScroll();
    display.addEventListener('scroll', onScroll, { passive: true });

    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(checkOverflow);
      ro.observe(display);
    }
    checkOverflow();

    return () => {
      display.removeEventListener('scroll', onScroll);
      if (ro) ro.disconnect();
    };
  }, [text, syncScroll]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const typedValue = e.target.value;
  
    if (currentIndex >= text.length && typedValue.length > userInput.length) {
      if (isTyping) setIsTyping(false);
      return;
    }
  
    if (!hasStarted && typedValue.length > 0) {
      setHasStarted(true);
      setIsTyping(true);
      if (startTime === null) {
        setStartTime(Date.now());
      }
    }
  
    const newCharStates = [...charStates];
    // Auto-insert a space/newline parity at expected newline so wrapping matches display
    let finalValue = typedValue;
    if (typedValue.length > userInput.length) {
      const idx = userInput.length;
      const expected = text[idx];
      const raw = typedValue[idx];
      if (expected === '\n' || expected === '\r') {
        if (raw === ' ') {
          finalValue = typedValue.substring(0, idx) + '\n' + typedValue.substring(idx + 1);
          desiredSelectionRef.current = idx + 1;
        } else if (raw !== '\n' && raw !== '\r') {
          finalValue = userInput + ' ' + typedValue.slice(idx);
          desiredSelectionRef.current = idx + 1;
        }
      }
    }

    const newLength = finalValue.length;
    const oldLength = userInput.length;
  
    if (newLength > oldLength) { // Character added
      const addedChar = finalValue.slice(oldLength);
      for (let i = 0; i < addedChar.length; i++) {
        const charIdx = oldLength + i;
        if(charIdx < text.length) {
            const typedChar = normalizeCharForCompare(finalValue[charIdx]);
            const targetChar = normalizeCharForCompare(text[charIdx]);
            if (text[charIdx] === '\n' || text[charIdx] === '\r') {
              const raw = finalValue[charIdx];
              if (raw === '\n' || raw === '\r' || raw === ' ') {
                newCharStates[charIdx] = 'correct';
              } else {
                newCharStates[charIdx] = 'incorrect';
              }
            } else {
              newCharStates[charIdx] = typedChar === targetChar ? 'correct' : 'incorrect';
            }
        }
      }
    } else { // Character removed
      for (let i = newLength; i < oldLength; i++) {
        newCharStates[i] = "untouched";
      }
    }
  
    setCharStates(newCharStates);
    setUserInput(finalValue);
  };

  // Apply any requested caret move after value updates to ensure the textarea reflects it.
  useLayoutEffect(() => {
    const pos = desiredSelectionRef.current;
    const el = inputRef.current;
    if (el && pos != null) {
      try { el.setSelectionRange(pos, pos); } catch {}
      desiredSelectionRef.current = null;
    }
  }, [userInput]);
  
  useEffect(() => {
    if (!isTyping || isPaused || !startTime) return;
    const tick = () => {
      const now = Date.now();
      const pausedMs = totalPausedMsRef.current;
      setElapsedTime((now - startTime - pausedMs) / 1000);
    };
    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [isTyping, isPaused, startTime]);

  // Toggle pause/resume with Esc; do not use other keys
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F8') {
        e.preventDefault();
        e.stopPropagation();
        setShowMistakes((s) => !s);
        // Keep caret in the textarea when toggling highlighting
        if (inputRef.current) {
          const el = inputRef.current;
          // Re-focus and put caret at end (preserves value)
          el.focus();
          const len = el.value.length;
          try { el.setSelectionRange(len, len); } catch {}
        }
        return;
      }
      if (e.key !== 'Escape') return;
      if (!isPaused) {
        pausedAtRef.current = Date.now();
        setIsPaused(true);
      } else {
        resumeFromPause();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPaused, isTyping, hasStarted, resumeFromPause]);

  // Ensure focus whenever pause ends (covers other state paths)
  useEffect(() => {
    if (!isPaused) {
      const id = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
  }, [isPaused]);

  useEffect(() => {
    if (currentIndex >= text.length) {
      setIsTyping(false);
    }
  }, [currentIndex, text.length]);

  const { wpm, accuracy, errors } = useMemo(() => {
    if (elapsedTime === 0) return { wpm: 0, accuracy: 100, errors: 0 };

    const minutesElapsed = elapsedTime / 60;
    const typedSpan = charStates.slice(0, currentIndex);
    const correctChars = typedSpan.filter(s => s === 'correct').length;
    const errorKeystrokes = typedSpan.filter(s => s === 'incorrect').length;
    const totalKeystrokes = correctChars + errorKeystrokes;

    // Friendlier metrics (no cascade penalty):
    // WPM = (Correct Characters ÷ 5) ÷ Time in minutes
    const wpm = minutesElapsed > 0 ? ((correctChars / 5) / minutesElapsed) : 0;
    // Accuracy = (Correct Characters ÷ Total Keystrokes) × 100
    const accuracy = totalKeystrokes > 0 ? (correctChars / totalKeystrokes) * 100 : 100;
    // Error percentage = (Errors ÷ Total Keystrokes) × 100
    const errorPct = totalKeystrokes > 0 ? (errorKeystrokes / totalKeystrokes) * 100 : 0;

    return { wpm: Math.max(0, Math.round(wpm)), accuracy: Math.max(0, Math.round(accuracy)), errors: Math.max(0, Math.round(errorPct)) };
  }, [elapsedTime, charStates, currentIndex]);


  return (
    <div className={cn("flex flex-col gap-6", { "opacity-50": disabled })}>
      <Card className="grid grid-cols-2 sm:grid-cols-5 gap-1 sm:gap-2 p-1.5 sm:p-2 text-center border-primary/60 bg-card/80">
        <div className="p-1 sm:p-1.5">
          <p className="text-xs sm:text-sm font-extrabold text-black dark:text-white">WPM</p>
          <p className="text-2xl sm:text-4xl font-extrabold text-black dark:text-white">{wpm}</p>
        </div>
        <div className="p-1 sm:p-1.5">
          <p className="text-xs sm:text-sm font-extrabold text-black dark:text-white">CPM</p>
          <p className="text-2xl sm:text-4xl font-extrabold text-black dark:text-white">{Math.round((charStates.slice(0, currentIndex).filter(s => s === 'correct').length) / Math.max(1, elapsedTime / 60))}</p>
        </div>
        <div className="p-1 sm:p-1.5">
          <p className="text-xs sm:text-sm font-extrabold text-black dark:text-white">Accuracy</p>
          <p className="text-2xl sm:text-4xl font-extrabold text-black dark:text-white">{accuracy}%</p>
        </div>
        <div className="p-1 sm:p-1.5">
          <p className="text-xs sm:text-sm font-extrabold text-black dark:text-white">Time</p>
          <p className="text-2xl sm:text-4xl font-extrabold text-black dark:text-white">{
            (() => {
              const totalSeconds = Math.floor(elapsedTime);
              const minutes = Math.floor(totalSeconds / 60);
              const seconds = totalSeconds % 60;
              return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            })()
          }</p>
        </div>
        <div className="p-1 sm:p-1.5">
          <p className="text-xs sm:text-sm font-extrabold text-black dark:text-white">Errors %</p>
          <p className="text-2xl sm:text-4xl font-extrabold text-black dark:text-white">{errors}%</p>
        </div>
        <div className="col-span-2 sm:col-span-5">
          <p className="text-xs text-muted-foreground text-center">Press Esc to pause/resume • Press F8 to toggle mistake highlighting ({showMistakes ? 'On' : 'Off'}).</p>
        </div>
      </Card>
      {/* Progress bar between stats and text area */}
      {text.length > 0 && (
        <div className="w-full">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">Progress</span>
            <span className="text-xs font-medium text-foreground">{Math.min(100, Math.round((currentIndex / text.length) * 100))}%</span>
          </div>
          <div className="w-full h-2 bg-muted rounded">
            <div
              className="h-full bg-primary rounded transition-all duration-300"
              style={{ width: `${text.length > 0 ? Math.min(100, Math.round((currentIndex / text.length) * 100)) : 0}%` }}
            />
          </div>
        </div>
      )}
      
      <div className="relative">
        <TextDisplay ref={textDisplayContainerRef} text={text} charStates={charStates} currentIndex={currentIndex} showMistakes={showMistakes} isDark={isDark} />
        {isPaused && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10 rounded-lg">
            <Card className="p-4 text-center shadow-lg">
              <p className="text-lg font-semibold">Typing Paused</p>
              <p className="text-sm text-muted-foreground mt-1">Press Esc again to resume. Your time and progress are preserved.</p>
            </Card>
          </div>
        )}
      </div>
      
      <div className="rounded-lg border border-input overflow-hidden">
        <Textarea
            ref={inputRef}
            value={userInput}
            onChange={handleInputChange}
            className={cn(
              "text-base leading-relaxed tracking-normal sm:tracking-wide h-44 overflow-y-auto themed-scrollbar px-4 kerning-off font-bold rounded-none border-0",
              displayHasOverflow ? "[overflow-y:scroll]" : ""
            )}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            placeholder="Start typing here..."
            disabled={disabled || isPaused || currentIndex >= text.length}
            rows={4}
        />
      </div>
    </div>
  );
});

TypingTest.displayName = "TypingTest";
