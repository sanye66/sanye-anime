#!/usr/bin/env python3
"""Run a reproducible, file-based RIFE/ncnn feasibility experiment.

This is intentionally an experiment harness, not a realtime inference benchmark.
Every measured candidate invocation includes process startup, input file access,
model loading/inference, and output file writing performed by the candidate CLI.
"""

from __future__ import annotations

import argparse
import ctypes
from ctypes import wintypes
import hashlib
import json
import math
import os
import platform
import subprocess
import sys
import threading
import time
import traceback
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable

try:
    import cv2  # type: ignore
    import numpy as np  # type: ignore
except ImportError as exc:  # pragma: no cover - exercised by the real runtime
    raise SystemExit(
        "OpenCV and NumPy are required. Add sanye_deploy/.local/player-quality/"
        "p2-python to PYTHONPATH when using the bundled Codex Python runtime."
    ) from exc


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "sanye_deploy/.local/player-quality/p3" / f"feasibility-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
DEFAULT_TIMESTEPS = (0.2, 0.4, 0.5, 0.6, 0.8)
SCENARIOS = ("pan", "rotation", "deformation", "occlusion", "thin-line", "cut")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def hash_tree(path: Path) -> dict[str, Any]:
    if path.is_file():
        return {"path": str(path.resolve()), "sha256": sha256_file(path), "bytes": path.stat().st_size}
    entries = []
    aggregate = hashlib.sha256()
    for item in sorted(candidate for candidate in path.rglob("*") if candidate.is_file()):
        relative = item.relative_to(path).as_posix()
        digest = sha256_file(item)
        size = item.stat().st_size
        entries.append({"path": relative, "sha256": digest, "bytes": size})
        aggregate.update(relative.encode("utf-8") + b"\0" + digest.encode("ascii") + b"\n")
    return {
        "path": str(path.resolve()),
        "treeSha256": aggregate.hexdigest(),
        "fileCount": len(entries),
        "bytes": sum(entry["bytes"] for entry in entries),
        "files": entries,
    }


