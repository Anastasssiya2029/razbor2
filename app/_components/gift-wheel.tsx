"use client";

import { useEffect, useState } from "react";
import { GIFT_CATALOG, type GiftTariff } from "@/server/gifts/catalog";
import type { StoredGift } from "@/server/gifts/service";

export function GiftWheel({ analysisRunId }: { analysisRunId: string }) {
  const [tariff, setTariff] = useState<GiftTariff>("self");
  const [gift, setGift] = useState<StoredGift | null>(null);
  const [canDraw, setCanDraw] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    void fetch(`/api/analysis-runs/${analysisRunId}/gift`, { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<{ gift: StoredGift | null; canDraw: boolean }> : null)
      .then((result) => { if (result) { setGift(result.gift); setCanDraw(result.canDraw); } });
  }, [analysisRunId]);

  async function draw() {
    if (!canDraw || spinning || gift) return;
    setSpinning(true); setMessage(null);
    try {
      const response = await fetch(`/api/analysis-runs/${analysisRunId}/gift`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tariff }),
      });
      const result = await response.json() as { gift?: StoredGift; message?: string };
      if (!response.ok || !result.gift) throw new Error(result.message ?? "Не удалось закрепить подарок.");
      await new Promise((resolve) => window.setTimeout(resolve, 1600));
      setGift(result.gift); setCanDraw(false);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось закрепить подарок."); }
    finally { setSpinning(false); }
  }

  return <section className="gift-section no-print" aria-labelledby="gift-title">
    <span className="admin-eyebrow">Бонус за быстрое решение</span><h2 id="gift-title">Колесо возможностей</h2>
    {gift ? <div className="gift-won"><span>🎁</span><div><small>Подарок закреплён</small><strong>{gift.prizeName}</strong></div></div> : <>
      <div className="gift-tariffs" role="group" aria-label="Формат участия"><button className={tariff === "self" ? "active" : ""} onClick={() => setTariff("self")} type="button">Самостоятельный</button><button className={tariff === "support" ? "active" : ""} onClick={() => setTariff("support")} type="button">С сопровождением</button></div>
      <div className="gift-wheel-layout">
        <div className={`gift-wheel ${spinning ? "spinning" : ""}`} aria-hidden="true"><button type="button" onClick={() => void draw()} disabled={!canDraw || spinning} aria-label="Выбрать и закрепить подарок">{spinning ? "…" : "🎁"}</button></div>
        <ol className="gift-prizes">{GIFT_CATALOG[tariff].map((prize) => <li key={prize.code}>{prize.label}</li>)}</ol>
      </div>
      {!canDraw && <p className="gift-note">Закрепить подарок может менеджер, который провёл готовый разбор.</p>}
      {message && <p className="gift-note error" role="alert">{message}</p>}
    </>}
  </section>;
}
