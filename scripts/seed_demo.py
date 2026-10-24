"""Create a throwaway demo library with fake records and optionally serve the web UI on it.

The demo lives in its own directory (default: ``demo/``) with its own config and database,
so the real ``config/`` is never touched. Fake MEGA URLs point at ``example.invalid``.

    python scripts/seed_demo.py --reset --serve
"""

from __future__ import annotations

import argparse
from dataclasses import replace
import os
import random
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from recordtree.app import RecordTreeApp  # noqa: E402
from recordtree.db import connect  # noqa: E402
from recordtree.importer.service import ImportService  # noqa: E402
from recordtree.models import ImportRecord, ImportStats, LinkItem  # noqa: E402
from recordtree.repositories import DownloadRepository, ImportRepository  # noqa: E402

ACTORS = [
    "Aoi Hoshino", "Mika Tanaka", "Rin Kisaragi", "Yui Sakuragi", "Hana Mizuki", "Sora Amane",
    "Nana Kurosawa", "Kaede Shiraishi", "Mio Asakura", "Ren Takamiya", "Akari Fujisaki",
    "Saki Morimoto", "Haruka Ichinose", "Emi Kanzaki", "星野あおい", "桜木ゆい", "水城はな",
    "天音そら", "Luna Whitfield", "Chloe Marchetti", "Ivy Laurent", "Mona Reyes",
    "Kiri & Momo", "Studio Hinata", "Tsubaki", "Yuzu", "Hikari Natsume", "Reina Kujo",
]
PLATFORMS = ["Fantia", "Patreon", "Fanbox", "Gumroad", "OnlyFans", "SubscribeStar", "niconico", "Ci-en"]
WORDS = [
    "Summer", "Night", "Live", "Stream", "Archive", "Special", "Behind the scenes", "Collection",
    "Session", "Birthday", "Studio", "Morning", "Rehearsal", "Q&A", "Anniversary", "Unreleased",
    "Director's cut", "Vlog", "ASMR", "Talk", "Cover", "Acoustic", "Remaster", "Bonus",
]
JP_TITLES = ["夏の配信アーカイブ", "誕生日記念ライブ", "朝の雑談", "スタジオ収録", "未公開映像まとめ", "年末スペシャル", "ASMR 耳かき", "歌枠リクエスト"]
NOTES = [None] * 6 + ["re-upload", "part 3 missing", "higher bitrate version available", "duplicate of an older post?"]
TYPES = [".mp4"] * 5 + [".m4a", ".m4a", ".zip", ".jpg", ".par2", ".mkv"]
GB = 1024**3


def _title(rng: random.Random, index: int) -> str:
    roll = rng.random()
    if roll < 0.15:
        return f"{rng.choice(JP_TITLES)} #{rng.randint(1, 60)}"
    if roll < 0.22:
        # Long titles exercise truncation in tables and the drawer.
        words = rng.sample(WORDS, 9)
        return " ".join(words) + f" — Extended Edition Part {rng.randint(1, 9)}"
    return " ".join(rng.sample(WORDS, rng.randint(2, 5))) + f" #{index % 97 + 1}"


def _record(rng: random.Random, index: int) -> ImportRecord:
    actor = rng.choice(ACTORS)
    if rng.random() < 0.08:
        actor = f"{actor}, {rng.choice(ACTORS)}"
    title = _title(rng, index)
    links: list[LinkItem] = []
    total = 0
    for order in range(1, rng.choice([1, 1, 2, 3, 3, 4, 5, 6, 8, 12]) + 1):
        file_type = rng.choice(TYPES)
        size = int(rng.uniform(0.02, 4.2) * GB) if file_type != ".jpg" else rng.randint(200_000, 9_000_000)
        total += size
        links.append(
            LinkItem(
                link_order=order,
                mega_url=f"https://mega.example.invalid/file/{rng.getrandbits(40):010x}#{rng.getrandbits(64):016x}",
                file_type=file_type,
                size_bytes=size,
                formatted_size=f"{size / GB:.2f} GB",
            )
        )
    year = rng.choice([2022, 2023, 2024, 2024, 2025, 2025, 2026])
    delivered = None if rng.random() < 0.05 else f"{year}-{rng.randint(1, 12):02d}-{rng.randint(1, 28):02d}"
    if rng.random() < 0.5:
        # Current exports often put the full file name in the Type field.
        links = [replace(link, file_name=f"[{actor}][{delivered}][{title}]{link.file_type}") for link in links]
    return ImportRecord(
        actor_raw=actor,
        delivery_date=delivered,
        title=title,
        entry_date=delivered,
        note=rng.choice(NOTES),
        upload_title=f"[{actor}] {title}",
        duplicate_search_raw=None,
        source_name=rng.choice(PLATFORMS),
        size_raw=f"{total / GB:.1f} GB",
        size_bytes=total,
        source_row_number=index + 2,
        links=links,
    )


