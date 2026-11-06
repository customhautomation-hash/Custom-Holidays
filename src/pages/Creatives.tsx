import { useState, useEffect, useRef, useCallback } from "react";
import { API_ROOT } from "../lib/api";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  MapPin,
  ImageIcon,
  Video,
  Loader2,
  Download,
  Trash2,
  Upload,
  X,
  ZoomIn,
  ChevronLeft,
  ChevronRight,
  FileText,
  Wand2,
  Copy,
  Check,
  Square,
  MonitorPlay,
  Smartphone,
  Clock,
} from "lucide-react";

import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Mode = "text-image" | "text-video" | "image-video" | "storyboard";
type Ratio = "9:16" | "16:9" | "1:1" | "4:3";
type Duration = 2 | 3 | 5 | 8;

interface Scene {
  scene: number;
  image_prompt: string;
  video_prompt: string;
  image_path: string | null;
  image_data: string | null;
  video_path: string | null;
  imageLoading: boolean;
  videoLoading: boolean;
  promptsLoading: boolean;
}

const API = `${API_ROOT}`;
const BASE = "";
const TIMEOUT_MS = 40 * 60 * 1000; // 40 minutes

// ---- Fetch with timeout ----
function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), TIMEOUT_MS);
  const callerSignal = options.signal as AbortSignal | undefined;
  if (callerSignal) {
    callerSignal.addEventListener("abort", () => timeoutController.abort());
  }
  return fetch(url, { ...options, signal: timeoutController.signal }).finally(() =>
    clearTimeout(timer)
  );
}

