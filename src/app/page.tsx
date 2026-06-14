"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createWorker } from "tesseract.js";
import { Loader2 } from "lucide-react";

function extractPrice(text: string): number | null {
  const cleaned = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[•·]/g, ",")
    .replace(/\.(\d{3})(?=\D|$)/g, "$1")
    .replace(/O/g, "0")
    .replace(/o/g, "0")
    .replace(/l/g, "1")
    .replace(/[|!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/g, (c) =>
      c === "," || c === "." ? c : " "
    );

  const candidates: number[] = [];

  const rzPattern = /R\s*\$\s*(\d+[\s,]*\d{0,2})/gi;
  let match: RegExpExecArray | null;
  while ((match = rzPattern.exec(cleaned)) !== null) {
    const val = match[1].replace(/\s/g, "").replace(",", ".");
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0 && num < 10000 && !candidates.includes(num))
      candidates.push(num);
  }

  const commaPattern = /(\d+)[,](\d{2})\b/g;
  while ((match = commaPattern.exec(cleaned)) !== null) {
    const num = parseFloat(`${match[1]}.${match[2]}`);
    if (!isNaN(num) && num > 0 && num < 10000 && !candidates.includes(num))
      candidates.push(num);
  }

  const dotPattern = /(\d+)[.](\d{2})\b/g;
  while ((match = dotPattern.exec(cleaned)) !== null) {
    const num = parseFloat(`${match[1]}.${match[2]}`);
    if (!isNaN(num) && num > 0 && num < 10000 && !candidates.includes(num))
      candidates.push(num);
  }

  return candidates.length > 0 ? Math.max(...candidates) : null;
}

const formatBRL = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

export default function Home() {
  const [total, setTotal] = useState(0);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [camError, setCamError] = useState(false);
  const [streamActive, setStreamActive] = useState(false);
  const [ocrReady, setOcrReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const workerRef = useRef<Awaited<ReturnType<typeof createWorker>> | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const worker = await createWorker("por");
        if (!active) { worker.terminate(); return; }
        workerRef.current = worker;
        setOcrReady(true);
      } catch { setOcrReady(true); }
    })();
    return () => { active = false; workerRef.current?.terminate(); };
  }, []);

  const startCamera = useCallback(async () => {
    try {
      setCamError(false);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setStreamActive(true);
      }
    } catch {
      setCamError(true);
      setStreamActive(false);
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      }
    };
  }, [startCamera]);

  const handleSomar = async () => {
    if (!videoRef.current || !streamActive) return;
    if (!ocrReady || !workerRef.current) {
      setErrorMsg("OCR ainda está carregando...");
      return;
    }

    setIsScanning(true);
    setErrorMsg("");

    try {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const { data } = await workerRef.current.recognize(canvas);
      const text = data.text.trim();

      if (!text) { setErrorMsg("Nenhum texto encontrado."); return; }

      const price = extractPrice(text);
      if (price === null) { setErrorMsg("Preço não identificado. Centralize o valor na moldura."); return; }

      setTotal((p) => p + price);
      setLastPrice(price);
    } catch {
      setErrorMsg("Erro ao processar a imagem.");
    } finally {
      setIsScanning(false);
    }
  };

  const handleLimpar = () => {
    setTotal(0); setLastPrice(null); setErrorMsg("");
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-black font-sans">
      <video
        ref={videoRef}
        autoPlay playsInline muted
        className={`absolute inset-0 h-full w-full object-cover ${streamActive ? "opacity-100" : "opacity-0"}`}
      />

      {!streamActive && !camError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center">
          <div className="size-10 animate-spin rounded-full border-4 border-white/30 border-t-emerald-400" />
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
        <div
          className="relative flex items-center justify-center rounded-xl border-2 border-emerald-400/40 bg-black/10"
          style={{ width: "78%", height: "26%", boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)" }}
        >
          <div className="absolute left-0 top-0 size-5 rounded-tl-lg border-l-[3px] border-t-[3px] border-emerald-400" />
          <div className="absolute right-0 top-0 size-5 rounded-tr-lg border-r-[3px] border-t-[3px] border-emerald-400" />
          <div className="absolute bottom-0 left-0 size-5 rounded-bl-lg border-b-[3px] border-l-[3px] border-emerald-400" />
          <div className="absolute bottom-0 right-0 size-5 rounded-br-lg border-r-[3px] border-b-[3px] border-emerald-400" />
          <span className="rounded bg-black/50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-emerald-400/60">
            Alinhe o Preço
          </span>
        </div>
      </div>

      {isScanning && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/70 text-emerald-400 backdrop-blur-sm">
          <Loader2 className="mb-4 size-12 animate-spin" />
          <p className="animate-pulse font-medium">Lendo etiqueta...</p>
        </div>
      )}

      <header className="absolute left-0 right-0 top-0 z-20 bg-gradient-to-b from-black/80 to-transparent px-5 pb-8 pt-14 text-white">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
          Total
        </p>
        <p className="text-4xl font-extrabold tracking-tight">
          {formatBRL(total)}
        </p>
        {lastPrice !== null && (
          <p className="mt-0.5 text-sm text-emerald-200/60">
            + {formatBRL(lastPrice)}
          </p>
        )}
      </header>

      {camError && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80 text-white">
          <p className="mb-2 text-sm">Câmera indisponível.</p>
          <p className="mb-6 text-xs text-white/50">Verifique as permissões do navegador.</p>
          <button
            onClick={startCamera}
            className="rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white active:bg-emerald-700"
          >
            Tentar Novamente
          </button>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/80 to-transparent px-5 pb-8 pt-10">
        {errorMsg && (
          <p className="mb-3 text-center text-sm text-red-400">{errorMsg}</p>
        )}

        <div className="mx-auto flex max-w-md gap-4">
          <button
            onClick={handleLimpar}
            className="flex flex-1 items-center justify-center rounded-xl border border-zinc-600 bg-black/25 px-4 py-4 text-sm font-bold text-zinc-400 active:bg-white/10"
          >
            Limpar
          </button>
          <button
            onClick={handleSomar}
            disabled={isScanning || camError}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-4 text-sm font-bold text-white shadow-sm active:bg-emerald-700 disabled:opacity-40"
          >
            {isScanning ? (
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
      </div>
    </div>
  );
}
