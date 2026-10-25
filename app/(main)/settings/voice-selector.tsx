"use client";

import { useState, useRef, useEffect } from "react";
import {
  AVAILABLE_VOICES,
  VOICE_STYLE_PRESETS,
  type VoiceSettingsData,
} from "@/lib/tts-config";
import {
  saveVoiceSettings,
  previewVoiceAudio,
} from "@/lib/actions/tts-settings";

interface VoiceSelectorProps {
  initialSettings: VoiceSettingsData;
}

export function VoiceSelector({ initialSettings }: VoiceSelectorProps) {
  const [selectedVoice, setSelectedVoice] = useState(initialSettings.voiceName);
  const [selectedPreset, setSelectedPreset] = useState(initialSettings.presetId);
  const [customInstructions, setCustomInstructions] = useState(
    initialSettings.customInstructions || ""
  );

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [fallbackNotice, setFallbackNotice] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handlePresetChange = (presetId: string) => {
    setSelectedPreset(presetId);
    const preset = VOICE_STYLE_PRESETS.find((p) => p.id === presetId);
    if (preset && preset.template) {
      setCustomInstructions(preset.template);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    setSaveError("");
    try {
      await saveVoiceSettings({
        voiceName: selectedVoice,
        presetId: selectedPreset,
        customInstructions: customInstructions,
      });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("voice-setting-changed"));
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Failed to save voice settings");
    } finally {
      setIsSaving(false);
    }
  };

  const playBrowserFallback = (sample: string) => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(sample);
      utterance.lang = "en-US";
      
      const voiceInfo = AVAILABLE_VOICES.find((v) => v.id === selectedVoice);
      if (voiceInfo?.gender === "masculine") {
        utterance.pitch = 0.85;
      } else {
        utterance.pitch = 1.1;
      }
      
      utterance.onstart = () => setIsPlaying(true);
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => setIsPlaying(false);
      
      window.speechSynthesis.speak(utterance);
      setFallbackNotice("Playing via browser speech fallback while Gemini rate limit cools down (~30s).");
      setTimeout(() => setFallbackNotice(""), 6000);
    }
  };

  const handleTestPreview = async (testText?: string, testLang?: string) => {
    setIsPreviewing(true);
    setIsPlaying(false);
    setPreviewError("");
    setFallbackNotice("");

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    const sample =
      testText ||
      "Hello and welcome to jubeidanci. Master new languages with confidence, intelligence, and natural cadence.";

    try {
      const activeInstructions =
        selectedPreset === "custom"
          ? customInstructions
          : VOICE_STYLE_PRESETS.find((p) => p.id === selectedPreset)?.template;

      const res = await previewVoiceAudio({
        voiceName: selectedVoice,
        instructions: activeInstructions,
        sampleText: sample,
        language: testLang || "en",
      });

      if (res.url) {
        const audio = new Audio(res.url);
        audioRef.current = audio;

        audio.onended = () => {
          setIsPlaying(false);
        };
        audio.onerror = () => {
          setIsPlaying(false);
          playBrowserFallback(sample);
        };

        setIsPlaying(true);
        await audio.play();
      } else {
        throw new Error("No audio returned from server");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to play voice sample";
      setPreviewError(message);
      // Play speech via browser so user still hears audio
      playBrowserFallback(sample);
    } finally {
      setIsPreviewing(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-lingo-border bg-white p-6 shadow-sm space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-lingo-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black text-lingo-text">AI Audio & Voice Selector</h2>
            <span className="rounded-full bg-purple-100 text-purple-700 text-xs px-2.5 py-0.5 font-bold">
              Admin & Author Only
            </span>
          </div>
          <p className="text-xs text-lingo-text-light font-bold mt-0.5">
            Configure the Gemini Neural TTS voice persona, timbre, and cadence for language lessons & pronunciation.
          </p>
        </div>
      </div>

      {/* Voice Selection Grid */}
      <div className="space-y-3">
        <label className="text-sm font-black text-lingo-text">
          1. Select Prebuilt AI Voice Timbre
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {AVAILABLE_VOICES.map((v) => {
            const isSelected = selectedVoice === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setSelectedVoice(v.id)}
                className={`flex flex-col text-left p-3.5 rounded-xl border-2 transition-all cursor-pointer ${
                  isSelected
                    ? "border-lingo-blue bg-lingo-blue/10 shadow-sm ring-2 ring-lingo-blue/20"
                    : "border-lingo-border hover:border-lingo-blue/40 bg-white"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-sm text-lingo-text flex items-center gap-1.5">
                    {v.name}
                    {isSelected && <span className="text-lingo-blue text-xs">✓ Active</span>}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      v.id === "Fenrir" || v.id === "Charon"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-lingo-gray/40 text-lingo-text-light"
                    }`}
                  >
                    {v.tag}
                  </span>
                </div>
                <p className="text-xs text-lingo-text-light line-clamp-2">
                  {v.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Voice Style / Persona Presets */}
      <div className="space-y-3">
        <label className="text-sm font-black text-lingo-text">
          2. Voice Persona & Speaking Cadence
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {VOICE_STYLE_PRESETS.map((preset) => {
            const isSelected = selectedPreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handlePresetChange(preset.id)}
                className={`text-left p-3 rounded-xl border-2 transition-all cursor-pointer ${
                  isSelected
                    ? "border-lingo-green bg-lingo-green/10 ring-2 ring-lingo-green/20"
                    : "border-lingo-border hover:border-lingo-green/40 bg-white"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-lingo-text">
                    {preset.name}
                  </span>
                  {isSelected && <span className="text-lingo-green text-xs font-bold">✓</span>}
                </div>
                <p className="text-[11px] text-lingo-text-light mt-1">
                  {preset.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Prompt Instructions Box */}
      {selectedPreset === "custom" && (
        <div className="space-y-2 pt-1">
          <label className="text-xs font-bold text-lingo-text flex items-center justify-between">
            <span>Custom Speech Prompt Instruction</span>
            <span className="text-lingo-text-light font-normal text-[11px]">
              Use <code className="bg-lingo-gray/40 px-1 py-0.5 rounded text-[11px] font-mono">{"{target_language}"}</code> variable
            </span>
          </label>
          <textarea
            rows={3}
            value={customInstructions}
            onChange={(e) => setCustomInstructions(e.target.value)}
            placeholder="e.g. Speak in {target_language} with a thoughtful, measured cadence..."
            className="w-full rounded-xl border-2 border-lingo-border p-3 text-xs font-mono focus:border-lingo-blue focus:outline-none"
          />
        </div>
      )}

      {/* Action Bar with Test & Save */}
      <div className="pt-2 border-t border-lingo-border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isPreviewing}
            onClick={() => handleTestPreview()}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-lingo-text border-2 border-lingo-border hover:bg-lingo-gray/30 rounded-xl transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {isPreviewing ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-lingo-blue border-t-transparent" />
                <span>Generating Sample...</span>
              </>
            ) : isPlaying ? (
              <>
                <span className="inline-block animate-pulse text-lingo-green">🔊</span>
                <span className="text-lingo-green">Playing Sample...</span>
              </>
            ) : (
              <>
                <span>🔊</span>
                <span>Test Voice Sample</span>
              </>
            )}
          </button>
        </div>

        <button
          type="button"
          disabled={isSaving}
          onClick={handleSave}
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-lingo-green hover:bg-lingo-green/90 rounded-xl border-b-4 border-lingo-green-dark active:border-b-0 active:mt-1 transition-all disabled:opacity-50 cursor-pointer"
        >
          {isSaving ? "Saving..." : "Save Voice Settings"}
        </button>
      </div>

      {saveSuccess && (
        <div className="p-3 bg-green-50 border border-green-200 text-green-700 text-xs font-bold rounded-xl animate-fade-in flex items-center gap-2">
          <span>✓</span>
          <span>Voice configuration saved successfully! Audio throughout the app will now use {selectedVoice}.</span>
        </div>
      )}

      {fallbackNotice && (
        <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium rounded-xl animate-fade-in flex items-center gap-2">
          <span>ℹ️</span>
          <span>{fallbackNotice}</span>
        </div>
      )}

      {previewError && !fallbackNotice && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-xs font-bold rounded-xl animate-fade-in">
          {previewError}
        </div>
      )}

      {saveError && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-xs font-bold rounded-xl animate-fade-in">
          {saveError}
        </div>
      )}
    </div>
  );
}