def percentile(values: list[float], quantile: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * quantile
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def timing_summary(values: Iterable[float]) -> dict[str, Any]:
    samples = list(values)
    return {
        "samples": len(samples),
        "valuesMs": samples,
        "p50Ms": percentile(samples, 0.50),
        "p95Ms": percentile(samples, 0.95),
        "minimumMs": min(samples) if samples else None,
        "maximumMs": max(samples) if samples else None,
    }


def value_summary(values: Iterable[float]) -> dict[str, Any]:
    samples = list(values)
    return {
        "samples": len(samples),
        "values": samples,
        "p50": percentile(samples, 0.50),
        "p95": percentile(samples, 0.95),
        "minimum": min(samples) if samples else None,
        "maximum": max(samples) if samples else None,
    }


def maximum_known(values: Iterable[int | None]) -> int | None:
    known = [value for value in values if value is not None]
    return max(known) if known else None


def texture(x: "np.ndarray", y: "np.ndarray", width: int, height: int) -> "np.ndarray":
    red = 122 + 40 * np.sin(x * 0.19 + y * 0.13) + 38 * np.sin(x * 0.37 - y * 0.31)
    green = 118 + 36 * np.sin(x * 0.11 - y * 0.27) + 31 * np.cos(x * 0.43 + y * 0.17)
    blue = 126 + 33 * np.cos(x * 0.29 + y * 0.23) + 24 * np.sin(x * 0.67 - y * 0.39)
    image = np.stack((blue, green, red), axis=-1)
    outside = (x < 0) | (y < 0) | (x >= width) | (y >= height)
    image[outside] = (35, 35, 35)
    return np.rint(np.clip(image, 0, 255)).astype(np.uint8)


def analytic_frame(name: str, t: float, width: int, height: int) -> "np.ndarray":
    yy, xx = np.mgrid[:height, :width].astype(np.float32)
    if name == "pan":
        return texture(xx - 8 * t, yy - 4 * t, width, height)
    if name == "rotation":
        angle = -math.radians(11) * t
        dx, dy = xx - width / 2, yy - height / 2
        source_x = width / 2 + dx * math.cos(angle) - dy * math.sin(angle)
        source_y = height / 2 + dx * math.sin(angle) + dy * math.cos(angle)
        return texture(source_x, source_y, width, height)
    if name == "deformation":
        return texture(xx - 11 * t * np.sin(yy * 0.045), yy, width, height)
    if name == "occlusion":
        image = texture(xx - 8 * t, yy, width, height)
        left = round(width * 0.40 + 8 * t)
        right = left + max(12, round(width * 0.14))
        top, bottom = round(height * 0.23), round(height * 0.76)
        image[top:bottom, left:right] = (72, 220, 236)
        return image
    if name == "thin-line":
        image = texture(xx - 8 * t, yy, width, height)
        line_x = min(width - 1, round(width * 0.35 + 8 * t))
        image[round(height * 0.13):round(height * 0.86), line_x] = (235, 235, 235)
        return image
    if name == "cut":
        if t < 0.5:
            return texture(xx, yy, width, height)
        image = texture(width - 1 - xx, height - 1 - yy, width, height)
        image[:, :, 0] = np.clip(image[:, :, 0].astype(np.int16) + 45, 0, 255)
        image[:, :, 2] = np.clip(image[:, :, 2].astype(np.int16) - 45, 0, 255)
        return image.astype(np.uint8)
    raise ValueError(f"Unknown scenario: {name}")


def write_png(path: Path, image: "np.ndarray") -> dict[str, Any]:
    path.parent.mkdir(parents=True, exist_ok=True)
    started = time.perf_counter()
    success = cv2.imwrite(str(path), image, [cv2.IMWRITE_PNG_COMPRESSION, 3])
    elapsed_ms = (time.perf_counter() - started) * 1000
    if not success:
        raise RuntimeError(f"Could not write PNG: {path}")
    return {"path": str(path.resolve()), "bytes": path.stat().st_size, "sha256": sha256_file(path), "writeMs": elapsed_ms}


def read_png(path: Path) -> tuple["np.ndarray", dict[str, Any]]:
    started = time.perf_counter()
    image = cv2.imread(str(path), cv2.IMREAD_COLOR)
    elapsed_ms = (time.perf_counter() - started) * 1000
    if image is None:
        raise RuntimeError(f"Candidate did not produce a readable PNG: {path}")
    return image, {"path": str(path.resolve()), "bytes": path.stat().st_size, "sha256": sha256_file(path), "readMs": elapsed_ms}


def image_metrics(actual: "np.ndarray", expected: "np.ndarray") -> dict[str, Any]:
    if actual.shape != expected.shape:
        raise ValueError(f"Output shape {actual.shape} does not match truth {expected.shape}")
    a = actual.astype(np.float64)
    b = expected.astype(np.float64)
    difference = a - b
    mae = float(np.mean(np.abs(difference)))
    mse = float(np.mean(difference * difference))
    psnr = None if mse == 0 else float(20 * math.log10(255.0 / math.sqrt(mse)))
    # Global channel-averaged SSIM is dependency-free and deterministic. The
    # report names this variant so it is not confused with windowed skimage SSIM.
    c1, c2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    scores = []
    for channel in range(a.shape[2]):
        left, right = a[:, :, channel], b[:, :, channel]
        mean_left, mean_right = left.mean(), right.mean()
        var_left, var_right = left.var(), right.var()
        covariance = ((left - mean_left) * (right - mean_right)).mean()
        scores.append(((2 * mean_left * mean_right + c1) * (2 * covariance + c2)) /
                      ((mean_left ** 2 + mean_right ** 2 + c1) * (var_left + var_right + c2)))
    return {"mae": mae, "psnrDb": psnr, "ssim": float(np.mean(scores)), "ssimVariant": "global-channel-mean"}


class ProcessMemoryMonitor:
    """Best-effort Windows peak working-set sampler for the direct CLI process."""

    def __init__(self, process: subprocess.Popen[str]) -> None:
        self.process = process
        self.peak_bytes: int | None = None
        self.error: str | None = None
        self.stop_event = threading.Event()
        self.thread: threading.Thread | None = None

    def start(self) -> None:
        if os.name != "nt":
            self.error = "Peak working-set sampling is implemented only for Windows."
            return
        self.thread = threading.Thread(target=self._run, name="p3-working-set", daemon=True)
        self.thread.start()

    def stop(self) -> None:
        self.stop_event.set()
        if self.thread:
            self.thread.join(timeout=1)

    def _run(self) -> None:
        class Counters(ctypes.Structure):
            _fields_ = [
                ("cb", ctypes.c_ulong), ("PageFaultCount", ctypes.c_ulong),
                ("PeakWorkingSetSize", ctypes.c_size_t), ("WorkingSetSize", ctypes.c_size_t),
                ("QuotaPeakPagedPoolUsage", ctypes.c_size_t), ("QuotaPagedPoolUsage", ctypes.c_size_t),
                ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t), ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                ("PagefileUsage", ctypes.c_size_t), ("PeakPagefileUsage", ctypes.c_size_t),
                ("PrivateUsage", ctypes.c_size_t),
            ]
        try:
            psapi = ctypes.WinDLL("psapi")
            psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(Counters), wintypes.DWORD]
            psapi.GetProcessMemoryInfo.restype = wintypes.BOOL
            while not self.stop_event.is_set() and self.process.poll() is None:
                counters = Counters()
                counters.cb = ctypes.sizeof(counters)
                handle = wintypes.HANDLE(int(self.process._handle))  # type: ignore[attr-defined]
                if psapi.GetProcessMemoryInfo(handle, ctypes.byref(counters), counters.cb):
                    self.peak_bytes = max(self.peak_bytes or 0, int(counters.PeakWorkingSetSize))
                time.sleep(0.01)
        except Exception as exc:  # best effort evidence must not fail inference
            self.error = f"{type(exc).__name__}: {exc}"


