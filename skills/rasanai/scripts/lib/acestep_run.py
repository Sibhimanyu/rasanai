# Runs INSIDE ~/.cache/rasanai/acestep-venv (Python 3.12) only, as a subprocess of scripts/lib/sound-sources.mjs. Never run it with the system Python.
# Reads a job JSON (argv[1]); writes one wav per candidate into job.out_dir; prints one JSON line {ok, files:[{file, seed, seconds}], load_s, gen_s} on stdout.
# job: {caption, lyrics, instrumental, bpm, keyscale, timesignature, duration, count, seed, out_dir, name, lm, thinking, steps}
import json, os, sys, time, io, contextlib

job = json.load(open(sys.argv[1]))
home = os.path.expanduser("~/.cache/rasanai")
src, models = os.path.join(home, "acestep-src"), os.path.join(home, "acestep-models")
os.environ.setdefault("ACESTEP_LM_BACKEND", "mlx")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
os.environ["ACESTEP_CHECKPOINTS_DIR"] = models
os.environ["ACESTEP_PROJECT_ROOT"] = src
sys.path.insert(0, src)
real_stdout = sys.stdout
sys.stdout = sys.stderr  # the library prints progress; keep stdout for the one JSON line

from acestep.handler import AceStepHandler
from acestep.llm_inference import LLMHandler
from acestep.inference import GenerationParams, GenerationConfig, generate_music

t0 = time.time()
dit, lm = AceStepHandler(), LLMHandler()
st, ok = dit.initialize_service(project_root=src, config_path="acestep-v15-turbo", device="auto")
if not ok: raise SystemExit(f"dit init failed: {st}")
thinking = bool(job.get("thinking", True))
if thinking:
    st2, ok2 = lm.initialize(checkpoint_dir=models, lm_model_path=job.get("lm", "acestep-5Hz-lm-0.6B"), backend=os.environ["ACESTEP_LM_BACKEND"], device="auto")
    if not ok2: thinking = False
load_s = time.time() - t0

os.makedirs(job["out_dir"], exist_ok=True)
files, t1 = [], time.time()
for i in range(int(job.get("count", 1))):
    seed = int(job.get("seed", 1000)) + i * 7919
    p = GenerationParams(caption=job["caption"], lyrics=job.get("lyrics") or "", instrumental=bool(job.get("instrumental")),
                         bpm=job.get("bpm"), keyscale=job.get("keyscale") or "", timesignature=job.get("timesignature") or "",
                         duration=float(job["duration"]), inference_steps=int(job.get("steps", 8)), seed=seed, thinking=thinking,
                         use_cot_caption=False, use_cot_metas=False, use_cot_language=False,
                         vocal_language=job.get("language") or "en", fade_out_duration=float(job.get("fade_out", 0.0)))
    c = GenerationConfig(batch_size=1, audio_format="wav", use_random_seed=False, seeds=[seed])
    r = generate_music(dit, lm, p, c, save_dir=job["out_dir"])
    if not r.success: raise SystemExit(f"generate failed: {r.error}")
    src_f = r.audios[0]["path"]
    dst = os.path.join(job["out_dir"], f"{job.get('name', 'cand')}-{i + 1}.wav")
    os.replace(src_f, dst)
    files.append({"file": dst, "seed": seed})
real_stdout.write(json.dumps({"ok": True, "files": files, "load_s": round(load_s, 1), "gen_s": round(time.time() - t1, 1), "thinking": thinking}) + "\n")
