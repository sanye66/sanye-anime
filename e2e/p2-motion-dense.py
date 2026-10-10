"""Isolated native dense-flow comparison against the deterministic CPU fixture."""

import json
import math
import pathlib
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "sanye_deploy/.local/player-quality/p2-python"))
import cv2
import numpy as np

cv2.setNumThreads(1)
WIDTH, HEIGHT = 256, 192
yy, xx = np.mgrid[:HEIGHT, :WIDTH].astype(np.float32)


def texture(x, y):
    value = (122 + 40 * np.sin(x * .19 + y * .13) + 38 * np.sin(x * .37 - y * .31)
             + 25 * np.sin(x * .73 + y * .43) + 19 * np.sin(x * .07 - y * .52))
    return np.where((x < 0) | (y < 0) | (x >= WIDTH) | (y >= HEIGHT), 35,
                    np.rint(np.clip(value, 0, 255))).astype(np.uint8)


def rotated(angle):
    dx, dy = xx - WIDTH / 2, yy - HEIGHT / 2
    return (WIDTH / 2 + dx * math.cos(angle) - dy * math.sin(angle),
            HEIGHT / 2 + dx * math.sin(angle) + dy * math.cos(angle))


def scenario(name):
    if name == "pan":
        return texture(xx - 8, yy - 4), np.full_like(xx, 8), np.full_like(yy, 4)
    if name.startswith("rotation"):
        angle = math.radians(int(name.split("-")[1].removesuffix("deg")))
        inverse = rotated(-angle)
        target = rotated(angle)
        return texture(*inverse), target[0] - xx, target[1] - yy
    if name == "deformation":
        shift = 11 * np.sin(yy * .045)
        return texture(xx - shift, yy), shift, np.zeros_like(yy)
    if name == "occlusion":
        frame = texture(xx - 8, yy)
        frame[(xx >= 110) & (xx < 146) & (yy >= 45) & (yy < 145)] = 220
        return frame, np.full_like(xx, 8), np.zeros_like(yy)
    raise ValueError(name)


def measure(flow, dx, dy, name):
    cx, cy = np.meshgrid((np.arange(WIDTH // 8) + .5) * WIDTH / (WIDTH // 8),
                         (np.arange(HEIGHT // 8) + .5) * HEIGHT / (HEIGHT // 8))
    gx, gy = np.rint(cx).astype(int), np.rint(cy).astype(int)
    actual = flow[gy, gx]
    true_x, true_y = dx[gy, gx], dy[gy, gx]
    valid = ((cx >= 20) & (cy >= 20) & (cx < WIDTH - 20) & (cy < HEIGHT - 20)
             & (cx + true_x >= 20) & (cy + true_y >= 20)
             & (cx + true_x < WIDTH - 20) & (cy + true_y < HEIGHT - 20))
    if name == "occlusion":
        valid &= ~((cx + 8 >= 110) & (cx + 8 < 146) & (cy >= 45) & (cy < 145))
    error = np.hypot(actual[..., 0] - true_x, actual[..., 1] - true_y)[valid]
    return {"visible": int(valid.sum()), "meanEpe": float(error.mean()),
            "badOver3": int((error > 3).sum()), "p95Epe": float(np.percentile(error, 95))}


def main():
    old = texture(xx, yy)
    names = ["pan", "rotation-6deg", "rotation-11deg", "deformation", "occlusion"]
    results = {}
    for name in names:
        current, dx, dy = scenario(name)
        results[name] = {}
        for algorithm in ("Farneback", "DIS-medium"):
            elapsed = []
            for _ in range(4):
                started = time.perf_counter()
                if algorithm == "Farneback":
                    flow = cv2.calcOpticalFlowFarneback(old, current, None, .5, 4, 21, 4, 7, 1.5, 0)
                else:
                    flow = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM).calc(old, current, None)
                elapsed.append((time.perf_counter() - started) * 1000)
            results[name][algorithm] = {**measure(flow, dx, dy, name), "nativeMs": elapsed}
    report = {"opencv": cv2.__version__, "python": sys.version.split()[0], "threads": cv2.getNumThreads(),
              "width": WIDTH, "height": HEIGHT, "results": results}
    outfile = ROOT / "sanye_deploy/.local/player-quality/p2-motion-dense.json"
    outfile.parent.mkdir(parents=True, exist_ok=True)
    outfile.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report))


if __name__ == "__main__":
    main()