@dataclass
class CommandResult:
    command: list[str]
    elapsed_ms: float
    exit_code: int | None
    stdout: str
    stderr: str
    timed_out: bool
    peak_working_set_bytes: int | None
    memory_note: str | None

    def as_dict(self) -> dict[str, Any]:
        return {
            "command": self.command,
            "elapsedMs": self.elapsed_ms,
            "exitCode": self.exit_code,
            "stdout": self.stdout,
            "stderr": self.stderr,
            "timedOut": self.timed_out,
            "peakWorkingSetBytes": self.peak_working_set_bytes,
            "memoryNote": self.memory_note,
        }


def run_command(command: list[str], timeout_seconds: float) -> CommandResult:
    started = time.perf_counter()
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, errors="replace")
    monitor = ProcessMemoryMonitor(process)
    monitor.start()
    timed_out = False
    try:
        stdout, stderr = process.communicate(timeout=timeout_seconds)
    except subprocess.TimeoutExpired:
        timed_out = True
        process.kill()
        stdout, stderr = process.communicate()
    finally:
        monitor.stop()
    return CommandResult(
        command=command,
        elapsed_ms=(time.perf_counter() - started) * 1000,
        exit_code=process.returncode,
        stdout=stdout[-12000:],
        stderr=stderr[-12000:],
        timed_out=timed_out,
        peak_working_set_bytes=monitor.peak_bytes,
        memory_note=monitor.error,
    )


def candidate_base_command(args: argparse.Namespace) -> list[str]:
    command = [str(args.executable.resolve())]
    if args.model:
        command.extend(["-m", str(args.model.resolve())])
    if args.gpu is not None:
        command.extend(["-g", str(args.gpu)])
    command.extend(args.extra_arg)
    return command


def pair_command(args: argparse.Namespace, before: Path, after: Path, output: Path, timestep: float) -> list[str]:
    return candidate_base_command(args) + [
        "-0", str(before.resolve()), "-1", str(after.resolve()),
        "-o", str(output.resolve()), "-s", f"{timestep:.6g}",
    ]


def continuous_command(args: argparse.Namespace, input_dir: Path, output_dir: Path, output_frames: int) -> list[str]:
    return candidate_base_command(args) + [
        "-i", str(input_dir.resolve()), "-o", str(output_dir.resolve()), "-n", str(output_frames),
    ]


