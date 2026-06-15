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

  const v = useRef<HTMLVideoElement>(null);
  const w = useRef<Awaited<ReturnType<typeof createWorker>> | null>(null);

  useEffect(() => {
    let a = true;
    (async () => {
      try {
        const wk = await createWorker("por");
        if (!a) { wk.terminate(); return; }
        w.current = wk; setOcrOn(true);
      } catch { setOcrOn(true); }
    })();
    return () => { a = false; w.current?.terminate(); };
  }, []);

  const cam = useCallback(async () => {
    try {
      setCamErr(false);
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      if (v.current) { v.current.srcObject = s; setStreamOn(true); }
    } catch { setCamErr(true); setStreamOn(false); }
  }, []);

  useEffect(() => {
    cam();
    return () => { if (v.current?.srcObject) (v.current.srcObject as MediaStream).getTracks().forEach(t => t.stop()); };
  }, [cam]);

  const somar = async () => {
    if (!v.current || !streamOn) return;
    if (!ocrOn || !w.current) { setErr("OCR carregando..."); return; }
    setScanning(true); setErr("");
    try {
      const c = document.createElement("canvas");
      c.width = v.current.videoWidth; c.height = v.current.videoHeight;
      c.getContext("2d")!.drawImage(v.current, 0, 0);
      const { data } = await w.current.recognize(c);
      const t = data.text.trim();
      if (!t) { setErr("Nada encontrado."); return; }
      const p = extractPrice(t);
      if (p === null) { setErr("Centralize o valor na moldura."); return; }
      setTotal(x => x + p); setLast(p);
    } catch { setErr("Erro ao processar."); }
    finally { setScanning(false); }
  };

  return (
    <div className="fixed inset-0 bg-black overflow-hidden select-none">
      <video ref={v} autoPlay playsInline muted
        className={`absolute inset-0 h-full w-full object-cover ${streamOn ? "opacity-100" : "opacity-0"}`}
      />

      {!streamOn && !camErr && (
        <div className="absolute inset-0 z-30 flex items-center justify-center">
          <div className="size-10 animate-spin rounded-full border-[3px] border-white/20 border-t-emerald-400" />
        </div>
      )}

      {camErr && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black px-8 text-white">
          <p className="mb-1 font-semibold">Câmera indisponível</p>
          <p className="mb-6 text-sm text-white/50">Permita o acesso nas configurações.</p>
          <button onClick={cam} className="rounded-full bg-emerald-500 px-8 py-3 font-bold text-white active:bg-emerald-600">
            Tentar novamente
          </button>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
        <div className="relative" style={{ width: "70%", height: "22%" }}>
          <div className="absolute left-0 top-0 size-5 rounded-tl-xl border-l-[3px] border-t-[3px] border-white/40" />
          <div className="absolute right-0 top-0 size-5 rounded-tr-xl border-r-[3px] border-t-[3px] border-white/40" />
          <div className="absolute bottom-0 left-0 size-5 rounded-bl-xl border-b-[3px] border-l-[3px] border-white/40" />
          <div className="absolute bottom-0 right-0 size-5 rounded-br-xl border-r-[3px] border-b-[3px] border-white/40" />
        </div>
      </div>

      {scanning && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50">
          <div className="size-14 animate-spin rounded-full border-[3px] border-white/20 border-t-emerald-400" />
        </div>
      )}

      <div className="absolute left-1/2 top-16 z-10 -translate-x-1/2">
        <div className="rounded-2xl border border-white/15 bg-white/10 px-6 py-3 text-center backdrop-blur-xl">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50">Total</p>
          <p className="text-2xl font-bold text-white">{f(total)}</p>
          {last !== null && (
            <p className="text-xs text-emerald-300/70">+ {f(last)}</p>
          )}
        </div>
      </div>

      {err && (
        <p className="absolute left-1/2 top-44 z-10 -translate-x-1/2 text-center text-sm text-red-400">{err}</p>
      )}

      <button onClick={() => { setTotal(0); setLast(null); setErr(""); }}
        className="absolute right-5 top-56 z-10 flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white/50 backdrop-blur-xl active:bg-white/20"
      >
        <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
        </svg>
        Limpar
      </button>

      <div className="absolute bottom-0 left-0 right-0 z-10 flex items-end justify-center pb-10 pt-20 bg-gradient-to-t from-black/60 to-transparent pointer-events-none">
        <div className="pointer-events-auto">
          <button onClick={somar} disabled={scanning || camErr}
            className="flex size-16 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/30 active:scale-95 active:bg-emerald-600 disabled:opacity-40 transition-all"
          >
            {scanning ? (
              <span className="size-7 animate-spin rounded-full border-[3px] border-white/30 border-t-white" />
            ) : (
              <svg className="size-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
