import json
import re

class AnyType(str):
    """A wildcard type that matches any socket type in ComfyUI."""
    def __ne__(self, __value: object) -> bool:
        return False

any_type = AnyType("*")

# ==============================================================================
# 1. Math Int
# ==============================================================================
class mathIntOperation:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "a": ("INT", {"default": 0, "min": -0xffffffffffffffff, "max": 0xffffffffffffffff, "step": 1}),
                "b": ("INT", {"default": 0, "min": -0xffffffffffffffff, "max": 0xffffffffffffffff, "step": 1}),
                "operation": (["add", "subtract", "multiply", "divide", "modulo", "power"],),
            }
        }

    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("INT",)
    FUNCTION = "execute"
    CATEGORY = "Jekverse/Logic/Math"

    def execute(self, a, b, operation):
        ops = {
            "add": lambda: a + b,
            "subtract": lambda: a - b,
            "multiply": lambda: a * b,
            "divide": lambda: a // b if b != 0 else 0,
            "modulo": lambda: a % b if b != 0 else 0,
            "power": lambda: int(a ** b) if b >= 0 and not (a == 0 and b < 0) else 0,
        }
        return (ops[operation](),)


# ==============================================================================
# 2. Text Index Switch
# ==============================================================================
class textIndexSwitch:
    MAX_FLOW_NUM = 20

    @classmethod
    def INPUT_TYPES(s):
        optional = {}
        for i in range(1, s.MAX_FLOW_NUM + 1):
            optional[f"text{i}"] = ("STRING", {"forceInput": True, "lazy": True})
        return {
            "required": {
                "index": ("INT", {"default": 1, "min": 1, "max": s.MAX_FLOW_NUM, "step": 1}),
            },
            "optional": optional,
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "execute"
    CATEGORY = "Jekverse/Logic/Index Switch"

    def check_lazy_status(self, index, **kwargs):
        # 1-based indexing with fallback for legacy text0
        key = f"text{index}"
        if key not in kwargs and f"text{index - 1}" in kwargs:
            key = f"text{index - 1}"
        if kwargs.get(key, None) is None:
            return [key]
        return []

    def execute(self, index, **kwargs):
        # 1-based indexing with fallback for legacy text0
        key = f"text{index}"
        if key not in kwargs and f"text{index - 1}" in kwargs:
            key = f"text{index - 1}"
        val = kwargs.get(key, "")
        return (val if val is not None else "",)


# ==============================================================================
# 3. Show Any
# ==============================================================================
class showAnything:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {},
            "optional": {
                "anything": (any_type,),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = (any_type,)
    RETURN_NAMES = ("output",)
    OUTPUT_NODE = True
    FUNCTION = "execute"
    CATEGORY = "Jekverse/Logic"

    def execute(self, anything=None, unique_id=None, extra_pnginfo=None):
        values = []
        if anything is not None:
            if isinstance(anything, str):
                values.append(anything)
            elif isinstance(anything, (int, float, bool)):
                values.append(str(anything))
            elif isinstance(anything, list) and len(anything) <= 30:
                values = [str(x) for x in anything]
            else:
                try:
                    values.append(json.dumps(anything, indent=4, ensure_ascii=False))
                except Exception:
                    values.append(str(anything))
        else:
            values.append("")

        if extra_pnginfo and isinstance(extra_pnginfo, dict) and "workflow" in extra_pnginfo:
            _uid = unique_id[0] if isinstance(unique_id, list) else unique_id
            nodes = extra_pnginfo["workflow"].get("nodes", [])
            node = next((x for x in nodes if str(x.get("id")) == str(_uid)), None)
            if node:
                node["widgets_values"] = [values]

        result_val = anything
        return {"ui": {"text": values}, "result": (result_val,)}


# ==============================================================================
# 4. Convert Any
# ==============================================================================
class convertAnything:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "*": (any_type,),
                "output_type": (["string", "int", "float", "boolean"], {"default": "string"}),
            }
        }

    RETURN_TYPES = (any_type,)
    RETURN_NAMES = ("output",)
    FUNCTION = "execute"
    CATEGORY = "Jekverse/Logic"

    def execute(self, output_type, **kwargs):
        anything = kwargs.get("*", None)

        def safe_convert(val, target):
            if val is None:
                if target == "string":
                    return ""
                elif target == "int":
                    return 0
                elif target == "float":
                    return 0.0
                elif target == "boolean":
                    return False
                return None

            if target == "string":
                return str(val)
            elif target == "int":
                try:
                    return int(float(val))
                except Exception:
                    return 0
            elif target == "float":
                try:
                    return float(val)
                except Exception:
                    return 0.0
            elif target == "boolean":
                if isinstance(val, str):
                    return val.strip().lower() not in ("", "0", "false", "none", "null")
                return bool(val)
            return val

        return (safe_convert(anything, output_type),)


# ==============================================================================
# 5. Compare
# ==============================================================================
COMPARE_FUNCTIONS = {
    "a == b": lambda a, b: a == b,
    "a != b": lambda a, b: a != b,
    "a < b": lambda a, b: a < b,
    "a > b": lambda a, b: a > b,
    "a <= b": lambda a, b: a <= b,
    "a >= b": lambda a, b: a >= b,
    "a > 0": lambda a, b: a > 0,
    "a <= 0": lambda a, b: a <= 0,
    "b > 0": lambda a, b: b > 0,
    "b <= 0": lambda a, b: b <= 0,
}

class Compare:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "comparison": (list(COMPARE_FUNCTIONS.keys()), {"default": "a == b"}),
            },
            "optional": {
                "a": (any_type, {"default": 0}),
                "b": (any_type, {"default": 0}),
            }
        }

    RETURN_TYPES = ("BOOLEAN",)
    RETURN_NAMES = ("boolean",)
    FUNCTION = "execute"
    CATEGORY = "Jekverse/Logic/Math"

    def execute(self, comparison="a == b", a=0, b=0, **kwargs):
        func = COMPARE_FUNCTIONS.get(comparison, lambda a, b: a == b)
        try:
            res = bool(func(a, b))
        except Exception:
            res = False
        return (res,)


# ==============================================================================
# MAPPINGS
# ==============================================================================
NODE_CLASS_MAPPINGS = {
    "jekverse mathInt": mathIntOperation,
    "jekverse textIndexSwitch": textIndexSwitch,
    "jekverse showAnything": showAnything,
    "jekverse convertAnything": convertAnything,
    "jekverse compare": Compare,
    # Alias compatibility with Easy-Use
    "easy mathInt": mathIntOperation,
    "easy textIndexSwitch": textIndexSwitch,
    "easy showAnything": showAnything,
    "easy convertAnything": convertAnything,
    "easy compare": Compare,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "jekverse mathInt": "Math Int",
    "jekverse textIndexSwitch": "Text Index Switch",
    "jekverse showAnything": "Show Any",
    "jekverse convertAnything": "Convert Any",
    "jekverse compare": "Compare",
    # Alias compatibility
    "easy mathInt": "Math Int",
    "easy textIndexSwitch": "Text Index Switch",
    "easy showAnything": "Show Any",
    "easy convertAnything": "Convert Any",
    "easy compare": "Compare",
}