def run_pair_suite(args: argparse.Namespace, output_root: Path) -> dict[str, Any]:
    input_dir = output_root / "pair-input"
    truth_dir = output_root / "pair-truth"
    result_dir = output_root / "pair-output"
    inputs: dict[tuple[str, int], tuple[Path, dict[str, Any]]] = {}
    input_manifest = []
    for scenario in args.scenario:
        for endpoint, t in ((0, 0.0), (1, 1.0)):
            path = input_dir / scenario / f"{endpoint}.png"
            evidence = write_png(path, analytic_frame(scenario, t, args.width, args.height))
            inputs[(scenario, endpoint)] = (path, evidence)
            input_manifest.append(evidence)

    rows: list[dict[str, Any]] = []
    for scenario in args.scenario:
        before, after = inputs[(scenario, 0)][0], inputs[(scenario, 1)][0]
        for timestep in args.timestep:
            truth_path = truth_dir / scenario / f"t-{timestep:.2f}.png"
            truth = analytic_frame(scenario, timestep, args.width, args.height)
            truth_evidence = write_png(truth_path, truth)
            warmups, measurements = [], []
            total_runs = args.warmup + args.samples
            for run_index in range(total_runs):
                phase = "warmup" if run_index < args.warmup else "sample"
                phase_index = run_index if phase == "warmup" else run_index - args.warmup
                output_path = result_dir / scenario / f"t-{timestep:.2f}-{phase}-{phase_index}.png"
                output_path.parent.mkdir(parents=True, exist_ok=True)
                command = pair_command(args, before, after, output_path, timestep)
                try:
                    process = run_command(command, args.timeout)
                    record: dict[str, Any] = process.as_dict()
                    record.update({"phase": phase, "index": phase_index, "output": str(output_path.resolve())})
                    if process.exit_code == 0 and not process.timed_out:
                        try:
                            actual, output_evidence = read_png(output_path)
                            record["outputEvidence"] = output_evidence
                            record["metrics"] = image_metrics(actual, truth)
                            record["status"] = "passed"
                        except Exception as exc:
                            record["status"] = "failed"
                            record["failure"] = f"postprocess-{type(exc).__name__}: {exc}"
                            record["postprocessTraceback"] = traceback.format_exc()
                    else:
                        record["status"] = "failed"
                        record["failure"] = "timeout" if process.timed_out else f"exit-code-{process.exit_code}"
                except Exception as exc:
                    record = {
                        "command": command, "phase": phase, "index": phase_index,
                        "output": str(output_path.resolve()), "status": "failed",
                        "failure": f"{type(exc).__name__}: {exc}", "traceback": traceback.format_exc(),
                    }
                (warmups if phase == "warmup" else measurements).append(record)
            successful = [record for record in measurements if record.get("status") == "passed"]
            rows.append({
                "scenario": scenario,
                "timestep": timestep,
                "truth": truth_evidence,
                "warmupRuns": warmups,
                "sampleRuns": measurements,
                "summary": {
                    "completed": len(successful),
                    "failed": len(measurements) - len(successful),
                    "fileCliEndToEnd": timing_summary([record["elapsedMs"] for record in successful]),
                    "outputRead": timing_summary([record["outputEvidence"]["readMs"] for record in successful]),
                    "mae": value_summary([record["metrics"]["mae"] for record in successful]),
                    "psnrDb": value_summary([record["metrics"]["psnrDb"] for record in successful if record["metrics"]["psnrDb"] is not None]),
                    "ssim": value_summary([record["metrics"]["ssim"] for record in successful]),
                    "peakWorkingSetBytes": maximum_known(record.get("peakWorkingSetBytes") for record in successful),
                },
            })
    successful_samples = [
        sample
        for row in rows
        for sample in row["sampleRuns"]
        if sample.get("status") == "passed"
    ]
    return {
        "width": args.width,
        "height": args.height,
        "scenarios": list(args.scenario),
        "timesteps": list(args.timestep),
        "inputFiles": input_manifest,
        "inputPngWrite": timing_summary([item["writeMs"] for item in input_manifest]),
        "overallSummary": {
            "fileCliEndToEnd": timing_summary([sample["elapsedMs"] for sample in successful_samples]),
            "outputRead": timing_summary([sample["outputEvidence"]["readMs"] for sample in successful_samples]),
            "mae": value_summary([sample["metrics"]["mae"] for sample in successful_samples]),
            "psnrDb": value_summary([sample["metrics"]["psnrDb"] for sample in successful_samples if sample["metrics"]["psnrDb"] is not None]),
            "ssim": value_summary([sample["metrics"]["ssim"] for sample in successful_samples]),
            "peakWorkingSetBytes": maximum_known(sample.get("peakWorkingSetBytes") for sample in successful_samples),
        },
        "results": rows,
    }


