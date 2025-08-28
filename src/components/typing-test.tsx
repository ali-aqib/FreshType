
"use client";

import React, { useState, useEffect, useMemo, useRef, forwardRef, useImperativeHandle } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

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

const TextDisplay = forwardRef<HTMLDivElement, { text: string; charStates: CharState[], currentIndex: number, showMistakes: boolean, isDark: boolean }>(({ text, charStates, currentIndex, showMistakes, isDark }, ref) => {
  const charRefs = useRef<(HTMLSpanElement | null)[]>([]);
   const containerRef = useRef<HTMLDivElement>(null);


  useEffect(() => {
    charRefs.current = charRefs.current.slice(0, text.length);
  }, [text]);
  
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const targetChar = charRefs.current[currentIndex];
    if (!targetChar) return;

    const containerRect = container.getBoundingClientRect();
    const charRect = targetChar.getBoundingClientRect();
    
    // Auto-scroll logic
    const scrollBuffer = charRect.height * 2; // Keep 2 lines buffer
    if (charRect.bottom > containerRect.bottom - scrollBuffer) {
        container.scrollTop += charRect.bottom - (containerRect.bottom - scrollBuffer);
    } else if (charRect.top < containerRect.top) {
        container.scrollTop += charRect.top - containerRect.top;
    }

  }, [currentIndex]);

  const percent = text.length > 0 ? Math.min(100, Math.round((currentIndex / text.length) * 100)) : 0;

  return (
    <Card ref={containerRef} className="h-44 overflow-y-auto overflow-x-hidden p-0 border-primary/60 bg-card/80">
       <div className="p-4 text-base leading-relaxed tracking-normal sm:tracking-wide select-none">
           {text.split('').map((char, index) => (
             <span key={index} ref={(el) => { charRefs.current[index] = el; }}>
               {index === currentIndex && (
                 <span className="inline-block w-0.5 h-[1em] align-middle bg-primary animate-pulse mr-[1px]" />
               )}
               <span
                 className={cn(
                   charStates[index] === "untouched" && "text-muted-foreground",
                   charStates[index] === "correct" && (showMistakes ? (isDark ? "text-emerald-400" : "text-correct-light") : "text-foreground"),
                   (charStates[index] === "incorrect" && (showMistakes ? "text-red-500 bg-red-500/20 rounded" : "text-foreground")),
                 )}
               >
                 {char}
               </span>
             </span>
           ))}
           {currentIndex === text.length && (
             <span className="inline-block w-0.5 h-[1em] align-middle bg-primary animate-pulse ml-[1px]" />
           )}
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
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [hasStarted, setHasStarted] = useState<boolean>(false);
  const pausedAtRef = useRef<number | null>(null);
  const totalPausedMsRef = useRef<number>(0);
  const [showMistakes, setShowMistakes] = useState<boolean>(true);
  
  const currentIndex = userInput.length;

  // Helper to resume from pause and refocus the textarea
  const resumeFromPause = () => {
    const now = Date.now();
    if (pausedAtRef.current) {
      totalPausedMsRef.current += (now - pausedAtRef.current);
      pausedAtRef.current = null;
    }
    setIsPaused(false);
    if (!isTyping && hasStarted) setIsTyping(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const restartTest = () => {
    setIsTyping(false);
    setStartTime(null);
    setElapsedTime(0);
    setUserInput("");
    setCharStates(Array(text.length).fill("untouched"));
    if (textDisplayContainerRef.current) {
        const scroller = textDisplayContainerRef.current.querySelector('.overflow-y-auto');
        if (scroller) {
          scroller.scrollTop = 0;
        }
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
    const newLength = typedValue.length;
    const oldLength = userInput.length;
  
    if (newLength > oldLength) { // Character added
      const addedChar = typedValue.slice(oldLength);
      for (let i = 0; i < addedChar.length; i++) {
        const charIdx = oldLength + i;
        if(charIdx < text.length) {
            const typedChar = normalizeCharForCompare(typedValue[charIdx]);
            const targetChar = normalizeCharForCompare(text[charIdx]);
            newCharStates[charIdx] = typedChar === targetChar ? "correct" : "incorrect";
        }
      }
    } else { // Character removed
      for (let i = newLength; i < oldLength; i++) {
        newCharStates[i] = "untouched";
      }
    }
  
    setCharStates(newCharStates);
    setUserInput(typedValue);
  };
  
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTyping && !isPaused && startTime) {
      interval = setInterval(() => {
        const now = Date.now();
        const pausedMs = totalPausedMsRef.current;
        setElapsedTime((now - startTime - pausedMs) / 1000);
      }, 100);
    }
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
  }, [isPaused, isTyping, hasStarted]);

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
    
    const correctCharsCount = charStates.slice(0, currentIndex).filter(s => s === 'correct').length;
    const errorsCount = charStates.slice(0, currentIndex).filter(s => s === 'incorrect').length;
    const wordsTyped = (correctCharsCount / 5);
    const minutesElapsed = elapsedTime / 60;
    const wpm = minutesElapsed > 0 ? (wordsTyped / minutesElapsed) : 0;
    const accuracy = currentIndex > 0 ? (correctCharsCount / currentIndex) * 100 : 100;

    return { wpm: Math.round(wpm), accuracy: Math.round(accuracy), errors: errorsCount };
  }, [elapsedTime, charStates, currentIndex]);


  return (
    <div className={cn("flex flex-col gap-6", { "opacity-50": disabled })}>
      <Card className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-2 text-center border-primary/60 bg-card/80">
        <div className="p-1.5">
          <p className="text-sm font-extrabold text-black dark:text-white">WPM</p>
          <p className="text-4xl font-extrabold text-black dark:text-white">{wpm}</p>
        </div>
        <div className="p-1.5">
          <p className="text-sm font-extrabold text-black dark:text-white">CPM</p>
          <p className="text-4xl font-extrabold text-black dark:text-white">{Math.round((charStates.slice(0, currentIndex).filter(s => s === 'correct').length) / Math.max(1, elapsedTime / 60))}</p>
        </div>
        <div className="p-1.5">
          <p className="text-sm font-extrabold text-black dark:text-white">Accuracy</p>
          <p className="text-4xl font-extrabold text-black dark:text-white">{accuracy}%</p>
        </div>
        <div className="p-1.5">
          <p className="text-sm font-extrabold text-black dark:text-white">Time</p>
          <p className="text-4xl font-extrabold text-black dark:text-white">{Math.floor(elapsedTime)}s</p>
        </div>
        <div className="p-1.5">
          <p className="text-sm font-extrabold text-black dark:text-white">Errors</p>
          <p className="text-4xl font-extrabold text-black dark:text-white">{errors}</p>
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
      
      <Textarea
          ref={inputRef}
          value={userInput}
          onChange={handleInputChange}
          className="text-base leading-relaxed tracking-wider h-36"
          placeholder="Start typing here..."
          disabled={disabled || isPaused || currentIndex >= text.length}
          rows={4}
      />
    </div>
  );
});

TypingTest.displayName = "TypingTest";

