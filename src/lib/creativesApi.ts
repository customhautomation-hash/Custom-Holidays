/** Calls used by the Creatives page and the Reel maker. */
import { API_ROOT } from "@/lib/api";

export async function post(path: string, body: any) {
  const r = await fetch(`${API_ROOT}${path}`, { method: "POST", headers: body instanceof FormData ? {} : { "Content-Type": "application/json" }, body: body instanceof FormData ? body : JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.detail || d.error || `Something went wrong (${r.status})`);
  return d;
}
export const stopOnServer = (job_id?: string, workflow?: string) => post("/stop-generation", { job_id, workflow }).catch(() => {});
export const srcOf = (p: string | null) => (!p ? "" : p.startsWith("http") || p.startsWith("data:") || p.startsWith("blob:") ? p : `${API_ROOT.replace(/\/api$/, "")}/${p}`);

export async function downloadUrl(url: string, name: string) {
  try {
    const blob = await (await fetch(url)).blob();
    downloadBlob(blob, name);
  } catch { window.open(url, "_blank"); }
}
export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** Starts a video job and waits for it (the server answers with a job number straight away). */
export async function runVideo(path: string, body: any, onJob: (id: string) => void, cancelled: () => boolean): Promise<string> {
  const { job_id, error } = await post(path, body);
  if (!job_id) throw new Error(error || "The video couldn't be started");
  onJob(job_id);
  for (;;) {
    await new Promise(r => setTimeout(r, 4000));
    if (cancelled()) throw new Error("stopped");
    const s = await fetch(`${API_ROOT}/video-status/${job_id}`).then(r => r.json()).catch(() => null);
    if (!s) continue;
    if (!s.success) throw new Error("The server restarted while making the video. Please try again");
    if (s.status === "done" && s.videoPath) return s.videoPath;
    if (s.status === "error") throw new Error(s.error || "The video couldn't be made");
    if (s.status === "stopped") throw new Error("stopped");
  }
}

/** Makes one picture in the cloud. */
export async function makePicture(prompt: string, ratio = "9:16"): Promise<string> {
  const d = await post("/generate-image", { prompt, ratio });
  if (!d.success || !d.imagePath) throw new Error("The picture couldn't be made");
  return d.imagePath;
}
