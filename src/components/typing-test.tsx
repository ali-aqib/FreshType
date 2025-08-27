
"use client";

import React, { useState, useEffect, useMemo, useRef, forwardRef, useImperativeHandle } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type CharState = "untouched" | "correct" | "incorrect";

export interface TypingTestHandle {
  restartTest: () => void;
}

interface TypingTestProps {
  text: string;
  disabled?: boolean;
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

const TextDisplay = forwardRef<HTMLDivElement, { text: string; charStates: CharState[], currentIndex: number }>(({ text, charStates, currentIndex }, ref) => {
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


  return (
    <Card ref={containerRef} className="h-48 overflow-y-auto overflow-x-hidden p-6">
       <div className="text-lg leading-relaxed tracking-wider select-none">
            {text.split('').map((char, index) => (
              <span
                key={index}
                ref={(el) => { charRefs.current[index] = el; }}
                className={cn({
                  "text-muted-foreground": charStates[index] === "untouched",
                  "text-lime-400": charStates[index] === "correct",
                  "text-red-500 bg-red-900/50 rounded": charStates[index] === "incorrect",
                })}
              >
                {char}
              </span>
            ))}
        </div>
    </Card>
  );
});

TextDisplay.displayName = 'TextDisplay';


export const TypingTest = forwardRef<TypingTestHandle, TypingTestProps>(({ text, disabled = false }, ref) => {
  const [charStates, setCharStates] = useState<CharState[]>(Array(text.length).fill("untouched"));
  const [userInput, setUserInput] = useState<string>("");
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const textDisplayContainerRef = useRef<HTMLDivElement>(null);
  
  const currentIndex = userInput.length;

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
  
    if (!isTyping && typedValue.length > 0) {
      setIsTyping(true);
      setStartTime(Date.now());
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
    if (isTyping) {
      interval = setInterval(() => {
        if(startTime) {
            setElapsedTime((Date.now() - startTime) / 1000);
        }
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isTyping, startTime]);

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
    <div className={cn("flex flex-col gap-8", { "opacity-50": disabled })}>
      <Card className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 text-center border-primary/50">
        <div className="p-2">
          <p className="text-sm text-muted-foreground">WPM</p>
          <p className="text-3xl font-bold text-glow text-primary">{wpm}</p>
        </div>
        <div className="p-2">
          <p className="text-sm text-muted-foreground">Accuracy</p>
          <p className="text-3xl font-bold text-glow text-primary">{accuracy}%</p>
        </div>
        <div className="p-2">
          <p className="text-sm text-muted-foreground">Time</p>
          <p className="text-3xl font-bold text-glow text-primary">{Math.floor(elapsedTime)}s</p>
        </div>
        <div className="p-2">
          <p className="text-sm text-muted-foreground">Errors</p>
          <p className="text-3xl font-bold text-glow text-primary">{errors}</p>
        </div>
      </Card>
      
      <div className="relative">
        <TextDisplay ref={textDisplayContainerRef} text={text} charStates={charStates} currentIndex={currentIndex} />
      </div>
      
      <Textarea
          ref={inputRef}
          value={userInput}
          onChange={handleInputChange}
          className="text-lg leading-relaxed tracking-wider h-48"
          placeholder="Start typing here..."
          disabled={disabled || currentIndex >= text.length}
          rows={5}
      />
    </div>
  );
});

TypingTest.displayName = "TypingTest";

