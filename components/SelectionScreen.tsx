
import React, { useState, useEffect } from 'react';
import { Question } from '../types';
import { Sparkles, Loader2, Play, ArrowLeft, Users, Calendar, List, Quote, Languages } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { initGemini, formatGeminiError } from '../lib/gemini';

const ALLOWED_GAME_SUBJECTS = [
  { id: 'arabic', name: 'اللغة العربية', icon: '📜' },
  { id: 'philosophy', name: 'الفلسفة', icon: '⚖️' },
  { id: 'history', name: 'التاريخ', icon: '🏰' },
  { id: 'english', name: 'اللغة الإنجليزية', icon: '🇬🇧' },
  { id: 'french', name: 'اللغة الفرنسية', icon: '🇫🇷' }
];

const GAME_SECTIONS_CONFIG: Record<string, { id: string; label: string; icon: any }[]> = {
    'arabic': [{ id: 'criticism', label: 'رواد التقاويم النقدية', icon: Users }],
    'philosophy': [{ id: 'philosophy_article', label: 'الأقوال والمواقف الفلسفية', icon: Quote }],
    'history': [
        { id: 'dates', label: 'التواريخ والمعالم', icon: Calendar },
        { id: 'characters', label: 'الشخصيات التاريخية', icon: Users },
        { id: 'terms', label: 'المصطلحات والمفاهيم', icon: List }
    ],
    'english': [
        { id: 'grammar', label: 'Grammar & Rules', icon: Sparkles },
        { id: 'terms', label: 'Vocabulary', icon: Languages }
    ],
    'french': [
        { id: 'grammar', label: 'Grammaire & Conjugaison', icon: Sparkles },
        { id: 'terms', label: 'Lexique & Vocabulaire', icon: Languages }
    ]
};

interface SelectionScreenProps {
  questions: Question[];
  onStartGame: (filteredQuestions: Question[]) => void;
  onBack: () => void;
}