def run_continuous_suite(args: argparse.Namespace, output_root: Path) -> dict[str, Any] | None:
    if args.continuous_frames <= 0:
        return None
    input_dir = output_root / "continuous-input"
    output_dir = output_root / "continuous-output"
    output_dir.mkdir(parents=True, exist_ok=False)
    manifest = []
    denominator = max(args.continuous_frames - 1, 1)
    for index in range(args.continuous_frames):
        # A larger translation keeps the 1080p sequence non-trivial while
        # remaining analytically generated and redistributable.
        frame = analytic_frame("pan", index / denominator, args.continuous_width, args.continuous_height)
        manifest.append(write_png(input_dir / f"{index:08d}.png", frame))
    output_frames = args.continuous_output_frames or (args.continuous_frames - 1) * 2 + 1
    command = continuous_command(args, input_dir, output_dir, output_frames)
    invalid_dimensions: list[dict[str, Any]] = []
    try:
        process = run_command(command, args.continuous_timeout)
        output_scan_started = time.perf_counter()
        output_files = sorted(
            candidate for candidate in output_dir.rglob("*")
            if candidate.is_file() and candidate.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}
        )
        output_manifest = []
        for path in output_files:
            image, image_evidence = read_png(path)
            height, width = image.shape[:2]
            image_evidence.update({"width": width, "height": height})
            output_manifest.append(image_evidence)
            if width != args.continuous_width or height != args.continuous_height:
                invalid_dimensions.append({"path": str(path.resolve()), "width": width, "height": height})
        output_scan_ms = (time.perf_counter() - output_scan_started) * 1000
        validation_failures = []
        if len(output_files) != output_frames:
            validation_failures.append(f"output-count-{len(output_files)}-expected-{output_frames}")
        if invalid_dimensions:
            validation_failures.append(f"invalid-dimensions-{len(invalid_dimensions)}")
        process_ok = process.exit_code == 0 and not process.timed_out
        status = "passed" if process_ok and not validation_failures else "failed"
        if process.timed_out:
            failure = "timeout"
        elif process.exit_code != 0:
            failure = f"exit-code-{process.exit_code}"
        elif validation_failures:
            failure = ",".join(validation_failures)
        else:
            failure = None
        process_evidence = process.as_dict()
    except Exception as exc:
        status, failure, output_manifest = "failed", f"{type(exc).__name__}: {exc}", []
        output_scan_ms = None
        process_evidence = {"command": command, "traceback": traceback.format_exc()}
    return {
        "status": status,
        "failure": failure,
        "width": args.continuous_width,
        "height": args.continuous_height,
        "inputFrames": args.continuous_frames,
        "requestedOutputFrames": output_frames,
        "inputFiles": manifest,
        "inputPngWrite": timing_summary([item["writeMs"] for item in manifest]),
        "process": process_evidence,
        "outputFiles": output_manifest,
        "actualOutputFrames": len(output_manifest),
        "invalidDimensions": invalid_dimensions,
        "outputHashReadMs": output_scan_ms,
        "measurementMeaning": "One directory-mode CLI process; elapsed time includes process startup, input file access, model loading/inference, and output writes.",
    }


def environment_evidence() -> dict[str, Any]:
    return {
        "capturedAt": utc_now(),
        "platform": platform.platform(),
        "system": platform.system(),
        "release": platform.release(),
        "machine": platform.machine(),
        "processor": platform.processor(),
        "python": sys.version,
        "pythonExecutable": sys.executable,
        "opencv": cv2.__version__,
        "numpy": np.__version__,
        "cpuCount": os.cpu_count(),
        "gpuVisibilityEnvironment": {
            key: os.environ.get(key) for key in ("CUDA_VISIBLE_DEVICES", "VK_ICD_FILENAMES") if key in os.environ
        },
    }


