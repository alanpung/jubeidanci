/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Volume2,
  RefreshCw,
  Send,
  ArrowRight,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Sparkles,
  Heart,
  Flame,
  Plus
} from 'lucide-react';

// The 8 Exercise Types directly from alanpung/alanlingo app/page.tsx
const EXERCISE_TYPES = [
  {
    num: "1",
    icon: "🎯",
    nameZh: "多项选择",
    nameEn: "Multiple choice",
    desc: "根据题目选择最符合语境的选项。",
  },
  {
    num: "2",
    icon: "✏️",
    nameZh: "填空练习",
    nameEn: "Fill in the blank",
    desc: "在句子的空格处填入正确的单词，巩固语法和词汇。",
  },
  {
    num: "3",
    icon: "🧩",
    nameZh: "单词配对",
    nameEn: "Matching pairs",
    desc: "将英语单词与中文释义进行连线匹配（最适合用来学习新词汇）。",
  },
  {
    num: "4",
    icon: "🎧",
    nameZh: "听力理解",
    nameEn: "Listening (TTS-powered)",
    desc: "听标准英语发音并写下内容，或通过单选、拼句形式进行练习。",
  },
  {
    num: "5",
    icon: "🧱",
    nameZh: "单词拼句",
    nameEn: "Word bank",
    desc: "用零散的单词卡片，按正确的语序拼接成完整的句子。",
  },
  {
    num: "6",
    icon: "🎙️",
    nameZh: "口语朗读",
    nameEn: "Speaking (STT with feedback)",
    desc: "看着英文句子大声读出来，练习发音与流利度。",
  },
  {
    num: "7",
    icon: "🎴",
    nameZh: "闪卡复习",
    nameEn: "Flashcard review",
    desc: "经典的双面记忆卡片，用于间隔重复（SRS）的高效复习。",
  },
  {
    num: "8",
    icon: "🌐",
    nameZh: "句子翻译",
    nameEn: "Translation",
    desc: "根据题目将句子准确翻译，支持多种符合语境的表达与智能匹配。",
  },
];

