"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createWorker } from "tesseract.js";
import { Camera, Loader2 } from "lucide-react";

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

      if (!text) {
        setErrorMsg("Nenhum texto encontrado.");
        return;
      }

      const price = extractPrice(text);
      if (price === null) {
        setErrorMsg("Preço não identificado. Centralize o valor na moldura.");
        return;
      }

      setTotal((p) => p + price);
      setLastPrice(price);
    } catch {
      setErrorMsg("Erro ao processar a imagem.");
    } finally {
      setIsScanning(false);
    }
  };

  const handleLimpar = () => {
    setTotal(0);
    setLastPrice(null);
    setErrorMsg("");
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-black font-sans">
      <header className="shrink-0 bg-emerald-600 px-5 pb-5 pt-12 text-white">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-100">
          Total
        </p>
        <p className="text-4xl font-extrabold tracking-tight">
          {formatBRL(total)}
        </p>
        {lastPrice !== null && (
          <p className="mt-0.5 text-sm text-emerald-200/70">
            + {formatBRL(lastPrice)}
          </p>
        )}
      </header>

      <main className="relative flex flex-1 flex-col">
        <div className="flex flex-1 flex-col p-4">
          <div className="relative flex w-full flex-1 items-center justify-center overflow-hidden rounded-2xl bg-slate-900 shadow-inner">
            {camError ? (
              <div className="flex flex-col items-center p-6 text-slate-400">
                <p className="text-sm">Câmera indisponível.</p>
                <button
                  onClick={startCamera}
                  className="mt-4 rounded-lg bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700"
                >
                  Tentar Novamente
                </button>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="size-full object-cover"
                />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="relative flex h-16 w-48 items-center justify-center rounded-lg border-2 border-emerald-400/50 bg-black/10">
                    <div className="absolute left-0 top-0 size-4 rounded-tl-sm border-l-2 border-t-2 border-emerald-400" />
                    <div className="absolute right-0 top-0 size-4 rounded-tr-sm border-r-2 border-t-2 border-emerald-400" />
                    <div className="absolute bottom-0 left-0 size-4 rounded-bl-sm border-b-2 border-l-2 border-emerald-400" />
                    <div className="absolute bottom-0 right-0 size-4 rounded-br-sm border-r-2 border-b-2 border-emerald-400" />
                    <span className="rounded bg-black/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-emerald-400/60">
                      Alinhe o Preço
                    </span>
                  </div>
                </div>
              </>
            )}

            {isScanning && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-900/80 text-emerald-400 backdrop-blur-sm">
                <Loader2 className="mb-4 size-12 animate-spin" />
                <p className="animate-pulse font-medium">Lendo etiqueta...</p>
              </div>
            )}
          </div>

          {errorMsg && (
            <p className="mt-3 text-center text-sm text-red-400">{errorMsg}</p>
          )}

          <div className="mt-4 flex gap-4">
            <button
              onClick={handleLimpar}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-600 bg-black/25 px-5 py-4 text-sm font-bold text-zinc-400 active:bg-white/10"
            >
              Limpar
            </button>
            <button
              onClick={handleSomar}
              disabled={isScanning || camError}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-4 text-sm font-bold text-white shadow-sm active:bg-emerald-700 disabled:opacity-50"
            >
              {isScanning ? (
                <span className="inline-block size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <Camera className="size-5" />
              )}
              Somar
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
