"""Tensor-only H3 bridge nodes for Jekverse DualSpace workflows."""

from __future__ import annotations

import json
import os
import uuid

import folder_paths
import safetensors.torch as st
import torch
from safetensors import safe_open

H3_FORMAT = "comfyui_h3_conditioning_v2"


class JekverseSaveH3Conditioning:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "conditioning": ("CONDITIONING",),
                "filename_prefix": ("STRING", {"default": "h3_conditioning"}),
                "width": ("INT", {"default": 896, "min": 1}),
                "height": ("INT", {"default": 504, "min": 1}),
                "length": ("INT", {"default": 97, "min": 1}),
            },
            "optional": {"prompt_text": ("STRING", {"default": ""})},
        }

    RETURN_TYPES = ()
    FUNCTION = "save"
    OUTPUT_NODE = True
    CATEGORY = "Jekverse/Bridge/H3"

    def save(self, conditioning, filename_prefix="h3_conditioning", width=896,
             height=504, length=97, prompt_text=""):
        if not conditioning or not isinstance(conditioning[0], (tuple, list)):
            raise ValueError("Expected a non-empty ComfyUI CONDITIONING value.")
        cond_embed = conditioning[0][0]
        if not isinstance(cond_embed, torch.Tensor):
            raise TypeError("The conditioning embedding must be a tensor.")
        cond_embed = cond_embed.detach().contiguous().cpu()
        extra = conditioning[0][1] if len(conditioning[0]) > 1 else {}
        tensors = {"cond_embed": cond_embed}

        token_tags = extra.get("minimax_token_tags") if isinstance(extra, dict) else None
        if isinstance(token_tags, torch.Tensor):
            tensors["minimax_token_tags"] = token_tags.detach().contiguous().cpu()
        pooled = extra.get("pooled_output") if isinstance(extra, dict) else None
        if isinstance(pooled, torch.Tensor):
            tensors["cond_pooled"] = pooled.detach().contiguous().cpu()

        keyframes_meta = []
        keyframes = extra.get("minimax_keyframes") if isinstance(extra, dict) else None
        if isinstance(keyframes, list):
            for index, keyframe in enumerate(keyframes):
                entry = {"resolved_frame_index": int(keyframe.get("resolved_frame_index", 0))}
                latent = keyframe.get("latent")
                if isinstance(latent, torch.Tensor):
                    tensor_key = f"kf_{index}_latent"
                    tensors[tensor_key] = latent.detach().contiguous().cpu()
                    entry["tensor_key"] = tensor_key
                keyframes_meta.append(entry)

        filename = f"{filename_prefix}_{uuid.uuid4().hex[:10]}.safetensors"
        path = os.path.join(folder_paths.get_output_directory(), filename)
        metadata = {
            "format": H3_FORMAT,
            "prompt": str(prompt_text),
            "width": str(int(width)),
            "height": str(int(height)),
            "length": str(int(length)),
            "keyframes_meta": json.dumps(keyframes_meta, separators=(",", ":")),
            "shape": str(list(cond_embed.shape)),
        }
        st.save_file(tensors, path, metadata=metadata)
        return {"ui": {"safetensors_file": [filename]}}


class JekverseLoadH3Conditioning:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"safetensors_path": ("STRING", {"default": ""})}}

    RETURN_TYPES = ("CONDITIONING", "INT", "INT", "INT")
    RETURN_NAMES = ("conditioning", "width", "height", "length")
    FUNCTION = "load"
    CATEGORY = "Jekverse/Bridge/H3"

    def load(self, safetensors_path):
        path = os.path.abspath(os.path.expanduser(str(safetensors_path or "")))
        if not os.path.isfile(path):
            raise FileNotFoundError(f"H3 bridge file does not exist: {path}")
        tensors = st.load_file(path, device="cpu")
        if "cond_embed" not in tensors:
            raise KeyError("H3 bridge file is missing the 'cond_embed' tensor.")
        with safe_open(path, framework="pt", device="cpu") as handle:
            metadata = handle.metadata() or {}
        if metadata.get("format") != H3_FORMAT:
            raise ValueError(f"Unsupported H3 bridge format: {metadata.get('format')!r}")

        cond_embed = tensors["cond_embed"]
        if cond_embed.ndim == 2:
            cond_embed = cond_embed.unsqueeze(0)
        extra = {}
        if "minimax_token_tags" in tensors:
            extra["minimax_token_tags"] = tensors["minimax_token_tags"]
        if "cond_pooled" in tensors:
            pooled = tensors["cond_pooled"]
            extra["pooled_output"] = pooled.unsqueeze(0) if pooled.ndim == 1 else pooled
        try:
            entries = json.loads(metadata.get("keyframes_meta", "[]"))
        except (TypeError, json.JSONDecodeError) as exc:
            raise ValueError("H3 bridge file has invalid keyframe metadata.") from exc
        keyframes = []
        for entry in entries:
            restored = {"resolved_frame_index": int(entry.get("resolved_frame_index", 0))}
            tensor_key = entry.get("tensor_key")
            if tensor_key:
                if tensor_key not in tensors:
                    raise KeyError(f"H3 bridge file is missing keyframe tensor {tensor_key!r}.")
                restored["latent"] = tensors[tensor_key]
            keyframes.append(restored)
        if keyframes:
            extra["minimax_keyframes"] = keyframes
        return (
            [(cond_embed, extra)],
            int(metadata.get("width", 896)),
            int(metadata.get("height", 504)),
            int(metadata.get("length", 97)),
        )


NODE_CLASS_MAPPINGS = {
    "JekverseSaveH3Conditioning": JekverseSaveH3Conditioning,
    "JekverseLoadH3Conditioning": JekverseLoadH3Conditioning,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "JekverseSaveH3Conditioning": "Jekverse Save H3 Conditioning",
    "JekverseLoadH3Conditioning": "Jekverse Load H3 Conditioning",
}