// Original Navigation Items from components/layout/sidebar.tsx
const NAV_ITEMS = [
  { id: "chat", label: "Chat", icon: "💬" },
  { id: "library", label: "Library", icon: "📚" },
  { id: "read", label: "Read", icon: "📖" },
  { id: "words", label: "Words", icon: "🔤" },
  { id: "progress", label: "Progress", icon: "📊" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

export default function App() {
  // Navigation view: 'landing' or inside the app ('library' | 'chat' | 'read' | 'words' | 'progress' | 'settings')
  const [currentRoute, setCurrentRoute] = useState<string>('landing');
  const [targetLang, setTargetLang] = useState('Spanish');
  const [nativeLang, setNativeLang] = useState('English');
  const [cefrLevel, setCefrLevel] = useState('A2');

  // User Stats from AlanLingo
  const [streak, setStreak] = useState(5);
  const [wordsLearned, setWordsLearned] = useState(142);
  const [xp, setXp] = useState(850);
  const [hearts, setHearts] = useState(5);

  // Standalone units in Library
  const [units, setUnits] = useState([
    {
      id: "unit-1",
      title: "Unit 1: Common Greetings & Daily Phrases",
      level: "A1",
      description: "Learn essential greetings, polite expressions, and everyday conversational starters.",
      lessons: 4,
      completed: 4,
      exercises: [
        {
          id: 1,
          question: 'What does "Buenos días" mean?',
          options: ["Good morning", "Good night", "See you later", "Thank you"],
          correct: 0,
          explanation: '"Buenos días" translates directly to "Good morning".'
        },
        {
          id: 2,
          question: 'Select the right response to "¿Cómo estás?":',
          options: ["Por favor", "Muy bien, gracias", "Hasta mañana", "De nada"],
          correct: 1,
          explanation: '"Muy bien, gracias" means "Very well, thank you".'
        }
      ]
    },
    {
      id: "unit-2",
      title: "Unit 2: Coffee Shop & Dining Out",
      level: "A1",
      description: "Order coffee, snacks, ask for the bill, and express food preferences.",
      lessons: 5,
      completed: 2,
      exercises: [
        {
          id: 3,
          question: 'How do you say "A coffee with milk, please"?',
          options: ["Un té frío", "Un café con leche, por favor", "Quiero agua", "La cuenta"],
          correct: 1,
          explanation: '"Un café con leche, por favor" is the polite standard phrasing.'
        }
      ]
    },
    {
      id: "unit-3",
      title: "Unit 3: Navigating Transit & Directions",
      level: "A2",
      description: "Ask for directions, buy subway and bus tickets, and find your way around.",
      lessons: 6,
      completed: 0,
      exercises: [
        {
          id: 4,
          question: 'What does "¿Dónde está la estación?" mean?',
          options: ["Where is the restaurant?", "Where is the station?", "How much is the ticket?", "When is the train?"],
          correct: 1,
          explanation: '"Estación" means "station".'
        }
      ]
    }
  ]);

  // Exercise Runner State
  const [activeUnit, setActiveUnit] = useState<any>(null);
  const [currentExIndex, setCurrentExIndex] = useState(0);
  const [selectedOpt, setSelectedOpt] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);

  // AI Unit Creator state
  const [showUnitCreator, setShowUnitCreator] = useState(false);
  const [creatorTopic, setCreatorTopic] = useState('');
  const [isCreatingUnit, setIsCreatingUnit] = useState(false);

  // SRS Flashcard deck
  const [flashcards, setFlashcards] = useState([
    { id: 1, word: "imprescindible", translation: "essential / indispensable", cefr: "B2", example: "El agua es imprescindible para la vida cotidiana." },
    { id: 2, word: "desarrollar", translation: "to develop / to build", cefr: "B1", example: "Buscamos desarrollar nuevas herramientas cada mes." },
    { id: 3, word: "desafío", translation: "challenge / obstacle", cefr: "B1", example: "Aprender un idioma es un desafío gratificante." },
    { id: 4, word: "cotidiano", translation: "daily / everyday", cefr: "B2", example: "Es parte de nuestra rutina cotidiana." },
    { id: 5, word: "sencillo", translation: "simple / easy", cefr: "A2", example: "Este ejercicio de práctica es muy sencillo." }
  ]);
  const [cardIndex, setCardIndex] = useState(0);
  const [cardFlipped, setCardFlipped] = useState(false);

  // Chat Tutor
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'tutor'; content: string }>>([
    {
      role: 'tutor',
      content: '¡Hola! Soy tu tutor de jubeidanci. ¿Cómo estás hoy? ¿De qué te gustaría hablar en español?'
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Speech TTS
  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = targetLang === 'Spanish' ? 'es-ES' : targetLang === 'French' ? 'fr-FR' : 'en-US';
      window.speechSynthesis.speak(u);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const newMsgs = [...chatMessages, { role: 'user' as const, content: chatInput.trim() }];
    setChatMessages(newMsgs);
    setChatInput('');
    setChatLoading(true);

    try {
      const res = await fetch('/api/tutor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMsgs,
          targetLanguage: targetLang,
          learnerLevel: cefrLevel
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setChatMessages([...newMsgs, { role: 'tutor', content: data.reply }]);
      setXp(x => x + 15);
    } catch {
      setChatMessages([
        ...newMsgs,
        { role: 'tutor', content: 'Lo siento, tuve un problema de conexión. ¿Puedes repetirlo?' }
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleCreateAiUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creatorTopic.trim()) return;
    setIsCreatingUnit(true);

    try {
      const res = await fetch('/api/tutor/create-unit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: creatorTopic,
          language: targetLang,
          level: cefrLevel
        })
      });
      const data = await res.json();

      const newUnit = {
        id: `unit-${Date.now()}`,
        title: data.title || `Unit: ${creatorTopic}`,
        level: cefrLevel,
        description: data.description || `AI generated unit on ${creatorTopic}`,
        lessons: 3,
        completed: 0,
        exercises: (data.exercises || []).map((ex: any, idx: number) => ({
          id: idx + 1,
          question: ex.question || ex.prompt || 'Choose the best answer',
          options: ex.options || ['Option 1', 'Option 2'],
          correct: 0,
          explanation: ex.explanation || 'Correct!'
        }))
      };

      setUnits([newUnit, ...units]);
      setShowUnitCreator(false);
      setCreatorTopic('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsCreatingUnit(false);
    }
  };

  // ----------------------------------------------------
  // ORIGINAL LANDING PAGE VIEW (from app/page.tsx)
  // ----------------------------------------------------
  if (currentRoute === 'landing') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-between bg-[#f7f7f7] px-4 py-8 text-[#3c3c3c]">
        {/* Main content */}
        <main className="max-w-4xl w-full text-center flex flex-col items-center justify-center my-auto pt-6 pb-8">
          
          {/* Header with bouncing character and Rainbow Title */}
          <div className="overflow-visible mb-6 flex flex-col items-center gap-3">
            <img
              src="/icon.svg"
              alt="jubeidanci"
              className="w-24 h-24 drop-shadow-md animate-bounce-short cursor-pointer"
              onClick={() => setCurrentRoute('library')}
            />
            <h1 className="relative z-20 text-6xl font-black text-rainbow tracking-tight pb-1 inline-block leading-snug overflow-visible select-none">
              jubeidanci
            </h1>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
            <button
              onClick={() => setCurrentRoute('library')}
              className="inline-flex items-center justify-center rounded-2xl bg-[#58CC02] px-8 py-3 text-lg font-bold uppercase text-white border-b-4 border-[#46a302] hover:bg-[#58CC02]/90 active:border-b-0 active:translate-y-1 transition-all cursor-pointer shadow-sm"
            >
              Get Started
            </button>
            <button
              onClick={() => setCurrentRoute('library')}
              className="inline-flex items-center justify-center rounded-2xl bg-white px-8 py-3 text-lg font-bold uppercase text-[#58CC02] border-2 border-[#e5e5e5] hover:bg-[#e5e5e5]/30 active:translate-y-0.5 transition-all cursor-pointer shadow-xs"
            >
              I Already Have an Account
            </button>
          </div>

          {/* Exercise Types Cards (exact 8 types from app/page.tsx) */}
          <div className="w-full text-left">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {EXERCISE_TYPES.map((item) => (
                <div
                  key={item.num}
                  onClick={() => setCurrentRoute('library')}
                  className="rounded-2xl border-2 border-[#e5e5e5] bg-white p-4 shadow-xs hover:border-[#1CB0F6]/40 transition-colors flex flex-col justify-between cursor-pointer group"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl" aria-hidden="true">
                          {item.icon}
                        </span>
                        <div>
                          <div className="font-extrabold text-base text-[#3c3c3c] leading-tight group-hover:text-[#1CB0F6] transition-colors">
                            {item.nameZh}
                          </div>
                          <div className="text-xs font-semibold text-[#1CB0F6]">
                            {item.nameEn}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs font-black text-[#777777]/60 bg-[#f7f7f7] rounded-full w-6 h-6 flex items-center justify-center border border-[#e5e5e5]">
                        {item.num}
                      </span>
                    </div>
                    <p className="text-xs text-[#777777] leading-relaxed mt-2">
                      {item.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="w-full flex items-center justify-center pb-4 pt-6">
          <button 
            onClick={() => setCurrentRoute('library')} 
            className="text-xs font-bold text-[#777777] hover:text-[#3c3c3c] transition-colors"
          >
            jubeidanci &middot; Open-source AI Language Platform
          </button>
        </footer>
      </div>
    );
  }

  // ----------------------------------------------------
  // ORIGINAL MAIN APP VIEW (Sidebar + TopBar + Pages)
  // ----------------------------------------------------
  return (
    <div className="min-h-screen bg-[#f7f7f7] flex flex-col md:flex-row text-[#3c3c3c] font-sans">
      
      {/* Desktop Sidebar (from components/layout/sidebar.tsx) */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 border-r-2 border-[#e5e5e5] bg-white z-30">
        <div className="flex h-16 items-center px-6">
          <button 
            onClick={() => setCurrentRoute('landing')} 
            className="flex items-center gap-2.5 group cursor-pointer"
          >
            <img
              src="/icon.svg"
              alt="jubeidanci"
              className="w-9 h-9 transition-transform group-hover:scale-105"
            />
            <span className="text-2xl font-black text-rainbow tracking-tight">
              jubeidanci
            </span>
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = currentRoute === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentRoute(item.id)}
                className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-base font-bold transition-colors cursor-pointer text-left ${
                  active
                    ? "bg-[#1CB0F6]/10 text-[#1CB0F6] border-2 border-[#1CB0F6]/20"
                    : "text-[#777777] hover:bg-[#e5e5e5]/50"
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Back to landing link */}
        <div className="p-4 border-t border-[#e5e5e5]">
          <button
            onClick={() => setCurrentRoute('landing')}
            className="w-full text-xs font-bold text-[#777777] hover:text-[#3c3c3c] text-left transition-colors cursor-pointer"
          >
            &larr; Landing Page
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col md:pl-64 min-h-0 w-full max-w-full overflow-x-hidden">
        
        {/* TopBar (from components/layout/top-bar.tsx) */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b-2 border-[#e5e5e5] bg-white px-4 md:px-6">
          {/* Mobile Logo */}
          <div className="md:hidden">
            <button 
              onClick={() => setCurrentRoute('landing')} 
              className="flex items-center gap-2 cursor-pointer"
            >
              <img
                src="/icon.svg"
                alt="jubeidanci"
                className="w-8 h-8"
              />
              <span className="text-xl font-black text-rainbow tracking-tight">
                jubeidanci
              </span>
            </button>
          </div>

          <div className="flex-1" />

          {/* Gamification Stats */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 text-[#FF9600] font-black text-sm" title="Streak">
              <Flame className="w-5 h-5 fill-current" />
              <span>{streak}</span>
            </div>

            <div className="flex items-center gap-1 text-[#1CB0F6] font-black text-sm" title="XP">
              <Sparkles className="w-5 h-5 fill-current" />
              <span>{xp}</span>
            </div>

            <div className="flex items-center gap-1 text-[#FF4B4B] font-black text-sm" title="Hearts">
              <Heart className="w-5 h-5 fill-current" />
              <span>{hearts}</span>
            </div>

            <button
              onClick={() => setCurrentRoute('landing')}
              className="rounded-xl px-3 py-1.5 text-xs font-bold text-[#777777] hover:bg-[#e5e5e5]/50 transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </header>

        {/* Page Content Container */}
        <div className="p-4 sm:p-6 lg:p-8 max-w-3xl w-full mx-auto pb-24 md:pb-8 flex-1">
          
          {/* 1. LIBRARY / UNITS VIEW */}
          {currentRoute === 'library' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-black text-[#3c3c3c]">My Library</h1>
                  <p className="text-xs text-[#777777] mt-0.5">Standalone units & structured curriculum</p>
                </div>
                <button
                  onClick={() => setShowUnitCreator(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#58CC02] bg-[#58CC02] px-4 py-2 text-xs font-black uppercase text-white shadow-[0_2px_0_0] shadow-green-700 hover:bg-[#58CC02]/90 active:translate-y-[1px] transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  <span>Create Unit</span>
                </button>
              </div>

              {/* Units List */}
              <div className="space-y-4">
                {units.map((unit, idx) => (
                  <div
                    key={unit.id}
                    className="bg-white rounded-2xl border-2 border-[#e5e5e5] p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-[#f7f7f7] border border-[#e5e5e5] text-[#1CB0F6]">
                          {unit.level}
                        </span>
                        <h3 className="font-extrabold text-base text-[#3c3c3c]">
                          {unit.title}
                        </h3>
                      </div>
                      <p className="text-xs text-[#777777] mt-1.5 leading-relaxed">
                        {unit.description}
                      </p>
                      <div className="flex items-center gap-3 mt-3 text-xs font-semibold text-[#777777]">
                        <span>{unit.completed}/{unit.lessons} Lessons</span>
                        <span>&middot;</span>
                        <span className="text-[#58CC02] font-bold">+100 XP</span>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setActiveUnit(unit);
                        setCurrentExIndex(0);
                        setSelectedOpt(null);
                        setFeedback(null);
                      }}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#1CB0F6] px-5 py-2.5 text-xs font-black uppercase text-white border-b-4 border-[#1899d6] hover:bg-[#1CB0F6]/90 active:border-b-0 active:translate-y-1 transition-all cursor-pointer shrink-0"
                    >
                      <span>Practice</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. CHAT / AI TUTOR VIEW */}
          {currentRoute === 'chat' && (
            <div className="bg-white rounded-3xl border-2 border-[#e5e5e5] shadow-xs flex flex-col h-[600px] overflow-hidden">
              <div className="p-4 border-b-2 border-[#e5e5e5] bg-[#f7f7f7] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">💬</span>
                  <div>
                    <h2 className="text-sm font-black text-[#3c3c3c]">AI Conversational Tutor</h2>
                    <p className="text-[11px] font-bold text-[#58CC02]">Active &middot; {targetLang} ({cefrLevel})</p>
                  </div>
                </div>
                <button
                  onClick={() => setChatMessages([
                    { role: 'tutor', content: `¡Hola! ¿Cómo estás hoy? Practiquemos ${targetLang}.` }
                  ])}
                  className="text-xs font-bold text-[#777777] hover:text-[#3c3c3c] flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl p-3.5 text-sm font-medium leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-[#1CB0F6] text-white rounded-tr-none'
                          : 'bg-[#f7f7f7] text-[#3c3c3c] border-2 border-[#e5e5e5] rounded-tl-none'
                      }`}
                    >
                      {msg.content}
                      {msg.role === 'tutor' && (
                        <button
                          onClick={() => speakText(msg.content)}
                          className="mt-2 text-xs text-[#1CB0F6] font-bold flex items-center gap-1 cursor-pointer hover:underline"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>Listen</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-[#f7f7f7] border-2 border-[#e5e5e5] rounded-2xl p-3 text-xs font-bold text-[#777777] flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#1CB0F6]" />
                      <span>Tutor is thinking...</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <form onSubmit={handleSendChat} className="p-3 border-t-2 border-[#e5e5e5] flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={`Chat in ${targetLang}...`}
                  className="flex-1 bg-[#f7f7f7] border-2 border-[#e5e5e5] rounded-xl px-4 py-2.5 text-sm text-[#3c3c3c] focus:outline-none focus:border-[#1CB0F6]"
                />
                <button
                  type="submit"
                  disabled={chatLoading || !chatInput.trim()}
                  className="px-5 bg-[#58CC02] border-b-4 border-[#46a302] text-white rounded-xl font-black text-sm uppercase hover:bg-[#58CC02]/90 active:border-b-0 active:translate-y-1 transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}

          {/* 3. WORDS / SRS VIEW */}
          {currentRoute === 'words' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between bg-white p-4 rounded-2xl border-2 border-[#e5e5e5]">
                <div>
                  <h1 className="text-xl font-black text-[#3c3c3c]">Spaced Repetition Deck</h1>
                  <p className="text-xs text-[#777777]">SM-2 Algorithm scheduling</p>
                </div>
                <span className="text-xs font-black text-[#58CC02]">
                  {wordsLearned} Words Mastered
                </span>
              </div>

              {flashcards[cardIndex] && (
                <div className="flex flex-col items-center">
                  <div
                    onClick={() => setCardFlipped(!cardFlipped)}
                    className="w-full max-w-md min-h-[260px] bg-white rounded-3xl border-3 border-[#e5e5e5] p-6 shadow-xs flex flex-col justify-between items-center text-center cursor-pointer hover:border-[#1CB0F6] transition-all select-none"
                  >
                    <div className="w-full flex items-center justify-between text-xs font-bold text-[#777777]">
                      <span className="text-[#1CB0F6] font-black">{flashcards[cardIndex].cefr}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          speakText(flashcards[cardIndex].word);
                        }}
                        className="p-1.5 rounded-lg hover:bg-[#f7f7f7] text-[#1CB0F6] cursor-pointer"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="my-auto py-4">
                      <h2 className="text-3xl font-black text-[#3c3c3c]">
                        {flashcards[cardIndex].word}
                      </h2>
                      {cardFlipped ? (
                        <div className="mt-3">
                          <p className="text-lg font-bold text-[#58CC02]">
                            {flashcards[cardIndex].translation}
                          </p>
                          <p className="text-xs text-[#777777] italic mt-2">
                            "{flashcards[cardIndex].example}"
                          </p>
                        </div>
                      ) : (
                        <p className="text-[11px] font-bold text-[#777777]/60 mt-3 uppercase tracking-wider">
                          Click to reveal meaning
                        </p>
                      )}
                    </div>

                    <span className="text-[10px] text-[#777777] font-bold">
                      {cardIndex + 1} / {flashcards.length}
                    </span>
                  </div>

                  {/* Interval Ratings */}
                  <div className="grid grid-cols-4 gap-2 w-full max-w-md mt-4">
                    <button
                      onClick={() => {
                        setCardFlipped(false);
                        setCardIndex((cardIndex + 1) % flashcards.length);
                      }}
                      className="py-2.5 rounded-xl bg-white border-2 border-[#FF4B4B] text-[#FF4B4B] font-bold text-xs hover:bg-[#FF4B4B]/10 cursor-pointer"
                    >
                      Again
                    </button>
                    <button
                      onClick={() => {
                        setCardFlipped(false);
                        setCardIndex((cardIndex + 1) % flashcards.length);
                      }}
                      className="py-2.5 rounded-xl bg-white border-2 border-[#FF9600] text-[#FF9600] font-bold text-xs hover:bg-[#FF9600]/10 cursor-pointer"
                    >
                      Hard
                    </button>
                    <button
                      onClick={() => {
                        setCardFlipped(false);
                        setXp(x => x + 10);
                        setCardIndex((cardIndex + 1) % flashcards.length);
                      }}
                      className="py-2.5 rounded-xl bg-white border-2 border-[#1CB0F6] text-[#1CB0F6] font-bold text-xs hover:bg-[#1CB0F6]/10 cursor-pointer"
                    >
                      Good
                    </button>
                    <button
                      onClick={() => {
                        setCardFlipped(false);
                        setXp(x => x + 15);
                        setWordsLearned(w => w + 1);
                        setCardIndex((cardIndex + 1) % flashcards.length);
                      }}
                      className="py-2.5 rounded-xl bg-[#58CC02] text-white font-bold text-xs hover:bg-[#58CC02]/90 cursor-pointer"
                    >
                      Easy
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 4. READ VIEW */}
          {currentRoute === 'read' && (
            <div className="bg-white p-6 rounded-2xl border-2 border-[#e5e5e5] space-y-4">
              <h1 className="text-xl font-black text-[#3c3c3c]">Bilingual Article Reader</h1>
              <p className="text-xs text-[#777777]">Read authentic text with parallel translation</p>

              <div className="space-y-4 mt-4">
                <div className="p-4 bg-[#f7f7f7] rounded-xl border border-[#e5e5e5]">
                  <p className="text-sm font-semibold text-[#3c3c3c] leading-relaxed">
                    Barcelona es una de las ciudades más cautivadoras de Europa, famosa por su arquitectura y gastronomía mediterránea.
                  </p>
                  <p className="text-xs text-[#777777] mt-2 border-t border-[#e5e5e5] pt-2">
                    Barcelona is one of the most captivating cities in Europe, famous for its architecture and Mediterranean gastronomy.
                  </p>
                </div>
                <div className="p-4 bg-[#f7f7f7] rounded-xl border border-[#e5e5e5]">
                  <p className="text-sm font-semibold text-[#3c3c3c] leading-relaxed">
                    Pasear por el Barrio Gótico te transporta a siglos de historia con calles estrechas y plazas llenas de vida.
                  </p>
                  <p className="text-xs text-[#777777] mt-2 border-t border-[#e5e5e5] pt-2">
                    Strolling through the Gothic Quarter transports you through centuries of history with narrow streets and lively plazas.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 5. PROGRESS VIEW */}
          {currentRoute === 'progress' && (
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-2xl border-2 border-[#e5e5e5]">
                <h1 className="text-xl font-black text-[#3c3c3c]">Study Performance</h1>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                  <div className="bg-[#f7f7f7] p-3 rounded-xl text-center">
                    <p className="text-2xl font-black text-[#FF9600]">{streak}</p>
                    <p className="text-[11px] font-bold text-[#777777]">Day Streak</p>
                  </div>
                  <div className="bg-[#f7f7f7] p-3 rounded-xl text-center">
                    <p className="text-2xl font-black text-[#1CB0F6]">{xp}</p>
                    <p className="text-[11px] font-bold text-[#777777]">Total XP</p>
                  </div>
                  <div className="bg-[#f7f7f7] p-3 rounded-xl text-center">
                    <p className="text-2xl font-black text-[#58CC02]">{wordsLearned}</p>
                    <p className="text-[11px] font-bold text-[#777777]">Words Learned</p>
                  </div>
                  <div className="bg-[#f7f7f7] p-3 rounded-xl text-center">
                    <p className="text-2xl font-black text-[#CE82FF]">{cefrLevel}</p>
                    <p className="text-[11px] font-bold text-[#777777]">Proficiency</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 6. SETTINGS VIEW */}
          {currentRoute === 'settings' && (
            <div className="bg-white p-6 rounded-2xl border-2 border-[#e5e5e5] space-y-4">
              <h1 className="text-xl font-black text-[#3c3c3c]">Preferences</h1>
              
              <div>
                <label className="block text-xs font-bold text-[#777777] mb-1">Target Language</label>
                <select 
                  value={targetLang}
                  onChange={(e) => setTargetLang(e.target.value)}
                  className="w-full bg-[#f7f7f7] border-2 border-[#e5e5e5] rounded-xl p-2.5 text-sm font-bold text-[#3c3c3c]"
                >
                  <option value="Spanish">Spanish</option>
                  <option value="English">English</option>
                  <option value="French">French</option>
                  <option value="German">German</option>
                  <option value="Mandarin">Mandarin</option>
                  <option value="Japanese">Japanese</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#777777] mb-1">CEFR Level</label>
                <select 
                  value={cefrLevel}
                  onChange={(e) => setCefrLevel(e.target.value)}
                  className="w-full bg-[#f7f7f7] border-2 border-[#e5e5e5] rounded-xl p-2.5 text-sm font-bold text-[#3c3c3c]"
                >
                  <option value="A1">A1 - Beginner</option>
                  <option value="A2">A2 - Elementary</option>
                  <option value="B1">B1 - Intermediate</option>
                  <option value="B2">B2 - Upper Intermediate</option>
                </select>
              </div>
            </div>
          )}

        </div>

        {/* Mobile Bottom Navigation (from components/layout/mobile-nav.tsx) */}
        <nav className="fixed bottom-0 left-0 right-0 z-30 flex md:hidden border-t-2 border-[#e5e5e5] bg-white/95 backdrop-blur-md pb-2">
          {NAV_ITEMS.map((item) => {
            const active = currentRoute === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentRoute(item.id)}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-bold transition-all cursor-pointer ${
                  active ? "text-[#1CB0F6]" : "text-[#777777] hover:text-[#3c3c3c]"
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                <span className="text-[10px]">{item.label}</span>
              </button>
            );
          })}
        </nav>

      </div>

      {/* Exercise Modal Runner */}
      {activeUnit && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border-3 border-[#e5e5e5] max-w-lg w-full p-6 shadow-2xl flex flex-col justify-between min-h-[380px]">
            <div>
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => setActiveUnit(null)}
                  className="text-xs font-bold text-[#777777] hover:text-[#3c3c3c] cursor-pointer"
                >
                  ✕ Close
                </button>
                <span className="text-xs font-bold text-[#1CB0F6]">
                  {currentExIndex + 1} / {activeUnit.exercises.length}
                </span>
              </div>

              <h3 className="text-lg font-black text-[#3c3c3c] my-4">
                {activeUnit.exercises[currentExIndex]?.question}
              </h3>

              <div className="space-y-2.5">
                {activeUnit.exercises[currentExIndex]?.options.map((opt: string, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedOpt(idx)}
                    disabled={feedback !== null}
                    className={`w-full p-3.5 rounded-xl border-2 text-left font-bold text-sm transition-all cursor-pointer ${
                      selectedOpt === idx
                        ? 'border-[#1CB0F6] bg-[#1CB0F6]/10 text-[#1CB0F6]'
                        : 'border-[#e5e5e5] bg-white text-[#3c3c3c] hover:bg-[#f7f7f7]'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t-2 border-[#e5e5e5] mt-4">
              {feedback === null ? (
                <button
                  onClick={() => {
                    if (selectedOpt === null) return;
                    const correct = selectedOpt === activeUnit.exercises[currentExIndex].correct;
                    if (correct) {
                      setFeedback('correct');
                      setXp(x => x + 20);
                    } else {
                      setFeedback('wrong');
                      setHearts(h => Math.max(0, h - 1));
                    }
                  }}
                  disabled={selectedOpt === null}
                  className="w-full py-3 rounded-xl bg-[#58CC02] border-b-4 border-[#46a302] text-white font-black uppercase text-sm hover:bg-[#58CC02]/90 active:border-b-0 active:translate-y-1 transition-all disabled:opacity-50 cursor-pointer"
                >
                  Check
                </button>
              ) : (
                <div className="space-y-3">
                  <div className={`p-3 rounded-xl flex items-center gap-2 ${
                    feedback === 'correct' ? 'bg-[#58CC02]/15 text-[#58CC02]' : 'bg-[#FF4B4B]/15 text-[#FF4B4B]'
                  }`}>
                    {feedback === 'correct' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <XCircle className="w-5 h-5 shrink-0" />}
                    <span className="font-bold text-sm">
                      {feedback === 'correct' ? 'Correct! +20 XP' : 'Incorrect'}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      if (currentExIndex + 1 < activeUnit.exercises.length) {
                        setCurrentExIndex(c => c + 1);
                        setSelectedOpt(null);
                        setFeedback(null);
                      } else {
                        setActiveUnit(null);
                        setXp(x => x + 30);
                      }
                    }}
                    className="w-full py-3 rounded-xl bg-[#1CB0F6] border-b-4 border-[#1899d6] text-white font-black uppercase text-sm hover:bg-[#1CB0F6]/90 active:border-b-0 active:translate-y-1 transition-all cursor-pointer"
                  >
                    Continue
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AI Unit Creator Modal */}
      {showUnitCreator && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border-3 border-[#e5e5e5] max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#58CC02]" />
                <h3 className="text-base font-black text-[#3c3c3c]">Generate AI Unit</h3>
              </div>
              <button onClick={() => setShowUnitCreator(false)} className="text-xs font-bold text-[#777777] cursor-pointer">✕</button>
            </div>

            <form onSubmit={handleCreateAiUnit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#777777] mb-1">Topic</label>
                <input
                  type="text"
                  value={creatorTopic}
                  onChange={(e) => setCreatorTopic(e.target.value)}
                  placeholder="e.g. Benefits of open source software"
                  className="w-full bg-[#f7f7f7] border-2 border-[#e5e5e5] rounded-xl px-3 py-2 text-sm text-[#3c3c3c] focus:outline-none focus:border-[#58CC02]"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isCreatingUnit}
                className="w-full py-2.5 bg-[#58CC02] border-b-4 border-[#46a302] text-white font-black uppercase text-xs rounded-xl hover:bg-[#58CC02]/90 active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isCreatingUnit ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>{isCreatingUnit ? 'Generating...' : 'Create Unit'}</span>
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
