FROM python:3.11-slim

RUN apt-get update && \
    apt-get install -y \
    portaudio19-dev \
    python3-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
# RUN pip install torch==1.9.0 torchaudio==0.9.0 -f https://download.pytorch.org/whl/torch_stable.html
RUN pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8080

CMD ["python", "main.py"]