"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { createWorker } from "tesseract.js";

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

type Status = "idle" | "scanning" | "success" | "error";

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<Awaited<ReturnType<typeof createWorker>> | null>(null);
  const ocrReadyRef = useRef(false);

  const [cameraReady, setCameraReady] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [debugText, setDebugText] = useState("");
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const worker = await createWorker("por");
        if (!active) { worker.terminate(); return; }
        workerRef.current = worker;
        ocrReadyRef.current = true;
      } catch { /* ignore */ }
      setOcrLoading(false);
    })();
    return () => { active = false; workerRef.current?.terminate(); };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (!active) { stream.getTracks().forEach((t) => t.stop()); return; }
        const video = videoRef.current;
        if (video) { video.srcObject = stream; await video.play(); }
        setCameraReady(true);
      } catch {
        setErrorMsg("Permita o acesso à câmera nas configurações do navegador.");
      }
    })();
    return () => { active = false; };
  }, []);

  const handleSomar = useCallback(async () => {
    if (status === "scanning" || !cameraReady) return;
    if (!ocrReadyRef.current) { setErrorMsg("OCR está carregando..."); return; }

    const video = videoRef.current;
    const frame = frameRef.current;
    const worker = workerRef.current;
    if (!video || !frame || !worker) return;

    setStatus("scanning");
    setErrorMsg("");
    setDebugText("");

    try {
      const fr = frame.getBoundingClientRect();
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const cw = window.innerWidth;
      const ch = window.innerHeight;
      const aV = vw / vh;
      const aC = cw / ch;

      let sx: number, sy: number, sw: number, sh: number;
      if (aV > aC) { sh = vh; sw = vh * aC; sx = (vw - sw) / 2; sy = 0; }
      else { sw = vw; sh = vw / aC; sx = 0; sy = (vh - sh) / 2; }

      const scX = sw / cw, scY = sh / ch;
      const cropX = sx + fr.left * scX;
      const cropY = sy + fr.top * scY;
      const cropW = fr.width * scX;
      const cropH = fr.height * scY;

      const canvas = document.createElement("canvas");
      canvas.width = cropW;
      canvas.height = cropH;
      canvas.getContext("2d")!.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      const { data } = await worker.recognize(canvas);
      const recognizedText = data.text.trim();
      if (!recognizedText) { setStatus("error"); setErrorMsg("Nenhum texto encontrado."); return; }

      setDebugText(recognizedText.slice(0, 120));
      const price = extractPrice(recognizedText);
      if (price === null) { setStatus("error"); setErrorMsg("Preço não identificado. Centralize o valor na moldura."); return; }

      setTotal((p) => p + price);
      setLastPrice(price);
      setHistory((p) => [...p, price]);
      setStatus("success");
    } catch {
      setStatus("error");
      setErrorMsg("Erro ao processar a imagem.");
    }
  }, [cameraReady, status]);

  const handleLimpar = useCallback(() => {
    setTotal(0); setLastPrice(null); setHistory([]);
    setStatus("idle"); setErrorMsg(""); setDebugText("");
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-black select-none">
      <video
        ref={videoRef}
        autoPlay playsInline muted
        className={`absolute inset-0 h-full w-full object-cover ${cameraReady ? "opacity-100" : "opacity-0"}`}
      />

      {!cameraReady && !errorMsg && (
        <div className="absolute inset-0 z-30 flex items-center justify-center">
          <div className="size-10 animate-spin rounded-full border-4 border-white/30 border-t-green-400" />
        </div>
      )}

      <div
        ref={frameRef}
        className="absolute rounded-xl"
        style={{
          width: "75%",
          height: "28%",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
          border: "1.5px solid rgba(255,255,255,0.15)",
        }}
      >
        <div className="absolute -top-[1.5px] -left-[1.5px] size-6 rounded-tl-xl border-t-[3px] border-l-[3px] border-green-400" />
        <div className="absolute -top-[1.5px] -right-[1.5px] size-6 rounded-tr-xl border-t-[3px] border-r-[3px] border-green-400" />
        <div className="absolute -bottom-[1.5px] -left-[1.5px] size-6 rounded-bl-xl border-b-[3px] border-l-[3px] border-green-400" />
        <div className="absolute -bottom-[1.5px] -right-[1.5px] size-6 rounded-br-xl border-b-[3px] border-r-[3px] border-green-400" />

        {status === "scanning" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="size-10 animate-spin rounded-full border-4 border-white/30 border-t-green-400" />
          </div>
        )}
        {status === "success" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-green-500/70 text-2xl">✓</div>
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-red-500/70 text-2xl">✗</div>
          </div>
        )}
      </div>

      <div className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/80 to-transparent px-5 pt-14 pb-8">
        <h1 className="text-center text-lg font-bold tracking-wider text-white">
          somaaiS2
        </h1>
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/80 to-transparent px-5 pt-12 pb-8">
        {lastPrice !== null && (
          <p className="mb-1 text-center text-sm text-white/40">último</p>
        )}

        {lastPrice !== null ? (
          <p className="text-center text-4xl font-extrabold text-green-400">
            R$ {total.toFixed(2).replace(".", ",")}
          </p>
        ) : (
          <p className="text-center text-lg text-white/25">
            Aponte a câmera para o valor e toque em Somar
          </p>
        )}

        {lastPrice !== null && (
          <p className="mt-1 text-center text-xs text-white/30">
            + R$ {lastPrice.toFixed(2).replace(".", ",")} ({history.length} item(ns))
          </p>
        )}

        {errorMsg && (
          <p className="mt-2 text-center text-sm text-red-400">{errorMsg}</p>
        )}

        {showDebug && debugText && (
          <p className="mb-2 mt-1 break-all px-4 text-center text-[10px] text-yellow-400/60">
            OCR: {debugText}
          </p>
        )}

        <div className="mx-auto mt-5 flex max-w-md gap-3">
          <button
            onClick={handleLimpar}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-600 bg-black/25 px-5 py-3.5 text-sm font-bold text-zinc-400 active:bg-white/10"
          >
            <svg className="size-4 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
            Limpar
          </button>
          <button
            onClick={handleSomar}
            disabled={status === "scanning" || !cameraReady || ocrLoading}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-green-500 px-5 py-3.5 text-sm font-bold text-white active:bg-green-600 disabled:opacity-40"
          >
            {status === "scanning" ? (
              <span className="inline-block size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
              </svg>
            )}
            Somar
          </button>
        </div>

        <button
          onClick={() => setShowDebug((p) => !p)}
          className="mt-2 block w-full text-center text-[9px] text-white/15"
        >
          debug
        </button>
      </div>

      {errorMsg && !cameraReady && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 p-8">
          <div className="text-center">
            <p className="mb-6 text-lg text-white">{errorMsg}</p>
            <button
              onClick={() => window.location.reload()}
              className="rounded-xl bg-green-500 px-8 py-4 font-bold text-white"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
