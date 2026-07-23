import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';

import {
  AI_LAB_AB_RESULT,
  AI_LAB_ASSISTED_ACTIONS,
  AI_LAB_ASSISTED_THRESHOLDS,
  AI_LAB_CANDIDATE_DETAILS,
  AI_LAB_FEATURE_REFACTOR,
  AI_LAB_FEATURE_SIGNALS,
  AI_LAB_HEURISTIC_RESPONSIBILITIES,
  AI_LAB_INTELLIGENCE_DESCRIPTIONS,
  AI_LAB_INTELLIGENCE_LABELS,
  AI_LAB_LIMITATIONS,
  AI_LAB_METRICS,
  AI_LAB_MODEL,
  AI_LAB_MODEL_STAGES,
  AI_LAB_PIPELINE,
  AI_LAB_PROFILE_LABELS,
  AI_LAB_RUNTIME_STEPS,
  AI_LAB_SECONDARY_FACTS,
  AI_LAB_STUDIO_GUARDRAILS,
  type AiLabBotProfile,
  type AiLabIntelligenceMode,
  type AiLabDecisionScenario,
  type AiLabMetric,
  type AiLabModelStage,
} from '../features/aiLab/aiLabData';
import {
  runAiLabSimulation,
  type AiLabSimulationResult,
} from '../features/aiLab/aiLabSimulationApi';
import {
  getNextReplayEventIndex,
  getReplayDelayMs,
} from '../features/aiLab/aiLabReplayDirector';
import {
  AiLabSpectatorReplay,
  type ReplaySpeed,
} from '../features/aiLab/aiLabSpectatorReplay';


type AiLabWorkspace = 'overview' | 'studio' | 'simulation' | 'ml-lab';

type StudioBotConfig = {
  profile: AiLabBotProfile;
  intelligence: AiLabIntelligenceMode;
};

