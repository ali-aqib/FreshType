
"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import type { ElementRef } from "react";
import { RefreshCw, Zap, LoaderCircle, Eye, EyeOff, Sun, Moon } from "lucide-react";
import { getNewText, fetchTextsByWordLength, fetchTextById, fetchInitialText } from "./actions";
import type { Difficulty } from "@/ai/flows/types";
import { TypingTest, type TypingTestHandle } from "@/components/typing-test";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

const wordLengths = [100, 200, 400, 800];
const difficultyLevels: Difficulty[] = ['Easy', 'Moderate', 'Hard'];

type TextChoice = {
  id: number;
  title: string;
}

export default function Home() {
  const [wordLength, setWordLength] = useState<number>(wordLengths[0]);
  const [text, setText] = useState<string>("");
  const [textTitle, setTextTitle] = useState<string>("");
  const [selectedTextId, setSelectedTextId] = useState<string | number>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [textChoices, setTextChoices] = useState<TextChoice[]>([]);
  const typingTestRef = useRef<ElementRef<typeof TypingTest> & TypingTestHandle>(null);
  const [isFetchingChoices, setIsFetchingChoices] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showDifficultyDialog, setShowDifficultyDialog] = useState(false);
  const [apiKey, setApiKey] = useState<string>("");
  const [pendingDifficulty, setPendingDifficulty] = useState<Difficulty | null>(null);
  const [apiKeyError, setApiKeyError] = useState<string>("");
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [isDark, setIsDark] = useState<boolean>(true);

  const fetchAndSetInitialData = useCallback(async (length: number) => {
    setIsLoading(true);
    setIsFetchingChoices(true);
    try {
      const [initialText, choices] = await Promise.all([
        fetchInitialText(length),
        fetchTextsByWordLength(length)
      ]);

      setText(initialText.content);
      setSelectedTextId(initialText.id);
      setTextTitle(initialText.title);
      setTextChoices(choices);
      
      if (initialText.id !== -1 && !choices.some(c => c.id === initialText.id)) {
        setTextChoices(prev => [{id: initialText.id, title: initialText.title}, ...prev]);
      }
    } catch (error) {
      console.error("Failed to fetch initial data:", error);
      setText("Error loading text. Please try again.");
      setSelectedTextId("");
      setTextTitle("Error");
      setTextChoices([]);
    } finally {
      setIsLoading(false);
      setIsFetchingChoices(false);
    }
  }, []);
  
  useEffect(() => {
    // restore session-scoped API key
    const saved = typeof window !== 'undefined' ? sessionStorage.getItem('gemini_api_key') : null;
    if (saved) setApiKey(saved);
    // theme init
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('theme');
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const dark = savedTheme ? savedTheme === 'dark' : prefersDark;
      setIsDark(dark);
      document.documentElement.classList.toggle('dark', dark);
    }
    fetchAndSetInitialData(wordLength);
  }, [wordLength, fetchAndSetInitialData]);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    if (typeof window !== 'undefined') {
      document.documentElement.classList.toggle('dark', next);
      localStorage.setItem('theme', next ? 'dark' : 'light');
    }
  };

  const handleRestart = () => {
    if (typingTestRef.current) {
      typingTestRef.current.restartTest();
    }
  };

  const handleGenerateNewText = async (difficulty: Difficulty) => {
    setShowDifficultyDialog(false);
    setIsGenerating(true);
    try {
      const { id, content, title } = await getNewText({ wordLength, difficulty, apiKey: apiKey || undefined });
      setText(content);
      setSelectedTextId(id);
      setTextTitle(title);
      if (typingTestRef.current) {
        typingTestRef.current.restartTest();
      }
      const choices = await fetchTextsByWordLength(wordLength);
      if (id !== -1 && !choices.some(c => c.id === id)) {
        setTextChoices([ { id, title }, ...choices]);
      } else {
        setTextChoices(choices);
      }
    } catch (error) {
      const message = (error as any)?.message || '';
      if (message === 'INVALID_API_KEY') {
        // Reopen dialog and ask for key again
        setShowDifficultyDialog(true);
        setPendingDifficulty(difficulty);
        setApiKeyError('Invalid API key. Please re-enter a valid Gemini API key.');
        // Clear the invalid key from session and state so the dialog shows the key field again
        try { sessionStorage.removeItem('gemini_api_key'); } catch {}
        setApiKey('');
        return;
      }
      console.error("Failed to generate new text:", error);
      // Show error in dialog for other failures
      setShowDifficultyDialog(true);
      setPendingDifficulty(difficulty);
      setApiKeyError('Failed to generate text. Please check your API key and try again.');
      return;
    } finally {
      setIsGenerating(false);
    }
  };
  
  const handleWordLengthChange = (value: string) => {
    setWordLength(Number(value));
  };
  
  const handleSelectText = async (id: string | number) => {
    if (!id || id === "no-texts") return;
    setIsLoading(true);
    try {
      const { content, title } = await fetchTextById(Number(id));
      setText(content);
      setSelectedTextId(id);
      setTextTitle(title);
      if (typingTestRef.current) {
        typingTestRef.current.restartTest();
      }
    } catch (error) {
       console.error("Failed to select text:", error);
    } finally {
       setIsLoading(false);
    }
  };

  const handleConfirmKeyAndGenerate = async () => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setApiKeyError('API key is required.');
      return;
    }
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('gemini_api_key'); // Clear old key first
      sessionStorage.setItem('gemini_api_key', trimmed);
    }
    setApiKeyError(""); // Clear any previous errors
    if (pendingDifficulty) {
      await handleGenerateNewText(pendingDifficulty);
    }
  };

  // Keeping this placeholder if we want to restore ETA in the future
  const getEtaText = (_len: number) => "a few seconds";

  // Normalize and unify how titles are displayed in the Select control
  const formatTitle = (title: string): string => {
    const withoutEllipses = (title || "").replace(/\.{3,}$/g, "").trim();
    const MAX = 22; // fixed display length with no trailing dots
    return withoutEllipses.length > MAX ? withoutEllipses.slice(0, MAX) : withoutEllipses;
  };

  
  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-3 sm:p-6 font-code bg-background text-foreground">
      <div className="w-full max-w-4xl flex flex-col gap-6">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h1 className="text-3xl sm:text-4xl font-bold text-primary text-left leading-8 sm:leading-9">FreshType</h1>
          <div className="flex flex-wrap items-center gap-1">
            <Select onValueChange={handleWordLengthChange} defaultValue={String(wordLength)} disabled={isGenerating}>
              <SelectTrigger className="w-[110px] sm:w-[120px] h-8 px-2 text-sm shrink-0 font-semibold">
                <SelectValue placeholder="Word Length" />
              </SelectTrigger>
              <SelectContent>
                {wordLengths.map((len) => (
                  <SelectItem key={len} value={String(len)}>
                    {len} words
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select 
              value={selectedTextId ? String(selectedTextId) : ""}
              onValueChange={(value) => handleSelectText(value)}
              disabled={isFetchingChoices || isGenerating}>
              <SelectTrigger className="w-[150px] sm:w-[170px] h-8 px-2 text-sm shrink-0 font-semibold">
                <SelectValue placeholder={isFetchingChoices ? "Loading..." : "Choose Text"}>
                  {formatTitle(textTitle || (isFetchingChoices ? "Loading..." : "Choose Text"))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {isFetchingChoices ? (
                  <SelectItem value="loading" disabled>Loading...</SelectItem>
                ) : textChoices.length === 0 ? (
                  <SelectItem value="no-texts" disabled>No texts available</SelectItem>
                ) : (
                  textChoices.map(choice => (
                    <SelectItem key={choice.id} value={String(choice.id)}>{formatTitle(choice.title)}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            <Button onClick={() => {
              setPendingDifficulty(null);
              setApiKeyError("");
              setShowDifficultyDialog(true);
            }} variant="outline" size="sm" disabled={isGenerating} className="h-8 shrink-0 whitespace-nowrap px-2 font-semibold">
              <Zap className="mr-0.5 h-4 w-4" />
              {isGenerating ? "Generating..." : "Generate New Text"}
            </Button>
            <Button onClick={handleRestart} variant="outline" size="sm" disabled={isGenerating} className="h-8 shrink-0 whitespace-nowrap px-2 font-semibold">
              <RefreshCw className="mr-0.5 h-4 w-4" />
              Restart
            </Button>
            <Button onClick={toggleTheme} variant="outline" size="sm" className="h-8 w-[90px] shrink-0 whitespace-nowrap px-2 font-semibold" aria-label="Toggle theme">
              {isDark ? <Sun className="mr-0.5 h-4 w-4" /> : <Moon className="mr-0.5 h-4 w-4" />}
              {isDark ? 'Light' : 'Dark'}
            </Button>
          </div>
        </header>

        {isLoading ? (
          <div className="space-y-4">
            <div className="flex justify-around p-4 rounded-lg border">
                <Skeleton className="h-12 w-24" />
                <Skeleton className="h-12 w-24" />
                <Skeleton className="h-12 w-24" />
                <Skeleton className="h-12 w-24" />
            </div>
            <div className="space-y-2 p-4 rounded-lg border h-48">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-[90%]" />
                <Skeleton className="h-4 w-[95%]" />
                <Skeleton className="h-4 w-[85%]" />
                <Skeleton className="h-4 w-full" />
            </div>
          </div>
        ) : (
            <div className="relative">
                {isGenerating && (
                    <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center z-10 rounded-lg space-y-4">
                        <LoaderCircle className="w-12 h-12 animate-spin text-primary" />
                        <div className="text-center">
                            <p className="text-lg font-semibold text-primary text-glow">Generating Text Using AI</p>
                            <p className="text-sm text-muted-foreground">This may take some time, depending on the length of the text..</p>
                        </div>
                    </div>
                )}
                <TypingTest ref={typingTestRef} text={text} disabled={isGenerating} isDark={isDark} key={String(selectedTextId) + text} />
            </div>
        )}
        
    <footer className="text-center text-muted-foreground text-sm">
      <p>Press any key to start the test. The timer begins on your first keystroke.</p>
      <p className="text-black dark:text-white mt-1">Developed by AQIB ALI</p>
    </footer>
      </div>

      {/* Dialog: Set API Key (session-scoped) */}
      {/* Integrated API key prompt inside the difficulty dialog below */}

      <Dialog open={showDifficultyDialog} onOpenChange={(open) => { setShowDifficultyDialog(open); if (!open) setPendingDifficulty(null); }}>
        <DialogContent>
          <DialogHeader>
            {!pendingDifficulty ? (
              <>
                <DialogTitle>Choose Difficulty</DialogTitle>
                <DialogDescription>
                  Select a difficulty level for the AI-generated text.
                </DialogDescription>
              </>
            ) : (
              <>
                <DialogTitle>Enter API Key</DialogTitle>
                <DialogDescription>
                  We do not save your API key.
                </DialogDescription>
              </>
            )}
          </DialogHeader>
          {!pendingDifficulty ? (
            <div className="grid grid-cols-1 gap-4 py-4">
              {difficultyLevels.map((difficulty) => (
                <Button
                  key={difficulty}
                  variant="outline"
                  onClick={() => {
                    if (!apiKey.trim()) {
                      setPendingDifficulty(difficulty);
                      setApiKeyError("");
                    } else {
                      handleGenerateNewText(difficulty);
                    }
                  }}
                >
                  {difficulty}
                </Button>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 py-4">
              <p className="text-sm text-muted-foreground">Enter Gemini API key to generate a {pendingDifficulty} text.</p>
              <div className="flex items-center gap-2">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setApiKeyError(""); }}
                  placeholder="Enter your Gemini API key"
                  className="w-full rounded-md border px-3 py-2 bg-background"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(v => !v)}
                  aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                  className="inline-flex items-center justify-center rounded-md border px-2 py-2 hover:bg-accent"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {apiKeyError && <span className="text-sm text-destructive">{apiKeyError}</span>}
              <p className="text-xs text-muted-foreground">
                Don’t have a key?{' '}
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline"
                >
                  Get a Gemini API key
                </a>
                .
              </p>
            </div>
          )}
          <DialogFooter>
            {!pendingDifficulty && (
              <DialogClose asChild>
                <Button variant="ghost">Close</Button>
              </DialogClose>
            )}
            {pendingDifficulty && (
              <>
                <Button variant="ghost" onClick={() => { setPendingDifficulty(null); setApiKeyError(""); }}>Back</Button>
                <Button onClick={handleConfirmKeyAndGenerate} disabled={!apiKey.trim() && !apiKeyError}>Generate</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
