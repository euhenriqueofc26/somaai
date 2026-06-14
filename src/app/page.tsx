"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { createWorker } from "tesseract.js";

const FRAME_WIDTH_PCT = 0.75;
const FRAME_HEIGHT_RATIO = 0.4;

function extractPrice(text: string): number | null {
  let cleaned = text
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

  let candidates: number[] = [];

  const rzPattern = /R\s*\$\s*(\d+[\s,]*\d{0,2})/gi;
  let match: RegExpExecArray | null;
  while ((match = rzPattern.exec(cleaned)) !== null) {
    const val = match[1].replace(/\s/g, "").replace(",", ".");
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0 && num < 10000) candidates.push(num);
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
  const containerRef = useRef<HTMLDivElement>(null);
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
    async function init() {
      try {
        const worker = await createWorker("por");
        workerRef.current = worker;
        ocrReadyRef.current = true;
        setOcrLoading(false);
      } catch {
        setOcrLoading(false);
      }
    }
    init();
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraReady(true);
      } catch {
        setErrorMsg("Permita o acesso à câmera nas configurações do navegador.");
      }
    }
    startCamera();
    return () => {
      active = false;
    };
  }, []);

  const handleSomar = useCallback(async () => {
    if (status === "scanning" || !cameraReady) return;
    if (!ocrReadyRef.current) {
      setErrorMsg("OCR ainda está carregando. Aguarde...");
      return;
    }

    const video = videoRef.current;
    const container = containerRef.current;
    const worker = workerRef.current;
    if (!video || !container || !worker) return;

    setStatus("scanning");
    setErrorMsg("");
    setDebugText("");

    try {
      const cr = container.getBoundingClientRect();
      const fw = cr.width * FRAME_WIDTH_PCT;
      const fh = fw * FRAME_HEIGHT_RATIO;
      const fx = (cr.width - fw) / 2;
      const fy = (cr.height - fh) / 2;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const aspectVideo = vw / vh;
      const aspectContainer = cr.width / cr.height;

      let sx: number, sy: number, sw: number, sh: number;
      if (aspectVideo > aspectContainer) {
        sh = vh;
        sw = vh * aspectContainer;
        sx = (vw - sw) / 2;
        sy = 0;
      } else {
        sw = vw;
        sh = vw / aspectContainer;
        sx = 0;
        sy = (vh - sh) / 2;
      }

      const scaleX = sw / cr.width;
      const scaleY = sh / cr.height;

      const cropX = sx + fx * scaleX;
      const cropY = sy + fy * scaleY;
      const cropW = fw * scaleX;
      const cropH = fh * scaleY;

      const canvas = document.createElement("canvas");
      canvas.width = cropW;
      canvas.height = cropH;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      const { data } = await worker.recognize(canvas);
      const recognizedText = data.text.trim();

      if (!recognizedText) {
        setStatus("error");
        setErrorMsg("Nenhum texto encontrado. Tente novamente.");
        return;
      }

      setDebugText(recognizedText.slice(0, 120));

      const price = extractPrice(recognizedText);

      if (price === null) {
        setStatus("error");
        setErrorMsg(
          `Preço não identificado no texto. Centralize melhor o valor na moldura.`
        );
        return;
      }

      setTotal((p) => p + price);
      setLastPrice(price);
      setHistory((p) => [...p, price]);
      setStatus("success");
    } catch {
      setStatus("error");
      setErrorMsg("Erro ao processar a imagem. Tente novamente.");
    }
  }, [cameraReady, status]);

  const handleLimpar = useCallback(() => {
    setTotal(0);
    setLastPrice(null);
    setHistory([]);
    setStatus("idle");
    setErrorMsg("");
    setDebugText("");
  }, []);

  return (
    <div className="relative h-dvh w-dvw overflow-hidden bg-black select-none">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 h-full w-full object-cover ${
          cameraReady ? "opacity-100" : "opacity-0"
        }`}
      />

      {!cameraReady && !errorMsg && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="size-10 animate-spin rounded-full border-4 border-white/30 border-t-green-400" />
        </div>
      )}

      <div
        ref={containerRef}
        className="relative z-10 flex h-full flex-col"
      >
        <div className="flex-shrink-0 bg-black/60 px-4 pb-4 pt-12 text-center">
          <h1 className="text-lg font-bold tracking-wide text-white">
            Leitor de Preços
          </h1>
          <p className="mt-1 text-4xl font-extrabold text-green-400">
            R$ {total.toFixed(2).replace(".", ",")}
          </p>
        </div>

        <div className="relative flex flex-1 flex-col">
          <div className="absolute inset-0">
            <div className="h-1/3 w-full bg-black/55" />
            <div className="flex h-1/3 w-full flex-row">
              <div className="h-full flex-1 bg-black/55" />
              <div className="relative h-full" style={{ width: `${FRAME_WIDTH_PCT * 100}%` }}>
                <div className="absolute -inset-[2px] rounded-xl border-2 border-white/30" />
                <div className="absolute -top-[2px] -left-[2px] size-6 rounded-tl-xl border-t-4 border-l-4 border-green-400" />
                <div className="absolute -top-[2px] -right-[2px] size-6 rounded-tr-xl border-t-4 border-r-4 border-green-400" />
                <div className="absolute -bottom-[2px] -left-[2px] size-6 rounded-bl-xl border-b-4 border-l-4 border-green-400" />
                <div className="absolute -bottom-[2px] -right-[2px] size-6 rounded-br-xl border-b-4 border-r-4 border-green-400" />
                {status === "scanning" && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="size-10 animate-spin rounded-full border-4 border-white/30 border-t-green-400" />
                  </div>
                )}
                {status === "success" && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex size-12 items-center justify-center rounded-full bg-green-500/80 text-2xl">
                      ✓
                    </div>
                  </div>
                )}
                {status === "error" && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex size-12 items-center justify-center rounded-full bg-red-500/80 text-2xl">
                      ✗
                    </div>
                  </div>
                )}
              </div>
              <div className="h-full flex-1 bg-black/55" />
            </div>
            <div className="h-1/3 w-full bg-black/55" />
          </div>
        </div>

        <div className="flex-shrink-0 bg-black/60 px-4 pb-6 pt-4 text-center">
          {errorMsg && (
            <p className="mb-2 text-sm text-red-400">{errorMsg}</p>
          )}

          {lastPrice !== null && (
            <p className="mb-1 text-base text-white/70">
              Último:{" "}
              <span className="text-xl font-bold text-white">
                R$ {lastPrice.toFixed(2).replace(".", ",")}
              </span>
            </p>
          )}

          {history.length > 0 && (
            <p className="mb-3 text-xs text-white/40">
              {history.length} item(ns) lido(s) — Total: R${" "}
              {total.toFixed(2).replace(".", ",")}
            </p>
          )}

          {showDebug && debugText && (
            <p className="mb-2 text-[10px] text-yellow-400/70 break-all px-4">
              OCR: {debugText}
            </p>
          )}

          <div className="mx-auto flex max-w-sm gap-3">
            <button
              onClick={handleLimpar}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-500 px-6 py-4 text-base font-bold text-white active:bg-red-600"
            >
              🗑 Limpar
            </button>
            <button
              onClick={handleSomar}
              disabled={status === "scanning" || !cameraReady || ocrLoading}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-500 px-6 py-4 text-base font-bold text-white active:bg-green-600 disabled:opacity-50"
            >
              {status === "scanning" ? (
                <span className="inline-block size-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                "📷"
              )}{" "}
              Somar
            </button>
          </div>

          <button
            onClick={() => setShowDebug((p) => !p)}
            className="mt-2 text-[10px] text-white/20 underline"
          >
            debug
          </button>
        </div>
      </div>

      {errorMsg && !cameraReady && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 p-8">
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
