from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import NamedTuple

import pytest


class _DiskUsage(NamedTuple):
    total: int
    used: int
    free: int


@pytest.fixture(autouse=True)
def free_disk_space(monkeypatch: pytest.MonkeyPatch) -> Callable[[int], None]:
    """Fake the free space download plans see, so results never depend on the host disk.

    Every test starts with 1 TiB free; call the returned function to set another amount.
    """

    def set_free(free: int) -> None:
        def disk_usage(_path: str | Path) -> _DiskUsage:
            return _DiskUsage(total=free, used=0, free=free)

        monkeypatch.setattr("recordtree.search.shutil.disk_usage", disk_usage)

    set_free(1 << 40)
    return set_free
