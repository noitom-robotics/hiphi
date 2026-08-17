#!/usr/bin/env python3
"""Generate t-SNE 55x55 occupancy envelopes for the project page.

By default this uses the archived paper panel t-SNE sample from
hiphi_core_selection, not the public explorer payload. That keeps the website
occupied-cell values aligned with the submitted paper figure.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.colors import LinearSegmentedColormap, to_rgba

PAPER_ROOT = Path.home() / "ji" / "hiphi_core_selection"
PAPER_SAMPLE = (
    PAPER_ROOT
    / "outputs"
    / "core300_final_paper_figures_20260525"
    / "aligned23_tsne_v2_20260528"
    / "visual_resample_clipid_vs_hiphi_xy_density_e020_20k"
    / "visual_resampled_points.npz"
)
PAPER_METRICS = PAPER_ROOT / "outputs" / "envelope_comparison.json"

COLORS = {
    "HiPHI": "#B98AD9",
    "BONES-SEED-SOMA": "#5E88BF",
    "AMASS": "#6FA886",
    "Motion-X++": "#D49A62",
    "LaFAN1": "#D46F6C",
}
DISPLAY_NAMES = {
    "HiPHI": "HiPHI (ours)",
    "BONES-SEED-SOMA": "BONES-SEED",
    "AMASS": "AMASS",
    "Motion-X++": "Motion-X++",
    "LaFAN1": "LaFAN1",
}
DRAW_ORDER = ["HiPHI", "BONES-SEED-SOMA", "AMASS", "Motion-X++", "LaFAN1"]


def extract_payload(html: str) -> dict:
    match = re.search(r"const\s+PAYLOAD\s*=\s*(\{.*?\});\s*const\s+state\s*=", html, flags=re.S)
    if not match:
        raise ValueError("Could not find embedded PAYLOAD JSON in explorer HTML")
    return json.loads(match.group(1))


def make_cmap(color: str) -> LinearSegmentedColormap:
    rgba = to_rgba(color)
    return LinearSegmentedColormap.from_list(
        "dataset_env",
        [(1, 1, 1, 1), (rgba[0], rgba[1], rgba[2], 0.82)],
    )


def paper_bounds(xy: np.ndarray, pad_frac: float = 0.035) -> tuple[float, float, float, float]:
    """Match render_tsne_three_panel_publication.py global_bounds."""
    xmin, ymin = xy.min(axis=0)
    xmax, ymax = xy.max(axis=0)
    padx = (xmax - xmin) * pad_frac
    pady = (ymax - ymin) * pad_frac
    return float(xmin - padx), float(xmax + padx), float(ymin - pady), float(ymax + pady)


def cell_ids(points: np.ndarray, bounds: tuple[float, float, float, float], bins: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    xmin, xmax, ymin, ymax = bounds
    eps = 1e-9
    xi = np.clip(((points[:, 0] - xmin) / max(xmax - xmin, eps) * bins).astype(int), 0, bins - 1)
    yi = np.clip(((points[:, 1] - ymin) / max(ymax - ymin, eps) * bins).astype(int), 0, bins - 1)
    return xi, yi, xi * bins + yi


def load_from_paper_npz(path: Path) -> tuple[np.ndarray, np.ndarray, dict[str, dict[str, str]], list[str], str]:
    data = np.load(path, allow_pickle=True)
    xy = np.asarray(data["xy"], dtype=np.float64)
    labels = np.asarray(data["datasets"]).astype(str)
    meta = {name: {"display": DISPLAY_NAMES.get(name, name), "color": COLORS.get(name, "#B98AD9")} for name in sorted(set(labels))}
    order = [name for name in DRAW_ORDER if name in meta] + [name for name in sorted(meta) if name not in DRAW_ORDER]
    return xy, labels, meta, order, "archived_paper_panel_tsne_sample"


def load_from_explorer(path: Path) -> tuple[np.ndarray, np.ndarray, dict[str, dict[str, str]], list[str], str]:
    payload = extract_payload(path.read_text(encoding="utf-8"))
    points = payload["plot"]["points"]
    datasets = payload["plot"]["datasets"]
    xy = np.array([[float(p["x"]), float(p["y"])] for p in points], dtype=np.float64)
    labels = np.array([p["dataset"] for p in points], dtype=str)
    meta = {d["name"]: {"display": d.get("display", d["name"]), "color": d.get("color", "#B98AD9")} for d in datasets}
    order = payload["plot"].get("draw_order") or [d["name"] for d in datasets]
    return xy, labels, meta, order, "public_explorer_payload"


def load_paper_metrics(path: Path) -> dict:
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return data.get("fig_c_metrics") or data.get("metrics") or {}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="static/interactive/tSNE_explorer.html", help="Explorer HTML fallback input")
    parser.add_argument("--paper-npz", type=Path, default=PAPER_SAMPLE, help="Archived paper t-SNE sample NPZ")
    parser.add_argument("--paper-metrics", type=Path, default=PAPER_METRICS, help="Archived paper metrics JSON")
    parser.add_argument("--use-explorer", action="store_true", help="Use the public explorer payload instead of the archived paper sample")
    parser.add_argument("--output", default="static/images/tsne_dataset_envelopes_55grid.png")
    parser.add_argument("--json-output", default="static/data/tsne_envelopes_55grid.json")
    parser.add_argument("--grid", type=int, default=55)
    args = parser.parse_args()

    if args.use_explorer or not args.paper_npz.exists():
        xy, labels, ds_meta, draw_order, source = load_from_explorer(Path(args.input))
        xmin, xmax = float(xy[:, 0].min()), float(xy[:, 0].max())
        ymin, ymax = float(xy[:, 1].min()), float(xy[:, 1].max())
        pad_x = (xmax - xmin) * 1e-6 or 1e-6
        pad_y = (ymax - ymin) * 1e-6 or 1e-6
        bounds = (xmin - pad_x, xmax + pad_x, ymin - pad_y, ymax + pad_y)
        paper_metrics = {}
        note = "Explorer-sample fallback; occupied-cell values may differ from the paper figure."
    else:
        xy, labels, ds_meta, draw_order, source = load_from_paper_npz(args.paper_npz)
        bounds = paper_bounds(xy)
        paper_metrics = load_paper_metrics(args.paper_metrics)
        note = "Paper-aligned 55×55 grid from archived panel data; HiPHI/BONES metrics match the t-SNE coverage panel."

    panels = []
    json_datasets = []
    for name in draw_order:
        pts = xy[labels == name]
        if len(pts) == 0:
            continue
        xi, yi, cid = cell_ids(pts, bounds, args.grid)
        occupied_cells = sorted(set(int(v) for v in cid.tolist()))
        cells = [[int(c // args.grid), int(c % args.grid)] for c in occupied_cells]
        meta = ds_meta.get(name, {"display": name, "color": COLORS.get(name, "#B98AD9")})
        occupied = np.zeros((args.grid, args.grid), dtype=bool)
        for x_cell, y_cell in cells:
            occupied[y_cell, x_cell] = True
        metric = paper_metrics.get(name) or {}
        paper_occ = metric.get("occupied_cells")
        occupied_count = int(round(float(paper_occ))) if paper_occ is not None else int(len(occupied_cells))
        panels.append((name, meta, occupied, len(pts), occupied_count))
        item = {
            "name": name,
            "display": meta.get("display", name),
            "color": meta.get("color", COLORS.get(name, "#B98AD9")),
            "point_count": int(len(pts)),
            "occupied_cells": occupied_count,
            "metric_label": f"{occupied_count} cells",
            "paper_metric": bool(metric),
            "cells": cells,
        }
        if metric.get("effective_occupied_cells") is not None:
            item["effective_occupied_cells"] = float(metric["effective_occupied_cells"])
        if metric.get("long_tail_cell_share") is not None:
            item["long_tail_cell_share"] = float(metric["long_tail_cell_share"])
            item["long_tail_percent"] = float(metric["long_tail_cell_share"]) * 100.0
        json_datasets.append(item)

    json_out = Path(args.json_output)
    json_out.parent.mkdir(parents=True, exist_ok=True)
    long_tail_stats = []
    for item in json_datasets:
        if item.get("long_tail_percent") is not None:
            long_tail_stats.append({
                "name": item["name"],
                "display": item["display"],
                "color": item["color"],
                "long_tail_percent": round(float(item["long_tail_percent"]), 1),
                "effective_occupied_cells": int(round(float(item.get("effective_occupied_cells", item["occupied_cells"])))),
                "occupied_cells": int(item["occupied_cells"]),
            })

    json_out.write_text(json.dumps({
        "source": source,
        "grid": args.grid,
        "note": note,
        "default_visible": ["HiPHI", "BONES-SEED-SOMA"],
        "datasets": json_datasets,
        "long_tail_stats": long_tail_stats,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    cols = 3
    rows = int(np.ceil(len(panels) / cols))
    fig, axes = plt.subplots(rows, cols, figsize=(16.8, 10.4), dpi=180)
    axes = np.array(axes).reshape(-1)
    fig.patch.set_facecolor("#fff7fd")

    for ax in axes:
        ax.set_facecolor("#fffafd")
        ax.set_xticks([])
        ax.set_yticks([])
        for spine in ax.spines.values():
            spine.set_visible(False)

    for ax, (name, meta, occupied, n_points, occupied_count) in zip(axes, panels):
        color = meta.get("color", COLORS.get(name, "#B98AD9"))
        display = meta.get("display", name)
        ax.imshow(occupied.astype(float), origin="lower", cmap=make_cmap(color), interpolation="nearest", vmin=0, vmax=1)
        ax.set_xticks(np.arange(-0.5, args.grid, 5), minor=False)
        ax.set_yticks(np.arange(-0.5, args.grid, 5), minor=False)
        ax.grid(which="major", color="#ead8ec", linewidth=0.45, alpha=0.74)
        ax.tick_params(which="both", bottom=False, left=False, labelbottom=False, labelleft=False)
        ax.set_title(f"{display}\n{occupied_count} occupied cells / {args.grid}×{args.grid}", fontsize=13, fontweight="bold", color="#21172b", pad=12)
        for spine in ax.spines.values():
            spine.set_visible(True)
            spine.set_color("#ead8ec")
            spine.set_linewidth(1.0)

    for ax in axes[len(panels):]:
        ax.axis("off")

    fig.suptitle("Dataset-specific t-SNE occupancy envelopes", fontsize=22, fontweight="black", color="#21172b", y=0.985)
    fig.text(0.5, 0.942, f"Paper-aligned coordinate frame, {args.grid}×{args.grid} grid; each panel marks occupied cells for a sampled dataset.", ha="center", va="center", fontsize=11.5, color="#6c5870")
    fig.subplots_adjust(left=0.035, right=0.985, top=0.885, bottom=0.035, wspace=0.11, hspace=0.24)

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out, facecolor=fig.get_facecolor(), bbox_inches="tight", pad_inches=0.18)
    plt.close(fig)

    print(f"wrote {out} and {json_out} from {len(xy)} points across {len(panels)} datasets")
    print(note)
    for name, meta, occupied, n_points, occupied_count in panels:
        print(f"- {meta.get('display', name)}: {occupied_count} occupied cells, {n_points} sampled points")


if __name__ == "__main__":
    main()
