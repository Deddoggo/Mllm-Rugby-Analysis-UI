"""Regression tests for Docker and local metadata path resolution."""

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from app.core.paths import resolve_data_path


class DataPathResolutionTests(unittest.TestCase):
    def test_data_path_uses_app_mount_in_docker(self) -> None:
        with patch("app.core.paths._docker_data_mount_available", return_value=True):
            resolved = resolve_data_path("data/videos/test.mp4")
        self.assertEqual(resolved.replace("\\", "/"), "/app/data/videos/test.mp4")

    def test_existing_absolute_path_is_preserved(self) -> None:
        with TemporaryDirectory() as temporary:
            video = Path(temporary) / "test.mp4"
            video.write_bytes(b"video")
            self.assertEqual(resolve_data_path(str(video)), str(video.resolve()))

    def test_data_path_falls_back_to_local_project_root(self) -> None:
        with TemporaryDirectory() as temporary:
            project_root = Path(temporary)
            with patch("app.core.paths._docker_data_mount_available", return_value=False):
                resolved = resolve_data_path(
                    "data/videos/test.mp4",
                    project_root=project_root,
                )
            self.assertEqual(
                Path(resolved),
                (project_root / "data" / "videos" / "test.mp4").resolve(),
            )


if __name__ == "__main__":
    unittest.main()
