// Contextual roast generator (M6): builds a personalized shame line from
// session/streak context. Used by the client (for speech fallback) and by
// /api/roast (for ElevenLabs TTS). No LLM needed — templates + context
// are funnier and have zero latency.

import { randomPhrase, type Lang } from "./phrases";

export type RoastContext = {
  kind: "phone" | "tab";
  name?: string;
  /** violations so far in THIS session, including the current one */
  countThisSession: number;
  /** minutes elapsed in the current session */
  minutesIn: number;
  /** current streak of clean completed sessions before this one */
  streak: number;
  bestStreak: number;
  lang: Lang;
};

export function buildRoast(ctx: RoastContext): string {
  const name = ctx.name?.trim() || (ctx.lang === "es" ? "campeón" : "champ");

  // Streak just died — that's the most painful thing we can mention.
  if (ctx.countThisSession === 1 && ctx.streak >= 2) {
    return ctx.lang === "es"
      ? `Llevabas una racha de ${ctx.streak} sesiones limpias, ${name}. La acabas de tirar a la basura. Espero que ese ${
          ctx.kind === "phone" ? "móvil" : "YouTube"
        } valga la pena.`
      : `You had a ${ctx.streak}-session clean streak going, ${name}. You just threw it in the trash. I hope that ${
          ctx.kind === "phone" ? "phone" : "tab"
        } was worth it.`;
  }

  // Repeat offender within the same session.
  if (ctx.countThisSession === 2) {
    return ctx.lang === "es"
      ? `Otra vez, ${name}. Ya es la segunda vez que lo sacas en ${Math.max(
          ctx.minutesIn,
          1
        )} minutos. Esto empieza a ser preocupante.`
      : `Again, ${name}. That's the second time in ${Math.max(
          ctx.minutesIn,
          1
        )} minutes. This is becoming a pattern.`;
  }

  if (ctx.countThisSession >= 5) {
    return ctx.lang === "es"
      ? `${ctx.countThisSession} veces, ${name}. Ya ni me enfado. Estoy impresionado. Pocas personas fracasan con esta constancia.`
      : `${ctx.countThisSession} times, ${name}. I'm not even angry anymore. I'm impressed. Few people fail this consistently.`;
  }

  if (ctx.countThisSession >= 3) {
    return ctx.lang === "es"
      ? `Van ${ctx.countThisSession}, ${name}. A este paso tu móvil va a pedir una orden de alejamiento.`
      : `That's ${ctx.countThisSession} now, ${name}. At this rate your phone is going to file a restraining order.`;
  }

  // Caught suspiciously early in the session.
  if (ctx.countThisSession === 1 && ctx.minutesIn < 2) {
    return ctx.lang === "es"
      ? `Ni dos minutos has aguantado, ${name}. Ni dos minutos. Récord personal, supongo.`
      : `You didn't even last two minutes, ${name}. Not even two. A personal record, I suppose.`;
  }

  // Default: one of the canned phrases.
  return randomPhrase(ctx.kind, ctx.lang)[ctx.lang];
}
