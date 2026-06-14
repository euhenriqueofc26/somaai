"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createWorker } from "tesseract.js";
import {
  ShoppingCart,
  Heart,
  Camera,
  Plus,
  Trash2,
  Loader2,
  Check,
  X,
  AlertTriangle,
  Edit3,
  Coffee,
  Copy,
  CameraOff,
} from "lucide-react";

interface Item {
  id: string;
  name: string;
  price: number;
}

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
  const [items, setItems] = useState<Item[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [camError, setCamError] = useState(false);
  const [streamActive, setStreamActive] = useState(false);
  const [ocrReady, setOcrReady] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [showDonationModal, setShowDonationModal] = useState(false);
  const [currentPrice, setCurrentPrice] = useState("");
  const [currentName, setCurrentName] = useState("");
  const [isManual, setIsManual] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const workerRef = useRef<Awaited<ReturnType<typeof createWorker>> | null>(null);
  const pixKey = "pix@somaai.com.br";

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

  const captureAndScan = async () => {
    if (!videoRef.current || !streamActive) return;
    if (!ocrReady || !workerRef.current) {
      alert("O motor de leitura (OCR) ainda está carregando. Tente novamente em instantes.");
      return;
    }

    setIsScanning(true);
    try {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const { data } = await workerRef.current.recognize(canvas);
      const text = data.text;

      const priceRegex = /\b\d+[.,]\d{2}\b/;
      const match = text.match(priceRegex);

      if (match) {
        const formattedPrice = match[0].replace(",", ".");
        setCurrentPrice(formattedPrice);
        setCurrentName(`Item ${items.length + 1}`);
        setIsManual(false);
        setShowModal(true);
      } else {
        alert("Não foi possível identificar o preço com clareza. Por favor, insira manualmente.");
        openManualEntry();
      }
    } catch (error) {
      console.error("Erro no OCR:", error);
      alert("Erro ao processar imagem.");
    } finally {
      setIsScanning(false);
    }
  };

  const openManualEntry = () => {
    setCurrentPrice("");
    setCurrentName(`Item ${items.length + 1}`);
    setIsManual(true);
    setShowModal(true);
  };

  const confirmItem = () => {
    const priceNum = parseFloat(currentPrice.replace(",", "."));
    if (isNaN(priceNum) || priceNum <= 0) {
      alert("Por favor, insira um preço válido.");
      return;
    }

    setItems((prev) => [
      ...prev,
      { id: Date.now().toString(), name: currentName || `Item ${prev.length + 1}`, price: priceNum },
    ]);
    setShowModal(false);
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const copyPixKey = () => {
    navigator.clipboard.writeText(pixKey);
    alert("Chave Pix copiada com sucesso!");
  };

  const total = items.reduce((acc, item) => acc + item.price, 0);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-50 font-sans text-slate-800">
      <header className="shrink-0 bg-emerald-600 p-6 pb-8 text-white shadow-lg rounded-b-3xl z-10">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <ShoppingCart className="size-6" /> SomaAI
          </h1>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowDonationModal(true)}
              className="flex items-center justify-center p-1 text-emerald-100 transition-colors hover:text-white"
              title="Apoie o projeto"
            >
              <Heart className="size-5 fill-current" />
            </button>
            <span className="text-sm font-medium text-emerald-100">{items.length} itens</span>
          </div>
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold uppercase tracking-wider text-emerald-100">
            Total da Compra
          </span>
          <span className="text-4xl font-extrabold tracking-tight">{formatBRL(total)}</span>
        </div>
      </header>

      <main className="relative flex flex-1 flex-col overflow-y-auto">
        <div className="shrink-0 p-4">
          <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl bg-slate-900 shadow-inner md:aspect-[4/3]">
            {camError ? (
              <div className="flex flex-col items-center p-6 text-slate-400">
                <CameraOff className="mb-3 size-12 opacity-50" />
                <p className="text-sm">Câmera indisponível.</p>
                <p className="mt-1 text-xs">Verifique as permissões.</p>
                <button
                  onClick={startCamera}
                  className="mt-4 rounded-lg bg-slate-800 px-4 py-2 text-sm text-white transition-colors hover:bg-slate-700"
                >
                  Tentar Novamente
                </button>
              </div>
            ) : (
              <>
                <video ref={videoRef} autoPlay playsInline className="size-full object-cover" />
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

            {isScanning && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-900/80 text-emerald-400 backdrop-blur-sm">
                <Loader2 className="mb-4 size-12 animate-spin" />
                <p className="animate-pulse font-medium">Lendo etiqueta...</p>
              </div>
            )}
          </div>

          <div className="mt-4 flex gap-3">
            <button
              onClick={captureAndScan}
              disabled={isScanning || camError}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-800 py-4 font-semibold text-white shadow-sm transition-all hover:bg-slate-700 active:scale-95 disabled:opacity-50 disabled:active:scale-100"
            >
              <Camera className="size-5" />
              Ler Preço (OCR)
            </button>
            <button
              onClick={openManualEntry}
              className="flex items-center justify-center rounded-xl bg-emerald-100 px-6 py-4 font-semibold text-emerald-700 shadow-sm transition-all hover:bg-emerald-200 active:scale-95"
              title="Adicionar Manualmente"
            >
              <Plus className="size-6" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-400">
            Carrinho ({items.length})
          </h2>

          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-100 bg-white py-10 text-center">
              <p className="font-medium text-slate-400">Seu carrinho está vazio.</p>
              <p className="mt-1 text-sm text-slate-400">Escaneie um preço para começar.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {[...items].reverse().map((item) => (
                <div
                  key={item.id}
                  className="group flex items-center justify-between rounded-xl border border-slate-100 bg-white p-4 shadow-sm"
                >
                  <div>
                    <p className="font-semibold text-slate-700">{item.name}</p>
                    <p className="text-sm font-medium text-slate-400">{formatBRL(item.price)}</p>
                  </div>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="rounded-lg p-2 text-rose-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="size-5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {showDonationModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full rounded-3xl bg-white p-6 text-center shadow-2xl sm:w-96">
            <div className="mb-2 flex justify-end">
              <button
                onClick={() => setShowDonationModal(false)}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-rose-100">
              <Coffee className="size-8 text-rose-500" />
            </div>

            <h3 className="mb-2 text-xl font-bold text-slate-800">Pague um café!</h3>
            <p className="mb-6 text-sm text-slate-500">
              O SomaAI te ajudou a economizar no mercado hoje? Considere fazer uma doação de
              qualquer valor para apoiar o desenvolvimento contínuo do app.
            </p>

            <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Chave Pix (E-mail)
              </p>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-slate-700">{pixKey}</span>
                <button
                  onClick={copyPixKey}
                  className="flex-shrink-0 rounded-lg bg-emerald-100 p-2 text-emerald-600 transition-colors hover:bg-emerald-200"
                  title="Copiar Chave"
                >
                  <Copy className="size-4" />
                </button>
              </div>
            </div>

            <button
              onClick={() => setShowDonationModal(false)}
              className="w-full rounded-xl bg-slate-100 py-3.5 font-bold text-slate-600 transition-colors hover:bg-slate-200"
            >
              Talvez depois
            </button>
          </div>
        </div>
      )}

      {showModal && (
        <div className="absolute inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-4 backdrop-blur-sm sm:inset-0 sm:items-center">
          <div className="w-full rounded-3xl bg-white p-6 shadow-2xl sm:w-96">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-800">
                {isManual ? "Adicionar Item" : "Confirmar Preço"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100"
              >
                <X className="size-5" />
              </button>
            </div>

            {!isManual && (
              <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 size-5 shrink-0" />
                <p>
                  O OCR pode cometer erros. Verifique se o valor lido está correto antes de
                  confirmar.
                </p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-500">
                  Nome do Produto
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Edit3 className="size-4 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    value={currentName}
                    onChange={(e) => setCurrentName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 font-medium outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                    placeholder="Ex: Arroz 5kg"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-500">
                  Valor (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={currentPrice}
                  onChange={(e) => setCurrentPrice(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-2xl font-bold text-slate-800 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                  placeholder="0,00"
                  autoFocus
                />
              </div>
            </div>

            <div className="mt-8 flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 rounded-xl bg-slate-100 py-3.5 font-bold text-slate-600 transition-colors hover:bg-slate-200"
              >
                Cancelar
              </button>
              <button
                onClick={confirmItem}
                className="flex-[2] flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 font-bold text-white shadow-lg shadow-emerald-600/30 transition-all hover:bg-emerald-700 active:scale-95"
              >
                <Check className="size-5" /> Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