function StudioBotCard({
  label,
  accent,
  config,
  onProfileChange,
  onIntelligenceChange,
}: {
  label: string;
  accent: 'gold' | 'green';
  config: StudioBotConfig;
  onProfileChange: (profile: AiLabBotProfile) => void;
  onIntelligenceChange: (mode: AiLabIntelligenceMode) => void;
}) {
  return (
    <article className={`ai-lab-studio-bot ai-lab-studio-bot--${accent}`}>
      <div className="ai-lab-studio-bot__heading">
        <div>
          <span>{label}</span>
          <strong>{AI_LAB_PROFILE_LABELS[config.profile]}</strong>
        </div>

        <span className="ai-lab-studio-bot__mode">
          {AI_LAB_INTELLIGENCE_LABELS[config.intelligence]}
        </span>
      </div>

      <div className="ai-lab-studio-field">
        <span className="ai-lab-studio-field__label">Perfil comportamental</span>
        <div className="ai-lab-studio-segmented">
          {(Object.keys(AI_LAB_PROFILE_LABELS) as AiLabBotProfile[]).map((profileOption) => (
            <button
              key={profileOption}
              type="button"
              className={config.profile === profileOption ? 'is-active' : undefined}
              onClick={() => onProfileChange(profileOption)}
            >
              {AI_LAB_PROFILE_LABELS[profileOption]}
            </button>
          ))}
        </div>
      </div>

      <div className="ai-lab-studio-field">
        <span className="ai-lab-studio-field__label">Motor de inteligência</span>
        <div className="ai-lab-studio-mode-grid">
          {(Object.keys(AI_LAB_INTELLIGENCE_LABELS) as AiLabIntelligenceMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={config.intelligence === mode ? 'is-active' : undefined}
              onClick={() => onIntelligenceChange(mode)}
            >
              <strong>{AI_LAB_INTELLIGENCE_LABELS[mode]}</strong>
              <span>{AI_LAB_INTELLIGENCE_DESCRIPTIONS[mode]}</span>
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}


function MetricCard({ metric, index }: { metric: AiLabMetric; index: number }) {
  return (
    <motion.article
      className={`ai-lab-metric ai-lab-metric--${metric.tone}`}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.16 + index * 0.07 }}
    >
      <div className="ai-lab-metric__icon" aria-hidden>
        {index === 0 ? '◉' : index === 1 ? '♠' : index === 2 ? '◎' : '↗'}
      </div>

      <div className="ai-lab-metric__body">
        <span className="ai-lab-metric__label">{metric.label}</span>
        <strong className="ai-lab-metric__value">{metric.value}</strong>
        <span className="ai-lab-metric__detail">{metric.detail}</span>
      </div>
    </motion.article>
  );
}

function ModelStageCard({ stage }: { stage: AiLabModelStage }) {
  return (
    <article
      className={
        stage.selected
          ? 'ai-lab-model-stage ai-lab-model-stage--selected'
          : 'ai-lab-model-stage'
      }
    >
      <div className="ai-lab-model-stage__topline">
        <span className="ai-lab-model-stage__index">{stage.index}</span>
        <span className="ai-lab-model-stage__status">{stage.status}</span>
      </div>

      <strong className="ai-lab-model-stage__name">{stage.name}</strong>
      <span className="ai-lab-model-stage__role">{stage.role}</span>
      <p>{stage.description}</p>

      {stage.selected ? (
        <div className="ai-lab-model-stage__selected-mark">
          <span>✓</span>
          Candidato promovido ao runtime
        </div>
      ) : null}
    </article>
  );
}

function DecorativeCard({
  rank,
  suit,
  className,
}: {
  rank: string;
  suit: string;
  className: string;
}) {
  const isRed = suit === '♥' || suit === '♦';

  return (
    <div className={`ai-lab-playing-card ${className}`} aria-hidden>
      <div className={isRed ? 'ai-lab-playing-card__rank is-red' : 'ai-lab-playing-card__rank'}>
        <span>{rank}</span>
        <span>{suit}</span>
      </div>
      <span className={isRed ? 'ai-lab-playing-card__suit is-red' : 'ai-lab-playing-card__suit'}>
        {suit}
      </span>
    </div>
  );
}

export function AiLabPage() {
  const [activeWorkspace, setActiveWorkspace] = useState<AiLabWorkspace>('overview');
  const [botA, setBotA] = useState<StudioBotConfig>({
    profile: 'balanced',
    intelligence: 'ml-assisted',
  });
  const [botB, setBotB] = useState<StudioBotConfig>({
    profile: 'balanced',
    intelligence: 'heuristic',
  });
  const [simulationSeed, setSimulationSeed] = useState('13001');
  const [showInternalDecisions, setShowInternalDecisions] = useState(true);
  const [showMlPredictions, setShowMlPredictions] = useState(true);
  const [showArchitectureTrace, setShowArchitectureTrace] = useState(true);
  const [studioPrepared, setStudioPrepared] = useState(false);
  const [simulationResult, setSimulationResult] = useState<AiLabSimulationResult | null>(null);
  const [simulationEventIndex, setSimulationEventIndex] = useState(0);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [simulationPlaying, setSimulationPlaying] = useState(false);
  const [simulationSpeed, setSimulationSpeed] = useState<ReplaySpeed>(1);

  const isSimulationTheater = activeWorkspace === 'simulation' && simulationResult !== null;

  const [profile, setProfile] = useState<AiLabBotProfile>('balanced');
  const [scenario, setScenario] = useState<AiLabDecisionScenario>('initiative');
  const [probability, setProbability] = useState(79);

  const assistedDecision = useMemo(() => {
    const thresholds = AI_LAB_ASSISTED_THRESHOLDS[profile];
    const normalizedProbability = probability / 100;

    if (scenario === 'initiative') {
      return normalizedProbability >= thresholds.initiative
        ? {
            action: 'Pedir truco',
            code: 'request-truco',
            tone: 'override',
            explanation: `A probabilidade atingiu o limiar de iniciativa do perfil ${AI_LAB_PROFILE_LABELS[profile].toLowerCase()}.`,
          }
        : {
            action: 'Preservar heurística',
            code: 'baseline',
            tone: 'baseline',
            explanation:
              'O sinal não alcançou o limiar necessário. A decisão determinística permanece intacta.',
          };
    }

    if (normalizedProbability >= thresholds.raiseValue) {
      return {
        action: 'Aumentar, se disponível',
        code: 'raise',
        tone: 'override',
        explanation:
          'O sinal alcançou o limiar de aumento. O runtime real ainda escolhe o maior raise efetivamente disponível.',
      };
    }

    if (normalizedProbability >= thresholds.accept) {
      return {
        action: 'Aceitar aposta',
        code: 'accept-bet',
        tone: 'override',
        explanation: 'O sinal é suficiente para aceitar, mas ainda não alcança o limiar de aumento.',
      };
    }

    if (normalizedProbability <= thresholds.decline) {
      return {
        action: 'Recusar aposta',
        code: 'decline-bet',
        tone: 'override',
        explanation: 'O sinal caiu abaixo do limite conservador de recusa configurado para o perfil.',
      };
    }

    return {
      action: 'Preservar heurística',
      code: 'baseline',
      tone: 'baseline',
      explanation:
        'A probabilidade está na zona intermediária; o ML não força uma alteração na decisão existente.',
    };
  }, [probability, profile, scenario]);

  const activeThresholds = AI_LAB_ASSISTED_THRESHOLDS[profile];

  const studioThresholds =
    botA.intelligence === 'ml-assisted'
      ? AI_LAB_ASSISTED_THRESHOLDS[botA.profile]
      : null;

  const prepareSimulation = () => {
    setStudioPrepared(true);
    setActiveWorkspace('simulation');
  };

  const executeSimulation = async () => {
    setSimulationLoading(true);
    setSimulationError(null);
    setSimulationPlaying(false);

    try {
      const result = await runAiLabSimulation({
        botA: {
          profile: botA.profile,
          intelligenceMode: botA.intelligence,
        },
        botB: {
          profile: botB.profile,
          intelligenceMode: botB.intelligence,
        },
        seed: Number(simulationSeed) || 13001,
        observability: {
          showInternalDecisions,
          showMlPredictions,
          showArchitectureTrace,
        },
      });

      setSimulationResult(result);
      setSimulationEventIndex(0);
      setStudioPrepared(true);
    } catch (error) {
      setSimulationError(
        error instanceof Error ? error.message : 'Falha inesperada ao executar a simulação.',
      );
    } finally {
      setSimulationLoading(false);
    }
  };

  useEffect(() => {
    if (!simulationPlaying || !simulationResult) {
      return;
    }

    const currentEvent = simulationResult.events[simulationEventIndex];

    if (!currentEvent) {
      setSimulationPlaying(false);
      return;
    }

    const nextIndex = getNextReplayEventIndex(
      simulationResult.events,
      simulationEventIndex,
    );

    if (nextIndex === null) {
      setSimulationPlaying(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSimulationEventIndex(nextIndex);
    }, Math.max(120, getReplayDelayMs(currentEvent) / simulationSpeed));

    return () => window.clearTimeout(timeoutId);
  }, [
    simulationEventIndex,
    simulationPlaying,
    simulationResult,
    simulationSpeed,
  ]);


  return (
    <div className={isSimulationTheater ? 'ai-lab-page is-simulation-theater' : 'ai-lab-page'}>
      <div className="ai-lab-page__ambient" aria-hidden />

      <section className="ai-lab-hero">
        <motion.div
          className="ai-lab-hero__copy"
          initial={{ opacity: 0, x: -22 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.65 }}
        >
          <div className="ai-lab-kicker">
            <span className="ai-lab-kicker__dot" />
            ML assistido · experimental
          </div>

          <p className="ai-lab-hero__eyebrow">Truco Paulista · Inteligência Experimental</p>

          <h1 className="ai-lab-hero__title">
            AI Lab
            <span>Inteligência do Bot</span>
          </h1>

          <p className="ai-lab-hero__description">
            Da simulação ao runtime: telemetria, dataset, engenharia de atributos, validação,
            Shadow Mode e experimentação A/B — sem substituir a estratégia heurística que mantém o
            jogo estável.
          </p>

          <div className="ai-lab-hero__facts" aria-label="Resumo técnico do modelo">
            {AI_LAB_SECONDARY_FACTS.map((fact) => (
              <div key={fact.label} className="ai-lab-hero__fact">
                <strong>{fact.value}</strong>
                <span>{fact.label}</span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          className="ai-lab-hero__visual"
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.75, delay: 0.08 }}
          aria-hidden
        >
          <div className="ai-lab-hero__orbit ai-lab-hero__orbit--outer" />
          <div className="ai-lab-hero__orbit ai-lab-hero__orbit--inner" />

          <DecorativeCard rank="K" suit="♦" className="ai-lab-playing-card--top" />
          <DecorativeCard rank="7" suit="♣" className="ai-lab-playing-card--left" />
          <DecorativeCard rank="A" suit="♠" className="ai-lab-playing-card--right" />

          <div className="ai-lab-core">
            <span className="ai-lab-core__label">Modelo atual</span>
            <strong>{AI_LAB_MODEL.name}</strong>
            <span className="ai-lab-core__version">artifact v{AI_LAB_MODEL.artifactVersion}</span>

            <div className="ai-lab-core__divider" />

            <div className="ai-lab-core__stats">
              <div>
                <strong>{AI_LAB_MODEL.evaluationRows}</strong>
                <span>estados no holdout</span>
              </div>
              <div>
                <strong>{AI_LAB_MODEL.highConfidenceCoverage}</strong>
                <span>cobertura alta confiança</span>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      <nav className="ai-lab-workspace-nav" aria-label="Navegação interna do AI Lab">
        <button
          type="button"
          className={activeWorkspace === 'overview' ? 'is-active' : undefined}
          onClick={() => setActiveWorkspace('overview')}
        >
          <span>01</span>
          Visão geral
        </button>
        <button
          type="button"
          className={activeWorkspace === 'studio' ? 'is-active' : undefined}
          onClick={() => setActiveWorkspace('studio')}
        >
          <span>02</span>
          Bot Studio
        </button>
        <button
          type="button"
          className={activeWorkspace === 'simulation' ? 'is-active' : undefined}
          onClick={() => setActiveWorkspace('simulation')}
        >
          <span>03</span>
          Simulação
          <small>● replay real</small>
        </button>
        <button
          type="button"
          className={activeWorkspace === 'ml-lab' ? 'is-active' : undefined}
          onClick={() => setActiveWorkspace('ml-lab')}
        >
          <span>04</span>
          ML Lab
        </button>
      </nav>

      {activeWorkspace === 'studio' ? (
        <motion.section
          className="ai-lab-studio"
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          <div className="ai-lab-studio__heading">
            <div>
              <span className="ai-lab-section-heading__eyebrow">Bot Studio</span>
              <h2>Configure como cada bot vai pensar antes da simulação</h2>
              <p>
                Monte um confronto experimental, escolha o motor de inteligência e prepare quais
                detalhes internos deverão aparecer durante a execução.
              </p>
            </div>

            <div className="ai-lab-studio__safe-badge">
              <span>Ambiente isolado</span>
              <strong>Não altera o jogo principal</strong>
            </div>
          </div>

          <div className="ai-lab-studio__matchup">
            <StudioBotCard
              label="BOT A · LAB"
              accent="green"
              config={botA}
              onProfileChange={(nextProfile) =>
                setBotA((current) => ({ ...current, profile: nextProfile }))
              }
              onIntelligenceChange={(intelligence) =>
                setBotA((current) => ({ ...current, intelligence }))
              }
            />

            <div className="ai-lab-studio-versus" aria-hidden>
              <span>VS</span>
              <small>1v1</small>
            </div>

            <StudioBotCard
              label="BOT B · OPONENTE"
              accent="gold"
              config={botB}
              onProfileChange={(nextProfile) =>
                setBotB((current) => ({ ...current, profile: nextProfile }))
              }
              onIntelligenceChange={(intelligence) =>
                setBotB((current) => ({ ...current, intelligence }))
              }
            />
          </div>

          <div className="ai-lab-studio__lower-grid">
            <div className="ai-lab-studio-panel">
              <div className="ai-lab-studio-panel__heading">
                <div>
                  <span>Execução</span>
                  <strong>Parâmetros do laboratório</strong>
                </div>
                <code>simulation.config</code>
              </div>

              <label className="ai-lab-studio-seed">
                <span>Seed</span>
                <input
                  type="number"
                  value={simulationSeed}
                  onChange={(event) => setSimulationSeed(event.target.value)}
                />
                <small>Permite repetir exatamente o mesmo cenário experimental.</small>
              </label>

              <div className="ai-lab-studio-observability">
                <label>
                  <input
                    type="checkbox"
                    checked={showInternalDecisions}
                    onChange={(event) => setShowInternalDecisions(event.target.checked)}
                  />
                  <span>
                    <strong>Decisões internas</strong>
                    <small>Heurística, elegibilidade, ação final e motivo.</small>
                  </span>
                </label>

                <label>
                  <input
                    type="checkbox"
                    checked={showMlPredictions}
                    onChange={(event) => setShowMlPredictions(event.target.checked)}
                  />
                  <span>
                    <strong>Previsões ML</strong>
                    <small>Probabilidade, classe prevista e possíveis overrides.</small>
                  </span>
                </label>

                <label>
                  <input
                    type="checkbox"
                    checked={showArchitectureTrace}
                    onChange={(event) => setShowArchitectureTrace(event.target.checked)}
                  />
                  <span>
                    <strong>Architecture Trace</strong>
                    <small>Mostra o caminho NestJS → adapter → FastAPI → Strategy Engine.</small>
                  </span>
                </label>
              </div>
            </div>

            <div className="ai-lab-studio-panel ai-lab-studio-panel--policy">
              <div className="ai-lab-studio-panel__heading">
                <div>
                  <span>Política ativa · Bot A</span>
                  <strong>{AI_LAB_INTELLIGENCE_LABELS[botA.intelligence]}</strong>
                </div>
                <code>{botA.profile}</code>
              </div>

              {studioThresholds ? (
                <div className="ai-lab-studio-thresholds">
                  <div>
                    <span>Pedir truco</span>
                    <strong>≥ {(studioThresholds.initiative * 100).toFixed(0)}%</strong>
                  </div>
                  <div>
                    <span>Aceitar</span>
                    <strong>≥ {(studioThresholds.accept * 100).toFixed(0)}%</strong>
                  </div>
                  <div>
                    <span>Aumentar</span>
                    <strong>≥ {(studioThresholds.raiseValue * 100).toFixed(0)}%</strong>
                  </div>
                  <div>
                    <span>Recusar</span>
                    <strong>≤ {(studioThresholds.decline * 100).toFixed(0)}%</strong>
                  </div>
                </div>
              ) : (
                <div className="ai-lab-studio-policy-message">
                  <span>{botA.intelligence === 'shadow' ? 'Observação paralela' : 'Controle determinístico'}</span>
                  <strong>
                    {botA.intelligence === 'shadow'
                      ? 'O modelo será observado, mas nenhuma previsão poderá alterar a partida.'
                      : 'Todas as decisões permanecem sob responsabilidade da estratégia heurística.'}
                  </strong>
                </div>
              )}

              <div className="ai-lab-studio-guardrails">
                {AI_LAB_STUDIO_GUARDRAILS.map((guardrail) => (
                  <span key={guardrail}>✓ {guardrail}</span>
                ))}
              </div>
            </div>

            <aside className="ai-lab-studio-summary">
              <span className="ai-lab-studio-summary__eyebrow">Confronto preparado</span>

              <div className="ai-lab-studio-summary__bots">
                <div>
                  <span>Bot A</span>
                  <strong>{AI_LAB_PROFILE_LABELS[botA.profile]}</strong>
                  <small>{AI_LAB_INTELLIGENCE_LABELS[botA.intelligence]}</small>
                </div>

                <span>×</span>

                <div>
                  <span>Bot B</span>
                  <strong>{AI_LAB_PROFILE_LABELS[botB.profile]}</strong>
                  <small>{AI_LAB_INTELLIGENCE_LABELS[botB.intelligence]}</small>
                </div>
              </div>

              <div className="ai-lab-studio-summary__trace">
                <span>Seed</span>
                <strong>{simulationSeed || '—'}</strong>
              </div>

              <button type="button" onClick={prepareSimulation}>
                Abrir simulador
                <span>→</span>
              </button>

              <p>
                A configuração será enviada ao NestJS, encaminhada ao microserviço Python e executada
                pelo Simulation Engine real.
              </p>
            </aside>
          </div>
        </motion.section>
      ) : null}

      {activeWorkspace === 'simulation' ? (
        <motion.section
          className={
            simulationResult
              ? 'ai-lab-simulation-shell ai-lab-simulation-shell--spectator is-running'
              : 'ai-lab-simulation-shell ai-lab-simulation-shell--spectator'
          }
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          {simulationResult ? (
            <div className="ai-lab-spectator-runbar">
              <div>
                <span>INTELLIGENCE SPECTATOR</span>
                <strong>
                  {AI_LAB_PROFILE_LABELS[botA.profile]} ·{' '}
                  {AI_LAB_INTELLIGENCE_LABELS[botA.intelligence]}
                  <i>×</i>
                  {AI_LAB_PROFILE_LABELS[botB.profile]} ·{' '}
                  {AI_LAB_INTELLIGENCE_LABELS[botB.intelligence]}
                </strong>
                <small>Seed {simulationResult.seed} · replay determinístico real</small>
              </div>

              <div>
                <button type="button" onClick={() => setActiveWorkspace('studio')}>
                  Editar bots
                </button>

                <button
                  type="button"
                  className="is-primary"
                  onClick={executeSimulation}
                  disabled={simulationLoading}
                >
                  {simulationLoading ? 'Executando...' : 'Nova partida'}
                </button>
              </div>
            </div>
          ) : (
            <div className="ai-lab-simulation-shell__heading">
              <div>
                <span className="ai-lab-section-heading__eyebrow">Intelligence Spectator Mode</span>
                <h2>A partida acontece. A engenharia explica.</h2>
                <p>
                  O Simulation Engine executa uma partida determinística real no microserviço Python.
                  O AI Lab transforma o resultado em um replay com o visual do jogo e acompanha cada
                  passagem pela heurística, pelo Random Forest e pela política ML-assisted.
                </p>
              </div>

              <div className="ai-lab-simulation-shell__heading-actions">
                <button type="button" onClick={() => setActiveWorkspace('studio')}>
                  Editar bots
                </button>

                <button
                  type="button"
                  className="is-primary"
                  onClick={executeSimulation}
                  disabled={simulationLoading}
                >
                  {simulationLoading ? 'Executando...' : 'Gerar nova partida'}
                </button>
              </div>
            </div>
          )}

          {simulationError ? (
            <div className="ai-lab-simulation-error">
              <strong>Não foi possível executar a simulação.</strong>
              <span>{simulationError}</span>
              <small>
                Confirme se Backend NestJS e Python Bot Service estão ligados nas portas configuradas.
              </small>
            </div>
          ) : null}

          {!simulationResult ? (
            <div className="ai-lab-spectator-launch">
              <div className="ai-lab-spectator-launch__table">
                <div>
                  <span>BOT B</span>
                  <strong>{AI_LAB_PROFILE_LABELS[botB.profile]}</strong>
                  <small>{AI_LAB_INTELLIGENCE_LABELS[botB.intelligence]}</small>
                </div>

                <div className="ai-lab-spectator-launch__versus">
                  <span>SEED {simulationSeed || '13001'}</span>
                  <strong>VS</strong>
                  <small>1v1 · spectator replay</small>
                </div>

                <div>
                  <span>BOT A</span>
                  <strong>{AI_LAB_PROFILE_LABELS[botA.profile]}</strong>
                  <small>{AI_LAB_INTELLIGENCE_LABELS[botA.intelligence]}</small>
                </div>
              </div>

              <div className="ai-lab-spectator-launch__copy">
                <span className="ai-lab-section-heading__eyebrow">Replay determinístico</span>
                <h3>Assista aos bots jogando e veja cada decisão por dentro</h3>
                <p>
                  A execução acontece no HeadlessMatchSimulator real. Depois, o replay usa o pacing
                  visual do Truco Paulista para permitir pausa, inspeção e comparação de decisões.
                </p>

                <div>
                  <span>✓ Mãos com o mesmo componente visual da Match</span>
                  <span>✓ Truco / 6 / 9 / 12 com o drama visual do jogo</span>
                  <span>✓ Console sincronizado com heurística e ML</span>
                  <span>✓ Replay pausável e navegável por decisão</span>
                </div>

                <button type="button" onClick={executeSimulation} disabled={simulationLoading}>
                  {simulationLoading ? 'Executando partida...' : '▶ Iniciar Intelligence Spectator'}
                </button>
              </div>
            </div>
          ) : (
            <AiLabSpectatorReplay
              result={simulationResult}
              eventIndex={simulationEventIndex}
              playing={simulationPlaying}
              speed={simulationSpeed}
              botA={botA}
              botB={botB}
              showArchitectureTrace={showArchitectureTrace}
              onEventIndexChange={(index) => {
                setSimulationPlaying(false);
                setSimulationEventIndex(index);
              }}
              onPlayingChange={setSimulationPlaying}
              onSpeedChange={setSimulationSpeed}
              onRunAgain={executeSimulation}
              onExit={() => {
                setSimulationPlaying(false);
                setActiveWorkspace('studio');
              }}
            />
          )}
        </motion.section>
      ) : null}

      {activeWorkspace === 'overview' ? (
        <>
          <section className="ai-lab-metrics" aria-label="Métricas principais do experimento">
        {AI_LAB_METRICS.map((metric, index) => (
          <MetricCard key={metric.id} metric={metric} index={index} />
        ))}
      </section>

      <motion.section
        className="ai-lab-pipeline"
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.34 }}
      >
        <div className="ai-lab-section-heading">
          <div>
            <span className="ai-lab-section-heading__eyebrow">Jornada da inteligência</span>
            <h2>Do jogo determinístico ao experimento com ML</h2>
          </div>

          <p>
            Cada etapa preservou o comportamento estável do bot enquanto adicionava uma nova camada
            de observação, aprendizado e validação.
          </p>
        </div>

        <div className="ai-lab-pipeline__scroller">
          <div className="ai-lab-pipeline__track">
            {AI_LAB_PIPELINE.map((step, index) => (
              <article key={step.id} className="ai-lab-pipeline__step">
                <div className="ai-lab-pipeline__marker">
                  <span>{step.order}</span>
                </div>

                <div className="ai-lab-pipeline__content">
                  <strong>{step.title}</strong>
                  <p>{step.description}</p>
                </div>

                {index < AI_LAB_PIPELINE.length - 1 ? (
                  <span className="ai-lab-pipeline__arrow" aria-hidden>
                    →
                  </span>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      </motion.section>
        </>
      ) : null}

      {activeWorkspace === 'ml-lab' ? (
        <>
      <motion.section
        className="ai-lab-model-intelligence"
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.16 }}
        transition={{ duration: 0.65 }}
      >
        <div className="ai-lab-section-heading ai-lab-section-heading--model">
          <div>
            <span className="ai-lab-section-heading__eyebrow">Inteligência do modelo</span>
            <h2>Como o candidato final foi escolhido</h2>
          </div>

          <p>
            O caminho começou com uma baseline simples e avançou por modelos progressivamente mais
            capazes. O Random Forest foi selecionado pelo melhor desempenho geral do pipeline.
          </p>
        </div>

        <div className="ai-lab-model-intelligence__grid">
          <div className="ai-lab-model-benchmark">
            <div className="ai-lab-panel-label">
              <span>Evolução dos benchmarks</span>
              <small>Comparação por evolução do pipeline</small>
            </div>

            <div className="ai-lab-model-benchmark__track">
              {AI_LAB_MODEL_STAGES.map((stage, index) => (
                <div key={stage.id} className="ai-lab-model-benchmark__item">
                  <ModelStageCard stage={stage} />

                  {index < AI_LAB_MODEL_STAGES.length - 1 ? (
                    <span className="ai-lab-model-benchmark__connector" aria-hidden>
                      →
                    </span>
                  ) : null}
                </div>
              ))}
            </div>

            <p className="ai-lab-model-benchmark__note">
              A comparação visual preserva apenas métricas consolidadas e verificadas. O valor
              numérico destacado pertence ao holdout final do candidato selecionado.
            </p>
          </div>

          <aside className="ai-lab-candidate-card">
            <div className="ai-lab-candidate-card__badge">
              <span className="ai-lab-candidate-card__pulse" />
              Modelo selecionado
            </div>

            <span className="ai-lab-candidate-card__eyebrow">RandomForestClassifier</span>
            <strong className="ai-lab-candidate-card__metric">74,29%</strong>
            <span className="ai-lab-candidate-card__metric-label">Acurácia balanceada</span>

            <p>
              Validado em um holdout com 3.000 partidas novas, seis configurações de matchup e seeds
              não utilizadas no treinamento.
            </p>

            <div className="ai-lab-candidate-card__details">
              {AI_LAB_CANDIDATE_DETAILS.map((detail) => (
                <div key={detail.label}>
                  <strong>{detail.value}</strong>
                  <span>{detail.label}</span>
                </div>
              ))}
            </div>

            <div className="ai-lab-candidate-card__validation">
              <span>Validação com novas seeds</span>
              <strong>101.648 estados avaliados</strong>
            </div>
          </aside>
        </div>
      </motion.section>

      <motion.section
        className="ai-lab-feature-intelligence"
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.14 }}
        transition={{ duration: 0.65 }}
      >
        <div className="ai-lab-feature-ranking">
          <div className="ai-lab-feature-ranking__heading">
            <div>
              <span className="ai-lab-section-heading__eyebrow">Importância das features</span>
              <h2>O que mais pesou nas previsões</h2>
            </div>

            <span className="ai-lab-feature-ranking__scope">Top 6 · ordem de relevância</span>
          </div>

          <p className="ai-lab-feature-ranking__intro">
            Os sinais mais fortes do candidato final vieram diretamente da composição das cartas,
            não de uma pontuação heurística pronta.
          </p>

          <div className="ai-lab-feature-ranking__list">
            {AI_LAB_FEATURE_SIGNALS.map((feature) => (
              <article key={feature.technicalName} className="ai-lab-feature-signal">
                <span className="ai-lab-feature-signal__rank">
                  {String(feature.rank).padStart(2, '0')}
                </span>

                <div>
                  <strong>{feature.label}</strong>
                  <code>{feature.technicalName}</code>
                </div>

              </article>
            ))}
          </div>
        </div>

        <div className="ai-lab-feature-refactor">
          <div className="ai-lab-feature-refactor__header">
            <span className="ai-lab-section-heading__eyebrow">Decisão de engenharia</span>
            <h2>Remover o atalho foi parte do aprendizado</h2>
          </div>

          <div className="ai-lab-hand-strength">
            <div className="ai-lab-hand-strength__before">
              <span>Feature original</span>
              <code>hand_strength</code>
            </div>

            <span className="ai-lab-hand-strength__arrow" aria-hidden>
              ×
            </span>

            <div className="ai-lab-hand-strength__after">
              <span>Pipeline final</span>
              <strong>Cartas + contexto</strong>
            </div>
          </div>

          <p className="ai-lab-feature-refactor__description">
            <code>hand_strength</code> não era vazamento do alvo. O problema era outro: ela já
            condensava conhecimento manual da heurística do bot. Mantê-la faria o modelo depender
            demais de uma regra que o próprio sistema já conhecia.
          </p>

          <div className="ai-lab-feature-refactor__steps">
            {AI_LAB_FEATURE_REFACTOR.map((step) => (
              <article key={step.index}>
                <span>{step.index}</span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.description}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="ai-lab-feature-refactor__result">
            <span className="ai-lab-feature-refactor__result-icon">♠</span>
            <div>
              <span>Resultado</span>
              <strong>21 features independentes de hand_strength</strong>
            </div>
          </div>
        </div>
      </motion.section>

      <motion.section
        className="ai-lab-runtime"
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.12 }}
        transition={{ duration: 0.65 }}
      >
        <div className="ai-lab-section-heading">
          <div>
            <span className="ai-lab-section-heading__eyebrow">Inteligência em execução</span>
            <h2>Primeiro observar. Depois, influenciar com segurança.</h2>
          </div>

          <p>
            A integração foi desenhada em duas etapas: Shadow Mode para validar o modelo sem alterar
            partidas e ML-assisted para permitir apenas intervenções conservadoras em apostas
            elegíveis.
          </p>
        </div>

        <div className="ai-lab-runtime__grid">
          <div className="ai-lab-shadow-card">
            <div className="ai-lab-runtime-card__heading">
              <div>
                <span>01 · Shadow Mode</span>
                <h3>O modelo entra em campo sem tocar no resultado</h3>
              </div>

              <span className="ai-lab-runtime-card__status">Observação apenas</span>
            </div>

            <div className="ai-lab-shadow-flow">
              {AI_LAB_RUNTIME_STEPS.map((step, index) => (
                <div key={step.id} className="ai-lab-shadow-flow__item">
                  <article>
                    <span className="ai-lab-shadow-flow__index">{step.index}</span>
                    <div>
                      <strong>{step.title}</strong>
                      <p>{step.description}</p>
                    </div>
                  </article>

                  {index < AI_LAB_RUNTIME_STEPS.length - 1 ? (
                    <span className="ai-lab-shadow-flow__connector" aria-hidden>
                      →
                    </span>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="ai-lab-shadow-split">
              <div className="ai-lab-shadow-split__branch">
                <span className="ai-lab-shadow-split__label">Decisão executada</span>
                <strong>Heurística</strong>
                <small>Autoridade do jogo</small>
              </div>

              <div className="ai-lab-shadow-split__center" aria-hidden>
                <span>+</span>
              </div>

              <div className="ai-lab-shadow-split__branch ai-lab-shadow-split__branch--ml">
                <span className="ai-lab-shadow-split__label">Observação paralela</span>
                <strong>Random Forest</strong>
                <small>Probabilidade + classe prevista</small>
              </div>

              <div className="ai-lab-shadow-split__telemetry">
                <span>↓</span>
                <strong>Telemetria de Shadow Mode</strong>
                <small>Estado · decisão · previsão · artefato</small>
              </div>
            </div>
          </div>

          <div className="ai-lab-assisted-card">
            <div className="ai-lab-runtime-card__heading">
              <div>
                <span>02 · ML-assisted</span>
                <h3>Um sinal adicional, não um novo cérebro para o bot</h3>
              </div>

              <span className="ai-lab-runtime-card__status ai-lab-runtime-card__status--experimental">
                Experimental
              </span>
            </div>

            <div className="ai-lab-assisted-card__formula">
              <span>Heurística</span>
              <strong>+</strong>
              <span>Probabilidade ML</span>
              <strong>→</strong>
              <span className="is-highlighted">Aposta assistida</span>
            </div>

            <div className="ai-lab-assisted-card__scope">
              <div>
                <span className="ai-lab-assisted-card__scope-label">ML pode influenciar</span>
                <div className="ai-lab-assisted-card__chips">
                  {AI_LAB_ASSISTED_ACTIONS.map((action) => (
                    <span key={action}>{action}</span>
                  ))}
                </div>
              </div>

              <div>
                <span className="ai-lab-assisted-card__scope-label">Heurística continua responsável</span>
                <div className="ai-lab-assisted-card__chips ai-lab-assisted-card__chips--muted">
                  {AI_LAB_HEURISTIC_RESPONSIBILITIES.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </div>
            </div>

            <div className="ai-lab-assisted-card__guardrails">
              <div>
                <strong>1v1</strong>
                <span>escopo atual</span>
              </div>
              <div>
                <strong>1ª decisão</strong>
                <span>estado elegível</span>
              </div>
              <div>
                <strong>Fallback</strong>
                <span>heurística segura</span>
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      <motion.section
        className="ai-lab-decision-lab"
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.12 }}
        transition={{ duration: 0.65 }}
      >
        <div className="ai-lab-decision-lab__heading">
          <div>
            <span className="ai-lab-section-heading__eyebrow">Laboratório de decisão</span>
            <h2>Explore quando o ML pode alterar uma aposta</h2>
            <p>
              Simulador didático da política ML-assisted. Ele usa os limiares reais do runtime, mas
              não executa o modelo nem apresenta esta probabilidade como uma previsão real.
            </p>
          </div>

          <div className="ai-lab-decision-lab__artifact">
            <span>Origem da política</span>
            <strong>candidato v{AI_LAB_MODEL.artifactVersion}</strong>
          </div>
        </div>

        <div className="ai-lab-decision-lab__grid">
          <div className="ai-lab-decision-controls">
            <div className="ai-lab-decision-control">
              <span className="ai-lab-decision-control__label">Perfil do bot</span>
              <div className="ai-lab-decision-segmented">
                {(Object.keys(AI_LAB_PROFILE_LABELS) as AiLabBotProfile[]).map((profileOption) => (
                  <button
                    key={profileOption}
                    type="button"
                    onClick={() => setProfile(profileOption)}
                    className={profile === profileOption ? 'is-active' : undefined}
                  >
                    {AI_LAB_PROFILE_LABELS[profileOption]}
                  </button>
                ))}
              </div>
            </div>

            <div className="ai-lab-decision-control">
              <span className="ai-lab-decision-control__label">Estado da aposta</span>
              <div className="ai-lab-decision-segmented">
                <button
                  type="button"
                  onClick={() => setScenario('initiative')}
                  className={scenario === 'initiative' ? 'is-active' : undefined}
                >
                  Sem aposta pendente
                </button>
                <button
                  type="button"
                  onClick={() => setScenario('bet-response')}
                  className={scenario === 'bet-response' ? 'is-active' : undefined}
                >
                  Respondendo aposta
                </button>
              </div>
            </div>

            <div className="ai-lab-probability-control">
              <div className="ai-lab-probability-control__top">
                <div>
                  <span className="ai-lab-decision-control__label">Probabilidade simulada</span>
                  <strong>{probability}%</strong>
                </div>

                <span>
                  Perfil {AI_LAB_PROFILE_LABELS[profile].toLowerCase()}
                </span>
              </div>

              <input
                aria-label="Probabilidade simulada de vitória da mão"
                type="range"
                min="0"
                max="100"
                step="1"
                value={probability}
                onChange={(event) => setProbability(Number(event.target.value))}
              />

              <div className="ai-lab-probability-scale">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>

            <div className="ai-lab-threshold-table">
              <div className={scenario === 'bet-response' ? 'is-relevant' : 'is-muted'}>
                <span>Recusar</span>
                <strong>≤ {(activeThresholds.decline * 100).toFixed(0)}%</strong>
              </div>
              <div className={scenario === 'bet-response' ? 'is-relevant' : 'is-muted'}>
                <span>Aceitar</span>
                <strong>≥ {(activeThresholds.accept * 100).toFixed(0)}%</strong>
              </div>
              <div className={scenario === 'initiative' ? 'is-relevant' : 'is-muted'}>
                <span>Pedir</span>
                <strong>≥ {(activeThresholds.initiative * 100).toFixed(0)}%</strong>
              </div>
              <div className={scenario === 'bet-response' ? 'is-relevant' : 'is-muted'}>
                <span>Aumentar</span>
                <strong>≥ {(activeThresholds.raiseValue * 100).toFixed(0)}%</strong>
              </div>
            </div>
          </div>

          <div className={`ai-lab-decision-result ai-lab-decision-result--${assistedDecision.tone}`}>
            <div className="ai-lab-decision-result__status">
              <span className="ai-lab-decision-result__pulse" />
              Resultado da política
            </div>

            <span className="ai-lab-decision-result__probability">{probability}%</span>
            <strong>{assistedDecision.action}</strong>
            <code>{assistedDecision.code}</code>

            <p>{assistedDecision.explanation}</p>

            <div className="ai-lab-decision-result__boundary">
              <span>Importante</span>
              <p>
                O runtime real ainda verifica elegibilidade, ações disponíveis, regras especiais e
                proteções de placar antes de aceitar qualquer override.
              </p>
            </div>
          </div>
        </div>
      </motion.section>

      <motion.section
        className="ai-lab-ab"
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.12 }}
        transition={{ duration: 0.65 }}
      >
        <div className="ai-lab-section-heading ai-lab-section-heading--ab">
          <div>
            <span className="ai-lab-section-heading__eyebrow">Validação A/B direta</span>
            <h2>Um sinal positivo — ainda sem prova de superioridade</h2>
          </div>

          <p>
            Os dois lados usaram o mesmo perfil de estratégia e as mesmas heurísticas de cartas. A
            diferença experimental ficou restrita aos overrides de apostas elegíveis.
          </p>
        </div>

        <div className="ai-lab-ab__grid">
          <div className="ai-lab-ab-scoreboard">
            <div className="ai-lab-ab-scoreboard__header">
              <span>600 partidas</span>
              <strong>{AI_LAB_AB_RESULT.mlOverrides} overrides ML</strong>
            </div>

            <div className="ai-lab-ab-scoreboard__bars">
              <div className="ai-lab-ab-bar ai-lab-ab-bar--assisted">
                <div className="ai-lab-ab-bar__label">
                  <div>
                    <span>ML-assisted</span>
                    <strong>{AI_LAB_AB_RESULT.assistedWins} vitórias</strong>
                  </div>
                  <strong>{AI_LAB_AB_RESULT.assistedWinRate.toFixed(2)}%</strong>
                </div>
                <div className="ai-lab-ab-bar__track">
                  <span style={{ width: `${AI_LAB_AB_RESULT.assistedWinRate}%` }} />
                </div>
              </div>

              <div className="ai-lab-ab-bar">
                <div className="ai-lab-ab-bar__label">
                  <div>
                    <span>Heurística</span>
                    <strong>{AI_LAB_AB_RESULT.heuristicWins} vitórias</strong>
                  </div>
                  <strong>{AI_LAB_AB_RESULT.heuristicWinRate.toFixed(2)}%</strong>
                </div>
                <div className="ai-lab-ab-bar__track">
                  <span style={{ width: `${AI_LAB_AB_RESULT.heuristicWinRate}%` }} />
                </div>
              </div>
            </div>
          </div>

          <div className="ai-lab-confidence-card">
            <span className="ai-lab-confidence-card__eyebrow">Intervalo de confiança · 95%</span>
            <strong>
              {AI_LAB_AB_RESULT.confidenceInterval95.lower.toFixed(2)}% —{' '}
              {AI_LAB_AB_RESULT.confidenceInterval95.upper.toFixed(2)}%
            </strong>

            <div className="ai-lab-confidence-scale">
              <span className="ai-lab-confidence-scale__line" />
              <span className="ai-lab-confidence-scale__interval" />
              <span className="ai-lab-confidence-scale__center" />
              <span className="ai-lab-confidence-scale__point" />

              <div className="ai-lab-confidence-scale__labels">
                <span>45%</span>
                <span>50%</span>
                <span>55%</span>
                <span>60%</span>
              </div>
            </div>

            <div className="ai-lab-confidence-card__verdict">
              <span>Conclusão</span>
              <strong>{AI_LAB_AB_RESULT.verdict}</strong>
              <p>
                Como o intervalo ainda atravessa 50%, o experimento não demonstra superioridade com
                95% de confiança. O recurso permanece experimental e desativado por padrão.
              </p>
            </div>
          </div>
        </div>
      </motion.section>

      <motion.section
        className="ai-lab-limitations"
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.12 }}
        transition={{ duration: 0.65 }}
      >
        <div className="ai-lab-limitations__heading">
          <div>
            <span className="ai-lab-section-heading__eyebrow">Limites do experimento</span>
            <h2>Onde esta inteligência termina — por enquanto</h2>
          </div>

          <p>
            O AI Lab mostra resultados reais sem ampliar artificialmente o que eles provam. O
            candidato tem um domínio específico, guardrails explícitos e perguntas que continuam
            abertas para as próximas evoluções.
          </p>
        </div>

        <div className="ai-lab-limitations__grid">
          {AI_LAB_LIMITATIONS.map((limitation) => (
            <article key={limitation.id} className="ai-lab-limitation-card">
              <span>{limitation.index}</span>
              <div>
                <strong>{limitation.title}</strong>
                <p>{limitation.description}</p>
              </div>
            </article>
          ))}
        </div>

        <div className="ai-lab-limitations__closing">
          <span className="ai-lab-limitations__closing-icon">◎</span>
          <div>
            <span>Leitura correta do resultado</span>
            <strong>
              Inteligência experimental validada no domínio atual — não uma promessa de IA
              universal.
            </strong>
          </div>
        </div>
      </motion.section>
        </>
      ) : null}
    </div>
  );
}
