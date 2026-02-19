import { WordResult, statusColorClasses, statusIcon } from '../utils/recitationChecker';
import { TAJWEED_RULES } from '../utils/tajweedEngine';

interface AyahDisplayProps {
  ayahText: string;
  ayahNumber: number;
  surahName: string;
  wordResults?: WordResult[];
  showResults: boolean;
}

export function AyahDisplay({ ayahText, ayahNumber, surahName, wordResults, showResults }: AyahDisplayProps) {
  if (!ayahText) {
    return (
      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-10 shadow-lg border border-emerald-100 text-center">
        <div className="text-6xl mb-4">📖</div>
        <p className="text-emerald-600 text-lg">Select a Surah and Ayah to begin your recitation practice</p>
      </div>
    );
  }

  const words = ayahText.split(/\s+/).filter(Boolean);
  // Map only non-extra results (those with original words)
  const origResults = wordResults ? wordResults.filter(w => w.original !== '') : [];

  const getWordStyle = (index: number): string => {
    if (!showResults || !origResults) return '';
    const r = origResults[index];
    if (!r) return '';
    switch (r.status) {
      case 'correct': return 'text-green-700 bg-green-100 rounded-lg px-1';
      case 'partial': return 'text-amber-700 bg-amber-100 rounded-lg px-1';
      case 'wrong':   return 'text-red-700 bg-red-100 rounded-lg px-1 underline decoration-red-400 decoration-wavy';
      case 'missed':  return 'text-gray-400 bg-gray-100 rounded-lg px-1 line-through opacity-60';
      default:        return '';
    }
  };

  return (
    <div className="bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 rounded-2xl shadow-lg border border-emerald-100 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-700 to-teal-600 px-6 py-3 flex items-center justify-between flex-wrap gap-2">
        <div>
          <span className="text-white font-bold text-base">{surahName}</span>
          <span className="text-emerald-200 ml-2 text-sm">– Ayah {ayahNumber}</span>
        </div>
        {showResults && (
          <div className="flex items-center gap-3 text-xs text-white">
            <LegendDot color="bg-green-400" label="Correct" />
            <LegendDot color="bg-amber-400" label="Partial" />
            <LegendDot color="bg-red-400" label="Wrong" />
            <LegendDot color="bg-gray-400" label="Missed" />
          </div>
        )}
      </div>

      {/* Arabic Text */}
      <div className="p-6 md:p-8" dir="rtl">
        <p
          className="text-center leading-[3.8] tracking-wide select-text"
          style={{ fontFamily: "'Amiri Quran', 'Amiri', serif", fontSize: 'clamp(1.5rem, 3.5vw, 2.5rem)' }}
        >
          {words.map((word, index) => {
            const r = showResults ? origResults[index] : undefined;
            return (
              <span
                key={index}
                className={`inline-block mx-1 transition-all duration-300 cursor-default group relative ${getWordStyle(index)}`}
              >
                {word}
                {/* Tajweed dot indicator */}
                {r && r.tajweed.annotations.length > 0 && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                    {r.tajweed.annotations.slice(0, 3).map((ann, ai) => (
                      <span
                        key={ai}
                        className="w-1.5 h-1.5 rounded-full inline-block"
                        style={{ backgroundColor: ann.info.color }}
                        title={ann.rule}
                      />
                    ))}
                  </span>
                )}
                {/* Hover tooltip */}
                {r && (
                  <span className="absolute hidden group-hover:block z-30 bottom-full mb-3 right-0 min-w-[200px] max-w-[280px] bg-gray-900 text-white text-xs rounded-xl p-3 shadow-2xl text-left" dir="ltr">
                    <span className="block font-bold text-base mb-1" style={{ fontFamily: "'Amiri', serif", direction: 'rtl' }}>{r.original}</span>
                    <span className="block text-gray-300 mb-1">{statusIcon(r.status)} {r.status.charAt(0).toUpperCase() + r.status.slice(1)} ({r.similarity}% match)</span>
                    {r.spoken && r.status !== 'correct' && (
                      <span className="block text-yellow-300 mb-1">You said: <span style={{ fontFamily: "'Amiri', serif" }}>{r.spoken}</span></span>
                    )}
                    {r.mistakes.length > 0 && (
                      <span className="block text-red-300 mt-1 space-y-0.5">
                        {r.mistakes.slice(0, 3).map((m, mi) => (
                          <span key={mi} className="block">• {m.description}</span>
                        ))}
                      </span>
                    )}
                    {r.tajweed.annotations.length > 0 && (
                      <span className="block mt-2 pt-1 border-t border-gray-700">
                        <span className="text-gray-400">Tajweed: </span>
                        {r.tajweed.annotations.slice(0, 2).map((ann, ai) => (
                          <span key={ai} className="inline-block mr-1" style={{ color: ann.info.color }}>{ann.rule}</span>
                        ))}
                      </span>
                    )}
                  </span>
                )}
              </span>
            );
          })}
        </p>
      </div>

      {/* Word-by-word breakdown strip */}
      {showResults && wordResults && wordResults.length > 0 && (
        <div className="border-t border-emerald-200 px-4 py-4 bg-white/70">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold text-emerald-700 flex items-center gap-2">
              <span>🔍</span> Word-by-Word Breakdown
            </h4>
            <span className="text-xs text-gray-400">Hover each word for details</span>
          </div>
          <div className="flex flex-wrap gap-2 justify-end" dir="rtl">
            {wordResults.map((result, index) => (
              <div
                key={index}
                className={`relative group px-3 py-2 rounded-xl border-2 ring-2 ring-transparent hover:ring-4 transition-all cursor-default ${statusColorClasses(result.status)}`}
              >
                {/* Word */}
                <div className="font-bold text-xl text-right leading-normal" style={{ fontFamily: "'Amiri', serif" }}>
                  {result.original || <span className="text-orange-600 text-base">{result.spoken}</span>}
                </div>
                {/* Score bar */}
                {result.original && (
                  <div className="mt-1 h-1 w-full rounded-full bg-black/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-current opacity-60 transition-all"
                      style={{ width: `${result.similarity}%` }}
                    />
                  </div>
                )}
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-xs">{statusIcon(result.status)}</span>
                  {result.original && <span className="text-xs font-semibold ml-auto">{result.similarity}%</span>}
                </div>

                {/* Tajweed dots */}
                {result.tajweed.annotations.length > 0 && (
                  <div className="absolute -top-1.5 -right-1 flex gap-0.5">
                    {result.tajweed.annotations.slice(0, 3).map((ann, ai) => (
                      <span
                        key={ai}
                        className="w-2 h-2 rounded-full border border-white shadow-sm"
                        style={{ backgroundColor: ann.info.color }}
                        title={ann.rule}
                      />
                    ))}
                  </div>
                )}

                {/* Detailed tooltip */}
                <div
                  className="absolute hidden group-hover:block z-20 bottom-full mb-2 right-0 w-64 bg-gray-900 text-white text-xs rounded-xl p-3 shadow-2xl pointer-events-none"
                  dir="ltr"
                >
                  <p className="text-base font-bold mb-1 text-right" style={{ fontFamily: "'Amiri', serif", direction: 'rtl' }}>
                    {result.original || result.spoken}
                  </p>
                  <p className="text-gray-300 mb-1">
                    {statusIcon(result.status)} <span className="capitalize">{result.status}</span>
                    {result.original && ` — ${result.similarity}% match`}
                  </p>
                  {result.spoken && result.status !== 'correct' && result.status !== 'missed' && (
                    <p className="text-yellow-300 mb-1">
                      You said: <span style={{ fontFamily: "'Amiri', serif" }}>{result.spoken}</span>
                    </p>
                  )}
                  {/* Mistake list */}
                  {result.mistakes.length > 0 && (
                    <div className="mt-1 pt-1 border-t border-gray-700">
                      <p className="text-red-400 font-semibold mb-0.5">Mistakes:</p>
                      {result.mistakes.slice(0, 4).map((m, mi) => (
                        <p key={mi} className="text-red-300">• {m.description}</p>
                      ))}
                      {result.mistakes.length > 4 && (
                        <p className="text-gray-500">+{result.mistakes.length - 4} more…</p>
                      )}
                    </div>
                  )}
                  {/* Tajweed */}
                  {result.tajweed.annotations.length > 0 && (
                    <div className="mt-1 pt-1 border-t border-gray-700">
                      <p className="text-gray-400 mb-0.5">Tajweed rules:</p>
                      {result.tajweed.annotations.slice(0, 3).map((ann, ai) => (
                        <p key={ai} style={{ color: ann.info.color }}>
                          • {ann.rule} ({ann.info.nameArabic})
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Tajweed color legend */}
          {wordResults.some(w => w.tajweed.annotations.length > 0) && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-400 mb-2">Tajweed rule dots:</p>
              <div className="flex flex-wrap gap-2">
                {Array.from(
                  new Set(
                    wordResults.flatMap(w => w.tajweed.annotations.map(a => a.rule))
                  )
                ).map(rule => {
                  const info = TAJWEED_RULES[rule];
                  return (
                    <span key={rule} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: info.color }}>
                      {rule}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          <p className="text-xs text-gray-400 mt-3 text-right" dir="ltr">
            💡 Colored dots above each word = Tajweed rules. Hover any word for full analysis.
          </p>
        </div>
      )}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`w-2.5 h-2.5 rounded-full ${color} inline-block`}></span>
      {label}
    </span>
  );
}
