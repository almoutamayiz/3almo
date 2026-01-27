
import { GoogleGenAI } from "@google/genai";

/**
 * دالة لاستخراج جميع المفاتيح المتاحة من متغيرات البيئة في Vercel/Vite.
 * هام: في Vercel مع Vite، يجب أن تبدأ المتغيرات بـ VITE_ لتظهر في المتصفح.
 */
const getAvailableApiKeys = (): string[] => {
  // الوصول الآمن لمتغيرات البيئة في Vite
  const env = (import.meta as any).env || {};
  const keys: string[] = [];

  // 1. إضافة المفتاح الرئيسي إذا وجد
  if (env.VITE_API_KEY) {
    keys.push(env.VITE_API_KEY);
  }

  // 2. البحث عن مفاتيح مرقمة (من 1 إلى 20) لتوزيع الحمل
  // مثال: VITE_API_KEY_1, VITE_API_KEY_2 ...
  for (let i = 1; i <= 20; i++) {
    const key = env[`VITE_API_KEY_${i}`];
    if (key && typeof key === 'string' && key.trim().length > 0) {
      keys.push(key.trim());
    }
  }

  // 3. دعم قائمة مفصولة بفواصل (اختياري)
  if (env.VITE_API_KEYS_LIST) {
    const list = (env.VITE_API_KEYS_LIST as string).split(',').map(k => k.trim()).filter(k => k.length > 0);
    keys.push(...list);
  }

  // إزالة التكرار لضمان الكفاءة
  const uniqueKeys = [...new Set(keys)];
  
  if (uniqueKeys.length === 0) {
    console.warn("No API Keys found in environment variables. Please check Vercel settings.");
  }

  return uniqueKeys;
};

/**
 * تهيئة عميل Gemini مع اختيار مفتاح عشوائي من القائمة المتاحة (Load Balancing).
 * هذا يمنع توقف التطبيق إذا وصل أحد المفاتيح للحد الأقصى.
 */
export const initGemini = () => {
  const apiKeys = getAvailableApiKeys();

  if (apiKeys.length === 0) {
    throw new Error("Missing API Keys: Please add VITE_API_KEY to Vercel Environment Variables.");
  }

  // اختيار مفتاح عشوائي لتوزيع الحمل
  const randomKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];
  
  return new GoogleGenAI({ apiKey: randomKey });
};

/**
 * معالج أخطاء ذكي يعيد رسائل مفهومة للمستخدم العربي.
 */
export const formatGeminiError = (error: any): string => {
  console.error("Gemini Error Log:", error);

  if (!error) return "حدث خطأ غير متوقع في الاتصال";

  const message = (error.message || error.toString()).toLowerCase();

  if (message.includes('400') || message.includes('invalid_argument')) {
    return "لا يمكن معالجة هذا المحتوى، حاول تقليل النص أو تغيير الصياغة.";
  }
  if (message.includes('403') || message.includes('permission_denied') || message.includes('key')) {
    return "مفتاح API الحالي مشغول أو محظور، سيقوم النظام بالتبديل تلقائياً في المحاولة القادمة.";
  }
  if (message.includes('429') || message.includes('resource_exhausted')) {
    return "الخدمة مشغولة جداً (429). الرجاء الانتظار دقيقة ثم المحاولة.";
  }
  if (message.includes('500') || message.includes('internal')) {
    return "خطأ مؤقت في خوادم جوجل، حاول مجدداً.";
  }
  if (message.includes('fetch') || message.includes('network') || message.includes('failed')) {
    return "تأكد من اتصالك بالإنترنت.";
  }

  return "حدث خطأ تقني، يرجى إعادة المحاولة.";
};
