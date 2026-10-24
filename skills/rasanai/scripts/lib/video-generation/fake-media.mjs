// Deterministic stand-in "generation": a synthetic clip whose look depends on seed + prompt (so two plates differ in digest).
import { digest, ffmpeg } from "./util.mjs";
export function makeFakeClip(outFile, { seed, prompt, width, height, fps_num = 24, fps_den = 1, frames }) {
  const hue = parseInt(digest({ seed, prompt }).slice(0, 6), 16) % 360;
  const dur = (frames * fps_den / fps_num).toFixed(6);
  ffmpeg(["-f", "lavfi", "-i", `testsrc2=size=${width}x${height}:rate=${fps_num}/${fps_den}:duration=${dur}`, "-vf", `hue=h=${hue}`, "-frames:v", String(frames), "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast", "-crf", "30", outFile]);
}