def compare_directory(compare_dir: Path) -> dict[str, Any]:
    source_report_path = compare_dir / "report.json"
    if not source_report_path.is_file():
        raise FileNotFoundError(f"Flow comparison report is missing: {source_report_path}")
    source = json.loads(source_report_path.read_text(encoding="utf-8"))
    if not source.get("results"):
        raise ValueError(f"Flow comparison report has no results: {source_report_path}")
    results = []
    for item in source.get("results", []):
        output_path = Path(item["output"])
        truth_path = Path(item["truth"])
        actual, output_evidence = read_png(output_path)
        truth, truth_evidence = read_png(truth_path)
        results.append({
            "scenario": item["scenario"],
            "timestep": item["timestep"],
            "output": output_evidence,
            "truth": truth_evidence,
            "metrics": image_metrics(actual, truth),
            "timing": item.get("timing"),
        })
    report = {
        "schemaVersion": 1,
        "generatedAt": utc_now(),
        "sourceReport": str(source_report_path.resolve()),
        "metricImplementation": "e2e/p3-rife-feasibility.py image_metrics",
        "results": results,
        "summary": {
            "mae": value_summary(item["metrics"]["mae"] for item in results),
            "psnrDb": value_summary(item["metrics"]["psnrDb"] for item in results if item["metrics"]["psnrDb"] is not None),
            "ssim": value_summary(item["metrics"]["ssim"] for item in results),
        },
    }
    destination = compare_dir / "metrics.json"
    if destination.exists():
        raise FileExistsError(f"Refusing to overwrite comparison metrics: {destination}")
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"status": "passed", "report": str(destination.resolve()), "results": len(results)}


