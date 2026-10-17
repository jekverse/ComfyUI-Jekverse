import os
import sys
import shutil
import subprocess
import tempfile
import uuid
import logging
from typing import Optional

# Setup logger
logger = logging.getLogger("Jekverse.VideoMerger")

def ensure_ffmpeg() -> str:
    """
    Check if ffmpeg executable exists in PATH.
    If not, attempt to use or auto-install imageio-ffmpeg without failing.
    """
    ffmpeg_cmd = shutil.which("ffmpeg")
    if ffmpeg_cmd:
        return ffmpeg_cmd

    # Check if imageio_ffmpeg is already installed
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        pass

    # Auto-install imageio-ffmpeg via pip
    logger.info("[Jekverse] FFmpeg tidak ditemukan di sistem. Mengunduh & menginstal FFmpeg secara otomatis...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "imageio-ffmpeg"])
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as e:
        raise RuntimeError(
            f"[Jekverse] Gagal menginstal FFmpeg secara otomatis: {e}. "
            "Harap pasang FFmpeg pada sistem atau jalankan 'pip install imageio-ffmpeg'."
        )


def extract_video_path(video_obj, temp_dir: str) -> Optional[str]:
    """
    Extract file path from ComfyUI VIDEO object (VideoFromFile / VideoInput / str / BytesIO).
    """
    if video_obj is None:
        return None

    # Native ComfyUI VideoFromFile source
    if hasattr(video_obj, "get_stream_source"):
        source = video_obj.get_stream_source()
    elif hasattr(video_obj, "_VideoFromFile__file"):
        source = video_obj._VideoFromFile__file
    elif hasattr(video_obj, "file"):
        source = video_obj.file
    else:
        source = video_obj

    # If it is a string and exists on disk
    if isinstance(source, str) and os.path.exists(source):
        return os.path.abspath(source)

    # If it is a BytesIO or file-like buffer, write to temporary file
    if hasattr(source, "read"):
        temp_input = os.path.join(temp_dir, f"input_{uuid.uuid4().hex[:8]}.mp4")
        if hasattr(source, "seek"):
            source.seek(0)
        with open(temp_input, "wb") as f:
            f.write(source.read())
        return temp_input

    # String path that might not have been validated
    if isinstance(source, str):
        return source

    return None


class VideoMerger:
    """
    Merges up to 10 sequential videos into a single video file using FFmpeg lossless mode.
    Outputs a native ComfyUI VIDEO object accepted directly by SaveVideo.
    """
    MAX_VIDEOS = 10

    @classmethod
    def INPUT_TYPES(s):
        optional_inputs = {}
        for i in range(3, s.MAX_VIDEOS + 1):
            optional_inputs[f"video_{i}"] = ("VIDEO",)

        optional_inputs["mode"] = (
            [
                "auto (lossless stream copy)",
                "re-encode (lossless crf 0)",
                "re-encode (h264 fast)",
            ],
            {"default": "auto (lossless stream copy)"},
        )

        return {
            "required": {
                "video_1": ("VIDEO",),
                "video_2": ("VIDEO",),
            },
            "optional": optional_inputs,
        }

    RETURN_TYPES = ("VIDEO",)
    RETURN_NAMES = ("video",)
    FUNCTION = "merge"
    CATEGORY = "Jekverse/Video"

    def merge(self, video_1, video_2, mode="auto (lossless stream copy)", **kwargs):
        ffmpeg_bin = ensure_ffmpeg()

        # Collect all active videos in order 1..10
        raw_videos = [video_1, video_2]
        for i in range(3, self.MAX_VIDEOS + 1):
            key = f"video_{i}"
            if key in kwargs and kwargs[key] is not None:
                raw_videos.append(kwargs[key])

        # Get temp directory for processing
        try:
            import folder_paths
            base_temp_dir = folder_paths.get_temp_directory()
        except Exception:
            base_temp_dir = tempfile.gettempdir()

        session_dir = os.path.join(base_temp_dir, f"jekverse_merge_{uuid.uuid4().hex[:8]}")
        os.makedirs(session_dir, exist_ok=True)

        video_paths = []
        for idx, vid in enumerate(raw_videos):
            path = extract_video_path(vid, session_dir)
            if path and os.path.exists(path):
                video_paths.append(path)
            else:
                logger.warning(f"[Jekverse] Video slot {idx + 1} tidak valid atau file tidak ditemukan, dilewati.")

        if len(video_paths) < 2:
            raise ValueError(
                f"[Jekverse Video Merger] Dibutuhkan minimal 2 video yang valid untuk digabungkan, tetapi hanya terdeteksi {len(video_paths)} video."
            )

        output_path = os.path.join(session_dir, f"merged_{uuid.uuid4().hex}.mp4")

        # Create FFmpeg concat demuxer text file
        concat_txt = os.path.join(session_dir, "concat_list.txt")
        with open(concat_txt, "w", encoding="utf-8") as f:
            for p in video_paths:
                # Escape single quotes and backslashes for ffmpeg concat demuxer
                safe_p = p.replace("\\", "/").replace("'", "'\\''")
                f.write(f"file '{safe_p}'\n")

        # Execution based on mode
        success = False

        if "auto" in mode:
            # 1. First attempt: Stream Copy (100% bit-exact lossless, instant)
            cmd_copy = [
                ffmpeg_bin, "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", concat_txt,
                "-c", "copy",
                output_path
            ]
            res = subprocess.run(cmd_copy, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            if res.returncode == 0 and os.path.exists(output_path) and os.path.getsize(output_path) > 0:
                success = True
            else:
                logger.info("[Jekverse] Stream copy gagal (kemungkinan codec/resolusi berbeda). Beralih ke fallback lossless re-encode...")

        if not success:
            # Re-encode mode
            crf_val = "0" if "lossless" in mode or "auto" in mode else "18"
            cmd_reencode = [
                ffmpeg_bin, "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", concat_txt,
                "-c:v", "libx264",
                "-crf", crf_val,
                "-preset", "veryfast",
                "-c:a", "aac",
                "-b:a", "192k",
                output_path
            ]
            res = subprocess.run(cmd_reencode, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            if res.returncode != 0:
                err_msg = res.stderr.decode("utf-8", errors="replace")
                raise RuntimeError(f"[Jekverse Video Merger] Gagal menggabungkan video: {err_msg[-500:]}")

        logger.info(f"[Jekverse] Video berhasil digabungkan: {output_path} ({len(video_paths)} klip)")
        return (self._wrap_video(output_path),)

    def _wrap_video(self, file_path: str):
        """
        Wrap file into ComfyUI's VideoFromFile instance so SaveVideo can handle it natively.
        """
        try:
            from comfy_api.latest import InputImpl
            return InputImpl.VideoFromFile(file_path)
        except Exception:
            pass

        try:
            from comfy_api.latest._input_impl.video_types import VideoFromFile
            return VideoFromFile(file_path)
        except Exception:
            pass

        # Fallback return string path if comfy_api is unavailable
        return file_path


NODE_CLASS_MAPPINGS = {
    "jekverse videoMerger": VideoMerger,
    "Video Merger": VideoMerger,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "jekverse videoMerger": "Video Merger",
    "Video Merger": "Video Merger",
}
