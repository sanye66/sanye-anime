#!/usr/bin/env python3
"""Enumerate real-video triplets for a neural-vs-current frame-interpolation comparison.

Why this shape: an earlier version of this harness tried to pre-select "pan" and "deformation"
segments with an automatic motion classifier. That failed on real footage. A pixel-wise residual
picked low-texture landscape shots, because Farneback produces large spurious vectors on smooth
luminance gradients; a block-wise residual with a texture filter picked the same shots again.
Pre-selecting scenes by a fragile classifier also invites cherry-picking.

So this harness does the opposite: it walks the clip at a fixed stride, keeps every triplet whose
three frames do not span a cut, and measures both methods on all of them. Motion descriptors are
recorded as labels next to each result, not used as gates, so the report can explain where each
method wins instead of asserting it.

A triplet is (frame n, frame n+1, frame n+2). The middle frame is ground truth for a phase-0.5
interpolation between the outer two frames: the standard every-other-frame protocol, which needs no
synthetic truth and cannot be tuned in favour of either method.

This is an experiment harness. It measures interpolation quality, not realtime playback cost.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "sanye_deploy/.local/player-quality/licensed/sintel-trailer-1080p.mp4"
DEFAULT_OUTPUT = ROOT / "sanye_deploy/.local/player-quality/interp-model-comparison"

ANALYSIS_WIDTH = 480
BLOCK = 6
# Blocks with almost no luma gradient cannot produce a trustworthy flow vector. The threshold is
# deliberately high: smooth shading ramps are exactly the case that fooled the earlier attempt.
MIN_TEXTURE = 12.0
MIN_BLOCK_MOTION = 0.35
# A triplet containing an abrupt luma change spans a cut. Both methods behave differently there (the
# production path holds the previous frame, a neural model blends two unrelated images), so cuts are
# excluded from the quality score and reported separately.
CUT_LUMA_DIFF = 26.0


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def analysis_size(width: int, height: int) -> tuple[int, int]:
    scale = ANALYSIS_WIDTH / width
    return ANALYSIS_WIDTH, max(2, round(height * scale / 2) * 2)


def luma(frame: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)


def block_vectors(flow: np.ndarray, before: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Per-block median flow over textured, moving blocks, plus block centre coordinates."""
    height, width = flow.shape[:2]
    gx = cv2.Sobel(before, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(before, cv2.CV_32F, 0, 1, ksize=3)
    energy = np.hypot(gx, gy)
    xs: list[float] = []
    ys: list[float] = []
    centres: list[tuple[float, float]] = []
    for top in range(0, height - BLOCK + 1, BLOCK):
        for left in range(0, width - BLOCK + 1, BLOCK):
            if float(np.mean(energy[top:top + BLOCK, left:left + BLOCK])) < MIN_TEXTURE:
                continue
            median_x = float(np.median(flow[top:top + BLOCK, left:left + BLOCK, 0]))
            median_y = float(np.median(flow[top:top + BLOCK, left:left + BLOCK, 1]))
            if math.hypot(median_x, median_y) < MIN_BLOCK_MOTION:
                continue
            xs.append(median_x)
            ys.append(median_y)
            centres.append((left + BLOCK / 2, top + BLOCK / 2))
    if not xs:
        return np.array([]), np.array([]), np.zeros((0, 2))
    return np.array(xs), np.array(ys), np.array(centres, dtype=np.float64)


def describe(index: int, before: np.ndarray, after: np.ndarray, cut_diff: float) -> dict:
    """Describe the half-step motion an interpolator has to synthesise.

    `coherence` near 1 means every moving part shares one direction, i.e. a rigid camera move. A low
    value means different parts of the frame move against each other, i.e. non-rigid motion.
    `residual` is the leftover after the best-fit global affine transform, as a fraction of the mean
    displacement.
    """
    flow = cv2.calcOpticalFlowFarneback(before, after, None, 0.5, 3, 15, 3, 5, 1.2, 0)
    xs, ys, centres = block_vectors(flow, before)
    if len(xs) < 24:
        return {"index": index, "blocks": len(xs), "magnitude": 0.0, "coherence": None,
                "residual": None, "cutDiff": round(cut_diff, 2)}
    magnitudes = np.hypot(xs, ys)
    mean_magnitude = float(np.mean(magnitudes)) or 1e-6
    coherence = float(math.hypot(float(np.mean(xs)), float(np.mean(ys))) / mean_magnitude)
    design = np.concatenate([centres, np.ones((len(centres), 1))], axis=1)
    target = np.stack([xs, ys], axis=1)
    coefficients, *_ = np.linalg.lstsq(design, target, rcond=None)
    predicted = design @ coefficients
    residual = float(np.mean(np.hypot(xs - predicted[:, 0], ys - predicted[:, 1])) / mean_magnitude)
    return {"index": index, "blocks": len(xs), "magnitude": round(mean_magnitude, 3),
            "coherence": round(coherence, 3), "residual": round(residual, 3),
            "cutDiff": round(cut_diff, 2)}


def scan(source: Path, output: Path, stride: int, make_contact_sheet: bool) -> dict:
    capture = cv2.VideoCapture(str(source))
    if not capture.isOpened():
        raise SystemExit(f"Cannot open {source}")
    fps = float(capture.get(cv2.CAP_PROP_FPS)) or 24.0
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    aw, ah = analysis_size(width, height)
    smalls: list[np.ndarray] = []
    diffs: list[float] = []
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        small = cv2.resize(luma(frame), (aw, ah), interpolation=cv2.INTER_AREA)
        if smalls:
            diffs.append(float(np.mean(np.abs(small.astype(np.int16) - smalls[-1].astype(np.int16)))))
        smalls.append(small)
    capture.release()
    if len(smalls) < 3:
        raise SystemExit(f"{source} yielded only {len(smalls)} frames")

    triplets = []
    for first in range(0, len(smalls) - 2, stride):
        span = max(diffs[first:first + 2]) if first + 2 <= len(diffs) else 0.0
        descriptor = describe(first, smalls[first], smalls[first + 1], span)
        triplets.append({"name": f"t{first:05d}", "a": first, "truth": first + 1, "b": first + 2,
                         "aSeconds": round(first / fps, 4), "spanCutDiff": round(span, 2),
                         "isCut": span >= CUT_LUMA_DIFF, **descriptor})

    frames_dir = output / "source"
    frames_dir.mkdir(parents=True, exist_ok=True)
    wanted = sorted({index for item in triplets for index in (item["a"], item["truth"], item["b"])})
    wanted_set = set(wanted)
    capture = cv2.VideoCapture(str(source))
    # Sequential read keeps frame indices exact; seeking on a compressed clip is not guaranteed to
    # land on the requested frame.
    written: set[int] = set()
    for index in range(wanted[-1] + 1):
        ok, frame = capture.read()
        if not ok:
            break
        if index in wanted_set:
            cv2.imwrite(str(frames_dir / f"frame-{index:05d}.png"), frame, [cv2.IMWRITE_PNG_COMPRESSION, 3])
            written.add(index)
    capture.release()
    missing = [index for index in wanted if index not in written]
    if missing:
        raise SystemExit(f"Missing frames: {missing[:8]}")
    for item in triplets:
        for slot in ("a", "truth", "b"):
            link = frames_dir / f"{item['name']}-{slot}.png"
            if not link.exists():
                link.hardlink_to(frames_dir / f"frame-{item[slot]:05d}.png")

    if make_contact_sheet:
        write_contact_sheet(smalls, output, fps)
    return {"fps": fps, "width": width, "height": height, "frames": len(smalls), "triplets": triplets}


def write_contact_sheet(smalls: list[np.ndarray], output: Path, fps: float) -> None:
    picks = [index for index in (round(second * fps) for second in range(0, int(len(smalls) / fps) + 1, 5))
             if index < len(smalls)]
    tiles = []
    for index in picks:
        tile = cv2.resize(smalls[index], (320, 180))
        cv2.putText(tile, f"{index / fps:.0f}s #{index}", (8, 172), cv2.FONT_HERSHEY_SIMPLEX,
                    0.5, (0, 255, 255), 1, cv2.LINE_AA)
        tiles.append(tile)
    rows = [np.hstack(tiles[index:index + 5]) for index in range(0, len(tiles), 5)]
    width = max(row.shape[1] for row in rows)
    rows = [np.pad(row, ((0, 0), (0, width - row.shape[1])) + ((0, 0),) * (row.ndim - 2))
            if row.shape[1] < width else row for row in rows]
    cv2.imwrite(str(output / "source-contact-sheet.png"), np.vstack(rows))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT / datetime.now().strftime("%Y%m%d-%H%M%S"))
    parser.add_argument("--stride", type=int, default=24, help="frames between triplets")
    parser.add_argument("--no-contact-sheet", action="store_true")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    result = scan(args.source, args.output, args.stride, not args.no_contact_sheet)
    report = {
        "schemaVersion": 1,
        "capturedAt": utc_now(),
        "measurementScope": "Triplet enumeration and motion descriptors only; no quality or cost claim.",
        "source": {"path": str(args.source), "sha256": sha256_file(args.source),
                   "width": result["width"], "height": result["height"],
                   "fps": round(result["fps"], 4), "frames": result["frames"]},
        "protocol": {"stride": args.stride, "analysisWidth": ANALYSIS_WIDTH, "block": BLOCK,
                     "minTexture": MIN_TEXTURE, "cutLumaDiff": CUT_LUMA_DIFF,
                     "groundTruth": "frame n+1 is the truth for a phase-0.5 interpolation between n and n+2"},
        "triplets": result["triplets"],
    }
    (args.output / "fixtures.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    scored = [item for item in result["triplets"] if not item["isCut"] and item["coherence"] is not None]
    print(json.dumps({"output": str(args.output), "frames": result["frames"],
                      "triplets": len(result["triplets"]), "scorable": len(scored),
                      "cuts": sum(1 for item in result["triplets"] if item["isCut"]),
                      "coherenceRange": [min(item["coherence"] for item in scored),
                                         max(item["coherence"] for item in scored)],
                      "magnitudeRange": [min(item["magnitude"] for item in scored),
                                         max(item["magnitude"] for item in scored)]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
