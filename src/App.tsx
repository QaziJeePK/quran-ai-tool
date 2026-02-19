import { useState, useCallback, useEffect, useRef } from 'react';
import { surahMeta, SurahMeta } from './data/quranMeta';
import { fetchSurah, FetchedAyah } from './utils/quranApi';
import { compareRecitation, RecitationResult, WordResult } from './utils/recitationChecker';
import { SurahSelector } from './components/SurahSelector';
import { AyahDisplay } from './components/AyahDisplay';
import { ResultsPanel } from './components/ResultsPanel';
import { RecitersPanel } from './components/RecitersPanel';
import { VoiceComparison } from './components/VoiceComparison';
import { MistakesChart } from './components/MistakesChart';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { addAttempt } from './utils/sessionHistory';

type Tab = 'listen' | 'compare';

function fmtDur(s: number) {
  const m   = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ── Volume bars ───────────────────────────────────────────────────────────────
function VolumeBars({ volume, active }: { volume: number; active: boolean }) {
  const BARS = 16;
  return (
    <div className="flex items-end gap-[2px]" style={{ height: 28 }}>
      {Array.from({ length: BARS }, (_, i) => {
        const threshold = (i / BARS) * 100;
        const lit       = active && volume > threshold;
        const h         = 3 + Math.round((i / BARS) * 22);
        let color       = '#e5e7eb';
        if (lit) {
          color = i < BARS * 0.5 ? '#10b981'
                : i < BARS * 0.8 ? '#f59e0b'
                : '#ef4444';
        }
        return (
          <div
            key={i}
            className="w-[3px] rounded-full transition-all duration-75"
            style={{ height: active ? `${h}px` : '3px', backgroundColor: color }}
          />
        );
      })}
      {active && volume > 5 && (
        <span className="text-[10px] text-emerald-500 font-bold ml-1 self-center">
          {volume}%
        </span>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════════════════════════════════════════

export function App() {
  const [activeTab, setActiveTab]             = useState<Tab>('listen');
  const [selectedSurah, setSelectedSurah]     = useState<SurahMeta | null>(surahMeta[0]);
  const [selectedAyahNum, setSelectedAyahNum] = useState(1);
  const [ayahs, setAyahs]                     = useState<FetchedAyah[]>([]);
  const [currentAyah, setCurrentAyah]         = useState<FetchedAyah | null>(null);
  const [loadingAyahs, setLoadingAyahs]       = useState(false);
  const [apiError, setApiError]               = useState<string | null>(null);

  const [result, setResult]                   = useState<RecitationResult | null>(null);
  const [wordResults, setWordResults]         = useState<WordResult[] | undefined>(undefined);
  const [showResults, setShowResults]         = useState(false);
  const [checking, setChecking]               = useState(false);
  const [chartKey, setChartKey]               = useState(0);

  const [useManual, setUseManual]             = useState(false);
  const [manualText, setManualText]           = useState('');

  const [srState, srControls] = useSpeechRecognition();
  const {
    isListening, transcript, interimTranscript,
    error: srError, isSupported, permission, duration, volume,
  } = srState;
  const { start: srStart, stop: srStop, reset: srReset } = srControls;

  const resultsRef = useRef<HTMLDivElement>(null);
  const activeText = useManual ? manualText : transcript;
  const hasText    = activeText.trim().length > 0;
  const surahLabel = selectedSurah ? `${selectedSurah.name} (${selectedSurah.nameArabic})` : '';

  // ── Load surah ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedSurah) return;
    setLoadingAyahs(true);
    setApiError(null);
    setCurrentAyah(null);
    setAyahs([]);
    setResult(null);
    setWordResults(undefined);
    setShowResults(false);
    srReset();
    setManualText('');

    fetchSurah(selectedSurah.number)
      .then(fetched => {
        setAyahs(fetched);
        const first = fetched[0] || null;
        setCurrentAyah(first);
        setSelectedAyahNum(first?.number ?? 1);
      })
      .catch(err => setApiError(String(err)))
      .finally(() => setLoadingAyahs(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSurah]);

  const handleSurahChange = useCallback((s: SurahMeta) => setSelectedSurah(s), []);

  const handleAyahChange = useCallback((num: number) => {
    setSelectedAyahNum(num);
    const ayah = ayahs.find(a => a.number === num) || null;
    setCurrentAyah(ayah);
    setResult(null);
    setWordResults(undefined);
    setShowResults(false);
    srReset();
    setManualText('');
  }, [ayahs, srReset]);

  // ── Check recitation ────────────────────────────────────────────────────────
  const handleCheck = useCallback(() => {
    if (!currentAyah || !activeText.trim()) return;
    if (isListening) srStop();
    setChecking(true);

    setTimeout(() => {
      try {
        const res = compareRecitation(currentAyah.text, activeText.trim());
        setResult(res);
        setWordResults(res.wordResults);
        setShowResults(true);

        const mistakeTypes: Record<string, number> = {};
        for (const wr of res.wordResults) {
          for (const m of wr.mistakes) {
            mistakeTypes[m.type] = (mistakeTypes[m.type] || 0) + 1;
          }
        }

        addAttempt({
          surahNumber:       selectedSurah?.number ?? 0,
          surahName:         selectedSurah?.name ?? '',
          ayahNumber:        selectedAyahNum,
          ayahText:          currentAyah.text,
          spokenText:        activeText.trim(),
          overallScore:      res.overallScore,
          grade:             res.grade,
          correctCount:      res.correctCount,
          partialCount:      res.partialCount,
          wrongCount:        res.wrongCount,
          missedCount:       res.missedCount,
          extraCount:        res.extraCount,
          totalWords:        res.totalOriginalWords,
          letterScore:       res.letterScore,
          maddScore:         res.maddScore,
          harakaScore:       res.harakaScore,
          completenessScore: res.completenessScore,
          mistakeTypes,
          duration,
        });

        setChartKey(k => k + 1);
        setTimeout(() => {
          resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
      } catch (e) {
        console.error('Check failed:', e);
      } finally {
        setChecking(false);
      }
    }, 80);
  }, [currentAyah, activeText, isListening, srStop, selectedSurah, selectedAyahNum, duration]);

  const handleReset = useCallback(() => {
    if (isListening) srStop();
    srReset();
    setManualText('');
    setResult(null);
    setWordResults(undefined);
    setShowResults(false);
  }, [isListening, srStop, srReset]);

  const handleStart = useCallback(async () => {
    setResult(null);
    setWordResults(undefined);
    setShowResults(false);
    await srStart();
  }, [srStart]);

  // ── Score colors ────────────────────────────────────────────────────────────
  const scoreColor = result
    ? result.overallScore >= 85 ? 'text-green-600'
    : result.overallScore >= 60 ? 'text-amber-600'
    : 'text-red-500'
    : '';

  const boxBorder = isListening
    ? 'border-red-400 ring-2 ring-red-100'
    : showResults && result
      ? result.overallScore >= 85 ? 'border-green-400 ring-2 ring-green-100'
        : result.overallScore >= 60 ? 'border-amber-400 ring-2 ring-amber-100'
        : 'border-red-300 ring-2 ring-red-100'
    : hasText
      ? 'border-emerald-400'
      : 'border-dashed border-gray-200';

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">

      {/* ══ HEADER ══════════════════════════════════════════════════════════════ */}
      <header className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-700 text-white">
        {/* Developer prayer bar */}
        <div className="bg-emerald-950/60 border-b border-emerald-700/50 px-4 py-2">
          <div className="max-w-3xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs">
            <p className="text-amber-300 font-medium flex items-center gap-1.5">
              <span>🤲</span>
              <span>Please pray for the developer <strong className="text-amber-200">SM Talha</strong> — may Allah accept this holy project</span>
            </p>
            <div className="flex items-center gap-3 text-emerald-400">
              <a
                href="https://darsenizami.net"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors underline underline-offset-2 font-semibold"
                title="Dars e Nizami - Islamic Education by SM Talha"
              >
                🌐 darsenizami.net
              </a>
              <a
                href="mailto:smtalhadv@gmail.com"
                className="hover:text-white transition-colors"
                title="Email: smtalhadv@gmail.com"
              >
                ✉️ smtalhadv@gmail.com
              </a>
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-5">
          <div className="flex items-center gap-3">
            <span className="text-4xl">🕌</span>
            <div>
              <h1 className="text-xl md:text-2xl font-black leading-tight">
                Quran Recitation Checker
              </h1>
              <p className="text-emerald-300 text-xs">مدقق التلاوة القرآنية — AI Tajweed Analysis</p>
            </div>
          </div>
          <p className="text-emerald-300 text-xs mt-2 opacity-80">
            114 Surahs · Word-by-word mistakes · 20 Tajweed rules · 12 Famous Reciters
          </p>
        </div>
        <div className="h-4 overflow-hidden">
          <svg viewBox="0 0 1440 16" preserveAspectRatio="none" className="w-full h-full fill-emerald-50">
            <path d="M0,16 C480,0 960,16 1440,0 L1440,16 Z" />
          </svg>
        </div>
      </header>

      {/* ══ MAIN ════════════════════════════════════════════════════════════════ */}
      <main className="max-w-3xl mx-auto px-4 py-5 space-y-4">

        {/* API error */}
        {apiError && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700 flex gap-3 items-start">
            <span className="text-xl flex-shrink-0">⚠️</span>
            <div>
              <p className="font-bold text-sm">Could not load Quran text</p>
              <p className="text-xs mt-0.5">{apiError}</p>
              <p className="text-xs mt-1 text-red-500">Check your internet connection and reload.</p>
              <button onClick={() => window.location.reload()} className="mt-2 text-xs underline font-semibold">
                Reload page
              </button>
            </div>
          </div>
        )}

        {/* ── Surah Selector ──────────────────────────────────────────────────── */}
        <SurahSelector
          selectedSurah={selectedSurah}
          selectedAyahNumber={selectedAyahNum}
          ayahCount={selectedSurah?.ayahCount ?? 0}
          onSurahChange={handleSurahChange}
          onAyahChange={handleAyahChange}
          isLoading={loadingAyahs}
        />

        {/* Loading */}
        {loadingAyahs && (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-emerald-700 font-semibold text-sm">Loading Surah…</p>
          </div>
        )}

        {!loadingAyahs && currentAyah && (
          <>
            {/* ── Ayah Display ─────────────────────────────────────────────── */}
            <AyahDisplay
              ayahText={currentAyah.text}
              ayahNumber={selectedAyahNum}
              surahName={surahLabel}
              wordResults={wordResults}
              showResults={showResults}
            />

            {/* ══════════════════════════════════════════════════════════════════
                RECORDING PANEL — directly below ayah
            ══════════════════════════════════════════════════════════════════ */}
            <section className="bg-white rounded-2xl shadow-lg border border-emerald-100 overflow-hidden">

              {/* Panel header */}
              <div
                className={`px-4 py-3 flex items-center justify-between gap-3 transition-colors duration-300 ${
                  isListening ? 'bg-red-600' : 'bg-emerald-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{isListening ? '🎙️' : '🎤'}</span>
                  <div>
                    <h2 className="text-white font-bold text-sm leading-tight">
                      {isListening ? 'Recording — Recite now…' : 'Your Recitation'}
                    </h2>
                    <p className={`text-xs ${isListening ? 'text-red-200' : 'text-emerald-300'}`}>
                      {useManual
                        ? 'Type mode — type Arabic text below'
                        : isListening
                          ? 'Speak clearly in Arabic'
                          : 'Voice or Type your recitation'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* REC timer */}
                  {isListening && (
                    <div className="flex items-center gap-1.5 bg-white/20 px-2.5 py-1 rounded-full border border-white/30">
                      <span
                        className="w-2 h-2 rounded-full bg-white flex-shrink-0"
                        style={{ animation: 'recDot 1s ease infinite' }}
                      />
                      <span className="text-white text-xs font-bold font-mono">
                        REC {fmtDur(duration)}
                      </span>
                    </div>
                  )}

                  {/* Mode toggle */}
                  {!isListening && (
                    <div className="flex bg-white/20 rounded-lg p-0.5 gap-0.5">
                      <button
                        onClick={() => setUseManual(false)}
                        className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                          !useManual ? 'bg-white text-emerald-800' : 'text-white/80 hover:text-white'
                        }`}
                      >
                        🎤 Voice
                      </button>
                      <button
                        onClick={() => { setUseManual(true); if (isListening) srStop(); }}
                        className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                          useManual ? 'bg-white text-emerald-800' : 'text-white/80 hover:text-white'
                        }`}
                      >
                        ⌨️ Type
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 space-y-3">

                {/* ── VOICE MODE ───────────────────────────────────────────── */}
                {!useManual && (
                  <>
                    {/* Browser not supported */}
                    {!isSupported && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                        <p className="text-2xl mb-2">⚠️</p>
                        <p className="font-bold text-amber-800 text-sm">
                          Voice recognition not available in this browser
                        </p>
                        <p className="text-amber-600 text-xs mt-1 mb-3">
                          Please use <strong>Google Chrome</strong> or <strong>Microsoft Edge</strong>.
                        </p>
                        <div className="flex gap-2 justify-center">
                          <a href="https://www.google.com/chrome/" target="_blank" rel="noopener noreferrer"
                            className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition">
                            Download Chrome
                          </a>
                          <a href="https://www.microsoft.com/edge" target="_blank" rel="noopener noreferrer"
                            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition">
                            Download Edge
                          </a>
                        </div>
                        <p className="text-xs text-amber-500 mt-2">Or switch to ⌨️ Type mode above.</p>
                      </div>
                    )}

                    {/* Mic blocked */}
                    {isSupported && permission === 'denied' && (
                      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                        <p className="font-bold text-red-800 text-sm flex items-center gap-1.5">
                          🔒 Microphone Blocked
                        </p>
                        <div className="text-xs text-red-700 mt-2 space-y-1.5">
                          <p>1. Click the <strong>🔒 lock icon</strong> in the browser address bar</p>
                          <p>2. Find <strong>Microphone</strong> → set to <strong>Allow</strong></p>
                          <p>3. <button onClick={() => window.location.reload()} className="underline font-bold">Refresh this page</button></p>
                        </div>
                        <p className="text-xs text-red-500 mt-2">
                          💡 Tip: Switch to ⌨️ <strong>Type mode</strong> to check without a microphone.
                        </p>
                      </div>
                    )}

                    {/* SR error */}
                    {srError && permission !== 'denied' && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                        <span className="text-base flex-shrink-0">⚠️</span>
                        <p className="text-amber-800 text-xs flex-1">{srError}</p>
                        <button onClick={handleReset}
                          className="text-xs bg-amber-200 hover:bg-amber-300 text-amber-800 px-2 py-1 rounded-full font-bold flex-shrink-0">↺</button>
                      </div>
                    )}

                    {/* Main recording UI */}
                    {isSupported && permission !== 'denied' && (
                      <>
                        {/* Transcript box */}
                        <div
                          className={`relative rounded-xl border-2 p-4 min-h-[120px] bg-white transition-all duration-300 ${boxBorder}`}
                          dir="rtl"
                        >
                          {/* Volume bars — top-left */}
                          <div className="absolute top-2 left-3" dir="ltr">
                            <VolumeBars volume={volume} active={isListening} />
                          </div>

                          {(transcript || interimTranscript) ? (
                            <div className="pt-8">
                              {transcript && (
                                <p className="text-2xl md:text-3xl text-gray-800 text-right leading-[3.5]"
                                  style={{ fontFamily: "'Amiri Quran','Amiri',serif" }}>
                                  {transcript}
                                </p>
                              )}
                              {interimTranscript && (
                                <p className="text-xl text-gray-400 text-right italic leading-[3]"
                                  style={{ fontFamily: "'Amiri Quran','Amiri',serif" }}>
                                  {interimTranscript}
                                </p>
                              )}
                              {showResults && result && (
                                <div className="mt-3 pt-2 border-t border-gray-200 flex items-center justify-between" dir="ltr">
                                  <span className="text-xs text-gray-400">{fmtDur(duration)}</span>
                                  <span className={`text-sm font-black ${scoreColor}`}>
                                    {result.overallScore}% — {result.grade}
                                  </span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center h-16 gap-2" dir="ltr">
                              {isListening ? (
                                <>
                                  <div className="flex items-end gap-1 h-8">
                                    {[1,2,3,4,5].map(i => (
                                      <div key={i} className="w-1.5 bg-red-400 rounded-full"
                                        style={{
                                          animation: `micBar 0.8s ease-in-out infinite alternate`,
                                          animationDelay: `${i * 0.12}s`,
                                          height: `${20 + i * 8}%`,
                                        }}
                                      />
                                    ))}
                                  </div>
                                  <p className="text-emerald-600 text-xs font-semibold">
                                    🟢 Listening — recite the highlighted ayah
                                  </p>
                                </>
                              ) : (
                                <p className="text-gray-400 text-xs text-center">
                                  {permission === 'granted'
                                    ? 'Tap "Start Reciting" and speak the ayah'
                                    : 'Tap "Start Reciting" — your browser will ask for mic access'}
                                </p>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <button
                            onClick={isListening ? srStop : handleStart}
                            disabled={checking}
                            className={`relative flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm transition-all shadow-md disabled:opacity-50 ${
                              isListening
                                ? 'bg-red-500 hover:bg-red-600 text-white'
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white hover:scale-105 active:scale-95'
                            }`}
                          >
                            {isListening ? (
                              <>
                                <span className="w-3 h-3 bg-white rounded-sm flex-shrink-0" />
                                Stop Recording
                                <span className="absolute inset-0 rounded-full bg-red-400 opacity-20 pointer-events-none"
                                  style={{ animation: 'recPing 1.4s ease infinite' }} />
                              </>
                            ) : (
                              <><span>🎤</span> Start Reciting</>
                            )}
                          </button>

                          <button
                            onClick={handleCheck}
                            disabled={!hasText || isListening || checking}
                            className="flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all hover:scale-105 active:scale-95 disabled:bg-gray-300 disabled:cursor-not-allowed disabled:scale-100 disabled:shadow-none"
                          >
                            {checking ? (
                              <>
                                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Checking…
                              </>
                            ) : (
                              <><span>🔍</span> Check</>
                            )}
                          </button>

                          {(transcript || showResults) && !isListening && (
                            <button onClick={handleReset}
                              className="flex items-center gap-2 px-5 py-3 rounded-full font-bold text-sm bg-gray-100 hover:bg-gray-200 text-gray-600 transition-all border border-gray-200">
                              ↺ Reset
                            </button>
                          )}
                        </div>

                        {/* Tips */}
                        {!isListening && !transcript && (
                          <div className="flex flex-wrap gap-1.5 justify-center">
                            {[
                              '🌐 Chrome or Edge only',
                              '🔇 Quiet environment',
                              '🗣️ Speak clearly in Arabic',
                              '📱 Allow mic when prompted',
                            ].map(t => (
                              <span key={t} className="bg-gray-100 text-gray-500 rounded-full text-xs px-2.5 py-0.5">{t}</span>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}

                {/* ── TYPE MODE ─────────────────────────────────────────────── */}
                {useManual && (
                  <>
                    <textarea
                      value={manualText}
                      onChange={e => {
                        setManualText(e.target.value);
                        setShowResults(false);
                        setResult(null);
                        setWordResults(undefined);
                      }}
                      placeholder="اكتب تلاوتك هنا بالعربية…"
                      dir="rtl"
                      rows={4}
                      className="w-full rounded-xl border-2 border-emerald-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 p-4 text-2xl leading-[3] resize-none outline-none transition-all"
                      style={{ fontFamily: "'Amiri Quran','Amiri',serif" }}
                    />

                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        onClick={handleCheck}
                        disabled={!hasText || checking}
                        className="flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all hover:scale-105 active:scale-95 disabled:bg-gray-300 disabled:cursor-not-allowed disabled:scale-100"
                      >
                        {checking ? (
                          <>
                            <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Checking…
                          </>
                        ) : (
                          <><span>🔍</span> Check Recitation</>
                        )}
                      </button>
                      {(manualText || showResults) && (
                        <button
                          onClick={() => { setManualText(''); setResult(null); setWordResults(undefined); setShowResults(false); }}
                          className="flex items-center gap-2 px-5 py-3 rounded-full font-bold text-sm bg-gray-100 hover:bg-gray-200 text-gray-600 transition-all border border-gray-200"
                        >
                          ↺ Clear
                        </button>
                      )}
                    </div>

                    {showResults && result && (
                      <div className={`text-center py-2 px-4 rounded-xl font-black text-sm border-2 ${
                        result.overallScore >= 85 ? 'bg-green-50 border-green-200 text-green-700'
                          : result.overallScore >= 60 ? 'bg-amber-50 border-amber-200 text-amber-700'
                          : 'bg-red-50 border-red-200 text-red-700'
                      }`}>
                        Score: {result.overallScore}% — {result.grade} ({result.gradeArabic})
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>

            {/* ══ RESULTS ══════════════════════════════════════════════════════ */}
            {showResults && result && (
              <section ref={resultsRef}>
                <ResultsPanel result={result} />
              </section>
            )}

            {/* ══ MISTAKES CHART ════════════════════════════════════════════════ */}
            <MistakesChart refreshKey={chartKey} />

            {/* ══ TABS ══════════════════════════════════════════════════════════ */}
            <div>
              <div className="flex gap-2 bg-white rounded-2xl p-1.5 shadow border border-gray-100">
                <button
                  onClick={() => setActiveTab('listen')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-bold text-sm transition-all ${
                    activeTab === 'listen' ? 'bg-blue-600 text-white shadow' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  <span>🎧</span> Famous Reciters
                </button>
                <button
                  onClick={() => setActiveTab('compare')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-bold text-sm transition-all ${
                    activeTab === 'compare' ? 'bg-purple-600 text-white shadow' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  <span>🆚</span> Voice Compare
                </button>
              </div>

              <div className="mt-3">
                {activeTab === 'listen' && (
                  <RecitersPanel
                    surahNumber={selectedSurah?.number ?? 1}
                    ayahNumber={selectedAyahNum}
                    surahName={surahLabel}
                    ayahText={currentAyah.text}
                  />
                )}
                {activeTab === 'compare' && (
                  <VoiceComparison
                    surahNumber={selectedSurah?.number ?? 1}
                    ayahNumber={selectedAyahNum}
                    surahName={surahLabel}
                    ayahText={currentAyah.text}
                  />
                )}
              </div>
            </div>
          </>
        )}
      </main>

      {/* ══ FOOTER ══════════════════════════════════════════════════════════════ */}
      <footer className="bg-emerald-900 text-white mt-10 px-4">

        {/* Quranic verse */}
        <div className="max-w-3xl mx-auto pt-8 pb-4 text-center border-b border-emerald-700/50">
          <p className="text-3xl mb-1" style={{ fontFamily: "'Amiri Quran','Amiri',serif" }}>
            وَرَتِّلِ الْقُرْآنَ تَرْتِيلًا
          </p>
          <p className="text-emerald-300 text-sm">
            "And recite the Quran with measured recitation." — Al-Muzzammil 73:4
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-4 text-xs text-emerald-500">
            <span>📖 114 Surahs</span>
            <span>📚 20 Tajweed Rules</span>
            <span>🎧 12 Famous Reciters</span>
            <span>📊 Live Analytics</span>
          </div>
        </div>

        {/* Developer section */}
        <div className="max-w-3xl mx-auto py-6 border-b border-emerald-700/50">
          <div className="bg-emerald-800/50 rounded-2xl p-5 border border-emerald-700/50">
            {/* Prayer request */}
            <div className="text-center mb-4">
              <div className="text-3xl mb-2">🤲</div>
              <p className="text-amber-300 font-bold text-base">
                Please Pray for the Developer — SM Talha
              </p>
              <p className="text-emerald-300 text-sm mt-1 max-w-xl mx-auto leading-relaxed">
                This tool was built as a <em>holy project</em> to help Muslims perfect their Quranic recitation.
                May Allah accept this work, forgive the developer's sins, and make it a source of
                <strong className="text-amber-200"> Sadaqah Jariyah</strong> (continuous reward). آمين
              </p>
              <p className="text-emerald-400 text-xs mt-2" style={{ fontFamily: "'Amiri',serif" }}>
                اللهم اجعل هذا العمل في ميزان حسنات من صنعه وانفع به المسلمين
              </p>
            </div>

            {/* Developer info grid */}
            <div className="grid sm:grid-cols-3 gap-3 text-center text-sm">
              <div className="bg-emerald-900/50 rounded-xl p-3 border border-emerald-700/30">
                <div className="text-lg mb-1">👨‍💻</div>
                <p className="text-emerald-400 text-xs font-semibold uppercase tracking-wide mb-1">Developer</p>
                <p className="text-white font-bold">Syed Muhammad Talha</p>
                <p className="text-emerald-400 text-xs mt-0.5">SM Talha</p>
              </div>

              <div className="bg-emerald-900/50 rounded-xl p-3 border border-emerald-700/30">
                <div className="text-lg mb-1">📞</div>
                <p className="text-emerald-400 text-xs font-semibold uppercase tracking-wide mb-1">Contact</p>
                <a
                  href="tel:+923132020392"
                  className="text-white font-bold hover:text-amber-300 transition-colors block"
                  title="Call SM Talha"
                >
                  +92 313 2020392
                </a>
                <a
                  href="mailto:smtalhadv@gmail.com"
                  className="text-emerald-400 text-xs hover:text-white transition-colors mt-0.5 block"
                  title="Email SM Talha"
                >
                  smtalhadv@gmail.com
                </a>
              </div>

              <div className="bg-emerald-900/50 rounded-xl p-3 border border-emerald-700/30">
                <div className="text-lg mb-1">🌐</div>
                <p className="text-emerald-400 text-xs font-semibold uppercase tracking-wide mb-1">Website</p>
                <a
                  href="https://darsenizami.net"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-300 font-bold hover:text-white transition-colors block underline underline-offset-2"
                  title="Dars e Nizami — Islamic Education by SM Talha"
                >
                  darsenizami.net
                </a>
                <p className="text-emerald-400 text-xs mt-0.5">Dars e Nizami Islamic</p>
              </div>
            </div>

            {/* Contribute CTA */}
            <div className="mt-4 text-center">
              <p className="text-emerald-300 text-xs mb-2">
                💡 Want to contribute to this holy project or suggest improvements?
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <a
                  href="mailto:smtalhadv@gmail.com?subject=Quran Checker — Contribution"
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-emerald-900 rounded-full text-xs font-bold transition-all hover:scale-105 shadow-lg"
                >
                  ✉️ Contribute to Holy Project
                </a>
                <a
                  href="https://darsenizami.net"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full text-xs font-bold transition-all hover:scale-105 border border-emerald-500"
                >
                  🌐 Visit darsenizami.net
                </a>
                <a
                  href="tel:+923132020392"
                  className="px-4 py-2 bg-transparent border border-emerald-500 hover:bg-emerald-700 text-white rounded-full text-xs font-bold transition-all"
                >
                  📞 Call SM Talha
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Copyright bar */}
        <div className="max-w-3xl mx-auto py-4 text-center">
          <p className="text-emerald-500 text-xs leading-relaxed">
            © {new Date().getFullYear()} <strong className="text-emerald-300">Syed Muhammad Talha (SM Talha)</strong> — All rights reserved.
            Built with ❤️ for the Ummah. |{' '}
            <a
              href="https://darsenizami.net"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-400 hover:text-amber-200 transition-colors underline underline-offset-2 font-semibold"
            >
              darsenizami.net
            </a>
            {' '}| <a href="mailto:smtalhadv@gmail.com" className="text-emerald-400 hover:text-white transition-colors">smtalhadv@gmail.com</a>
            {' '}| <a href="tel:+923132020392" className="text-emerald-400 hover:text-white transition-colors">+92 313 2020392</a>
          </p>
          <p className="text-emerald-700 text-xs mt-1">
            Quran Recitation Checker · AI Tajweed Detector · 114 Surahs · 12 Famous Reciters · Voice Comparison
          </p>
        </div>
      </footer>

      {/* ── Global keyframe animations ─────────────────────────────────────── */}
      <style>{`
        @keyframes recPing {
          0%   { transform: scale(1);   opacity: 0.5; }
          100% { transform: scale(2.4); opacity: 0;   }
        }
        @keyframes recDot {
          0%, 100% { opacity: 1;   }
          50%       { opacity: 0.2; }
        }
        @keyframes micBar {
          0%   { height: 20%; }
          100% { height: 90%; }
        }
      `}</style>
    </div>
  );
}
