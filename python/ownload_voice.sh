#!/bin/bash
set -e  # Stop on any error

mkdir -p voices
cd voices

echo "Downloading en_US-libritts-high voice model..."

# Download .onnx model
if [ ! -f "en_US-libritts-high.onnx" ]; then
    curl -L -o en_US-libritts-high.onnx \
        "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/libritts/high/en_US-libritts-high.onnx"
    echo "Model downloaded"
else
    echo "Model already exists"
fi

# Download .json config
if [ ! -f "en_US-libritts-high.onnx.json" ]; then
    curl -L -o en_US-libritts-high.onnx.json \
        "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/libritts/high/en_US-libritts-high.onnx.json"
    echo "Config downloaded"
else
    echo "Config already exists"
fi

echo "Piper voice ready!"