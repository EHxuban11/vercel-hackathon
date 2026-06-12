// Pre-written shame phrases, "disappointed parent" energy.
// ids map to pre-generated mp3 files in /public/audio/{id}.mp3 (see scripts/generate-voices.mjs)

export type Lang = "en" | "es";

export type Phrase = { id: string; en: string; es: string };

export const PHONE_PHRASES: Phrase[] = [
  {
    id: "phone-1",
    en: "Again with the phone? I didn't raise you like this.",
    es: "¿Otra vez con el móvil? Yo no te crié así.",
  },
  {
    id: "phone-2",
    en: "Put. The phone. Down. We talked about this.",
    es: "Suelta. El. Móvil. Ya hablamos de esto.",
  },
  {
    id: "phone-3",
    en: "I'm not angry. I'm just very, very disappointed.",
    es: "No estoy enfadado. Solo estoy muy, muy decepcionado.",
  },
  {
    id: "phone-4",
    en: "Your focus session is crying right now. I hope you're happy.",
    es: "Tu sesión de focus está llorando ahora mismo. Espero que estés contento.",
  },
  {
    id: "phone-5",
    en: "Is that phone going to finish your work for you? Didn't think so.",
    es: "¿Te va a terminar el trabajo ese móvil? Me parecía que no.",
  },
  {
    id: "phone-6",
    en: "One notification. That's all it took. Pathetic.",
    es: "Una notificación. Eso es todo lo que ha hecho falta. Patético.",
  },
  {
    id: "phone-7",
    en: "When I was your age, we got distracted by windows. Real ones.",
    es: "Cuando yo tenía tu edad, nos distraíamos mirando por la ventana. La de verdad.",
  },
  {
    id: "phone-8",
    en: "The whole team can see this, you know. The whole team.",
    es: "Todo el equipo puede ver esto, ¿sabes? Todo el equipo.",
  },
  {
    id: "phone-9",
    en: "That better be an emergency. A real one. Not a meme.",
    es: "Más te vale que sea una emergencia. De verdad. No un meme.",
  },
  {
    id: "phone-10",
    en: "I see the phone. The phone sees you. And I see everything.",
    es: "Veo el móvil. El móvil te ve a ti. Y yo lo veo todo.",
  },
];

export const TAB_PHRASES: Phrase[] = [
  {
    id: "tab-1",
    en: "Switching tabs? Was YouTube calling your name again?",
    es: "¿Cambiando de pestaña? ¿Te llamaba YouTube otra vez?",
  },
  {
    id: "tab-2",
    en: "I saw that. You left. In the middle of a focus session.",
    es: "Lo he visto. Te has ido. En mitad de una sesión de focus.",
  },
  {
    id: "tab-3",
    en: "Reddit will still be there in twenty minutes. Your deadline won't.",
    es: "Reddit seguirá ahí en veinte minutos. Tu deadline no.",
  },
  {
    id: "tab-4",
    en: "Welcome back. Your productivity left while you were gone.",
    es: "Bienvenido de vuelta. Tu productividad se fue mientras no estabas.",
  },
  {
    id: "tab-5",
    en: "Every tab you open is a little betrayal. I felt this one.",
    es: "Cada pestaña que abres es una pequeña traición. Esta la he sentido.",
  },
];

export function randomPhrase(kind: "phone" | "tab", lang: Lang): Phrase {
  const pool = kind === "phone" ? PHONE_PHRASES : TAB_PHRASES;
  return pool[Math.floor(Math.random() * pool.length)];
}

export const ALL_PHRASES: Phrase[] = [...PHONE_PHRASES, ...TAB_PHRASES];
