"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createWorker } from "tesseract.js";

function extractPrice(text: string): number | null {
  const cleaned = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[•·]/g, ",")
    .replace(/\.(\d{3})(?=\D|$)/g, "$1")
    .replace(/O/g, "0").replace(/o/g, "0").replace(/l/g, "1")
    .replace(/[|!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/g, (c) =>
      c === "," || c === "." ? c : " "
    );

  const candidates: number[] = [];
  const rz = /R\s*\$\s*(\d+[\s,]*\d{0,2})/gi;
  let m: RegExpExecArray | null;
  while ((m = rz.exec(cleaned)) !== null) {
    const n = parseFloat(m[1].replace(/\s/g, "").replace(",", "."));
    if (!isNaN(n) && n > 0 && n < 10000 && !candidates.includes(n)) candidates.push(n);
  }
  const cp = /(\d+)[,](\d{2})\b/g;
  while ((m = cp.exec(cleaned)) !== null) {
    const n = parseFloat(`${m[1]}.${m[2]}`);
    if (!isNaN(n) && n > 0 && n < 10000 && !candidates.includes(n)) candidates.push(n);
  }
  const dp = /(\d+)[.](\d{2})\b/g;
  while ((m = dp.exec(cleaned)) !== null) {
    const n = parseFloat(`${m[1]}.${m[2]}`);
    if (!isNaN(n) && n > 0 && n < 10000 && !candidates.includes(n)) candidates.push(n);
  }
  return candidates.length > 0 ? Math.max(...candidates) : null;
}

const f = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export default function Home() {
  const [total, setTotal] = useState(0);
  const [last, setLast] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [camErr, setCamErr] = useState(false);
  const [streamOn, setStreamOn] = useState(false);
  const [ocrOn, setOcrOn] = useState(false);
  const [err, setErr] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const workerRef = useRef<Awaited<ReturnType<typeof createWorker>> | null>(null);

  useEffect(() => {
    let a = true;
    (async () => {
      try {
        const w = await createWorker("por");
        if (!a) { w.terminate(); return; }
        workerRef.current = w; setOcrOn(true);
      } catch { setOcrOn(true); }
    })();
    return () => { a = false; workerRef.current?.terminate(); };
  }, []);

  const startCam = useCallback(async () => {
    try {
      setCamErr(false);
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      if (videoRef.current) { videoRef.current.srcObject = s; setStreamOn(true); }
    } catch { setCamErr(true); setStreamOn(false); }
  }, []);

  useEffect(() => {
    startCam();
    return () => { if (videoRef.current?.srcObject) (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop()); };
  }, [startCam]);

  const somar = async () => {
    if (!videoRef.current || !streamOn) return;
    if (!ocrOn || !workerRef.current) { setErr("OCR carregando..."); return; }
    setScanning(true); setErr("");
    try {
      const c = document.createElement("canvas");
      c.width = videoRef.current.videoWidth; c.height = videoRef.current.videoHeight;
      c.getContext("2d")!.drawImage(videoRef.current, 0, 0);
      const { data } = await workerRef.current.recognize(c);
      const t = data.text.trim();
      if (!t) { setErr("Nada encontrado."); return; }
      const p = extractPrice(t);
      if (p === null) { setErr("Centralize o valor na moldura."); return; }
      setTotal(x => x + p); setLast(p);
    } catch { setErr("Erro ao processar."); }
    finally { setScanning(false); }
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-50 font-sans text-slate-800">
      <header className="shrink-0 bg-emerald-600 px-6 pb-6 pt-14 text-white shadow-lg rounded-b-3xl">
        <div className="flex flex-col">
          <span className="text-sm font-semibold uppercase tracking-wider text-emerald-100">
            Total da Compra
          </span>
          <span className="text-4xl font-extrabold tracking-tight">
            {f(total)}
          </span>
          {last !== null && (
            <span className="mt-0.5 text-sm text-emerald-200/70">
              + {f(last)}
            </span>
          )}
        </div>
      </header>

      <main className="relative flex flex-1 flex-col p-4 pb-6 min-h-0">
        <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-2xl bg-slate-900 shadow-inner min-h-0">
          {camErr ? (
            <div className="flex flex-col items-center p-6 text-slate-400">
              <p className="text-sm">Câmera indisponível.</p>
              <p className="mt-1 text-xs">Verifique as permissões.</p>
              <button onClick={startCam} className="mt-4 rounded-lg bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700">
                Tentar Novamente
              </button>
            </div>
          ) : (
            <>
              <video ref={videoRef} autoPlay playsInline muted className="size-full object-cover" />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative flex h-16 w-48 items-center justify-center rounded-lg border-2 border-emerald-400/50">
                  <div className="absolute left-0 top-0 size-4 rounded-tl-sm border-l-2 border-t-2 border-emerald-400" />
                  <div className="absolute right-0 top-0 size-4 rounded-tr-sm border-r-2 border-t-2 border-emerald-400" />
                  <div className="absolute bottom-0 left-0 size-4 rounded-bl-sm border-b-2 border-l-2 border-emerald-400" />
                  <div className="absolute bottom-0 right-0 size-4 rounded-br-sm border-r-2 border-b-2 border-emerald-400" />
                  <span className="rounded bg-slate-900/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-emerald-400/50">
                    Alinhe o Preço
                  </span>
                </div>
              </div>
            </>
          )}

          {scanning && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-900/80 text-emerald-400 backdrop-blur-sm">
              <div className="mb-4 size-12 animate-spin rounded-full border-4 border-white/30 border-t-emerald-400" />
              <p className="animate-pulse font-medium">Lendo etiqueta...</p>
            </div>
          )}
        </div>

        {err && (
          <p className="mt-2 text-center text-sm text-red-400">{err}</p>
        )}

        <div className="mt-4 flex gap-3 shrink-0">
          <button
            onClick={() => { setTotal(0); setLast(null); setErr(""); }}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-4 text-sm font-bold text-zinc-500 active:bg-zinc-100"
          >
            Limpar
          </button>
          <button
            onClick={somar}
            disabled={scanning || camErr}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-4 text-sm font-bold text-white shadow-sm active:bg-emerald-700 disabled:opacity-50"
          >
            {scanning ? (
              <span className="inline-block size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
              </svg>
            )}
            Somar
          </button>
        </div>
      </main>
    </div>
  );
}