def seed(root: Path, count: int, seed_value: int) -> None:
    rng = random.Random(seed_value)
    RecordTreeApp().init()
    conn = connect(root / "config" / "recordtree.sqlite3")
    try:
        source = root / "demo-records.xlsx"
        source.write_bytes(b"demo placeholder")
        imports = ImportRepository(conn)
        import_id = imports.create_import(source)
        stats = ImportStats(total_rows=count)
        ImportService(conn).sync(import_id, [_record(rng, index) for index in range(count)], stats)
        imports.finish_import(import_id, stats, "completed")

        groups: dict[int, list[tuple[int, int]]] = {}
        for link_id, group_id, size in conn.execute(
            "SELECT id, record_group_id, size_bytes FROM download_links ORDER BY record_group_id, link_order"
        ):
            groups.setdefault(group_id, []).append((link_id, size))

        downloads = DownloadRepository(conn)
        for group_id, links in groups.items():
            roll = rng.random()
            if roll < 0.04:
                # Records whose links were all removed upstream show as "No links".
                conn.execute(
                    "UPDATE download_links SET is_deleted = 1, deleted_at = datetime('now') WHERE record_group_id = ?",
                    (group_id,),
                )
                continue
            if len(links) > 2 and rng.random() < 0.1:
                link_id, _ = links.pop()
                conn.execute(
                    "UPDATE download_links SET is_deleted = 1, deleted_at = datetime('now') WHERE id = ?",
                    (link_id,),
                )
            if roll < 0.40:
                done, failed = links, []
            elif roll < 0.58:
                cut = rng.randint(1, max(1, len(links) - 1))
                done, failed = links[:cut], links[cut:] if rng.random() < 0.5 else []
            else:
                continue
            status = "failed" if failed else "completed"
            download_id = downloads.create_download(
                group_id,
                Path("downloads") / f"demo/{group_id}",
                sum(size for _, size in done + failed),
                500 * GB,
                status,
                message="mega-get exited with code 1" if failed else None,
            )
            for link_id, _ in done:
                item_id = downloads.create_download_item(download_id, link_id)
                downloads.finish_download_item(item_id, "completed", 0, None)
            for link_id, _ in failed:
                item_id = downloads.create_download_item(download_id, link_id)
                downloads.finish_download_item(item_id, "failed", 1, "Transfer quota exceeded")
            conn.execute(
                "UPDATE downloads SET requested_at = datetime('now', ?) WHERE id = ?",
                (f"-{rng.randint(1, 24 * 120)} hours", download_id),
            )
        conn.commit()
        totals = conn.execute(
            "SELECT (SELECT COUNT(*) FROM record_groups), (SELECT COUNT(*) FROM actors), (SELECT COUNT(*) FROM downloads)"
        ).fetchone()
        print(f"Seeded {totals[0]} records, {totals[1]} actors, {totals[2]} downloads in {root}")
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", type=Path, default=REPO_ROOT / "demo", help="demo directory (default: demo/)")
    parser.add_argument("--records", type=int, default=600, help="number of fake records (default: 600)")
    parser.add_argument("--seed", type=int, default=7, help="random seed for reproducible data")
    parser.add_argument("--reset", action="store_true", help="delete the demo directory first")
    parser.add_argument("--serve", action="store_true", help="serve the web UI on the demo data afterwards")
    parser.add_argument("--port", type=int, default=7648, help="port for --serve (default: 7648)")
    args = parser.parse_args()

    root = args.root.resolve()
    if root in (REPO_ROOT, REPO_ROOT / "config"):
        parser.error("--root must be a separate demo directory")
    if args.reset and root.exists():
        shutil.rmtree(root)
    root.mkdir(parents=True, exist_ok=True)
    # RecordTree resolves config/, downloads/ and cache/ from the working directory.
    os.chdir(root)

    if not (root / "config" / "recordtree.sqlite3").exists():
        seed(root, args.records, args.seed)
    else:
        print(f"Using existing demo data in {root} (pass --reset to regenerate)")

    if args.serve:
        import uvicorn

        if not (REPO_ROOT / "web" / "dist").exists():
            print("web/dist is missing; run `npm --prefix web run build` to serve the UI.")
        print(f"Serving demo at http://127.0.0.1:{args.port}")
        uvicorn.run("recordtree.web.api:app", host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
