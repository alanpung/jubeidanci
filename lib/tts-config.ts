export interface VoiceOption {
  id: string;
  name: string;
  description: string;
  gender: "masculine" | "feminine" | "neutral";
  tag: string;
}

export const AVAILABLE_VOICES: VoiceOption[] = [
  {
    id: "Kore",
    name: "Kore",
    description: "Calm, articulate, measured pedagogical educator (Standard Default)",
    gender: "feminine",
    tag: "Pedagogical",
  },
  {
    id: "Aoede",
    name: "Aoede",
    description: "Warm, melodic, expressive, and friendly tone",
    gender: "feminine",
    tag: "Warm & Melodic",
  },
  {
    id: "Fenrir",
    name: "Fenrir",
    description: "Deep, resonant, and authoritative tone",
    gender: "masculine",
    tag: "Deep & Powerful",
  },
  {
    id: "Puck",
    name: "Puck",
    description: "High energy, expressive, vibrant, and enthusiastic tone",
    gender: "masculine",
    tag: "Energetic",
  },
  {
    id: "Charon",
    name: "Charon",
    description: "Deep, solemn, grounded, and dramatic orator tone",
    gender: "masculine",
    tag: "Deep Orator",
  },
];

export interface VoiceStylePreset {
  id: string;
  name: string;
  template: string;
  description: string;
}

export const VOICE_STYLE_PRESETS: VoiceStylePreset[] = [
  {
    id: "default",
    name: "Standard Educator",
    description: "Clear, native pronunciation with calm, measured pacing for learners.",
    template: "Speak in {target_language} with clear, native pronunciation. Calm, measured pace for learners.",
  },
  {
    id: "deep_tech",
    name: "Tech Visionary (Elon Musk Style)",
    description: "Deep, thoughtful, direct, and analytical tone with deliberate pauses and natural rhythm.",
    template: "Speak in {target_language} in a deep, direct, thoughtful, and analytical tone with deliberate pauses, conversational cadence, and clear articulation.",
  },
  {
    id: "orator",
    name: "Bold Orator (Donald Trump Style)",
    description: "Bold, confident, punchy, dramatic inflection, and expressive emphasis.",
    template: "Speak in {target_language} with a bold, authoritative, dramatic, and highly confident orator delivery with strong emphasis and energetic cadence.",
  },
  {
    id: "energetic",
    name: "Dynamic & Enthusiastic",
    description: "High-energy, lively, upbeat, and encouraging conversational cadence.",
    template: "Speak in {target_language} with high energy, lively natural expression, vibrant cadence, and warm enthusiasm.",
  },
  {
    id: "custom",
    name: "Custom Prompt Instructions",
    description: "Write your own customized prompt instructions for the Gemini TTS model.",
    template: "",
  },
];

export interface VoiceSettingsData {
  voiceName: string;
  presetId: string;
  customInstructions: string;
  isAdmin: boolean;
}