// ---- Backend interrupt helper ----
async function stopGeneration(workflow?: string, jobId?: string) {
  try {
    await fetchWithTimeout(`${API}/stop-generation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow, job_id: jobId }),
    });
  } catch (err) {
    console.error("Failed to stop generation:", err);
  }
}

// ---- Ratio toggle ----
const RATIO_OPTIONS: { value: Ratio; label: string; icon: "landscape" | "portrait" | "square" }[] = [
  { value: "16:9",  label: "16:9 Landscape", icon: "landscape" },
  { value: "9:16",  label: "9:16 Portrait",  icon: "portrait"  },
  { value: "1:1",   label: "1:1 Square",     icon: "square"    },
  { value: "4:3",   label: "4:3 Standard",   icon: "landscape" },
];

function RatioButtons({ value, onChange }: { value: Ratio; onChange: (v: Ratio) => void }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-muted-foreground ">Ratio</p>
      <div className="flex flex-wrap gap-2">
        {RATIO_OPTIONS.map((r) => (
          <button
            key={r.value}
            onClick={() => onChange(r.value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              value === r.value
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
            }`}
          >
            {r.icon === "portrait" ? (
              <Smartphone className="h-3.5 w-3.5" />
            ) : (
              <MonitorPlay className="h-3.5 w-3.5" />
            )}
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- Duration toggle ----
const DURATION_OPTIONS: Duration[] = [2, 3, 5, 8];

function DurationButtons({ value, onChange }: { value: Duration; onChange: (v: Duration) => void }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-muted-foreground ">Duration</p>
      <div className="flex gap-2">
        {DURATION_OPTIONS.map((d) => (
          <button
            key={d}
            onClick={() => onChange(d)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              value === d
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
            }`}
          >
            <Clock className="h-3 w-3" />
            {d}s
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- Skeletons ----
function Shimmer({ className = "" }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-xl bg-gray-100 ${className}`}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
    </div>
  );
}

function ImageSkeleton() {
  return (
    <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-gray-100">
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-400">
        <div className="h-12 w-12 rounded-full border-4 border-gray-200 border-t-violet-400 animate-spin" />
        <p className="text-sm font-medium">Generating image...</p>
      </div>
    </div>
  );
}

function VideoSkeleton() {
  return (
    <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-gray-100">
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-400">
        <div className="h-12 w-12 rounded-full border-4 border-gray-200 border-t-blue-400 animate-spin" />
        <p className="text-sm font-medium">Generating video...</p>
        <p className="text-xs text-gray-400">This can take several minutes</p>
      </div>
    </div>
  );
}

function PromptSkeleton() {
  return (
    <div className="space-y-2">
      <Shimmer className="h-4 w-3/4" />
      <Shimmer className="h-4 w-full" />
      <Shimmer className="h-4 w-5/6" />
      <Shimmer className="h-4 w-2/3" />
    </div>
  );
}

// ---- Mode: Text -> Image ----
function TextToImage() {
  const [prompt, setPrompt] = useState("");
  const [ratio, setRatio] = useState<Ratio>("16:9");
  const [loading, setLoading] = useState(false);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const isGenerating = useRef(false);

  const generate = async () => {
    if (!prompt.trim() || loading) return;
    isGenerating.current = true;
    setLoading(true);
    setImagePath(null);
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const res = await fetchWithTimeout(`${API}/generate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), ratio }),
        signal: controller.signal,
      });
      const data = await res.json();
      setImagePath(data.imagePath ?? null);
    } catch (err) {
      if ((err as Error).name !== "AbortError") console.error(err);
    } finally {
      isGenerating.current = false;
      setLoading(false);
      controllerRef.current = null;
    }
  };

  const stop = () => {
    controllerRef.current?.abort();
    setLoading(false);
    stopGeneration();
  };

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const download = async () => {
    if (!imagePath) return;
    const res = await fetchWithTimeout(imagePath.startsWith("http") ? imagePath : `${BASE}/${imagePath}`);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "text-image.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="grid lg:grid-cols-3 gap-6 items-start">
      <div className="lg:col-span-1">
        <div className="rounded-xl border bg-card p-4 space-y-4">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground ">Prompt</p>
            <Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && generate()}
              placeholder="Describe the image you want..."
            />
          </div>
          <RatioButtons value={ratio} onChange={setRatio} />
          <div className="flex gap-2 pt-1">
            <Button onClick={generate} disabled={loading || !prompt.trim()} className="flex-1">
              {loading ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <ImageIcon className="mr-2 h-4 w-4" />}
              {loading ? "Generating..." : "Generate Image"}
            </Button>
            {loading && (
              <Button variant="destructive" onClick={stop} title="Stop generating">
                <Square className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="lg:col-span-2 rounded-xl border bg-card flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="text-sm font-medium">Output</span>
          {imagePath && (
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={copyPrompt}>
                {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                Copy Prompt
              </Button>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={download}>
                <Download className="h-3 w-3" /> Download
              </Button>
            </div>
          )}
        </div>
        <div className="flex-1 p-5">
          {loading ? (
            <ImageSkeleton />
          ) : imagePath ? (
            <motion.img
              key={imagePath}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              src={imagePath.startsWith("http") ? imagePath : `${BASE}/${imagePath}`}
              className="w-full h-auto max-h-[70vh] object-contain rounded-xl border mx-auto"
            />
          ) : (
            <div className="w-full aspect-video rounded-xl border bg-muted/20 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <ImageIcon className="h-10 w-10 opacity-20" />
              <p className="text-sm">Your image will appear here</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Mode: Text -> Video ----
function TextToVideo() {
  const [prompt, setPrompt] = useState("");
  const [ratio, setRatio] = useState<Ratio>("9:16");
  const [duration, setDuration] = useState<Duration>(5);
  const [loading, setLoading] = useState(false);
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const generate = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setVideoPath(null);
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const res = await fetchWithTimeout(`${API}/generate-video-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), ratio, duration_seconds: duration }),
        signal: controller.signal,
      });
      const data = await res.json();
      setVideoPath(data.videoPath ?? null);
    } catch (err) {
      if ((err as Error).name !== "AbortError") console.error(err);
    } finally {
      setLoading(false);
      controllerRef.current = null;
    }
  };

  const stop = () => {
    controllerRef.current?.abort();
    setLoading(false);
    stopGeneration("ttv.json");
  };

  const download = async () => {
    if (!videoPath) return;
    const res = await fetchWithTimeout(videoPath);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "text-video.mp4";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="grid lg:grid-cols-3 gap-6 items-start">
      <div className="lg:col-span-1">
        <div className="rounded-xl border bg-card p-4 space-y-4">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground ">Prompt</p>
            <Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && generate()}
              placeholder="Describe the video scene you want..."
            />
          </div>
          <RatioButtons value={ratio} onChange={setRatio} />
          <DurationButtons value={duration} onChange={setDuration} />
          <div className="flex gap-2 pt-1">
            <Button onClick={generate} disabled={loading || !prompt.trim()} className="flex-1">
              {loading ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Video className="mr-2 h-4 w-4" />}
              {loading ? "Generating..." : "Generate Video"}
            </Button>
            {loading && (
              <Button variant="destructive" onClick={stop} title="Stop generating">
                <Square className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="lg:col-span-2 rounded-xl border bg-card flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="text-sm font-medium">Output</span>
          {videoPath && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={download}>
              <Download className="h-3 w-3" /> Download
            </Button>
          )}
        </div>
        <div className="flex-1 p-5">
          {loading ? (
            <VideoSkeleton />
          ) : videoPath ? (
            <motion.video
              key={videoPath}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              controls
              className="w-full h-auto max-h-[70vh] object-contain rounded-xl border mx-auto"
            >
              <source src={videoPath} type="video/mp4" />
            </motion.video>
          ) : (
            <div className="w-full aspect-video rounded-xl border bg-muted/20 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <Video className="h-10 w-10 opacity-20" />
              <p className="text-sm">Your video will appear here</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Mode: Image -> Video ----
function ImageToVideo() {
  const [imageData, setImageData] = useState<string | null>(null);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [videoPrompt, setVideoPrompt] = useState("");
  const [imagePromptAnalyzed, setImagePromptAnalyzed] = useState("");
  const [ratio, setRatio] = useState<Ratio>("9:16");
  const [duration, setDuration] = useState<Duration>(5);
  const [analyzing, setAnalyzing] = useState(false);
  const [loading, setLoading] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const isGenerating = useRef(false);

  const imgSrc = imageData ?? (imagePath ? (imagePath.startsWith("http") ? imagePath : `${BASE}/${imagePath}`) : null);

  const uploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    setImageData(base64);
    setImagePath(null);
    setVideoPath(null);
    setImagePromptAnalyzed("");
    setAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetchWithTimeout(`${API}/analyze-image`, { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        setImagePromptAnalyzed(data.image_prompt || "");
        setVideoPrompt(data.video_prompt || "");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAnalyzing(false);
    }
  };

  const generate = async () => {
    if (!imgSrc || !videoPrompt.trim() || loading || isGenerating.current) return;

    isGenerating.current = true;
    setLoading(true);
    setVideoPath(null);
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      let serverImagePath = imagePath;
      if (!serverImagePath && imageData) {
        const blob = await fetch(imageData).then((r) => r.blob());
        const formData = new FormData();
        formData.append("file", blob, "upload.jpg");
        const uploadRes = await fetchWithTimeout(`${API}/analyze-image`, { method: "POST", body: formData });
        const uploadData = await uploadRes.json();
        serverImagePath = uploadData.imagePath ?? null;
      }
      const res = await fetchWithTimeout(`${API}/generate-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_path: serverImagePath,
          image_prompt: imagePromptAnalyzed,
          video_prompt: videoPrompt.trim(),
          ratio,
          duration_seconds: duration,
        }),
        signal: controller.signal,
      });
      const data = await res.json();
      setVideoPath(data.videoPath ?? null);
    } catch (err) {
      if ((err as Error).name !== "AbortError") console.error(err);
    } finally {
      isGenerating.current = false;
      setLoading(false);
      controllerRef.current = null;
    }
  };

  const stop = () => {
    controllerRef.current?.abort();
    setLoading(false);
    stopGeneration("ltx23.json");
  };

  const download = async () => {
    if (!videoPath) return;
    const res = await fetchWithTimeout(videoPath);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "image-video.mp4";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="grid lg:grid-cols-3 gap-6 items-start">
      <div className="space-y-4">
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground ">Source Image</p>
          {analyzing ? (
            <div className="relative h-48 rounded-lg overflow-hidden bg-gray-100">
              <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
              {imgSrc && <img src={imgSrc} className="w-full h-full object-cover opacity-40" />}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-500">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="text-xs">Analyzing image...</span>
              </div>
            </div>
          ) : imgSrc ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative rounded-lg overflow-hidden border">
              <img src={imgSrc} className="w-full h-48 object-cover" />
              <button
                className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1"
                onClick={() => { setImageData(null); setImagePath(null); setVideoPath(null); setImagePromptAnalyzed(""); setVideoPrompt(""); }}
              >
                <X className="h-3 w-3" />
              </button>
            </motion.div>
          ) : (
            <div className="h-48 rounded-lg border border-dashed bg-muted/30 flex flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
              <Upload className="h-6 w-6 opacity-40" />
              <span>Upload an image</span>
            </div>
          )}
          <label>
            <Button variant="secondary" asChild className="w-full">
              <span><Upload className="mr-2 h-4 w-4" /> {imgSrc ? "Replace Image" : "Upload Image"}</span>
            </Button>
            <input hidden type="file" accept="image/*" onChange={uploadImage} />
          </label>
        </div>

        <div className="rounded-xl border bg-card p-4 space-y-4">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground ">Motion Prompt</p>
            {analyzing ? (
              <PromptSkeleton />
            ) : (
              <Input
                value={videoPrompt}
                onChange={(e) => setVideoPrompt(e.target.value)}
                placeholder="Describe the motion / animation..."
              />
            )}
          </div>
          <RatioButtons value={ratio} onChange={setRatio} />
          <DurationButtons value={duration} onChange={setDuration} />
          <div className="flex gap-2 pt-1">
            <Button onClick={generate} disabled={loading || !imgSrc || !videoPrompt.trim() || analyzing} className="flex-1">
              {loading ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Wand2 className="mr-2 h-4 w-4" />}
              {loading ? "Generating..." : "Generate Video"}
            </Button>
            {loading && (
              <Button variant="destructive" onClick={stop} title="Stop generating">
                <Square className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="lg:col-span-2 rounded-xl border bg-card flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="text-sm font-medium">Output</span>
          {videoPath && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={download}>
              <Download className="h-3 w-3" /> Download
            </Button>
          )}
        </div>
        <div className="flex-1 p-5">
          {loading ? (
            <VideoSkeleton />
          ) : videoPath ? (
            <motion.video
              key={videoPath}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              controls
              className="w-full h-auto max-h-[70vh] object-contain rounded-xl border mx-auto"
            >
              <source src={videoPath} type="video/mp4" />
            </motion.video>
          ) : (
            <div className="w-full aspect-video rounded-xl border bg-muted/20 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <Video className="h-10 w-10 opacity-20" />
              <p className="text-sm">Your video will appear here</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Mode: Full Storyboard ----
function Storyboard() {
  const [destination, setDestination] = useState("");
  const [ratio, setRatio] = useState<Ratio>("9:16");
  const [duration, setDuration] = useState<Duration>(5);
  const [loading, setLoading] = useState(false);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 10 });
  const [fullscreen, setFullscreen] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seenScenes = useRef<Set<number>>(new Set());
  const jobIdRef = useRef<string | null>(null);
  const storyboardControllerRef = useRef<AbortController | null>(null);
  const sceneImageControllers = useRef<Record<number, AbortController>>({});
  const sceneVideoControllers = useRef<Record<number, AbortController>>({});

  useEffect(() => {
    if (fullscreen === null) return;
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(null);
      if (e.key === "ArrowRight") setFullscreen((i) => (i !== null && i < scenes.length - 1 ? i + 1 : i));
      if (e.key === "ArrowLeft") setFullscreen((i) => (i !== null && i > 0 ? i - 1 : i));
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [fullscreen, scenes.length]);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const startPolling = (jobId: string) => {
    stopPolling();
    seenScenes.current = new Set();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetchWithTimeout(`${API}/storyboard-status/${jobId}`);
        const data = await res.json();
        if (!data.success) { stopPolling(); setLoading(false); return; }
        setProgress({ done: data.scenes.length, total: data.total });
        const newScenes: Scene[] = [];
        for (const scene of data.scenes) {
          if (!seenScenes.current.has(scene.scene)) {
            seenScenes.current.add(scene.scene);
            newScenes.push({
              scene: scene.scene,
              image_prompt: scene.image_prompt,
              video_prompt: scene.video_prompt,
              image_path: scene.image_path,
              image_data: null,
              video_path: null,
              imageLoading: false,
              videoLoading: false,
              promptsLoading: false,
            });
          }
        }
        if (newScenes.length > 0) {
          setScenes((prev) => [...prev, ...newScenes].sort((a, b) => a.scene - b.scene));
        }
        if (data.status === "done" || data.status === "error") { stopPolling(); setLoading(false); }
      } catch (err) { console.error("Poll error:", err); }
    }, 3000);
  };

  useEffect(() => () => stopPolling(), []);

  const generate = async () => {
    if (!destination.trim() || loading) return;
    setLoading(true);
    setScenes([]);
    setProgress({ done: 0, total: 10 });
    stopPolling();
    const controller = new AbortController();
    storyboardControllerRef.current = controller;
    try {
      const res = await fetchWithTimeout(`${API}/generate-full-storyboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination, ratio, duration_seconds: duration }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!data.success || !data.job_id) { setLoading(false); return; }
      jobIdRef.current = data.job_id;
      startPolling(data.job_id);
    } catch (err) {
      if ((err as Error).name !== "AbortError") console.error(err);
      setLoading(false);
    }
  };

  const stopStoryboard = () => {
    storyboardControllerRef.current?.abort();
    stopPolling();
    setLoading(false);
    stopGeneration(undefined, jobIdRef.current ?? undefined);
  };

  const getImageSrc = useCallback((scene: Scene) =>
    scene.image_data ?? (scene.image_path ? (scene.image_path.startsWith("http") ? scene.image_path : `${BASE}/${scene.image_path}`) : null), []);

  const regenerateImage = async (index: number) => {
    setScenes((prev) => { const c = [...prev]; c[index] = { ...c[index], imageLoading: true, video_path: null, image_data: null }; return c; });
    const controller = new AbortController();
    sceneImageControllers.current[index] = controller;
    try {
      const res = await fetchWithTimeout(`${API}/generate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: scenes[index].image_prompt, ratio }),
        signal: controller.signal,
      });
      const data = await res.json();
      setScenes((prev) => { const c = [...prev]; c[index] = { ...c[index], image_path: data.imagePath ?? null, image_data: null, imageLoading: false }; return c; });
    } catch (err) {
      if ((err as Error).name !== "AbortError") console.error(err);
      setScenes((prev) => { const c = [...prev]; c[index] = { ...c[index], imageLoading: false }; return c; });
    } finally {
      delete sceneImageControllers.current[index];
    }
  };

  const stopSceneImage = (index: number) => {
    sceneImageControllers.current[index]?.abort();
    delete sceneImageControllers.current[index];
    setScenes((prev) => { const c = [...prev]; c[index] = { ...c[index], imageLoading: false }; return c; });
    stopGeneration();
  };

  const uploadImage = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    setScenes((prev) => { const c = [...prev]; c[index] = { ...c[index], image_path: null, image_data: base64, video_path: null, promptsLoading: true }; return c; });
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetchWithTimeout(`${API}/analyze-image`, { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        setScenes((prev) => { const c = [...prev]; c[index] = { ...c[index], image_prompt: data.image_prompt || c[index].image_prompt, video_prompt: data.video_prompt || c[index].video_prompt, promptsLoading: false }; return c; });
      } else {
        setScenes((prev) => { const c = [...prev]; c[index] = { ...c[index], promptsLoading: false }; return c; });
      }
    } catch {
      setScenes((prev) => { const c = [...prev]; c[index] = { ...c[index], promptsLoading: false }; return c; });
    }
  };

  const deleteImage = (index: number) =>
    setScenes((prev) => { const c = [...prev]; c[index] = { ...c[index], image_path: null, image_data: null, video_path: null }; return c; });

  const generateVideo = async (index: number) => {
    setScenes((prev) => { const c = [...prev]; c[index] = { ...c[index], videoLoading: true }; return c; });
    const controller = new AbortController();
    sceneVideoControllers.current[index] = controller;
    try {
      const scene = scenes[index];
      const res = await fetchWithTimeout(`${API}/generate-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_path: scene.image_path,
          image_prompt: scene.image_prompt,
          video_prompt: scene.video_prompt,
          ratio,
          duration_seconds: duration,
        }),
        signal: controller.signal,
      });
      const data = await res.json();
      setScenes((prev) => { const c = [...prev]; c[index] = { ...c[index], video_path: data.videoPath ?? null, videoLoading: false }; return c; });
    } catch (err) {
      if ((err as Error).name !== "AbortError") console.error(err);
      setScenes((prev) => { const c = [...prev]; c[index] = { ...c[index], videoLoading: false }; return c; });
    } finally {
      delete sceneVideoControllers.current[index];
    }
  };

  const stopSceneVideo = (index: number) => {
    sceneVideoControllers.current[index]?.abort();
    delete sceneVideoControllers.current[index];
    setScenes((prev) => { const c = [...prev]; c[index] = { ...c[index], videoLoading: false }; return c; });
    stopGeneration("ltx23.json");
  };

  const downloadFile = async (url: string, filename: string) => {
    const res = await fetchWithTimeout(url);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const fsScene = fullscreen !== null ? scenes[fullscreen] : null;
  const fsSrc = fsScene ? getImageSrc(fsScene) : null;

  return (
    <>
      <AnimatePresence>
        {fullscreen !== null && fsSrc && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
            onClick={() => setFullscreen(null)}
          >
            <button className="absolute top-4 right-4 text-white bg-white/10 hover:bg-white/20 rounded-full p-2 z-10" onClick={() => setFullscreen(null)}>
              <X className="h-6 w-6" />
            </button>
            <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/60 text-sm font-medium">
              Scene {fsScene?.scene} · {(fullscreen ?? 0) + 1} / {scenes.length}
            </div>
            {fullscreen > 0 && (
              <button className="absolute left-4 text-white bg-white/10 hover:bg-white/20 rounded-full p-3 z-10" onClick={(e) => { e.stopPropagation(); setFullscreen(fullscreen - 1); }}>
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}
            {fullscreen < scenes.length - 1 && (
              <button className="absolute right-4 text-white bg-white/10 hover:bg-white/20 rounded-full p-3 z-10" onClick={(e) => { e.stopPropagation(); setFullscreen(fullscreen + 1); }}>
                <ChevronRight className="h-6 w-6" />
              </button>
            )}
            <motion.img key={fullscreen} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} src={fsSrc} className="max-h-[90vh] max-w-[90vw] object-contain rounded-xl shadow-2xl" onClick={(e) => e.stopPropagation()} />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-8 py-6">
              <p className="text-white/80 text-sm text-center max-w-3xl mx-auto line-clamp-2 leading-relaxed">{fsScene?.image_prompt}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input + controls */}
      <div className="rounded-xl border bg-card p-4 space-y-4">
        <div className="flex gap-3">
          <Input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && generate()}
            placeholder="Enter destination (e.g. Tokyo, Paris, Bali, Rajasthan)..."
          />
          <Button onClick={generate} disabled={loading || !destination.trim()}>
            {loading ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <MapPin className="mr-2 h-4 w-4" />}
            {loading ? "Generating..." : "Generate Storyboard"}
          </Button>
          {loading && (
            <Button variant="destructive" onClick={stopStoryboard} title="Stop generating">
              <Square className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-6">
          <RatioButtons value={ratio} onChange={setRatio} />
          <DurationButtons value={duration} onChange={setDuration} />
        </div>
      </div>

      {/* Progress */}
      {loading && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-blue-700 font-medium">
              <Loader2 className="animate-spin h-4 w-4" />
              Generating scenes... {progress.done} / {progress.total} complete
            </span>
            <span className="text-blue-500">{Math.round((progress.done / progress.total) * 100)}%</span>
          </div>
          <div className="w-full bg-blue-100 rounded-full h-2">
            <motion.div
              className="bg-blue-500 h-2 rounded-full"
              animate={{ width: `${(progress.done / progress.total) * 100}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </div>
          <p className="text-xs text-blue-400">Each image takes 30-90 seconds. Scenes appear as they're ready.</p>
        </div>
      )}

      {/* Scenes */}
      <div className="space-y-4">
        {scenes.map((scene, i) => {
          const imgSrc = getImageSrc(scene);
          return (
            <motion.div
              key={scene.scene}
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
              className="border rounded-2xl shadow-md p-6 bg-white"
            >
              <h2 className="text-2xl font-semibold mb-5">Scene {scene.scene}</h2>
              <div className="grid lg:grid-cols-2 gap-8">
                {/* Image */}
                <div>
                  {scene.imageLoading ? <ImageSkeleton /> : imgSrc ? (
                    <div className="relative group cursor-pointer" onClick={() => setFullscreen(i)}>
                      <motion.img initial={{ opacity: 0 }} animate={{ opacity: 1 }} src={imgSrc} className="w-full h-auto max-h-[70vh] object-contain rounded-xl border mx-auto" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all rounded-xl flex items-center justify-center">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/20 backdrop-blur-sm rounded-full p-4">
                          <ZoomIn className="h-8 w-8 text-white" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full aspect-video rounded-xl border bg-gray-50 flex items-center justify-center">
                      <ImageIcon size={60} className="text-gray-300" />
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 mt-4">
                    <Button variant="outline" disabled={!imgSrc} onClick={() => downloadFile(imgSrc!, `scene-${scene.scene}.png`)}>
                      <Download className="h-4 w-4 mr-2" /> Download
                    </Button>
                    <Button variant="destructive" disabled={!imgSrc} onClick={() => deleteImage(i)}>
                      <Trash2 className="h-4 w-4 mr-2" /> Delete
                    </Button>
                    <Button variant="secondary" disabled={scene.imageLoading} onClick={() => regenerateImage(i)}>
                      Regenerate
                    </Button>
                    {scene.imageLoading && (
                      <Button variant="destructive" onClick={() => stopSceneImage(i)}>
                        <Square className="h-4 w-4 mr-2" /> Stop
                      </Button>
                    )}
                    {imgSrc && (
                      <Button variant="outline" onClick={() => setFullscreen(i)}>
                        <ZoomIn className="h-4 w-4 mr-2" /> Fullscreen
                      </Button>
                    )}
                    <label>
                      <Button variant="secondary" asChild>
                        <span><Upload className="mr-2 h-4 w-4" /> Upload</span>
                      </Button>
                      <input hidden type="file" accept="image/*" onChange={(e) => uploadImage(i, e)} />
                    </label>
                  </div>
                </div>

                {/* Video */}
                <div>
                  {scene.videoLoading ? <VideoSkeleton /> : scene.video_path ? (
                    <video controls className="w-full h-auto max-h-[70vh] object-contain rounded-xl border mx-auto">
                      <source src={scene.video_path} type="video/mp4" />
                    </video>
                  ) : (
                    <div className="w-full aspect-video rounded-xl border bg-gray-50 flex items-center justify-center">
                      <Video size={60} className="text-gray-300" />
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 mt-4">
                    <Button disabled={!imgSrc || scene.videoLoading} onClick={() => generateVideo(i)}>
                      <Video className="mr-2 h-4 w-4" /> Generate Video
                    </Button>
                    <Button variant="secondary" disabled={!imgSrc || scene.videoLoading} onClick={() => generateVideo(i)}>
                      Regenerate Video
                    </Button>
                    {scene.videoLoading && (
                      <Button variant="destructive" onClick={() => stopSceneVideo(i)}>
                        <Square className="h-4 w-4 mr-2" /> Stop
                      </Button>
                    )}
                    <Button variant="outline" disabled={!scene.video_path} onClick={() => downloadFile(scene.video_path!, `scene-${scene.scene}.mp4`)}>
                      <Download className="mr-2 h-4 w-4" /> Download Video
                    </Button>
                  </div>
                </div>
              </div>

              {/* Prompts */}
              <div className="mt-8 grid md:grid-cols-2 gap-6">
                <div className="bg-gray-50 rounded-xl p-4 border">
                  <h3 className="font-semibold text-lg mb-3">Image Prompt</h3>
                  {scene.promptsLoading ? <PromptSkeleton /> : <p className="text-sm whitespace-pre-wrap leading-7 text-gray-700">{scene.image_prompt}</p>}
                </div>
                <div className="bg-gray-50 rounded-xl p-4 border">
                  <h3 className="font-semibold text-lg mb-3">Video Prompt</h3>
                  {scene.promptsLoading ? <PromptSkeleton /> : <p className="text-sm whitespace-pre-wrap leading-7 text-gray-700">{scene.video_prompt}</p>}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </>
  );
}

// ---- Root page ----
export default function Creatives() {
  const [mode, setMode] = useState<Mode>("text-image");

  return (
    <DashboardLayout>
      <style>{`
        @keyframes shimmer { 100% { transform: translateX(200%); } }
      `}</style>

      <div className="max-w-7xl mx-auto p-6 space-y-8">
        <div>
          <h1 className="text-4xl font-semibold flex items-center gap-2">
            <Sparkles className="text-yellow-500" />
            AI Travel Studio
          </h1>
          <p className="text-muted-foreground mt-2">Create images, videos, and full storyboard workflows.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {(["text-image", "text-video", "image-video", "storyboard"] as Mode[]).map((m) => (
            <Button key={m} variant={mode === m ? "default" : "outline"} onClick={() => setMode(m)}>
              {m === "text-image"  && <><ImageIcon className="mr-2 h-4 w-4" /> Text to Image</>}
              {m === "text-video"  && <><Video     className="mr-2 h-4 w-4" /> Text to Video</>}
              {m === "image-video" && <><Wand2     className="mr-2 h-4 w-4" /> Image to Video</>}
              {m === "storyboard"  && <><FileText  className="mr-2 h-4 w-4" /> Full Storyboard</>}
            </Button>
          ))}
        </div>

        {/* All four modes stay mounted — display:none preserves state across tab switches */}
        <div className="space-y-6">
          <div style={{ display: mode === "text-image"  ? "block" : "none" }}><TextToImage /></div>
          <div style={{ display: mode === "text-video"  ? "block" : "none" }}><TextToVideo /></div>
          <div style={{ display: mode === "image-video" ? "block" : "none" }}><ImageToVideo /></div>
          <div style={{ display: mode === "storyboard"  ? "block" : "none" }}><Storyboard /></div>
        </div>
      </div>
    </DashboardLayout>
  );
}