def self_check() -> dict[str, Any]:
    checks = []
    for scenario in SCENARIOS:
        frames = [analytic_frame(scenario, t, 256, 192) for t in (0.0, *DEFAULT_TIMESTEPS, 1.0)]
        checks.append({
            "scenario": scenario,
            "shape": list(frames[0].shape),
            "dtype": str(frames[0].dtype),
            "endpointChanged": bool(np.any(frames[0] != frames[-1])),
            "finite": all(bool(np.isfinite(frame).all()) for frame in frames),
        })
    identity = analytic_frame("pan", 0.5, 256, 192)
    metrics = image_metrics(identity, identity.copy())
    if metrics["mae"] != 0 or metrics["psnrDb"] is not None or abs(metrics["ssim"] - 1) > 1e-12:
        raise AssertionError(f"Identity metric contract failed: {metrics}")
    if not all(check["shape"] == [192, 256, 3] and check["dtype"] == "uint8" and check["finite"] for check in checks):
        raise AssertionError(f"Scene contract failed: {checks}")
    return {"status": "passed", "sceneChecks": checks, "identityMetrics": metrics}


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    parser.add_argument("--executable", type=Path, help="RIFE/ncnn CLI executable (required except for --self-check)")
    parser.add_argument("--model", type=Path, help="Model directory passed through as -m (required except for --self-check)")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Evidence directory")
    parser.add_argument("--width", type=int, default=256, help="Pair-suite width")
    parser.add_argument("--height", type=int, default=192, help="Pair-suite height")
    parser.add_argument("--scenario", action="append", choices=SCENARIOS, help="Scenario(s); repeat to select, default is all")
    parser.add_argument("--timestep", type=float, action="append", help="Arbitrary -s timestep(s); repeat to select")
    parser.add_argument("--warmup", type=int, default=1, help="Unaggregated warmup CLI invocations per case")
    parser.add_argument("--samples", type=int, default=1, help="Measured CLI invocations per case")
    parser.add_argument("--timeout", type=float, default=120, help="Pair invocation timeout in seconds")
    parser.add_argument("--gpu", type=int, help="Candidate GPU index passed as -g")
    parser.add_argument("--extra-arg", action="append", default=[], help="Extra candidate CLI argument; repeat once per token")
    parser.add_argument("--continuous-frames", type=int, default=0, help="Enable directory-mode test with this input frame count")
    parser.add_argument("--continuous-output-frames", type=int, help="Value passed to directory-mode -n")
    parser.add_argument("--continuous-width", type=int, default=1920)
    parser.add_argument("--continuous-height", type=int, default=1080)
    parser.add_argument("--continuous-timeout", type=float, default=300, help="Directory invocation timeout in seconds")
    parser.add_argument("--self-check", action="store_true", help="Validate generated scenes, metrics, and parser without running a candidate")
    parser.add_argument("--compare-dir", type=Path, help="Score a p3-flow-comparison.cjs output directory with the same image metrics")
    args = parser.parse_args(argv)
    args.scenario = tuple(args.scenario or SCENARIOS)
    args.timestep = tuple(args.timestep or DEFAULT_TIMESTEPS)
    if args.self_check:
        return args
    if args.compare_dir:
        if not args.compare_dir.is_dir():
            parser.error(f"--compare-dir is not a directory: {args.compare_dir}")
        return args
    if not args.executable:
        parser.error("--executable is required unless --self-check is used")
    if not args.model:
        parser.error("--model is required unless --self-check is used")
    if not args.executable.is_file():
        parser.error(f"--executable is not a file: {args.executable}")
    if args.model and not args.model.is_dir():
        parser.error(f"--model is not a directory: {args.model}")
    if args.width <= 0 or args.height <= 0 or args.samples <= 0 or args.warmup < 0:
        parser.error("dimensions and --samples must be positive; --warmup cannot be negative")
    if args.timeout <= 0 or args.continuous_timeout <= 0 or args.continuous_frames < 0:
        parser.error("timeouts must be positive and --continuous-frames cannot be negative")
    if any(timestep <= 0 or timestep >= 1 for timestep in args.timestep):
        parser.error("every --timestep must be strictly between 0 and 1")
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.self_check:
        print(json.dumps(self_check(), ensure_ascii=False, indent=2))
        return 0
    if args.compare_dir:
        try:
            print(json.dumps(compare_directory(args.compare_dir.resolve()), ensure_ascii=False))
            return 0
        except Exception as exc:
            print(json.dumps({"status": "comparison-failed", "failure": f"{type(exc).__name__}: {exc}"}, ensure_ascii=False), file=sys.stderr)
            return 2
    output_root = args.output.resolve()
    try:
        output_root.mkdir(parents=True, exist_ok=False)
    except FileExistsError as exc:
        raise SystemExit(f"Refusing to overwrite an existing experiment directory: {output_root}") from exc
    report_path = output_root / "report.json"
    report: dict[str, Any] = {
        "schemaVersion": 1,
        "status": "running",
        "startedAt": utc_now(),
        "measurementScope": {
            "classification": "file-based CLI feasibility experiment",
            "includes": ["process startup", "candidate input file access", "model loading", "inference", "candidate output file write"],
            "excludes": ["production decoder upload", "production compositor/synchronization", "audio clock", "persistent-process IPC", "GPU memory unless candidate logs it"],
            "warning": "These results are not persistent-process realtime inference cost and must not be reported as such.",
            "gpuMemory": "Not measured by this harness. Candidate logs are retained, but no GPU time or VRAM value is inferred from wall time or process working set.",
        },
        "fixtureProvenance": {
            "kind": "procedurally generated analytic frames",
            "externalMedia": False,
            "description": "All inputs and intermediate-frame truths are generated locally from mathematical textures and transforms; no third-party media is embedded.",
        },
        "environment": environment_evidence(),
        "parameters": {
            key: (str(value.resolve()) if isinstance(value, Path) else list(value) if isinstance(value, tuple) else value)
            for key, value in vars(args).items()
        },
    }
    try:
        report["candidate"] = {
            "executable": hash_tree(args.executable),
            "model": hash_tree(args.model) if args.model else None,
            "licenseEvidence": "Not inferred by this harness; record code and weight licenses separately before distribution.",
        }
        report["selfCheck"] = self_check()
        report["pairSuite"] = run_pair_suite(args, output_root)
        report["continuousSuite"] = run_continuous_suite(args, output_root)
        failed_samples = sum(row["summary"]["failed"] for row in report["pairSuite"]["results"])
        failed_warmups = sum(
            sum(run.get("status") != "passed" for run in row["warmupRuns"])
            for row in report["pairSuite"]["results"]
        )
        continuous_failed = report["continuousSuite"] is not None and report["continuousSuite"]["status"] != "passed"
        report["failureCounts"] = {"warmup": failed_warmups, "samples": failed_samples}
        report["status"] = "completed-with-failures" if failed_samples or failed_warmups or continuous_failed else "passed"
        report["completedAt"] = utc_now()
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({
            "status": report["status"], "report": str(report_path),
            "failedWarmups": failed_warmups, "failedSamples": failed_samples,
        }, ensure_ascii=False))
        return 1 if failed_samples or failed_warmups or continuous_failed else 0
    except Exception as exc:
        report.update({
            "status": "harness-failed",
            "completedAt": utc_now(),
            "failure": f"{type(exc).__name__}: {exc}",
            "traceback": traceback.format_exc(),
        })
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"status": report["status"], "report": str(report_path), "failure": report["failure"]}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
