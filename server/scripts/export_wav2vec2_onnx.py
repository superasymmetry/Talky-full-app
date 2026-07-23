"""Export the wav2vec2 phoneme checkpoint to ONNX for in-browser inference.

The frontend (talky-app/src/Lesson/wav2vec2Worker.js) runs this model with
transformers.js / onnxruntime-web and streams the resulting logits to the
backend, which aligns them with stream_decode_logits. The checkpoint MUST
match the one the backend tokenizer uses, otherwise the logit columns won't
line up with the vocab. The worker tries WebGPU/fp16, then WebGPU/fp32, then
falls back to WASM/int8 — this script produces the model file for each tier.

One-time setup:
    pip install "optimum[exporters]" onnx onnxruntime onnxconverter-common

Usage (from the repo root):
    python server/scripts/export_wav2vec2_onnx.py

This produces the layout transformers.js expects for local models:
    talky-app/public/models/wav2vec2-xls-r-300m-timit-phoneme/
        config.json
        preprocessor_config.json
        vocab.json / tokenizer_config.json / ...   (small, copied for completeness)
        onnx/model.onnx            (fp32 — WebGPU, fp16 unsupported)
        onnx/model_fp16.onnx       (fp16 weights, fp32 I/O — WebGPU, preferred)
        onnx/model_quantized.onnx  (int8 — WASM fallback)

model_fp16.onnx is converted with keep_io_types=True: the graph's input/output
tensors stay float32 while internal weights/activations run in fp16. This
matters for the worker, which reads `logits.data` assuming a plain
Float32Array — a model with float16 *output* tensors can surface as a raw
Uint16Array in browsers without native Float16Array support, and naively
converting that (`Float32Array.from`) reinterprets the bit patterns as
integers instead of decoding them, silently corrupting every score.

Note: model.onnx is ~1.2 GB (xls-r-300m), model_fp16.onnx roughly half that.
Serve them from a CDN / with long cache headers in production, or upload the
exported folder to a Hugging Face repo and point VITE_W2V2_MODEL at it
instead of shipping it in public/ (recommended — avoids paying EC2 egress for
every visitor's model download).
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
    parser.add_argument("--skip-fp16", action="store_true",
                        help="skip the fp16 model used by the preferred WebGPU tier")
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

        if not args.skip_fp16:
            print("Converting to fp16 (model_fp16.onnx, preferred WebGPU tier)...")
            try:
                import onnx
                from onnxconverter_common import float16
                fp32_model = onnx.load(str(onnx_dir / "model.onnx"))
                # keep_io_types=True: input_values/logits stay float32 so the
                # worker's `logits.data` is always a plain Float32Array,
                # regardless of the browser's Float16Array support. See the
                # module docstring for why that matters.
                fp16_model = float16.convert_float_to_float16(fp32_model, keep_io_types=True)
                onnx.save(fp16_model, str(onnx_dir / "model_fp16.onnx"))
            except Exception as exc:  # noqa: BLE001 - best-effort, fp32/int8 tiers still work
                print(f"  WARNING: fp16 conversion failed, skipping model_fp16.onnx ({exc}).\n"
                      f"  The app still works: it falls back to WebGPU/fp32, then WASM/int8.\n"
                      f"  This has been seen with some onnx/protobuf version combinations on\n"
                      f"  models this size; try `pip install -U onnx onnxconverter-common` or\n"
                      f"  pin protobuf to a version matching your onnx build if it recurs.")

    print(f"\nDone. Model written to {args.out}")
    print("The lesson page will now run wav2vec2 on-device (WebGPU) and stream logits.")


if __name__ == "__main__":
    main()