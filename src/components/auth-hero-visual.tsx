"use client";

import { motion } from "motion/react";

/** Shop photos instead of letter pills (Conversly-style orbit). */
const SHOPS = [
  {
    label: "Grocery",
    src: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=160&h=160&q=80",
  },
  {
    label: "Restaurant",
    src: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=160&h=160&q=80",
  },
  {
    label: "Furniture",
    src: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=160&h=160&q=80",
  },
  {
    label: "Swim",
    src: "https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?auto=format&fit=crop&w=160&h=160&q=80",
  },
  {
    label: "Retail",
    src: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=160&h=160&q=80",
  },
] as const;

const ORBIT: Array<{ left: string; top: string; delay: number }> = [
  { left: "16%", top: "26%", delay: 0 },
  { left: "60%", top: "20%", delay: 0.4 },
  { left: "70%", top: "50%", delay: 0.8 },
  { left: "36%", top: "56%", delay: 1.1 },
  { left: "20%", top: "46%", delay: 1.5 },
];

/**
 * Conversly-style animated left panel — sapphire / navy (brand system).
 */
export function AuthHeroVisual() {
  return (
    <div className="relative h-full min-h-[300px] w-full overflow-hidden bg-[linear-gradient(145deg,#1341a8_0%,#1a56db_42%,#0b1f33_100%)] lg:min-h-0">
      <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_20%_15%,rgba(255,255,255,0.22),transparent_55%)]" />

      <div className="absolute left-1/2 top-[46%] h-[120%] w-[120%] -translate-x-1/2 -translate-y-1/2">
        {[0, 1, 2, 3].map((i) => (
          <motion.div
            key={i}
            className="absolute left-1/2 top-1/2 rounded-full border border-white/20"
            style={{
              width: `${42 + i * 18}%`,
              height: `${42 + i * 18}%`,
              marginLeft: `${-(21 + i * 9)}%`,
              marginTop: `${-(21 + i * 9)}%`,
            }}
            animate={{ opacity: [0.25, 0.55, 0.25], scale: [1, 1.03, 1] }}
            transition={{
              duration: 5 + i * 0.6,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.25,
            }}
          />
        ))}
        <motion.div
          className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80"
          animate={{ scale: [1, 1.35, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 2.8, repeat: Infinity }}
        />
      </div>

      {SHOPS.map((shop, i) => {
        const pos = ORBIT[i]!;
        return (
          <motion.div
            key={shop.label}
            className="absolute z-10"
            style={{ left: pos.left, top: pos.top }}
            animate={{ y: [0, -10, 0] }}
            transition={{
              duration: 4.2 + i * 0.35,
              repeat: Infinity,
              ease: "easeInOut",
              delay: pos.delay,
            }}
          >
            <div
              className="relative h-14 w-14 overflow-hidden rounded-full shadow-[0_10px_28px_rgba(11,31,51,0.4)] ring-[3px] ring-white/70 sm:h-16 sm:w-16"
              title={shop.label}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={shop.src}
                alt={shop.label}
                className="h-full w-full object-cover"
                loading="lazy"
              />
              <span className="absolute inset-x-0 bottom-0 bg-[#0b1f33]/75 px-1 py-0.5 text-center text-[0.55rem] font-semibold tracking-wide text-white">
                {shop.label}
              </span>
            </div>
          </motion.div>
        );
      })}

      <div className="absolute left-6 top-6 z-20 flex items-center gap-2.5 lg:left-8 lg:top-8">
        <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-white text-sm font-bold text-[#1a56db] shadow-md">
          U
        </span>
        <span className="text-base font-bold tracking-tight text-white">
          Universal POS
        </span>
      </div>

      <div className="absolute bottom-7 left-6 z-20 lg:bottom-10 lg:left-8">
        <motion.p
          className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl"
          animate={{ opacity: [0.9, 1, 0.9] }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          Any shop
        </motion.p>
        <p className="mt-1 text-sm font-medium text-white/75">
          Grocery · restaurant · furniture · swim — one counter
        </p>
      </div>
    </div>
  );
}
