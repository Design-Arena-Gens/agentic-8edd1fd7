"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type AgentMode = "simulate" | "live";

type AgentSettings = {
  apiKey: string;
  sellerId: string;
  baseUrl: string;
  mode: AgentMode;
  autoStart: boolean;
};

type ProductDraft = {
  title: string;
  category: string;
  price: string;
  currency: string;
  unit: string;
  stock: string;
  minOrderQty: string;
  keywords: string;
  imageUrls: string;
  shortDescription: string;
  description: string;
  features: string;
  packaging: string;
  leadTime: string;
};

type ProductPayload = {
  id: string;
  createdAt: number;
  payload: ProductDraft;
};

type LogLevel = "info" | "error" | "success";

type LogEntry = {
  id: string;
  level: LogLevel;
  headline: string;
  details?: string;
  timestamp: number;
};

const makeId = () =>
  typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2, 10)}`;

const splitCsvLine = (line: string) => {
  const values: string[] = [];
  let current = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (insideQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (character === "," && !insideQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current);
  return values;
};

const cleanCell = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/""/g, '"');
  }
  return trimmed;
};

const initialDraft: ProductDraft = {
  title: "",
  category: "",
  price: "",
  currency: "INR",
  unit: "Unit",
  stock: "",
  minOrderQty: "",
  keywords: "",
  imageUrls: "",
  shortDescription: "",
  description: "",
  features: "",
  packaging: "",
  leadTime: "",
};

const defaultSettings: AgentSettings = {
  apiKey: "",
  sellerId: "",
  baseUrl: "https://sellerapi.indiamart.com/catalog/v1/product/add",
  mode: "simulate",
  autoStart: true,
};

export default function Home() {
  const [settings, setSettings] = useState<AgentSettings>(defaultSettings);
  const [draft, setDraft] = useState<ProductDraft>(initialDraft);
  const [queue, setQueue] = useState<ProductPayload[]>([]);
  const [processing, setProcessing] = useState(false);
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const queueRef = useRef<ProductPayload[]>([]);
  const processingRef = useRef(processing);
  const activeProductRef = useRef<string | null>(null);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    processingRef.current = processing;
  }, [processing]);

  useEffect(() => {
    activeProductRef.current = activeProductId;
  }, [activeProductId]);

  const filteredLogs = useMemo(
    () => logs.slice(-50).sort((a, b) => b.timestamp - a.timestamp),
    [logs],
  );

  const appendLog = useCallback((entry: Omit<LogEntry, "timestamp" | "id">) => {
    setLogs((prev) => [
      ...prev,
      {
        id: makeId(),
        timestamp: Date.now(),
        ...entry,
      },
    ]);
  }, []);

  const resetDraft = useCallback(() => {
    setDraft(initialDraft);
  }, []);

  const addToQueue = useCallback(
    (product: ProductDraft) => {
      const id = makeId();
      const payload: ProductPayload = {
        id,
        createdAt: Date.now(),
        payload: product,
      };

      setQueue((prev) => [...prev, payload]);
      appendLog({
        level: "info",
        headline: `Product queued: ${product.title || "Untitled"}`,
        details: "Added to automation queue",
      });

      if (settings.autoStart && !processingRef.current) {
        setProcessing(true);
      }
    },
    [appendLog, settings.autoStart],
  );

  const handleDraftChange = useCallback(
    (key: keyof ProductDraft) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setDraft((prev) => ({
        ...prev,
        [key]: event.target.value,
      }));
    },
    [],
  );

  const normalizeProduct = useCallback((product: ProductDraft) => {
    const features = product.features
      .split("\n")
      .map((feature) => feature.trim())
      .filter(Boolean);

    const imageUrls = product.imageUrls
      .split("\n")
      .map((url) => url.trim())
      .filter(Boolean);

    const keywords = product.keywords
      .split(",")
      .map((keyword) => keyword.trim())
      .filter(Boolean);

    return {
      ...product,
      features,
      imageUrls,
      keywords,
    };
  }, []);

  const runAgent = useCallback(async () => {
    if (processingRef.current) {
      return;
    }
    if (queueRef.current.length === 0) {
      appendLog({
        level: "info",
        headline: "Queue empty",
        details: "No products waiting in the queue.",
      });
      return;
    }
    setProcessing(true);
  }, [appendLog]);

  const stopAgent = useCallback(() => {
    setProcessing(false);
    setActiveProductId(null);
    appendLog({
      level: "info",
      headline: "Agent paused",
      details: "Automation paused manually.",
    });
  }, [appendLog]);

  const processNextProduct = useCallback(async () => {
    if (!processingRef.current) {
      return;
    }
    if (activeProductRef.current) {
      return;
    }

    const [next] = queueRef.current;

    if (!next) {
      setProcessing(false);
      appendLog({
        level: "success",
        headline: "Queue complete",
        details: "All products processed successfully.",
      });
      return;
    }

    setActiveProductId(next.id);
    appendLog({
      level: "info",
      headline: `Processing: ${next.payload.title || "Untitled product"}`,
      details: `Attempting IndiaMART sync in ${settings.mode === "simulate" ? "simulation" : "live"} mode.`,
    });

    try {
      const response = await fetch("/api/indiamart", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          settings,
          product: normalizeProduct(next.payload),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        const message = typeof result?.error === "string" ? result.error : "Unable to upload product.";
        throw new Error(message);
      }

      appendLog({
        level: "success",
        headline: `Uploaded: ${next.payload.title || "Untitled product"}`,
        details:
          settings.mode === "simulate"
            ? "Simulation completed. Ready to upload live."
            : `IndiaMART responded with status: ${result?.status ?? "success"}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error while uploading product.";
      appendLog({
        level: "error",
        headline: `Failed: ${next.payload.title || "Untitled product"}`,
        details: message,
      });
    } finally {
      setQueue((prev) => prev.filter((item) => item.id !== next.id));
      setActiveProductId(null);
      setTimeout(() => {
        if (processingRef.current) {
          void processNextProduct();
        }
      }, 600);
    }
  }, [appendLog, normalizeProduct, settings]);

  useEffect(() => {
    if (processing) {
      void processNextProduct();
    }
  }, [processing, processNextProduct]);

  useEffect(() => {
    if (!processingRef.current || activeProductRef.current) {
      return;
    }
    if (queueRef.current.length > 0) {
      void processNextProduct();
    }
  }, [queue, processNextProduct]);

  const handleAddDraftToQueue = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!draft.title) {
        appendLog({
          level: "error",
          headline: "Missing product name",
          details: "Add a product title before queuing.",
        });
        return;
      }
      addToQueue(draft);
      resetDraft();
    },
    [addToQueue, appendLog, draft, resetDraft],
  );

  const autoGenerateDescriptions = useCallback(() => {
    const features = draft.features
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const highlights = features.length ? features.join(", ") : "premium quality build with reliable performance";
    const generatedShort = `${draft.title || "This product"} delivers ${highlights.toLowerCase()}.`;
    const generatedLong = `${draft.title || "This product"} is engineered for businesses that need dependable supply. Key highlights include ${highlights.toLowerCase()}. Suitable for categories like ${draft.category || "industrial supplies"} with ready stock of ${
      draft.stock || "custom quantities"
    }.`;

    setDraft((prev) => ({
      ...prev,
      shortDescription: generatedShort,
      description: generatedLong,
    }));

    appendLog({
      level: "success",
      headline: "Descriptions generated",
      details: "Draft updated using the agent template.",
    });
  }, [appendLog, draft.category, draft.features, draft.stock, draft.title]);

  const parseCsvFile = useCallback(
    async (file: File) => {
      const text = await file.text();
      const [headerLine, ...rows] = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      if (!headerLine) {
        appendLog({
          level: "error",
          headline: "Empty CSV",
          details: "No header row detected.",
        });
        return;
      }
      const headers = splitCsvLine(headerLine).map((column) =>
        cleanCell(column).toLowerCase().replace(/\s+/g, ""),
      );

      const expected = new Set([
        "title",
        "category",
        "price",
        "currency",
        "unit",
        "stock",
        "minorderqty",
        "keywords",
        "imageurls",
        "shortdescription",
        "description",
        "features",
        "packaging",
        "leadtime",
      ]);

      const missing = [...expected].filter((key) => !headers.includes(key));
      if (missing.length) {
        appendLog({
          level: "error",
          headline: "CSV headers mismatch",
          details: `Missing columns: ${missing.join(", ")}`,
        });
        return;
      }

      const getValue = (row: string[], column: string) => {
        const index = headers.indexOf(column);
        if (index === -1) {
          return "";
        }
        return row[index] ?? "";
      };

      rows.forEach((rowLine) => {
        const cells = splitCsvLine(rowLine).map((value) => cleanCell(value));
        const product: ProductDraft = {
          title: getValue(cells, "title"),
          category: getValue(cells, "category"),
          price: getValue(cells, "price"),
          currency: getValue(cells, "currency") || "INR",
          unit: getValue(cells, "unit") || "Unit",
          stock: getValue(cells, "stock"),
          minOrderQty: getValue(cells, "minorderqty"),
          keywords: getValue(cells, "keywords"),
          imageUrls: getValue(cells, "imageurls"),
          shortDescription: getValue(cells, "shortdescription"),
          description: getValue(cells, "description"),
          features: getValue(cells, "features"),
          packaging: getValue(cells, "packaging"),
          leadTime: getValue(cells, "leadtime"),
        };
        addToQueue(product);
      });

      appendLog({
        level: "success",
        headline: "CSV imported",
        details: `${rows.length} product rows processed.`,
      });
    },
    [addToQueue, appendLog],
  );

  const handleCsvUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const [file] = Array.from(event.target.files ?? []);
      if (!file) {
        return;
      }
      await parseCsvFile(file);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [parseCsvFile],
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight text-white">IndiaMART Auto Product Agent</h1>
          <p className="mt-3 max-w-3xl text-sm text-slate-300">
            Configure your IndiaMART credentials once and let the automation agent push every queued product to your
            catalogue. You can work in simulation mode to validate payloads or switch to live mode for direct sync.
          </p>
        </header>

        <section className="mt-8 grid gap-6 lg:grid-cols-[3fr,2fr]">
          <div className="space-y-6">
            <form
              onSubmit={handleAddDraftToQueue}
              className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 shadow-xl shadow-black/40"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Product Draft</h2>
                <button
                  type="button"
                  onClick={resetDraft}
                  className="text-xs font-medium text-slate-300 underline underline-offset-4 hover:text-white"
                >
                  Reset
                </button>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-200 md:col-span-2">
                  Product title
                  <input
                    value={draft.title}
                    onChange={handleDraftChange("title")}
                    className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/60"
                    placeholder="Premium Copper Wire 16 AWG"
                    required
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-medium text-slate-200">
                  Category
                  <input
                    value={draft.category}
                    onChange={handleDraftChange("category")}
                    className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/60"
                    placeholder="Electrical Cables"
                  />
                </label>

                <div className="grid grid-cols-[2fr,1fr] gap-3">
                  <label className="flex flex-col gap-2 text-sm font-medium text-slate-200">
                    Price
                    <input
                      value={draft.price}
                      onChange={handleDraftChange("price")}
                      className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/60"
                      placeholder="115"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-medium text-slate-200">
                    Currency
                    <input
                      value={draft.currency}
                      onChange={handleDraftChange("currency")}
                      className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/60"
                      placeholder="INR"
                    />
                  </label>
                </div>

                <label className="flex flex-col gap-2 text-sm font-medium text-slate-200">
                  Unit
                  <input
                    value={draft.unit}
                    onChange={handleDraftChange("unit")}
                    className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/60"
                    placeholder="Roll"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-medium text-slate-200">
                  Available stock
                  <input
                    value={draft.stock}
                    onChange={handleDraftChange("stock")}
                    className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/60"
                    placeholder="500"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-medium text-slate-200">
                  Minimum order quantity
                  <input
                    value={draft.minOrderQty}
                    onChange={handleDraftChange("minOrderQty")}
                    className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/60"
                    placeholder="50"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-medium text-slate-200 md:col-span-2">
                  Keywords (comma separated)
                  <input
                    value={draft.keywords}
                    onChange={handleDraftChange("keywords")}
                    className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/60"
                    placeholder="copper wire, e-beam insulated, hvac"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-medium text-slate-200 md:col-span-2">
                  Image URLs (one per line)
                  <textarea
                    value={draft.imageUrls}
                    onChange={handleDraftChange("imageUrls")}
                    className="h-24 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/60"
                    placeholder="https://example.com/image-1.jpg&#10;https://example.com/image-2.jpg"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-medium text-slate-200 md:col-span-2">
                  Key features (one per line)
                  <textarea
                    value={draft.features}
                    onChange={handleDraftChange("features")}
                    className="h-28 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/60"
                    placeholder={"High conductivity copper\nFlame retardant insulation\nAvailable in custom lengths"}
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-medium text-slate-200 md:col-span-2">
                  Packaging details
                  <input
                    value={draft.packaging}
                    onChange={handleDraftChange("packaging")}
                    className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/60"
                    placeholder="Packed on 20kg spools with vacuum sealing"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-medium text-slate-200 md:col-span-2">
                  Lead time
                  <input
                    value={draft.leadTime}
                    onChange={handleDraftChange("leadTime")}
                    className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/60"
                    placeholder="Dispatch within 3 working days"
                  />
                </label>

                <div className="grid gap-3 md:col-span-2 md:grid-cols-2">
                  <label className="flex flex-col gap-2 text-sm font-medium text-slate-200">
                    Short description
                    <textarea
                      value={draft.shortDescription}
                      onChange={handleDraftChange("shortDescription")}
                      className="h-24 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/60"
                      placeholder="Compact summary used on catalogue cards"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-medium text-slate-200">
                    Full description
                    <textarea
                      value={draft.description}
                      onChange={handleDraftChange("description")}
                      className="h-24 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/60"
                      placeholder="Detailed IndiaMART product description"
                    />
                  </label>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400"
                >
                  Queue for Agent
                </button>
                <button
                  type="button"
                  onClick={autoGenerateDescriptions}
                  className="rounded-lg border border-indigo-500 px-4 py-2 text-sm font-semibold text-indigo-200 transition hover:bg-indigo-500/10"
                >
                  Auto-generate copy
                </button>
                <label className="text-xs text-slate-400">
                  Need a template? Download sample CSV from settings panel.
                </label>
              </div>
            </form>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 shadow-xl shadow-black/40">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">Automation Queue</h2>
                  <p className="text-xs text-slate-400">
                    {queue.length} product{queue.length === 1 ? "" : "s"} waiting · Mode:{" "}
                    <span className="font-semibold text-indigo-300">{settings.mode}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={runAgent}
                    disabled={processing || queue.length === 0}
                    className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700"
                  >
                    Start agent
                  </button>
                  <button
                    onClick={stopAgent}
                    disabled={!processing}
                    className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Pause
                  </button>
                </div>
              </div>

              <ul className="mt-6 space-y-3">
                {queue.map((item) => {
                  const waiting = item.id !== activeProductId;
                  return (
                    <li
                      key={item.id}
                      className={`rounded-xl border border-slate-800 px-4 py-3 text-sm transition ${
                        waiting ? "bg-slate-950/40" : "border-emerald-400/80 bg-emerald-400/10"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-slate-100">{item.payload.title || "Untitled"}</div>
                        <span className="text-[11px] uppercase tracking-wide text-slate-400">
                          {waiting ? "Waiting" : "Uploading"}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        ₹{item.payload.price || "N/A"} · {item.payload.category || "General"} · Added{" "}
                        {new Date(item.createdAt).toLocaleTimeString()}
                      </div>
                    </li>
                  );
                })}
                {queue.length === 0 && (
                  <li className="rounded-xl border border-dashed border-slate-800 px-4 py-6 text-center text-sm text-slate-500">
                    Queue empty. Add products manually or import via CSV.
                  </li>
                )}
              </ul>
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 shadow-xl shadow-black/40">
              <h2 className="text-lg font-semibold text-white">Agent Control Center</h2>
              <p className="mt-2 text-xs text-slate-400">
                Switch to live mode after validating in simulation. Provide IndiaMART supplier credentials to enable
                real syncing.
              </p>
              <div className="mt-4 space-y-4 text-sm">
                <label className="flex flex-col gap-2 font-medium text-slate-200">
                  IndiaMART API key / Auth token
                  <input
                    value={settings.apiKey}
                    onChange={(event) =>
                      setSettings((prev) => ({
                        ...prev,
                        apiKey: event.target.value,
                      }))
                    }
                    className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/60"
                    placeholder="Enter auth key"
                  />
                </label>

                <label className="flex flex-col gap-2 font-medium text-slate-200">
                  Seller ID / Profile ID
                  <input
                    value={settings.sellerId}
                    onChange={(event) =>
                      setSettings((prev) => ({
                        ...prev,
                        sellerId: event.target.value,
                      }))
                    }
                    className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/60"
                    placeholder="IM123456789"
                  />
                </label>

                <label className="flex flex-col gap-2 font-medium text-slate-200">
                  IndiaMART endpoint
                  <input
                    value={settings.baseUrl}
                    onChange={(event) =>
                      setSettings((prev) => ({
                        ...prev,
                        baseUrl: event.target.value,
                      }))
                    }
                    className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/60"
                    placeholder="https://sellerapi.indiamart.com/catalog/v1/product/add"
                  />
                </label>

                <div className="flex flex-col gap-2 font-medium text-slate-200">
                  <span>Mode</span>
                  <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setSettings((prev) => ({ ...prev, mode: "simulate" }))}
                      className={`rounded-lg border px-3 py-2 ${
                        settings.mode === "simulate"
                          ? "border-indigo-400 bg-indigo-500/20 text-indigo-200"
                          : "border-slate-700 text-slate-300 hover:border-indigo-300/60 hover:text-indigo-200"
                      }`}
                    >
                      Simulation
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettings((prev) => ({ ...prev, mode: "live" }))}
                      className={`rounded-lg border px-3 py-2 ${
                        settings.mode === "live"
                          ? "border-emerald-400 bg-emerald-500/20 text-emerald-200"
                          : "border-slate-700 text-slate-300 hover:border-emerald-300/60 hover:text-emerald-200"
                      }`}
                    >
                      Live upload
                    </button>
                  </div>
                </div>

                <label className="flex items-center gap-3 text-xs font-medium text-slate-300">
                  <input
                    type="checkbox"
                    checked={settings.autoStart}
                    onChange={(event) =>
                      setSettings((prev) => ({
                        ...prev,
                        autoStart: event.target.checked,
                      }))
                    }
                    className="h-4 w-4 rounded border border-slate-500 bg-slate-900 text-indigo-500 focus:ring-0"
                  />
                  Auto start agent when new products are queued
                </label>

                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-xs text-slate-300">
                  <p className="font-semibold text-slate-200">CSV bulk import</p>
                  <p className="mt-1 text-slate-400">
                    Upload using header:{" "}
                    <span className="font-mono text-[11px]">
                      title,category,price,currency,unit,stock,minorderqty,keywords,imageurls,shortdescription,description,features,packaging,leadtime
                    </span>
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      onChange={handleCsvUpload}
                      className="text-xs text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-500/20 file:px-3 file:py-1.5 file:text-indigo-200 file:transition file:hover:bg-indigo-500/40"
                    />
                    <a
                      href="/sample.csv"
                      download
                      className="text-xs font-semibold text-indigo-300 underline underline-offset-4 hover:text-indigo-200"
                    >
                      Download sample
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 shadow-xl shadow-black/40">
              <h2 className="text-lg font-semibold text-white">Activity Log</h2>
              <p className="mt-1 text-xs text-slate-400">Latest 50 events</p>
              <ul className="mt-4 space-y-3 text-sm">
                {filteredLogs.map((log) => (
                  <li
                    key={log.id}
                    className={`rounded-xl border px-4 py-3 ${
                      log.level === "success"
                        ? "border-emerald-500/70 bg-emerald-500/10 text-emerald-100"
                        : log.level === "error"
                          ? "border-rose-500/70 bg-rose-500/10 text-rose-100"
                          : "border-slate-800 bg-slate-950/60 text-slate-200"
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs uppercase tracking-wide">
                      <span>{log.level}</span>
                      <time className="text-slate-300">
                        {new Date(log.timestamp).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </time>
                    </div>
                    <div className="mt-2 text-sm font-semibold">{log.headline}</div>
                    {log.details && <p className="mt-1 text-xs text-slate-200">{log.details}</p>}
                  </li>
                ))}
                {filteredLogs.length === 0 && (
                  <li className="rounded-xl border border-dashed border-slate-800 px-4 py-6 text-center text-xs text-slate-500">
                    No activity yet. Queue a product to see the automation log.
                  </li>
                )}
              </ul>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}
