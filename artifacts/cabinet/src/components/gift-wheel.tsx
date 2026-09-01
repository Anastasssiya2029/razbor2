import { useEffect, useId, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useGetAnalysisGift, useDrawAnalysisGift, getGetAnalysisGiftQueryKey, type AnalysisGift } from '@workspace/api-client-react';
import { GIFT_CATALOG, type GiftPrize, type GiftTariff } from '@/lib/server/gifts/catalog';

const TARIFF_LABEL: Record<GiftTariff, string> = { self: 'Самостоятельный', support: 'С сопровождением' };

type WheelPhase = 'idle' | 'requesting' | 'spinning';

interface GiftWheelProps {
  analysisRunId: string;
  canDraw: boolean;
}

function GiftIcon({ size = 30 }: { size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8" />
    <path d="M7.5 8C5.6 8 4.5 7.1 4.5 5.7 4.5 4.5 5.4 3.5 6.7 3.5 9 3.5 12 8 12 8M16.5 8c1.9 0 3-.9 3-2.3 0-1.2-.9-2.2-2.2-2.2C15 3.5 12 8 12 8" />
  </svg>;
}

function TariffIcon({ group = false }: { group?: boolean }) {
  return <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx={group ? '9' : '12'} cy="8" r="3" /><path d={group ? 'M3.5 19c.5-3.6 2.4-5.5 5.5-5.5s5 1.9 5.5 5.5' : 'M5.5 20c.6-4.3 2.8-6.5 6.5-6.5s5.9 2.2 6.5 6.5'} />
    {group && <><circle cx="17" cy="9" r="2.3" /><path d="M15.6 14.3c2.7-.6 4.5 1 4.9 4.2" /></>}
  </svg>;
}

function WheelSector({ prize, index, total, gradientPrefix }: { prize: GiftPrize; index: number; total: number; gradientPrefix: string }) {
  const angle = 360 / total;
  const startAngle = index * angle * Math.PI / 180;
  const endAngle = (index + 1) * angle * Math.PI / 180;
  const center = 400;
  const radius = 400;
  const x1 = center + radius * Math.cos(startAngle);
  const y1 = center + radius * Math.sin(startAngle);
  const x2 = center + radius * Math.cos(endAngle);
  const y2 = center + radius * Math.sin(endAngle);
  const fill = prize.wheelTone === 'light' ? '#fff' : `url(#${gradientPrefix}-${prize.wheelTone})`;
  const verticalOffset = (prize.wheelLabel.length - 1) * 0.6;

  return <g>
    <path d={`M${center},${center} L${x1},${y1} A${radius},${radius} 0 0,1 ${x2},${y2} Z`} fill={fill} className="gift-wheel-sector" />
    <g transform={`translate(${center}, ${center}) rotate(${index * angle + angle / 2})`}>
      <text x="260" y="0" textAnchor="middle" dominantBaseline="middle" className={`gift-wheel-sector-label ${prize.wheelTone === 'light' ? 'dark-text' : 'light-text'}`}>
        {prize.wheelLabel.map((line, lineIndex) => <tspan key={line} x="260" dy={lineIndex === 0 ? `-${verticalOffset}em` : '1.2em'}>{line}</tspan>)}
      </text>
    </g>
  </g>;
}

function landingAngle(prizes: readonly GiftPrize[], prizeCode: string): number {
  const index = prizes.findIndex((prize) => prize.code === prizeCode);
  if (index < 0) return 0;
  const sectorAngle = 360 / prizes.length;
  return (prizes.length - index - 0.5) * sectorAngle;
}

export function GiftWheel({ analysisRunId, canDraw: canDrawFromOwnership }: GiftWheelProps) {
  const gradientPrefix = `gift-${useId().replace(/:/g, '')}`;
  const queryClient = useQueryClient();
  const { data: status, isLoading: loading } = useGetAnalysisGift(analysisRunId, { query: { queryKey: getGetAnalysisGiftQueryKey(analysisRunId) } });
  const drawGift = useDrawAnalysisGift();
  const gifts: AnalysisGift[] = status?.gifts ?? [];
  const giftBySelf = gifts.find((item) => item.tariff === 'self') ?? null;
  const giftBySupport = gifts.find((item) => item.tariff === 'support') ?? null;
  const giftByTariff: Record<GiftTariff, AnalysisGift | null> = { self: giftBySelf, support: giftBySupport };
  const bothDrawn = Boolean(giftBySelf && giftBySupport);

  const [tariff, setTariff] = useState<GiftTariff>('self');
  const [phase, setPhase] = useState<WheelPhase>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [clientNumber, setClientNumber] = useState('');
  const [spinDurationMs, setSpinDurationMs] = useState(4000);
  const [spinRotation, setSpinRotation] = useState(0);
  const [showPrize, setShowPrize] = useState(false);
  const busy = phase !== 'idle';
  const gift = giftByTariff[tariff];
  const canDraw = canDrawFromOwnership && !gift;

  // On the currently selected tariff's fixed prize (if any) changing --
  // either because a fresh draw just landed, or the page loaded with an
  // already-drawn gift -- snap the wheel to that prize's resting angle. The
  // ".is-spinning" class (and with it the CSS transition) is already gone by
  // the time this runs after a draw, so this never visibly re-animates.
  useEffect(() => {
    setSpinRotation(gift ? landingAngle(GIFT_CATALOG[tariff], gift.prizeCode) : 0);
  }, [tariff, gift?.prizeCode]);

  // Once, when gift data first loads: if only one tariff has been drawn,
  // default to showing that tariff's fixed prize (matching the single-gift
  // behavior). If both or neither are drawn, keep the default "self" tab.
  const didInitTariff = useRef(false);
  useEffect(() => {
    if (didInitTariff.current || !status) return;
    didInitTariff.current = true;
    if (giftBySelf && !giftBySupport) setTariff('self');
    else if (giftBySupport && !giftBySelf) setTariff('support');
  }, [status, giftBySelf, giftBySupport]);

  useEffect(() => {
    if (!showPrize) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setShowPrize(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [showPrize]);

  function chooseTariff(nextTariff: GiftTariff) {
    if (busy) return;
    setTariff(nextTariff);
    setMessage(null);
  }

  async function draw() {
    if (!canDraw || busy || gift) return;
    const spinCount = Number(clientNumber);
    if (!Number.isInteger(spinCount) || spinCount <= 10) {
      setMessage('Введите число клиента больше 10.');
      return;
    }

    setMessage(null);
    setPhase('requesting');
    try {
      const result = await drawGift.mutateAsync({ analysisRunId, data: { tariff } });
      const selectedGift = result.gift;
      const selectedTariff = selectedGift.tariff;
      const prizes = GIFT_CATALOG[selectedTariff];
      const duration = 4000 + Math.max(0, spinCount - 10) * 100;
      const rotations = Math.max(3, Math.floor(spinCount / prizes.length));
      const targetAngle = landingAngle(prizes, selectedGift.prizeCode);
      const currentAngle = ((spinRotation % 360) + 360) % 360;
      const targetDelta = (targetAngle - currentAngle + 360) % 360;
      const finalRotation = spinRotation + rotations * 360 + targetDelta;

      setTariff(selectedTariff);
      setSpinDurationMs(duration);
      setPhase('spinning');
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      setSpinRotation(finalRotation);
      await new Promise((resolve) => window.setTimeout(resolve, duration + 300));
      await queryClient.invalidateQueries({ queryKey: getGetAnalysisGiftQueryKey(analysisRunId) });
      setShowPrize(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось закрепить подарок.');
    } finally {
      setPhase('idle');
    }
  }

  const currentPrizes = GIFT_CATALOG[tariff];
  const fixedPrize = gift ? GIFT_CATALOG[gift.tariff].find((prize) => prize.code === gift.prizeCode) : null;

  return <section className="gift-section no-print" aria-labelledby="gift-title">
    <div className="gift-heading">
      <span className="admin-eyebrow">Бонус за быстрое решение</span>
      <h2 id="gift-title"><span>Колесо</span> возможностей</h2>
    </div>

    <div className="gift-tariffs" role="group" aria-label="Формат участия">
      <button className={tariff === 'self' ? 'active' : ''} onClick={() => chooseTariff('self')} type="button" aria-pressed={tariff === 'self'} disabled={busy}><TariffIcon />Самостоятельный{giftBySelf && <span className="gift-tariff-done" aria-hidden="true">✓</span>}</button>
      <button className={tariff === 'support' ? 'active' : ''} onClick={() => chooseTariff('support')} type="button" aria-pressed={tariff === 'support'} disabled={busy}><TariffIcon group />С сопровождением{giftBySupport && <span className="gift-tariff-done" aria-hidden="true">✓</span>}</button>
    </div>

    {(giftBySelf || giftBySupport) && <div className="gift-both-summary" aria-live="polite">
      {(giftBySelf ? [giftBySelf] : []).concat(giftBySupport ? [giftBySupport] : []).map((item) => {
        const prize = GIFT_CATALOG[item.tariff].find((entry) => entry.code === item.prizeCode);
        return <div className="gift-both-summary-item" key={item.tariff}>
          <TariffIcon group={item.tariff === 'support'} />
          <span className="gift-both-summary-tariff">{TARIFF_LABEL[item.tariff]}:</span>
          <strong>{prize?.label ?? item.prizeName}</strong>
        </div>;
      })}
    </div>}

    <div className="gift-wheel-stage">
      <div className="gift-wheel-glow" aria-hidden="true" />
      <div className="gift-wheel-rim" aria-hidden="true" />
      <svg className="gift-wheel-pointer" aria-hidden="true" width="64" height="80" viewBox="0 0 48 64" fill="none">
        <path d="M24 64L4 20C4 8.954 12.954 0 24 0s20 8.954 20 20L24 64Z" fill={`url(#${gradientPrefix}-pointer)`} stroke="white" strokeWidth="4" />
        <circle cx="24" cy="18" r="6" fill="white" />
        <defs><linearGradient id={`${gradientPrefix}-pointer`} x1="24" y1="0" x2="24" y2="64" gradientUnits="userSpaceOnUse"><stop stopColor="#d92e96" /><stop offset="1" stopColor="#401450" /></linearGradient></defs>
      </svg>
      <div className={`gift-wheel-disc ${phase === 'spinning' ? 'is-spinning' : ''}`} style={{ transform: `rotate(${spinRotation}deg)`, transitionDuration: `${spinDurationMs}ms` }}>
        <svg viewBox="0 0 800 800" aria-hidden="true">
          <defs>
            <linearGradient id={`${gradientPrefix}-dark`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#6b2aa0" /><stop offset="1" stopColor="#401450" /></linearGradient>
            <linearGradient id={`${gradientPrefix}-accent`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#d92e96" /><stop offset="1" stopColor="#6b2aa0" /></linearGradient>
          </defs>
          <g transform="rotate(-90 400 400)">{currentPrizes.map((prize, index) => <WheelSector key={prize.code} prize={prize} index={index} total={currentPrizes.length} gradientPrefix={gradientPrefix} />)}</g>
        </svg>
      </div>
      <div className="gift-wheel-hub" aria-hidden="true"><span><GiftIcon /></span></div>
    </div>

    <div className="gift-client-panel">
      <label htmlFor={`${gradientPrefix}-client-number`}><span>Число клиента (&gt;10)</span></label>
      <input id={`${gradientPrefix}-client-number`} type="number" min="11" step="1" inputMode="numeric" placeholder="72" value={clientNumber} onChange={(event) => { setClientNumber(event.target.value); setMessage(null); }} onKeyDown={(event) => { if (event.key === 'Enter') void draw(); }} disabled={!canDraw || busy || Boolean(gift)} />
      <button type="button" onClick={() => void draw()} disabled={!canDraw || busy || Boolean(gift)} aria-label="Прокрутить колесо и закрепить подарок">{busy ? <span className="gift-spinner">✦</span> : <span aria-hidden="true">▶</span>}</button>
    </div>

    {loading && <p className="gift-note" aria-live="polite">Проверяю доступ к колесу…</p>}
    {!loading && !canDraw && !gift && <p className="gift-note">Подарок может закрепить менеджер, который сохранил данные клиента.</p>}
    {message && <p className="gift-note error" role="alert">{message}</p>}
    {gift && <div className="gift-fixed-summary" aria-live="polite"><GiftIcon size={24} /><div><small>Подарок закреплён</small><strong>{fixedPrize?.label ?? gift.prizeName}</strong></div><button type="button" onClick={() => setShowPrize(true)}>Посмотреть подарок</button></div>}

    {showPrize && gift && <div className="gift-prize-modal" role="dialog" aria-modal="true" aria-labelledby="gift-prize-title">
      <button className="gift-prize-backdrop" type="button" aria-label="Вернуться к колесу" onClick={() => setShowPrize(false)} />
      <div className="gift-prize-card">
        <button className="gift-prize-close" type="button" aria-label="Вернуться к колесу" onClick={() => setShowPrize(false)}>×</button>
        <div className="gift-prize-icon"><GiftIcon size={34} /></div>
        <h3 id="gift-prize-title">Поздравляем!</h3>
        <p className="gift-prize-kicker">Ваш подарок</p>
        <div className="gift-prize-name"><strong>{fixedPrize?.label ?? gift.prizeName}</strong>{fixedPrize?.grand && <span>Super prize</span>}</div>
        <div className="gift-prize-fixed">Подарок уже закреплён за этим разбором</div>
        <button className="gift-prize-return" type="button" onClick={() => setShowPrize(false)}>Вернуться к колесу</button>
        <small>Формат: {gift.tariff === 'self' ? 'Самостоятельный' : 'С сопровождением'}</small>
      </div>
    </div>}
  </section>;
}
