"""Export the wav2vec2 phoneme checkpoint to ONNX for in-browser inference.

The frontend (talky-app/src/Lesson/wav2vec2Worker.js) runs this model with
transformers.js / onnxruntime-web (WebGPU) and streams the resulting logits to
the backend, which aligns them with stream_decode_logits. The checkpoint MUST
match the one the backend tokenizer uses, otherwise the logit columns won't
line up with the vocab.

One-time setup:
    pip install "optimum[exporters]" onnx onnxruntime

Usage (from the repo root):
    python server/scripts/export_wav2vec2_onnx.py

This produces the layout transformers.js expects for local models:
    talky-app/public/models/wav2vec2-xls-r-300m-timit-phoneme/
        config.json
        preprocessor_config.json
        vocab.json / tokenizer_config.json / ...   (small, copied for completeness)
        onnx/model.onnx            (fp32 — used on WebGPU)
        onnx/model_quantized.onnx  (int8 — used on the WASM fallback)

Note: model.onnx is ~1.2 GB (xls-r-300m). Serve it from a CDN / with long
cache headers in production, or upload the exported folder to a Hugging Face
repo and point VITE_W2V2_MODEL at it instead of shipping it in public/.
"""

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

MODEL_ID = "vitouphy/wav2vec2-xls-r-300m-timit-phoneme"
REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = REPO_ROOT / "talky-app" / "public" / "models" / "wav2vec2-xls-r-300m-timit-phoneme"

CONFIG_FILES = [
    "config.json",
    "preprocessor_config.json",
    "tokenizer_config.json",
    "vocab.json",
    "special_tokens_map.json",
    "added_tokens.json",
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", default=MODEL_ID)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--skip-quantize", action="store_true",
                        help="skip the int8 model used by the WASM fallback")
    args = parser.parse_args()

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        print(f"Exporting {args.model} to ONNX (this downloads ~1.2 GB of weights)...")
        subprocess.run(
            [sys.executable, "-m", "optimum.exporters.onnx",
             "--model", args.model,
             "--task", "automatic-speech-recognition",
             str(tmp)],
            check=True,
        )

        onnx_dir = args.out / "onnx"
        onnx_dir.mkdir(parents=True, exist_ok=True)

        exported = next(tmp.glob("*.onnx"))
        shutil.copy2(exported, onnx_dir / "model.onnx")
        for name in CONFIG_FILES:
            src = tmp / name
            if src.exists():
                shutil.copy2(src, args.out / name)

        if not args.skip_quantize:
            print("Quantizing to int8 (model_quantized.onnx, WASM fallback)...")
            from onnxruntime.quantization import QuantType, quantize_dynamic
            quantize_dynamic(
                str(onnx_dir / "model.onnx"),
                str(onnx_dir / "model_quantized.onnx"),
                weight_type=QuantType.QUInt8,
            )

    print(f"\nDone. Model written to {args.out}")
    print("The lesson page will now run wav2vec2 on-device (WebGPU) and stream logits.")


if __name__ == "__main__":
    main()