const SelectionScreen: React.FC<SelectionScreenProps> = ({ onStartGame, onBack }) => {
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedSection, setSelectedSection] = useState<string>('');
  const [selectedTrimester, setSelectedTrimester] = useState<string>('');
  const [selectedLessonId, setSelectedLessonId] = useState<number | null>(null);
  const [availableLessons, setAvailableLessons] = useState<{id: number, title: string}[]>([]);
  const [isLoadingLessons, setIsLoadingLessons] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');

  useEffect(() => {
    if (selectedSubject && selectedSection && selectedTrimester) {
        fetchLessons();
    }
  }, [selectedSubject, selectedSection, selectedTrimester]);

  const fetchLessons = async () => {
      setIsLoadingLessons(true);
      try {
          const sectionId = `${selectedSubject}_${selectedTrimester}_${selectedSection}`;
          const { data } = await supabase
            .from('lessons_content')
            .select('id, title')
            .eq('section_id', sectionId)
            .order('created_at', { ascending: true });
          
          if (data) setAvailableLessons(data);
      } catch (e) { console.error(e); }
      finally { setIsLoadingLessons(false); }
  };

  const handleStartGame = async () => {
      if (!selectedSubject || !selectedSection || !selectedTrimester) return window.addToast("أكمل جميع الاختيارات أولاً", "info");
      setIsGenerating(true);
      setLoadingStep('جاري قراءة الدروس وتحليل المحتوى...');
      try {
          await handleAiGenerate();
      } catch (e) {
          console.error(e);
          window.addToast("فشل في تحضير المسابقة، حاول مرة أخرى", "error");
      } finally {
          setIsGenerating(false);
      }
  };

  const handleAiGenerate = async () => {
      try {
          // 1. جلب المحتوى من قاعدة البيانات
          let contentText = "";
          if (selectedLessonId) {
              const { data } = await supabase.from('lessons_content').select('content, title').eq('id', selectedLessonId).single();
              if (data) contentText = `الدرس: ${data.title}\nالمحتوى الخام: ${data.content}`;
          } else {
              const sectionId = `${selectedSubject}_${selectedTrimester}_${selectedSection}`;
              // نجلب محتوى أكثر لضمان وجود مادة كافية لـ 15 سؤال
              const { data } = await supabase.from('lessons_content').select('content').eq('section_id', sectionId).limit(8);
              if (data && data.length > 0) {
                  contentText = data.map(d => d.content).join("\n\n");
              } else {
                  throw new Error("لا يوجد محتوى كافٍ في هذا القسم لتوليد مسابقة.");
              }
          }

          setLoadingStep('الذكاء الاصطناعي يقوم بصياغة الأسئلة...');

          // 2. تخصيص التعليمات حسب المادة
          let specializedInstruction = "";
          if (selectedSubject === 'arabic') {
              specializedInstruction = "ركز على المدارس الأدبية، خصائص الأسلوب، رواد النهضة، والظواهر النقدية (الالتزام، الرمز، الحزن...).";
          } else if (selectedSubject === 'philosophy') {
              specializedInstruction = "ركز على الحجج، أسماء الفلاسفة، الأقوال المأثورة، والمواقف المتعارضة.";
          } else if (selectedSubject === 'history') {
              specializedInstruction = "ركز بدقة على التواريخ (اليوم/الشهر/السنة)، الشخصيات وجنسياتهم، والمصطلحات التاريخية.";
          }

          // 3. صياغة البرومبت الدقيق لمسابقة المليون
          const prompt = `أنت أستاذ خبير ومعد مسابقات "من سيربح المليون" التعليمية للبكالوريا الجزائرية.
          
          المهمة: قم بتوليد 15 سؤالاً دقيقاً متعدد الخيارات (MCQ) من النص المرفق أدناه.
          المادة: ${selectedSubject} - ${specializedInstruction}

          شروط الأسئلة (صارمة جداً):
          1. الأسئلة 1-5: مستوى "سهل" (للمبتدئين).
          2. الأسئلة 6-10: مستوى "متوسط" (للطالب العادي).
          3. الأسئلة 11-15: مستوى "صعب" (للمتميزين - تتطلب دقة وتركيز).
          4. الخيارات يجب أن تكون 4 (أ، ب، ج، د).
          5. يجب أن يكون هناك خيار واحد صحيح فقط.
          6. الرد يجب أن يكون بصيغة JSON Array صافي فقط بدون أي نصوص إضافية.

          صيغة JSON المطلوبة:
          [
            {
              "text": "نص السؤال هنا؟",
              "options": ["الخيار 1", "الخيار 2", "الخيار 3", "الخيار 4"],
              "correctAnswerIndex": 0, 
              "difficulty": "easy" 
            }
          ]
          *ملاحظة: correctAnswerIndex هو رقم (0 للخيار الأول، 1 للثاني، وهكذا).*

          النص المرجعي للاستخراج:
          ${contentText.substring(0, 15000)} /* تقليل النص لتجنب تجاوز الحد */`;

          // 4. استدعاء Gemini باستخدام المفاتيح المدورة
          const ai = initGemini();
          const response = await ai.models.generateContent({
              model: 'gemini-3-flash-preview', // نموذج سريع وذكي
              contents: [{ parts: [{ text: prompt }] }],
              config: { 
                  responseMimeType: "application/json",
                  temperature: 0.3 // تقليل العشوائية لضمان دقة المعلومات
              }
          });

          // 5. معالجة الرد
          const responseText = response.text || '[]';
          const generatedQs = JSON.parse(responseText);

          if (!Array.isArray(generatedQs) || generatedQs.length < 5) {
              throw new Error("لم يتمكن الذكاء الاصطناعي من توليد عدد كافٍ من الأسئلة.");
          }

          // تحويل البيانات لتنسيق التطبيق
          const finalQs: Question[] = generatedQs.map((q: any, idx: number) => ({
              id: Date.now() + idx,
              text: q.text,
              options: q.options,
              correctAnswerIndex: q.correctAnswerIndex,
              prize: "0", // سيتم حسابه في شاشة اللعب
              difficulty: idx < 5 ? 'easy' : idx < 10 ? 'medium' : 'hard',
              subject: selectedSubject,
              chapter: selectedTrimester,
              lesson: 'generated'
          }));

          // بدء اللعبة
          onStartGame(finalQs);

      } catch (err: any) {
          console.error(err);
          window.addToast(formatGeminiError(err), "error");
      }
  };

  return (
    // FIX: Updated container to h-screen and overflow-y-auto to allow scrolling on small screens
    <div className="h-screen w-full bg-black overflow-y-auto font-cairo">
       <div className="min-h-full flex items-center justify-center p-4">
           <div className="w-full max-w-lg bg-neutral-900/60 border border-white/10 rounded-[3rem] p-8 shadow-2xl space-y-6 relative overflow-hidden backdrop-blur-xl my-auto">
                {/* زخرفة خلفية */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-brand/5 blur-3xl rounded-full"></div>
                
                <div className="text-center">
                    <div className="w-20 h-20 bg-brand/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-brand/30 shadow-[0_0_20px_rgba(255,198,51,0.2)]">
                        <Sparkles className="text-brand w-10 h-10 animate-pulse" />
                    </div>
                    <h2 className="text-3xl font-black text-white mb-2 tracking-tighter">رحلة المليون</h2>
                    <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest">توليد الأسئلة بالذكاء الاصطناعي</p>
                </div>

                <div className="space-y-5">
                    <div className="space-y-2">
                        <label className="text-[10px] text-gray-500 font-black mr-2 uppercase">1. المادة الدراسية</label>
                        <select 
                            value={selectedSubject} 
                            onChange={(e) => { setSelectedSubject(e.target.value); setSelectedSection(''); setSelectedTrimester(''); setSelectedLessonId(null); }} 
                            className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white font-bold outline-none focus:border-brand transition-all"
                        >
                            <option value="">-- اختر المادة --</option>
                            {ALLOWED_GAME_SUBJECTS.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
                        </select>
                    </div>

                    {selectedSubject && (
                        <div className="space-y-2 animate-fadeIn">
                            <label className="text-[10px] text-gray-500 font-black mr-2 uppercase">2. مجال الأسئلة</label>
                            <div className="grid grid-cols-1 gap-2">
                                {GAME_SECTIONS_CONFIG[selectedSubject]?.map(sec => (
                                    <button 
                                        key={sec.id}
                                        onClick={() => { setSelectedSection(sec.id); setSelectedTrimester(''); setSelectedLessonId(null); }}
                                        className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${selectedSection === sec.id ? 'bg-brand/10 border-brand text-brand' : 'bg-black/40 border-white/5 text-gray-500 hover:border-brand/30'}`}
                                    >
                                        <sec.icon size={18} />
                                        <span className="text-xs font-black">{sec.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {selectedSection && (
                        <div className="space-y-2 animate-fadeIn">
                            <label className="text-[10px] text-gray-500 font-black mr-2 uppercase">3. الفصل الدراسي</label>
                            <div className="grid grid-cols-3 gap-2">
                                {['t1', 't2', 't3'].map(t => (
                                    <button 
                                        key={t} 
                                        onClick={() => { setSelectedTrimester(t); setSelectedLessonId(null); }} 
                                        className={`py-3 rounded-xl font-black text-[10px] transition-all border-b-4 active:translate-y-1 ${selectedTrimester === t ? 'bg-brand text-black border-brand-dark' : 'bg-black text-gray-500 border-neutral-950'}`}
                                    >
                                        {t === 't1' ? 'الفصل 1' : t === 't2' ? 'الفصل 2' : 'الفصل 3'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {selectedTrimester && (
                        <div className="space-y-2 animate-fadeIn">
                            <label className="text-[10px] text-gray-500 font-black mr-2 uppercase">4. درس محدد (اختياري)</label>
                            <select 
                                value={selectedLessonId || ''} 
                                onChange={(e) => setSelectedLessonId(Number(e.target.value))} 
                                className="w-full bg-black border border-white/10 rounded-2xl p-4 text-xs font-bold text-white outline-none focus:border-brand disabled:opacity-20 transition-all"
                                disabled={isLoadingLessons}
                            >
                                <option value="">-- شامل لجميع دروس الفصل --</option>
                                {availableLessons.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
                            </select>
                        </div>
                    )}
                </div>

                <div className="pt-6 space-y-3">
                    <button 
                        onClick={handleStartGame} 
                        disabled={isGenerating || !selectedTrimester} 
                        className="w-full py-5 bg-brand text-black rounded-2xl font-black text-xl shadow-xl active:scale-[0.98] disabled:opacity-50 transition-all flex flex-col items-center justify-center relative overflow-hidden group"
                    >
                        {isGenerating ? (
                            <div className="flex flex-col items-center gap-2">
                                <Loader2 className="animate-spin w-6 h-6" />
                                <span className="text-[10px] font-black uppercase tracking-widest animate-pulse">{loadingStep}</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 relative z-10">
                                <Play size={24} fill="currentColor" />
                                <span>ابدأ رحلة النجاح</span>
                            </div>
                        )}
                        {!isGenerating && <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>}
                    </button>
                    
                    <button onClick={onBack} disabled={isGenerating} className="w-full py-2 text-gray-600 font-bold text-[10px] uppercase tracking-widest hover:text-white transition-colors flex items-center justify-center gap-2">
                        <ArrowLeft size={14}/> عودة للقائمة
                    </button>
                </div>
           </div>
       </div>
    </div>
  );
};
export default SelectionScreen;
