import { AnimatePresence, motion } from 'framer-motion';

export type MaoDeOnzeDecisionStageProps = {
  isVisible: boolean;
  onPlay: () => void;
  onRun: () => void;
};

export function MaoDeOnzeDecisionStage({
  isVisible,
  onPlay,
  onRun,
}: MaoDeOnzeDecisionStageProps) {
  return (
    <AnimatePresence>
      {isVisible ? (
        <motion.div
          key="mao-de-onze-stage"
          // NOTE: This stage stays visually above the table, not the hand dock.
          // The player must read it as a special match event, not as another
          // regular action row.
          className="pointer-events-none fixed inset-x-4 bottom-[268px] z-[160] mx-auto flex w-full max-w-[640px] justify-center md:bottom-[296px]"
          initial={{ y: 36, opacity: 0, scale: 0.94 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 22, opacity: 0, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 230, damping: 24 }}
        >
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -inset-10 rounded-[42px]"
            animate={{ opacity: [0.50, 0.82, 0.50], scale: [1, 1.025, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: [0.4, 0, 0.6, 1] }}
            style={{
              background:
                'radial-gradient(ellipse at 50% 58%, rgba(245,158,11,0.24) 0%, rgba(146,64,14,0.12) 40%, transparent 78%)',
              filter: 'blur(22px)',
            }}
          />

          <div className="event-banner-shell event-banner--special pointer-events-auto relative w-full px-5 py-5 md:px-6">
            <div
              aria-hidden
              className="drama-rim-sweep-anim pointer-events-none absolute inset-0 overflow-hidden rounded-[24px]"
            >
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(110deg, transparent 32%, rgba(255,223,128,0.32) 50%, transparent 68%)',
                  filter: 'blur(8px)',
                  mixBlendMode: 'screen',
                }}
              />
            </div>

            <div
              aria-hidden
              className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(245,158,11,0.30) 0%, transparent 64%)',
                filter: 'blur(8px)',
              }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -left-16 -bottom-16 h-40 w-40 rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(127,29,29,0.18) 0%, transparent 64%)',
                filter: 'blur(8px)',
              }}
            />

            <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      background:
                        'radial-gradient(circle at 35% 30%, #ffe89a 0%, #f59e0b 48%, #7c2d12 100%)',
                      boxShadow: '0 0 12px rgba(245,158,11,0.78)',
                    }}
                  />
                  <span className="event-banner-kicker">Queda de 11</span>
                </div>

                <h3 className="event-banner-title mt-3 text-[26px] md:text-[30px]">
                  Aceita jogar a mão?
                </h3>

                <p className="event-banner-copy mt-2 max-w-[360px] text-[12.5px]">
                  Vale 3 pontos. Aceitar entra na queda; correr entrega 1 ponto e fecha a
                  mão sem disputar.
                </p>
              </div>

              <div className="flex shrink-0 flex-col gap-2.5 sm:flex-row md:flex-col md:gap-3">
                <motion.button
                  type="button"
                  onClick={onPlay}
                  whileHover={{ y: -1, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="whitespace-nowrap rounded-full px-7 py-3 text-[12px] font-black uppercase tracking-[0.18em]"
                  style={{
                    background:
                      'linear-gradient(135deg, #fff1b8 0%, #e8c76a 42%, #c9a84c 72%, #2d6a4f 100%)',
                    color: '#111006',
                    border: '1px solid rgba(255,241,184,0.84)',
                    boxShadow:
                      '0 16px 32px rgba(0,0,0,0.36), 0 0 24px rgba(201,168,76,0.30), inset 0 1px 0 rgba(255,255,255,0.40)',
                    fontFamily: 'Georgia, serif',
                  }}
                >
                  Aceitar mão
                </motion.button>

                <motion.button
                  type="button"
                  onClick={onRun}
                  whileHover={{ y: -1, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="whitespace-nowrap rounded-full px-7 py-3 text-[12px] font-black uppercase tracking-[0.18em]"
                  style={{
                    background:
                      'linear-gradient(180deg, rgba(57,33,33,0.98), rgba(18,22,31,0.98))',
                    color: '#f0e6d3',
                    border: '1px solid rgba(244,170,93,0.24)',
                    boxShadow:
                      '0 14px 28px rgba(0,0,0,0.30), 0 0 18px rgba(180,83,9,0.12), inset 0 1px 0 rgba(255,255,255,0.07)',
                    fontFamily: 'Georgia, serif',
                  }}
                >
                  Correr
                </motion.button>
              </div>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
